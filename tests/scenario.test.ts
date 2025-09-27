import { main } from '../src/main';
import * as fs from 'fs-extra';
import * as path from 'path';
import { RepositoryNotFoundError } from '../src/git';
import { LlmApiQuotaError } from '../src/translator';
import * as llm from '../src/llm';
import * as translator from '../src/translator';
import { readProgressFile } from '../src/progress';

const PROJECT_ROOT = process.cwd();
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');
const TESTS_TMP_DIR = path.join(TESTS_DIR, 'tmp');
const WORKSPACE_PATH = path.join(TESTS_TMP_DIR, 'workspace');
const WORKSPACE_TEMPLATE = path.join(TESTS_DIR, 'fixtures', 'workspace-template');

// 設定環境變數，讓 main() 知道工作區的絕對路徑
process.env.WORKSPACE_PATH = WORKSPACE_PATH;

describe('Scenario Testing', () => {

  beforeAll(() => {
    // 隱藏測試期間的 console 輸出，讓結果更乾淨
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    // 恢復所有 mock
    jest.restoreAllMocks();
    delete process.env.WORKSPACE_PATH;
  });

  // 測試案例 1: 模擬用戶沒有準備 `workspace/repo/source`
  test('1. should exit with error if workspace/repo/source is not prepared', async () => {
    // 準備：清理上一次的執行，並建立一個空的 workspace
    await fs.remove(TESTS_TMP_DIR);
    await fs.ensureDir(WORKSPACE_PATH);

    const originalCwd = process.cwd();

    try {
      // 指示：執行 main() 時，CWD 必須是 tests 目錄
      process.chdir(TESTS_DIR);

      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--env', '.env.test'];
      
      // 驗證：main() 應該拋出 RepositoryNotFoundError
      await expect(main(argv)).rejects.toThrow(RepositoryNotFoundError);

    } finally {
      // 清理與準備下一個測試：建立一個完整的工作區
      process.chdir(originalCwd);
      await fs.copy(WORKSPACE_TEMPLATE, WORKSPACE_PATH);
      const sourceGitDistPath = path.join(WORKSPACE_PATH, 'repo', 'source', '.git-dist');
      const sourceGitPath = path.join(WORKSPACE_PATH, 'repo', 'source', '.git');
      if (await fs.pathExists(sourceGitDistPath)) {
        await fs.rename(sourceGitDistPath, sourceGitPath);
      }
    }
  });

  // 測試案例 2: 模擬 LLM API 因配額用盡而返回錯誤
  test('2. should throw LlmApiQuotaError when LLM API quota is exceeded', async () => {
    // 準備：使用 spyOn 來監視並修改 createLlmModel 的行為
    const spy = jest.spyOn(llm, 'createLlmModel');
    spy.mockImplementation(() => {
      return {
        model: {
          invoke: jest.fn().mockRejectedValue(new LlmApiQuotaError('API quota exceeded', 'DUMMY_KEY')),
        },
        modelInfo: 'mocked model',
        apiKeyUsed: 'DUMMY_KEY',
      } as unknown as llm.LlmModel;
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(TESTS_DIR);

      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--limit', '1', '--env', '.env.test'];

      // 驗證：main() 應該會失敗，並拋出 LlmApiQuotaError
      await expect(main(argv)).rejects.toThrow(LlmApiQuotaError);

    } finally {
      process.chdir(originalCwd);
      // 還原原始的函式實作
      spy.mockRestore();
    }
  });

  // 測試案例 3: 模擬成功翻譯一個檔案
  test('3. should translate one file successfully', async () => {
    // 準備：如同案例 2，使用 spyOn 模擬 createLlmModel
    const spyCreateLlmModel = jest.spyOn(llm, 'createLlmModel');
    spyCreateLlmModel.mockImplementation(() => {
      return {
        model: {
          // 直接回傳一個假的翻譯結果字串
          invoke: jest.fn().mockResolvedValue('[翻譯成功]'),
        },
        modelInfo: 'mocked model',
        apiKeyUsed: 'DUMMY_KEY',
      } as unknown as llm.LlmModel;
    });

    // 根據使用者指示，在第 97 行處加入對 translateContent 的模擬
    


    let translatedFile = '';
    const spyTranslateFile = jest.spyOn(translator, 'translateFile');
    spyTranslateFile.mockImplementation(async (sourceFilePath: string, promptFilePath?: string): Promise<string>  => {
        translatedFile = path.basename(sourceFilePath);
        const originalContent = await fs.readFile(sourceFilePath, 'utf-8');
        return `${originalContent}\n[翻譯成功]`;
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(TESTS_DIR);

      // 執行：再次執行翻譯，這次應該會成功
      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--limit', '1', '--env', '.env.test'];
      await main(argv);

      // 驗證：檢查結果檔案內容是否為我們模擬的假字串
      const translatedFilePath = path.join(WORKSPACE_PATH, 'tmp', translatedFile);
      await expect(fs.pathExists(translatedFilePath)).resolves.toBe(true);

      const originalFilePath = path.join(WORKSPACE_PATH, 'repo', 'source', translatedFile);
      const originalContent = await fs.readFile(originalFilePath, 'utf-8');
      const expectedContent = `${originalContent}\n[翻譯成功]`;
      const content = await fs.readFile(translatedFilePath, 'utf-8');
      expect(content).toBe(expectedContent);

      // 檢查進度檔案
      const progressAfter = await readProgressFile(path.join(WORKSPACE_PATH, 'tmp'));
      expect(progressAfter?.get(translatedFile)).toBe(1);

      // 驗證 target 目錄不應該存在該檔案
      const targetFilePath = path.join(WORKSPACE_PATH, 'repo', 'target', translatedFile);
      await expect(fs.pathExists(targetFilePath)).resolves.toBe(false);

    } finally {
      process.chdir(originalCwd);
      spyCreateLlmModel.mockRestore();
      spyTranslateFile.mockRestore();
    }
  });

  // 測試案例 4: 模擬成功翻譯二個檔案
  test('4. should translate two files successfully', async () => {
    const spyCreateLlmModel = jest.spyOn(llm, 'createLlmModel');
    spyCreateLlmModel.mockImplementation(() => {
      return {
        model: {
          invoke: jest.fn().mockResolvedValue('[翻譯成功]'),
        },
        modelInfo: 'mocked model',
        apiKeyUsed: 'DUMMY_KEY',
      } as unknown as llm.LlmModel;
    });

    const translatedFiles: string[] = [];
    const spyTranslateFile = jest.spyOn(translator, 'translateFile');
    spyTranslateFile.mockImplementation(async (sourceFilePath: string, promptFilePath?: string): Promise<string> => {
      const filename = path.basename(sourceFilePath);
      translatedFiles.push(filename);
      const originalContent = await fs.readFile(sourceFilePath, 'utf-8');
      return `${originalContent}\n[翻譯成功]`;
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(TESTS_DIR);

      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--limit', '2', '--env', '.env.test'];
      await main(argv);

      expect(translatedFiles.length).toBe(2);

      for (const translatedFile of translatedFiles) {
        // 驗證 tmp 檔案
        const translatedFilePath = path.join(WORKSPACE_PATH, 'tmp', translatedFile);
        await expect(fs.pathExists(translatedFilePath)).resolves.toBe(true);

        const originalFilePath = path.join(WORKSPACE_PATH, 'repo', 'source', translatedFile);
        const originalContent = await fs.readFile(originalFilePath, 'utf-8');
        const expectedContent = `${originalContent}\n[翻譯成功]`;
        const content = await fs.readFile(translatedFilePath, 'utf-8');
        expect(content).toBe(expectedContent);

        // 驗證 target 目錄不應該存在該檔案
        const targetFilePath = path.join(WORKSPACE_PATH, 'repo', 'target', translatedFile);
        await expect(fs.pathExists(targetFilePath)).resolves.toBe(false);
      }

      // 檢查進度檔案
      const progressAfter = await readProgressFile(path.join(WORKSPACE_PATH, 'tmp'));
      // 案例 3 翻譯了一個，案例 4 翻譯了兩個，所以總共應該有 3 個檔案狀態為 1
      const completedCount = Array.from(progressAfter?.values() || []).filter(status => status === 1).length;
      expect(completedCount).toBe(3);
      expect(progressAfter?.get(translatedFiles[0])).toBe(1);
      expect(progressAfter?.get(translatedFiles[1])).toBe(1);

    } finally {
      process.chdir(originalCwd);
      spyCreateLlmModel.mockRestore();
      spyTranslateFile.mockRestore();
    }
  });
});
