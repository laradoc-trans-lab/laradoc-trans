import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import { _ } from '../i18n';
import { SectionError, CodeBlockMismatch } from './types';

const extractCodeBlocksFromMarkdown = (markdownContent: string, sectionStartLine: number) => {
  const ast = remark().parse(markdownContent);
  const codeBlocks: { lang: string; content: string; startLine: number }[] = [];
  visit(ast, 'code', (node: any) => {
    if (node.lang && node.position) { // Only consider code blocks with a specified language and position
      codeBlocks.push({ lang: node.lang, content: node.value, startLine: sectionStartLine + node.position.start.line - 1 }); // Adjust for 0-based section content line numbers
    }
  });
  return codeBlocks;
};

/**
 * 驗證原始與翻譯後的 Markdown 內容中的程式碼區塊 (` ``` `) 是否相符。
 * - 驗證數量是否一致。
 * - 驗證內容與語言標籤是否未被變更。
 * @param sourceContent 原始 Markdown 內容。
 * @param targetContent 翻譯後 Markdown 內容。
 * @param sourceStartLine 原始內容在檔案中的起始行號，用於計算絕對行號。
 * @param targetStartLine 翻譯內容在檔案中的起始行號，用於計算絕對行號。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateCodeBlocks(sourceContent: string, targetContent: string, sourceStartLine: number, targetStartLine: number): SectionError['codeBlocks'] {
  const sourceBlocks = extractCodeBlocksFromMarkdown(sourceContent, sourceStartLine);
  const targetBlocks = extractCodeBlocksFromMarkdown(targetContent, targetStartLine);
  const mismatches: CodeBlockMismatch[] = [];

  if (sourceBlocks.length !== targetBlocks.length) {
    mismatches.push({
      type: _('Quantity mismatch'),
      lang: '',
      source: _('Original has {{count}} blocks', { count: sourceBlocks.length }),
      target: _('Translated has only {{count}} blocks', { count: targetBlocks.length })
    });
  } else {
    for (let i = 0; i < sourceBlocks.length; i++) {
      if (sourceBlocks[i].content.trim() !== targetBlocks[i].content.trim() || sourceBlocks[i].lang !== targetBlocks[i].lang) {
        mismatches.push({
          type: _('Content mismatch'),
          lang: sourceBlocks[i].lang,
          source: sourceBlocks[i].content,
          target: targetBlocks[i].content,
          sourceStartLine: sourceBlocks[i].startLine,
          targetStartLine: targetBlocks[i].startLine,
        });
      }
    }
  }
  return { isValid: mismatches.length === 0, total: sourceBlocks.length, mismatches };
}

/**
 * 驗證原始與翻譯後的 Markdown 內容中的行內程式碼 (` `) 是否相符。
 * - 驗證數量是否一致。
 * - 驗證原始的行內程式碼是否都存在於翻譯後的內容中。
 * @param sourceContent 原始 Markdown 內容。
 * @param targetContent 翻譯後 Markdown 內容。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateInlineCode(sourceContent: string, targetContent: string): SectionError['inlineCode'] {
  const inlineCodeRegex = /`([^`].*?)`/g;
  const getSnippets = (content: string) => (content.match(inlineCodeRegex) || []);

  const sourceSnippets = getSnippets(sourceContent);
  const targetSnippets = getSnippets(targetContent);
  const mismatches: string[] = [];

  const targetSnippetSet = new Set(targetSnippets);
  for (const snippet of sourceSnippets) {
      if (!targetSnippetSet.has(snippet)) {
          mismatches.push(snippet);
      }
  }

  const isValid = mismatches.length === 0 && sourceSnippets.length === targetSnippets.length;

  return { isValid, sourceCount: sourceSnippets.length, targetCount: targetSnippets.length, mismatches, sourceSnippets, targetSnippets };
}

/**
 * 驗證原始與翻譯後的 Markdown 內容中的提示區塊標記 (如 `[!NOTE]`) 是否相符。
 * - 驗證數量是否一致。
 * - 驗證原始的標記是否都存在於翻譯後的內容中。
 * @param sourceContent 原始 Markdown 內容。
 * @param targetContent 翻譯後 Markdown 內容。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateSpecialMarkers(sourceContent: string, targetContent: string): SectionError['specialMarkers'] {
  const markerRegex = /<!\[A-Z_]+\]/g;
  const getMarkers = (content: string) => (content.match(markerRegex) || []);

  const sourceMarkers = getMarkers(sourceContent);
  const targetMarkers = getMarkers(targetContent);
  const mismatches: string[] = [];

  const targetMarkerSet = new Set(targetMarkers);
  for (const marker of sourceMarkers) {
      if (!targetMarkerSet.has(marker)) {
          mismatches.push(marker);
      }
  }
  
  const isValid = mismatches.length === 0 && sourceMarkers.length === targetMarkers.length;

  return { isValid, sourceCount: sourceMarkers.length, targetCount: targetMarkers.length, mismatches };
}