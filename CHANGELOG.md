# laradoc-trans 更新紀錄

## 0.3.0 2025-

- Issue #6 : 放棄使用 `gemini cli` 改用 `langchain`。
- Issue #6 : 實作切割章節翻譯避免超過最大輸出 tokens，並利用 `p-limit` 併發進行提升翻譯速度。
- Issue #7 : 重新實作 `run` 測試情境，並且也新增了 src/validator/core.ts 內的一些單元測試
- Issue #8 : 支援多組 GEMINI_API_KEY 翻譯時自動輪流使用。
- Issue #10 : 實作記錄 程式與 LLM 傳輸的提示詞內容
- Issue #11 : 翻譯的即時驗證若發現行內程式碼數量不符合，應該產生兩種修正的提示詞
- Issue #12 : 實作優先翻譯包含目錄的序言(Section[0])，並且作為即時驗證標題一致性的基準
- 以 `cli-progress` 實作進度條顯示併發翻譯章節的進度。
- 新增驗證功能 `validate --branch ..`，並且產生報告於 `workspaces/validation-report`。
- `mcp.md` 中有 base64 圖片，現在會使用 placehoder 方式處理。
- 翻譯時會驗證區塊數量，若不符合會提供 LLM 錯誤原因要求重新翻譯(僅限重翻一次)。


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
