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
      const section = new Section(title, depth, lineNum);
      section.parent = parent;
      sections.push(section);
      parentStack.push(section);
    }
  });

  // Pass 2: Adjust all startLines for anchors first.
  for (const section of sections) {
    for (let j = 1; j <= 2; j++) {
      const checkLineNum = section.startLine - j;
      if (checkLineNum > 0 && lines[checkLineNum - 1].includes('<a name=')) {
        section.startLine = checkLineNum;
        break;
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
      section.contentLength = Buffer.byteLength(section.content, 'utf8');
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
          const prologue = new Section('Prologue', 0, 1);
          prologue.endLine = end;
          prologue.content = content;
          prologue.contentLength = Buffer.byteLength(content, 'utf8');
          prologue.totalLength = prologue.contentLength; // Prologue has no children
          sections.unshift(prologue);
      }
  } else if (sections.length === 0 && markdownContent.trim().length > 0) {
    // 第 7 步：處理沒有標題的檔案，將其視為單一的序言章節。
    const content = markdownContent.trim();
    const prologue = new Section('Prologue', 0, 1);
    prologue.endLine = lines.length;
    prologue.content = content;
    prologue.contentLength = Buffer.byteLength(content, 'utf8');
    prologue.totalLength = prologue.contentLength;
    sections.push(prologue);
  }

  return sections;
}


