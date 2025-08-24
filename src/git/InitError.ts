import { GitError } from './GitError';

export class InitError extends GitError {
  public readonly stderr: string;

  constructor(stderr: string) {
    super(`Failed to initialize git repository. Stderr: ${stderr}`);
    this.name = 'InitError';
    this.stderr = stderr;
  }
}
