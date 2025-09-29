import fs from 'fs/promises';
import path from 'path';
import { _ } from './i18n';

export type Progress = Map<string, 0 | 1 | 2>; // 0: 待處理, 1: 已完成, 2: 失敗

const SOURCE_COMMIT_FILE = '.source_commit'; // Use a single constant
const PROGRESS_FILE = '.progress';

/**
 * 從目標目錄中的 .source_commit 檔案讀取來源提交雜湊值。
 * @param targetPath 目標儲存庫的絕對路徑。
 * @returns 提交雜湊值字串，如果檔案不存在則為 null。
 */
export async function readSourceCommit(targetPath: string): Promise<string | null> {
  const filePath = path.join(targetPath, SOURCE_COMMIT_FILE); // Use single constant
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // 檔案不存在
    }
    throw error;
  }
}

/**
 * 將來源提交雜湊值寫入目標目錄中的 .source_commit 檔案。
 * @param targetPath 目標儲存庫的絕對路徑。
 * @param hash 要寫入的提交雜湊值。
 */
export async function writeSourceCommit(targetPath: string, hash: string): Promise<void> {
  const filePath = path.join(targetPath, SOURCE_COMMIT_FILE); // Use single constant
  const tmpFilePath = `${filePath}.tmp`;
  await fs.writeFile(tmpFilePath, hash);
  await fs.rename(tmpFilePath, filePath);
}

/**
 * 從 tmp 目錄中的 .source_commit 檔案讀取來源提交雜湊值。
 * @param tmpPath tmp 目錄的絕對路徑。
 * @returns 提交雜湊值字串，如果檔案不存在則為 null。
 */
export async function readTmpSourceCommit(tmpPath: string): Promise<string | null> {
  const filePath = path.join(tmpPath, SOURCE_COMMIT_FILE); // Use single constant
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // 檔案不存在
    }
    throw error;
  }
}

/**
 * 將來源提交雜湊值寫入 tmp 目錄中的 .source_commit 檔案。
 * @param tmpPath tmp 目錄的絕對路徑。
 * @param hash 要寫入的提交雜湊值。
 */
export async function writeTmpSourceCommit(tmpPath: string, hash: string): Promise<void> {
  const filePath = path.join(tmpPath, SOURCE_COMMIT_FILE); // Use single constant
  const tmpFilePath = `${filePath}.tmp`;
  await fs.writeFile(tmpFilePath, hash);
  await fs.rename(tmpFilePath, filePath);
}

/**
 * 從 tmp 目錄讀取並解析 .progress 檔案。
 * @param tmpPath tmp 目錄的絕對路徑。
 * @returns 代表進度的 Map，如果檔案不存在則為 null。
 */
export async function readProgressFile(tmpPath: string): Promise<Progress | null> {
  const filePath = path.join(tmpPath, PROGRESS_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const progress: Progress = new Map();
    for (const line of lines) {
      if (!line) continue;
      const [file, status] = line.split(' = ');
      progress.set(file, parseInt(status, 10) as 0 | 1 | 2);
    }
    return progress;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // 檔案不存在
    }
    throw error;
  }
}

/**
 * 將進度 map 寫入 tmp 目錄中的 .progress 檔案。
 * @param tmpPath tmp 目錄的絕對路徑。
 * @param progress 要寫入的進度 map。
 */
export async function writeProgressFile(tmpPath: string, progress: Progress): Promise<void> {
  const filePath = path.join(tmpPath, PROGRESS_FILE);
  const tmpFilePath = `${filePath}.tmp`;
  let content = '';

  if(progress.size === 0) {
    // 有發生過 progress 為 0 的情況，這種情況發生在有 Exception 產生的時候
    // 不知道是不是 nodeJs bug
    // 所以當 progress.size 是 0 的情況，不寫入
    return;
  }

  for (const [file, status] of progress.entries()) {
    content += `${file} = ${status}\n`;
  }
  await fs.writeFile(tmpFilePath, content.trim());
  await fs.rename(tmpFilePath, filePath);
}

/**
 * 刪除 tmp 目錄中的所有檔案。
 * 根據規格，這在重建進度檔案時使用。
 * @param tmpPath tmp 目錄的絕對路徑。
 */
export async function cleanTmpDirectory(tmpPath: string): Promise<void> {
  try {
    const files = await fs.readdir(tmpPath);
    for (const file of files) {
      // Only delete .progress and translated files, not .source_commit
      // This function is called at the START of a new session,
      // where tmp/.source_commit might be needed for diffing.
      if (file !== SOURCE_COMMIT_FILE) {
        await fs.unlink(path.join(tmpPath, file));
      }
    }
    console.log(_('Cleaned tmp directory: {{path}}', { path: tmpPath }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return; // 目錄不存在，這沒關係。
    }
    throw error;
  }
}