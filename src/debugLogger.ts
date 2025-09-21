import fs from 'fs/promises';
import path from 'path';

/**
 * Appends a message to the debug log file if debug mode is enabled.
 * @param message The message to log.
 */
export async function debugLog(message: string): Promise<void> {
  if (process.env.DEBUG_MODE !== 'true') {
    return;
  }

  try {
    const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), 'workspace');
    const logDirPath = path.join(workspacePath, 'logs');
    const logFilePath = path.join(logDirPath, 'debug.log');

    // Ensure the logs directory exists
    await fs.mkdir(logDirPath, { recursive: true });

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n\n`;

    await fs.appendFile(logFilePath, logMessage);
  } catch (error) {
    // Log errors to stderr to not silently fail, but don't crash the main process
    console.error('Failed to write to debug log:', error);
  }
}
