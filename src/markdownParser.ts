
import { remark } from 'remark';
import gfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { Section } from './translator/Section';
import { Root } from 'mdast';

/**
 * Splits the Markdown content into a flat array of Section objects using a hybrid
 * of remark AST for heading detection and line-based parsing for anchor association,
 * ensuring compatibility with the original parser's behavior.
 * @param markdownContent The full text content of the Markdown file.
 * @returns A flat array of all Section objects found in the document.
 */
export function splitMarkdownIntoSections(markdownContent: string): Section[] {
  const lines = markdownContent.split('\n');
  const ast = remark().use(gfm).parse(markdownContent) as Root;
  const sections: Section[] = [];

  // 1. Use AST to find all headings to define initial boundaries.
  const boundaries: {startLine: number, depth: number, title: string, anchor: string}[] = [];
  visit(ast, 'heading', (node) => {
    if (!node.position) return;
    // Use positional data to extract the raw markdown source of the title, preserving all formatting.
    let title = '';
    if (node.children.length > 0) {
      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      if (firstChild.position && lastChild.position) {
        title = markdownContent.slice(firstChild.position.start.offset, lastChild.position.end.offset);
      }
    }
    boundaries.push({
      startLine: node.position.start.line,
      depth: node.depth,
      title,
      anchor: '',
    });
  });

  // 2. Re-implement the old anchor logic to ensure behavioral compatibility.
  // For each heading boundary, look 1-2 lines above for an anchor tag.
  for (const boundary of boundaries) {
    for (let j = 1; j <= 2; j++) {
      const checkLineNum = boundary.startLine - j;
      if (checkLineNum > 0) {
        const line = lines[checkLineNum - 1];
        const anchorMatch = line.match(/<a\s+name="[^"]*".*?>.*?<\/a>/);
        if (anchorMatch) {
          boundary.startLine = checkLineNum;
          boundary.anchor = anchorMatch[0];
          break;
        }
      }
    }
  }

  // 3. Handle content before the first heading (prologue).
  const firstBoundary = boundaries[0];
  if ((!firstBoundary || firstBoundary.startLine > 1) && markdownContent.trim() !== '') {
    const endLine = firstBoundary ? firstBoundary.startLine - 1 : lines.length;
    const content = lines.slice(0, endLine).join('\n').trim();
    if (content) {
      const prologue = new Section();
      prologue.depth = 0;
      prologue.startLine = 1;
      prologue.endLine = endLine;
      prologue.content = content;
      sections.push(prologue);
    }
  }

  // 4. Create Section objects from the now-corrected boundaries.
  boundaries.forEach((boundary, i) => {
    const nextBoundary = boundaries[i + 1];
    const section = new Section();
    section.title = boundary.title;
    section.depth = boundary.depth;
    section.startLine = boundary.startLine;
    section.anchorOfTitle = boundary.anchor;
    section.endLine = nextBoundary ? nextBoundary.startLine - 1 : lines.length;
    
    if (section.startLine <= section.endLine) {
      section.content = lines.slice(section.startLine - 1, section.endLine).join('\n');
    }
    sections.push(section);
  });

  // 5. Link parents and calculate totalLength (mimicking original parser passes).
  const parentStack: Section[] = [];
  for (const section of sections) {
    if (section.depth === 0) continue; // Prologue has no parent

    while (parentStack.length > 0 && section.depth <= parentStack[parentStack.length - 1].depth) {
      parentStack.pop();
    }
    if (parentStack.length > 0) {
      section.parent = parentStack[parentStack.length - 1];
    }
    parentStack.push(section);
  }

  for (let i = 0; i < sections.length; i++) {
    let currentTotal = 0;
    const currentSection = sections[i];
    currentTotal += currentSection.contentLength;

    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].depth <= currentSection.depth) {
        break;
      }
      currentTotal += sections[j].contentLength;
    }
    currentSection.totalLength = currentTotal;
  }

  return sections;
}
