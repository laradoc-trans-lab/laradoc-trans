import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import fs from 'fs/promises';
import path from 'path';
import { _ } from './i18n';
import { CodeBlockMismatchError } from "./errors/CodeBlockMismatchError";
import { parseMarkdownIntoSections } from "./markdownParser";

// --- 終端機動態訊息相關函式 ---

function printDynamicMessage(message: string) {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(message);
  }
}

function clearDynamicMessage() {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }
}

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

function countCodeBlocks(content: string): number {
  const codeBlockRegex = /```/g;
  const matches = content.match(codeBlockRegex);
  return matches ? Math.floor(matches.length / 2) : 0;
}

// --- 核心翻譯邏輯 ---

export async function translateFile(sourceFilePath: string, promptFilePath?: string): Promise<string> {
  const styleGuide = await getStyleGuide(promptFilePath);
  const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
  const allSections = parseMarkdownIntoSections(fileContent);

  const prologue = allSections.find(s => s.type === 'prologue');
  const mainSections = allSections.filter(s => s.type === 'section');
  const translatedContents: string[] = [];

  if (mainSections.length < 2) {
    printDynamicMessage(_('Document is short. Translating file in one go...'));
    const translatedContent = await translateContent(styleGuide, fileContent, fileContent);
    return translatedContent;
  }

  const initialBatchSections = [prologue, ...mainSections.slice(0, 2)].filter(Boolean);
  const initialBatchContent = initialBatchSections.map(s => s!.content).join('\n\n');
  console.log(_('Translating initial batch (prologue + first 2 sections)...'));
  const translatedInitialBatch = await translateContent(styleGuide, fileContent, initialBatchContent);
  translatedContents.push(translatedInitialBatch);

  const remainingSections = mainSections.slice(2);
  const BATCH_SIZE = 3;

  for (let i = 0; i < remainingSections.length; i += BATCH_SIZE) {
    const batch = remainingSections.slice(i, i + BATCH_SIZE);
    const batchContent = batch.map(s => s.content).join('\n\n');
    
    console.log(_('Translating batch starting with section: {{heading}}...', { heading: batch[0].heading }));

    const translatedBatch = await translateContent(styleGuide, fileContent, batchContent);

    /*
    const originalCodeBlocks = countCodeBlocks(batchContent);
    const translatedCodeBlocks = countCodeBlocks(translatedBatch);
    if (originalCodeBlocks !== translatedCodeBlocks) {
      throw new CodeBlockMismatchError(
        _('Code block count mismatch in batch starting with section: {{heading}}. Original: {{original}}, Translated: {{translated}}', {
          heading: batch[0].heading,
          original: originalCodeBlocks,
          translated: translatedCodeBlocks,
        }),
        batchContent,
        translatedBatch
      );
    }
    */
    translatedContents.push(translatedBatch);
  }

  const finalContent = translatedContents.filter(c => c.trim() !== '').join('\n\n');
  return finalContent;
}

import { createLlmModel } from "./llm";

// ... (existing code) ...

async function translateContent(styleGuide: string, fullContext: string, contentToTranslate: string): Promise<string> {
  const startTime = Date.now();
  const { model } = createLlmModel();

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

  const stream = await chain.stream({
    style_guide: styleGuide,
    full_context: fullContext,
    section_to_translate: contentToTranslate,
  });

  let fullResponse = '';
  let receivedBytes = 0;
  for await (const chunk of stream) {
    fullResponse += chunk;
    receivedBytes += Buffer.byteLength(chunk, 'utf8');
    printDynamicMessage(_('Receiving... {{bytes}} bytes', { bytes: receivedBytes }));
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  clearDynamicMessage();
  console.log(_('  └─ Translation successful (took {{duration}}s)', { duration: duration }));

  return fullResponse;
}
