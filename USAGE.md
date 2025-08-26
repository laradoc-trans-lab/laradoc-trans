# laradoc-trans 使用說明

laradoc-trans 旨在協助將 Laravel 官方文件翻譯為繁體中文。它利用外部的 LLM (大型語言模型) CLI 工具來執行翻譯任務，並管理翻譯進度。

## 安裝

在執行本工具之前，請確保您已安裝所有必要的 Node.js 依賴。

```bash
npm install
```

## 使用方式

本工具透過命令列參數來控制翻譯行為。所有命令都應透過 `npm start --` 後接參數的方式執行。

### 環境變數設定

本工具依賴於以下環境變數來與 Gemini API 互動。建議透過專案根目錄下的 `.env` 檔案進行設定。

*   `GEMINI_API_KEY`：
    *   **說明**：您的 Gemini API 金鑰。**此變數為必要項。**
    *   **範例**：`GEMINI_API_KEY=YOUR_GEMINI_API_KEY`
*   `GEMINI_MODEL`：
    *   **說明**：指定要使用的 Gemini 模型。如果未設定，預設為 `gemini-2.5-flash`。
    *   **範例**：`GEMINI_MODEL=gemini-pro`

### 必要參數

*   `--branch <branch>`:
    *   **說明**：指定要操作的 Git 分支名稱。這通常是您正在翻譯的 Laravel 文件版本，例如 `10.x` 或 `12.x`。
    *   **範例**：`--branch 12.x`

### 可選參數

*   `--limit <number>`:
    *   **說明**：指定要翻譯的**接下來**的未翻譯檔案數量。程式將從進度檔案中找到的第一個未翻譯檔案開始，翻譯指定數量的檔案。
    *   **範例**：`--limit 5` (翻譯接下來的 5 個檔案)

*   `--all`:
    *   **說明**：翻譯所有**剩餘**的未翻譯檔案。程式將遍歷進度檔案中所有尚未標記為已翻譯的檔案，並逐一進行翻譯。
    *   **範例**：`--all`

*   `--env <path>`:
    *   **說明**：指定要載入的 `.env` 檔案路徑。若未指定，預設為專案根目錄下的 `.env` 檔案。
    *   **範例**：`--env .env.production`

*   `--prompt-file <path>`:
    *   **說明**：指定翻譯時使用的提示詞檔案路徑。若未指定，預設為專案根目錄 `assets/` 下的 `TRANSLATE_PROMPT.md`。
    *   **範例**：`--prompt-file custom_prompt.md`

*   `-v, --version`:
    *   **說明**：顯示目前的版本號。
    *   **範例**：`-v`

### 參數組合範例

*   **翻譯下一個未翻譯的檔案 (預設行為，不帶 `--limit` 或 `--all`)**：
    ```bash
    npm start -- --branch 12.x
    ```

*   **翻譯接下來的 3 個未翻譯檔案**：
    ```bash
    npm start -- --branch 12.x --limit 3
    ```

*   **翻譯所有剩餘的未翻譯檔案**：
    ```bash
    npm start -- --branch 12.x --all
    ```

> **特殊檔案處理**
>
> 請注意，`license.md` 與 `readme.md` 這兩個檔案**不會**被翻譯。程式會自動將這些檔案從來源直接複製到目標位置，並在進度中標記為已完成。因為版權宣告或原始的readme若由 AI 翻譯怕翻譯錯誤，所以保留原始內容。

## 翻譯進度管理

本工具會自動管理翻譯進度。它會在 `.tmp/.progress` 檔案中記錄每個檔案的翻譯狀態。

*   當一個檔案成功翻譯並寫入目標目錄後，它會被標記為已翻譯。
*   如果翻譯過程中發生錯誤，程式會將錯誤訊息寫入 `logs/error.log`，並在 5 秒後自動關閉。
*   當所有檔案都翻譯完成後，程式會自動將 `.tmp` 目錄中的所有翻譯好的 Markdown 檔案複製到**最終的目標儲存庫 `target_repo`** 目錄中。

## 錯誤處理

如果 `gemini` CLI 在執行過程中輸出錯誤訊息到 `stderr`，程式會將這些訊息記錄到 `logs/error.log`。當第一次收到錯誤訊息時，程式會通知用戶檢查該日誌檔案，並在 5 秒後自動關閉，以確保所有錯誤訊息都能被寫入日誌。

此外，如果 LLM 返回的翻譯結果不符合預期的 Markdown 格式（例如，缺少 Markdown 標題），程式會將原始的 LLM 輸出記錄到 `logs/error.log` 以供偵錯，並將該檔案標記為翻譯失敗。

## 注意事項



*   請確保您的環境中已正確設定 `gemini` CLI，並且 `GEMINI_API_KEY` 已正確設定。
*   本工具會嘗試從翻譯結果中提取 Markdown 內容。如果 LLM 輸出不包含有效的 Markdown 標題，該翻譯將被視為失敗。
*   本工具會忽略 `gemini` CLI 可能輸出的非翻譯資訊（例如 `Data collection is disabled.`）。