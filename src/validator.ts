import fs from 'fs/promises';
import path from 'path';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import type { Root, Heading, Text, HTML } from 'mdast';

// --- Data Structures ---

interface HeadingInfo {
  text: string;
  depth: number;
  anchor?: string;
}

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
  headingDetails: {
    source: HeadingInfo[];
    target: HeadingInfo[];
  };
}

// --- Helper to stringify a node's content ---
function stringifyNode(node: any): string {
  if ('children' in node) {
    return (node.children as any[]).map(stringifyNode).join('');
  }
  if ('value' in node) {
    return node.value;
  }
  return '';
}

// --- AST Parsing Helpers ---

function getHeadingsWithAnchors(tree: Root): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  visit(tree, 'heading', (node: Heading) => {
    const text = stringifyNode(node).trim();
    let anchor: string | undefined = undefined;

    // Find anchor in the text, e.g., {#some-id}
    const anchorMatch = text.match(/\{#([\w-]+)\}/);
    if (anchorMatch) {
      anchor = anchorMatch[1];
    }

    headings.push({
      text: text.replace(/\{#[\w-]+\}$/, '').trim(), // Cleaned text
      depth: node.depth,
      anchor: anchor,
    });
  });
  return headings;
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

  const sourceHeadings = getHeadingsWithAnchors(sourceTree);
  const targetHeadings = getHeadingsWithAnchors(targetTree);

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

  const headingMatch = sourceHeadings.length === targetHeadings.length;
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
    headingCount: { source: sourceHeadings.length, target: targetHeadings.length, match: headingMatch },
    codeBlockCount: { source: sourceCodeBlocks.length, target: targetCodeBlocks.length, match: codeBlockCountMatch },
    admonitionCount: { source: sourceAdmonitions.length, target: targetAdmonitions.length, match: admonitionCountMatch },
    mismatchedCodeBlocks,
    mismatchedAdmonitions,
    headingDetails: { source: sourceHeadings, target: targetHeadings },
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
    let issue = `### ❌ ISSUE: Heading Count Mismatch\n- Source file has **${result.headingCount.source}** headings.\n- Target file has **${result.headingCount.target}** headings.`;

    const sourceHeadings = result.headingDetails.source;
    const targetHeadings = result.headingDetails.target;

    // Pass 1: Match by anchor
    const sourceAnchors = new Map(sourceHeadings.filter(h => h.anchor).map(h => [h.anchor, h]));
    const targetAnchors = new Map(targetHeadings.filter(h => h.anchor).map(h => [h.anchor, h]));
    
    const matchedSourceHeadings = new Set<HeadingInfo>();
    const matchedTargetHeadings = new Set<HeadingInfo>();

    for (const [anchor, sourceHeading] of sourceAnchors) {
      if (targetAnchors.has(anchor)) {
        matchedSourceHeadings.add(sourceHeading);
        matchedTargetHeadings.add(targetAnchors.get(anchor)!);
      }
    }

    // Pass 2: Sequential match for remaining headings
    const remainingSource = sourceHeadings.filter(h => !matchedSourceHeadings.has(h));
    const remainingTarget = targetHeadings.filter(h => !matchedTargetHeadings.has(h));

    let i = 0, j = 0;
    while (i < remainingSource.length && j < remainingTarget.length) {
      // Simple sequential comparison. A more advanced diff algorithm could be used here.
      // This assumes the relative order of non-anchored headings is preserved.
      if (remainingSource[i].depth === remainingTarget[j].depth) {
        matchedSourceHeadings.add(remainingSource[i]);
        matchedTargetHeadings.add(remainingTarget[j]);
        i++;
        j++;
      } else if (remainingSource[i].depth < remainingTarget[j].depth) {
        i++; // Assume source has an extra heading
      } else {
        j++; // Assume target has an extra heading
      }
    }

    const missingHeadings = sourceHeadings.filter(h => !matchedSourceHeadings.has(h));
    const extraHeadings = targetHeadings.filter(h => !matchedTargetHeadings.has(h));

    if (missingHeadings.length > 0) {
      issue += `\n\n#### Missing Headings in Target File:\n`;
      issue += missingHeadings.map(h => `- \`H${h.depth}: ${h.text}\``).join('\n');
    }

    if (extraHeadings.length > 0) {
      issue += `\n\n#### Extra Headings in Target File:\n`;
      issue += extraHeadings.map(h => `- \`H${h.depth}: ${h.text}\``).join('\n');
    }
    
    issues.push(issue);
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

// --- Batch Validation for In-Memory Content ---

/**
 * The result of a batch validation.
 */
export interface BatchValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a batch of markdown content in memory.
 * @param originalContent The original markdown content.
 * @param translatedContent The translated markdown content.
 * @returns A promise that resolves to a BatchValidationResult.
 */
export function validateBatch(
  originalContent: string,
  translatedContent: string,
): BatchValidationResult {
  const errors: string[] = [];

  const originalTree = remark.parse(originalContent);
  const translatedTree = remark.parse(translatedContent);

  // 1. 驗證標題 (數量與錨點)
  const originalHeadings = getHeadingsWithAnchors(originalTree);
  const translatedHeadings = getHeadingsWithAnchors(translatedTree);

  // 基礎檢查：比對標題總數
  if (originalHeadings.length !== translatedHeadings.length) {
    errors.push(
      `Heading count mismatch. Original: ${originalHeadings.length}, Translated: ${translatedHeadings.length}.`,
    );
  }

  // 進階檢查：比對錨點集合，以防止「一增一減」的錯誤
  const originalAnchors = new Set(originalHeadings.map(h => h.anchor).filter(Boolean));
  const translatedAnchors = new Set(translatedHeadings.map(h => h.anchor).filter(Boolean));

  // 找出譯文中遺漏的錨點
  const missingAnchors = [...originalAnchors].filter(a => !translatedAnchors.has(a));
  if (missingAnchors.length > 0) {
    errors.push(`Missing heading anchors in translation: ${missingAnchors.join(', ')}.`);
  }

  // 找出譯文中多出的錨點
  const extraAnchors = [...translatedAnchors].filter(a => !originalAnchors.has(a));
  if (extraAnchors.length > 0) {
    errors.push(`Extra heading anchors in translation: ${extraAnchors.join(', ')}.`);
  }

  // 2. 驗證程式碼區塊 (數量與內容)
  const originalCodeBlocks = getCodeBlocks(originalTree, originalContent);
  const translatedCodeBlocks = getCodeBlocks(translatedTree, translatedContent);

  if (originalCodeBlocks.length !== translatedCodeBlocks.length) {
    errors.push(
      `Code block count mismatch. Original: ${originalCodeBlocks.length}, Translated: ${translatedCodeBlocks.length}.`,
    );
  } else {
    originalCodeBlocks.forEach((originalBlock, i) => {
      if (originalBlock.content !== translatedCodeBlocks[i].content) {
        errors.push(
          `Code block content mismatch at block index ${i}. The code inside the triple backticks should not be translated or altered.`,
        );
      }
    });
  }

  // 3. Validate Admonition Count and Content
  const originalAdmonitions = getAdmonitions(originalTree);
  const translatedAdmonitions = getAdmonitions(translatedTree);

  if (originalAdmonitions.length !== translatedAdmonitions.length) {
    errors.push(
      `Admonition count mismatch. Original: ${originalAdmonitions.length}, Translated: ${translatedAdmonitions.length}.`,
    );
  } else {
    originalAdmonitions.forEach((originalAdmonition, i) => {
      if (originalAdmonition !== translatedAdmonitions[i]) {
        errors.push(
          `Admonition tag mismatch at index ${i}. Original: "${originalAdmonition}", Translated: "${translatedAdmonitions[i]}". These special tags must remain identical.`,
        );
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
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
  const admonitionRegex = /^\[!([A-Z_]+)\]/m;

  visit(tree, 'text', (node) => {
    const match = node.value.match(admonitionRegex);
    if (match) {
      admonitions.push(match[0]); // Push only the tag, e.g., "[!NOTE]"
    }
  });

  return admonitions;
}