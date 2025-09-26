import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';
import { Section } from './Section';
import {
  validateCodeBlocks,
  validateSpecialMarkers,
  validateInlineCode,
} from '../validator/core';
import { splitMarkdownIntoSections } from '../markdownParser';


// --- Batch Validation for In-Memory Content ---

/**
 * The result of a batch validation.
 */
export interface BatchValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a batch of markdown content in memory.
 * @param originalContent The original markdown content.
 * @param translatedContent The translated markdown content.
 * @returns A promise that resolves to a BatchValidationResult.
 */
export function validateBatch(
  originalContent: string,
  translatedContent: string,
): BatchValidationResult {
  const errors: string[] = [];

  const originalSections = splitMarkdownIntoSections(originalContent);
  const translatedSections = splitMarkdownIntoSections(translatedContent);

  // 1. 驗證標題數量
  if (originalSections.length !== translatedSections.length) {
    errors.push(
      `Section count mismatch. Original: ${originalSections.length}, Translated: ${translatedSections.length}.`,
    );
    // 如果章節數量嚴重不符，後續的逐一比對可能沒有意義，可以選擇提早返回
    return { isValid: false, errors };
  }

  for (const sourceSection of originalSections) {
    // 根據標題和深度尋找對應的翻譯章節
    const targetSection = translatedSections.find(
      s => s.title === sourceSection.title && s.depth === sourceSection.depth
    );

    if (!targetSection) {
      errors.push(`Missing translated section for: "${sourceSection.title}"`);
      continue;
    }

    // 2. 驗證程式碼區塊
    const codeBlockResult = validateCodeBlocks(sourceSection, targetSection);
    if (!codeBlockResult.isValid) {
        errors.push(`Validation failed in section "${sourceSection.title}": Code block mismatch. Do not modify any byte inside the Code Block.`);
    }

    // 3. 驗證行內程式碼
    const inlineCodeResult = validateInlineCode(sourceSection, targetSection);
    if (!inlineCodeResult.isValid) {
      errors.push(`Validation failed in section "${sourceSection.title}": Inline code mismatch. Missing: ${inlineCodeResult.mismatches.join(', ')}`);
    }

    // 4. 驗證提示區塊
    const specialMarkersResult = validateSpecialMarkers(sourceSection, targetSection);
    if (!specialMarkersResult.isValid) {
      errors.push(`Validation failed in section "${sourceSection.title}": Admonition mismatch.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
