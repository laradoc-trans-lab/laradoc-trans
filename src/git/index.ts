import { CheckoutFailedError } from './CheckoutFailedError';
import { DiffError } from './DiffError';
import { GetCommitHashError } from './GetCommitHashError';
import { GitError } from './GitError';
import { GitExecutableNotFoundError } from './GitExecutableNotFoundError';
import { InitError } from './InitError';
import { ListFilesError } from './ListFilesError';
import { RepositoryNotFoundError } from './RepositoryNotFoundError';
import { CloneError } from './CloneError';

/**
 * This module serves as the public API for all Git-related operations.
 * It re-exports the necessary functions from the internal operations module.
 */
export {
  isGitRepository,
  checkoutOrCreateBranch,
  checkoutBranch,
  getCurrentCommitHash,
  listMarkdownFiles,
  getDiffFiles,
  initializeTargetRepo,
  initRepository,
  cloneRepository,
} from './operations';

/**
 * It also re-exports all error types for consumers who need to handle
 * specific Git-related errors.
 */
export {
  CheckoutFailedError,
  DiffError,
  GetCommitHashError,
  GitError,
  GitExecutableNotFoundError,
  InitError,
  ListFilesError,
  RepositoryNotFoundError,
  CloneError,
};