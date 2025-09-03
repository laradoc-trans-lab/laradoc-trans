import fs from 'fs/promises';
import path from 'path';
import { isGitRepository, RepositoryNotFoundError } from './git';
import { _ } from './i18n';

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
 * @throws {RepositoryNotFoundError} If the source directory is not a valid Git repository.
 */
export async function initializeWorkspace(customWorkspacePath?: string): Promise<WorkspacePaths> {
  const workspacePath = customWorkspacePath || process.env.WORKSPACE_PATH || path.resolve(process.cwd(), 'workspace');

  const paths: WorkspacePaths = {
    root: workspacePath,
    source: path.join(workspacePath, 'repo', 'source'),
    target: path.join(workspacePath, 'repo', 'target'),
    tmp: path.join(workspacePath, 'tmp'),
    logs: path.join(workspacePath, 'logs'),
  };

  // Ensure all necessary directories exist
  await fs.mkdir(paths.source, { recursive: true }); // Ensure source directory exists
  await fs.mkdir(paths.target, { recursive: true });
  await fs.mkdir(paths.tmp, { recursive: true });
  await fs.mkdir(paths.logs, { recursive: true });

  console.log(_('Workspace paths resolved at: {{path}}', { path: workspacePath }));
  return paths;
}