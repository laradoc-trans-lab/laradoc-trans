import { GitError } from './GitError';

/**
 * 當 git 執行檔本身找不到或無法執行時拋出此錯誤。
 */
export class GitExecutableNotFoundError extends GitError {
  constructor() {
    super('Git executable not found. Please ensure git is installed and in your PATH.');
    this.name = 'GitExecutableNotFoundError';
  }
}
