import { Section } from './Section';

export const BATCH_SIZE_LIMIT = 10000; // 10K Bytes

/**
 * 代表一個翻譯任務，其中包含一個或多個 Section。
 */
export class Task {
  private sections: Section[] = [];
  /**
   * Task 中所有 Section 的內容長度 (contentLength) 的總和。
   * 這個屬性只用於最終的長度計算和顯示，不直接參與准入判斷。
   */
  private contentLength: number = 0;
  private static nextId = 0;
  public readonly id: number;
  public readonly parentContext: Section | null;
  public notes?: string;

  /**
   * @param parentContext 如果提供，則此 Task 只能接受 parentContext 的直屬子 Section。
   */
  constructor(parentContext: Section | null = null) {
    this.id = Task.nextId++;
    this.parentContext = parentContext;
  }

  /**
   * 將一個 Section 加入到這個任務中。
   * - 如果 Section 是 H2 (depth=2)，則使用其 totalLength 進行大小計算。
   * - 對於所有其他 Section (H1, H3, H4 等)，使用其 contentLength 進行計算。
   * - 如果 Task 具有 parentContext，則只接受該 context 的直屬子 Section。
   * @param section 要加入的 Section。
   * @returns 如果成功加入則回傳 true，否則回傳 false。
   */
  addSection(section: Section): boolean {
    // 規則 1: 如果有上下文，遞迴檢查祖先是否匹配
    if (this.parentContext) {
      let current = section.parent;
      let foundMatch = false;
      while (current) {
        if (current === this.parentContext) {
          foundMatch = true;
          break;
        }
        current = current.parent;
      }
      if (!foundMatch) {
        return false;
      }
    }

    // 規則 2: 動態決定用來判斷大小的長度
    const lengthToAdd = section.depth === 2 ? section.totalLength : section.contentLength;

    // 規則 3: 進行大小判斷
    if (lengthToAdd > BATCH_SIZE_LIMIT) {
      return this.isEmpty(); // 巨大區塊只能自己成為一個 task
    }
    // 如果加入後，總大小會超過限制，則不能加入
    if (this.contentLength + lengthToAdd > BATCH_SIZE_LIMIT) {
      return false;
    }

    this.sections.push(section);
    this.contentLength += section.contentLength;
    return true;
  }


  getSections(): Section[] {
    return this.sections;
  }

  getContent(): string {
    return this.sections.map(s => s.content).join('\n\n');
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
}
