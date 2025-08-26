# laradoc-trans

laradoc-trans 是一個命令列工具，旨在利用 Gemini CLI 將 [Laravel 官方文件](https://github.com/laravel/docs) 自動化翻譯成繁體中文。

## 主要功能

*   **自動化翻譯進度管理**: 即使翻譯過程中因故中斷，也能從上次的進度繼續執行，無需從頭來過。
*   **差異化更新**: 當官方文件更新時，程式會自動比對差異，僅翻譯有變動的檔案，大幅提升效率。
*   **彈性翻譯數量**: 您可以指定單次要翻譯的檔案數量，方便您檢視翻譯品質後，再決定是否繼續進行。
*   **多國語言介面**: 工具的提示訊息支援多國語言，目前支援英文及繁體中文，並會自動偵測您的系統語言。

## 環境需求

*   Node.js (v22.0.0 或更高版本)
*   Git
*   Gemini CLI

## 安裝步驟

1.  **安裝 Gemini CLI**
    ```bash
    npm install -g @google/gemini-cli
    ```
    若系統已經有安裝了則可以忽略此步驟。
2.  **複製專案庫**:
    ```bash
    git clone https://github.com/your-username/laradoc-trans.git
    cd laradoc-trans
    ```

3.  **安裝依賴套件**:
    ```bash
    npm install
    ```

4.  **編譯 TypeScript 程式碼**:
    ```bash
    npm run build
    ```

## 設定方式

1.  **設定環境變數**:
    在專案根目錄下，複製 `.env-dist` 檔案並重新命名為 `.env`。
    ```bash
    cp .env-dist .env
    ```
    接著，編輯 `.env` 檔案，並填入您的 Gemini API 金鑰：
    ```dotenv
    GEMINI_API_KEY=您的_API_金鑰
    ```
    您也可以設定其他環境變數：
    *   `GEMINI_MODEL`: 指定要使用的 Gemini 模型，預設為 `gemini-2.5-flash`。
    *   `WORKSPACE_PATH`: 指定工作區目錄的路徑，預設為專案根目錄下的 `workspace`。

2.  **準備來源文件**:
    將 Laravel 官方文件儲存庫複製到 `workspace/repo/source` 目錄：
    ```bash
    mkdir -p workspace/repo/source
    git clone https://github.com/laravel/docs.git workspace/repo/source
    ```

## 使用方法

本工具提供了一個 `laradoc-trans` 命令（或可透過 `npm run start --` 執行）來啟動翻譯程序。

### 基本用法

翻譯指定分支的單一檔案：
```bash
npm run start -- --branch=11.x
```

### 命令列參數

*   `--branch <branch>`: **(必要)** 指定要翻譯的 `source` 倉庫分支 (例如: `--branch=11.x`)。
*   `--limit <number>`: 限制單次翻譯的檔案數量 (例如: `--limit=5`)。
*   `--all`: 翻譯所有尚未翻譯的檔案。
*   `--env <path>`: 指定環境變數檔案的路徑 (預設: `.env`)。
*   `--prompt-file <path>`: 指定自訂的 AI 提示文件，若沒有指定將使用預設存放在 `assets/` 目錄下的 `TRANSLATE_PROMPT.md`。

### 使用範例

*   **翻譯 `11.x` 分支的所有未完成檔案**:
    ```bash
    npm run start -- --branch=11.x --all
    ```

*   **翻譯 `10.x` 分支的 5 個未完成檔案**:
    ```bash
    npm run start -- --branch=10.x --limit=5
    ```

## 目錄結構

*   `workspace/`: 主要工作區。
    *   `repo/source/`: 存放原始的 Laravel 文件 (Git 倉庫)。
    *   `repo/target/`: 存放翻譯完成的文件。
    *   `tmp/`: 暫存翻譯過程中的檔案及進度。
    *   `logs/`: 存放程式執行日誌。

## 翻譯流程簡介

1.  **初始化**: 程式會檢查必要的目錄與 Git 倉庫是否存在。
2.  **比對差異**: 透過比對 `source` 與 `target` 倉庫的 Git commit hash，判斷哪些檔案需要被翻譯或更新。
3.  **執行翻譯**: 呼叫 Gemini CLI 逐一翻譯檔案，並將結果暫存於 `tmp` 目錄。
4.  **完成與同步**: 所有檔案翻譯完成後，會將 `tmp` 目錄的內容同步至 `target` 目錄，並清空 `tmp`。

## 貢獻

歡迎您透過提交 Pull Request 或回報問題來為本專案做出貢獻。

## 授權許可

本專案採用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 授權。