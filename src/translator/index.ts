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
import { extractPreambleEntries } from '../validator/core';
import { debugLog } from '../debugLogger';
import { debugLlmDetails } from '../debugLlmDetails';
import { Task, AddSectionStatus, BATCH_SIZE_LIMIT } from './Task';
import { TaskFactory } from './TaskFactory';
import { getPromptTemplate } from './prompts';

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
  preambleContext?: string, // 新增可選參數
): Promise<{ task: Task; translatedContent: string }> {
  const { model } = createLlmModel();
  const startTime = Date.now();
  const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
  const taskTitle = task.getTitle();
  const contentToTranslate = task.getContent();
  
  progressManager.startTask(taskId);

  const hasPreamble = !!preambleContext;
  const template = getPromptTemplate({ isRetry: false, hasPreamble });
  const prompt = PromptTemplate.fromTemplate(template);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  let totalBytes = 0;
  let fullResponse = '';

  try {
    const styleGuidePath = `[From prompt file: ${cachedPromptPath}]`;
    const fullContextPath = `[From source file: ${sourceFilePath}]`;
    const sectionPreview = contentToTranslate.split('\n').slice(0, 5).join('\n') + '\n[...]';

    // 動態建立日誌用的 prompt 變數
    const formatVariables: any = {
      style_guide: styleGuidePath,
      full_context: fullContextPath,
      section_to_translate: sectionPreview,
    };
    if (preambleContext) {
      const preambleLogFilename = await debugLlmDetails(preambleContext, 'preamble_context');
      formatVariables.preamble_context = preambleLogFilename 
        ? `See debug_llm_details/${preambleLogFilename} for details.`
        : `[Preamble context could not be logged]`;
    }
    const initialPromptFormatted = await prompt.format(formatVariables);

    const detailLogFilename = await debugLlmDetails(contentToTranslate);
    const logMessage = detailLogFilename
      ? initialPromptFormatted.replace(sectionPreview, `See debug_llm_details/${detailLogFilename} for details.`)
      : initialPromptFormatted;

    await debugLog(`Initial prompt for task ${task.id + 1} [Line ${task.getStartLine()}-${task.getEndLine()}]:\n${logMessage}`);

    try {
      // 動態建立 stream 用的變數
      const streamVariables: any = {
        style_guide: styleGuide,
        full_context: fullContext,
        section_to_translate: contentToTranslate,
      };
      if (preambleContext) {
        streamVariables.preamble_context = preambleContext;
      }
      const stream = await chain.stream(streamVariables);

      for await (const chunk of stream) {
        fullResponse += chunk;
        totalBytes += Buffer.byteLength(chunk, 'utf8');
        progressManager.updateBytes(taskId, totalBytes);
      }

      const llmResponseLogFile = await debugLlmDetails(fullResponse, 'llm_response');
      if (llmResponseLogFile) {
        await debugLog(`LLM response for task ${task.id + 1} [Line ${task.getStartLine()}-${task.getEndLine()}]: See debug_llm_details/${llmResponseLogFile} for details.`);
      }

    } catch (error: any) {
      if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
        const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
        throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
      }
      throw new TranslationError( error.message );
    }

    const validationResult = validateBatch(contentToTranslate, fullResponse, preambleContext);

    if (!validationResult.isValid) {
      const originalStartTime = progressManager.getStartTime(taskId) || startTime;
      const duration = (Date.now() - originalStartTime) / 1000;
      progressManager.updateTask(taskId, { 
        status: TaskStatus.Retrying,
        time: parseFloat(duration.toFixed(1)),
        notes: _('Validation failed'),
      });
      task.notes = _('Validation failed');

      const retryId = `${taskId}-retry`;
      const retryTitle = `(Retry) ${taskTitle}`;
      const newTaskNumber = progressManager.getTaskCount() + 1;
      progressManager.addTask(retryId, retryTitle, newTaskNumber, task.getContentLength());
      
      const retryNote = _('Retranslating Task {{id}}', { id: task.id + 1 });
      progressManager.updateTask(retryId, { notes: retryNote });

      progressManager.startTask(retryId);
      const retryStartTime = Date.now();

      const retryTemplate = getPromptTemplate({ isRetry: true, hasPreamble });
      const retryPrompt = PromptTemplate.fromTemplate(retryTemplate);
      const retryChain = retryPrompt.pipe(model).pipe(new StringOutputParser());

      fullResponse = '';
      totalBytes = 0;

      const retryFormatVariables: any = {
        errors: validationResult.errors.join('\n- '),
        style_guide: styleGuidePath,
        full_context: fullContextPath,
        section_to_translate: sectionPreview,
      };
      if (preambleContext) {
        const preambleLogFilename = await debugLlmDetails(preambleContext, 'preamble_context_retry');
        retryFormatVariables.preamble_context = preambleLogFilename
          ? `See debug_llm_details/${preambleLogFilename} for details.`
          : `[Preamble context could not be logged]`;
      }
      const retryPromptFormatted = await retryPrompt.format(retryFormatVariables);

      const detailLogFilenameRetry = await debugLlmDetails(contentToTranslate, 'retry_section_to_translate');
      const logMessageRetry = detailLogFilenameRetry
        ? retryPromptFormatted.replace(sectionPreview, `See debug_llm_details/${detailLogFilenameRetry} for details.`)
        : retryPromptFormatted;

      await debugLog(`Retry prompt for task ${task.id + 1} [Line ${task.getStartLine()}-${task.getEndLine()}]:\n${logMessageRetry}`);

      try {
        const retryStreamVariables: any = {
          style_guide: styleGuide,
          full_context: fullContext,
          section_to_translate: contentToTranslate,
          errors: validationResult.errors.join('\n- '),
        };
        if (preambleContext) {
          retryStreamVariables.preamble_context = preambleContext;
        }
        const retryStream = await retryChain.stream(retryStreamVariables);

        for await (const chunk of retryStream) {
          fullResponse += chunk;
          totalBytes += Buffer.byteLength(chunk, 'utf8');
          progressManager.updateBytes(retryId, totalBytes);
        }

        const llmResponseLogFileRetry = await debugLlmDetails(fullResponse, 'llm_retry_response');
        if (llmResponseLogFileRetry) {
          await debugLog(`LLM retry response for task ${task.id + 1} [Line ${task.getStartLine()}-${task.getEndLine()}]: See debug_llm_details/${llmResponseLogFileRetry} for details.`);
        }

      } catch (error: any) {
        if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
          const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
          throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
        }
        throw new TranslationError( error.message );
      }

      const secondValidation = validateBatch(contentToTranslate, fullResponse, preambleContext);
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
    let sectionStartIndex = 0;

    // 檢查是否存在序言
    const preambleEntries = extractPreambleEntries(allSections[0]);
    if (preambleEntries.length > 0 && allSections.length > 0) {
      const preambleTask = taskFactory.createTask(); // This is Task ID 0
      preambleTask.addSection(allSections[0], true);
      tasks.push(preambleTask);
      sectionStartIndex = 1;
    }

    // 只有在處理完序言後，才為剩餘的 sections 建立第一個 currentTask
    let currentTask: Task = taskFactory.createTask();

    // 遍歷所有章節，執行雙分支任務分配邏輯：
    // 1. 如果是普通章節，則嘗試將其加入當前任務。
    // 2. 如果遇到巨大 H2 章節或上下文變更，則結束當前任務，並為新章節建立合適的新任務。
    for (let i = sectionStartIndex; i < allSections.length; i++) {
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
        const isPreamble = task.isPreamble();
        return `- Task ${task.id + 1} ${isPreamble ? '(Preamble)' : ''} (Lines ${task.getStartLine()}-${task.getEndLine()}) (contentLength: ${task.getContentLength()}) (parentContext: '${task.parentContext?.title}') \n${sectionsLog}`;
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
  

    // 為所有任務註冊進度條
    nonEmptyTasks.forEach(task => {
      const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
      progressManager.addTask(taskId, task.getTitle(), task.id + 1, task.getContentLength());
    });

    // 執行翻譯流程
    let preambleTask: Task | undefined;
    if (nonEmptyTasks.length > 0 && nonEmptyTasks[0].isPreamble()) {
      preambleTask = nonEmptyTasks.shift();
    }

    let preambleTranslationResult = '';
    let translatedTasks: { task: Task; translatedContent: string }[] = [];

    if (preambleTask) {
      const result = await translateContent(styleGuide, sanitizedFileContent, preambleTask!, progressManager, sourceFilePath, apiKeyUsed);
      preambleTranslationResult = result.translatedContent;
      if (!preambleTranslationResult) {
        throw new TranslationError(_('Preamble translation failed, stopping the process.'));
      }
      // 將序言的翻譯結果先放入最終結果陣列
      translatedTasks.push(result);
    }

    if (nonEmptyTasks.length > 0) {
      const translationPromises = nonEmptyTasks.map((task) => {
        // 為剩餘任務傳入序言翻譯結果
        return limit(() => translateContent(styleGuide, sanitizedFileContent, task, progressManager, sourceFilePath, apiKeyUsed, preambleTranslationResult));
      });
  
      const remainingTranslatedTasks = await Promise.all(translationPromises);
      translatedTasks.push(...remainingTranslatedTasks);
    }

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