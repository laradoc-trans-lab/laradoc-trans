import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { initializeWorkspace, WorkspacePaths } from './fileUtils';
import {
  checkoutBranch,
  initializeTargetRepo,
  getCurrentCommitHash,
  getDiffFiles,
  listMarkdownFiles,
  GitError,
  RepositoryNotFoundError,
  CheckoutFailedError,
} from './git';
import {
  readProgressFile,
  writeProgressFile,
  cleanTmpDirectory,
  writeSourceCommit,
  readSourceCommit,
  writeTmpSourceCommit,
} from './progress';
import { translateFile, TranslationError, GeminiCliError } from './translator';
import { initI18n, _ } from './i18n';
import { checkToolExistence, ToolNotFoundError } from './toolChecker';
import { parseCliArgs, CliOptions } from './cli';

export async function main(argv: string[]) {
  const options: CliOptions = await parseCliArgs(argv);

  // 載入環境變數
  dotenv.config({ path: options.env });

  // 初始化 i18n
  await initI18n();

  // --- 參數驗證與預設值設定 ---
  if (!options.branch) {
    console.error(_('Error: --branch is a required argument.'));
    throw new Error('Missing required argument: --branch');
  }

  // 檢查外部工具是否存在
  try {
    await Promise.all([
      checkToolExistence('gemini'),
      checkToolExistence('git'),
    ])
  } catch (error: unknown) {
    if (error instanceof ToolNotFoundError) {
      console.error(_('Error: Required tool \'{{toolName}}\' is not installed. Please install it and make sure it is in your PATH.', { toolName: error.toolName }));
    }
    throw error;
  }


  let translationCount: number | 'all' = 1; // 預設翻譯 1 個檔案
  if (options.all) {
    translationCount = 'all';
  }
  else if (options.limit) {
    translationCount = options.limit;
  }

  // --- 初始化工作目錄 ---
  let paths: WorkspacePaths;
  try {
    paths = await initializeWorkspace();
    console.log(_('Workspace initialization successful.'));
  } catch (error: unknown) {
    if (error instanceof RepositoryNotFoundError) {
      console.error(error.message);
    } 
    throw error;

  }



  console.log(_('--- Translation Job Configuration ---'));
  console.log(_('Branch: {{branch}}', { branch: options.branch }));
  console.log(
    translationCount === 'all'
      ? _('Files to translate: all')
      : _('Files to translate: {{count}}', { count: translationCount })
  );
  console.log(_('Using .env path: {{path}}', { path: options.env || './.env' }));
  console.log(_('------------------------------------'));


  // --- Git 分支同步 ---
  try{
    await checkoutBranch(paths.source, options.branch);
  } catch (error: unknown) {
    if(error instanceof CheckoutFailedError) {
      console.error(_('Error: Failed to checkout branch \'{{branch}}\'\: {{message}}', { branch: options.branch, message: error.message }));
    }
    throw error;
  }
  
  await initializeTargetRepo(paths.target, options.branch);
  console.log(_('Git repositories synchronized to the correct branch.'));


  // --- 決定要翻譯的檔案 ---
  let progress = await readProgressFile(paths.tmp);

  if (progress) {
    console.log(_('Resuming previous translation session.'));
  }
  else {
    console.log(
      _('No existing progress file. Determining files to translate...')
    );
    const newHash = await getCurrentCommitHash(paths.source);
    const oldHash = await readSourceCommit(paths.target);

    if (oldHash === newHash) {
      console.log(_('Target repository is already up to date.'));
      process.exit(0);
    }

    const files = oldHash
      ? await getDiffFiles(paths.source, oldHash, newHash)
      : await listMarkdownFiles(paths.source);

    if (files.length === 0) {
      console.log(_('No markdown files have changed.'));
      process.exit(0);
    }

    console.log(_('Found {{count}} files to translate.', { count: files.length }));
    await cleanTmpDirectory(paths.tmp);
    progress = new Map(files.map((file) => [file, 0]));
    await writeProgressFile(paths.tmp, progress);
    await writeTmpSourceCommit(paths.tmp, newHash);
    console.log(_('Initialized tmp/.source_commit with {{hash}}', { hash: newHash }));
  }

  // 過濾出待處理的檔案
  const filesToTranslate = Array.from(progress.entries())
    .filter(([, status]) => status === 0)
    .map(([file]) => file);

  if (filesToTranslate.length === 0) {
    console.log(_('All translations are complete.'));
    process.exit(0);
  }

  // 套用數量限制
  const limitedFiles =
    translationCount === 'all'
      ? filesToTranslate
      : filesToTranslate.slice(0, translationCount);

  console.log(_('--- Translation Plan ---'));
  console.log(_('{{count}} file(s) will be translated in this run:', { count: limitedFiles.length }));
  limitedFiles.forEach((file) => console.log(_('- {{file}}', { file: file })));
  console.log(_('------------------------------------'));

  // --- 翻譯循環 ---
  await fs.mkdir(paths.tmp, { recursive: true }); // 確保 tmp 目錄存在

  for (const file of limitedFiles) {
    const sourcePath = path.join(paths.source, file);
    const targetPath = path.join(paths.tmp, file);

    if (file === 'license.md') {
      // 特例處理 license.md，直接複製並標記為完成
      const sourceLicensePath = path.join(paths.source, 'license.md');
      const targetLicensePath = path.join(paths.tmp, 'license.md');
      await fs.copyFile(sourceLicensePath, targetLicensePath);
      progress.set(file, 1); // 標記為完成
      console.log(_('Skipped translation for license.md. Copied directly and marked as completed.'));
      await writeProgressFile(paths.tmp, progress); // Save progress immediately for skipped file
      continue; // Skip to the next file
    }

    try {
      console.log(_('\nTranslating: {{file}}...', { file: file }));
      const translatedContent = await translateFile(sourcePath, options.promptFile);
      await fs.writeFile(targetPath, translatedContent);

      progress.set(file, 1); // 標記為完成
      console.log(_('SUCCESS: {{file}}', { file: file }));
    } catch (error: unknown) {
      let errorMessage: string;
      if (error instanceof TranslationError) {
        errorMessage = _('Translation failed: {{errorName}} - {{message}}', { errorName: error.name, message: error.message });
        // Optionally, add more details for specific error types if needed
        if (error instanceof GeminiCliError && error.stderr) {
          errorMessage += _('\nCLI Stderr: {{stderr}}', { stderr: error.stderr });
        }
      } else if (error instanceof Error) {
        errorMessage = _('An unexpected error occurred: {{message}}', { message: error.message });
      }
      else {
        errorMessage = _('An unknown error occurred.');
      }

      console.error(_('FAILED to translate {{file}}: {{message}}', { file: file, message: errorMessage }));
      await writeProgressFile(paths.tmp, progress);
      const logFilePath = path.join(paths.logs, 'error.log');
      const logMessage = `[${new Date().toISOString()}] ${_('FAILED to translate {{file}}: {{message}}', { file: file, message: errorMessage })}\n\n`;
      await fs.appendFile(logFilePath, logMessage);
      console.error(_('Error details logged to {{path}}', { path: logFilePath }));
      throw error;
    }

    await writeProgressFile(paths.tmp, progress);
  }

  // --- 完成階段 ---
  const allFiles = Array.from(progress.keys());
  const completedFiles = allFiles.filter((file) => progress.get(file) === 1);

  if (completedFiles.length === allFiles.length) {
    console.log(_('\nAll translations complete. Finalizing...'));
    for (const file of completedFiles) {
      const source = path.join(paths.tmp, file);
      const destination = path.join(paths.target, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
    }
    console.log(_('Copied translated files to target repository.'));

    const tmpSourceCommitPath = path.join(paths.tmp, '.source_commit');
    const targetSourceCommitPath = path.join(paths.target, '.source_commit');
    await fs.copyFile(tmpSourceCommitPath, targetSourceCommitPath);
    console.log(_('Copied .source_commit from tmp to target.'));

    await cleanTmpDirectory(paths.tmp);
    console.log(_('Translation process completed successfully!'));
  } else {
    console.log(
      _('\nTranslation run finished. Not all files are complete. Run again to continue.')
    );
  }
}


export function debug(message?: any, ...optionalParams: any[]) {
  if (process.env.DEBUG || process.env.NODE_ENV === 'test') {
    console.debug(message);
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main(process.argv).catch((error) => {
      debug(error);
      process.exit(1);
  });
}