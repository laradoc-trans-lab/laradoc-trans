import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { _ } from './i18n';

const execAsync = promisify(exec);

async function git(
  command: string,
  repoPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: repoPath });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1, // Default to 1 if code is not available
    };
  }
}

/**
 * 檢查給定的目錄路徑是否為 Git 儲存庫。
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  if (!require('fs').existsSync(dirPath)) return false;
  const { stdout, exitCode } = await git('git rev-parse --is-inside-work-tree', dirPath);
  return exitCode === 0 && stdout.trim() === 'true';
}

/**
 * 在給定路徑中初始化一個新的 Git 儲存庫。
 */
async function init(repoPath: string): Promise<void> {
  const { stderr, exitCode } = await git('git init', repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to initialize git repository in {{path}}: {{message}}', { path: repoPath, message: stderr || _('Unknown error') }));
  }
  console.log(_('Initialized empty Git repository in {{path}}', { path: repoPath }));
}

/**
 * 將 Git 儲存庫切換到特定分支。如果分支不存在，則建立它。
 */
export async function checkoutOrCreateBranch(repoPath: string, branch: string): Promise<void> {
  const { stderr, exitCode } = await git(`git checkout -B ${branch}`, repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to checkout branch \'{{branch}}\' in {{path}}: {{message}}', { branch: branch, path: repoPath, message: stderr || _('Unknown error') }));
  }
  console.log(_('Switched to branch \'{{branch}}\' in {{path}}', { branch: branch, path: repoPath }));
}

/**
 * 將 Git 儲存庫切換到特定分支。
 */
export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  const { stderr, exitCode } = await git(`git checkout ${branch}`, repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to checkout branch \'{{branch}}\' in {{path}}: {{message}}', { branch: branch, path: repoPath, message: stderr || _('Unknown error') }));
  }
  console.log(_('Switched to branch \'{{branch}}\' in {{path}}', { branch: branch, path: repoPath }));
}

/**
 * 取得儲存庫目前的提交雜湊值。
 */
export async function getCurrentCommitHash(repoPath: string): Promise<string> {
  const { stdout, stderr, exitCode } = await git('git rev-parse HEAD', repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to get current commit hash in {{path}}: {{message}}', { path: repoPath, message: stderr || _('Unknown error') }));
  }
  return stdout.trim();
}

/**
 * 列出儲存庫中所有的 markdown 檔案。
 * @param repoPath 儲存庫的絕對路徑。
 * @returns 相對於儲存庫根目錄的 markdown 檔案路徑列表。
 */
export async function listMarkdownFiles(repoPath: string): Promise<string[]> {
  const { stdout, stderr, exitCode } = await git("git ls-files '*.md'", repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to list markdown files in {{path}}: {{message}}', { path: repoPath, message: stderr || _('Unknown error') }));
  }
  return stdout.trim().split('\n').filter(Boolean).sort();
}

/**
 * 取得兩個提交之間已變更的 markdown 檔案列表。
 * @param repoPath 儲存庫的絕對路徑。
 * @param oldHash 舊的提交雜湊值。
 * @param newHash 新的提交雜湊值。
 * @returns 已變更的 markdown 檔案路徑列表。
 */
export async function getDiffFiles(repoPath: string, oldHash: string, newHash: string): Promise<string[]> {
  const { stdout, stderr, exitCode } = await git(`git diff --name-only ${oldHash} ${newHash}`, repoPath);
  if (exitCode !== 0) {
    throw new Error(_('Failed to get diff between {{oldHash}} and {{newHash}}: {{message}}', { oldHash: oldHash, newHash: newHash, message: stderr || _('Unknown error') }));
  }
  return stdout.trim().split('\n').filter(line => line.endsWith('.md'));
}

/**
 * 確保目標目錄是 git 儲存庫並且在正確的分支上。
 */
export async function initializeTargetRepo(repoPath: string, branch: string): Promise<void> {
  if (!(await isGitRepository(repoPath))) {
    await init(repoPath);
  }
  await checkoutOrCreateBranch(repoPath, branch);
}
