import { Section } from './Section';

export const BATCH_SIZE_LIMIT = 10000; // 10K Bytes

export enum AddSectionStatus {
  /** 成功 */
  success = 0,
  /** 加入的章節不屬於當前任務的父章節 */
  sectionContextNotMatch,

  /** 加入的章節超過 BATCH_SIZE_LIMIT ，且有 parentContext */
  exceedingBatchSizeOfParentContext,

  /** 加入章節後超過 BATCH_SIZE_LIMIT */
  exceedingBatchSize,
  /** 巨大章節必須分割 */
  hurgeSectionNeedSplit,
}

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
  public readonly id: number;
  public readonly parentContext: Section | null;
  public notes?: string;

  /**
   * @param id 由 TaskFactory 分配的唯一 ID。
   * @param parentContext 如果提供，則此 Task 只能接受 parentContext 的直屬子 Section。
   */
  constructor(id: number, parentContext: Section | null = null) {
    this.id = id;
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
  addSection(section: Section): AddSectionStatus {
    // 規則 1: 如果有上下文，檢查 section 是否屬於該上下文。
    // 允許 section 就是 parentContext 本身。
    if (this.parentContext && this.parentContext !== section) {
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
        return AddSectionStatus.sectionContextNotMatch;
      }
    }

    // 規則 2: 動態決定用來判斷大小的長度。
    // 當 H2 section 本身被加入時，應使用 contentLength，而非 totalLength。
    const lengthToAdd =
      section.depth === 2 && section !== this.parentContext
        ? section.totalLength
        : section.contentLength;

    // 規則 3: 進行大小判斷
    if (section.depth === 2 && lengthToAdd > BATCH_SIZE_LIMIT) {
      // H2 巨大區塊只能自己成為一個 task
      return AddSectionStatus.hurgeSectionNeedSplit;
    } else if(this.parentContext !== null && this.contentLength + lengthToAdd > BATCH_SIZE_LIMIT && !this.isEmpty()) {
      /** 加入的章節超過 BATCH_SIZE_LIMIT ，且有 parentContext , 且任務不只一個章節，需要另外開新任務 */
        return AddSectionStatus.exceedingBatchSizeOfParentContext;
    } else if (this.contentLength + lengthToAdd > BATCH_SIZE_LIMIT && !this.isEmpty()) {
      // 加入的章節沒有 parentContext , 任務不只一個章節，視為滿了
      return AddSectionStatus.exceedingBatchSize;
    }

    this.sections.push(section);
    this.contentLength += section.contentLength;
    return AddSectionStatus.success;
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
}
