import fs from 'fs/promises';
import path from 'path';
import { isGitRepository } from './git';

export interface WorkspacePaths {
  root: string;
  source: string;
  target: string;
  tmp: string;
  logs: string;
}

/**
 * 透過驗證來源儲存庫並建立必要的目錄來初始化工作區。
 * @returns 一個包含工作區目錄絕對路徑的物件。
 */
export async function initializeWorkspace(): Promise<WorkspacePaths> {
  const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), 'workspace');

  const paths: WorkspacePaths = {
    root: workspacePath,
    source: path.join(workspacePath, 'repo', 'source'),
    target: path.join(workspacePath, 'repo', 'target'),
    tmp: path.join(workspacePath, 'tmp'),
    logs: path.join(workspacePath, 'logs'),
  };

  // 1. 檢查來源目錄是否為有效的 Git 儲存庫。
  const sourceIsRepo = await isGitRepository(paths.source);
  if (!sourceIsRepo) {
    throw new Error(`Source directory not found or is not a valid Git repository: ${paths.source}`);
  }

  // 2. 如果 tmp、logs 和 target 目錄不存在，則建立它們。
  await fs.mkdir(paths.target, { recursive: true });
  await fs.mkdir(paths.tmp, { recursive: true });
  await fs.mkdir(paths.logs, { recursive: true });

  console.log(`Workspace initialized at: ${workspacePath}`);
  return paths;
}