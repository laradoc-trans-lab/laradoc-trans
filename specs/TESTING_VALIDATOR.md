# Validator 單元測試規格 (TESTING_VALIDATOR.md)

## 1. 目的

本文件旨在規劃 `src/validator` 核心功能之單元測試。`laradoc-trans validate` 命令產生的報告對於驗證翻譯品質至關重要，但報告本身的正確性需要被驗證。

此測試的目標是 **驗證核心檢查邏輯的準確性**，而非測試報告的生成介面或端對端流程。我們將透過一系列預先定義好的 Markdown 檔案（包含正確與錯誤的範例），對 `FileValidator` 或其內部的核心檢查函式進行單元測試，確保它們能精準地識別出各種不一致的情況。

## 2. 測試方法與環境

- **測試框架**: Jest
- **測試對象**: `src/validator/FileValidator.ts` 及其相關的核心邏輯函式。
- **測試資料**: 我們將在 `tests/fixtures/validator/` 目錄下建立一組用於測試的 Markdown 檔案。這些檔案將模擬各種正確和錯誤的翻譯情境。

### 2.1. 測試檔案結構 (Fixtures)

範例檔案將基於真實的 `container.md` 文件，以確保測試情境的準確性。

```
tests/fixtures/validator/
├── source/
│   └── container.md
└── target/
    ├── container.md-success.md
    ├── container.md-error-heading.md
    ├── container.md-error-codeblock.md
    ├── container.md-error-inline-code.md
    ├── container.md-error-alert.md
    ├── container.md-error-anchor.md
    └── container.md-error-multiple.md
```

- **`source/container.md`**: 作為比對基準的真實原文檔案。
- **`target/`**: 存放各種翻譯結果的範例。
  - **`container.md-success.md`**: 完全正確的譯文。
  - **`container.md-error-heading.md`**: 缺少標題及對應目錄條目的譯文。
  - **`container.md-error-codeblock.md`**: 程式碼區塊內容錯誤的譯文。
  - **`container.md-error-inline-code.md`**: 行內程式碼 (`inline code`) 被修改的譯文。
  - **`container.md-error-alert.md`**: 提示區塊語法錯誤的譯文。
  - **`container.md-error-anchor.md`**: 錨點 (`<a name=...>` 或 `#...`) 被修改的譯文。
  - **`container.md-error-multiple.md`**: 同時包含上述多種錯誤的譯文。

## 3. 測試案例

### 3.1. 成功情境驗證

- **測試案例 3.1.1 (成功情境)**
  - **比對檔案**: `source/container.md` vs `target/container.md-success.md`
  - **預期結果**: 驗證應成功，不回報任何錯誤。

### 3.2. 失敗情境驗證 (單一錯誤)

- **測試案例 3.2.1 (標題/目錄缺失)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-heading.md`
  - **預期結果**: 驗證失敗，指出標題或目錄條目不匹配。

- **測試案例 3.2.2 (程式碼區塊錯誤)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-codeblock.md`
  - **預期結果**: 驗證失敗，指出程式碼區塊不一致。

- **測試案例 3.2.3 (行內程式碼錯誤)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-inline-code.md`
  - **預期結果**: 驗證失敗，指出行內程式碼被修改。

- **測試案例 3.2.4 (提示區塊錯誤)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-alert.md`
  - **預期結果**: 驗證失敗，指出提示區塊語法被修改。

- **測試案例 3.2.5 (錨點連結錯誤)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-anchor.md`
  - **預期結果**: 驗證失敗，指出錨點連結不一致。

### 3.3. 綜合錯誤驗證

- **測試案例 3.3.1 (多重錯誤)**
  - **比對檔案**: `source/container.md` vs `target/container.md-error-multiple.md`
  - **預期結果**: 驗證函式應回傳一個包含所有對應錯誤的列表。

## 4. 實作規劃

1.  建立 `tests/validator.test.ts` 測試檔案。
2.  在 `tests/validator.test.ts` 中，為上述每一個測試案例撰寫對應的 `test()`。
3.  在測試中，直接 `import` `FileValidator` 類別或相關的檢查函式，傳入測試檔案的路徑，並斷言 (assert) 其回傳結果是否符合預期。
