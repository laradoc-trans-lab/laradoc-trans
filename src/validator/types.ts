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

export interface FileValidationResult {
  fileName: string;
  status: 'Validated' | 'Unverifiable' | 'Skipped';
  preamble: ValidationStatus & { totalHeadings?: number };
  headings: ValidationStatus & { missingCount: number; anchorMissingCount: number; mismatches: HeadingMismatch[] };
  codeBlocks: ValidationStatus;
  inlineCode: ValidationStatus;
  specialMarkers: ValidationStatus;
  sectionErrors: SectionError[];
}

export interface ValidationStatus {
  isValid: boolean;
  mismatches?: any[];
}

export interface SectionError {
  title: string;
  startLine: number;
  codeBlocks: ValidationStatus & { total: number; mismatches: CodeBlockMismatch[] };
  inlineCode: ValidationStatus & { sourceCount: number; targetCount: number; mismatches: string[]; sourceSnippets?: string[]; targetSnippets?: string[]; };
  specialMarkers: ValidationStatus & { sourceCount: number; targetCount: number; mismatches: string[] };
}

export interface CodeBlockMismatch {
  type: string;
  lang: string;
  source: string;
  target: string;
  sourceStartLine?: number;
  targetStartLine?: number;
}
