import fs from 'fs/promises';
import path from 'path';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';

// --- Data Structures ---

interface CodeBlock {
  content: string;
  fullText: string;
  line: number;
}

interface MismatchedCodeBlockInfo {
  index: number;
  sourceLine: number;
}

interface ValidationResult {
  fileName: string;
  hasError: boolean;
  headingCount: { source: number; target: number; match: boolean };
  codeBlockCount: { source: number; target: number; match: boolean };
  admonitionCount: { source: number; target: number; match: boolean };
  mismatchedCodeBlocks: MismatchedCodeBlockInfo[];
  mismatchedAdmonitions: number[];
}

// --- Main Validation Orchestrator ---

export async function validateAllFiles(sourceDir: string, targetDir: string, reportDir: string) {
  await fs.rm(reportDir, { recursive: true, force: true });
  await fs.mkdir(path.join(reportDir, 'details'), { recursive: true });

  const filesToValidate = (await fs.readdir(targetDir)).filter(f => f.endsWith('.md'));
  const allResults: ValidationResult[] = [];

  for (const fileName of filesToValidate) {
    console.log(`Validating ${fileName}...`);
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);

    try {
      const result = await validateFile(sourcePath, targetPath);
      allResults.push(result);

      if (result.hasError) {
        await generateDetailedReport(result, sourceDir, targetDir, reportDir);
      }
    } catch (error) {
      console.error(`Could not validate ${fileName}. Error: ${error}`);
    }
  }

  await generateSummaryReport(allResults, reportDir);
  console.log(`Validation complete. Report generated at ${reportDir}`);
}

// --- Single File Validation ---

async function validateFile(sourcePath: string, targetPath: string): Promise<ValidationResult> {
  const sourceContent = await fs.readFile(sourcePath, 'utf-8');
  const targetContent = await fs.readFile(targetPath, 'utf-8');

  const sourceTree = remark.parse(sourceContent);
  const targetTree = remark.parse(targetContent);

  const sourceHeadings = countHeadings(sourceTree);
  const targetHeadings = countHeadings(targetTree);

  const sourceCodeBlocks = getCodeBlocks(sourceTree, sourceContent);
  const targetCodeBlocks = getCodeBlocks(targetTree, targetContent);

  const sourceAdmonitions = getAdmonitions(sourceTree);
  const targetAdmonitions = getAdmonitions(targetTree);

  const mismatchedCodeBlocks: MismatchedCodeBlockInfo[] = [];
  if (sourceCodeBlocks.length === targetCodeBlocks.length) {
    for (let i = 0; i < sourceCodeBlocks.length; i++) {
      if (sourceCodeBlocks[i].content !== targetCodeBlocks[i].content) {
        mismatchedCodeBlocks.push({ index: i, sourceLine: sourceCodeBlocks[i].line });
      }
    }
  }

  const mismatchedAdmonitions: number[] = [];
  if (sourceAdmonitions.length === targetAdmonitions.length) {
    for (let i = 0; i < sourceAdmonitions.length; i++) {
      if (sourceAdmonitions[i] !== targetAdmonitions[i]) {
        mismatchedAdmonitions.push(i + 1);
      }
    }
  }

  const headingMatch = sourceHeadings === targetHeadings;
  const codeBlockCountMatch = sourceCodeBlocks.length === targetCodeBlocks.length;
  const admonitionCountMatch = sourceAdmonitions.length === targetAdmonitions.length;
  const codeBlockContentMatch = mismatchedCodeBlocks.length === 0;
  const admonitionContentMatch = mismatchedAdmonitions.length === 0;

  const hasError = !(
    headingMatch &&
    codeBlockCountMatch &&
    admonitionCountMatch &&
    codeBlockContentMatch &&
    admonitionContentMatch
  );

  return {
    fileName: path.basename(sourcePath),
    hasError,
    headingCount: { source: sourceHeadings, target: targetHeadings, match: headingMatch },
    codeBlockCount: { source: sourceCodeBlocks.length, target: targetCodeBlocks.length, match: codeBlockCountMatch },
    admonitionCount: { source: sourceAdmonitions.length, target: targetAdmonitions.length, match: admonitionCountMatch },
    mismatchedCodeBlocks,
    mismatchedAdmonitions,
  };
}

// --- Report Generation ---

async function generateSummaryReport(results: ValidationResult[], reportDir: string) {
  const FILE_COL_WIDTH = 27;
  const COUNT_COL_WIDTH = 3;

  const pad = (str: string, width: number) => str.padEnd(width);
  const padNum = (num: number, width: number) => num.toString().padEnd(width);

  let summary = '# Validation Summary\n\n';

  // --- Heading Validation ---
  summary += '## Heading Validation Summary\n\n';
  summary += `| ${pad('File', FILE_COL_WIDTH)} | ${pad('Src', COUNT_COL_WIDTH)} | ${pad('Tgt', COUNT_COL_WIDTH)} | Match |\n`;
  summary += `|:${'- '.repeat(FILE_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:---:|
`;
  for (const result of results) {
    summary += `| ${pad(result.fileName, FILE_COL_WIDTH)} | ${padNum(result.headingCount.source, COUNT_COL_WIDTH)} | ${padNum(result.headingCount.target, COUNT_COL_WIDTH)} | ${result.headingCount.match ? '✅' : '❌'}    |\n`;
  }

  // --- Code Block Validation ---
  summary += '\n## Code Block Validation Summary\n\n';
  summary += `| ${pad('File', FILE_COL_WIDTH)} | ${pad('Src', COUNT_COL_WIDTH)} | ${pad('Tgt', COUNT_COL_WIDTH)} | Match | Mismatches |\n`;
  summary += `|:${'- '.repeat(FILE_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:---:|:---:|
`;
  for (const result of results) {
    summary += `| ${pad(result.fileName, FILE_COL_WIDTH)} | ${padNum(result.codeBlockCount.source, COUNT_COL_WIDTH)} | ${padNum(result.codeBlockCount.target, COUNT_COL_WIDTH)} | ${result.codeBlockCount.match ? '✅' : '❌'}     | ${result.mismatchedCodeBlocks.length.toString().padEnd(10)} |\n`;
  }

  // --- Admonition Validation ---
  summary += '\n## Admonition Block Validation Summary\n\n';
  summary += `| ${pad('File', FILE_COL_WIDTH)} | ${pad('Src', COUNT_COL_WIDTH)} | ${pad('Tgt', COUNT_COL_WIDTH)} | Match | Mismatches |\n`;
  summary += `|:${'- '.repeat(FILE_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:${'- '.repeat(COUNT_COL_WIDTH / 2)}|:---:|:---:|
`;
  for (const result of results) {
    summary += `| ${pad(result.fileName, FILE_COL_WIDTH)} | ${padNum(result.admonitionCount.source, COUNT_COL_WIDTH)} | ${padNum(result.admonitionCount.target, COUNT_COL_WIDTH)} | ${result.admonitionCount.match ? '✅' : '❌'}     | ${result.mismatchedAdmonitions.length.toString().padEnd(10)} |\n`;
  }

  await fs.writeFile(path.join(reportDir, 'SUMMARY.md'), summary);
}

async function generateDetailedReport(result: ValidationResult, sourceDir: string, targetDir: string, reportDir: string) {
  const detailReportPath = path.join(reportDir, 'details', result.fileName);
  let report = `# Validation Report for: ${result.fileName}\n\n`;
  const issues: string[] = [];

  if (!result.headingCount.match) {
    issues.push(`### ❌ ISSUE: Heading Count Mismatch\n- Source file has **${result.headingCount.source}** headings.\n- Target file has **${result.headingCount.target}** headings.`);
  }

  if (!result.codeBlockCount.match) {
    issues.push(`### ❌ ISSUE: Code Block Count Mismatch\n- Source file has **${result.codeBlockCount.source}** code blocks.\n- Target file has **${result.codeBlockCount.target}** code blocks.`);
  }

  if (result.mismatchedCodeBlocks.length > 0) {
    const sourceContent = await fs.readFile(path.join(sourceDir, result.fileName), 'utf-8');
    const targetContent = await fs.readFile(path.join(targetDir, result.fileName), 'utf-8');
    const sourceBlocks = getCodeBlocks(remark.parse(sourceContent), sourceContent);
    const targetBlocks = getCodeBlocks(remark.parse(targetContent), targetContent);

    for (const mismatchInfo of result.mismatchedCodeBlocks) {
      const i = mismatchInfo.index;
      const line = mismatchInfo.sourceLine;
      let issue = `### ❌ ISSUE: Code Block Content Mismatch (at line ~${line})\n\n`;
      issue += `**--- ORIGINAL ---**\n${sourceBlocks[i].fullText}\n\n`;
      issue += `**--- TRANSLATED (Mismatch) ---**\n${targetBlocks[i].fullText}\n\n`;
      issues.push(issue);
    }
  }

  if (result.mismatchedAdmonitions.length > 0) {
    issues.push(`### ❌ ISSUE: Admonition Mismatches Found\n- Indices of mismatched admonitions: ${result.mismatchedAdmonitions.join(', ')}`);
  }

  report += `Found ${issues.length} issues.\n\n---\n\n` + issues.join('\n\n---\n\n');

  await fs.writeFile(detailReportPath, report);
}

// --- Helper Functions for Validation ---

function countHeadings(tree: Root): number {
  let count = 0;
  visit(tree, 'heading', () => {
    count++;
  });
  return count;
}

function getCodeBlocks(tree: Root, sourceContent: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  visit(tree, 'code', (node) => {
    if (node.position) {
      const fullText = sourceContent.slice(node.position.start.offset, node.position.end.offset);
      blocks.push({
        content: node.value,
        fullText: fullText,
        line: node.position.start.line,
      });
    }
  });
  return blocks;
}

function getAdmonitions(tree: Root): string[] {
  const admonitions: string[] = [];
  const admonitionRegex = /^\[![\w ]+\]/;

  visit(tree, 'text', (node) => {
    if (admonitionRegex.test(node.value)) {
      admonitions.push(node.value);
    }
  });

  return admonitions;
}