import { Section } from './Section';
import { Task, BATCH_SIZE_LIMIT } from './Task';
import { TaskFactory } from './TaskFactory';

/**
 * 分配翻譯任務
 * @param allSections 所有章節
 * @param taskFactory 任務工廠
 * @returns 任務列表
 */
export function assignTasks(allSections: Section[], taskFactory: TaskFactory): Task[] {
  const tasks: Task[] = [];
  if (allSections.length === 0) {
    return tasks;
  }

  // 處理序言：永遠是第一個 Section，且單獨成為一個 Task
  const preambleSection = allSections[0];
  if (preambleSection.depth <= 1) { // 通常是 H1 或 Prologue
    const preambleTask = taskFactory.createTask();
    preambleTask.setPreamble();
    preambleTask.addSection(preambleSection);
    tasks.push(preambleTask);
  }

  let currentTask = taskFactory.createTask();

  // 從第二個 Section 開始處理（索引為 1）
  for (let i = 1; i < allSections.length; ) {
    const currentSection = allSections[i];

    // 1. 定義處理單元 (group)，group 從當前 section 開始，包含其所有後代
    const group: Section[] = [currentSection];
    let groupContentLength = currentSection.contentLength;
    let endIndex = i + 1;

    for (; endIndex < allSections.length; endIndex++) {
      const nextSection = allSections[endIndex];
      if (nextSection.depth <= currentSection.depth) {
        break; // 遇到同級或更高級別的標題，group 結束
      }
      group.push(nextSection);
      groupContentLength += nextSection.contentLength;
    }

    // 2. 判斷 currentTask 是否能容納此 group
    if (!currentTask.isEmpty() && currentTask.getContentLength() + groupContentLength > BATCH_SIZE_LIMIT) {
      tasks.push(currentTask);
      currentTask = taskFactory.createTask();
    }

    // 3. 將 group 加入 currentTask
    // 如果 group 本身就大於 BATCH_SIZE_LIMIT，它會獨佔一個 Task
    for (const section of group) {
      currentTask.addSection(section);
    }

    // 4. 更新主迴圈索引
    i = endIndex;
  }

  // 收尾
  if (!currentTask.isEmpty()) {
    tasks.push(currentTask);
  }

  return tasks;
}
