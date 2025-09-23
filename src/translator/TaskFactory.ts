import { Section } from './Section';
import { Task } from './Task';

/**
 * 負責建立 Task 物件並管理其 ID。
 * 每個檔案處理流程都應使用一個新的工廠實例，以確保 ID 從 0 開始。
 */
export class TaskFactory {
  private nextId = 0;

  /**
   * 建立一個新的 Task 物件並為其分配一個唯一的、從 0 開始的 ID。
   * @param parentContext 如果提供，則此 Task 只能接受 parentContext 的直屬子 Section。
   * @returns 一個新的 Task 實例。
   */
  createTask(parentContext: Section | null = null): Task {
    const task = new Task(this.nextId++, parentContext);
    return task;
  }
}
