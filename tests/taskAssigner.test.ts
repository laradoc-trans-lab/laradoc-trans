import fs from 'fs/promises';
import path from 'path';
import { assignTasks } from '../src/translator/taskAssigner';
import { TaskFactory } from '../src/translator/TaskFactory';
import { splitMarkdownIntoSections } from '../src/markdownParser';
import { Section } from '../src/translator/Section';

describe('assignTasks', () => {
  async function runTaskAssignmentTest(fileName: string) {
    const filePath = path.resolve(__dirname, `fixtures/validator/source/${fileName}`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const sections = splitMarkdownIntoSections(fileContent);
    const taskFactory = new TaskFactory();

    const tasks = assignTasks(sections, taskFactory);

    const taskAssignmentLog = [
      `--- Translation Task Assignment for ${fileName} ---`,
      `--- Total Sections: ${sections.length}, Total Tasks: ${tasks.length} ---`,
      ...tasks.map(task => {
        const sectionsLog = task.getSections().map(section =>
          `  * ${'#'.repeat(section.depth)} ${section.title} (Lines ${section.startLine}-${section.endLine}) (contentLength: ${section.contentLength} , totalLength:${section.totalLength}) `
        ).join('\n');
        const isPreamble = task.isPreamble();
        return `- Task ${task.id + 1} ${isPreamble ? '(Preamble)' : ''} (Lines ${task.getStartLine()}-${task.getEndLine()}) (contentLength: ${task.getContentLength()}) (parentContext: '${task.parentContext?.title}') \n${sectionsLog}`;
      }),
      '---------------------------------'
    ].join('\n');
    // console.log(taskAssignmentLog);

    // 1. 驗證行號連貫性
    for (const task of tasks) {
      const taskSections = task.getSections();
      for (let i = 0; i < taskSections.length - 1; i++) {
        const currentSection = taskSections[i];
        const nextSection = taskSections[i + 1];
        // 檢查下一節的起始行號是否緊接著當前節的結束行號
        expect(nextSection.startLine).toBe(currentSection.endLine + 1);
      }
    }

    // 2. 驗證群組完整性
    const sectionToTaskMap = new Map<Section, number>();
    for (const task of tasks) {
      for (const section of task.getSections()) {
        sectionToTaskMap.set(section, task.id);
      }
    }

    for (const section of sections) {
      if (section.parent && section.depth >= 2) {
        const sectionTaskId = sectionToTaskMap.get(section);
        const parentTaskId = sectionToTaskMap.get(section.parent);
        const parentTask = tasks.find(t => t.id === parentTaskId);

        if (section.parent.depth < 2) {
          continue;
        }

        const isParentContext = parentTask?.parentContext === section.parent;

        if (sectionTaskId !== parentTaskId && !isParentContext) {
            const errorSection = section;
            const errorParent = section.parent;
            const errorTask = tasks.find(t => t.id === sectionTaskId);
            const errorParentTask = tasks.find(t => t.id === parentTaskId);

            console.log('--- Error Details ---');
            console.log(`Section '${errorSection.title}' (depth: ${errorSection.depth}) is in Task ${errorTask?.id}`);
            console.log(`Its parent '${errorParent.title}' (depth: ${errorParent.depth}) is in Task ${errorParentTask?.id}`);
            console.log('Parent Task Context:', errorParentTask?.parentContext?.title);
            console.log('Section Task Context:', errorTask?.parentContext?.title);

        }

        expect(sectionTaskId === parentTaskId || isParentContext).toBe(true);
      }
    }
    // 3. 驗證最後一個任務的結束行號是否與檔案總行數相符
    if (tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1];
      const totalLines = fileContent.split('\n').length;
      expect(lastTask.getEndLine()).toBe(totalLines);
    }
  }

  /**
   * documentation.md 是一個只有 TOC 的文件，所以單獨驗證會不會出錯
   */
  it('should correctly assign tasks from documentation.md', async () => {
    await runTaskAssignmentTest('documentation.md');
  });

  /**
   * authorization.md 是一個巨大 H2 包含了許多 H3/H4 參雜的章節，必須測試 H3+H4 的獨立性
   */
  it('should correctly assign tasks from authorization.md', async () => {
    await runTaskAssignmentTest('authorization.md');
  });

  /**
   * mcp.md 包含了一張很大的 base64 圖片，有採用 placeHolder 技術替代內容
   */
  it('should correctly assign tasks from mcp.md', async () => {
    await runTaskAssignmentTest('mcp.md');
  });

  /**
   * dusk.md 的章節層級與其他檔案不同，會有很多 H1 層級
   */
  it('should correctly assign tasks from dusk.md', async () => {
    await runTaskAssignmentTest('dusk.md');
  });

});