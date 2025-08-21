# Laravel Docs LLM Translator 專案規格 (SPECS)

## 專案目的

本專案目的是為了將 [Laravel 官方文件](https://github.com/laravel/docs) 進行繁體中文化的翻譯，翻譯的工作主要是交給 `Gemini CLI` 進行。

程式運作的方式主要是提供 CLI 給用戶操作，例如 `npm run start [args.....]`就可以進行自動化翻譯。

## 1. Features

- 翻譯進度自動化管理
  - 翻譯過程可能因程式或網路問題失敗，但可以繼續未翻譯的進度。
  - 可以指定翻譯的數量讓使用者檢視翻譯品質再決定是否繼續翻譯。
- 差異化比對
  - 官方若有更新文件，則可以只翻譯更新的文件檔案，不需要全部重新翻譯。

## 2. 技術棧

本專案主要是以 nodeJS 運作並使用 TypeScript 來開發最後進行編譯成 Javascript。

- 程式語言 : TypeScript
- 執行環境 : Node.js v22+
- npm 使用套件
  - dotenv
  - Commander.js
- Gemini CLI : 此為外部命令，主要是為了翻譯的工作，系統必須安裝好
- git : 此為外部命令，主要給程式操作 git，系統必須先安裝好

## 3. 目錄結構說明

- `.gemini` : VS Code 中使用 Gemini Code Assit 所需的設定檔存放於此
- `src` : Typescript 原始碼
- `workspace`: 工作區，此目錄為使用者自行建立，但程式需要用到，為了彈性，也可以建立在專案之外的路徑並藉由參數指定。
- `workspace/repo/source` : 使用者必須以 `git clone` 命令將官方文件下載放這。
- `workspace/repo/target` : 翻譯完成的檔案會存放於此。
- `workspace/tmp` : 工作暫存目錄，翻譯時會預先使用此目錄進行翻譯進度管理，待全部的進度完成才會將翻譯好的所有檔案複製到 `workspace/repo/target` 。
- `workspace/logs` : 記錄檔存放區， `error.log` 可用於檢視錯誤，`debug.log` 可用於除錯。

## 4. 核心功能與流程

### 4.1 提供使用者的參數

本工具使用 Commander.js 解析命令列參數。

程式執行時可以用 `node dist/main.js` 或 `npm run start` 的方式搭配一些參數來使用，以下是參數說明:

- `--branch` : 例如 `--branch 12.x` 代表要翻譯 `workspace/repo/source` 的 `12.x` 分支，且這是必要參數。
- `--limit` : 例如 `--limit 5` 代表只需要翻譯尚未翻譯的5個檔案。
- `--all` : 翻譯全部尚未完成翻譯的檔案。
- `--env` : 指定環境變數檔案，若不指定，則預設會使用專案根目錄的 `.env`,`.env` 是程式運作必要的設定檔，但也可以透過直接使用環境變數來進行程式所需要的設定，可參考 [4.2 可用的環境變數](#42-可用的環境變數)。

如果使用者沒有下達 `--limit` 或 `--all` 代表只翻譯尚未完成翻譯的 1 個檔案。

### 4.2 可用的環境變數

- GEMINI_MODEL : 使用 gemini cli 時指定的 model , 若沒有指定，則預設為 `gemini-2.5-flash`
- GEMINI_API_KEY : 使用 gemini cli 時指定的 api key，此為必須的參數。
- WORKSPACE_PATH : 工作區路徑，若沒指定則預設是專案根目錄的 `workspace`。

### 4.3 初始化

1. 一開始必須檢查 `workspace/repo/source` 是否已經被使用者建立了，這是必須的，且這必須是一個合法的 Git 倉庫。
2. `workspace/` 下的 `tmp` `logs` `repo/target` 若不存在則必須由程式自行建立。

### 4.4 翻譯流程

1. 以 `git` 切換 `workspace/repo/source` 指定的分支。
2. 若 `workspace/repo/target` 不存在則必須以 git 建立倉庫，並且也建立與使用者指定的分支一樣的分支，不管存在或不存在最後都必須切至使用者指定的分支。
3. 判斷 `workspace/tmp/.progess` 是否存在
   - 當此檔存在的時候，代表翻譯進度未完成，必須繼續翻譯未完成翻譯的檔案。
   - 當此檔案不存在的時候，可藉由比對  `workpace/repo/target/.source_commit` 及 `workspace/repo/source` 的 `commit hash` 來判斷是否一致會有三種狀況 :
     1. 若 `workspace/repo/target` 不存在 `.source_commit`，代表目標倉庫為初次翻譯，則必須將來源倉庫所有 `.md` 檔案都加入到翻譯進度，並重建翻譯進度於`workspace/tmp/.progress`。
     2. 如果兩者 hash 相同，代表翻譯的版本已經是最新的，不需要進行翻譯。
     3. 如果兩者 hash 不相同，則必須透過 `git diff --name-only <舊 hash> <新 hash>` 找出所有變更的檔案，並依此重建翻譯進度於 `workspace/tmp/.progress` ，也要建立 `.source_commit` 紀錄來源倉庫的 `commit hash`。
4. 依照 `workspace/tmp/.progress` 的內容有標記待翻譯的檔案，陸續將檔案交由外部命令 `gemini`進行翻譯並將翻譯結果儲存於 `workspace/tmp` 下。

### 4.5 所有檔案翻譯完成後的流程

當 `workspace/tmp/.progress` 內所有檔案都完成翻譯後，程式必須執行以下收尾工作：

1. 將 `workspace/tmp` 中所有翻譯好的 `.md` 檔案與 `.source_commit` 複蓋到 `workspace/repo/target` 。
2. 清空 `workspace/tmp` 下所有的檔案。

### 4.6 翻譯進度管理的方式

請參考 `PROGRESS_MANAGEMENT.md`。

### 4.7 Gemini CLI 翻譯方式與注意事項

請參考 `GEMINI_CLI_TIPS.md`。

