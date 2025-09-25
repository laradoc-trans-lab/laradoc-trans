import fs from 'fs/promises';
import path from 'path';
import { FileValidator } from './FileValidator';
import { ReportGenerator } from './ReportGenerator';
import { FileValidationResult } from './types';
import { _ } from '../i18n';

interface ValidateProjectOptions {
  sourceDir: string;
  targetDir: string;
  reportDir: string;
  branch: string;
}

const EXCLUDED_FILES = ['license.md', 'readme.md'];

export async function validateProject(options: ValidateProjectOptions): Promise<void> {
  const { sourceDir, targetDir, reportDir, branch } = options;

  await fs.rm(reportDir, { recursive: true, force: true });
  await fs.mkdir(path.join(reportDir, 'details'), { recursive: true });

  const targetFiles = await fs.readdir(targetDir);
  const validationResults: FileValidationResult[] = [];

  const reportGenerator = new ReportGenerator(validationResults, branch);

  for (const fileName of targetFiles) {
    if (!fileName.endsWith('.md')) continue;

    if (EXCLUDED_FILES.includes(fileName)) {
      validationResults.push({ 
        fileName, 
        status: 'Skipped',
        preamble: { isValid: true },
        headings: { isValid: true, missingCount: 0, anchorMissingCount: 0, mismatches: [] },
        codeBlocks: { isValid: true },
        inlineCode: { isValid: true },
        specialMarkers: { isValid: true },
        sectionErrors: [],
      });
      continue;
    }

    try {
      const sourcePath = path.join(sourceDir, fileName);
      const targetPath = path.join(targetDir, fileName);

      const sourceContent = await fs.readFile(sourcePath, 'utf-8');
      const targetContent = await fs.readFile(targetPath, 'utf-8');

      const relativePath = path.relative(targetDir, targetPath);
      const validator = new FileValidator(relativePath, sourceContent, targetContent);
      const result = validator.validate();
      validationResults.push(result);

      const hasErrors = result.status === 'Unverifiable' || !result.headings.isValid || !result.codeBlocks.isValid || !result.inlineCode.isValid || !result.specialMarkers.isValid;

      if (hasErrors) {
        const detailContent = reportGenerator.generateDetail(result);
        const detailPath = path.join(reportDir, 'details', fileName);
        await fs.writeFile(detailPath, detailContent);
      }

    } catch (error) {
      // Handle file not found in source, etc.
      console.error(_('Could not validate {{fileName}}. Error: {{error}}', { fileName, error }));
    }
  }

  const summaryContent = reportGenerator.generateSummary();
  await fs.writeFile(path.join(reportDir, 'SUMMARY.md'), summaryContent);

  console.log(_('Validation complete. Summary report generated at {{reportPath}}', { reportPath: path.join(reportDir, 'SUMMARY.md') }));
}
