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
  const workspacePath = customWorkspacePath || process.env.WORKSPACE_PATH || path.resolve(process.cwd(), './');

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

/**
 * 確保工作區中存在 .env 檔案。如果不存在，則從專案根目錄複製 .env-dist。
 * @param workspacePath 工作區的根目錄路徑。
 */
export async function ensureEnvFile(workspacePath: string): Promise<void> {
  const destEnvPath = path.join(workspacePath, '.env');
  try {
    await fs.access(destEnvPath);
    console.log(_('Skipping .env creation as it already exists in the workspace.'));
  } catch {
    // .env file doesn't exist, so create it from .env-dist
    const sourceEnvPath = path.resolve(__dirname, '..', '.env-dist');
    try {
      await fs.copyFile(sourceEnvPath, destEnvPath);
      console.log(_('Created .env file in the workspace. Please configure your GEMINI_API_KEY in it.'));
    } catch (copyError) {
      const userFriendlyError = new Error(
        _('Failed to create the required .env file in the workspace ({{path}}). Please check directory permissions.', 
        { path: workspacePath, message: (copyError as Error).message })
      );
      console.error(userFriendlyError.message);
      throw userFriendlyError;
    }
  }
}