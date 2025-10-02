import { Section } from './Section';

export const BATCH_SIZE_LIMIT = 8192; // 每一任務的容量上限 bytes

/**
 * 代表一個翻譯任務，其中包含一個或多個 Section。
 */
export class Task {
  private sections: Section[] = [];
  private contentLength: number = 0;
  public readonly id: number;
  public readonly parentContext: Section | null;
  public notes?: string;
  private _isPreamble: boolean = false;

  constructor(id: number, parentContext: Section | null = null) {
    this.id = id;
    this.parentContext = parentContext;
  }

  /**
   * 將一個 Section 加入到這個任務中。
   * 這個方法現在只負責加入 Section 並更新長度，不包含任何邏輯判斷。
   * @param section 要加入的 Section。
   */
  addSection(section: Section): void {
    this.sections.push(section);
    this.contentLength += section.contentLength;
  }

  /**
   * 設置此任務是否為序言。
   */
  setPreamble(): void {
    this._isPreamble = true;
  }

  getSections(): Section[] {
    return this.sections;
  }

  getContent(): string {
    return this.sections.map(s => s.contentForTranslation).join('\n\n');
  }

  getTitle(): string {
    return this.sections.map(s => s.title).join(', ');
  }

  getStartLine(): number {
    return this.sections[0]?.startLine ?? 0;
  }

  getEndLine(): number {
    return this.sections[this.sections.length - 1]?.endLine ?? 0;
  }

  getContentLength(): number {
    return this.contentLength;
  }

  isEmpty(): boolean {
    return this.sections.length === 0;
  }

  isPreamble(): boolean {
    return this._isPreamble;
  }
}