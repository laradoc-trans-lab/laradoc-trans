import nunjucks from 'nunjucks';
import path from 'path';
import { FileValidationResult } from './types';
import { i18next, _ } from '../i18n'; // Import i18next and _
import { ljust } from './nunjucksFilters'; // Import ljust filter

interface SummaryViewResult {
  fileName: string;
  preambleIcon: string;
  headingsIcon: string;
  note: string;
  codeBlocksIcon: string;
  inlineCodeIcon: string;
  specialMarkersIcon: string;
}

export class ReportGenerator {
  private results: FileValidationResult[];
  private branch: string;

  constructor(results: FileValidationResult[], branch: string) {
    this.results = results;
    this.branch = branch;
    const currentLanguage = i18next.language; // Get current language
    const env = nunjucks.configure(path.join(__dirname, '..', '..', 'resources', 'templates', currentLanguage), { autoescape: false });
    env.addFilter('ljust', ljust); // Register the ljust filter
  }

  private transformResultsForView(): SummaryViewResult[] {
    return this.results
      .filter(result => result.status !== 'Skipped')
      .map(result => {
        let note = '';
        if (result.status === 'Unverifiable') {
          note = _('Preamble structure mismatch, cannot validate');
        } else if (!result.headings.isValid) {
          const notes = [];
          if (result.headings.missingCount > 0) {
            notes.push(_('Missing {{count}} sections', { count: result.headings.missingCount }));
          }
          if (result.headings.anchorMissingCount > 0) {
            notes.push(_('Missing {{count}} anchors', { count: result.headings.anchorMissingCount }));
          }
          note = notes.join(' , ');
        }

        return {
          fileName: result.fileName,
          preambleIcon: result.preamble.isValid ? '✅' : '❌',
          headingsIcon: result.status === 'Unverifiable' ? 'N/A' : (result.headings.isValid ? '✅' : '❌'),
          note: note,
          codeBlocksIcon: result.status === 'Unverifiable' ? 'N/A' : (result.codeBlocks.isValid ? '✅' : '❌'),
          inlineCodeIcon: result.status === 'Unverifiable' ? 'N/A' : (result.inlineCode.isValid ? '✅' : '❌'),
          specialMarkersIcon: result.status === 'Unverifiable' ? 'N/A' : (result.specialMarkers.isValid ? '✅' : '❌'),
        };
      });
  }

  public generateSummary(): string {
    const generationTime = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const viewResults = this.transformResultsForView();
    
    const data = {
      branch: this.branch,
      generationTime: generationTime,
      results: viewResults,
    };

    return nunjucks.render('summary.njk', data);
  }

  public generateDetail(result: FileValidationResult): string {
    return nunjucks.render('details.njk', { result });
  }
}
