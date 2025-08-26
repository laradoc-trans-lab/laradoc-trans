import * as fs from 'fs/promises';
import * as path from 'path';
import { main } from '../src/main';
import { RepositoryNotFoundError } from '../src/git';
import { GeminiCliError } from '../src/translator';
import { readProgressFile } from '../src/progress';


// Mock process.exit to prevent the test from exiting the process
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  // Instead of exiting, do nothing
  // console.log(`process.exit was called with code: ${code}`); // Optional: keep for debugging if needed
  return undefined as never; // Return undefined to satisfy the never type
});



describe('Scenario Tests', () => {
  let originalEnvPath: string | undefined;
  let originalWorkspacePath: string | undefined;
  const workspaceTemplatePath = path.resolve(__dirname, 'fixtures', 'workspace-template'); // 工作區範本目錄
  const testsTmpDir = path.resolve(__dirname, 'tmp'); // 測試用暫存目錄
  let workspacePathForTests: string; // Path to the workspace within tests/tmp


  // Increase timeout for all tests in this describe block
  jest.setTimeout(100000); // Set timeout to 10 seconds

  beforeAll(async () => {
    // Store original environment variables
    originalEnvPath = process.env.PATH;
    originalWorkspacePath = process.env.WORKSPACE_PATH;

    // 測試前清除 tests/tmp 目錄
    console.log('DEBUG: Cleaning up tests/tmp directory before all tests:', testsTmpDir);
    await fs.rm(testsTmpDir, { recursive: true, force: true }).catch(() => {}); // Use catch to avoid error if dir doesn't exist
    await fs.mkdir(testsTmpDir, { recursive: true }); // Recreate tests/tmp
    console.log('DEBUG: tests/tmp cleaned up and recreated.');

    // Set the workspace path for tests
    workspacePathForTests = path.join(testsTmpDir, 'workspace');

    // Set WORKSPACE_PATH for the entire suite
    process.env.WORKSPACE_PATH = workspacePathForTests;

    // Add the fake gemini bin directory to the PATH
    process.env.PATH = `${path.resolve(__dirname, 'bin')}${path.delimiter}${originalEnvPath}`;
  });

  beforeEach(async () => {
    // Reset mocks before each test
    mockExit.mockClear();

    // No git mocks here, as we are using real git
  });

  afterEach(async () => {
    // Do NOT clean up tests/tmp or its contents.
    // Restore original environment variables (PATH and WORKSPACE_PATH are handled by beforeAll/afterAll)
    if (originalEnvPath !== undefined) {
      process.env.PATH = originalEnvPath;
    }
    if (originalWorkspacePath !== undefined) {
      process.env.WORKSPACE_PATH = originalWorkspacePath;
    }
    jest.restoreAllMocks(); // Restore all mocks after each test
  });

  afterAll(async () => {
    // Do NOT clean up tests/tmp here. User will manually inspect it.
    // Restore original implementations after all tests
    mockExit.mockRestore();
  });

  // Scenario 1: 模擬用戶沒有準備 workspace/repo/source
  test('should exit with error if workspace/repo/source is not prepared', async () => {
    // Ensure tests/tmp/workspace is empty for this test
    await fs.rm(workspacePathForTests, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(workspacePathForTests, { recursive: true });

    const argv = ['node', 'dist/main.js', '--branch', 'test1-branch', '--env', '../tests/.env.test'];

    await expect(main(argv)).rejects.toThrow(RepositoryNotFoundError);
  });

  //  Scenario 2: 模擬 gemini 指令失敗
  test('should exit with error if gemini command fails', async () => {
    // Prepare workspace/repo/source with a git repo
    await fs.mkdir(workspacePathForTests, { recursive: true });
    // Copy the workspace template to the test workspace
    await fs.cp(workspaceTemplatePath, workspacePathForTests, { recursive: true });

    process.env.GEMINI_MOCK_BEHAVIOR = 'error'; // Set mock behavior to error
    const argv = ['node', 'dist/main.js', '--branch', 'test1-branch', '--env', '../tests/.env.test'];
    await expect(main(argv)).rejects.toThrow(GeminiCliError);
  });

  // Scenario 3: 模擬翻譯一個檔案，但 gemini 返回正確的翻譯內容
  test('should translate a single file successfully when gemini command succeeds', async () => {
    // 設定模擬 gemini 的行為
    process.env.GEMINI_MOCK_BEHAVIOR = 'success';
    const argv = ['node', 'dist/main.js', '--branch', 'test1-branch', '--env', '../tests/.env.test'];

    // 執行 main
    await main(argv);

    // 檢查進度檔案
    const progress = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    expect(progress?.get('test1.md')).toBe(1);

    // 檢查翻譯後的檔案是否存在於 tmp
    const translatedFilePath = path.join(workspacePathForTests, 'tmp', 'test1.md');
    const translatedContent = await fs.readFile(translatedFilePath, 'utf-8');

    // 檢查翻譯後的內容
    expect(translatedContent).toContain('# 翻譯測試標題');
    expect(translatedContent).toContain('這是一個翻譯測試的內容。');

    // 檢查 target 目錄不應該存在 'test1.md'
    const targetFilePath = path.join(workspacePathForTests, 'repo', 'target', 'test1.md');
    await expect(fs.access(targetFilePath)).rejects.toThrow();
  });

  // Scenario 4: 模擬翻譯二個檔案，但 gemini 返回正確的翻譯內容 (動態判斷檔案)
  test('should translate two files successfully when gemini command succeeds (dynamic)', async () => {
    // 設定模擬 gemini 的行為
    process.env.GEMINI_MOCK_BEHAVIOR = 'success';

    // 讀取目前的進度檔案，找出未翻譯的檔案
    const initialProgress = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    if (!initialProgress) {
      throw new Error('initialProgress should not be null in this test scenario.');
    }
    const untranslatedFiles = Array.from(initialProgress.entries())
      .filter(([, status]) => status === 0)
      .map(([filename]) => filename)
      .sort(); // 排序以確保順序一致性，避免測試不穩定

    // 確保至少有兩個未翻譯的檔案
    expect(untranslatedFiles.length).toBeGreaterThanOrEqual(2);

    const argv = ['node', 'dist/main.js', '--branch', 'test1-branch', '--env', '../tests/.env.test', '--limit', '2'];

    // 執行 main
    await main(argv);

    // 檢查進度檔案
    const finalProgress = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    if (!finalProgress) {
      throw new Error('finalProgress should not be null in this test scenario.');
    }
    expect(finalProgress.get(untranslatedFiles[0])).toBe(1);
    expect(finalProgress.get(untranslatedFiles[1])).toBe(1);

    // 檢查翻譯後的檔案內容
    await assertTranslatedFileContent(untranslatedFiles[0], workspacePathForTests);
    await assertTranslatedFileContent(untranslatedFiles[1], workspacePathForTests);
  });

  // Scenario 5: 模擬翻譯所有檔案，但 gemini 返回正確的翻譯內容
  test('should translate all remaining files and move them to target', async () => {
    // 讀取進度檔案以獲取所有需要翻譯的檔案列表
    const progressBefore = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    if (!progressBefore) {
      throw new Error('Progress file should exist before running scenario 5');
    }
    const allFiles = Array.from(progressBefore.keys());

    // 設定模擬 gemini 的行為
    process.env.GEMINI_MOCK_BEHAVIOR = 'success';
    const argv = ['node', 'dist/main.js', '--branch', 'test1-branch', '--env', '../tests/.env.test', '--all'];

    // 執行 main
    await main(argv);

    // 檢查所有檔案是否都已翻譯並移動到 target
    const targetRepoPath = path.join(workspacePathForTests, 'repo', 'target');
    for (const filename of allFiles) {
      const targetFilePath = path.join(targetRepoPath, filename);
      const fileExists = await fs.access(targetFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      if (fileExists) {
        const content = await fs.readFile(targetFilePath, 'utf-8');
        expect(content).toContain('# 翻譯測試標題');
      }
    }

    // 檢查 .source_commit 是否已複製到 target
    const targetCommitFilePath = path.join(targetRepoPath, '.source_commit');
    const commitFileExists = await fs.access(targetCommitFilePath).then(() => true).catch(() => false);
    expect(commitFileExists).toBe(true);
  });

  // Helper function for asserting translated file content
  async function assertTranslatedFileContent(filename: string, workspacePath: string) {
    const translatedFilePath = path.join(workspacePath, 'tmp', filename);
    const translatedContent = await fs.readFile(translatedFilePath, 'utf-8');
    expect(translatedContent).toContain('# 翻譯測試標題');
    expect(translatedContent).toContain('這是一個翻譯測試的內容。');
  }
});