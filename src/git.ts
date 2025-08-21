import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function git(command: string, repoPath: string) {
  return await execAsync(command, { cwd: repoPath });
}

/**
 * Checks if a given directory path is a Git repository.
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  if (!require('fs').existsSync(dirPath)) return false;
  try {
    const { stdout } = await git('git rev-parse --is-inside-work-tree', dirPath);
    return stdout.trim() === 'true';
  } catch (error) {
    return false;
  }
}

/**
 * Initializes a new Git repository in the given path.
 */
async function init(repoPath: string): Promise<void> {
  try {
    await git('git init', repoPath);
    console.log(`Initialized empty Git repository in ${repoPath}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to initialize git repository in ${repoPath}: ${message}`);
  }
}

/**
 * Switches the Git repository to a specific branch. Creates the branch if it doesn't exist.
 */
export async function checkoutOrCreateBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await git(`git checkout -B ${branch}`, repoPath);
    console.log(`Switched to branch '${branch}' in ${repoPath}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to checkout branch '${branch}' in ${repoPath}: ${message}`);
  }
}

/**
 * Switches the Git repository to a specific branch.
 */
export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await git(`git checkout ${branch}`, repoPath);
    console.log(`Switched to branch '${branch}' in ${repoPath}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to checkout branch '${branch}' in ${repoPath}: ${message}`);
  }
}

/**
 * Gets the current commit hash of the repository.
 */
export async function getCurrentCommitHash(repoPath: string): Promise<string> {
  try {
    const { stdout } = await git('git rev-parse HEAD', repoPath);
    return stdout.trim();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get current commit hash in ${repoPath}: ${message}`);
  }
}

/**
 * Lists all markdown files in the repository.
 * @param repoPath The absolute path to the repository.
 * @returns A list of markdown file paths relative to the repo root.
 */
export async function listMarkdownFiles(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await git("git ls-files '*.md'", repoPath);
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to list markdown files in ${repoPath}: ${message}`);
  }
}

/**
 * Gets a list of changed markdown files between two commits.
 * @param repoPath The absolute path to the repository.
 * @param oldHash The old commit hash.
 * @param newHash The new commit hash.
 * @returns A list of changed markdown file paths.
 */
export async function getDiffFiles(repoPath: string, oldHash: string, newHash: string): Promise<string[]> {
  try {
    const { stdout } = await git(`git diff --name-only ${oldHash} ${newHash}`, repoPath);
    return stdout.trim().split('\n').filter(line => line.endsWith('.md'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get diff between ${oldHash} and ${newHash}: ${message}`);
  }
}

/**
 * Ensures the target directory is a git repo and on the correct branch.
 */
export async function initializeTargetRepo(repoPath: string, branch: string): Promise<void> {
  if (!(await isGitRepository(repoPath))) {
    await init(repoPath);
  }
  await checkoutOrCreateBranch(repoPath, branch);
}
