import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';
import { Section } from './Section';
import {
  validateCodeBlocks,
  validateSpecialMarkers,
  validateInlineCode,
  extractPreambleEntries,
  getAnchorFromHtml,
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
 * @param preambleContext The translated content of the preamble section, if available.
 * @returns A promise that resolves to a BatchValidationResult.
 */
export function validateBatch(
  originalContent: string,
  translatedContent: string,
  preambleContext?: string,
): BatchValidationResult {
  const errors: string[] = [];

  const originalSections = splitMarkdownIntoSections(originalContent);
  const translatedSections = splitMarkdownIntoSections(translatedContent);

  // 0. (New) Preamble-based Title Validation
  if (preambleContext) {
    const preambleSections = splitMarkdownIntoSections(preambleContext);
    if (preambleSections.length > 0) {
      const preambleToc = extractPreambleEntries(preambleSections[0]);
      const preambleTitleMap = new Map(preambleToc.map(entry => [entry.anchor, entry.title]));

      if (preambleTitleMap.size > 0) {
        for (const section of translatedSections) {
          // It's a heading with an anchor. Use getAnchorFromHtml to extract the clean anchor.
          if (section.depth > 1 && section.anchorOfTitle) { 
            const cleanAnchor = getAnchorFromHtml(section.anchorOfTitle);
            const expectedTitle = preambleTitleMap.get(`#${cleanAnchor}`);
            
            // If the anchor exists in the preamble's TOC, its title must match.
            if (expectedTitle && section.title !== expectedTitle) {
              errors.push(
                `Title consistency failed for "${section.title}". The preamble expects it to be "${expectedTitle}". Please correct it.`
              );
            }
          }
        }
      }
    }
  }

  // 1. 驗證標題數量
  if (originalSections.length !== translatedSections.length) {
    errors.push(
      `Section count mismatch. Original: ${originalSections.length}, Translated: ${translatedSections.length}.`,
    );
    // 如果章節數量嚴重不符，後續的逐一比對可能沒有意義，可以選擇提早返回
    return { isValid: false, errors };
  }

  for (const sourceSection of originalSections) {
    // 根據錨點和深度尋找對應的翻譯章節
    const targetSection = translatedSections.find(
      s => s.anchorOfTitle === sourceSection.anchorOfTitle && s.depth === sourceSection.depth
    );

    if (!targetSection) {
      // 如果找不到，可能是因為錨點被意外修改或刪除
      errors.push(`Missing translated section for: "${sourceSection.title}" (or anchor/level mismatch)`);
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
      // Case 1: Quantity mismatch
      if (inlineCodeResult.sourceCount !== inlineCodeResult.targetCount) {
        let errorMessage = `Validation failed in section "${sourceSection.title}": The number of inline code snippets in the original and translated text does not match. Please maintain the original inline code snippets and do not add more.\n`;

        const countOccurrences = (arr: (string | { content: string })[]) =>
          arr.reduce(
            (acc, val) => {
              const key = typeof val === 'string' ? val : val.content;
              acc.set(key, (acc.get(key) || 0) + 1);
              return acc;
            },
            new Map<string, number>(),
          );

        const sourceCounts = countOccurrences(
          inlineCodeResult.sourceSnippets || [],
        );
        const targetCounts = countOccurrences(
          inlineCodeResult.targetSnippets || [],
        );

        errorMessage += '  Inline code snippets in the original text:\n';
        sourceCounts.forEach((count, snippet) => {
          errorMessage += `    - ${snippet}  : Appears ${count} time(s)\n`;
        });

        errorMessage += '  Inline code snippets in your last translation:\n';
        targetCounts.forEach((count, snippet) => {
          errorMessage += `    - ${snippet}  : Appears ${count} time(s)\n`;
        });

        errors.push(errorMessage);
      }
      // Case 2: Content modification (counts are equal but content differs)
      else {
        const toHex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

        const sourceContents = new Set(inlineCodeResult.sourceSnippets?.map(s => s.content) || []);
        const targetContents = new Set(inlineCodeResult.targetSnippets?.map(t => t.content) || []);

        const missingInTarget =
          inlineCodeResult.sourceSnippets?.filter(
            s => !targetContents.has(s.content),
          ) || [];

        const addedInTarget =
          inlineCodeResult.targetSnippets?.filter(
            t => !sourceContents.has(t.content),
          ) || [];

        let errorMessage = `Validation failed in section "${sourceSection.title}": Inline code content has been modified, please do not modify any byte.\n`;

        errorMessage += '  Original inline code:\n';
        missingInTarget.forEach(s => {
          errorMessage += `    - ${s.content}  : (HEX : ${toHex(s.content)})\n`;
        });

        errorMessage += '\nTranslated inline code:\n';
        addedInTarget.forEach(t => {
          errorMessage += `    - ${t.content} : (HEX : ${toHex(t.content)})\n`;
        });

        errors.push(errorMessage);
      }
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
