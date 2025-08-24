import { GitError } from './GitError';

export class CheckoutFailedError extends GitError {
  public readonly branch: string;
  public readonly stderr: string;
  public readonly repoPath: string;
  constructor(repoPath:string,branch: string, stderr: string) {
    super(`Failed to checkout branch '${branch}'. Stderr: ${stderr}`);
    this.name = 'CheckoutFailedError';
    this.branch = branch;
    this.stderr = stderr;
    this.repoPath = repoPath;
  }
}
