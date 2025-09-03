# laradoc-trans 使用說明

laradoc-trans 旨在協助將 Laravel 官方文件翻譯為繁體中文。它利用 Gemini CLI 來執行翻譯任務，並自動化管理翻譯進度與版本差異。

## 快速開始

1.  **安裝依賴**:
    ```bash
    npm install
    ```

2.  **初始化工作區**:
    執行 `init` 命令。此命令會建立工作區、複製 `https://github.com/laravel/docs.git`，並自動將專案的 `.env-dist` 複製為工作區中的 `.env` 檔案。您只需修改工作區中的 `.env` 即可。

    ```bash
    npm start -- init --branch 12.x
    ```

3.  **設定環境**:
    編輯 `workspace/.env` 檔案，填入您的 `GEMINI_API_KEY`。

4.  **開始翻譯**:
    執行 `run` 命令來翻譯文件。

    ```bash
    # 翻譯 5 個檔案
    npm start -- run --branch 12.x --limit 5

    # 或翻譯所有尚未翻譯的檔案
    npm start -- run --branch 12.x --all
    ```

## 命令列介面 (CLI)

本工具提供 `init` 和 `run` 兩個主要命令。

### 全域選項

-   `-v, --version` : 顯示程式版本。
-   `-h, --help` : 顯示幫助訊息。

---

### `init` 命令

用於初始化工作區，包括建立必要目錄、複製來源與目標 Git 倉庫，並準備 `.env` 設定檔。

**用法**: `npm start -- init [options]`

**功能**:

-   建立工作區及 `tmp`, `logs` 等目錄。
-   將專案根目錄的 `.env-dist` 複製到工作區內，並命名為 `.env` (若 `.env` 已存在則跳過)。
-   複製 (git clone) 來源與目標倉庫。

**選項**:

-   `--workspace-path <path>` :
    -   **說明**: 指定工作區的根目錄。
    -   **預設**: 當前目錄下的 `workspace`。

-   `--source-repo <url>` :
    -   **說明**: 指定來源文件的 Git 倉庫 URL。
    -   **預設**: `https://github.com/laravel/docs.git`

-   `--target-repo <url>` :
    -   **說明**: 指定用於存放翻譯文件的目標 Git 倉庫 URL。若不指定，將會建立一個本地的 Git 倉庫。
    -   **預設**: 無。

-   `--branch <branch>` :
    -   **說明**: 指定在首次複製 (clone) 倉庫時使用的分支。
    -   **預設**: 來源倉庫的預設分支。

**範例**:

```bash
# 使用預設值初始化 12.x 分支
npm start -- init --branch 12.x

# 指定工作區路徑並初始化
npm start -- init --workspace-path /path/to/my/workspace --branch 12.x
```

---

### `run` 命令

用於執行文件翻譯。此命令會自動比對來源與目標的版本差異，並只翻譯需要更新的檔案。

**用法**: `npm start -- run [options]`

**選項**:

-   `--branch <branch>`:
    -   **說明**: **(必要)** 指定要翻譯的 Git 分支名稱，例如 `12.x`。
    -   **範例**: `--branch 12.x`

-   `--limit <number>`:
    -   **說明**: 指定此次要翻譯的檔案數量。若未指定 `--all`，預設為 1。
    -   **範例**: `--limit 5` (翻譯 5 個檔案)

-   `--all`:
    -   **說明**: 翻譯所有尚未完成翻譯的檔案。
    -   **範例**: `--all`

-   `--env <path>`:
    -   **說明**: 指定要載入的 `.env` 檔案路徑。
    -   **預設**: 工作區根目錄下的 `.env`。
    -   **範例**: `--env .env.production`

-   `--prompt-file <path>`:
    -   **說明**: 指定翻譯時使用的提示詞檔案路徑。
    -   **預設**: `resources/TRANSLATE_PROMPT.md`。
    -   **範例**: `--prompt-file custom_prompt.md`

**範例**:

```bash
# 翻譯 12.x 分支中的下 1 個未翻譯檔案
npm start -- run --branch 12.x

# 翻譯 12.x 分支中的下 10 個未翻譯檔案
npm start -- run --branch 12.x --limit 10

# 翻譯 12.x 分支中所有剩餘的檔案
npm start -- run --branch 12.x --all
```

## 環境變數

程式會從工作區的 `.env` 檔案載入設定。您也可以直接設定環境變數來覆寫這些值：

-   `GEMINI_API_KEY`: **(必要)** 您的 Gemini API 金鑰。
-   `GEMINI_MODEL`: 使用的 Gemini 模型，預設為 `gemini-2.5-flash`。
-   `WORKSPACE_PATH`: 工作區路徑，預設為 `workspace`。
-   `LANG` / `LC_ALL`: 用於決定程式介面的顯示語言。

## 特殊檔案處理

`license.md` 與 `readme.md` 這兩個檔案**不會**被翻譯。程式會自動將這些檔案從來源直接複製到目標位置，以保留原始版權與說明內容。
