import { main } from '../src/main';
import * as fs from 'fs-extra';
import * as path from 'path';
import { RepositoryNotFoundError, getCurrentCommitHash } from '../src/git';
import { LlmApiQuotaError } from '../src/translator';
import * as llm from '../src/llm';
import * as translator from '../src/translator';
import { readProgressFile } from '../src/progress';
import { executeGit } from '../src/git/executor';

const PROJECT_ROOT = process.cwd();
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');
const TESTS_TMP_DIR = path.join(TESTS_DIR, 'tmp');
const WORKSPACE_PATH = path.join(TESTS_TMP_DIR, 'workspace');
const WORKSPACE_TEMPLATE = path.join(TESTS_DIR, 'fixtures', 'workspace-template');

// 設定環境變數，讓 main() 知道工作區的絕對路徑
process.env.WORKSPACE_PATH = WORKSPACE_PATH;

describe('Scenario Testing for command `laradoc-trans run ...`', () => {

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

  // 測試案例 5: 應翻譯所有剩餘檔案並將它們移動到 target
  test('5. should translate all remaining files and move them to target', async () => {
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

    const spyTranslateFile = jest.spyOn(translator, 'translateFile');
    spyTranslateFile.mockImplementation(async (sourceFilePath: string, promptFilePath?: string): Promise<string> => {
      const originalContent = await fs.readFile(sourceFilePath, 'utf-8');
      return `${originalContent}\n[翻譯成功]`;
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(TESTS_DIR);

      const sourceRepoPath = path.join(WORKSPACE_PATH, 'repo', 'source');
      const allSourceFiles = (await fs.readdir(sourceRepoPath)).filter((f: string) => f.endsWith('.md'));

      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--all', '--env', '.env.test'];
      await main(argv);

      const targetRepoPath = path.join(WORKSPACE_PATH, 'repo', 'target');

      for (const file of allSourceFiles) {
        const targetFilePath = path.join(targetRepoPath, file);
        await expect(fs.pathExists(targetFilePath)).resolves.toBe(true);

        const originalFilePath = path.join(sourceRepoPath, file);
        const originalContent = await fs.readFile(originalFilePath, 'utf-8');

        const translatedContent = await fs.readFile(targetFilePath, 'utf-8');

        // license.md and readme.md are copied, not translated.
        if (file === 'license.md' || file === 'readme.md') {
          expect(translatedContent).toBe(originalContent);
        } else {
          const expectedContent = `${originalContent}\n[翻譯成功]`;
          expect(translatedContent).toBe(expectedContent);
        }
      }

      // 驗證 .source_commit 是否存在
      const commitFilePath = path.join(targetRepoPath, '.source_commit');
      await expect(fs.pathExists(commitFilePath)).resolves.toBe(true);

      // 驗證 tmp 目錄是否已被清空
      const tmpFiles = await fs.readdir(path.join(WORKSPACE_PATH, 'tmp'));
      // .progress file might still exist, but it should be empty of markdown files
      const markdownFiles = tmpFiles.filter((f: string) => f.endsWith('.md'));
      expect(markdownFiles.length).toBe(0);

    } finally {
      process.chdir(originalCwd);
      spyCreateLlmModel.mockRestore();
      spyTranslateFile.mockRestore();
    }
  });

  // 測試案例 6: 當 source 更新時，應只翻譯有變動的檔案
  test('6. should translate only changed files when source is updated', async () => {
    const sourceRepoPath = path.join(WORKSPACE_PATH, 'repo', 'source');
    const targetRepoPath = path.join(WORKSPACE_PATH, 'repo', 'target');

    // --- Setup Target Repo ---
    await executeGit(['add', '.'], targetRepoPath);
    await executeGit(['commit', '-m', 'Initial translation'], targetRepoPath);
    await executeGit(['checkout', '-b', 'test1-branch'], targetRepoPath);

    // --- Setup Source Repo ---
    await executeGit(['checkout', '-b', 'test1-branch'], sourceRepoPath);
    await fs.appendFile(path.join(sourceRepoPath, 'test2.md'), '\n[已修改]');
    await fs.appendFile(path.join(sourceRepoPath, 'test5.md'), '\n[已修改]');
    await executeGit(['add', '.'], sourceRepoPath);
    await executeGit(['commit', '-m', 'Update source files'], sourceRepoPath);
    
    const spyCreateLlmModel = jest.spyOn(llm, 'createLlmModel');
    spyCreateLlmModel.mockImplementation(() => {
      return {
        model: {
          invoke: jest.fn().mockResolvedValue('[差異翻譯成功]'),
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
      return `${originalContent}\n[差異翻譯成功]`;
    });

    const originalCwd = process.cwd();
    try {
      process.chdir(TESTS_DIR);

      const argv = ['node', '../dist/main.js', 'run', '--branch', 'test1-branch', '--all', '--env', '.env.test'];
      await main(argv);

      // --- Verification ---
      expect(translatedFiles.length).toBe(2);
      expect(translatedFiles).toContain('test2.md');
      expect(translatedFiles).toContain('test5.md');

      // 驗證已修改的檔案
      for (const file of ['test2.md', 'test5.md']) {
        const translatedFilePath = path.join(targetRepoPath, file);
        const content = await fs.readFile(translatedFilePath, 'utf-8');
        expect(content).toContain('\n[已修改]\n[差異翻譯成功]');
      }

      // 驗證未修改的檔案
      const unchangedContent = await fs.readFile(path.join(targetRepoPath, 'test1.md'), 'utf-8');
      expect(unchangedContent).not.toContain('[差異翻譯成功]');
      expect(unchangedContent).toContain('[翻譯成功]'); // Should have content from test case 5

      // 驗證 commit hash
      const sourceCommitHash = await getCurrentCommitHash(sourceRepoPath);
      const targetCommitHash = await fs.readFile(path.join(targetRepoPath, '.source_commit'), 'utf-8');
      expect(targetCommitHash.trim()).toBe(sourceCommitHash);

    } finally {
      process.chdir(originalCwd);
      spyCreateLlmModel.mockRestore();
      spyTranslateFile.mockRestore();
    }
  });
});
