import cliProgress from 'cli-progress';

// 定義任務狀態的枚舉
export enum TaskStatus {
  Waiting,
  Translating,
  Retrying, // Added for retry status
  Completed,
  Failed,
}

// 狀態對應的圖示
const statusIcons = {
  [TaskStatus.Waiting]: '🕒',
  [TaskStatus.Translating]: '🔄',
  [TaskStatus.Retrying]: '⚠️', // Icon for retrying
  [TaskStatus.Completed]: '✅',
  [TaskStatus.Failed]: '❌',
};

/**
 * 管理 cli-progress MultiBar 的類別
 */
export class ProgressManager {
  private multibar: cliProgress.MultiBar;
  private bars: Map<string, cliProgress.SingleBar> = new Map();
  private startTimes: Map<string, number> = new Map(); // Track start times
  private warnings: string[] = []; // Collect warnings

  constructor() {
    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: (options, params, payload) => {
        // Column widths
        const numWidth = 2;
        const statusWidth = 1;
        const bytesWidth = 11;
        const timeWidth = 4;
        const separator = ' | ';

        const taskNum = (payload.taskNumber || '').padEnd(numWidth);
        const statusIcon = statusIcons[payload.status as TaskStatus] || '❓';

        const bytes = `${payload.bytes || 0} bytes`.padEnd(bytesWidth);
        
        let time = '-'.padEnd(timeWidth);
        if (payload.time) { // Final time is set
            time = `${Math.round(payload.time)}s`.padEnd(timeWidth);
        } else if (payload.startTime && payload.status === TaskStatus.Translating) { // Task is running
            const elapsed = (Date.now() - payload.startTime) / 1000;
            time = `${Math.round(elapsed)}s`.padEnd(timeWidth);
        }

        const staticWidth = numWidth + statusWidth + bytesWidth + timeWidth + (separator.length * 4);
        const terminalWidth = process.stdout.columns || 80;
        const titleMaxWidth = terminalWidth - staticWidth;

        let title = payload.title || '';
        if (title.length > titleMaxWidth) {
            title = title.substring(0, titleMaxWidth - 3) + '...';
        }

        return `${taskNum}${separator}${statusIcon}${separator}${bytes}${separator}${time}${separator}${title}`;
      },
    }, cliProgress.Presets.shades_classic);
  }

  /**
   * 新增一個任務到進度條
   * @param id 任務的唯一標識符，通常是檔案路徑
   * @param title 顯示在進度條上的標題
   */
  addTask(id: string, title: string, taskNumber: number): void {
    const bar = this.multibar.create(100, 0, {
      title: title,
      status: TaskStatus.Waiting,
      bytes: 0,
      time: null,
      taskNumber: taskNumber.toString(),
      startTime: null,
    });
    this.bars.set(id, bar);
  }

  /**
   * 開始一個任務，設定狀態並記錄開始時間
   * @param id 任務的唯一標識符
   */
  startTask(id: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      const startTime = Date.now();
      bar.update({ status: TaskStatus.Translating, startTime });
      this.startTimes.set(id, startTime);
    }
  }

  /**
   * 更新任務的任意 payload 數據
   * @param id 任務的唯一標識符
   * @param payload 要更新的數據
   */
  updateTask(id: string, payload: object): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update(payload);
    }
  }

  /**
   * 更新任務的狀態
   * @param id 任務的唯一標識符
   * @param status 新的狀態
   */
  updateStatus(id: string, status: TaskStatus): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update({ status });
    }
  }

  /**
   * 更新任務接收到的位元組數
   * @param id 任務的唯一標識符
   * @param bytes 新的位元組數
   */
  updateBytes(id: string, bytes: number): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update({ bytes });
    }
  }

  /**
   * 標記任務完成
   * @param id 任務的唯一標識符
   * @param time 花費的時間（秒）
   */
  completeTask(id: string, time: number): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update(100, { status: TaskStatus.Completed, time });
    }
  }

  /**
   * 標記任務失敗
   * @param id 任務的唯一標識符
   */
  failTask(id: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update({ status: TaskStatus.Failed });
    }
  }

  /**
   * 停止所有進度條
   */
  stop(): void {
    this.multibar.stop();
  }

  /**
   * 獲取當前任務總數
   * @returns 任務數量
   */
  getTaskCount(): number {
    return this.bars.size;
  }

  /**
   * 根據 ID 獲取進度條實例
   * @param id 任務的唯一標識符
   * @returns The SingleBar instance or undefined.
   */
  getBar(id: string): cliProgress.SingleBar | undefined {
    return this.bars.get(id);
  }

  /**
   * 根據 ID 獲取任務的開始時間
   * @param id 任務的唯一標識符
   * @returns The start time in milliseconds or undefined.
   */
  getStartTime(id: string): number | undefined {
    return this.startTimes.get(id);
  }

  /**
   * Collects a warning message to be displayed at the end.
   * @param message The warning message to collect.
   */
  collectWarning(message: string): void {
    this.warnings.push(message);
  }

  /**
   * Prints all collected warnings to the console if any exist.
   */
  printCollectedWarnings(): void {
    if (this.warnings.length > 0) {
      console.log('\n---');
      console.log('Warnings encountered during translation:');
      this.warnings.forEach(warning => console.log(`- ${warning}`));
      console.log('---');
    }
  }
}
