import path from 'path';
import fs from 'fs/promises';
import { getCurrentCommitHash, listMarkdownFiles } from '../git';
import { readProgressFile, writeProgressFile, writeTmpSourceCommit } from '../progress';
import { FileValidationResult } from './types';
import { _ } from '../i18n';

interface RegenerateOptions {
  branch: string;
  results: FileValidationResult[];
}

/**
 * 根據驗證結果重新產生進度檔案，以便重新翻譯失敗的檔案。
 * @param options - 選項物件，包含分支名稱和驗證結果。
 */
export async function regenerateProgressForFailedFiles(options: RegenerateOptions) {
  const { branch, results } = options;
  const workspacePath = process.env.WORKSPACE_PATH || path.resolve(process.cwd(), './');
  const paths = {
    root: workspacePath,
    sourceRepo: path.join(workspacePath, 'repo', 'source'),
    targetRepo: path.join(workspacePath, 'repo', 'target'),
    tmp: path.join(workspacePath, 'tmp' , branch),
    progressFile: path.join(workspacePath, 'tmp', '.progress'),
  };

  console.log(_('Regenerating progress file for re-translation...'));

  // 內部處理，增加 hasError 判斷
  const processedResults = results.map(r => ({
    ...r,
    filePath: r.fileName,
    hasError: r.status === 'Unverifiable' || !r.headings.isValid || !r.codeBlocks.isValid || !r.inlineCode.isValid || !r.specialMarkers.isValid,
  }));

  // 1. 清空暫存目錄
  await fs.rm(paths.tmp, { recursive: true, force: true });
  await fs.mkdir(paths.tmp, { recursive: true });
  console.log(_('Temporary directory cleared.'));

  const passedFiles = processedResults
    .filter(r => !r.hasError)
    .map(r => r.filePath);
  const failedFiles = processedResults
    .filter(r => r.hasError)
    .map(r => r.filePath);


  // 2. 複製「通過」的檔案
  console.log(_('Copying passed files from target to temporary directory...'));
  for (const file of passedFiles) {
    const sourceFile = path.join(paths.targetRepo, file);
    const destFile = path.join(paths.tmp, file);
    try {
      await fs.mkdir(path.dirname(destFile), { recursive: true });
      await fs.copyFile(sourceFile, destFile);
    } catch (error) {
      // 如果 target 中不存在該檔案，可以忽略
    }
  }
  console.log(_('{{count}} passed files copied.', { count: passedFiles.length }));

  // 3. 產生新的進度檔案
  const allFiles = await listMarkdownFiles(paths.sourceRepo);

  let progress = await readProgressFile(paths.tmp);
  if (!progress) {
    progress = new Map();
  }

  for (const file of allFiles) {
    if (failedFiles.includes(file)) {
      progress.set(file, 0); // 失敗的檔案標記為 0
    } else {
      progress.set(file, 1); // 通過的檔案標記為 1
    }
  }
  
  const sourceCommit = await getCurrentCommitHash(paths.sourceRepo);
  await writeProgressFile(paths.tmp, progress);
  await writeTmpSourceCommit(paths.tmp, sourceCommit);

  console.log(_('New progress file generated successfully.'));
  console.log(_('You can now run the `run` command to re-translate the files that have validation problems.'));
}
