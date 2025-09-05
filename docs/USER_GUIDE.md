# 使用者指南 (User Guide)

歡迎使用 `laradoc-trans`！本指南將引導您完成從安裝、設定到執行的所有步驟，讓您能輕鬆地將 Laravel 官方文件翻譯為繁體中文。

---

## 目錄

1.  [安裝](#1-安裝)
2.  [核心概念：工作區](#2-核心概念工作區)
3.  [第一步：初始化 (`init` 命令)](#3-第一步初始化-init-命令)
4.  [第二步：執行翻譯 (`run` 命令)](#4-第二步執行翻譯-run-命令)
5.  [環境變數設定](#5-環境變數設定)
6.  [進階用法與範例](#6-進階用法與範例)

---

## 1. 安裝

請確保您的系統已安裝 [Node.js](https://nodejs.org/) (版本需 v22 或以上)。

我們建議使用全域安裝，讓您可以在任何地方執行 `laradoc-trans` 指令：

```bash
npm install -g laradoc-trans
```

安裝完成後，您可以執行以下指令來確認是否成功，並查看版本號：
```bash
laradoc-trans --version
```

## 2. 核心概念：工作區

`laradoc-trans` 的所有操作都在一個稱為「工作區」(Workspace) 的目錄中進行。這個目錄是獨立的，包含了所有翻譯所需的檔案，不會影響到您系統的其他部分。

工作區的預設結構如下：

```
workspace/
├── .env           # 環境變數設定檔 (需要您手動填寫 API Key)
├── logs/          # 執行日誌
├── repo/
│   ├── source/    # Laravel 官方文件的原始碼 (英文)
│   └── target/    # 您翻譯完成的檔案 (繁體中文)
└── tmp/           # 翻譯過程中的暫存目錄
```

## 3. 第一步：初始化 (`init` 命令)

`init` 命令是您與本工具互動的第一步。它會為您準備好完整的工作區結構，但**不會**涉及任何文件版本（分支）的選擇。

### 基本用法

在您想要放置工作區的地方，執行以下指令：

```bash
# 初始化工作區
laradoc-trans init
```

執行後，程式會：
1.  在當前目錄下建立一個工作區的目錄結構。
2.  自動從 GitHub 複製最新的 Laravel 官方文件（使用預設主分支）到 `repo/source`。
3.  在 `repo/target` 建立一個本地的 Git 倉庫，用來存放您的翻譯成果。
4.  為您建立 `.env` 設定檔，您只需開啟它並填入 API 金鑰即可。

### `init` 命令選項詳解

-   `--workspace-path <path>`
    指定工作區的建立位置。預設為您執行指令時所在的目錄。
    ```bash
    # 在 /home/user/my-projects/laravel-translation 中建立工作區
    laradoc-trans init --workspace-path /home/user/my-projects/laravel-translation
    ```

-   `--target-repo <url>`
    如果您已經有一個自己的遠端 Git 倉庫來存放翻譯文件，可以使用此選項。程式會將其複製到 `repo/target`，而不是在本地建立一個新的。
    ```bash
    laradoc-trans init --target-repo https://github.com/your-username/my-laravel-docs-zh-tw.git
    ```

## 4. 第二步：執行翻譯 (`run` 命令)

當您初始化工作區並設定好 `.env` 檔案後，就可以使用 `run` 命令來開始翻譯了。所有與**文件版本（分支）**相關的操作都在此指令中定義。

### 基本用法

```bash
# 翻譯 12.x 分支中所有尚未翻譯的檔案
laradoc-trans run --branch 12.x --all
```

程式會自動讀取 `tmp` 中的進度，並在需要時切換到您指定的分支，只翻譯未完成的檔案。

### `run` 命令選項詳解

-   `--branch <branch>` **(必要)**
    告訴程式您要針對哪個版本進行操作。程式會確保工作區切換到此分支。

-   `--all`
    翻譯所有尚未完成的檔案。這是最常用的選項。

-   `--limit <number>`
    如果您只想先試翻幾篇看看效果，可以使用此選項。它會只翻譯指定數量的未完成檔案。
    ```bash
    # 只翻譯接下來的 5 個檔案
    laradoc-trans run --branch 12.x --limit 5
    ```
    > 如果 `--all` 和 `--limit` 都沒有提供，預設行為是只翻譯 1 個檔案。

-   `--prompt-file <path>`
    如果您想客製化送給 Gemini 的翻譯提示詞 (Prompt)，可以透過此選項指定一個自己的 `.md` 檔案，範例可以參考本專案的 [提示詞檔案](../resources/TRANSLATE_PROMPT.md)。

-   `--env <path>`
    指定 `.env` 檔案的位置。預設會自動讀取工作區根目錄下的 `.env`，通常不需要手動設定此項。

## 5. 環境變數設定

`laradoc-trans` 透過 `.env` 檔案來讀取您的設定。此檔案應位於工作區的根目錄。

-   `GEMINI_API_KEY` **(必要)**
    您的 Google Gemini API 金鑰。請至 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得。

-   `GEMINI_MODEL` (可選)
    指定要使用的 Gemini 模型。預設為 `gemini-2.5-flash`。

## 6. 進階用法與範例

### 情境一：我想繼續上次未完成的翻譯

您不需要做任何特別的操作。`laradoc-trans` 會自動偵測進度。只需再次執行與上次相同的 `run` 命令即可。

```bash
# 假設上次執行被中斷，再次執行即可從斷點繼續
laradoc-trans run --branch 12.x --all
```

### 情境二：如何翻譯官方文件的更新？

本工具**不會**自動連線到網路檢查更新。當您得知 Laravel 官方文件有新版本或修改時，您需要手動進行更新。流程如下：

**第一步：手動更新來源倉庫**

請使用終端機，進入到您的來源文件目錄，並執行 `git pull` 來拉取最新的變更。

```bash
# 進入 source 目錄
cd repo/source

# 拉取最新變更
# (請確保您在正確的分支上，例如 12.x)
git pull origin 12.x

# 返回上一層目錄
cd ../../
```

**第二步：再次執行 `run` 命令以進行差異化更新**

更新完畢後，您**不需要**重新 `init` 或做任何其他設定。只需像平常一樣，再次執行 `run` 命令：

```bash
laradoc-trans run --branch 12.x --all
```

程式會自動偵測到您剛剛拉取的更新（透過比對 Git commit hash），並只將有變動的檔案加入到翻譯佇列中。這就是 `laradoc-trans` 管理進度的核心機制：它總是將您本地的來源與上次的翻譯記錄進行比較，確保只做必要的工。

### 情境三：特殊檔案處理

`license.md` (授權文件) 和 `readme.md` (專案說明) 這兩個檔案不會被翻譯，程式會直接從原文複製。這是為了確保授權資訊的完整性與原始說明的準確性。