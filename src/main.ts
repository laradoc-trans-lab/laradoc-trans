import { Command } from 'commander';
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
} from './git';
import {
  Progress,
  readProgressFile,
  readSourceCommit,
  writeProgressFile,
  cleanTmpDirectory,
  writeSourceCommit,
  writeTmpSourceCommit,
} from './progress';
import { translateFile } from './translator';
import { initI18n, _ } from './i18n';
import { checkToolExistence } from './toolChecker';

export async function main(argv: string[]) {
  const program = new Command();

  program
    .name('laravel-docs-llm-translator')
    .description('Translate Laravel docs using Gemini CLI.');

  program
    .option('--branch <branch>', 'The branch to translate.')
    .option(
      '--limit <number>',
      'Limit the number of files to translate.',
      (value) => parseInt(value, 10)
    )
    .option('--all', 'Translate all remaining files.', false)
    .option('--env <path>', 'Path to the .env file.');

  program.parse(argv);

  const options = program.opts();

  // 載入環境變數
  dotenv.config({ path: options.env });

  // 初始化 i18n
  await initI18n();

  // 檢查外部工具是否存在
  try {
    await Promise.all([
      checkToolExistence('gemini'),
      checkToolExistence('git'),
    ]);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(_('An unexpected unknown error occurred.'));
    }
    process.exit(1);
  }

  // --- 參數驗證與預設值設定 ---
  if (!options.branch) {
    console.error(_('Error: --branch is a required argument.'));
    process.exit(1);
  }

  let translationCount: number | 'all' = 1; // 預設翻譯 1 個檔案
  if (options.all) {
    translationCount = 'all';
  } else if (options.limit) {
    translationCount = options.limit;
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

  try {
    const paths = await initializeWorkspace();
    console.log(_('Workspace initialization successful.'));

    // --- Git 分支同步 ---
    await checkoutBranch(paths.source, options.branch);
    await initializeTargetRepo(paths.target, options.branch);
    console.log(_('Git repositories synchronized to the correct branch.'));

    // --- 決定要翻譯的檔案 ---
    let progress = await readProgressFile(paths.tmp);

    if (progress) {
      console.log(_('Resuming previous translation session.'));
    } else {
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
      await writeTmpSourceCommit(paths.tmp, newHash); // 寫入新的來源提交雜湊值到 tmp
      console.log(_('Initialized tmp/.source_commit with {{hash}}', { hash: newHash }));
    }

    // 過濾出待處理的檔案
    const filesToTranslate = Array.from(progress.entries())
      .filter(([, status]) => status === 0)
      .map(([file]) => file);

    if (filesToTranslate.length === 0) {
      console.log(_('All translations are complete.'));
      // TODO: 實作完成邏輯（複製檔案、更新提交雜湊值）
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
    for (const file of limitedFiles) {
      const sourcePath = path.join(paths.source, file);
      const targetPath = path.join(paths.tmp, file);

      try {
        console.log(_('\nTranslating: {{file}}...', { file: file }));
        const translatedContent = await translateFile(sourcePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, translatedContent);

        progress.set(file, 1); // 標記為完成
        console.log(_('SUCCESS: {{file}}', { file: file }));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : _('An unexpected unknown error occurred.');
        console.error(_('FAILED to translate {{file}}: {{message}}', { file: file, message: message }));
        // progress.set(file, 2); // 標記為失敗
        await writeProgressFile(paths.tmp, progress); // 結束前儲存進度
        // 將錯誤記錄到檔案中
        const logFilePath = path.join(paths.logs, 'error.log');
        const logMessage = `[${new Date().toISOString()}] ${_('FAILED to translate {{file}}: {{message}}', { file: file, message: message })}\n\n`;
        await fs.appendFile(logFilePath, logMessage);
        console.error(_('Error details logged to {{path}}', { path: logFilePath }));
        process.exit(1); // 第一次失敗時退出
      }

      // 每處理完一個檔案就儲存進度
      await writeProgressFile(paths.tmp, progress);
    }

    // --- 完成階段 ---
    const allFiles = Array.from(progress.keys());
    const completedFiles = allFiles.filter((file) => progress.get(file) === 1);

    if (completedFiles.length === allFiles.length) {
      console.log(_('\nAll translations complete. Finalizing...'));
      // 1. 從 tmp 複製檔案到 target
      for (const file of completedFiles) {
        const source = path.join(paths.tmp, file);
        const destination = path.join(paths.target, file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
      }
      console.log(_('Copied translated files to target repository.'));

      // 2. 複製 tmp/.source_commit 到 target
      const tmpSourceCommitPath = path.join(paths.tmp, '.source_commit');
      const targetSourceCommitPath = path.join(paths.target, '.source_commit');
      await fs.copyFile(tmpSourceCommitPath, targetSourceCommitPath);
      console.log(_('Copied .source_commit from tmp to target.'));

      // 3. 清理 tmp 目錄
      await cleanTmpDirectory(paths.tmp);
      console.log(_('Translation process completed successfully!'));
    } else {
      console.log(
        _('\nTranslation run finished. Not all files are complete. Run again to continue.')
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(_('An unexpected error occurred: {{message}}', { message: error.message }));
    } else {
      console.error(_('An unexpected unknown error occurred.'));
    }
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  main(process.argv).catch((error) => {
    if (error instanceof Error) {
      console.error(_('An unexpected error occurred: {{message}}', { message: error.message }));
    } else {
      console.error(_('An unexpected unknown error occurred.'));
    }
    process.exit(1);
  });
}
