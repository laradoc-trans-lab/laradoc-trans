import fs from 'fs/promises';
import path from 'path';
import { isGitRepository } from './git';

export interface WorkspacePaths {
  root: string;
  source: string;
  target: string;
  tmp: string;
  logs: string;
}

/**
 * Initializes the workspace by verifying the source repository and creating necessary directories.
 * @returns An object containing the absolute paths of the workspace directories.
 */
export async function initializeWorkspace(): Promise<WorkspacePaths> {
  const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), 'workspace');

  const paths: WorkspacePaths = {
    root: workspacePath,
    source: path.join(workspacePath, 'repo', 'source'),
    target: path.join(workspacePath, 'repo', 'target'),
    tmp: path.join(workspacePath, 'tmp'),
    logs: path.join(workspacePath, 'logs'),
  };

  // 1. Check if the source directory is a valid Git repository.
  const sourceIsRepo = await isGitRepository(paths.source);
  if (!sourceIsRepo) {
    throw new Error(`Source directory not found or is not a valid Git repository: ${paths.source}`);
  }

  // 2. Create tmp, logs, and target directories if they don't exist.
  await fs.mkdir(paths.target, { recursive: true });
  await fs.mkdir(paths.tmp, { recursive: true });
  await fs.mkdir(paths.logs, { recursive: true });

  console.log(`Workspace initialized at: ${workspacePath}`);
  return paths;
}
