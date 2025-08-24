import fs from 'fs';
import { executeGit } from './executor';
import {
  RepositoryNotFoundError,
  InitError,
  CheckoutFailedError,
  GetCommitHashError,
  ListFilesError,
  DiffError,
} from './';

/**
 * Checks if a given directory path is a Git repository.
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  // Note: We don't throw RepositoryNotFoundError here because this function
  // is often used just to check a condition without causing a failure.
  const { stdout, exitCode } = await executeGit(['rev-parse', '--is-inside-work-tree'], dirPath);
  return exitCode === 0 && stdout.trim() === 'true';
}

/**
 * Initializes a new Git repository in a given path.
 */
async function init(repoPath: string): Promise<void> {
  const { stderr, exitCode } = await executeGit(['init'], repoPath);
  if (exitCode !== 0) {
    throw new InitError(stderr);
  }
}

/**
 * Switches the Git repository to a specific branch, creating it if it doesn't exist.
 */
export async function checkoutOrCreateBranch(repoPath: string, branch: string): Promise<void> {
  const { stderr, exitCode } = await executeGit(['checkout', '-B', branch], repoPath);
  if (exitCode !== 0) {
    throw new CheckoutFailedError(repoPath,branch, stderr);
  }
}

/**
 * Switches the Git repository to a specific branch.
 */
export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  const { stderr, exitCode } = await executeGit(['checkout', branch], repoPath);
  if (exitCode !== 0) {
    throw new CheckoutFailedError(repoPath,branch, stderr);
  }
}

/**
 * Gets the current commit hash of the repository.
 */
export async function getCurrentCommitHash(repoPath: string): Promise<string> {
  const { stdout, stderr, exitCode } = await executeGit(['rev-parse', 'HEAD'], repoPath);
  if (exitCode !== 0) {
    throw new GetCommitHashError(stderr);
  }
  return stdout.trim();
}

/**
 * Lists all markdown files in the repository.
 */
export async function listMarkdownFiles(repoPath: string): Promise<string[]> {
  // Note: The glob pattern '*.md' is handled by git itself.
  const { stdout, stderr, exitCode } = await executeGit(['ls-files', '*.md'], repoPath);
  if (exitCode !== 0) {
    throw new ListFilesError(stderr);
  }
  return stdout.trim().split('\n').filter(Boolean).sort();
}

/**
 * Gets a list of changed markdown files between two commits.
 */
export async function getDiffFiles(repoPath: string, oldHash: string, newHash: string): Promise<string[]> {
  const { stdout, stderr, exitCode } = await executeGit(['diff', '--name-only', oldHash, newHash], repoPath);
  if (exitCode !== 0) {
    throw new DiffError(stderr);
  }
  return stdout.trim().split('\n').filter(line => line.endsWith('.md'));
}

/**
 * Ensures the target directory is a git repository and on the correct branch.
 */
export async function initializeTargetRepo(repoPath: string, branch: string): Promise<void> {
  if (!(await isGitRepository(repoPath))) {
    await init(repoPath);
  }
  await checkoutOrCreateBranch(repoPath, branch);
}
