# laradoc-trans 專案規格 (SPECS)

## 專案目的

laradoc-trans 的目的是為了將 [Laravel 官方文件](https://github.com/laravel/docs) 進行繁體中文化的翻譯，翻譯的工作主要是交給 `Gemini CLI` 進行。

程式運作的方式主要是提供 CLI 給用戶操作，例如 `npm run start <command> [options]`就可以進行自動化翻譯。

## 1. Features

- 翻譯進度自動化管理
  - 翻譯過程可能因程式或網路問題失敗，但可以繼續未翻譯的進度。
  - 可以指定翻譯的數量讓使用者檢視翻譯品質再決定是否繼續翻譯。
- 差異化比對
  - 官方若有更新文件，則可以只翻譯更新的文件檔案，不需要全部重新翻譯。

## 2. 技術棧

laradoc-trans 主要是以 nodeJS 運作並使用 TypeScript 來開發最後進行編譯成 Javascript。

- 程式語言 : TypeScript
- 執行環境 : Node.js v22+
- npm 使用套件
  - dotenv
  - Commander.js
  - i18next (用於國際化，所有使用者介面訊息皆應透過此套件進行翻譯)
  - i18next-fs-backend (i18next 的檔案系統後端，用於載入翻譯檔案)
  - i18next-cli-language-detector (i18next 的語言偵測器，用於自動偵測系統語言)
- Gemini CLI : 此為外部命令，主要是為了翻譯的工作，系統必須安裝好
- git : 此為外部命令，主要給程式操作 git，系統必須先安裝好

### 2.1 國際化 (i18n)

本專案採用 `i18next` 進行國際化。所有面向使用者的訊息（例如 `console.log`, `console.error` 的輸出）都必須透過 `i18next` 進行管理和翻譯。

- **翻譯鍵 (Translation Keys)**: 翻譯鍵應直接使用原始英文字串。
- **語言偵測 (Language Detection)**: 程式會自動偵測系統語言環境變數 (`LANG` 或 `LC_ALL`) 來決定介面語言。若未偵測到或偵測到的語言不支援，則會回退到英文 (`en`)。
- **後備語言 (Fallback Language)**: 後備語言為英文 (`en`)。
- **翻譯檔案 (Translation Files)**: 翻譯檔案存放於 `resources/i18n/` 目錄下，並以語言代碼命名 (例如 `en.json`, `zh-TW.json`)。
- **鍵分割與命名空間 (Key Separator & Namespace)**: `i18next` 的鍵分割符號 (`keySeparator`) 和命名空間分隔符號 (`nsSeparator`) 皆已禁用，以確保原始字串能作為完整的翻譯鍵。
- **簡化呼叫 (Simplified Calls)**: 為了簡化程式碼，`i18next.t` 函數已別名為 `_`，因此可以使用 `_("原始英文字串", { 參數 })` 的方式進行翻譯呼叫。

## 3. 目錄結構說明

- `.gemini` : VS Code 中使用 Gemini Code Assit 所需的設定檔存放於此
- `src` : Typescript 原始碼
- `workspace`: 工作區，此目錄為使用者自行建立，但程式需要用到，為了彈性，也可以建立在專案之外的路徑並藉由參數指定。
- `workspace/repo/source` : 使用者必須以 `git clone` 命令將官方文件下載放這。
- `workspace/repo/target` : 翻譯完成的檔案會存放於此。
- `workspace/tmp` : 工作暫存目錄，翻譯時會預先使用此目錄進行翻譯進度管理，待全部的進度完成才會將翻譯好的所有檔案複製到 `workspace/repo/target` 。
- `workspace/logs` : 記錄檔存放區， `error.log` 可用於檢視錯誤。

## 4. 核心功能與流程

### 4.1 提供使用者的參數

本工具使用 Commander.js 解析命令列參數。

程式執行時可以用 `node dist/main.js <command> [options]` 或 `npm run start <command> [options]` 的方式來使用。

#### `init` 命令

用於初始化工作區。

- **用法**:
  - `laradoc-trans init [options]`

- **選項**:
  - `--workspace-path <path>` : 指定工作區的根目錄。若未指定，則預設為當前執行命令的目錄。
  - `--source-repo <url>` : 指定 `workspace/repo/source` 的遠端 Git 倉庫 URL。若未指定，則預設為 `https://github.com/laravel/docs.git`。
  - `--target-repo <url>` : 指定 `workspace/repo/target` 的遠端 Git 倉庫 URL。若未指定，則 `workspace/repo/target` 會被初始化為一個本地 Git 倉庫。

- **功能**:
  - 根據 `--workspace-path` 選項決定工作區的根目錄。
  - 在工作區內建立 `tmp`, `logs` 等必要目錄。
  - 將專案根目錄的 `.env-dist` 檔案複製到工作區的根目錄，並命名為 `.env`。如果工作區中已存在 `.env` 檔案，則跳過此操作。
  - 根據 `--source-repo` 選項將 Laravel 官方文件 `git clone` 到 `workspace/repo/source`。如果 `workspace/repo/source` 已存在且是有效的 Git 倉庫，則跳過複製。
  - 根據 `--target-repo` 選項初始化 `workspace/repo/target`：
    - 若指定了 `--target-repo`，則會 `git clone` 該遠端倉庫到 `workspace/repo/target`。如果 `workspace/repo/target` 已存在且是有效的 Git 倉庫，則跳過複製。
    - 若未指定 `--target-repo`，則會在 `workspace/repo/target` 執行 `git init` 建立一個新的本地 Git 倉庫。如果 `workspace/repo/target` 已存在且是有效的 Git 倉庫，則跳過初始化。

#### `run` 命令

用於執行文件翻譯。

- **用法**: `laradoc-trans run [options]`

- **選項**:
  - `--branch <branch>` : **必要參數**。例如 `--branch 12.x` 代表要翻譯 `workspace/repo/source` 的 `12.x` 分支。
  - `--limit <limit>` : 例如 `--limit 5` 代表只需要翻譯尚未翻譯的5個檔案。若未指定 `--all` 且未指定此參數，則預設只翻譯 1 個檔案。
  - `--all` : 翻譯全部尚未完成翻譯的檔案。
  - `--env <file>` : 指定環境變數檔案。若不指定，則預設會使用專案根目錄的 `.env`。`.env` 是程式運作必要的設定檔，但也可以透過直接使用環境變數來進行程式所需要的設定，可參考 [4.2 可用的環境變數](#42-可用的環境變數)。
  - `--prompt-file <file>` : 指定一個檔案作為翻譯的提示詞。若不指定，則預設會使用專案根目錄 `resources/` 下的 `TRANSLATE_PROMPT.md`。

#### 全域選項

- `-v, --version` : 顯示程式版本。
- `-h, --help` : 顯示幫助訊息。

### 4.2 可用的環境變數

- GEMINI_MODEL : 使用 gemini cli 時指定的 model , 若沒有指定，則預設為 `gemini-2.5-flash`
- GEMINI_API_KEY : 使用 gemini cli 時指定的 api key，此為必須的參數。
- WORKSPACE_PATH : 工作區路徑，若沒指定則預設是專案根目錄的 `workspace`。
- LANG / LC_ALL : 系統語系環境變數，用於自動偵測程式介面語言。若未設定或偵測失敗，預設為英文 (`en`)。

### 4.3 初始化

1.  **工作區初始化**: 當執行 `init` 命令時，程式會自動處理工作區的建立與設定。
    - 工作區的根目錄由 `--workspace-path` 選項決定。若未指定，則預設為當前執行命令的目錄。
    - 工作區建立後，會自動將 [Laravel 官方文件](https://github.com/laravel/docs) 的最新版本 `git clone` 到 `workspace/repo/source`。如果 `workspace/repo/source` 已存在且是有效的 Git 倉庫，則跳過複製。
    - `workspace/` 下的 `tmp`、`logs` 等必要目錄若不存在，也會由程式自行建立。
    - `workspace/repo/target` 的初始化行為取決於 `--target-repo` 選項：
      - 若指定了 `--target-repo <url>`，則會 `git clone` 該遠端倉庫到 `workspace/repo/target`。如果 `workspace/repo/target` 已存在且是有效的 Git 倉庫，則跳過複製。
      - 若未指定 `--target-repo`，則會在 `workspace/repo/target` 執行 `git init` 建立一個新的本地 Git 倉庫。如果 `workspace/repo/target` 已存在且是有效的 Git 倉庫，則跳過初始化。
2.  **Git 倉庫檢查**: `run` 命令執行前，會檢查 `workspace/repo/source` 是否是一個合法的 Git 倉庫。如果不是，則會拋出錯誤。這確保了翻譯操作總是在一個有效的來源倉庫上進行。

### 4.4 翻譯流程

先初步解說 `workspace` 下的 `tmp` / `repo/tartget` 及 `repo/source` 的關係。

`workspace/repo/source` 這裡我稱呼為 `來源倉庫`，意思就是原始的文件，需要被翻譯的。

`workspace/tmp` 主要作為翻譯過程中暫存翻譯好的 Markdown 檔案及翻譯進度追蹤的檔案，而翻譯進度追蹤的檔案會有兩個

1. `.progress` : 紀錄所有需要翻譯的檔案到底翻譯沒，格式可詳見 `FILE_FORMAT.md`。
2. `.source_commit` : 紀錄目前進度是翻譯`來源倉庫` 那一個 `commit hash` 的版本。

藉由上述兩個檔案及使用 `git diff` 的方式對 `來源倉庫`與 `.source_commit` 內的 hash 進行差異比，當來源倉庫有異動，則必須更新 `.progress`，然後再依照 `.progress` 內容進行翻譯。

`workspace/repo/target` 這裡我稱呼為 `目標倉庫` ，當所有翻譯進度都完成了，則把 `tmp` 底下的 `.source_commit` 及所有 Markdown 檔案會複製至 `目標倉庫` , 這樣 `目標倉庫`就會與來源倉庫的版本一致。

為了達成上述目的，必須依照下列流程來處理:

1. 以 `git` 切換 `workspace/repo/source` 指定的分支。
2. 若 `workspace/repo/target` 不存在則必須以 git 建立倉庫，並且也建立與使用者指定的分支一樣的分支，最後必須切至使用者指定的分支。
3. 判斷 `workspace/tmp/.progess` 是否存在
   - 當此檔案不存在的時候，可藉由比對  `workpace/repo/target/.source_commit` 及 `workspace/repo/source` 的 `commit hash` 來判斷是否一致，這裡會有三種狀況 :
     1. 若 `workspace/repo/target` 不存在 `.source_commit`，代表目標倉庫沒有過去的翻譯紀錄，則必須於 `workspace/tmp/.progress` 中建立翻譯檔案的列表，並建立 `workspace/tmp/.source_commit` 紀錄要翻譯的來源倉庫的 `commit hash`。
     2. 如果兩者 hash 相同，代表翻譯的版本已經是最新的，不需要進行翻譯。
     3. 如果兩者 hash 不相同，則必須透過 `git diff --name-only <舊 hash> <新 hash>` 找出所有變更的檔案，並依此重建翻譯進度於 `workspace/tmp/.progress` ，也要建立 `.source_commit` 紀錄來源倉庫的 `commit hash`。
   - 當此檔存在的時候，代表翻譯進度未完成，必須作以下兩個動作 :
     1. 比對 `workspace/tmp/.source_commit` 及 `workspace/repo/source` 的 `commit hash` 來判斷是否一致, 若不一致，代表來源倉庫的檔案有更新，此時必須以 `git diff` 方式比對那些檔案有修改或新增，並更新 `.progress` 內容。
     2. 繼續翻譯未翻譯的檔案。

4. 依照 `workspace/tmp/.progress` 的內容有標記待翻譯的檔案，陸續將檔案交由外部命令 `gemini`進行翻譯並將翻譯結果儲存於 `workspace/tmp` 下。
5. **特殊檔案處理**: 對於 `license.md` 與 `readme.md` 檔案，不進行翻譯。程式應直接將其從 `workspace/repo/source` 複製到 `workspace/tmp`，並在 `.progress` 中將其標記為已翻譯。

### 4.5 所有檔案翻譯完成後的流程

當 `workspace/tmp/.progress` 內所有檔案都完成翻譯後，程式必須執行以下收尾工作：

1. 將 `workspace/tmp` 中所有翻譯好的 `.md` 檔案與 `.source_commit` 複蓋到 `workspace/repo/target` 。
2. 清空 `workspace/tmp` 下所有的檔案。

### 4.6 Gemini CLI 翻譯方式與注意事項

請參考 `GEMINI_CLI_TIPS.md`。

## 撰寫 `退出程式` 時注意原則

請勿任意調用 `process.exit` , 盡可能的拋出 `自訂 Error`。

因 `main.ts` 最後面有一段程式碼如下:

```typescript
  main(process.argv).catch((error) => {
      debug(error);
      process.exit(1);
  });
```

`main().catch()` 本身就會捕獲例外錯誤，並且退出，這麼做的原因是為了 `jest` 也能夠捕獲 `自訂 Error`，而非依靠比對字串來測試。

以下片段若用於 `jest`，就能執行 `main()` 模擬 CLI 運作，並且也可以捕獲到 `自訂 Error`。

```typescript
await expect(main(argv)).rejects.toThrow(RepositoryNotFoundError);
```