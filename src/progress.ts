import fs from 'fs/promises';
import path from 'path';

export type Progress = Map<string, 0 | 1 | 2>; // 0: pending, 1: done, 2: failed

const SOURCE_COMMIT_FILE = '.source_commit';
const PROGRESS_FILE = '.progress';

/**
 * Reads the source commit hash from the .source_commit file in the target directory.
 * @param targetPath Absolute path to the target repository.
 * @returns The commit hash string, or null if the file doesn't exist.
 */
export async function readSourceCommit(targetPath: string): Promise<string | null> {
  const filePath = path.join(targetPath, SOURCE_COMMIT_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Writes the source commit hash to the .source_commit file in the target directory.
 * @param targetPath Absolute path to the target repository.
 * @param hash The commit hash to write.
 */
export async function writeSourceCommit(targetPath: string, hash: string): Promise<void> {
  const filePath = path.join(targetPath, SOURCE_COMMIT_FILE);
  await fs.writeFile(filePath, hash);
}

/**
 * Reads and parses the .progress file from the tmp directory.
 * @param tmpPath Absolute path to the tmp directory.
 * @returns A Map representing the progress, or null if the file doesn't exist.
 */
export async function readProgressFile(tmpPath: string): Promise<Progress | null> {
  const filePath = path.join(tmpPath, PROGRESS_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const progress: Progress = new Map();
    for (const line of lines) {
      if (!line) continue;
      const [file, status] = line.split(' = ');
      progress.set(file, parseInt(status, 10) as 0 | 1 | 2);
    }
    return progress;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Writes the progress map to the .progress file in the tmp directory.
 * @param tmpPath Absolute path to the tmp directory.
 * @param progress The progress map to write.
 */
export async function writeProgressFile(tmpPath: string, progress: Progress): Promise<void> {
  const filePath = path.join(tmpPath, PROGRESS_FILE);
  let content = '';
  for (const [file, status] of progress.entries()) {
    content += `${file} = ${status}\n`;
  }
  await fs.writeFile(filePath, content.trim());
}

/**
 * Deletes all files in the tmp directory.
 * As per spec, this is used when rebuilding the progress file.
 * @param tmpPath Absolute path to the tmp directory.
 */
export async function cleanTmpDirectory(tmpPath: string): Promise<void> {
  try {
    const files = await fs.readdir(tmpPath);
    for (const file of files) {
      await fs.unlink(path.join(tmpPath, file));
    }
    console.log(`Cleaned tmp directory: ${tmpPath}`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return; // Directory doesn't exist, which is fine.
    }
    throw error;
  }
}
