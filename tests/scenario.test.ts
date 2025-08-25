import * as fs from 'fs/promises';
import * as path from 'path';
import { main } from '../src/main';
import { RepositoryNotFoundError } from '../src/git';
import { GeminiCliError } from '../src/translator';


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

});