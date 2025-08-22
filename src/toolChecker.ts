import { spawn } from 'child_process';
import { _ } from './i18n';

export async function checkToolExistence(toolName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `${toolName} -v`;
    const child = spawn(toolName, ['-v'], { shell: true });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(_(`Tool '${toolName}' not found. Please ensure it is installed and in your system's PATH.`)));
      } else {
        reject(new Error(_(`Failed to check '${toolName}' existence: {{message}}`, { message: err.message })));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const lowerCaseErrorOutput = errorOutput.toLowerCase();
        if (lowerCaseErrorOutput.includes('not found') || lowerCaseErrorOutput.includes('no such file or directory')) {
          reject(new Error(_(`Tool '${toolName}' not found. Please ensure it is installed and in your system's PATH.`)));
        } else {
          reject(new Error(_(`Failed to check '${toolName}' existence. Exit code: {{code}}. Output: {{output}}. Error: {{errorOutput}}`, { code: code, output: output.trim(), errorOutput: errorOutput.trim() })));
        }
      }
    });
  });
}
