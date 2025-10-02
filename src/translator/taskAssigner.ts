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

    // 2. 判斷如何處理這個 group
    const fitsInCurrent = currentTask.getContentLength() + groupContentLength <= BATCH_SIZE_LIMIT;
    const fitsInNew = groupContentLength <= BATCH_SIZE_LIMIT;

    if (fitsInCurrent) {
      // 情況 1: 群組能裝入當前任務，但需檢查層級規則
      let constraintViolated = false;
      if (!currentTask.isEmpty()) {
        const taskStartDepth = currentTask.getSections()[0].depth;
        const groupStartDepth = group[0].depth;
        if (groupStartDepth < taskStartDepth) {
          constraintViolated = true;
        }
      }

      if (constraintViolated) {
        // 規則衝突：新群組的層級高於任務起始層級，需建立新任務
        tasks.push(currentTask);
        currentTask = taskFactory.createTask();
        for (const section of group) {
          currentTask.addSection(section);
        }
      } else {
        // 沒有規則衝突，正常加入
        for (const section of group) {
          currentTask.addSection(section);
        }
      }
    } else if (fitsInNew) {
      // 情況 2: 群組裝不進當前任務，但能裝進一個新任務
      tasks.push(currentTask);
      currentTask = taskFactory.createTask();
      for (const section of group) {
        currentTask.addSection(section);
      }
    } else {
      // 情況 3: 群組太大，必須被拆分
      if (!currentTask.isEmpty()) {
        tasks.push(currentTask);
      }

      const context = group[0]; // H2 標頭是共享的上下文
      currentTask = taskFactory.createTask(context);
      
      // **最終修正**：先單獨處理巨大群組的 H2 標頭，然後從子章節開始遍歷
      currentTask.addSection(group[0]);

      for (let j = 1; j < group.length; ) { // 從 1 開始，跳過已處理的 H2 標頭
        const subGroupRoot = group[j];
        const subGroup = [subGroupRoot];
        let subGroupContentLength = subGroupRoot.contentLength;
        let subGroupEndIndex = j + 1;

        for (; subGroupEndIndex < group.length; subGroupEndIndex++) {
          const nextSection = group[subGroupEndIndex];
          if (nextSection.depth <= subGroupRoot.depth) {
            break;
          }
          subGroup.push(nextSection);
          subGroupContentLength += nextSection.contentLength;
        }

        if (!currentTask.isEmpty() && currentTask.getContentLength() + subGroupContentLength > BATCH_SIZE_LIMIT) {
          tasks.push(currentTask);
          currentTask = taskFactory.createTask(context);
        }

        for (const section of subGroup) {
          currentTask.addSection(section);
        }

        j = subGroupEndIndex;
      }
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
