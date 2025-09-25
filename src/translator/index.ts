import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from '../i18n';
import { splitMarkdownIntoSections } from '../markdownParser';
import { ProgressManager, TaskStatus } from '../progressBar';
import { createLlmModel } from '../llm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { GoogleGenerativeAIError } from "@google/generative-ai";
import { validateBatch } from './validateBatch';
import { debugLog } from '../debugLogger';
import { Task, AddSectionStatus, BATCH_SIZE_LIMIT } from './Task';
import { TaskFactory } from './TaskFactory';

// --- 錯誤類別定義 ---

export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

export class LlmApiQuotaError extends TranslationError {
  public readonly maskedApiKey: string;

  constructor(message: string, maskedApiKey: string, originalError?: Error) {
    super(message);
    this.name = 'LlmApiQuotaError';
    this.maskedApiKey = maskedApiKey;
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

export class PromptFileReadError extends TranslationError {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'PromptFileReadError';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// --- 快取與輔助函式 ---

let cachedPromptPath: string | null = null;
let cachedStyleGuide: string | null = null;

async function getStyleGuide(promptFilePath?: string): Promise<string> {
  const defaultPromptPath = path.resolve(__dirname, '..', '..', 'resources', 'TRANSLATE_PROMPT.md');
  const finalPromptPath = promptFilePath ? path.resolve(promptFilePath) : defaultPromptPath;

  if (cachedPromptPath === finalPromptPath && cachedStyleGuide) {
    return cachedStyleGuide;
  }

  try {
    const prompt = await fs.readFile(finalPromptPath, 'utf-8');
    cachedPromptPath = finalPromptPath;
    cachedStyleGuide = prompt;
    return prompt;
  } catch (error: any) {
    const errorMessage = _('Failed to read prompt file: {{path}}', { path: finalPromptPath });
    throw new PromptFileReadError(`${errorMessage}: ${error.message}`, error);
  }
}

// --- 核心翻譯邏輯 ---

async function translateContent(
  styleGuide: string,
  fullContext: string,
  task: Task,
  progressManager: ProgressManager,
  sourceFilePath: string,
  apiKeyUsed: string,
): Promise<{ task: Task; translatedContent: string }> {
  const { model } = createLlmModel();
  const startTime = Date.now();
  const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
  const taskTitle = task.getTitle();
  const contentToTranslate = task.getContent();
  
  progressManager.startTask(taskId);

  const initialTemplate = `
{style_guide}

In order to let you understand the context, below is the full original document, followed by the specific section you need to translate.

<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:

<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;

  const chain = PromptTemplate.fromTemplate(initialTemplate).pipe(model).pipe(new StringOutputParser());

  let totalBytes = 0;
  let fullResponse = '';

  try {
    const styleGuidePath = `[From prompt file: ${cachedPromptPath}]`;
    const fullContextPath = `[From source file: ${sourceFilePath}]`;
    const sectionPreview = contentToTranslate.split('\n').slice(0, 5).join('\n') + '\n[...]';
    
    const initialPromptFormatted = await PromptTemplate.fromTemplate(initialTemplate).format({
      style_guide: styleGuidePath,
      full_context: fullContextPath,
      section_to_translate: sectionPreview,
    });
    await debugLog(`Initial prompt for task ${task.id} [Line ${task.getStartLine()}-${task.getEndLine()}]:\n${initialPromptFormatted}`);

    try {
      const stream = await chain.stream({
        style_guide: styleGuide,
        full_context: fullContext,
        section_to_translate: contentToTranslate,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        totalBytes += Buffer.byteLength(chunk, 'utf8');
        progressManager.updateBytes(taskId, totalBytes);
      }
    } catch (error: any) {
      if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
        const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
        throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
      }
      throw error;
    }

    const validationResult = validateBatch(contentToTranslate, fullResponse);

    if (!validationResult.isValid) {
      const originalStartTime = progressManager.getStartTime(taskId) || startTime;
      const duration = (Date.now() - originalStartTime) / 1000;
      // 更新原始任務的狀態與備註
      progressManager.updateTask(taskId, { 
        status: TaskStatus.Retrying,
        time: parseFloat(duration.toFixed(1)),
        notes: _('Validation failed'),
      });
      task.notes = _('Validation failed'); // 更新 Task 物件本身

      const retryId = `${taskId}-retry`;
      const retryTitle = `(Retry) ${taskTitle}`;
      const newTaskNumber = progressManager.getTaskCount() + 1;
      progressManager.addTask(retryId, retryTitle, newTaskNumber, task.getContentLength());
      
      // 為重試任務設定備註
      const retryNote = _('Retranslating Task {{id}}', { id: task.id + 1 });
      progressManager.updateTask(retryId, { notes: retryNote });

      progressManager.startTask(retryId);
      const retryStartTime = Date.now();

      const retryTemplate = `The previous translation failed validation. Please correct the following errors and re-translate the original text.

Errors:
- {errors}

Remember to follow these style guides:
{style_guide}

For context, here is the full original document:
<!-- FULL_CONTEXT_START -->
{full_context}
<!-- FULL_CONTEXT_END -->

Please translate ONLY the following section into Traditional Chinese. Do not output anything else, just the translated text of this section.

Section to translate:
<!-- SECTION_TO_TRANSLATE_START -->
{section_to_translate}
<!-- SECTION_TO_TRANSLATE_END -->
`;
      const retryChain = PromptTemplate.fromTemplate(retryTemplate).pipe(model).pipe(new StringOutputParser());

      fullResponse = '';
      totalBytes = 0;

      const retryPromptFormatted = await PromptTemplate.fromTemplate(retryTemplate).format({
        errors: validationResult.errors.join('\n- '),
        style_guide: styleGuidePath,
        full_context: fullContextPath,
        section_to_translate: sectionPreview,
      });
      await debugLog(`Retry prompt for task ${task.id} [Line ${task.getStartLine()}-${task.getEndLine()}]:\n${retryPromptFormatted}`);

      try {
        const retryStream = await retryChain.stream({
          style_guide: styleGuide,
          full_context: fullContext,
          section_to_translate: contentToTranslate,
          errors: validationResult.errors.join('\n- '),
        });

        for await (const chunk of retryStream) {
          fullResponse += chunk;
          totalBytes += Buffer.byteLength(chunk, 'utf8');
          progressManager.updateBytes(retryId, totalBytes);
        }
      } catch (error: any) {
        if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
          const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
          throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
        }
        throw error;
      }

      const secondValidation = validateBatch(contentToTranslate, fullResponse);
      if (!secondValidation.isValid) {
        progressManager.collectWarning(_('Re-translation for section "{{sectionTitle}}" failed validation again, but the result will be accepted.', { sectionTitle: taskTitle }));
      }
      
      const retryEndTime = Date.now();
      const retryDuration = parseFloat(((retryEndTime - retryStartTime) / 1000).toFixed(1));
      progressManager.completeTask(retryId, retryDuration);

      return { task, translatedContent: fullResponse };
    }

    const endTime = Date.now();
    const duration = parseFloat(((endTime - startTime) / 1000).toFixed(1));
    progressManager.completeTask(taskId, duration);

    return { task, translatedContent: fullResponse };
  } catch (error) {
    progressManager.failTask(taskId);
    throw error;
  }
}

export async function translateFile(sourceFilePath: string, promptFilePath?: string): Promise<string> {
  const taskFactory = new TaskFactory();
  const concurrency = parseInt(process.env.TRANSLATION_CONCURRENCY || '3', 10);
  console.log(_('Concurrency Level: {{concurrency}}', { concurrency }));
  const limit = pLimit(concurrency);

  const progressManager = new ProgressManager();

  try {
    const styleGuide = await getStyleGuide(promptFilePath);
    const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
    const { apiKeyUsed } = createLlmModel();
    const allSections = splitMarkdownIntoSections(fileContent);

    // Sanitize the full file content for context to save tokens
    const imageRegex = /(!\[.*?\]\()(data:image\/[^)]+)(\))/g;
    const sanitizedFileContent = fileContent.replace(imageRegex, (match, g1, g2, g3) => {
      return g1 + '([IMAGE DATA])' + g3;
    });

    const tasks: Task[] = [];
    let currentTask: Task = taskFactory.createTask();

    // 遍歷所有章節，執行雙分支任務分配邏輯：
    // 1. 如果是普通章節，則嘗試將其加入當前任務。
    // 2. 如果遇到巨大 H2 章節或上下文變更，則結束當前任務，並為新章節建立合適的新任務。
    for (let i = 0; i < allSections.length; i++) {
      const section = allSections[i];
      const addStatus = currentTask.addSection(section);
      if(AddSectionStatus.success !== addStatus) {

        if(!currentTask.isEmpty()) {
          // 無法加入任務，把當前任務推送到 tasks
          tasks.push(currentTask);
        }

        if(addStatus === AddSectionStatus.sectionContextNotMatch) {
          // 加入的章節與 Task 的父章節不同，必須建立新任務
          if(section.depth === 2 && section.totalLength > BATCH_SIZE_LIMIT) {
            // 這邊要判斷是不是新的 H2 且超大
            currentTask = taskFactory.createTask(section);
          } else {
            currentTask = taskFactory.createTask();
          }
        } else if(addStatus === AddSectionStatus.exceedingBatchSize) {
          // 加入的章節內容超出任務長度
          currentTask = taskFactory.createTask();
        } else if(addStatus === AddSectionStatus.exceedingBatchSizeOfParentContext){
          currentTask = taskFactory.createTask(currentTask.parentContext);
        } else if(addStatus === AddSectionStatus.hurgeSectionNeedSplit) {
          currentTask = taskFactory.createTask(section);
        } 

        let finalStatus;
        if( (finalStatus = currentTask.addSection(section)) !== AddSectionStatus.success) {
          throw new Error(`This is a bug , can not add section, finalStatus: ${finalStatus}, title '${section.title}' , depth: ${section.depth}, contentLength: ${section.contentLength}, totalLength: ${section.totalLength}`);
        }
        
      }
    }

    // 收尾
    if (currentTask && !currentTask.isEmpty()) {
      tasks.push(currentTask);
    }

    const nonEmptyTasks = tasks.filter(t => !t.isEmpty());

    if (nonEmptyTasks.length === 0) {
      return '';
    }

    const taskAssignmentLog = [
      `--- Translation Task Assignment for ${sourceFilePath} ---`,
      `--- Total Sections: ${allSections.length}, Total Tasks: ${nonEmptyTasks.length} ---`,
      ...nonEmptyTasks.map(task => {
        const sectionsLog = task.getSections().map(section =>
          `  * ${'#'.repeat(section.depth)} ${section.title} (contentLength: ${section.contentLength} , totalLength:${section.totalLength}) `
        ).join('\n');
        return `- Task ${task.id + 1} (Lines ${task.getStartLine()}-${task.getEndLine()}) (contentLength: ${task.getContentLength()}) (parentContext: '${task.parentContext?.title}') \n${sectionsLog}`;
      }),
      '---------------------------------'
    ].join('\n');
    await debugLog(taskAssignmentLog);

    /*
      請勿刪除這個註解，這是為了快速偵錯用的
      主要是印出任務分配的細節，方便確認分割是否合理
    */
    // console.log(allSections.map(s => ({ title: s.title, depth: s.depth, startLine: s.startLine, endLine: s.endLine, contentLength: s.contentLength, totalLength: s.totalLength, parent: s.parent ? { title: s.parent.title, depth: s.parent.depth } : null })));
    // console.log(taskAssignmentLog);
    // process.exit(1);
  

    // 為所有任務建立翻譯承諾
    const translationPromises = nonEmptyTasks.map((task) => {
      const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
      progressManager.addTask(taskId, task.getTitle(), task.id + 1, task.getContentLength());
      return limit(() => translateContent(styleGuide, sanitizedFileContent, task, progressManager, sourceFilePath, apiKeyUsed));
    });

    const translatedTasks = await Promise.all(translationPromises);

    progressManager.stop();
    progressManager.printCollectedWarnings();

    translatedTasks.sort((a, b) => a.task.id - b.task.id);

    // 翻譯完成，將所有任務的翻譯結果拼接成最終文件。
    // 在拼接前，遍歷每個任務的原始章節，如果章節包含圖片佔位符，則呼叫還原方法。
    const finalContent = translatedTasks.map(({ task, translatedContent }) => {
      let restoredContent = translatedContent;
      for (const section of task.getSections()) {
        if (section.hasPlaceholders()) {
          restoredContent = section.restorePlaceholders(restoredContent);
        }
      }

      return restoredContent;
    }).join('\n\n');

    return finalContent;

  } catch (error) {
    progressManager.stop();
    if (error instanceof LlmApiQuotaError) {
      console.error(_('Translation failed: LLM API quota exceeded for key: {{maskedKey}}', { maskedKey: error.maskedApiKey }));
    }
    throw error;
  }
}