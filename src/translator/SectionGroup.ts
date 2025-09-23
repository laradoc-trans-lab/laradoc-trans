import { Section } from './Section';

/**
 * 代表一組邏輯上相關的 Section。
 * 例如，一個 H2 標題和其所有的 H3, H4 子標題可以被視為一個 SectionGroup。
 */
export class SectionGroup {
  public readonly sections: Section[];
  public readonly totalLength: number;

  constructor(sections: Section | Section[]) {
    this.sections = Array.isArray(sections) ? sections : [sections];
    this.totalLength = this.sections.reduce((sum, section) => sum + section.totalLength, 0);
  }

  /**
   * 取得這個群組中所有 Section 的內容。
   * @returns 組合後的內容字串。
   */
  getContent(): string {
    return this.sections.map(s => s.content).join('\n\n');
  }

  /**
   * 取得這個群組中所有 Section 的標題。
   * @returns 組合後的標題字串。
   */
  getTitle(): string {
    return this.sections.map(s => s.title).join(', ');
  }

  /**
   * 取得這個群組的起始行號。
   * @returns 起始行號。
   */
  getStartLine(): number {
    return this.sections[0]?.startLine ?? 0;
  }

  /**
   * 取得這個群組的結束行號。
   * @returns 結束行號。
   */
  getEndLine(): number {
    return this.sections[this.sections.length - 1]?.endLine ?? 0;
  }
}
