# 開發者指南 (Developer Guide)

歡迎加入 `laradoc-trans` 的開發行列！本指南旨在協助您快速了解專案的內部架構、設定開發環境，並順利地貢獻您的程式碼。

---

## 目錄

1.  [專案工作流程概覽](#1-專案工作流程概覽)
2.  [核心機制詳解](#2-核心機制詳解)
3.  [開發環境設定](#3-開發環境設定)
4.  [程式碼結構導覽](#4-程式碼結構導覽)
5.  [測試](#5-測試)
6.  [國際化 (i18n)](#6-國際化-i18n)
7.  [貢獻流程](#7-貢獻流程)

---

## 1. 專案工作流程概覽

`laradoc-trans` 的運作流程非常簡單，主要由兩個命令構成：

1.  **`laradoc-trans init`**:
    -   **目的**：建立一個獨立、乾淨的工作區 (workspace)。
    -   **做了什麼**：它會從 GitHub 複製一份全新的 Laravel 官方文件（英文原版），並準備好存放翻譯文件的目錄。這個指令只負責「準備場地」，不關心你要翻譯哪個版本。

2.  **`laradoc-trans run`**:
    -   **目的**：執行翻譯任務。
    -   **做了什麼**：這是工具的核心。它會根據你指定的 `--branch`（例如 `12.x`），將來源文件交給 Gemini 進行翻譯，並聰明地管理翻譯進度。你可以重複執行此指令，它會自動從上次中斷的地方繼續，且不會重複翻譯已完成的檔案。

---

## 2. 核心機制詳解

在了解了基本工作流程後，以下是支撐這個流程的兩個核心設計：

-   **安全的指令重試 (Safe Retries)**：
    -   `init` 命令會檢查檔案和目錄是否存在，只建立缺少的部分，因此可以安全地重複執行。
    -   `run` 命令透過一個進度檔案 (`.progress`) 來追蹤每個檔案的翻譯狀態（未完成、已完成、失敗）。這讓 `run` 命令也可以安全地重複執行，並從上次的進度繼續。關於進度檔案的具體格式，請參考 `specs/FILE_FORMAT.md`。

-   **狀態分離 (State Separation)**：
    -   翻譯過程中的所有檔案都存放在 `tmp` 暫存目錄中。只有當**所有**檔案都成功翻譯完畢後，才會將結果一次性地複製到最終的 `repo/target` 目錄。
    -   這個設計確保了 `repo/target` 中的翻譯文件永遠是一個「完整」的集合，不會出現只翻譯一半的混亂狀態。

### 技術選型

-   **語言**: [TypeScript](https://www.typescriptlang.org/)
-   **執行環境**: [Node.js](https://nodejs.org/) (v22+)
-   **CLI 框架**: [Commander.js](https://github.com/tj/commander.js/)
-   **測試框架**: [Jest](https://jestjs.io/) with `ts-jest`
-   **國際化**: [i18next](https://www.i18next.com/)

## 3. 開發環境設定

1.  **複製專案**:
    ```bash
    git clone https://github.com/laradoc-trans-lab/laradoc-trans.git
    cd laradoc-trans
    ```

2.  **安裝依賴**:
    本專案使用 `npm` 進行套件管理。
    ```bash
    npm install
    ```

3.  **建立本地設定**:
    複製一份 `.env` 設定檔範本。
    ```bash
    cp .env-dist .env
    ```
    接著，編輯 `.env` 檔案並填入您的 Gemini API 金鑰，以便在開發和測試時使用。

4.  **編譯程式碼**:
    在進行開發時，您可以執行 `build` 指令來編譯 TypeScript 程式碼。
    ```bash
    npm run build
    ```

## 4. 程式碼結構導覽

所有主要的原始碼都位於 `src/` 目錄下。

-   `main.ts`: 程式的總入口點。負責解析 CLI 參數，並根據指令（`init` 或 `run`）呼叫對應的處理函數。
-   `cli.ts`: 使用 `Commander.js` 定義所有 CLI 指令、選項與參數。
-   `fileUtils.ts`: 封裝了與檔案系統互動的輔助函數，例如建立工作區、確保 `.env` 檔案存在等。
-   `git/`: 封裝了所有與 `git` 命令列工具互動的邏輯，例如 `clone`, `checkout`, `diff` 等。每個操作都有自己的錯誤類型定義。
-   `progress.ts`: 負責讀取和寫入翻譯進度檔案 (`.progress`, `.source_commit`) 的相關邏輯。關於進度檔案的具體格式定義，請參考 `specs/FILE_FORMAT.md`。
-   `translator.ts`: 封裝了呼叫外部 `gemini` CLI 工具的核心邏輯，並處理翻譯結果的解析。
-   `toolChecker.ts`: 一個簡單的輔助工具，用於檢查如 `git` 和 `gemini` 等必要的外部指令是否存在。
-   `i18n.ts`: `i18next` 的設定檔，負責初始化多國語言環境。

## 5. 測試

本專案使用 Jest 進行單元測試和場景測試。

-   **執行測試**:
    ```bash
    npm test
    ```

-   **測試目錄 (`tests/`)**:
    -   `scenario.test.ts`: 模擬使用者實際操作情境的整合測試，是測試的核心。
    -   `fixtures/`: 存放測試所需的模擬檔案和資料，例如一個迷你的 `workspace` 範本。
    -   `bin/`: 包含一個模擬的 `gemini` 腳本，讓我們可以在沒有網路連線或 API 金鑰的情況下測試翻譯失敗或成功的各種情境。

在您貢獻程式碼之前，請務必確保所有測試都能通過。

## 6. 國際化 (i18n)

所有面向使用者的輸出（`console.log`, `console.error`）都必須經過 `i18next` 處理。

-   **翻譯檔案**：位於 `resources/i18n/`。
-   **使用方式**：在程式碼中，請使用 `_()` 這個輔助函數來包裹字串，例如 `_('Hello, world!')`。

## 7. 貢獻流程

我們非常歡迎您的貢獻！

1.  Fork 本專案。
2.  建立您的功能分支 (`git checkout -b feature/AmazingFeature`)。
3.  進行修改並撰寫對應的測試。
4.  確保所有測試都通過 (`npm test`)。
5.  提交您的變更 (`git commit -m 'Add some AmazingFeature']`)。
6.  推送至您的分支 (`git push origin feature/AmazingFeature`)。
7.  開啟一個 Pull Request。