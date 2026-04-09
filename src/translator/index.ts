import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from '../i18n';
import { splitMarkdownIntoSections } from '../markdownParser';
import { ProgressManager, TaskStatus } from '../progressBar';
import { createLlmModel, LlmModel } from '../llm';
import { validateBatch } from './validateBatch';
import { debugLog } from '../debugLogger';
import { debugLlmDetails } from '../debugLlmDetails';
import { Task, BATCH_SIZE_LIMIT } from './Task';
import { TaskFactory } from './TaskFactory';
import { assignTasks } from './taskAssigner';
import { buildPrompt, PromptContext } from './prompts';

// --- 錯誤類別定義 ---

export class TranslationError extends Error {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'TranslationError';
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

export class LlmApiQuotaError extends TranslationError {
  public readonly maskedApiKey: string;

  constructor(message: string, maskedApiKey: string, originalError?: Error) {
    super(message, originalError);
    this.name = 'LlmApiQuotaError';
    this.maskedApiKey = maskedApiKey;
  }
}

export class PromptFileReadError extends TranslationError {
  constructor(message: string, originalError?: Error) {
    super(message, originalError);
    this.name = 'PromptFileReadError';
  }
}

function extractVisibleTextFromChunk(chunk: any): string {
  const content = chunk?.content;

  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') {
          return part;
        }

        if (!part || typeof part !== 'object') {
          return '';
        }

        if (part.type === 'text' && typeof part.text === 'string' && part.thought !== true) {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  if (typeof content === 'string') {
    return content;
  }

  if (typeof chunk?.text === 'string') {
    return chunk.text;
  }

  return '';
}

function parseErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const unknownError = error as Record<string, unknown>;
  const status = unknownError.status;
  const statusCode = unknownError.statusCode;
  const code = unknownError.code;
  const response = unknownError.response as Record<string, unknown> | undefined;

  if (typeof status === 'number') {
    return status;
  }
  if (typeof statusCode === 'number') {
    return statusCode;
  }
  if (typeof status === 'string' && /^\d+$/.test(status)) {
    return Number(status);
  }
  if (typeof statusCode === 'string' && /^\d+$/.test(statusCode)) {
    return Number(statusCode);
  }
  if (typeof code === 'number') {
    return code;
  }
  if (typeof code === 'string' && /^\d+$/.test(code)) {
    return Number(code);
  }
  if (response && typeof response.status === 'number') {
    return response.status;
  }
  if (response && typeof response.statusCode === 'number') {
    return response.statusCode;
  }
  if (response && typeof response.status === 'string' && /^\d+$/.test(response.status)) {
    return Number(response.status);
  }
  if (response && typeof response.statusCode === 'string' && /^\d+$/.test(response.statusCode)) {
    return Number(response.statusCode);
  }
  return undefined;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (!error || typeof error !== 'object') {
    return String(error ?? '');
  }
  const maybeMessage = (error as Record<string, unknown>).message;
  if (typeof maybeMessage === 'string') {
    return maybeMessage;
  }
  return String(error);
}

function isLlmRateLimitError(error: unknown): boolean {
  const status = parseErrorStatus(error);
  if (status === 429) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted')
  );
}

const MAX_LLM_SERVER_ERROR_RETRIES = 2;
const LLM_SERVER_ERROR_RETRY_DELAY_MS = 1500;

function maskApiKey(apiKey: string): string {
  return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
}

function isLlmServerError(error: unknown): boolean {
  const status = parseErrorStatus(error);
  return typeof status === 'number' && status >= 500 && status <= 599;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }
      if (typeof currentValue === 'function') {
        return `[Function: ${currentValue.name || 'anonymous'}]`;
      }
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) {
          return '[Circular]';
        }
        seen.add(currentValue);
      }
      return currentValue;
    },
    2
  );
}

function extractErrorDebugDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: extractErrorMessage(error),
    parsedStatus: parseErrorStatus(error),
    isRateLimit: isLlmRateLimitError(error),
  };

  if (error instanceof Error) {
    details.name = error.name;
    details.stack = error.stack;
  }

  if (!error || typeof error !== 'object') {
    return details;
  }

  const unknownError = error as Record<string, unknown>;
  const directFields = ['status', 'statusCode', 'statusText', 'code', 'url', 'headers', 'data'] as const;
  for (const field of directFields) {
    if (unknownError[field] !== undefined) {
      details[field] = unknownError[field];
    }
  }

  const response = unknownError.response;
  if (response && typeof response === 'object') {
    const responseObject = response as Record<string, unknown>;
    details.response = {
      status: responseObject.status,
      statusCode: responseObject.statusCode,
      statusText: responseObject.statusText,
      url: responseObject.url,
      headers: responseObject.headers,
    };
  }

  return details;
}

async function logLlmStreamError(params: {
  task: Task;
  sourceFilePath: string;
  modelInfo: string;
  maskedKey: string;
  attempt: 'initial' | 'retry';
  promptCharLength: number;
  sectionCharLength: number;
  preambleCharLength: number;
  requestLogFile: string | null;
  error: unknown;
  serverRetryCount?: number;
}): Promise<void> {
  const errorSnapshot = {
    event: 'llm_stream_error',
    attempt: params.attempt,
    taskId: params.task.id + 1,
    taskTitle: params.task.getTitle(),
    sourceFilePath: params.sourceFilePath,
    modelInfo: params.modelInfo,
    maskedKey: params.maskedKey,
    promptCharLength: params.promptCharLength,
    sectionCharLength: params.sectionCharLength,
    preambleCharLength: params.preambleCharLength,
    serverRetryCount: params.serverRetryCount ?? 0,
    requestLogFile: params.requestLogFile,
    error: extractErrorDebugDetails(params.error),
  };

  const errorLogFile = await debugLlmDetails(
    safeJsonStringify(errorSnapshot),
    `llm_error_task_${params.task.id + 1}_${params.attempt}`
  );

  if (errorLogFile) {
    await debugLog(
      `LLM ${params.attempt} error for task ${params.task.id + 1}: See debug_llm_details/${errorLogFile}`
    );
  } else {
    await debugLog(
      `LLM ${params.attempt} error for task ${params.task.id + 1}: ${extractErrorMessage(params.error)}`
    );
  }
}

async function streamPromptWithServerRetry(params: {
  llmModel: LlmModel;
  recreateLlmModel: () => LlmModel;
  prompt: string;
  task: Task;
  sourceFilePath: string;
  attempt: 'initial' | 'retry';
  requestLogFile: string | null;
  sectionCharLength: number;
  preambleCharLength: number;
  onChunk: (visibleText: string) => void;
  onBeforeRetry?: () => void;
  onModelRecreated?: (llmModel: LlmModel) => void;
}): Promise<void> {
  let currentLlmModel = params.llmModel;

  for (let retryCount = 0; retryCount <= MAX_LLM_SERVER_ERROR_RETRIES; retryCount++) {
    try {
      const stream = await currentLlmModel.model.stream(params.prompt);
      for await (const chunk of stream) {
        const visibleText = extractVisibleTextFromChunk(chunk);
        params.onChunk(visibleText);
      }
      return;
    } catch (error) {
      const canRetry =
        isLlmServerError(error) &&
        retryCount < MAX_LLM_SERVER_ERROR_RETRIES;

      if (canRetry) {
        const status = parseErrorStatus(error) ?? 'unknown';
        const oldMaskedKey = maskApiKey(currentLlmModel.apiKeyUsed);
        await debugLog(
          `LLM ${params.attempt} server error for task ${params.task.id + 1} (status: ${status}). Retrying (${retryCount + 1}/${MAX_LLM_SERVER_ERROR_RETRIES}) after ${LLM_SERVER_ERROR_RETRY_DELAY_MS}ms. Current key: ${oldMaskedKey}.`
        );
        params.onBeforeRetry?.();
        await sleep(LLM_SERVER_ERROR_RETRY_DELAY_MS);

        currentLlmModel = params.recreateLlmModel();
        const newMaskedKey = maskApiKey(currentLlmModel.apiKeyUsed);
        await debugLog(
          `LLM ${params.attempt} retry for task ${params.task.id + 1} rebuilt client with key ${newMaskedKey}.`
        );
        params.onModelRecreated?.(currentLlmModel);
        continue;
      }

      await logLlmStreamError({
        task: params.task,
        sourceFilePath: params.sourceFilePath,
        modelInfo: currentLlmModel.modelInfo,
        maskedKey: maskApiKey(currentLlmModel.apiKeyUsed),
        attempt: params.attempt,
        promptCharLength: params.prompt.length,
        sectionCharLength: params.sectionCharLength,
        preambleCharLength: params.preambleCharLength,
        requestLogFile: params.requestLogFile,
        error,
        serverRetryCount: retryCount,
      });

      throw error;
    }
  }
}



// --- 核心翻譯邏輯 ---

async function translateContent(
  fullContext: string,
  task: Task,
  progressManager: ProgressManager,
  sourceFilePath: string,
  llmModel: LlmModel, // 修改：接收完整的 LlmModel 物件
  promptFilePath?: string,
  preambleContext?: string,
): Promise<{ task: Task; translatedContent: string }> {
  let currentLlmModel = llmModel;
  const startTime = Date.now();
  const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
  const taskTitle = task.getTitle();
  const contentToTranslate = task.getContent();

  // 遮罩 API Key 以便顯示
  let maskedKey = maskApiKey(currentLlmModel.apiKeyUsed);
  
  progressManager.startTask(taskId);
  // 更新進度條以顯示正在使用的 Key
  progressManager.updateTask(taskId, { notes: `🔑 ${maskedKey}` });

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

    await streamPromptWithServerRetry({
      llmModel: currentLlmModel,
      recreateLlmModel: createLlmModel,
      prompt,
      task,
      sourceFilePath,
      attempt: 'initial',
      requestLogFile,
      sectionCharLength: contentToTranslate.length,
      preambleCharLength: preambleContext?.length ?? 0,
      onChunk: (visibleText: string) => {
        fullResponse += visibleText;
        totalBytes += Buffer.byteLength(visibleText, 'utf8');
        progressManager.updateBytes(taskId, totalBytes);
      },
      onBeforeRetry: () => {
        fullResponse = '';
        totalBytes = 0;
        progressManager.updateBytes(taskId, 0);
      },
      onModelRecreated: (recreatedModel: LlmModel) => {
        currentLlmModel = recreatedModel;
        maskedKey = maskApiKey(recreatedModel.apiKeyUsed);
        progressManager.updateTask(taskId, { notes: `🔑 ${maskedKey}` });
      },
    });

    const responseLogFile = await debugLlmDetails(fullResponse, `llm_response_task_${task.id + 1}`);
    if (responseLogFile) {
      await debugLog(`LLM response for task ${task.id + 1}: See debug_llm_details/${responseLogFile}`);
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
      
      const retryNote = _('Retranslating Task {{id}} (🔑 {{maskedKey}})', { id: task.id + 1, maskedKey });
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

      const retryRequestLogFile = await debugLlmDetails(retryPrompt, `llm_request_task_${task.id + 1}_retry`);
      if (retryRequestLogFile) {
        await debugLog(`LLM retry request for task ${task.id + 1}: See debug_llm_details/${retryRequestLogFile}`);
      }

      await streamPromptWithServerRetry({
        llmModel: currentLlmModel,
        recreateLlmModel: createLlmModel,
        prompt: retryPrompt,
        task,
        sourceFilePath,
        attempt: 'retry',
        requestLogFile: retryRequestLogFile,
        sectionCharLength: contentToTranslate.length,
        preambleCharLength: preambleContext?.length ?? 0,
        onChunk: (visibleText: string) => {
          fullResponse += visibleText;
          totalBytes += Buffer.byteLength(visibleText, 'utf8');
          progressManager.updateBytes(retryId, totalBytes);
        },
        onBeforeRetry: () => {
          fullResponse = '';
          totalBytes = 0;
          progressManager.updateBytes(retryId, 0);
        },
        onModelRecreated: (recreatedModel: LlmModel) => {
          currentLlmModel = recreatedModel;
          maskedKey = maskApiKey(recreatedModel.apiKeyUsed);
          const recreatedRetryNote = _('Retranslating Task {{id}} (🔑 {{maskedKey}})', { id: task.id + 1, maskedKey });
          progressManager.updateTask(retryId, { notes: recreatedRetryNote });
        },
      });

      const retryResponseLogFile = await debugLlmDetails(fullResponse, `llm_response_task_${task.id + 1}_retry`);
      if (retryResponseLogFile) {
        await debugLog(`LLM retry response for task ${task.id + 1}: See debug_llm_details/${retryResponseLogFile}`);
      }

      const secondValidation = validateBatch(contentToTranslate, fullResponse, preambleContext);
      if (!secondValidation.isValid) {
        progressManager.collectWarning(_('Re-translation for section "{{sectionTitle}}" failed validation again, but the result will be accepted.', { sectionTitle: taskTitle }));
      }
      
      const retryEndTime = Date.now();
      const retryDuration = parseFloat(((retryEndTime - retryStartTime) / 1000).toFixed(1));
      // 在完成重試任務前清除 note
      progressManager.updateTask(retryId, { notes: '' });
      progressManager.completeTask(retryId, retryDuration);

      return { task, translatedContent: fullResponse };
    }

    const endTime = Date.now();
    const duration = parseFloat(((endTime - startTime) / 1000).toFixed(1));
    // 在完成任務前清除 note
    progressManager.updateTask(taskId, { notes: '' });
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
    const allSections = splitMarkdownIntoSections(fileContent);

    // Sanitize the full file content for context to save tokens
    const imageRegex = /(!\[.*?\]\()(data:image\/[^)]+)(\))/g;
    const sanitizedFileContent = fileContent.replace(imageRegex, (match, g1, g2, g3) => {
      return g1 + '([IMAGE DATA])' + g3;
    });

    const tasks = assignTasks(allSections, taskFactory);

    if (tasks.length === 0) {
      return '';
    }

    const taskAssignmentLog = [
      `--- Translation Task Assignment for ${sourceFilePath} ---`,
      `--- Total Sections: ${allSections.length}, Total Tasks: ${tasks.length} ---`,
      ...tasks.map(task => {
        const sectionsLog = task.getSections().map(section =>
          `  * ${'#'.repeat(section.depth)} ${section.title} (Lines ${section.startLine}-${section.endLine}) (contentLength: ${section.contentLength} , totalLength:${section.totalLength}) `
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
    tasks.forEach(task => {
      const taskId = `${path.basename(sourceFilePath)}-task-${task.id}`;
      progressManager.addTask(taskId, task.getTitle(), task.id + 1, task.getContentLength());
    });

    // 執行翻譯流程
    let preambleTask: Task | undefined;
    if (tasks.length > 0 && tasks[0].isPreamble()) {
      preambleTask = tasks.shift();
    }

    let preambleTranslationResult = '';
    let translatedTasks: { task: Task; translatedContent: string }[] = [];

    if (preambleTask) {
      const llmModel = createLlmModel(); // 為序言任務建立模型
      const result = await translateContent(sanitizedFileContent, preambleTask!, progressManager, sourceFilePath, llmModel, promptFilePath);
      preambleTranslationResult = result.translatedContent;
      if (!preambleTranslationResult) {
        throw new TranslationError(_('Preamble translation failed, stopping the process.'));
      }
      // 將序言的翻譯結果先放入最終結果陣列
      translatedTasks.push(result);
    }

    if (tasks.length > 0) {
      const translationPromises = tasks.map((task) => {
        // 為剩餘任務傳入序言翻譯結果
        return limit(() => {
          const llmModel = createLlmModel(); // 為每個併發任務建立獨立的模型
          return translateContent(sanitizedFileContent, task, progressManager, sourceFilePath, llmModel, promptFilePath, preambleTranslationResult);
        });
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

  } catch (error:any) {
    progressManager.stop();
    if (error instanceof LlmApiQuotaError) {
      console.error(_('Translation failed: LLM API quota exceeded for key: {{maskedKey}}', { maskedKey: error.maskedApiKey }));
    }
    throw error;
  }
}
