import * as fs from 'fs/promises';
import * as path from 'path';
import { main } from '../src/main';
import { RepositoryNotFoundError } from '../src/git';
import { GeminiCliError } from '../src/translator';
import { readProgressFile } from '../src/progress';
import { executeGit } from '../src/git/executor';
import { listMarkdownFiles, getCurrentCommitHash } from '../src/git';


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

    const argv = ['node', 'dist/main.js', 'trans', '--branch', 'test1-branch', '--env', '../tests/.env.test'];

    await expect(main(argv)).rejects.toThrow(RepositoryNotFoundError);
  });

  //  Scenario 2: 模擬 gemini 指令失敗
  test('should exit with error if gemini command fails', async () => {
    // Prepare workspace/repo/source with a git repo
    await fs.mkdir(workspacePathForTests, { recursive: true });
    // Copy the workspace template to the test workspace
    await fs.cp(workspaceTemplatePath, workspacePathForTests, { recursive: true });

    // 將 .git-dist 更名為 .git，才能變成一個正確的 git repo
    const gitDistPath = path.join(workspacePathForTests, 'repo', 'source', '.git-dist');
    const gitPath = path.join(workspacePathForTests, 'repo', 'source', '.git');
    await fs.rename(gitDistPath, gitPath);

    process.env.GEMINI_MOCK_BEHAVIOR = 'error'; // Set mock behavior to error
    const argv = ['node', 'dist/main.js',  'trans','--branch', 'test1-branch', '--env', '../tests/.env.test'];
    await expect(main(argv)).rejects.toThrow(GeminiCliError);
  });

  // Scenario 3: 模擬翻譯一個檔案，但 gemini 返回正確的翻譯內容
  test('should translate a single file successfully when gemini command succeeds', async () => {
    // 設定模擬 gemini 的行為
    process.env.GEMINI_MOCK_BEHAVIOR = 'success';

    // 動態找出第一個要翻譯的檔案
    const progressBefore = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    if (!progressBefore) {
      throw new Error('Progress file should exist for this test');
    }
    const firstUntranslatedFile = Array.from(progressBefore.entries())
      .find(([, status]) => status === 0)?.[0];
    if (!firstUntranslatedFile) {
      throw new Error('Could not find an untranslated file to test');
    }

    const argv = ['node', 'dist/main.js',  'trans','--branch', 'test1-branch', '--env', '../tests/.env.test'];

    // 執行 main
    await main(argv);

    // 檢查進度檔案
    const progressAfter = await readProgressFile(path.join(workspacePathForTests, 'tmp'));
    expect(progressAfter?.get(firstUntranslatedFile)).toBe(1);

    // 檢查翻譯後的檔案是否存在於 tmp
    await assertTranslatedFileContent(firstUntranslatedFile, path.join(workspacePathForTests, 'tmp'));

    // 檢查 target 目錄不應該存在該檔案
    const targetFilePath = path.join(workspacePathForTests, 'repo', 'target', firstUntranslatedFile);
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

    const argv = ['node', 'dist/main.js',  'trans','--branch', 'test1-branch', '--env', '../tests/.env.test', '--limit', '2'];

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
    const tmpPath = path.join(workspacePathForTests, 'tmp');
    await assertTranslatedFileContent(untranslatedFiles[0], tmpPath);
    await assertTranslatedFileContent(untranslatedFiles[1], tmpPath);
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
    const argv = ['node', 'dist/main.js',  'trans','--branch', 'test1-branch', '--env', '../tests/.env.test', '--all'];

    // 執行 main
    await main(argv);

    // 檢查所有檔案是否都已翻譯並移動到 target
    const targetPath = path.join(workspacePathForTests, 'repo', 'target');
    for (const filename of allFiles) {
      await assertTranslatedFileContent(filename, targetPath);
    }

    // 檢查 .source_commit 是否已複製到 target
    const targetCommitFilePath = path.join(workspacePathForTests, 'repo', 'target', '.source_commit');
    const commitFileExists = await fs.access(targetCommitFilePath).then(() => true).catch(() => false);
    expect(commitFileExists).toBe(true);
  });


  /**
   * 檢查翻譯檔內容是否是由模擬 gemini 回傳的內容
   * 
   * 例外情況： license.md 及 readme.md 不會被翻譯
   * @param filename 檔案名稱
   * @param basePath 路徑 , 要給絕對路徑
   * @returns 
   */
  async function assertTranslatedFileContent(filename: string, basePath: string, expectedContent: string = '# 翻譯測試標題') {
    const filePath = path.join(basePath, filename);
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
    const translatedContent = await fs.readFile(filePath, 'utf-8');

    if (filename === 'license.md' || filename === 'readme.md') {
      // license.md readme.md 不會進行翻譯，不需要檢查內容
      return;
    } else {
      expect(translatedContent).toContain(expectedContent);
      expect(translatedContent).toContain('這是一個翻譯測試的內容。');
    }
  }

  // Scenario 6: 模擬 `workspace/repo/source` 有更新，進行差異化翻譯，使用參數 `--all`
  test('should translate only changed files when source is updated', async () => {
    // 環境設定：使用情境 5 留下的的 `workspace`。
    // 由於測試是依序執行的，情境 5 應該已經完成並留下了一個完整的翻譯狀態。

    const sourceRepoPath = path.join(workspacePathForTests, 'repo', 'source');
    const targetRepoPath = path.join(workspacePathForTests, 'repo', 'target');

    // 獲取情境 5 結束時，source 倉庫的所有 markdown 檔案列表
    const allFiles = await listMarkdownFiles(sourceRepoPath);

    // 測試程式內需先行提交(`git commit`) `workspace/repo/target` ，並切換至 `test1-branch` 分支。
    // 假設 targetRepoPath 已經是一個合法的 Git 倉庫，且情境 5 已經將 .source_commit 複製過去
    // 所以這裡只需要確保它在正確的分支上並進行一次提交。
    const { exitCode: targetAddExitCode } = await executeGit(['add', '.'], targetRepoPath);
    expect(targetAddExitCode).toBe(0);
    const { exitCode: targetCommitExitCode } = await executeGit(['commit', '-m', 'Initial commit for target repo'], targetRepoPath);
    expect(targetCommitExitCode).toBe(0);
    const { exitCode: targetCheckoutExitCode } = await executeGit(['checkout', 'test1-branch'], targetRepoPath);
    expect(targetCheckoutExitCode).toBe(0);

    // 測試程式內需要修改 `workspace/repo/source` `test2.md` 與 `test5.md` , 增加一行 `已修改` 於最後，並提交於 `test1-branch` 分支
    await fs.appendFile(path.join(sourceRepoPath, 'test2.md'), '\n已修改');
    await fs.appendFile(path.join(sourceRepoPath, 'test5.md'), '\n已修改');
    const { exitCode: sourceAddExitCode } = await executeGit(['add', 'test2.md', 'test5.md'], sourceRepoPath);
    expect(sourceAddExitCode).toBe(0);
    const { exitCode: sourceCommitExitCode } = await executeGit(['commit', '-m', 'Update test2.md and test5.md'], sourceRepoPath);
    expect(sourceCommitExitCode).toBe(0);
    const { exitCode: sourceCheckoutExitCode } = await executeGit(['checkout', 'test1-branch'], sourceRepoPath); // Ensure on correct branch
    expect(sourceCheckoutExitCode).toBe(0);

    // 設定模擬 gemini 的行為
    process.env.GEMINI_MOCK_BEHAVIOR = 'diff';
    const argv = ['node', 'dist/main.js',  'trans', '--branch', 'test1-branch', '--env', '../tests/.env.test', '--all'];

    // 執行 main
    await main(argv);

    // 預期結果：程式應成功翻譯有異動的所有檔案。
    // 檢查 target 目錄下的檔案
    const targetPath = path.join(workspacePathForTests, 'repo', 'target');
    await assertTranslatedFileContent('test2.md', targetPath, '已修改');
    await assertTranslatedFileContent('test5.md', targetPath, '已修改');

    // 檢查 .source_commit 是否已複製到 target (情境 5 已檢查，這裡再次確認)
    const targetCommitFilePath = path.join(workspacePathForTests, 'repo', 'target', '.source_commit');
    const commitFileExists = await fs.access(targetCommitFilePath).then(() => true).catch(() => false);
    expect(commitFileExists).toBe(true);

    // 檢查 `workspace/repo/source` 的 `commit hash` 必須與 `workspace/repo/target/.source_commit` 相同。
    const sourceCommitHash = await getCurrentCommitHash(sourceRepoPath);
    const targetSourceCommitContent = await fs.readFile(targetCommitFilePath, 'utf-8');
    expect(targetSourceCommitContent.trim()).toBe(sourceCommitHash);

    // 檢查其他檔案不包含 "已修改"
    const unchangedFiles = allFiles.filter(file => file !== 'test2.md' && file !== 'test5.md');

    for (const filename of unchangedFiles) {
      // license.md and readme.md are special cases, they are copied but not translated
      if (filename === 'license.md' || filename === 'readme.md') {
        continue;
      }
      const filePath = path.join(targetPath, filename);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      if (fileExists) {
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).not.toContain('已修改');
      }
    }
  });
});
