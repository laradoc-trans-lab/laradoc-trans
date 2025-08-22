import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { _ } from './i18n';

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
    console.error(_('Fatal: Could not read TRANSLATE_PROMPT.md file.'));
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
  const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
  const fullPrompt = `${prompt}\n\n---\n\n${fileContent}`;

  const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  console.log(_('Using model: {{model}}', { model: geminiModel }));

  return new Promise((resolve, reject) => {
    const gemini = spawn('gemini', ['-p', '-m', geminiModel], { stdio: 'pipe' });

    let stdoutData = '';
    let stderrData = '';
    let receivedBytes = 0;

    gemini.stdout.on('data', (data) => {
      stdoutData += data.toString();
      receivedBytes += data.length;
      // 使用 process.stdout.write 和 \r 來在同一行更新進度
      process.stdout.write(_('Receiving... {{bytes}} bytes', { bytes: receivedBytes }) + '\r');
    });

    gemini.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    gemini.on('close', (code) => {
      // 清除進度指示器所在的行，為最終狀態訊息做準備
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);

      // Gemini CLI 有時會將非錯誤資訊（例如 "Loaded cached credentials"）輸出到 stderr。
      // 因此，我們優先判斷結束代碼以及 stdout 是否有有效的內容。
      if (code === 0 && stdoutData) {
        const successMarker = '<!-- GEMINI_TRANSLATION_SUCCESS -->';
        const markerIndex = stdoutData.indexOf(successMarker);

        if (markerIndex !== -1) {
          const cleanedOutput = stdoutData
            .substring(markerIndex + successMarker.length)
            .trimStart();
          return resolve(cleanedOutput);
        } else {
          return reject(
            new Error(
              _(
                'Translation failed: Success marker not found in the output. Output: {{output}}',
                { output: stdoutData }
              )
            )
          );
        }
      }

      // 如果程式執行到這裡，表示發生了錯誤。
      if (stderrData) {
        return reject(new Error(_('Gemini CLI Error (stderr): {{message}}', { message: stderrData.trim() })));
      }
      if (code !== 0) {
        return reject(new Error(_('Gemini CLI exited with code {{code}}', { code: code })));
      }
      return reject(new Error(_('Gemini CLI provided no output and no error code.')));
    });

    gemini.on('error', (err) => {
      reject(new Error(_('Failed to start Gemini CLI: {{message}}. Is it installed and in your PATH?', { message: err.message })));
    });

    gemini.stdin.write(fullPrompt);
    gemini.stdin.end();
  });
}