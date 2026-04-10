import fs from 'fs/promises';
import path from 'path';
import { executeGit } from './executor';
import {
  RepositoryNotFoundError,
  InitError,
  CheckoutFailedError,
  GetCommitHashError,
  ListFilesError,
  DiffError,
  CloneError,
} from './';

export interface DiffMarkdownFile {
  file: string;
  deleted: boolean;
}

/**
 * Checks if a given directory path is a Git repository.
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    await fs.access(dirPath);
  } catch (error) {
    return false;
  }

  // A more robust check for a git repository. This command will fail if it's
  // not a git repository, and the output will be different if it's not the
  // root of the repository.
  const { stdout, exitCode } = await executeGit(['rev-parse', '--git-dir'], dirPath);
  return exitCode === 0 && stdout.trim() === '.git';
}

/**
 * Initializes a new Git repository in a given path.
 */
export async function initRepository(repoPath: string): Promise<void> {
  const { stderr, exitCode } = await executeGit(['init'], repoPath);
  if (exitCode !== 0) {
    throw new InitError(stderr);
  }
}

/**
 * Clones a Git repository from a given URL to a target path.
 */
export async function cloneRepository(repoUrl: string, targetPath: string): Promise<void> {
  const { stderr, exitCode } = await executeGit(['clone', repoUrl, targetPath], process.cwd()); // Run clone from CWD
  if (exitCode !== 0) {
    throw new CloneError(stderr);
  }
}

/**
 * Switches the Git repository to a specific branch, creating it if it doesn't exist.
 */
export async function checkoutOrCreateBranch(repoPath: string, branch: string): Promise<void> {
  const checkoutResult = await executeGit(['checkout', branch], repoPath);
  if (checkoutResult.exitCode === 0) {
    return;
  }

  const localBranchRef = `refs/heads/${branch}`;
  const localBranchExistsResult = await executeGit(['show-ref', '--verify', '--quiet', localBranchRef], repoPath);
  if (localBranchExistsResult.exitCode === 0) {
    throw new CheckoutFailedError(repoPath, branch, checkoutResult.stderr);
  }

  const orphanCheckoutResult = await executeGit(['checkout', '--orphan', branch], repoPath);
  if (orphanCheckoutResult.exitCode !== 0) {
    throw new CheckoutFailedError(repoPath, branch, orphanCheckoutResult.stderr || checkoutResult.stderr);
  }

  const resetResult = await executeGit(['reset', '--hard'], repoPath);
  if (resetResult.exitCode !== 0) {
    throw new CheckoutFailedError(repoPath, branch, resetResult.stderr);
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
export async function getDiffFiles(repoPath: string, oldHash: string, newHash: string): Promise<DiffMarkdownFile[]> {
  const { stdout, stderr, exitCode } = await executeGit(['diff', '--name-status', oldHash, newHash], repoPath);
  if (exitCode !== 0) {
    throw new DiffError(stderr);
  }

  const isMarkdown = (filePath: string) => filePath.toLowerCase().endsWith('.md');
  const files = new Map<string, DiffMarkdownFile>();
  const lines = stdout.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) {
      continue;
    }

    const status = parts[0];

    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = parts[1];
      const newPath = parts[2];

      if (status.startsWith('R') && oldPath && isMarkdown(oldPath)) {
        files.set(oldPath, { file: oldPath, deleted: true });
      }

      if (newPath && isMarkdown(newPath)) {
        files.set(newPath, { file: newPath, deleted: false });
      }
      continue;
    }

    const filePath = parts[1];
    if (!filePath || !isMarkdown(filePath)) {
      continue;
    }

    files.set(filePath, { file: filePath, deleted: status === 'D' });
  }

  return Array.from(files.values()).sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Ensures the target directory is a git repository and on the correct branch.
 */
export async function initializeTargetRepo(repoPath: string, branch: string): Promise<void> {
  if (!(await isGitRepository(repoPath))) {
    await initRepository(repoPath);
  }
  await checkoutOrCreateBranch(repoPath, branch);
}
