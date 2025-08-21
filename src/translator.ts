import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

let basePrompt: string | null = null;

async function getBasePrompt(): Promise<string> {
  if (basePrompt) {
    return basePrompt;
  }
  try {
    const promptPath = path.resolve(process.cwd(), 'TRANSLATE_PROMPT.md');
    basePrompt = await fs.readFile(promptPath, 'utf-8');
    return basePrompt;
  } catch (error) {
    console.error('Fatal: Could not read TRANSLATE_PROMPT.md file.');
    throw error;
  }
}

/**
 * Translates a single markdown file using the Gemini CLI.
 * @param sourceFilePath Absolute path to the source markdown file.
 * @returns The cleaned, translated markdown content.
 */
export async function translateFile(sourceFilePath: string): Promise<string> {
  const prompt = await getBasePrompt();
  const fullPrompt = `${prompt}\n\n請翻譯檔案：'${sourceFilePath}'`;

  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  return new Promise((resolve, reject) => {
    const gemini = spawn('gemini', ['-p', '-m', geminiModel], { stdio: 'pipe' });

    let stdoutData = '';
    let stderrData = '';

    gemini.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    gemini.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    gemini.on('close', (code) => {
      // The Gemini CLI sometimes prints non-error info (like "Loaded cached credentials") to stderr.
      // Therefore, we prioritize the exit code and the presence of valid stdout content.
      if (code === 0 && stdoutData) {
        const firstHeadingIndex = stdoutData.indexOf('#');
        if (firstHeadingIndex === -1) {
          return reject(
            new Error(`Translation failed: No markdown heading found in the output. Output: ${stdoutData}`)
          );
        }
        const cleanedOutput = stdoutData.substring(firstHeadingIndex);
        return resolve(cleanedOutput);
      }

      // If we are here, something went wrong.
      if (stderrData) {
        return reject(new Error(`Gemini CLI Error (stderr): ${stderrData.trim()}`));
      }
      if (code !== 0) {
        return reject(new Error(`Gemini CLI exited with code ${code}`));
      }
      return reject(new Error('Gemini CLI provided no output and no error code.'));
    });

    gemini.on('error', (err) => {
      reject(new Error(`Failed to start Gemini CLI: ${err.message}. Is it installed and in your PATH?`));
    });

    gemini.stdin.write(fullPrompt);
    gemini.stdin.end();
  });
}