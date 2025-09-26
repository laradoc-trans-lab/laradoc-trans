import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * 在偵錯模式下，將詳細的 LLM 互動內容記錄到一個獨立的檔案中，並返回其檔名。
 * 如果不是偵錯模式，則返回 null。
 * @param content 要記錄的完整內容。
 * @param prefix 詳細日誌的檔案名前綴。
 * @returns 成功寫入則返回檔名，否則返回 null。
 */
export async function debugLlmDetails(
  content: string,
  prefix = 'section_to_translate'
): Promise<string | null> {
  if (process.env.DEBUG_MODE !== 'true') {
    return null;
  }

  try {
    const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), 'workspace');
    const uuid = randomUUID();
    const detailsDir = path.join(workspacePath, 'logs', 'debug_llm_details');
    const detailLogFilename = `${prefix}_${uuid}.log`;
    const detailLogPath = path.join(detailsDir, detailLogFilename);

    await fs.mkdir(detailsDir, { recursive: true });
    await fs.writeFile(detailLogPath, content);

    return detailLogFilename;
  } catch (error) {
    // 將錯誤記錄到 stderr，但返回 null 以避免主程序崩潰
    console.error('Failed to create LLM detail log:', error);
    return null;
  }
}
