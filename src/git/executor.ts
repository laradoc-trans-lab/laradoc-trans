import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitExecutableNotFoundError } from './';

const execFileAsync = promisify(execFile);

/**
 * A low-level executor for Git commands.
 * @param args An array of arguments for the git command.
 * @param repoPath The absolute path to the repository where the command should be executed.
 * @returns A promise that resolves with the command's stdout, stderr, and exit code.
 * @throws {GitExecutableNotFoundError} If the git command itself cannot be spawned (e.g., ENOENT).
 */
export async function executeGit(
  args: string[],
  repoPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: repoPath });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    if (typeof error.code !== 'number') {
      // This is a spawn error (e.g., ENOENT). It's a fatal setup issue.
      throw new GitExecutableNotFoundError();
    }

    // This is a standard git error (non-zero exit code).
    // We return the details for the caller to handle.
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code,
    };
  }
}
