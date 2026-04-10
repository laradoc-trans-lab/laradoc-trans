# laradoc-trans 更新紀錄

## 0.3.5 2026-04-10
- 升級 Google LangChain 整合套件：`@langchain/google-genai` -> `@langchain/google`。
- 修正 Gemini / Gemma 串流內容解析：避免因內容區塊物件轉字串導致 `[object Object]` 混入翻譯結果。
- 修正 Gemma 4 可能回傳 thought/reasoning 區塊時，會混入最終譯文的問題；目前僅合併可見文字區塊（排除 `thought: true`）。
- 調整 LLM 配額錯誤判斷為通用 429 / rate limit 檢測，不再依賴舊版 Google SDK 錯誤類別。
- 同步更新相關測試與規格文件中舊套件名稱。
- 提示詞加入翻譯對照表，提升用語一致性。
- gemini model 預設採用 `gemini-3-flash-preview`
- Issue #19 : 修復來源 git repo 有檔案刪除時，會中斷翻譯進度。

## 0.3.4 2025-12-14
- Bug fixed: 有時候出現 Cannot read properties of undefined (reading 'reduce') , 是 langchain 問題，升級最新版後已經修復
- package.json 修改 engines.node 設定不然會跳出安裝警告

## 0.3.3 2025-11-23

- 使用新的提示詞檔案，增加錯誤的範例以減少翻譯錯誤
- Issue #16 : 升級 langchain 至 v1 正式版，及 openai , google-genai 一併升級

## 0.3.2 2025-10-22

- 驗證報告增加驗證原文與譯文的總標題數量
- 修復 validate `GitHub-flavored Alerts ` 報告錯誤的問題

## 0.3.1 2025-10-09

- Issue #15 : 重構 markdownParser.ts 解決 shell block 的註解被誤判為標題。
- Bug fixed : 修正切換分支翻譯，會因為 tmp 內的 .source_commit 是前一分支，造成差異比對錯誤而要全部重新翻譯的問題。
- TRANSLATE_PROMPT.md 加入 GitHub-flavored Alerts 說明

## 0.3.0 2025-10-03

- Issue #6 : 放棄使用 `gemini cli` 改用 `langchain`。
- Issue #6 : 實作切割章節翻譯避免超過最大輸出 tokens，並利用 `p-limit` 併發進行提升翻譯速度。
- Issue #7 : 重新實作 `run` 測試情境，並且也新增了 src/validator/core.ts 內的一些單元測試
- Issue #8 : 支援多組 GEMINI_API_KEY 翻譯時自動輪流使用。
- Issue #10 : 實作記錄 程式與 LLM 傳輸的提示詞內容
- Issue #11 : 翻譯的即時驗證若發現行內程式碼數量不符合，應該產生兩種修正的提示詞
- Issue #12 : 實作優先翻譯包含目錄的序言(Section[0])，並且作為即時驗證標題一致性的基準
- Issue #13 : 現在提示詞檔案已導入模板語法，使程式更簡潔。
- 以 `cli-progress` 實作進度條顯示併發翻譯章節的進度。
- 新增驗證功能 `validate --branch ..`，並且產生報告於 `workspaces/validation-report`。
- `mcp.md` 中有 base64 圖片，現在會使用 placehoder 方式處理。
- 翻譯時會驗證區塊數量，若不符合會提供 LLM 錯誤原因要求重新翻譯(僅限重翻一次)。
- `validate` 命令增加 `--regenerate-progress` 選項可以根據報告產生翻譯進度檔以利下次重新翻譯有問題的檔案。

## 0.2.3 2025-09-14

- 修正 `.env` 內設定 `LANG` 無法正常運作的 bug。
- 升級 `i18next` 至 `v25.5.2`。

## 0.2.3 2025-09-14

- 修正 `.env` 內設定 `LANG` 無法正常運作的 bug。
- 升級 `i18next` 至 `v25.5.2`。

## 0.2.2 2025-09-08

- 提示詞新增不要翻譯註解以保留程式碼完整內容

## 0.2.1 2025-09-05

- 第一個發佈於 npm registry 的版本。
