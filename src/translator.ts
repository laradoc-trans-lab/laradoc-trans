import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from './i18n';
import { parseMarkdownIntoSections, MarkdownH2Section, MarkdownSection } from './markdownParser';
import { ProgressManager, TaskStatus } from './progressBar';
import { createLlmModel } from './llm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { validateBatch } from './validator';
import { debugLog } from './debugLogger';

// --- 錯誤類別定義 ---

export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationError';
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
    await debugLog(`Initial prompt for section ${sectionId}:\n${initialPromptFormatted}`);

    // --- First attempt ---
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
      await debugLog(`Retry prompt for section ${sectionId}:\n${retryPromptFormatted}`);

      // --- Second attempt ---
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
    const h2Sections = parseMarkdownIntoSections(fileContent);

    const BATCH_SIZE_LIMIT = 10240; // 10K Bytes
    let allBatches: { id: string, title: string, content: string }[] = [];
    let batchCounter = 0;

    // 遍歷每一個 H2 章節群組
    for (const h2Section of h2Sections) {
      let currentBatch: MarkdownSection[] = [];
      let currentBatchSize = 0;

      // 在 H2 章節內部建立批次
      for (const subSection of h2Section.subSections) {
        const size = Buffer.byteLength(subSection.content, 'utf8');

        if (currentBatch.length > 0 && currentBatchSize + size > BATCH_SIZE_LIMIT) {
          // 目前批次已滿，儲存起來
          const batchContent = currentBatch.map(s => s.content).join('\n\n');
          const title = currentBatch.map(s => s.heading).join(', ');
          allBatches.push({ 
            id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`,
            title: title,
            content: batchContent 
          });
          currentBatch = [];
          currentBatchSize = 0;
        }
        currentBatch.push(subSection);
        currentBatchSize += size;
      }

      // 儲存 H2 章節中最後一個未滿的批次
      if (currentBatch.length > 0) {
        const batchContent = currentBatch.map(s => s.content).join('\n\n');
        const title = currentBatch.map(s => s.heading).join(', ');
        allBatches.push({ 
          id: `${path.basename(sourceFilePath)}-batch-${batchCounter++}`,
          title: title,
          content: batchContent 
        });
      }
    }

    if (allBatches.length === 0) {
      return ''; // 沒有內容需要翻譯
    }

    // 為所有批次建立翻譯任務
    const translationPromises = allBatches.map((batch, index) => {
      progressManager.addTask(batch.id, batch.title, index + 1);
      return limit(() => translateContent(styleGuide, fileContent, batch.content, progressManager, batch.id, batch.title, sourceFilePath));
    });

    const translatedBatches = await Promise.all(translationPromises);

    progressManager.stop();
    progressManager.printCollectedWarnings();

    return translatedBatches.join('\n\n');

  } catch (error) {
    progressManager.stop();
    throw error;
  }
}
