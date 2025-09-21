import { remark } from 'remark';
import type { Root, Content, Heading } from 'mdast';

const BATCH_SIZE_LIMIT = 10000; // 10K Bytes

/**
 * 定義解析後的子章節結構。
 */
export interface MarkdownSection {
  heading: string;
  content: string;
  nodes: Content[];
}

/**
 * 定義以 H2 為根的章節群組結構。
 */
export interface MarkdownH2Section {
  heading: string;
  subSections: MarkdownSection[];
}

/**
 * 將一組 AST 節點轉換回 Markdown 字串。
 */
function stringifyNodes(nodes: Content[]): string {
  if (nodes.length === 0) {
    return '';
  }
  const tree: Root = { type: 'root', children: nodes };
  return remark.stringify(tree).trim();
}

/**
 * 遞迴地將一個大章節根據標題層級或段落拆分成較小的區塊。
 */
function splitLargeSection(
  section: MarkdownSection,
  parentHeading: string,
  depth: number = 3
): MarkdownSection[] {
  // If we've recursed past H6 and still haven't found a suitable split point,
  // return the section as a single, potentially oversized chunk as per Rule 3.
  if (depth > 6) {
    return [section];
  }

  const subSections: MarkdownSection[] = [];
  let currentSubSectionNodes: Content[] = [];
  let subSectionHeading: string = section.heading;

  for (const node of section.nodes) {
    if (node.type === 'heading' && node.depth === depth) {
      if (currentSubSectionNodes.length > 0) {
        const newSection: MarkdownSection = {
          heading: subSectionHeading,
          content: stringifyNodes(currentSubSectionNodes),
          nodes: currentSubSectionNodes,
        };
        if (Buffer.byteLength(newSection.content, 'utf8') > BATCH_SIZE_LIMIT) {
          subSections.push(...splitLargeSection(newSection, parentHeading, depth + 1));
        } else {
          newSection.heading = `${parentHeading} > ${newSection.heading}`;
          subSections.push(newSection);
        }
      }
      currentSubSectionNodes = [node];
      subSectionHeading = (node as Heading).children.map((c: any) => c.value).join('');
    } else {
      currentSubSectionNodes.push(node);
    }
  }

  if (currentSubSectionNodes.length > 0) {
    const newSection: MarkdownSection = {
      heading: subSectionHeading,
      content: stringifyNodes(currentSubSectionNodes),
      nodes: currentSubSectionNodes,
    };
    if (Buffer.byteLength(newSection.content, 'utf8') > BATCH_SIZE_LIMIT) {
      subSections.push(...splitLargeSection(newSection, parentHeading, depth + 1));
    } else {
      newSection.heading = `${parentHeading} > ${newSection.heading}`;
      subSections.push(newSection);
    }
  }

  return subSections;
}

/**
 * 將 Markdown 文件解析成以 H2 為單位的結構化章節陣列。
 */
export function parseMarkdownIntoSections(markdownContent: string): MarkdownH2Section[] {
  const tree = remark.parse(markdownContent);
  const h2Sections: MarkdownH2Section[] = [];
  let currentH2Nodes: Content[] = [];
  let currentH2Heading: string = 'Prologue';

  function saveCurrentH2Section() {
    if (currentH2Nodes.length === 0) return;

    const finalSubSections: MarkdownSection[] = [];
    const content = stringifyNodes(currentH2Nodes);

    if (Buffer.byteLength(content, 'utf8') > BATCH_SIZE_LIMIT) {
      const nodesToSplit = currentH2Heading === 'Prologue' ? currentH2Nodes : currentH2Nodes.slice(1);
      const initialSubSection: MarkdownSection = {
        heading: currentH2Heading,
        content: stringifyNodes(nodesToSplit),
        nodes: nodesToSplit,
      };
      const splitSections = splitLargeSection(initialSubSection, currentH2Heading, 3);
      finalSubSections.push(...splitSections);
    } else {
      finalSubSections.push({
        heading: currentH2Heading,
        content: content,
        nodes: currentH2Nodes,
      });
    }

    h2Sections.push({
      heading: currentH2Heading,
      subSections: finalSubSections,
    });
  }

  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 2) {
      saveCurrentH2Section();
      currentH2Heading = node.children.map((c: any) => c.value).join('');
      currentH2Nodes = [node];
    } else {
      currentH2Nodes.push(node);
    }
  }

  saveCurrentH2Section();

  return h2Sections;
}
