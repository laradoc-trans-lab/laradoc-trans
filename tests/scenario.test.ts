import { main } from '../src/main';
import * as fs from 'fs-extra';
import * as path from 'path';
import { RepositoryNotFoundError } from '../src/git';

// 模擬 langchain，使其不真正執行 LLM API 呼叫
jest.mock('@langchain/core/prompts');
jest.mock('@langchain/google-genai');

const PROJECT_ROOT = process.cwd();
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');
const TESTS_TMP_DIR = path.join(TESTS_DIR, 'tmp');
const WORKSPACE_PATH = path.join(TESTS_TMP_DIR, 'workspace');
const WORKSPACE_TEMPLATE = path.join(TESTS_DIR, 'fixtures', 'workspace-template');

// 設定環境變數，讓 main() 知道工作區的絕對路徑
process.env.WORKSPACE_PATH = WORKSPACE_PATH;

describe('Scenario Testing', () => {

  // 根據 TESTING.md，測試之間共享狀態，不使用 beforeAll/afterAll 清理。
  // 第一個測試案例負責初始設定。

  afterAll(() => {
    // 根據舊測試案例的精神，不清除 tmp 目錄，以便手動檢查
    delete process.env.WORKSPACE_PATH;
  });

  // 測試案例 1: 模擬用戶沒有準備 `workspace/repo/source`
  test('should exit with error if workspace/repo/source is not prepared', async () => {
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
});