import { GitError } from './GitError';

export class CloneError extends GitError {
  constructor(message: string) {
    super(`Git clone failed: ${message}`);
    this.name = 'CloneError';
  }
}
