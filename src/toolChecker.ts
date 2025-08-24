import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * A custom error class for when a required command-line tool is not found.
 */
export class ToolNotFoundError extends Error {
  /**
   * The name of the tool that was not found.
   */
  public readonly toolName: string;

  constructor(toolName: string) {
    const message = `Tool '${toolName}' not found. Please ensure it is installed and in your system's PATH.`;
    super(message);
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
  }
}

export async function checkToolExistence(toolName: string): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync(toolName, ['-v']);
    return Promise.resolve();
  } catch (error: any) {
    return Promise.reject(new ToolNotFoundError(toolName));
  }
}
