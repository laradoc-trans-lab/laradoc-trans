import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from '../i18n';
import { splitMarkdownIntoSections } from '../markdownParser';
import { ProgressManager, TaskStatus } from '../progressBar';
import { createLlmModel } from '../llm';
import { GoogleGenerativeAIError } from "@google/generative-ai";
import { validateBatch } from './validateBatch';
import { extractPreambleEntries } from '../validator/core';
import { debugLog } from '../debugLogger';
import { debugLlmDetails } from '../debugLlmDetails';
import { Task, AddSectionStatus, BATCH_SIZE_LIMIT } from './Task';
import { TaskFactory } from './TaskFactory';
import { buildPrompt, PromptContext } from './prompts';

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



// --- 核心翻譯邏輯 ---

async function translateContent(
  fullContext: string,
  task: Task,
  progressManager: ProgressManager,
  sourceFilePath: string,
  apiKeyUsed: string,
  promptFilePath?: string,
  preambleContext?: string,
): Promise<{ task: Task; translatedContent: string }> {
  const { model } = createLlmModel();
  const startTime = Date.now();
  const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
  const taskTitle = task.getTitle();
  const contentToTranslate = task.getContent();
  
  progressManager.startTask(taskId);

  let totalBytes = 0;
  let fullResponse = '';

  try {
    // 建立初次翻譯的 Prompt
    const promptContext: PromptContext = {
      full_context: fullContext,
      section_to_translate: contentToTranslate,
      preamble_context: preambleContext,
    };
    const prompt = buildPrompt(promptContext, promptFilePath);
    
    const requestLogFile = await debugLlmDetails(prompt, `llm_request_task_${task.id + 1}`);
    if (requestLogFile) {
      await debugLog(`LLM request for task ${task.id + 1}: See debug_llm_details/${requestLogFile}`);
    }

    try {
      const stream = await model.stream(prompt);
      for await (const chunk of stream) {
        fullResponse += chunk.content.toString();
        totalBytes += Buffer.byteLength(chunk.content.toString(), 'utf8');
        progressManager.updateBytes(taskId, totalBytes);
      }

      const responseLogFile = await debugLlmDetails(fullResponse, `llm_response_task_${task.id + 1}`);
      if (responseLogFile) {
        await debugLog(`LLM response for task ${task.id + 1}: See debug_llm_details/${responseLogFile}`);
      }

    } catch (error: any) {
      if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
        const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
        throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
      }
      throw new TranslationError(error.message);
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

      // 建立重試的 Prompt
      const retryContext: PromptContext = {
        ...promptContext,
        errors: validationResult.errors,
      };
      const retryPrompt = buildPrompt(retryContext, promptFilePath);

      fullResponse = '';
      totalBytes = 0;

      const retryRequestLogFile = await debugLlmDetails(retryPrompt, `llm_request_task_${task.id + 1}`);
      if (retryRequestLogFile) {
        await debugLog(`LLM retry request for task ${task.id + 1}: See debug_llm_details/${retryRequestLogFile}`);
      }

      try {
        const retryStream = await model.stream(retryPrompt);
        for await (const chunk of retryStream) {
          fullResponse += chunk.content.toString();
          totalBytes += Buffer.byteLength(chunk.content.toString(), 'utf8');
          progressManager.updateBytes(retryId, totalBytes);
        }

        const retryResponseLogFile = await debugLlmDetails(fullResponse, `llm_response_task_${task.id + 1}`);
        if (retryResponseLogFile) {
          await debugLog(`LLM retry response for task ${task.id + 1}: See debug_llm_details/${retryResponseLogFile}`);
        }

      } catch (error: any) {
        if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
          const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
          throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
        }
        throw new TranslationError(error.message);
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
      const result = await translateContent(sanitizedFileContent, preambleTask!, progressManager, sourceFilePath, apiKeyUsed, promptFilePath);
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
        return limit(() => translateContent(sanitizedFileContent, task, progressManager, sourceFilePath, apiKeyUsed, promptFilePath, preambleTranslationResult));
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