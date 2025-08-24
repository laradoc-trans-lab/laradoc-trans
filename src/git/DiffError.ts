import { GitError } from './GitError';

export class DiffError extends GitError {
  public readonly stderr: string;

  constructor(stderr: string) {
    super(`Failed to get diff. Stderr: ${stderr}`);
    this.name = 'DiffError';
    this.stderr = stderr;
  }
}
