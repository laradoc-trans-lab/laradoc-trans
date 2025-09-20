import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { _ } from './i18n';
import { parseMarkdownIntoSections, MarkdownSection } from './markdownParser';
import { ProgressManager, TaskStatus } from './progressBar';
import { createLlmModel } from './llm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

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
  contentToTranslate: string, // Content is now a batch of sections
  progressManager: ProgressManager,
  sectionId: string,
): Promise<string> {
  const { model } = createLlmModel();
  const startTime = Date.now();
  progressManager.startTask(sectionId);

  const template = `
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

  const promptTemplate = PromptTemplate.fromTemplate(template);
  const parser = new StringOutputParser();
  const chain = promptTemplate.pipe(model).pipe(parser);

  let totalBytes = 0;
  let fullResponse = '';

  try {
    const stream = await chain.stream({
      style_guide: styleGuide,
      full_context: fullContext,
      section_to_translate: contentToTranslate,
    }, {
      callbacks: []
    });

    for await (const chunk of stream) {
      fullResponse += chunk;
      totalBytes += Buffer.byteLength(chunk, 'utf8');
      progressManager.updateBytes(sectionId, totalBytes);
    }

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
  console.log(_('Concurrency Level: {{concurrency}}', { concurrency })); // Debug log for concurrency
  const limit = pLimit(concurrency);

  const progressManager = new ProgressManager();

  try {
    const styleGuide = await getStyleGuide(promptFilePath);
    const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
    const allSections = parseMarkdownIntoSections(fileContent);

    // Dynamic Batching Logic
    const BATCH_SIZE_LIMIT = 10000; // 10K Bytes
    const batches: MarkdownSection[][] = [];
    let currentBatch: MarkdownSection[] = [];
    let currentBatchSize = 0;

    for (const section of allSections) {
      const size = Buffer.byteLength(section.content, 'utf8');

      if (currentBatch.length === 0) {
        currentBatch.push(section);
        currentBatchSize += size;
      } else if (size >= BATCH_SIZE_LIMIT) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        batches.push([section]);
        currentBatch = [];
        currentBatchSize = 0;
      } else if (currentBatchSize + size > BATCH_SIZE_LIMIT) {
        batches.push(currentBatch);
        currentBatch = [section];
        currentBatchSize = size;
      } else {
        currentBatch.push(section);
        currentBatchSize += size;
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    if (batches.length === 0) {
        return ''; // No content to translate
    }

    const translationPromises = batches.map((batch, index) => {
      const batchId = `${path.basename(sourceFilePath)}-batch-${index}`;
      const title = batch.map(s => s.heading || 'Prologue').join(', ');
      progressManager.addTask(batchId, title, index + 1);
      
      const batchContent = batch.map(s => s.content).join('\n\n');

      return limit(() => translateContent(styleGuide, fileContent, batchContent, progressManager, batchId));
    });

    const translatedBatches = await Promise.all(translationPromises);

    progressManager.stop();
    return translatedBatches.join('\n\n');

  } catch (error) {
    progressManager.stop();
    throw error;
  }
}
