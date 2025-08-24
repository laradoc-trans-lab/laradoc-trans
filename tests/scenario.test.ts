import { main } from '../src/main';
import * as spyMain from "../src/main";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as translator from '../src/translator'; // Import translator module
import { RepositoryNotFoundError } from '../src/git';


const execPromise = promisify(exec);

// Mock process.exit to prevent the test from exiting the process
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  // Instead of exiting, do nothing
  // console.log(`process.exit was called with code: ${code}`); // Optional: keep for debugging if needed
  return undefined as never; // Return undefined to satisfy the never type
});

// Mock console.error to capture error messages
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Scenario Tests', () => {
  let originalEnvPath: string | undefined;
  let originalWorkspacePath: string | undefined;
  const workspaceTemplatePath = path.resolve(__dirname, 'fixtures', 'workspace-template'); // 工作區範本目錄
  const testsTmpDir = path.resolve(__dirname, 'tmp'); // 測試用暫存目錄
  let workspacePathForTests: string; // Path to the workspace within tests/tmp


  // Increase timeout for all tests in this describe block
  jest.setTimeout(15000); // Set timeout to 15 seconds

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

    // Add these debug logs for PATH and git availability
    console.log('DEBUG: Current PATH after beforeAll setup:', process.env.PATH);
  });

  beforeEach(async () => {
    // Reset mocks before each test
    mockExit.mockClear();
    mockConsoleError.mockClear();
    mockConsoleLog.mockClear();

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
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
  });

  // Scenario 1: 模擬用戶沒有準備 workspace/repo/source
  test('should exit with error if workspace/repo/source is not prepared', async () => {
    // Ensure tests/tmp/workspace is empty for this test
    await fs.rm(workspacePathForTests, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(workspacePathForTests, { recursive: true });

    const argv = ['node', 'dist/main.js', '--branch', 'test-branch', '--env', '../tests/.env.test'];

    await expect(main(argv)).rejects.toThrow(RepositoryNotFoundError);
  });

});