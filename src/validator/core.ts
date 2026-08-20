import { remark } from 'remark';
import gfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { _ } from '../i18n';
import { Section } from '../translator/Section';
import { SectionError, CodeBlockMismatch, InlineCodeSnippet, CodeBlock, QuantityMismatch, ContentMismatch, HeadingCountResult, HeadingData, TocMismatch, TocValidationResult } from './types';
import  *  as debugKey from '../debugKey';

export function validateHeadingCount(sourceSections: Section[], targetSections: Section[]): HeadingCountResult {
  const sourceCount = sourceSections.length;
  const targetCount = targetSections.length;
  const isValid = sourceCount === targetCount;

  const headings: { source: HeadingData | null; target: HeadingData | null }[] = [];
  if (!isValid) {
    const maxCount = Math.max(sourceCount, targetCount);
    for (let i = 0; i < maxCount; i++) {
      const sourceSection = sourceSections[i];
      const targetSection = targetSections[i];

      headings.push({
        source: sourceSection ? { text: sourceSection.title, line: sourceSection.startLine, depth: sourceSection.depth } : null,
        target: targetSection ? { text: targetSection.title, line: targetSection.startLine, depth: targetSection.depth } : null,
      });
    }
  }

  return { isValid, sourceCount, targetCount, headings };
}

export const extractCodeBlocksFromMarkdown = (section: Section): CodeBlock[] => {
  const ast = remark().use(gfm).parse(section.content);
  const codeBlocks: CodeBlock[] = [];
  visit(ast, 'code', (node: any) => {
    if (node.lang && node.position) { // Only consider code blocks with a specified language and position
      codeBlocks.push({ lang: node.lang, content: node.value, startLine: section.startLine + node.position.start.line - 1 }); // Adjust for 0-based section content line numbers
    }
  });

  const targetSections = ['Reverb', 'Pusher Channels', 'Ably'];

  /*
  debugKey.execute("currentValidateFile" , "blade.md" , () =>{
    console.log(`DEBUG: Processing section "${section.title}"`);
    console.log('--- Section Content ---');
    console.log(section.content);
    console.log('--- Final codeBlocks ---');
    console.log(JSON.stringify(codeBlocks, null, 2));
    console.log('------------------------');
  });
  */
  return codeBlocks;
};

/**
 * 由 HTML CODE 提取錨點內容 
 * 
 * 返回錨點時會加上 例如 <a name="test"> , 返回 test
 * 
 * @param html
 * @returns 
 */
export function getAnchorFromHtml(html: string): string {
  const match = html.match(/<a[^>]*name=\"(.*?)\"[^>]*>/);
  return match ? `${match[1]}` : '';
}

/**
 * 驗證原始與翻譯後的 Markdown 內容中的程式碼區塊 (` ``` `) 是否相符。
 * - 驗證數量是否一致。
 * - 驗證內容與語言標籤是否未被變更。
 * @param sourceSection 原始 Section 物件。
 * @param targetSection 翻譯後 Section 物件。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateCodeBlocks(sourceSection: Section, targetSection: Section): SectionError['codeBlocks'] {
  const sourceBlocks = extractCodeBlocksFromMarkdown(sourceSection);
  const targetBlocks = extractCodeBlocksFromMarkdown(targetSection);
  const mismatches: CodeBlockMismatch[] = [];

  if (sourceBlocks.length !== targetBlocks.length) {
    const mismatch: QuantityMismatch = {
      type: 'Quantity mismatch',
      source: sourceBlocks,
      target: targetBlocks,
    };
    mismatches.push(mismatch);
  } else {
    for (let i = 0; i < sourceBlocks.length; i++) {
      if (sourceBlocks[i].content.trim() !== targetBlocks[i].content.trim() || sourceBlocks[i].lang !== targetBlocks[i].lang) {
        const mismatch: ContentMismatch = {
          type: 'Content mismatch',
          source: sourceBlocks[i],
          target: targetBlocks[i],
        };
        mismatches.push(mismatch);
      }
    }
  }
  return { isValid: mismatches.length === 0, total: sourceBlocks.length, mismatches };
}

const extractInlineCodeSnippets = (section: Section): InlineCodeSnippet[] => {
  const ast = remark().parse(section.content);
  const snippets: InlineCodeSnippet[] = [];
  visit(ast, 'inlineCode', (node: any) => {
    if (node.position) {
      snippets.push({
        content: `\`${node.value}\``,
        line: section.startLine + node.position.start.line - 1,
      });
    }
  });
  return snippets;
};

/**
 * 驗證原始與翻譯後的 Markdown 內容中的行內程式碼 (` `) 是否相符。
 * - 驗證數量是否一致。
 * - 驗證原始的行內程式碼是否都存在於翻譯後的內容中。
 * @param sourceSection 原始 Section 物件。
 * @param targetSection 翻譯後 Section 物件。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateInlineCode(sourceSection: Section, targetSection: Section): SectionError['inlineCode'] {
  const sourceSnippets = extractInlineCodeSnippets(sourceSection);
  const targetSnippets = extractInlineCodeSnippets(targetSection);
  const mismatches: InlineCodeSnippet[] = [];

  const targetSnippetSet = new Set(targetSnippets.map(s => s.content));
  for (const snippet of sourceSnippets) {
      if (!targetSnippetSet.has(snippet.content)) {
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
 * @param sourceSection 原始 Section 物件。
 * @param targetSection 翻譯後 Section 物件。
 * @returns 回傳一個包含驗證結果的物件。
 */
export function validateSpecialMarkers(sourceSection: Section, targetSection: Section): SectionError['specialMarkers'] {
  const markerRegex = /\[![A-Z_]+\]/g;
  const getMarkers = (content: string) => (content.match(markerRegex) || []);

  const sourceMarkers = getMarkers(sourceSection.content);
  const targetMarkers = getMarkers(targetSection.content);
  const mismatches: string[] = [];

  const targetMarkerSet = new Set(targetMarkers);
  const sourceMarkerSet = new Set(sourceMarkers);
  for (const marker of sourceMarkers) {
      if (!targetMarkerSet.has(marker)) {
          mismatches.push(marker);
      }
  }

  // 檢查是否有在 target 中但不在 source 中的標記
  for (const marker of targetMarkers) {
    if (!sourceMarkerSet.has(marker)) {
      mismatches.push(marker);
    }
  }
  
  const isValid = mismatches.length === 0 && sourceMarkers.length === targetMarkers.length;

  return { isValid, sourceCount: sourceMarkers.length, targetCount: targetMarkers.length, mismatches };
}

export interface PreambleEntry {
  anchor: string;
  title: string;
  depth: number;
}

/**
 * 將前言(序言)中的目錄索引轉換為 PreambleEntry[]
 * 
 * @param preambleSection 
 * @returns 
 */
export function extractPreambleEntries(preambleSection: Section): PreambleEntry[] {
  const entries: PreambleEntry[] = [];
  if (!preambleSection || !preambleSection.content) return entries;

  const ast = remark().parse(preambleSection.content);
  const lines = preambleSection.content.split('\n');

  const visitNodes = (node: any, depth: number) => {
    if (node.type === 'list') {
      node.children.forEach((listItem: any) => {
        if (listItem.type !== 'listItem' || !listItem.position) return;

        let entry: Partial<PreambleEntry> = { depth };
        let nestedList: any = null;

        const line = lines[listItem.position.start.line - 1];
        const match = line ? (line.match(/\[(.*?)\]\((#[^)]+)\)/) || line.match(/\[(.*)\]\(#(.*)\)/)) : null;

        if (match && match[1] && match[2]) {
          entry.title = match[1].trim();
          entry.anchor = match[2].startsWith('#') ? match[2].trim() : `#${match[2].trim()}`;
        } else {
          // Fallback: 檢查 listItem 中的 AST link 節點
          for (const child of (listItem.children || [])) {
            if (child.type === 'paragraph') {
              for (const pChild of (child.children || [])) {
                if (pChild.type === 'link' && pChild.url && pChild.url.startsWith('#')) {
                  let title = '';
                  if (pChild.children && pChild.children.length > 0) {
                    title = pChild.children.map((c: any) => c.value || '').join('');
                  }
                  if (title && pChild.url) {
                    entry.title = title.trim();
                    entry.anchor = pChild.url.trim();
                    break;
                  }
                }
              }
            }
          }
        }

        listItem.children.forEach((itemChild: any) => {
          if (itemChild.type === 'list') {
            nestedList = itemChild;
          }
        });

        if (entry.title && entry.anchor) {
          entries.push(entry as PreambleEntry);
        }

        if (nestedList) {
          visitNodes(nestedList, depth + 1);
        }
      });
    }
  };

  (ast.children || []).forEach(node => visitNodes(node, 1));
  return entries;
}

/**
 * 驗證原始與翻譯後的章節內容中的目錄 (TOC) 是否相符。
 * - 判斷是否為真 TOC 章節：只有當原文的 Section 中包含目錄樹狀清單時，才視為 TOC 章節並進行驗證。
 * - 驗證項目：
 *   1. TOC 項目是否存在、數量是否一致。
 *   2. 每個項目的樹狀層級 (depth) 是否與原文一致。
 *   3. 每個項目的錨點 (anchor) 是否與原文一致。
 *   4. 翻譯後的標題不可為空。
 * @param sourceSection 原始 Section 物件。
 * @param targetSection 翻譯後 Section 物件。
 * @returns 回傳包含驗證結果與錯誤訊息的 TocValidationResult 物件。
 */
export function validateToc(sourceSection: Section, targetSection: Section): TocValidationResult {
  const sourceEntries = extractPreambleEntries(sourceSection);
  const targetEntries = extractPreambleEntries(targetSection);
  const mismatches: TocMismatch[] = [];
  const errors: string[] = [];

  // 原文沒有任何 TOC 條目，表示此章節不是 TOC 章節，不需要進行 TOC 檢查
  if (sourceEntries.length === 0) {
    return {
      isValid: true,
      isToc: false,
      sourceCount: 0,
      targetCount: targetEntries.length,
      errors: [],
      mismatches: [],
    };
  }

  const isToc = true;

  // 1. 譯文完全遺漏 TOC 列表
  if (targetEntries.length === 0) {
    const errorMsg = `Validation failed in section "${sourceSection.title}": Table of Contents (TOC) is missing in translated text. The original contains ${sourceEntries.length} TOC items, but none were found.`;
    errors.push(errorMsg);
    mismatches.push({
      type: 'missing_toc',
      message: errorMsg,
    });
    return {
      isValid: false,
      isToc: true,
      sourceCount: sourceEntries.length,
      targetCount: 0,
      errors,
      mismatches,
    };
  }

  // 2. TOC 項目總數量不符
  if (sourceEntries.length !== targetEntries.length) {
    let errorMsg = `Validation failed in section "${sourceSection.title}": TOC item count mismatch. Original: ${sourceEntries.length}, Translated: ${targetEntries.length}.\n`;

    const targetAnchorSet = new Set(targetEntries.map(t => t.anchor));
    const sourceAnchorSet = new Set(sourceEntries.map(s => s.anchor));

    const missingInTarget = sourceEntries.filter(s => !targetAnchorSet.has(s.anchor));
    const extraInTarget = targetEntries.filter(t => !sourceAnchorSet.has(t.anchor));

    if (missingInTarget.length > 0) {
      errorMsg += '  Missing TOC items in translation:\n';
      missingInTarget.forEach(item => {
        errorMsg += `    - [${item.title}](${item.anchor})\n`;
      });
    }

    if (extraInTarget.length > 0) {
      errorMsg += '  Unexpected TOC items in translation:\n';
      extraInTarget.forEach(item => {
        errorMsg += `    - [${item.title}](${item.anchor})\n`;
      });
    }

    errors.push(errorMsg.trimEnd());
    mismatches.push({
      type: 'count_mismatch',
      message: errorMsg,
    });
  }

  // 3. 逐項比對：錨點 (Anchor)、樹狀深度 (Depth)、標題 (Title)
  const compareCount = Math.min(sourceEntries.length, targetEntries.length);
  for (let i = 0; i < compareCount; i++) {
    const sourceItem = sourceEntries[i];
    const targetItem = targetEntries[i];

    // 錨點比對：嚴禁修改錨點
    if (sourceItem.anchor !== targetItem.anchor) {
      const errorMsg = `Validation failed in section "${sourceSection.title}": TOC anchor mismatch at item ${i + 1}. Expected anchor "${sourceItem.anchor}" (for "${sourceItem.title}"), but got "${targetItem.anchor}" (for "${targetItem.title}"). Do not modify TOC anchors.`;
      errors.push(errorMsg);
      mismatches.push({
        type: 'anchor_mismatch',
        index: i,
        source: sourceItem,
        target: targetItem,
        message: errorMsg,
      });
    }

    // 樹狀層級 (Depth) 比對
    if (sourceItem.depth !== targetItem.depth) {
      const errorMsg = `Validation failed in section "${sourceSection.title}": TOC hierarchy depth mismatch for item ${i + 1} ("${targetItem.title}", ${targetItem.anchor}). Expected depth ${sourceItem.depth}, but got ${targetItem.depth}. Please preserve the nested list indentation structure.`;
      errors.push(errorMsg);
      mismatches.push({
        type: 'depth_mismatch',
        index: i,
        source: sourceItem,
        target: targetItem,
        message: errorMsg,
      });
    }

    // 標題非空檢查
    if (!targetItem.title || targetItem.title.trim() === '') {
      const errorMsg = `Validation failed in section "${sourceSection.title}": TOC title at item ${i + 1} for anchor "${targetItem.anchor}" is empty.`;
      errors.push(errorMsg);
      mismatches.push({
        type: 'empty_title',
        index: i,
        source: sourceItem,
        target: targetItem,
        message: errorMsg,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    isToc,
    sourceCount: sourceEntries.length,
    targetCount: targetEntries.length,
    errors,
    mismatches,
  };
}