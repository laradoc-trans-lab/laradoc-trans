import { ChildProcessWithoutNullStreams, spawn, SpawnOptionsWithoutStdio } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { _ } from './i18n';

// Custom Error Classes
export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

export class PromptFileReadError extends TranslationError {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'PromptFileReadError';
    if (originalError) {
      this.stack = originalError.stack; // Preserve original stack trace
    }
  }
}

export class GeminiCliError extends TranslationError {
  constructor(message: string, public code?: number | null, public stderr?: string) {
    super(message);
    this.name = 'GeminiCliError';
  }
}

export class TranslationMarkerNotFoundError extends GeminiCliError {
  constructor(message: string, public output: string) {
    super(message);
    this.name = 'TranslationMarkerNotFoundError';
  }
}

export class GeminiCliNoOutputError extends GeminiCliError {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiCliNoOutputError';
  }
}

export class GeminiCliStartError extends GeminiCliError {
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'GeminiCliStartError';
    if (originalError) {
      this.stack = originalError.stack; // Preserve original stack trace
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

let cachedPromptPath: string | null = null;
let cachedPrompt: string | null = null;

async function getBasePrompt(promptFilePath?: string): Promise<string> {
  const defaultPromptPath = path.resolve(__dirname, '..', 'resources', 'TRANSLATE_PROMPT.md');
  const finalPromptPath = promptFilePath ? path.resolve(promptFilePath) : defaultPromptPath;

  if (cachedPromptPath === finalPromptPath && cachedPrompt) {
    return cachedPrompt;
  }

  try {
    const prompt = await fs.readFile(finalPromptPath, 'utf-8');
    cachedPromptPath = finalPromptPath;
    cachedPrompt = prompt;
    return prompt;
  } catch (error: any) {
    const errorMessage = _('Failed to read prompt file: {{path}}', { path: finalPromptPath });
    throw new PromptFileReadError(`${errorMessage}: ${error.message}`, error);
  }
}

/**
 * 這是一個包裝 spawn 的函式，主要目的是為了方便在測試時替換 spawn 行為。
 * @param command
 * @param args 
 * @param options 
 * @returns 
 */
export function spawnWrapper (
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithoutStdio,
): ChildProcessWithoutNullStreams {
  if(process.env.GEMINI_MOCK_BEHAVIOR !== undefined) {
    // JEST 無法 mock 這個 function , 所以取巧地用環境變數來判斷
    // 在測試環境中，使用模擬的 gemini 可執行檔
    const mergedEnv = { ...process.env, ...options?.env, 'GEMINI_MOCK_BEHAVIOR': process.env.GEMINI_MOCK_BEHAVIOR };
    const newOptions = { ...options, env: mergedEnv };

    return spawn(path.resolve(__dirname, '../tests/bin/gemini'), args, newOptions);
  }
  return spawn(command, args, options);
}

/**
 * 使用 Gemini CLI 翻譯單一 markdown 檔案。
 * @param sourceFilePath 要翻譯的來源 markdown 檔案的絕對路徑。
 * @param promptFilePath 可選的，指定一個檔案作為翻譯的提示詞。
 * @returns 清理過的、已翻譯的 markdown 內容。
 */
export async function translateFile(sourceFilePath: string, promptFilePath?: string): Promise<string> {
  const prompt = await getBasePrompt(promptFilePath);
  const fileContent = await fs.readFile(sourceFilePath, 'utf-8');
  const fullPrompt = `${prompt}\n\n---\n\n${fileContent}`;

  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log(_('Using model: {{model}}', { model: geminiModel }));

  return new Promise((resolve, reject) => {
    const gemini = spawnWrapper('gemini', ['-p', '-m', geminiModel], { stdio: 'pipe' });

    let stdoutData = '';
    let stderrData = '';
    let receivedBytes = 0;

    gemini.stdout.on('data', (data) => {
      stdoutData += data.toString();
      receivedBytes += data.length;
      // 使用 process.stdout.write 和 \r 來在同一行更新進度。
      // 這些操作僅在 process.stdout 連接到 TTY (終端機) 時才有效。
      // 在非 TTY 環境 (例如測試或管道輸出) 中，這些函式不可用，呼叫它們會拋出 TypeError。
      // 因此，我們在嘗試使用它們之前檢查 process.stdout.isTTY。
      if (process.stdout.isTTY) {
        process.stdout.write(_('Receiving... {{bytes}} bytes', { bytes: receivedBytes }) + '\r');
      }
    });

    gemini.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    gemini.on('close', (code) => {
      // 清除進度指示器所在的行，為最終狀態訊息做準備。
      // 與 process.stdout.write 和 \r 類似，這些函式僅在 process.stdout 連接到 TTY 時才有效。
      // 我們檢查 process.stdout.isTTY 以防止在非 TTY 環境中出現 TypeError。
      if (process.stdout.isTTY) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      }

      // Gemini CLI 有時會將非錯誤資訊（例如 "Loaded cached credentials"）輸出到 stderr。
      // 因此，我們優先判斷結束代碼以及 stdout 是否有有效的內容。
      if (code === 0 && stdoutData) {
        const beginMarker = '<!-- GEMINI_TRANSLATION_BEGIN -->';
        const endMarker = '<!-- GEMINI_TRANSLATION_END -->';

        const beginIndex = stdoutData.indexOf(beginMarker);
        const endIndex = stdoutData.lastIndexOf(endMarker);

        if (beginIndex === -1) {
          return reject(
            new TranslationMarkerNotFoundError(
              _(
                'Translation failed: Begin marker not found in the output. Output: {{output}}',
                { output: stdoutData }
              ),
              stdoutData
            )
          );
        }

        if (endIndex === -1) {
          return reject(
            new TranslationMarkerNotFoundError(
              _(
                'Translation failed: End marker not found in the output. Output: {{output}}',
                { output: stdoutData }
              ),
              stdoutData
            )
          );
        }

        const startIndex = beginIndex + beginMarker.length;
        const cleanedOutput = stdoutData.substring(startIndex, endIndex).trim();
        return resolve(cleanedOutput);
      }

      // 如果程式執行到這裡，表示發生了錯誤。
      if (stderrData) {
        return reject(new GeminiCliError(_('Gemini CLI Error (stderr): {{message}}', { message: stderrData.trim() }), code, stderrData));
      }
      if (code !== 0) {
        return reject(new GeminiCliError(_('Gemini CLI exited with code {{code}}', { code: code }), code));
      }
      return reject(new GeminiCliNoOutputError(_('Gemini CLI provided no output and no error code.')));
    });

    gemini.on('error', (err) => {
      reject(new GeminiCliStartError(_('Failed to start Gemini CLI: {{message}}. Is it installed and in your PATH?', { message: err.message }), err));
    });

    gemini.stdin.write(fullPrompt);
    gemini.stdin.end();
  });
}