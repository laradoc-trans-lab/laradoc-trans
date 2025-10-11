export interface HeadingNotFoundMismatch {
  type: 'heading_not_found';
  link: string;
}

export interface HeadingTitleMismatch {
  type: 'heading_title_mismatch';
  link: string;
  expected: string;
  actual: string;
}

export type HeadingMismatch = HeadingNotFoundMismatch | HeadingTitleMismatch;

export interface HeadingData {
  text: string;
  line: number;
  depth: number;
}

export interface HeadingCountResult {
  isValid: boolean;
  sourceCount: number;
  targetCount: number;
  headings: {
    source: HeadingData | null;
    target: HeadingData | null;
  }[];
}

export interface FileValidationResult {
  fileName: string;
  status: 'Validated' | 'Unverifiable' | 'Skipped';
  preamble: ValidationStatus & { totalHeadings?: number };
  headings: ValidationStatus & { missingCount: number; anchorMissingCount: number; mismatches: HeadingMismatch[] };
  headingCount: HeadingCountResult;
  codeBlocks: ValidationStatus;
  inlineCode: ValidationStatus;
  specialMarkers: ValidationStatus;
  sectionErrors: SectionError[];
}

export interface ValidationStatus {
  isValid: boolean;
  mismatches?: any[];
}

export interface InlineCodeSnippet {
  content: string;
  line: number;
}

export interface SectionError {
  title: string;
  startLine: number;
  codeBlocks: ValidationStatus & { total: number; mismatches: CodeBlockMismatch[] };
  inlineCode: ValidationStatus & { sourceCount: number; targetCount: number; mismatches: InlineCodeSnippet[]; sourceSnippets?: InlineCodeSnippet[]; targetSnippets?: InlineCodeSnippet[]; };
  specialMarkers: ValidationStatus & { sourceCount: number; targetCount: number; mismatches: string[] };
}

/**
 * 代表一個獨立、乾淨的程式碼區塊資料結構。
 */
export interface CodeBlock {
  /**
   * 程式碼語言標籤，例如 'php', 'blade'。
   */
  lang: string;
  /**
   * 程式碼的純文字內容。
   */
  content: string;
  /**
   * 此區塊在原始檔案中的起始行號。
   */
  startLine: number;
}

/**
 * 代表單一程式碼區塊的「內容」不匹配。
 */
export interface ContentMismatch {
  type: 'Content mismatch';
  /**
   * 原始的程式碼區塊物件。
   */
  source: CodeBlock;
  /**
   * 翻譯後的程式碼區塊物件。
   */
  target: CodeBlock;
}

/**
 * 代表程式碼區塊的「數量」不匹配。
 */
export interface QuantityMismatch {
  type: 'Quantity mismatch';
  /**
   * 原始檔案中所有的程式碼區塊【陣列】。
   */
  source: CodeBlock[];
  /**
   * 翻譯檔案中所有的程式碼區塊【陣列】。
   */
  target: CodeBlock[];
}

/**
 * CodeBlockMismatch 是一個可辨識聯合類型，
 * 它要嘛是內容不匹配 (ContentMismatch)，要嘛是數量不匹配 (QuantityMismatch)。
 */
export type CodeBlockMismatch = ContentMismatch | QuantityMismatch;
