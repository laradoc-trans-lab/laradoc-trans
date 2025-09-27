import fs from 'fs/promises';
import path from 'path';
import { validateCodeBlocks, validateInlineCode, validateSpecialMarkers } from '../src/validator/core';
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

  // 針對 `validateCodeBlocks` 函式進行測試
  describe('validateCodeBlocks', () => {

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
  describe('validateInlineCode', () => {

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
  describe('validateSpecialMarkers', () => {

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
});
