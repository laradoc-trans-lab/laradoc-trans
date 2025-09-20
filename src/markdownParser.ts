import { remark } from 'remark';
import type { Root, Content } from 'mdast';

/**
 * 定義解析後的章節結構。
 */
export interface MarkdownSection {
  /**
   * 章節類型：'prologue' (前導內容) 或 'section' (一般章節)。
   */
  type: 'prologue' | 'section';
  /**
   * 章節的標題 (僅適用於 'section' 類型)。
   */
  heading?: string;
  /**
   * 章節的原始 Markdown 內容。
   */
  content: string;
  /**
   * 章節在原始 AST 中的節點。
   */
  nodes: Content[];
}

/**
 * 使用 remark 將 Markdown 文件解析成結構化的章節陣列。
 * @param markdownContent Markdown 文件的原始文字內容。
 * @returns 一個包含多個 MarkdownSection 物件的陣列。
 */
export function parseMarkdownIntoSections(markdownContent: string): MarkdownSection[] {
  const tree = remark.parse(markdownContent);
  const sections: MarkdownSection[] = [];
  let currentSectionNodes: Content[] = [];
  let firstHeadingFound = false;

  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 2) {
      if (!firstHeadingFound) {
        if (currentSectionNodes.length > 0) {
          sections.push({
            type: 'prologue',
            content: stringifyNodes(currentSectionNodes),
            nodes: currentSectionNodes,
          });
        }
        firstHeadingFound = true;
      } else {
        if (currentSectionNodes.length > 1) {
          const headingNode = currentSectionNodes[0] as any;
          sections.push({
            type: 'section',
            heading: headingNode.children.map((c: any) => c.value).join(''),
            content: stringifyNodes(currentSectionNodes),
            nodes: currentSectionNodes,
          });
        }
      }
      currentSectionNodes = [node];
    } else {
      currentSectionNodes.push(node);
    }
  }

  if (currentSectionNodes.length > 0) {
    if (!firstHeadingFound) {
      sections.push({
        type: 'prologue',
        content: stringifyNodes(currentSectionNodes),
        nodes: currentSectionNodes,
      });
    } else {
      const headingNode = currentSectionNodes[0] as any;
      sections.push({
        type: 'section',
        heading: headingNode.children.map((c: any) => c.value).join(''),
        content: stringifyNodes(currentSectionNodes),
        nodes: currentSectionNodes,
      });
    }
  }

  return sections;
}

/**
 * 將一組 AST 節點轉換回 Markdown 字串。
 * @param nodes 要轉換的 AST 節點陣列。
 * @returns 代表這些節點的 Markdown 字串。
 */
function stringifyNodes(nodes: Content[]): string {
  if (nodes.length === 0) {
    return '';
  }
  const tree: Root = {
    type: 'root',
    children: nodes as Content[],
  };
  return remark.stringify(tree).trim();
}
