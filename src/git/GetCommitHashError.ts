import { GitError } from './GitError';

export class GetCommitHashError extends GitError {
  public readonly stderr: string;

  constructor(stderr: string) {
    super(`Failed to get current commit hash. Stderr: ${stderr}`);
    this.name = 'GetCommitHashError';
    this.stderr = stderr;
  }
}
