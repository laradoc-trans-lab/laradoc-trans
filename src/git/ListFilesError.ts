import { GitError } from './GitError';

export class ListFilesError extends GitError {
  public readonly stderr: string;

  constructor(stderr: string) {
    super(`Failed to list files. Stderr: ${stderr}`);
    this.name = 'ListFilesError';
    this.stderr = stderr;
  }
}
