# laradoc-trans 更新紀錄

## 0.3.0 2025-

- 放棄使用 `gemini cli` 改用 `langchain`。
- 實作切割章節翻譯避免超出最大輸出 tokens，並利用 `p-limit` 併發進行提升翻譯速度。
- 以 `cli-progress` 實作進度條顯示併發翻譯章節的進度。
- 新增驗證功能 `validate --branch ..`，並且產生報告於 `workspaces/validation-report`。
- 支援多組 GEMINI API KEY

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
