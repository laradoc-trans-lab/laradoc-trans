import { Buffer } from 'buffer';
import { Section } from './translator/Section';

const BATCH_SIZE_LIMIT = 10000; // 10K Bytes

/**
 * Splits the Markdown content into a flat array of Section objects,
 * with `parent` properties linking them and `totalLength` calculated.
 * @param markdownContent The full text content of the Markdown file.
 * @returns A flat array of all Section objects found in the document.
 */
export function splitMarkdownIntoSections(markdownContent: string): Section[] {
  const lines = markdownContent.split('\n');
  const sections: Section[] = [];
  const parentStack: Section[] = [];

  // Pass 1: Find all headings, create Section objects, and link parents.
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const match = line.match(/^(#{1,6})\s+(.*)/);

    if (match) {
      const depth = match[1].length;
      const title = match[2].trim();

      while (parentStack.length > 0 && depth <= parentStack[parentStack.length - 1].depth) {
        parentStack.pop();
      }

      const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
      const section = new Section();
      section.title = title;
      section.depth = depth;
      section.startLine = lineNum;
      sections.push(section);
      parentStack.push(section);
    }
  });

  // Pass 2: Adjust all startLines for anchors first.
  for (const section of sections) {
    for (let j = 1; j <= 2; j++) {
      const checkLineNum = section.startLine - j;
      if (checkLineNum > 0) {
        const line = lines[checkLineNum - 1];
        // 捕獲完整的錨點標籤，例如 <a name="test"></a>
        const anchorMatch = line.match(/<a\s+name="[^"]*".*?>.*?<\/a>/);
        if (anchorMatch) {
          section.startLine = checkLineNum;
          // anchorMatch[0] 包含整個匹配的字串
          section.anchorOfTitle = anchorMatch[0];
          break;
        }
      }
    }
  }

  // Pass 3: Now that all startLines are final, calculate all endLines.
  for (let i = 0; i < sections.length; i++) {
    const nextSection = sections[i + 1];
    sections[i].endLine = nextSection ? nextSection.startLine - 1 : lines.length;
  }

  // Pass 4: Extract content and calculate contentLength for each section.
  for (const section of sections) {
    if (section.startLine <= section.endLine) {
      const contentLines = lines.slice(section.startLine - 1, section.endLine);
      section.content = contentLines.join('\n');
    }
  }

  // Pass 5: Calculate totalLength for each logical block.
  // totalLength is the sum of contentLengths from this section until the next section of the same or higher depth.
  for (let i = 0; i < sections.length; i++) {
    let currentTotal = 0;
    const currentSection = sections[i];
    currentTotal += currentSection.contentLength;

    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].depth <= currentSection.depth) {
        break; // Found a section of same or higher depth, this block ends.
      }
      currentTotal += sections[j].contentLength;
    }
    currentSection.totalLength = currentTotal;
  }

  // Pass 6: Add a "Prologue" for content before the first heading.
  if (sections.length > 0 && sections[0].startLine > 1) {
      const end = sections[0].startLine - 1;
      const content = lines.slice(0, end).join('\n').trim();
      if (content) {
          const prologue = new Section();
          prologue.depth = 0;
          prologue.content = content
          prologue.startLine = 1;
          prologue.endLine = end;
          prologue.content = content;
          prologue.totalLength = prologue.contentLength; // Prologue has no children
          sections.unshift(prologue);
      }
  } else if (sections.length === 0 && markdownContent.trim().length > 0) {
    // 第 7 步：處理沒有標題的檔案，將其視為單一的序言章節。
    const content = markdownContent.trim();
    const prologue = new Section();
    prologue.depth = 0;
    prologue.startLine = 1;
    prologue.endLine = lines.length;
    prologue.content = content;
    prologue.totalLength = prologue.contentLength;
    sections.push(prologue);
  }

  return sections;
}


