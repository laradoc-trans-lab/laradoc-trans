#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { initializeWorkspace, WorkspacePaths, ensureEnvFile } from './fileUtils';
import {
  checkoutBranch,
  initializeTargetRepo,
  getCurrentCommitHash,
  getDiffFiles,
  listMarkdownFiles,
  GitError,
  RepositoryNotFoundError,
  initRepository,
  cloneRepository,
  CloneError,
  isGitRepository,
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
import { translateFile, TranslationError } from './translator';
import { initI18n, _ } from './i18n';
import { checkToolExistence, ToolNotFoundError } from './toolChecker';
import { parseCliArgs, CliArgs, InitOptions, RunOptions, ValidateOptions } from './cli';
import { createLlmModel } from './llm';
import { validateAllFiles } from './validator';

const LARAVEL_DOCS_REPO = 'https://github.com/laravel/docs.git';

export async function main(argv: string[]) {
  const cliArgs = await parseCliArgs(argv);

  const envPath = (cliArgs.options as RunOptions).env;
  dotenv.config({ path: envPath, override: true });

  await initI18n();

  switch (cliArgs.command) {
    case 'init':
      await handleInitCommand(cliArgs.options as InitOptions);
      break;
    case 'run':
      await handleRunCommand(cliArgs.options as RunOptions);
      break;
    case 'validate':
      await handleValidateCommand(cliArgs.options as ValidateOptions);
      break;
    default:
      console.error(_('Unknown command: {{command}}', { command: cliArgs.command }));
      process.exit(1);
  }
}

async function handleInitCommand(options: InitOptions) {
  console.log(_('Initializing workspace...'));
  try {
    await checkToolExistence('git');
  } catch (error: unknown) {
    if (error instanceof ToolNotFoundError) {
      console.error(_('Error: Required tool \'{{toolName}}\' is not installed. Please install it and make sure it is in your PATH.', { toolName: error.toolName }));
    }
    throw error;
  }
  const workspacePath = options.workspacePath || process.env.WORKSPACE_PATH;
  const paths: WorkspacePaths = await initializeWorkspace(workspacePath);

  try {
    if (!await isGitRepository(paths.source)) {
      console.log(_('Cloning Laravel documentation to {{path}}...', { path: paths.source }));
      await cloneRepository(LARAVEL_DOCS_REPO, paths.source);
      console.log(_('Laravel documentation cloned successfully.'));
    } else {
      console.log(_('Source repository already exists at {{path}}. Skipping clone.', { path: paths.source }));
    }
  } catch (error: unknown) {
    console.error(_('Error cloning Laravel documentation: {{message}}', { message: (error as Error).message }));
    throw error;
  }

  try {
    if (options.targetRepo) {
      if (!await isGitRepository(paths.target)) {
        console.log(_('Cloning target repository from {{url}} to {{path}}...', { url: options.targetRepo, path: paths.target }));
        await cloneRepository(options.targetRepo, paths.target);
        console.log(_('Target repository cloned successfully.'));
      } else {
        console.log(_('Target repository already exists at {{path}}. Skipping clone.', { path: paths.target }));
      }
    } else {
      if (!await isGitRepository(paths.target)) {
        console.log(_('Initializing target repository at {{path}}...', { path: paths.target }));
        await initRepository(paths.target);
        console.log(_('Target repository initialized successfully.'));
      } else {
        console.log(_('Target repository already exists at {{path}}. Skipping initialization.', { path: paths.target }));
      }
    }
  } catch (error: unknown) {
    console.error(_('Error initializing target repository: {{message}}', { message: (error as Error).message }));
    throw error;
  }

  await ensureEnvFile(paths.root);
  console.log(_('Workspace initialization complete.'));
}

async function handleRunCommand(options: RunOptions) {
  try {
    await checkToolExistence('git');
  } catch (error: unknown) {
    if (error instanceof ToolNotFoundError) {
      console.error(_('Error: Required tool \'{{toolName}}\' is not installed. Please install it and make sure it is in your PATH.', { toolName: error.toolName }));
    }
    throw error;
  }

  let translationCount: number | 'all' = options.all ? 'all' : (options.limit ?? 1);

  const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), './');
  const paths: WorkspacePaths = {
    root: workspacePath,
    source: path.join(workspacePath, 'repo', 'source'),
    target: path.join(workspacePath, 'repo', 'target'),
    tmp: path.join(workspacePath, 'tmp'),
    logs: path.join(workspacePath, 'logs'),
  };

  if (!await isGitRepository(paths.source)) {
    throw new RepositoryNotFoundError(paths.source);
  }
  console.log(_('Workspace validation successful.'));

  console.log(_('--- Translation Job Configuration ---'));
  console.log(_('Branch: {{branch}}', { branch: options.branch }));
  console.log(
    translationCount === 'all'
      ? _('Files to translate: all')
      : _('Files to translate: {{count}}', { count: translationCount })
  );
  console.log(_('Using .env path: {{path}}', { path: options.env || './.env' }));
  const { modelInfo } = createLlmModel();
  console.log(_('Using LLM: {{modelInfo}}', { modelInfo }));
  console.log(_('------------------------------------'));

  await checkoutBranch(paths.source, options.branch);
  await initializeTargetRepo(paths.target, options.branch);
  console.log(_('Git repositories synchronized to the correct branch.'));

  let progress = await readProgressFile(paths.tmp);
  if (!progress) {
    console.log(_('No existing progress file. Determining files to translate...'));
    const newHash = await getCurrentCommitHash(paths.source);
    const oldHash = await readSourceCommit(paths.target);

    if (oldHash === newHash) {
      console.log(_('Target repository is already up to date.'));
      return;
    }

    const files = oldHash ? await getDiffFiles(paths.source, oldHash, newHash) : await listMarkdownFiles(paths.source);
    if (files.length === 0) {
      console.log(_('No markdown files have changed.'));
      return;
    }

    console.log(_('Found {{count}} files to translate.', { count: files.length }));
    await cleanTmpDirectory(paths.tmp);
    progress = new Map(files.map((file) => [file, 0]));
    await writeProgressFile(paths.tmp, progress);
    await writeTmpSourceCommit(paths.tmp, newHash);
  } else {
    console.log(_('Resuming previous translation session.'));
  }

  const filesToTranslate = Array.from(progress.entries()).filter(([, status]) => status === 0).map(([file]) => file);
  if (filesToTranslate.length === 0) {
    console.log(_('All translations are complete.'));
    return;
  }

  const limitedFiles = translationCount === 'all' ? filesToTranslate : filesToTranslate.slice(0, translationCount);

  console.log(_('--- Translation Plan ---'));
  console.log(_('{{count}} file(s) will be translated in this run:', { count: limitedFiles.length }));
  limitedFiles.forEach((file) => console.log(`- ${file}`));
  console.log(_('------------------------------------'));

  for (const file of limitedFiles) {
    const sourcePath = path.join(paths.source, file);
    const targetPath = path.join(paths.tmp, file);

    if (['license.md', 'readme.md'].includes(file)) {
      await fs.copyFile(sourcePath, targetPath);
      progress.set(file, 1);
      console.log(_('Skipped translation for {{file}}. Copied directly.', { file }));
      await writeProgressFile(paths.tmp, progress);
      continue;
    }

    try {
      console.log(_('\nTranslating: {{file}}...', { file }));
      const translatedContent = await translateFile(sourcePath, options.promptFile);
      await fs.writeFile(targetPath, translatedContent);
      progress.set(file, 1);
    } catch (error: any) {
      const errorMessage = error.message || _('An unknown error occurred.');
      console.error(_('FAILED to translate {{file}}: {{message}}', { file, message: errorMessage }));
      await writeProgressFile(paths.tmp, progress);
      const logFilePath = path.join(paths.logs, 'error.log');
      await fs.appendFile(logFilePath, `[${new Date().toISOString()}] FAILED to translate ${file}: ${errorMessage}\n\n`);
      console.error(_('Error details logged to {{path}}', { path: logFilePath }));
      throw error;
    }
    await writeProgressFile(paths.tmp, progress);
  }

  const allFilesComplete = Array.from(progress.values()).every(status => status === 1);
  if (allFilesComplete) {
    console.log(_('\nAll translations complete. Finalizing...'));
    const files = Array.from(progress.keys());
    for (const file of files) {
      const source = path.join(paths.tmp, file);
      const destination = path.join(paths.target, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
    }
    const tmpSourceCommitPath = path.join(paths.tmp, '.source_commit');
    const targetSourceCommitPath = path.join(paths.target, '.source_commit');
    await fs.copyFile(tmpSourceCommitPath, targetSourceCommitPath);
    console.log(_('Copied translated files and .source_commit to target repository.'));
    await cleanTmpDirectory(paths.tmp);
    console.log(_('Translation process completed successfully!'));
  } else {
    console.log(_('\nTranslation run finished. Not all files are complete. Run again to continue.'));
  }
}

async function handleValidateCommand(options: ValidateOptions) {
  console.log(_('Starting validation process...'));

  const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), './');
  const paths = {
    source: path.join(workspacePath, 'repo', 'source'),
    target: path.join(workspacePath, 'repo', 'target'),
    report: path.join(workspacePath, 'validate-report'),
  };

  try {
    await checkoutBranch(paths.source, options.branch);
    await checkoutBranch(paths.target, options.branch);
    console.log(_('Git repositories synchronized to branch: {{branch}}', { branch: options.branch }));
  } catch (error: unknown) {
    if (error instanceof CheckoutFailedError) {
      console.error(_('Error: Failed to checkout branch \'{{branch}}\'\: {{message}}', { branch: options.branch, message: (error as Error).message }));
    }
    throw error;
  }

  await validateAllFiles(paths.source, paths.target, paths.report);
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
