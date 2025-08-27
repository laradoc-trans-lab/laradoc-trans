# 測試案例規劃 (情境測試)

本文件旨在規劃專案的情境測試案例，著重於模擬工具使用上可能遇到的問題，以確保其穩定性和健壯性。

`INDEX.md` 有詳細的運作說明，撰寫測試案例必須先熟知本專案怎麼運作的。

為了模擬實際的運作，會直接以 `src/main.ts` 中的 `main()` 來執行以捕獲各項輸出，請勿以子程序執行測試。

測試案例以 `jest`  開發，執行測試時可使用 `npx jest`。

## 工作區模板與假的 `gemini` 命令程式

本節描述了情境測試所需的環境，這些環境已經建置好了，如非必要請勿更動。

1.  **假的 `workspace` 工作區模板**
    *  模擬的 `workspace` 目錄結構，作為測試時複製的基礎模板，位於 `tests/fixtures/workspace-template`。
    *   **此模板中的 `repo/source` 是一個已初始化且包含必要檔案（例如 `test1.md` 到 `test10.md`）的合法 Git 倉庫。** 這確保了測試開始時，來源倉庫已處於預期狀態。
    *   模板中不包含 `repo/target`、`tmp` 和 `logs`，這些目錄將在測試執行時由程式動態建立。

2.  **假的 `gemini` 命令程式**
    *   由於本專案會與外部命令 `gemini` 進行互動，為了確保測試結果的可控性，因此也設計了一個假的 `gemini` 命令程式。
    *   這個假的 `gemini` 程式位於 `tests/bin`，且應該能夠模擬以下行為：
        *   **成功翻譯**：返回預期的翻譯內容。
        *   **翻譯失敗**：返回錯誤訊息或非零的退出碼。
        *   **延遲響應**：模擬網路延遲或 API 響應時間。

## 測試情境

測試前，需要建立一個暫存工作目錄 `tests/tmp` 並複製一份 `workspace` 模板於此。

以下是我們將要測試的具體情境：

### 1. 模擬用戶沒有準備 `workspace/repo/source`

*   **情境描述**：在執行翻譯工具之前，用戶沒有在預期的路徑 (`workspace/repo/source`) 建立或初始化 Git 倉庫。
*   **預期結果**：程式應能偵測到 `workspace/repo/source` 不存在或不是一個合法的 Git 倉庫，並以友善的錯誤訊息提示用戶，然後安全退出。

### 2. 模擬翻譯一個檔案，但 `gemini` 返回錯誤的翻譯內容

*   **情境描述**：設定假的 `gemini` 命令程式，使其在翻譯單個檔案時返回錯誤（例如：API 錯誤、無效響應）。
*   **預期結果**：
    *   程式應能捕獲 `gemini` 命令返回的錯誤。
    *   錯誤訊息應被記錄到 `workspace/logs/error.log`。
    *   該檔案在 `workspace/tmp/.progress` 中的翻譯狀態應被標記為失敗或未完成。
    *   程式應繼續執行或在適當的時候終止，不應崩潰。

### 3. 模擬翻譯一個檔案，但 `gemini` 返回正確的翻譯內容

*   **情境描述**：設定假的 `gemini` 命令程式，使其在翻譯單個檔案時返回正確的翻譯內容。
*   **預期結果**：
    *   程式應成功呼叫 `gemini` 命令並獲取翻譯結果。
    *   翻譯後的內容應被寫入 `workspace/tmp` 目錄下的對應檔案。
    *   該檔案在 `workspace/tmp/.progress` 中的翻譯狀態應被標記為已完成。
    *   `workspace` 不應刪除，後續的情境會繼續使用。

### 4. 模擬翻譯二個檔案，但 `gemini` 返回正確的翻譯內容

*   **情境描述**：設定假的 `gemini` 命令程式，使其在翻譯兩個檔案時都返回正確的翻譯內容。
*   **環境設定**：使用情境 3 留下的的 `workspace`。
*   **預期結果**：
    *   程式應成功翻譯兩個檔案。
    *   翻譯後的內容應被寫入 `workspace/tmp` 目錄下的對應檔案。
    *   兩個檔案在 `workspace/tmp/.progress` 中的翻譯狀態都應被標記為已完成。
    *   `workspace` 不應刪除，後續的情境會繼續使用。

### 5. 模擬翻譯所有檔案，但 `gemini` 返回正確的翻譯內容

*   **情境描述**：使用 `--all` 參數，並設定假的 `gemini` 命令程式，使其在翻譯所有檔案時都返回正確的翻譯內容。
*   **環境設定**：使用情境 4 留下的的 `workspace`。
*   **預期結果**：
    *   程式應成功翻譯所有檔案。
    *   翻譯完成後， main() 會執行收尾工作：將 `workspace/tmp` 中的翻譯結果和 `.source_commit` 複製到 `workspace/repo/target`，並清空 `workspace/tmp`，因此只有 `workspace/repo/target` 會有翻譯好的檔案。

### 6. 模擬 `workspace/repo/source` 有更新，進行差異化翻譯，使用參數 `--all`
*   **環境設定**
    * 使用情境 5 留下的的 `workspace`。
    * 測試程式內需先行提交(`git commit`) `workspace/repo/target` ，並切換至 `test1-branch` 分支。
    * 測試程式內需要修改 `workspace/repo/source` `test2.md` 與 `test5.md` , 增加一行 `已修改` 於最後，並提交於 `test1-branch` 分支，這兩個檔案所增加的`已修改`字串可作為檢查是否翻譯成功的條件。
*   **預期結果**
    *   程式應成功翻譯有異動的所有檔案。
    *   翻譯完成後， main() 會執行收尾工作：將 `workspace/tmp` 中的翻譯結果和 `.source_commit` 複製到 `workspace/repo/target`，並清空 `workspace/tmp`，因此只有 `workspace/repo/target` 會有翻譯好的檔案。
    *   `workspace/repo/source` 的 `commit hash` 必須與 `workspace/repo/target/.source_commit` 相同。