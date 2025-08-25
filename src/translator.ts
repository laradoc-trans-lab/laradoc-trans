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

let basePrompt: string | null = null;

async function getBasePrompt(): Promise<string> {
  if (basePrompt) {
    return basePrompt;
  }
  try {
    const promptPath = path.resolve(__dirname, '..', 'TRANSLATE_PROMPT.md');
    basePrompt = await fs.readFile(promptPath, 'utf-8');
    return basePrompt;
  } catch (error: any) {
    console.error(_('Fatal: Could not read TRANSLATE_PROMPT.md file.'));
    throw new PromptFileReadError(_('Failed to read TRANSLATE_PROMPT.md: {{message}}', { message: error.message }), error);
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
    // 沒辦法通過 jest 測試，只好這樣搞了
    console.debug("DEBUG: GEMINI_MOCK_BEHAVIOR is set, using mock gemini binary.");
    return spawn(path.resolve(__dirname, '../tests/bin/gemini'), args || [], options);
  }
  return spawn(command, args, options);
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
        const successMarker = '<!-- GEMINI_TRANSLATION_SUCCESS -->';
        const markerIndex = stdoutData.indexOf(successMarker);

        if (markerIndex !== -1) {
          const cleanedOutput = stdoutData
            .substring(markerIndex + successMarker.length)
            .trimStart();
          return resolve(cleanedOutput);
        } else {
          return reject(
            new TranslationMarkerNotFoundError(
              _(
                'Translation failed: Success marker not found in the output. Output: {{output}}',
                { output: stdoutData }
              ),
              stdoutData
            )
          );
        }
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