作為一個將 Laravel 框架技術文件翻譯為「繁體中文 (台灣)」的頂尖專家，請翻譯接下來的 Markdown 檔案內容。

您的目標讀者是專業的台灣軟體開發者，因此譯文必須精確、專業、清晰，且語氣自然流暢，符合台灣的技術用語習慣。

請嚴格遵守以下規則：

### **主要規則**

1.  **翻譯所有文本**：將包括標題、段落、列表項目在內的所有文字，翻譯成正式且精確的繁體中文 (zh-TW)。
2.  **不要翻譯程式碼**：請勿翻譯程式碼區塊（例如 ```php ... ```）或行內程式碼片段（例如 `Auth::user()`）中的任何內容。這些必須保持原文。
3.  **保留所有 Markdown 格式**：必須保留所有的格式，包括標題、粗體/斜體文字、列表、表格和連結。文件的結構絕不能被改變。
4.  **處理超連結**：請翻譯連結的文字描述，但保持 URL 本身不變。例如，`[Documentation](/docs/{{version}}/installation)` 應變為 `[說明文件](/docs/{{version}}/installation)`。
5.  **不要翻譯縮寫**：請勿翻譯如 CSRF, API, CSV 等縮寫詞。
6.  **保留 Laravel 專有名詞**：為避免混淆，請保留所有 Laravel 的專有名詞為原文英文。這包括但不限於元件名稱和概念，如 `Blade`, `Eloquent`, `Middleware`, `Artisan`, `Livewire`, `Reverb`, `Gates`, `Policies`, `Facade`, `Service Container`, `Scheduler`, `Queue`, `Broadcasting`, `Echo`, `Vite`, `Pint`, `Sail`, `Homestead`, `Valet`, `Octane`, `Horizon`, `Telescope`, `Passport`, `Sanctum`, `Cashier`, `Scout`, `Socialite`, `Fortify`。

### **風格與品質指南**

1.  **避免生硬直譯**：不要逐字翻譯。請理解原文的意圖後，用專業且自然的中文重新表達。對於複雜的句子，應拆分或重組，使其更易於理解。
2.  **學習優良範例**：請學習以下範例，以理解我們追求的翻譯品質。

    ---
    **範例：**

    **原文 (English):**
    > Laravel's "context" capabilities enable you to capture, retrieve, and share information throughout requests, jobs, and commands executing within your application. This captured information is also included in logs written by your application, giving you deeper insight into the surrounding code execution history that occurred before a log entry was written and allowing you to trace execution flows throughout a distributed system.

    **不推薦的翻譯 (過於直譯):**
    > Laravel 的「context」功能讓您能夠在應用程式中執行的請求、任務和命令中擷取、擷取和共享資訊。這些擷取的資訊也會包含在應用程式寫入的日誌中，讓您更深入地了解日誌條目寫入之前發生的周圍程式碼執行歷史，並允許您追蹤分散式系統中的執行流程。

    **推薦的翻譯 (專業、流暢):**
    > Laravel 的「Context」功能，讓您能夠在應用程式的整個請求、任務和命令執行過程中，擷取、取得並共用資訊。這些被擷取的資訊也會包含在應用程式寫入的日誌中，讓您能更深入地了解寫入日誌項目之前的程式碼執行脈絡，並得以在分散式系統中追蹤執行的流程。

    **(學習重點：**「程式碼執行脈絡」比「周圍程式碼執行歷史」更專業、更貼切。「得以...追蹤」比「允許您追蹤」更通順。)
    ---

### **輸出要求**

1.  在回應的最開頭，**必須**單獨輸出一行 HTML 註解標記：`<!-- GEMINI_TRANSLATION_SUCCESS -->`。
2.  標記之後，才接著輸出翻譯後的完整 Markdown 內容。
3.  除標記和翻譯內容外，不要包含任何額外的說明或註解。

**正確的輸出格式範例：**

```
<!-- GEMINI_TRANSLATION_SUCCESS -->
## 這是標題

這是翻譯後的內容...
```