import fs from 'fs/promises';
import path from 'path';
import { validateCodeBlocks, validateInlineCode, validateSpecialMarkers, validateToc, getAnchorFromHtml } from '../src/validator/core';
import { validateBatch } from '../src/translator/validateBatch';
import { splitMarkdownIntoSections } from '../src/markdownParser';
import { Section } from '../src/translator/Section';

// 測試 validator 的核心功能
describe('Validator Core Functions', () => {
  // 定義測試所需的變數
  let sourceSections: Section[];
  let successTargetSections: Section[];
  let codeblockErrorSections: Section[];
  let inlineCodeErrorSections: Section[];
  let alertErrorSections: Section[];

  // 在所有測試開始前，預先讀取並解析所有必要的測試檔案
  beforeAll(async () => {
    // 定義測試檔案的路徑
    const sourcePath = path.resolve(__dirname, 'fixtures/validator/source/container.md');
    const successTargetPath = path.resolve(__dirname, 'fixtures/validator/target/container.md-success.md');
    const codeblockErrorTargetPath = path.resolve(__dirname, 'fixtures/validator/target/container.md-error-codeblock.md');
    const inlineCodeErrorTargetPath = path.resolve(__dirname, 'fixtures/validator/target/container.md-error-inline-code.md');
    const alertErrorTargetPath = path.resolve(__dirname, 'fixtures/validator/target/container.md-error-alert.md');

    // 讀取檔案內容
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const successTargetContent = await fs.readFile(successTargetPath, 'utf-8');
    const codeblockErrorContent = await fs.readFile(codeblockErrorTargetPath, 'utf-8');
    const inlineCodeErrorContent = await fs.readFile(inlineCodeErrorTargetPath, 'utf-8');
    const alertErrorContent = await fs.readFile(alertErrorTargetPath, 'utf-8');

    // 將 Markdown 內容解析成 Section 物件陣列
    sourceSections = splitMarkdownIntoSections(sourceContent);
    successTargetSections = splitMarkdownIntoSections(successTargetContent);
    codeblockErrorSections = splitMarkdownIntoSections(codeblockErrorContent);
    inlineCodeErrorSections = splitMarkdownIntoSections(inlineCodeErrorContent);
    alertErrorSections = splitMarkdownIntoSections(alertErrorContent);
  });

  describe('1. Regex helpers' , () => {
    test(`getAnchorFromHtml() : <a name="test-section"> should be 'test-section'` , () => {
      const html = '<a name="test-section"></a>';
      expect(getAnchorFromHtml(html)).toBe('test-section');
    });
  
    test(`getAnchorFromHtml() : <input name="test-section"> should not match` , () => {
      const html = '<input name="test-section">';
      expect(getAnchorFromHtml(html)).toBe('');
    });

    test(`getAnchorFromHtml() : <a> without name attribute should not match` , () => {
      const html = '<a></a>';
      expect(getAnchorFromHtml(html)).toBe('');
    });

    test(`getAnchorFromHtml() : empty string should not match` , () => {
      const html = '';
      expect(getAnchorFromHtml(html)).toBe('');
    });
  });

  // 針對 `validateCodeBlocks` 函式進行測試
  describe('2. validateCodeBlocks', () => {

    // 測試案例：成功情境
    test('should return valid for a correctly translated file', () => {
      // 斷言：原文和正確譯文的 Section 數量應相同
      expect(sourceSections.length).toBe(successTargetSections.length);

      // 遍歷所有 Section，確保每一個都通過驗證
      for (let i = 0; i < sourceSections.length; i++) {
        const sourceSection = sourceSections[i];
        const targetSection = successTargetSections[i];

        const result = validateCodeBlocks(sourceSection, targetSection);
        // 斷言：驗證結果應為有效
        expect(result.isValid).toBe(true);
      }
    });

    // 測試案例：失敗情境
    test('should return invalid for mismatched code blocks', () => {
      // 斷言：原文和錯誤譯文的 Section 數量應相同
      expect(sourceSections.length).toBe(codeblockErrorSections.length);
      let errorFound = false;

      // 遍歷所有 Section，找出包含錯誤的 Section
      for (let i = 0; i < sourceSections.length; i++) {
        const sourceSection = sourceSections[i];
        const targetSection = codeblockErrorSections[i];
        const result = validateCodeBlocks(sourceSection, targetSection);

        if (!result.isValid) {
          errorFound = true;
          // 斷言：mismatches 陣列應被定義
          expect(result.mismatches).toBeDefined();
          // 斷言：我們預期只會找到一個不匹配的程式碼區塊
          expect(result.mismatches!).toHaveLength(1);
        }
      }

      // 斷言：確保在所有 Section 中確實找到了錯誤
      expect(errorFound).toBe(true);
    });

  });

  // 針對 `validateInlineCode` 函式進行測試
  describe('3. validateInlineCode', () => {

    // 測試案例：成功情境
    test('should return valid for a correctly translated file', () => {
      expect(sourceSections.length).toBe(successTargetSections.length);

      for (let i = 0; i < sourceSections.length; i++) {
        const result = validateInlineCode(sourceSections[i], successTargetSections[i]);
        expect(result.isValid).toBe(true);
      }
    });

    // 測試案例：失敗情境
    test('should return invalid for mismatched inline code', () => {
      expect(sourceSections.length).toBe(inlineCodeErrorSections.length);
      let errorFound = false;

      for (let i = 0; i < sourceSections.length; i++) {
        const result = validateInlineCode(sourceSections[i], inlineCodeErrorSections[i]);

        if (!result.isValid) {
          errorFound = true;
          expect(result.mismatches).toBeDefined();
          // 我們預期只會找到一個不匹配的行內程式碼
          expect(result.mismatches!).toHaveLength(1);
        }
      }

      // 斷言：確保在所有 Section 中確實找到了錯誤
      expect(errorFound).toBe(true);
    });

  });

  // 針對 `validateSpecialMarkers` 函式進行測試
  describe('4. validateSpecialMarkers', () => {

    // 測試案例：成功情境
    test('should return valid for a correctly translated file', () => {
      expect(sourceSections.length).toBe(successTargetSections.length);

      for (let i = 0; i < sourceSections.length; i++) {
        const result = validateSpecialMarkers(sourceSections[i], successTargetSections[i]);
        expect(result.isValid).toBe(true);
      }
    });

    // 測試案例：失敗情境
    test('should return invalid for mismatched special markers', () => {
      expect(sourceSections.length).toBe(alertErrorSections.length);
      let errorFound = false;

      for (let i = 0; i < sourceSections.length; i++) {
        const result = validateSpecialMarkers(sourceSections[i], alertErrorSections[i]);

        if (!result.isValid) {
          errorFound = true;
          expect(result.mismatches).toBeDefined();
          // 我們預期只會找到一個不匹配的特殊標記
          expect(result.mismatches!).toHaveLength(1);
        }
      }

      // 斷言：確保在所有 Section 中確實找到了錯誤
      expect(errorFound).toBe(true);
    });

  });

  // 針對 `validateToc` 函式進行測試
  describe('5. validateToc', () => {
    test('should return isValid: true and isToc: false for sections without TOC', () => {
      // 內文章節（非前言）沒有 TOC 清單
      const nonTocSource = sourceSections[1];
      const nonTocTarget = successTargetSections[1];
      const result = validateToc(nonTocSource, nonTocTarget);
      expect(result.isValid).toBe(true);
      expect(result.isToc).toBe(false);
      expect(result.sourceCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should return valid for correctly translated TOC preamble', () => {
      const result = validateToc(sourceSections[0], successTargetSections[0]);
      expect(result.isValid).toBe(true);
      expect(result.isToc).toBe(true);
      expect(result.sourceCount).toBeGreaterThan(0);
      expect(result.sourceCount).toBe(result.targetCount);
      expect(result.errors).toHaveLength(0);
    });

    test('should return invalid when TOC is completely missing in translation', () => {
      const fakeTarget = new Section();
      fakeTarget.title = '服務容器';
      fakeTarget.depth = 1;
      fakeTarget.content = '# 服務容器\n\n這是一段沒有目錄的翻譯內容。';

      const result = validateToc(sourceSections[0], fakeTarget);
      expect(result.isValid).toBe(false);
      expect(result.isToc).toBe(true);
      expect(result.mismatches.some(m => m.type === 'missing_toc')).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should return invalid when TOC item count mismatches (missing items)', () => {
      const fakeTarget = new Section();
      fakeTarget.title = '服務容器';
      fakeTarget.depth = 1;
      // 故意只放兩個 TOC 項目
      fakeTarget.content = `# 服務容器\n\n- [簡介](#introduction)\n    - [零組態解析](#zero-configuration-resolution)`;

      const result = validateToc(sourceSections[0], fakeTarget);
      expect(result.isValid).toBe(false);
      expect(result.mismatches.some(m => m.type === 'count_mismatch')).toBe(true);
    });

    test('should return invalid when TOC anchor is modified', () => {
      const fakeTarget = new Section();
      fakeTarget.title = '服務容器';
      fakeTarget.depth = 1;
      // 將 success target 的第一個錨點改成錯誤的錨點
      fakeTarget.content = successTargetSections[0].content.replace('#introduction', '#intro-wrong');

      const result = validateToc(sourceSections[0], fakeTarget);
      expect(result.isValid).toBe(false);
      expect(result.mismatches.some(m => m.type === 'anchor_mismatch')).toBe(true);
      expect(result.errors.some(e => e.includes('TOC anchor mismatch'))).toBe(true);
    });

    test('should return invalid when TOC hierarchy depth is modified', () => {
      const fakeTarget = new Section();
      fakeTarget.title = '服務容器';
      fakeTarget.depth = 1;
      // 將子項目的縮排移除（改為 depth 1）
      fakeTarget.content = successTargetSections[0].content.replace(
        '  * [零組態解析](#zero-configuration-resolution)',
        '* [零組態解析](#zero-configuration-resolution)'
      );

      const result = validateToc(sourceSections[0], fakeTarget);
      expect(result.isValid).toBe(false);
      expect(result.mismatches.some(m => m.type === 'depth_mismatch')).toBe(true);
      expect(result.errors.some(e => e.includes('TOC hierarchy depth mismatch'))).toBe(true);
    });
  });

  // 針對 `validateBatch` 中的 TOC 整合驗證進行測試
  describe('6. validateBatch with TOC validation', () => {
    test('should pass validateBatch for valid preamble with TOC', () => {
      const sourceContent = sourceSections[0].content;
      const targetContent = successTargetSections[0].content;

      const result = validateBatch(sourceContent, targetContent);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail validateBatch when preamble TOC has missing items', () => {
      const sourceContent = sourceSections[0].content;
      const badTargetContent = '# 服務容器\n\n- [簡介](#introduction)';

      const result = validateBatch(sourceContent, badTargetContent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('TOC item count mismatch'))).toBe(true);
    });

    test('should fail validateBatch when preamble TOC has modified anchor', () => {
      const sourceContent = sourceSections[0].content;
      const badTargetContent = successTargetSections[0].content.replace('#introduction', '#intro-wrong');

      const result = validateBatch(sourceContent, badTargetContent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('TOC anchor mismatch'))).toBe(true);
    });
  });

  // 針對 20 項、3 層級 TOC Fixture 進行嚴謹測試
  describe('7. validateToc with Multi-level 20-item TOC Fixtures (3 levels)', () => {
    let tocSampleSourceSections: Section[];
    let tocSampleSuccessSections: Section[];
    let tocSampleErrorCountSections: Section[];
    let tocSampleErrorDepthSections: Section[];
    let tocSampleErrorAnchorSections: Section[];
    let tocSampleErrorMissingSections: Section[];

    beforeAll(async () => {
      const sourcePath = path.resolve(__dirname, 'fixtures/validator/source/toc-sample.md');
      const successPath = path.resolve(__dirname, 'fixtures/validator/target/toc-sample.md-success.md');
      const errorCountPath = path.resolve(__dirname, 'fixtures/validator/target/toc-sample.md-error-count.md');
      const errorDepthPath = path.resolve(__dirname, 'fixtures/validator/target/toc-sample.md-error-depth.md');
      const errorAnchorPath = path.resolve(__dirname, 'fixtures/validator/target/toc-sample.md-error-anchor.md');
      const errorMissingPath = path.resolve(__dirname, 'fixtures/validator/target/toc-sample.md-error-missing.md');

      const sourceContent = await fs.readFile(sourcePath, 'utf-8');
      const successContent = await fs.readFile(successPath, 'utf-8');
      const errorCountContent = await fs.readFile(errorCountPath, 'utf-8');
      const errorDepthContent = await fs.readFile(errorDepthPath, 'utf-8');
      const errorAnchorContent = await fs.readFile(errorAnchorPath, 'utf-8');
      const errorMissingContent = await fs.readFile(errorMissingPath, 'utf-8');

      tocSampleSourceSections = splitMarkdownIntoSections(sourceContent);
      tocSampleSuccessSections = splitMarkdownIntoSections(successContent);
      tocSampleErrorCountSections = splitMarkdownIntoSections(errorCountContent);
      tocSampleErrorDepthSections = splitMarkdownIntoSections(errorDepthContent);
      tocSampleErrorAnchorSections = splitMarkdownIntoSections(errorAnchorContent);
      tocSampleErrorMissingSections = splitMarkdownIntoSections(errorMissingContent);
    });

    test('should correctly extract 20 TOC items with 3 depth levels from source fixture', () => {
      const result = validateToc(tocSampleSourceSections[0], tocSampleSuccessSections[0]);
      expect(result.isToc).toBe(true);
      expect(result.sourceCount).toBe(20);
      expect(result.targetCount).toBe(20);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should pass validateBatch for 20-item 3-level TOC success target', () => {
      const result = validateBatch(
        tocSampleSourceSections[0].content,
        tocSampleSuccessSections[0].content
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail and detect count mismatch when items are missing (17 vs 20)', () => {
      const result = validateToc(tocSampleSourceSections[0], tocSampleErrorCountSections[0]);
      expect(result.isValid).toBe(false);
      expect(result.sourceCount).toBe(20);
      expect(result.targetCount).toBe(17);
      expect(result.mismatches.some(m => m.type === 'count_mismatch')).toBe(true);
      // 確保錯誤訊息有具體列出遺漏的錨點
      expect(result.errors.some(e => e.includes('TOC item count mismatch'))).toBe(true);
      expect(result.errors.some(e => e.includes('#scoped-bindings'))).toBe(true);

      const batchResult = validateBatch(
        tocSampleSourceSections[0].content,
        tocSampleErrorCountSections[0].content
      );
      expect(batchResult.isValid).toBe(false);
      expect(batchResult.errors.some(e => e.includes('TOC item count mismatch'))).toBe(true);
    });

    test('should fail and detect depth/hierarchy mismatch across 3 levels', () => {
      const result = validateToc(tocSampleSourceSections[0], tocSampleErrorDepthSections[0]);
      expect(result.isValid).toBe(false);
      expect(result.mismatches.some(m => m.type === 'depth_mismatch')).toBe(true);
      expect(result.errors.some(e => e.includes('TOC hierarchy depth mismatch'))).toBe(true);

      const batchResult = validateBatch(
        tocSampleSourceSections[0].content,
        tocSampleErrorDepthSections[0].content
      );
      expect(batchResult.isValid).toBe(false);
      expect(batchResult.errors.some(e => e.includes('TOC hierarchy depth mismatch'))).toBe(true);
    });

    test('should fail and detect anchor mismatch when anchors are modified', () => {
      const result = validateToc(tocSampleSourceSections[0], tocSampleErrorAnchorSections[0]);
      expect(result.isValid).toBe(false);
      expect(result.mismatches.some(m => m.type === 'anchor_mismatch')).toBe(true);
      expect(result.errors.some(e => e.includes('TOC anchor mismatch'))).toBe(true);
      expect(result.errors.some(e => e.includes('#simple-binding-error'))).toBe(true);

      const batchResult = validateBatch(
        tocSampleSourceSections[0].content,
        tocSampleErrorAnchorSections[0].content
      );
      expect(batchResult.isValid).toBe(false);
      expect(batchResult.errors.some(e => e.includes('TOC anchor mismatch'))).toBe(true);
    });

    test('should fail and detect missing TOC when target preamble contains no TOC list', () => {
      const result = validateToc(tocSampleSourceSections[0], tocSampleErrorMissingSections[0]);
      expect(result.isValid).toBe(false);
      expect(result.targetCount).toBe(0);
      expect(result.mismatches.some(m => m.type === 'missing_toc')).toBe(true);

      const batchResult = validateBatch(
        tocSampleSourceSections[0].content,
        tocSampleErrorMissingSections[0].content
      );
      expect(batchResult.isValid).toBe(false);
      expect(batchResult.errors.some(e => e.includes('Table of Contents (TOC) is missing'))).toBe(true);
    });
  });

  // 針對「內文段落 (Section[1..n]) 含有樹狀結構清單時不會被當作 TOC 檢查」進行測試
  describe('8. Body sections (Section[1..n]) with tree structure should NOT trigger TOC validation', () => {
    test('should not trigger TOC validation for body sections containing multi-level nested lists', () => {
      // 模擬帶有前言上下文的內文章節（H2 內文），內文中含有 3 層樹狀清單結構
      const preambleContent = `# 服務容器\n\n- [簡介](#introduction)\n    - [基本概念](#basic-concepts)`;

      const bodySourceContent = `<a name="basic-concepts"></a>
## Basic Concepts

Here are the key points with a nested tree structure:
- Feature Category A
    - Sub-feature A1
        - Detail A1.1
        - Detail A1.2
    - Sub-feature A2
- Feature Category B
    - Sub-feature B1

Some additional explanations.`;

      const bodyTargetContent = `<a name="basic-concepts"></a>
## 基本概念

以下是包含巢狀樹狀結構的重點：
- 功能類別 A
    - 子功能 A1
        - 細節 A1.1
        - 細節 A1.2
    - 子功能 A2
- 功能類別 B
    - 子功能 B1

一些額外的說明。`;

      // 傳入 preambleContext，代表這是內文翻譯
      const result = validateBatch(bodySourceContent, bodyTargetContent, preambleContent);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should not fail with TOC errors even if body list items or anchors differ', () => {
      const preambleContent = `# 服務容器\n\n- [簡介](#introduction)`;

      // 內文含有帶有錨點連結的清單
      const bodySourceContent = `<a name="introduction"></a>
## Introduction

See related references:
- [Reference 1](#ref-1)
    - [Sub Ref 1.1](#sub-ref-1)
- [Reference 2](#ref-2)`;

      // 譯文中清單項目數量與錨點不同（內文清單不需要強制與 TOC 一樣嚴格比對）
      const bodyTargetContent = `<a name="introduction"></a>
## 簡介

請參閱相關參考：
- [參考 1](#ref-1)
- [參考 2 (已調整)](#ref-2-custom)`;

      const result = validateBatch(bodySourceContent, bodyTargetContent, preambleContent);
      // 不應該產生任何 TOC 相關的錯誤
      expect(result.errors.some(e => e.includes('TOC'))).toBe(false);
    });
  });
});
