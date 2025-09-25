import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';
import {
  validateCodeBlocks,
  validateSpecialMarkers,
  validateInlineCode,
} from '../validator/core';

// --- Data Structures ---

interface HeadingInfo {
  text: string;
  depth: number;
  anchor?: string;
}

interface CodeBlock {
  content: string;
  fullText: string;
  line: number;
}

// --- Helper to stringify a node's content ---
function stringifyNode(node: any): string {
  if ('children' in node) {
    return (node.children as any[]).map(stringifyNode).join('');
  }
  if ('value' in node) {
    return node.value;
  }
  return '';
}

// --- AST Parsing Helpers ---

function getHeadingsWithAnchors(tree: Root): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  visit(tree, 'heading', (node: Heading) => {
    const text = stringifyNode(node).trim();
    let anchor: string | undefined = undefined;

    // Find anchor in the text, e.g., {#some-id}
    const anchorMatch = text.match(/\{#([\w-]+)\}/);
    if (anchorMatch) {
      anchor = anchorMatch[1];
    }

    headings.push({
      text: text.replace(/\{#[\w-]+\}$/, '').trim(), // Cleaned text
      depth: node.depth,
      anchor: anchor,
    });
  });
  return headings;
}


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

  const originalTree = remark.parse(originalContent);
  const translatedTree = remark.parse(translatedContent);

  // 1. 驗證標題 (數量與錨點)
  const originalHeadings = getHeadingsWithAnchors(originalTree);
  const translatedHeadings = getHeadingsWithAnchors(translatedTree);

  // 基礎檢查：比對標題總數
  if (originalHeadings.length !== translatedHeadings.length) {
    errors.push(
      `Heading count mismatch. Original: ${originalHeadings.length}, Translated: ${translatedHeadings.length}.`,
    );
  }

  // 進階檢查：比對錨點集合，以防止「一增一減」的錯誤
  const originalAnchors = new Set(originalHeadings.map(h => h.anchor).filter(Boolean));
  const translatedAnchors = new Set(translatedHeadings.map(h => h.anchor).filter(Boolean));

  // 找出譯文中遺漏的錨點
  const missingAnchors = [...originalAnchors].filter(a => !translatedAnchors.has(a));
  if (missingAnchors.length > 0) {
    errors.push(`Missing heading anchors in translation: ${missingAnchors.join(', ')}.`);
  }

  // 找出譯文中多出的錨點
  const extraAnchors = [...translatedAnchors].filter(a => !originalAnchors.has(a));
  if (extraAnchors.length > 0) {
    errors.push(`Extra heading anchors in translation: ${extraAnchors.join(', ')}.`);
  }

  // 2. 驗證程式碼區塊 (數量與內容)
  const codeBlockResult = validateCodeBlocks(originalContent, translatedContent, 1, 1);
  if (!codeBlockResult.isValid) {
    if (codeBlockResult.mismatches.some(m => m.type.includes('Quantity'))) {
        const originalCount = codeBlockResult.total;
        const targetCount = codeBlockResult.total - codeBlockResult.mismatches.length;
        errors.push(
            `Code block count mismatch. Original: ${originalCount}, Translated: ${targetCount}.`
        );
    } else {
        codeBlockResult.mismatches.forEach((mismatch, i) => {
            errors.push(
                `Code block content mismatch at block index ${i}. The code inside the triple backticks should not be translated or altered.`,
            );
        });
    }
  }

  // 3. 驗證行內程式碼
  const inlineCodeResult = validateInlineCode(originalContent, translatedContent);
  if (!inlineCodeResult.isValid) {
    errors.push(
        `Inline code mismatch. The following snippets are missing or were altered: ${inlineCodeResult.mismatches.join(', ')}. Content inside backticks should not be translated.`
    );
  }

  // 4. Validate Admonition Count and Content
  const specialMarkersResult = validateSpecialMarkers(originalContent, translatedContent);
  if (!specialMarkersResult.isValid) {
    if (specialMarkersResult.sourceCount !== specialMarkersResult.targetCount) {
        errors.push(
            `Admonition count mismatch. Original: ${specialMarkersResult.sourceCount}, Translated: ${specialMarkersResult.targetCount}.`,
        );
    } else {
        errors.push(
            `Admonition tag mismatch. The following original tags are missing or were altered: ${specialMarkersResult.mismatches.join(', ')}. These special tags must remain identical.`,
        );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

