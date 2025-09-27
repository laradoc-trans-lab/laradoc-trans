import { Section } from '../translator/Section';
import { splitMarkdownIntoSections } from '../markdownParser';
import { FileValidationResult, ValidationStatus, SectionError } from './types';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import { _ } from '../i18n';
import { validateCodeBlocks as coreValidateCodeBlocks, validateInlineCode as coreValidateInlineCode, validateSpecialMarkers as coreValidateSpecialMarkers, getAnchorFromHtml } from './core';
import  *  as debugKey from '../debugKey';

interface PreambleEntry {
  anchor: string;
  title: string;
  depth: number;
}

export class FileValidator {
  private sourceContent: string;
  private targetContent: string;
  private sourceSections: Section[];
  private targetSections: Section[];
  private fileName: string;

  constructor(fileName: string, sourceContent: string, targetContent: string) {


    this.fileName = fileName;
    this.sourceContent = sourceContent;
    this.targetContent = targetContent;
    this.sourceSections = splitMarkdownIntoSections(sourceContent);
    this.targetSections = splitMarkdownIntoSections(targetContent);

    // 設定目前驗證的檔案 KEY , 這樣其他 ts 可以進行 debug
    debugKey.setKey('currentValidateFile', this.fileName);
  }

  public validate(): FileValidationResult {

      const preambleResult = this.validatePreamble();
      if (!preambleResult.isValid) {
        return this.createErrorResult('Unverifiable', preambleResult);
      }

      if (this.fileName === 'documentation.md') {
        return this.createSuccessResult(preambleResult);
      }

      const headingsResult = this.validateHeadingsAndAnchors();
      const sectionErrors: SectionError[] = [];

      const preambleEntries = this.getPreambleEntries(this.sourceSections[0]);


      // debugKey.execute('currentValidateFile' , 'blade.md' , () => console.log('DEBUG: Parsed Preamble Entries:', JSON.stringify(preambleEntries, null, 2)));

      for (let i = 0; i < preambleEntries.length; i++) {
        const currentEntry = preambleEntries[i];
        const nextEntry = preambleEntries[i + 1];

        const sourceSection = this.findSectionByAnchor(currentEntry.anchor, this.sourceSections);
        const targetSection = this.findSectionByAnchor(currentEntry.anchor, this.targetSections);
        
        // debugKey.execute('currentValidateFile' , 'blade.md' , () => console.log(`\n--- DEBUG: Loop ${i}: Processing anchor [${currentEntry.anchor}] ---`));
        // debugKey.execute('currentValidateFile' , 'blade.md' , () => console.log(`DEBUG: Find Section Result -> Found source: ${!!sourceSection}, Found target: ${!!targetSection}`));


        if (!sourceSection || !targetSection) {
          continue;
        }

        const isLeafInPreamble = !nextEntry || nextEntry.depth <= currentEntry.depth;

        let sourceContentToValidate: string;
        let targetContentToValidate: string;

        if (isLeafInPreamble) {
          sourceContentToValidate = this.gatherDescendantContent(sourceSection, this.sourceSections);
          targetContentToValidate = this.gatherDescendantContent(targetSection, this.targetSections);
        } else {
          sourceContentToValidate = sourceSection.content;
          targetContentToValidate = targetSection.content;
        }

        const tempSourceSection = new Section();
        tempSourceSection.content = sourceContentToValidate;
        tempSourceSection.startLine = sourceSection.startLine;
        tempSourceSection.title = sourceSection.title;

        const tempTargetSection = new Section();
        tempTargetSection.content = targetContentToValidate;
        tempTargetSection.startLine = targetSection.startLine;
        tempTargetSection.title = targetSection.title;

        const codeBlocksResult = coreValidateCodeBlocks(tempSourceSection, tempTargetSection);
        const inlineCodeResult = coreValidateInlineCode(tempSourceSection, tempTargetSection);
        const specialMarkersResult = coreValidateSpecialMarkers(tempSourceSection, tempTargetSection);

        if (!codeBlocksResult.isValid || !inlineCodeResult.isValid || !specialMarkersResult.isValid) {
          sectionErrors.push({
            title: sourceSection.title,
            startLine: sourceSection.startLine,
            codeBlocks: codeBlocksResult,
            inlineCode: inlineCodeResult,
            specialMarkers: specialMarkersResult,
          });
        }
      }

      return {
        fileName: this.fileName,
        status: 'Validated',
        preamble: preambleResult,
        headings: headingsResult,
        codeBlocks: { isValid: sectionErrors.every(e => e.codeBlocks.isValid) },
        inlineCode: { isValid: sectionErrors.every(e => e.inlineCode.isValid) },
        specialMarkers: { isValid: sectionErrors.every(e => e.specialMarkers.isValid) },
        sectionErrors,
      };

  }

  private gatherDescendantContent(startSection: Section, allSections: Section[]): string {
    const startIndex = allSections.indexOf(startSection);
    if (startIndex === -1) return startSection.content;

    const contentParts = [startSection.content];
    for (let i = startIndex + 1; i < allSections.length; i++) {
      const currentSection = allSections[i];
      let parent = currentSection.parent;
      let isDescendant = false;
      while(parent) {
        if (parent === startSection) {
          isDescendant = true;
          break;
        }
        parent = parent.parent;
      }

      if (isDescendant) {
        contentParts.push(currentSection.content);
      } else {
        break;
      }
    }
    return contentParts.join('\n\n');
  }

  private getPreambleEntries(preambleSection: Section): PreambleEntry[] {
    const entries: PreambleEntry[] = [];
    if (!preambleSection) return entries;

    const ast = remark().parse(preambleSection.content);

    const visitNodes = (node: any, depth: number) => {
      if (node.type === 'list') {
        node.children.forEach((listItem: any) => {
          if (listItem.type !== 'listItem') return;

          let entry: Partial<PreambleEntry> = { depth };
          let nestedList: any = null;

          listItem.children.forEach((itemChild: any) => {
            if (itemChild.type === 'paragraph') {
              const linkNode = itemChild.children?.[0];
              if (linkNode && linkNode.type === 'link') {
                entry.title = linkNode.children.map((child: any) => child.value).join('');
                entry.anchor = linkNode.url;
              }
            } else if (itemChild.type === 'list') {
              nestedList = itemChild;
            }
          });

          if (entry.title && entry.anchor) {
            entries.push(entry as PreambleEntry);
          }

          if (nestedList) {
            visitNodes(nestedList, depth + 1);
          }
        });
      }
    };

    (ast.children || []).forEach(node => visitNodes(node, 1));
    return entries;
  }

  /**
   * 在 Sections (陣列) 中尋找指定錨點的 Section
   * @param anchor 
   * @param sections 
   * @returns 
   */
  private findSectionByAnchor(anchor: string, sections: Section[]): Section | undefined {
    return sections.find(s => 
        (s.anchorOfTitle && ('#' + getAnchorFromHtml(s.anchorOfTitle)) === anchor)
    );
  }

  private createErrorResult(status: 'Unverifiable', preamble: ValidationStatus): FileValidationResult {
    return {
      fileName: this.fileName,
      status,
      preamble,
      headings: { isValid: false, missingCount: 0, anchorMissingCount: 0, mismatches: [] },
      codeBlocks: { isValid: false },
      inlineCode: { isValid: false },
      specialMarkers: { isValid: false },
      sectionErrors: [],
    };
  }

  private createSuccessResult(preamble: ValidationStatus): FileValidationResult {
    return {
      fileName: this.fileName,
      status: 'Validated',
      preamble,
      headings: { isValid: true, missingCount: 0, anchorMissingCount: 0, mismatches: [] },
      codeBlocks: { isValid: true },
      inlineCode: { isValid: true },
      specialMarkers: { isValid: true },
      sectionErrors: [],
    };
  }

  private validatePreamble(): ValidationStatus & { totalHeadings?: number } {
    const sourcePreamble = this.sourceSections[0];
    const targetPreamble = this.targetSections[0];
  
    if (!sourcePreamble || !targetPreamble) {
        return { isValid: false, mismatches: [{type: 'Preamble not found'}] };
    }

    const sourceEntries = this.getPreambleEntries(sourcePreamble);
    const targetEntries = this.getPreambleEntries(targetPreamble);

    /*
    debugKey.execute('currentValidateFile', 'blade.md', () => {
      console.log('--- DEBUG PREAMBLE VALIDATION for blade.md ---');
      console.log('Source Preamble Entries (Count:', sourceEntries.length, '):');
      console.log(JSON.stringify(sourceEntries, null, 2));
      console.log('Target Preamble Entries (Count:', targetEntries.length, '):');
      console.log(JSON.stringify(targetEntries, null, 2));
      console.log('-------------------------------------------------');
    });
    */

    if (sourceEntries.length === 0 && sourcePreamble.content.length > 0) {
        return { isValid: true, totalHeadings: 0 };
    }

    if (sourceEntries.length !== targetEntries.length) {
        return { isValid: false, mismatches: [{type: 'Preamble link count mismatch'}] };
    }

    for (let i = 0; i < sourceEntries.length; i++) {
      if (sourceEntries[i].anchor !== targetEntries[i].anchor) {
        return { isValid: false, mismatches: [{type: 'Preamble anchor mismatch'}] };
      }
    }

    return { isValid: true, totalHeadings: sourceEntries.length };
  }


  private validateHeadingsAndAnchors(): ValidationStatus & { missingCount: number; anchorMissingCount: number; } {
    const targetPreamble = this.targetSections[0];
    if (!targetPreamble) return { isValid: true, missingCount: 0, anchorMissingCount: 0, mismatches: [] };

    // 取得序言中的條目，並過濾掉非錨點連結 (例如，外部 URL)，因為它們不會出現在文件內文中。
    const preambleEntries = this.getPreambleEntries(targetPreamble)
      .filter(entry => entry.anchor.startsWith('#'));

    const mismatches: any[] = [];
    for (const entry of preambleEntries) {
        const targetSection = this.findSectionByAnchor(entry.anchor, this.targetSections);
        if (!targetSection) {
            mismatches.push({ type: 'heading', link: `[${entry.title}](${entry.anchor})` });
        }
    }

    return {
      isValid: mismatches.length === 0,
      missingCount: mismatches.length,
      anchorMissingCount: 0, 
      mismatches,
    };
  }



  private validateCodeBlocks(sourceSection: Section, targetSection: Section): SectionError['codeBlocks'] {
    return coreValidateCodeBlocks(sourceSection, targetSection);
  }

  private validateInlineCode(sourceSection: Section, targetSection: Section): SectionError['inlineCode'] {
    return coreValidateInlineCode(sourceSection, targetSection);
  }

  private validateSpecialMarkers(sourceSection: Section, targetSection: Section): SectionError['specialMarkers'] {
    return coreValidateSpecialMarkers(sourceSection, targetSection);
  }
}