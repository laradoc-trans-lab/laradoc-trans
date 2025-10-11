import { remark } from 'remark';
import gfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { _ } from '../i18n';
import { Section } from '../translator/Section';
import { SectionError, CodeBlockMismatch, InlineCodeSnippet, CodeBlock, QuantityMismatch, ContentMismatch, HeadingCountResult, HeadingData } from './types';
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
  for (const marker of sourceMarkers) {
      if (!targetMarkerSet.has(marker)) {
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
  if (!preambleSection) return entries;

  const ast = remark().parse(preambleSection.content);
  const lines = preambleSection.content.split('\n');

  const visitNodes = (node: any, depth: number) => {
    if (node.type === 'list') {
      node.children.forEach((listItem: any) => {
        if (listItem.type !== 'listItem' || !listItem.position) return;

        let entry: Partial<PreambleEntry> = { depth };
        let nestedList: any = null;

        const line = lines[listItem.position.start.line - 1];
        const match = line.match(/\[(.*)\]\(#(.*)\)/);

        if (match && match[1] && match[2]) {
          entry.title = match[1];
          entry.anchor = `#${match[2]}`;
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