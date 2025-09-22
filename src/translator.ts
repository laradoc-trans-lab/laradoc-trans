/**
 * @todo 即時檢查翻譯結果對於章節標題的數量比對仍與 SUMMARY.md / details/*.md 有出入
 */

import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from './i18n';
import { parseMarkdownIntoSections, MarkdownH2Section, MarkdownSection } from './markdownParser';
import { ProgressManager, TaskStatus } from './progressBar';
import { createLlmModel } from './llm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { GoogleGenerativeAIError } from "@google/generative-ai"; // 匯入 GoogleGenerativeAIError
import { validateBatch } from './validator';
import { debugLog } from './debugLogger';

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
  const defaultPromptPath = path.resolve(__dirname, '..', 'resources', 'TRANSLATE_PROMPT.md');
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
  contentToTranslate: string,
  progressManager: ProgressManager,
  sectionId: string,
  sectionTitle: string,
  sourceFilePath: string, // For debug logging
  startLine: number,
  endLine: number,
  apiKeyUsed: string, // 新增：傳遞使用的 API 金鑰
): Promise<string> {
  const { model } = createLlmModel();
  const startTime = Date.now();
  progressManager.startTask(sectionId);

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
    // --- Debug Log Initial Prompt ---
    const styleGuidePath = `[From prompt file: ${cachedPromptPath}]`;
    const fullContextPath = `[From source file: ${sourceFilePath}]`;
    const sectionPreview = contentToTranslate.split('\n').slice(0, 5).join('\n') + '\n[...]';
    
    const initialPromptFormatted = await PromptTemplate.fromTemplate(initialTemplate).format({
      style_guide: styleGuidePath,
      full_context: fullContextPath,
      section_to_translate: sectionPreview,
    });
    await debugLog(`Initial prompt for section ${sectionId} [Line ${startLine}-${endLine}]:\n${initialPromptFormatted}`);

    // --- First attempt ---
    try {
      const stream = await chain.stream({
        style_guide: styleGuide,
        full_context: fullContext,
        section_to_translate: contentToTranslate,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        totalBytes += Buffer.byteLength(chunk, 'utf8');
        progressManager.updateBytes(sectionId, totalBytes);
      }
    } catch (error: any) {
      if (error instanceof GoogleGenerativeAIError && error.message.includes('429 Too Many Requests')) {
        const maskedKey = apiKeyUsed.substring(0, 4) + '****' + apiKeyUsed.substring(apiKeyUsed.length - 4);
        throw new LlmApiQuotaError(_('LLM API quota exceeded for key: {{maskedKey}}', { maskedKey }), maskedKey, error);
      }
      throw error;
    }

    // --- Validation and Retry Logic ---
    const validationResult = validateBatch(contentToTranslate, fullResponse);

    if (!validationResult.isValid) {
      // --- Mark original task as failed ---
      const originalStartTime = progressManager.getStartTime(sectionId) || startTime;
      const duration = (Date.now() - originalStartTime) / 1000;
      progressManager.updateTask(sectionId, { 
        status: TaskStatus.Retrying, // This is the ⚠️ icon 
        time: parseFloat(duration.toFixed(1)),
      });

      // --- Create and execute a new task for retry ---
      const retryId = `${sectionId}-retry`;
      const retryTitle = `(Retry) ${sectionTitle}`;
      const newTaskNumber = progressManager.getTaskCount() + 1;
      progressManager.addTask(retryId, retryTitle, newTaskNumber);
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

      fullResponse = ''; // Reset response
      totalBytes = 0; // Reset bytes

      // --- Debug Log Retry Prompt ---
      const retryPromptFormatted = await PromptTemplate.fromTemplate(retryTemplate).format({
        errors: validationResult.errors.join('\n- '), // Full errors
        style_guide: styleGuidePath,
        full_context: fullContextPath,
        section_to_translate: sectionPreview,
      });
      await debugLog(`Retry prompt for section ${sectionId} [Line ${startLine}-${endLine}]:\n${retryPromptFormatted}`);

      // --- Second attempt ---
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
        progressManager.collectWarning(_('Re-translation for section "{{sectionTitle}}" failed validation again, but the result will be accepted.', { sectionTitle }));
      }
      
      const retryEndTime = Date.now();
      const retryDuration = parseFloat(((retryEndTime - retryStartTime) / 1000).toFixed(1));
      progressManager.completeTask(retryId, retryDuration);

      return fullResponse;
    }

    // If validation was successful on the first try
    const endTime = Date.now();
    const duration = parseFloat(((endTime - startTime) / 1000).toFixed(1));
    progressManager.completeTask(sectionId, duration);

    return fullResponse;
  } catch (error) {
    progressManager.failTask(sectionId);
    throw error;
  }
}


export async function translateFile(sourceFilePath: string, promptFilePath?: string): Promise<string> {
  const concurrency = parseInt(process.env.TRANSLATION_CONCURRENCY || '3', 10);
  console.log(_('Concurrency Level: {{concurrency}}', { concurrency }));
  const limit = pLimit(concurrency);

  const progressManager = new ProgressManager();

  try {
    const styleGuide = await getStyleGuide(promptFilePath);
    const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
    const { model, apiKeyUsed } = createLlmModel(); // 接收 apiKeyUsed
    const h2Sections = parseMarkdownIntoSections(fileContent);

    const BATCH_SIZE_LIMIT = 10240; // 10K Bytes
    let allBatches: { id: string, title: string, content: string, startLine: number, endLine: number }[] = [];
    let batchCounter = 0;

    // --- 新版階層式演算法 ---
    let currentBatchOfH2s: MarkdownSection[] = [];
    let currentBatchOfH2sSize = 0;

    const finalizeH2Batch = () => {
      if (currentBatchOfH2s.length > 0) {
        const batchContent = currentBatchOfH2s.map(s => s.content).join('\n\n');
        const title = currentBatchOfH2s.map(s => s.heading).join(', ');
        const startLine = currentBatchOfH2s[0].startLine;
        const endLine = currentBatchOfH2s[currentBatchOfH2s.length - 1].endLine;
        allBatches.push({
          id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`,
          title: title,
          content: batchContent,
          startLine: startLine,
          endLine: endLine,
        });
        currentBatchOfH2s = [];
        currentBatchOfH2sSize = 0;
      }
    };

    for (const h2Section of h2Sections) {
      const h2TotalSize = h2Section.subSections.reduce((sum, s) => sum + Buffer.byteLength(s.content, 'utf8'), 0);

      // 規則 3 & 可分割的大章節
      if (h2TotalSize > BATCH_SIZE_LIMIT) {
        // 遇到大章節，先結束前面的小章節合併任務
        finalizeH2Batch();

        // 專門處理這個大章節內部的子區塊
        let internalBatch: MarkdownSection[] = [];
        let internalBatchSize = 0;
        for (const subSection of h2Section.subSections) {
          const subSize = Buffer.byteLength(subSection.content, 'utf8');

          if (subSize > BATCH_SIZE_LIMIT) {
            if (internalBatch.length > 0) {
              const batchContent = internalBatch.map(s => s.content).join('\n\n');
              const title = internalBatch.map(s => s.heading).join(', ');
              const startLine = internalBatch[0].startLine;
              const endLine = internalBatch[internalBatch.length - 1].endLine;
              allBatches.push({ id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`, title, content: batchContent, startLine: startLine, endLine: endLine });
              internalBatch = [];
              internalBatchSize = 0;
            }
            allBatches.push({ id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`, title: subSection.heading, content: subSection.content, startLine: subSection.startLine, endLine: subSection.endLine });
            continue;
          }

          if (internalBatch.length > 0 && internalBatchSize + subSize > BATCH_SIZE_LIMIT) {
            const batchContent = internalBatch.map(s => s.content).join('\n\n');
            const title = internalBatch.map(s => s.heading).join(', ');
            const startLine = internalBatch[0].startLine;
            const endLine = internalBatch[internalBatch.length - 1].endLine;
            allBatches.push({ id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`, title, content: batchContent, startLine: startLine, endLine: endLine });
            internalBatch = [];
            internalBatchSize = 0;
          }
          internalBatch.push(subSection);
          internalBatchSize += subSize;
        }
        if (internalBatch.length > 0) {
          const batchContent = internalBatch.map(s => s.content).join('\n\n');
          const title = internalBatch.map(s => s.heading).join(', ');
          const startLine = internalBatch[0].startLine;
          const endLine = internalBatch[internalBatch.length - 1].endLine;
          allBatches.push({ id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`, title, content: batchContent, startLine: startLine, endLine: endLine });
        }
      } else { // 規則 1: 合併小章節
        if (currentBatchOfH2s.length > 0 && currentBatchOfH2sSize + h2TotalSize > BATCH_SIZE_LIMIT) {
          finalizeH2Batch();
        }
        currentBatchOfH2s.push(...h2Section.subSections);
        currentBatchOfH2sSize += h2TotalSize;
      }
    }
    // 結束最後一個批次
    finalizeH2Batch();

    if (allBatches.length === 0) {
      return ''; // 沒有內容需要翻譯
    }

    // --- 任務分配清單，這會在進度條開始前印出 ---
    // 主要目的是讓使用者知道有哪些任務被建立，以及它們包含哪些章節標題

    console.log('\n--- Translation Task Assignment ---');
    allBatches.forEach((batch, index) => {
      console.log(`- Task ${index + 1}`);
      const sections = batch.title.split(', ');
      sections.forEach(section => {
        console.log(`  * ${section}`);
      });
    });
    console.log('---------------------------------\n');


    // 為所有批次建立翻譯任務
    const translationPromises = allBatches.map((batch, index) => {
      progressManager.addTask(batch.id, batch.title, index + 1);
      return limit(() => translateContent(styleGuide, fileContent, batch.content, progressManager, batch.id, batch.title, sourceFilePath, batch.startLine, batch.endLine, apiKeyUsed));
    });

    const translatedBatches = await Promise.all(translationPromises);

    progressManager.stop();
    progressManager.printCollectedWarnings();

    return translatedBatches.join('\n\n');

  } catch (error) {
    progressManager.stop();
    if (error instanceof LlmApiQuotaError) {
      console.error(_('Translation failed: LLM API quota exceeded for key: {{maskedKey}}', { maskedKey: error.maskedApiKey }));
    }
    throw error;
  }
}
