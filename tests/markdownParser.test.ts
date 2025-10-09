import * as fs from 'fs';
import * as path from 'path';
import { splitMarkdownIntoSections } from '../src/markdownParser';
import { extractCodeBlocksFromMarkdown } from '../src/validator/core';

describe('Markdown Parser - AST Refactoring', () => {
  /**
   * This test verifies that the refactored markdown parser can correctly
   * split a complex file into sections and then reconstruct it.
   * The goal is to ensure no content is lost or misinterpreted during the process.
   */
  it('should reconstruct dusk.md by joining sections', () => {
    // 1. Read the original markdown file
    const filePath = path.join(__dirname, 'fixtures/validator/source/dusk.md');
    const originalContent = fs.readFileSync(filePath, 'utf-8');

    // 2. Convert the markdown into sections using the refactored function
    const sections = splitMarkdownIntoSections(originalContent);

    // 3. Reconstruct the markdown content from the sections
    // The content of each section starts at its heading (or anchor) and ends before the next one.
    // By joining the content of all sections, we should get back the original content.
    const reconstructedContent = sections.map(section => section.content).join('\n');

    // 4. Compare the reconstructed content with the original content.
    // This is a strict comparison to ensure high fidelity.
    expect(reconstructedContent).toEqual(originalContent);
  });

  /**
   * This test directly verifies that the original bug (empty shell code blocks)
   * is fixed after refactoring the section parser.
   */
  it('should not produce any shell code blocks with empty content from dusk.md', () => {
    const filePath = path.join(__dirname, 'fixtures/validator/source/dusk.md');
    const originalContent = fs.readFileSync(filePath, 'utf-8');

    const sections = splitMarkdownIntoSections(originalContent);

    let shellBlockCount = 0;
    for (const section of sections) {
      const codeBlocks = extractCodeBlocksFromMarkdown(section);
      const shellBlocks = codeBlocks.filter(block => block.lang === 'shell');
      
      if (shellBlocks.length > 0) {
        shellBlockCount += shellBlocks.length;
        for (const shellBlock of shellBlocks) {
          // Assert that the content of any found shell block is not an empty string.
          expect(shellBlock.content.trim()).not.toBe('');
        }
      }
    }

    // As a sanity check, ensure we actually tested some shell blocks.
    expect(shellBlockCount).toBeGreaterThan(0);
  });
});