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
 * 使用 Gemini CLI 翻譯單一 markdown 檔案。
 * @param sourceFilePath 要翻譯的來源 markdown 檔案的絕對路徑。
 * @returns 清理過的、已翻譯的 markdown 內容。
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
      // Gemini CLI 有時會將非錯誤資訊（例如 "Loaded cached credentials"）輸出到 stderr。
      // 因此，我們優先判斷結束代碼以及 stdout 是否有有效的內容。
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

      // 如果程式執行到這裡，表示發生了錯誤。
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
