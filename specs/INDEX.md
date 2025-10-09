# laradoc-trans 專案規格 (SPECS)

## 專案目的

laradoc-trans 的目的是為了將 [Laravel 官方文件](https://github.com/laravel/docs) 進行繁體中文化的翻譯，翻譯的工作主要是交給 LLM 進行。

程式運作的方式主要是提供 CLI 給用戶操作，例如 `npm run start <command> [options]`就可以進行自動化翻譯。

## 1. Features

- 翻譯進度自動化管理
  - 翻譯過程可能因程式或網路問題失敗，但可以繼續未翻譯的進度。
  - 可以指定翻譯的數量讓使用者檢視翻譯品質再決定是否繼續翻譯。
- 差異化比對
  - 官方若有更新文件，則可以只翻譯更新的文件檔案，不需要全部重新翻譯。
- 翻譯品質驗證
  - 提供 `validate` 命令，對翻譯結果進行結構與內容的完整性驗證。

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
  - langchain (提供 LLM 的抽象層，方便切換不同模型)
  - @langchain/core (LangChain 的核心功能)
  - @langchain/google-genai (用於整合 Google Gemini 模型)
  - @langchain/openai (用於整合 OpenAI 模型)
  - remark (用於解析 Markdown)
  - unist-util-visit (remark 的輔助工具)
  - cli-progress (用於顯示多個併發任務的進度條)
  - p-limit (用於處理併發翻譯章節)
  - nunjucks (用於產生 validate 報告的樣板引擎)
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
- `workspace/tmp/<branch_name>` : 工作暫存目錄，翻譯時會預先使用此目錄進行翻譯進度管理，待全部的進度完成才會將翻譯好的所有檔案複製到 `workspace/repo/target` 。`<branch_name>` 會是當前翻譯的分支名稱，例如 `11.x` 或 `12.x`。
- `workspace/logs` : 記錄檔存放區， `error.log` 可用於檢視錯誤。
- `workspace/validate-report`: 存放 `validate` 命令產生的驗證報告。
  - `SUMMARY.md`: 總結所有檔案的驗證結果。
  - `details/`: 存放驗證失敗檔案的詳細報告。

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

#### `run` 命令

用於執行文件翻譯。

- **用法**: `laradoc-trans run [options]`

- **選項**:
  - `--branch <branch>` : **必要參數**。例如 `--branch 12.x` 代表要翻譯 `workspace/repo/source` 的 `12.x` 分支。
  - `--limit <limit>` : 例如 `--limit 5` 代表只需要翻譯尚未翻譯的5個檔案。若未指定 `--all` 且未指定此參數，則預設只翻譯 1 個檔案。
  - `--all` : 翻譯全部尚未完成翻譯的檔案。
  - `--env <file>` : 指定環境變數檔案。若不指定，則預設會使用專案根目錄的 `.env`。
  - `--prompt-file <file>` : 指定一個檔案作為翻譯的提示詞。若不指定，則預設會使用專案根目錄 `resources/` 下的 `TRANSLATE_PROMPT.md`。此檔案採用 [Nunjucks](https://mozilla.github.io/nunjucks/) 模板引擎進行解析，允許在提示詞中使用 `{{ variable }}` 或 `{% if ... %}` 等語法。

#### `validate` 命令

用於驗證翻譯品質。

- **用法**: `laradoc-trans validate [options]`

- **選項**:
  - `--branch <branch>` : **必要參數**。指定要驗證的分支，程式會以此比對 `source` 與 `target` 兩個倉庫的檔案。
  - `--regenerate-progress` : **(可選)** 根據驗證失敗的檔案，重新產生 `workspace/tmp/.progress` 檔案，以便於重新翻譯。

- **功能**:
  - 比對 `source` 與 `target` 兩個倉庫的檔案。
  - 在 `workspace/validate-report/` 目錄下生成驗證報告。

#### 全域選項

- `-v, --version` : 顯示程式版本。
- `-h, --help` : 顯示幫助訊息。

### 4.2 可用的環境變數

- `LLM_PROVIDER`: 指定要使用的 LLM 供應商。可以是 `openai` 或 `gemini`。若未指定，預設為 `gemini`。
- `GEMINI_API_KEY` / `OPENAI_API_KEY`: 對應供應商的 API 金鑰。為了避免觸及速率限制，`GEMINI_API_KEY` 支援多金鑰輪換機制：除了主要的 `GEMINI_API_KEY` 之外，您還可以設定 `GEMINI_API_KEY_0`, `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2` 等等。程式會自動收集所有這些金鑰並在翻譯過程中輪流使用。
- `GEMINI_MODEL` / `OPENAI_MODEL`: 指定要使用的模型名稱。若未指定，`gemini` 預設為 `gemini-2.5-pro`，`openai` 預設為 `gpt-4o`。
- `TRANSLATION_CONCURRENCY`: 指定翻譯任務的併發數量。若未指定，預設為 `3`。
- `WORKSPACE_PATH`: 工作區路徑，若沒指定則預設是專案根目錄的 `workspace`。
- `LANG` / `LC_ALL`: 系統語系環境變數，用於自動偵測程式介面語言。若未設定或偵測失敗，預設為英文 (`en`)。

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

當 `run` 命令執行時，程式會對每一個需要翻譯的 Markdown 檔案執行以下流程：

1.  **動態分批 (Dynamic Batching)**：
    -   程式首先會將 Markdown 檔案解析成多個章節（以 H2 標題為單位）。
    -   為了優化與語言模型的互動，程式會將這些章節組合成多個「批次」(Batches)。這個過程是動態的，基於內容的大小而非固定的章節數量。
    -   演算法會不斷將章節加入目前的批次，直到批次的總大小超過 `BATCH_SIZE_LIMIT`。如果某個章節本身就超過限制，它會自成一個批次。
    -   詳細的理念與作法請參閱 [TASK_ASSIGMENT.md](TASK_ASSIGMENT.md)。

2.  **併發翻譯 (Concurrent Translation)**：
    -   程式會使用 `p-limit` 函式庫，根據 `TRANSLATION_CONCURRENCY` 環境變數（預設為 3）設定的併發數，同時對多個「批次」發起翻譯請求。
    -   每個批次的翻譯進度會由一個獨立的進度條顯示，包含任務編號、狀態、已接收位元組、即時耗時和批次內的章節標題。

3.  **儲存與進度更新**：
    -   在單一檔案的所有「批次」都成功翻譯完畢後，程式會將組合後的完整翻譯內容寫入 `workspace/tmp` 目錄下的對應檔案。
    -   接著，程式會更新 `workspace/tmp/.progress` 檔案，將這一個檔案的狀態標記為已完成。這個設計確保了即使中途失敗，重啟任務時也能從下一個未完成的**檔案**繼續。

### 4.5 所有檔案翻譯完成後的流程

當 `workspace/tmp/.progress` 內所有檔案都完成翻譯後，程式必須執行以下收尾工作：

1. 將 `workspace/tmp` 中所有翻譯好的 `.md` 檔案與 `.source_commit` 複蓋到 `workspace/repo/target` 。
2. 清空 `workspace/tmp` 下所有的檔案。

### 4.6 翻譯品質驗證流程 (`validate` 命令)

當使用者執行 `validate` 命令時，程式將執行以下流程：

1.  **前置作業**:
    -   清空並重建 `workspace/validate-report/` 目錄，包含 `details/` 子目錄。
    -   根據使用者指定的 `--branch`，`git checkout` `source` 和 `target` 兩個倉庫到對應分支。

2.  **檔案比對與驗證**:
    -   程式會遍歷 `target` 倉庫中的所有 `.md` 檔案。
    -   對於每一個檔案，程式會找到 `source` 倉庫中對應的原始檔案。
    -   執行以下三項驗證：
        1.  **標題數量驗證**: 使用 `remark` 解析兩個檔案，計算 H1-H6 標題數量是否一致。
        2.  **程式碼區塊驗證**: 提取所有 ` ``` ` 區塊，比對數量與內容是否完全一致。
        3.  **提示區塊驗證**: 檢查 `[!NOTE]`, `[!WARNING]` 等標記是否被不當轉義或修改。

3.  **報告生成**:
    -   所有驗證報告皆為英文，不進行 i18n。
    -   **總結報告 (`SUMMARY.md`)**: 在 `validate-report` 根目錄下建立，包含多個 Markdown 表格，分別總結各項驗證的結果，並使用 ✅ 和 ❌ 符號標示狀態。
    -   **詳細報告 (e.g., `billing.md`)**: 只有驗證失敗的檔案，才會在 `validate-report/details/` 子目錄下生成同名的詳細報告。報告中會清晰地列出每一個問題點，例如：
        -   標題數量不符的計數。
        -   內容不符的程式碼區塊，並同時展示原文與譯文以便比對。
        -   被不當修改的提示區塊標記，並同時展示原文與譯文。

## 撰寫 `錯誤處理` 或 `退出程式` 時注意原則

`src/main.ts` 最後面會捕捉錯誤，如下 :

```js
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main(process.argv).catch((error) => {
      debug(error);
      process.exit(1);
  });
}
```


此作法是為了用於測試與偵錯。

因此，程式中要做錯誤處理並且退出程式正確步驟做法如下 :

1. 必須在主程式邏輯捕捉錯誤。
2. 印出對用戶友善的錯誤訊息。
3. 拋出原有的 `Error`。

如下範例 :

```js
  try {
    await checkToolExistence('git');
  } catch (error: unknown) {
    if (error instanceof ToolNotFoundError) {
      console.error(_('Error: Required tool \'{{toolName}}\' is not installed. Please install it and make sure it is in your PATH.', { toolName: error.toolName }));
    }
    throw error;
  }
```
`checkToolExistence` 目的是為了檢查系統是否有 `git` 工具可以用，若找不到，會得到 `ToolNotFoundError` 的錯誤，這時候於 `catch` 區塊內印出友善的訊息，並且拋出原有的錯誤，這樣子用戶便得到了真正的錯誤訊息，如果用於測試程式，也能捕獲到 `ToolNotFoundError`。

