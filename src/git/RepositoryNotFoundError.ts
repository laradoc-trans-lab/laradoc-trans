import { GitError } from './GitError';

/**
 * 當指定的目錄不是一個有效的 Git 儲存庫時拋出此錯誤。
 */
export class RepositoryNotFoundError extends GitError {
  public readonly repoPath: string;

  constructor(repoPath: string) {
    super(`Path is not a valid Git repository: ${repoPath}`);
    this.name = 'RepositoryNotFoundError';
    this.repoPath = repoPath;
  }
}
