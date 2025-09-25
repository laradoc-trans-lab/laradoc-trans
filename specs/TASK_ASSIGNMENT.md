# 翻譯任務分配與分批規格

本文檔闡述了 `laradoc-trans` 專案中，如何將一篇完整的 Markdown 文件切割成多個適合語言模型 (LLM) 處理的「任務 (Task)」的核心設計思想與實現細節。

## 1. 核心概念定義

在深入了解分配策略之前，必須先理解兩個核心的物件：`Section` 和 `Task`。

### 1.1. `Section` (章節)

`Section` 是構成一篇文件的最基本單位。它代表了文件中的一個標題及其對應的內容。

- **來源**: `markdownParser.ts` 中的 `splitMarkdownIntoSections` 函式負責將原始 Markdown 純文字解析成一個 `Section[]` 一維陣列。
- **結構**: 雖然被儲存在一維陣列中，但每個 `Section` 物件都透過以下屬性保留了其在原始文件中的結構資訊：
  - `title`: 標題文字。
  - `depth`: 標題深度（例如，`#` 為 1，`##` 為 2）。
  - `parent`: 指向其父 `Section` 物件的參考，形成了邏輯上的樹狀結構。
- **大小**: 每個 `Section` 有兩個關於大小的關鍵屬性：
  - `contentLength`: **物理大小**。代表該 `Section` **自身**的內容（**包含標題行**）的實際位元組數。
  - `totalLength`: **邏輯大小**。代表該 `Section` 的 `contentLength` **加上其所有後代 `Section` 的 `contentLength` 之和**。這個值被用來評估一個邏輯區塊的整體規模。

### 1.2. `Task` (任務)

`Task` 代表一個準備發送給 LLM 進行翻譯的具體工作單元。它由一個或多個 `Section` 組成。

- **目的**: 將多個小的 `Section` 組合成一個較大的 `Task`，以達到 API 請求的經濟效益。
- **上下文感知 (Context-Aware)**: `Task` 可以被指定一個 `parentContext` (父章節)。當指定後，該 `Task` 將只接受屬於該父章節後代的 `Section`，以確保翻譯內容的上下文連貫性。
- **容量限制**: 一個 `Task` 的內容總量不應超過一個預設的上限 (src/translator/Task.ts 中有定義)，以避免觸發 LLM 的輸出中斷問題。
- **決策中心**: `Task.addSection` 方法是整個分批邏輯的核心，它封裝了所有關於「一個 `Section` 是否能被加入當前 `Task`」的複雜判斷。
- **工廠建立**: 為了確保任務 ID 在處理多個檔案時能被正確管理，`Task` 物件不應直接被實例化，而是應透過 `TaskFactory` 來建立。

---

## 2. 核心問題

語言模型 (LLM) 如 Gemini，在處理過長的單次請求時，可能會在未達到理論 Token 上限（如 64K）的情況下，無預警地中斷輸出。這是一個必須透過應用層邏輯來規避的外部現實約束。

## 3. 解決方案：切割文章

為了確保翻譯的穩定性和完整性，我們不能將整篇 Markdown 文件一次性發送給 LLM。必須將其切割成多個更小的「任務 (Task)」，並分批發送進行翻譯。

## 4. 設計挑戰

切割任務的核心挑戰在於，如何在遵守大小限制（目前為 10KB）的同時，盡可能地保持文章的邏輯完整性，並最大化 API 請求的經濟效益。我們不希望將一個只有三行的小段落也當成一個獨立的 `Task`。

## 5. 最終設計方案詳解

在確立目前的設計方案之前，我們曾嘗試過另一種更為傳統的作法：直接遍歷由 `remark` 解析出來的 Markdown AST (抽象語法樹)。然而，實踐證明，直接操作複雜的巢狀樹狀結構，處理節點間的邊界、容量計算與分批邏輯，會讓問題變得異常複雜且容易出錯。因此，我們最終放棄了該作法，並確立了目前這個更為優雅、穩健的設計：其核心就是將問題「降維」，把樹狀結構攤平成一維陣列來處理。

目前的設計方案，透過對 Markdown 文件進行結構化解析，並在 `Task` 層級實現動態的准入判斷，優雅地解決了上述挑戰。

### 5.1. `Section`：一維化的結構

- **目的**：此為設計基石。`markdownParser.ts` 中的 `splitMarkdownIntoSections` 函式，將一個具有巢狀層級的 Markdown 文件，**攤平**成一個線性的、可依序遍歷的 `Section[]` 一維陣列。
- **優點**：主流程（`translator/index.ts` 中）不再需要處理複雜的樹狀結構或遞迴，一個簡單的 `for` 迴圈即可從頭到尾處理整個文件流。
- **結構保留**：雖然陣列是一維的，但每個 `Section` 物件都透過 `depth` 和 `parent` 屬性，完整地保留了它在原始文件中的層級和父子關係。

### 5.2. `contentLength` vs `totalLength`：雙長度驅動

`Section` 的這兩個長度屬性是實現智能分批的關鍵。

- **`contentLength` (物理大小)**: 是 `Task` 容量的「金標準」。一個 `Task` 的實際大小，永遠是其包含的所有 `section.contentLength` 的總和。這個長度是**分批演算法的依據**，但**不完全等同**於最終發送給 LLM 的真實 Payload 大小。為了處理如 base64 內嵌圖片等特殊情況，最終的 Payload 可能會經過預處理（例如，用佔位符替換圖片），導致其大小略小於 `contentLength` 的總和。

- **`totalLength` (邏輯大小)**: 是一個**「預警指標」**，專門用來處理 H2 層級的章節，以判斷其是否過於龐大，不適合與其他章節組合。

### 5.3. `Task.addSection`：動態決策中心

`Task.ts` 中的 `addSection` 方法是整個分批邏輯的精髓所在，它透過一系列規則，判斷一個章節 (`Section`) 能否被加入目前的任務 (`Task`)。

其核心規則如下：

1.  **上下文連貫性檢查**：如果一個 `Task` 被指定了 `parentContext` (通常是一個巨大的 H2 章節)，那麼在加入任何新的 `section` 之前，它會向上遍歷 `section` 的所有祖先，確保 `parentContext` 是其祖先之一。這確保了在「子分割」模式下，任務內容不會混入不相關的章節。

2.  **動態長度評估**：
    -   對於 H2 章節 (`depth === 2`)，使用其 `totalLength` (邏輯大小) 來進行容量評估。
    -   對於所有其他層級的章節，則使用其 `contentLength` (物理大小)。

3.  **容量判斷**：`Task` 內部使用 `contentLength` 屬性來追蹤其大小。`addSection` 會判斷加入 `lengthToAdd` (動態評估出的長度) 後，是否會超過 `BATCH_SIZE_LIMIT`。

```pseudocode
function addSection(section):
    // 規則 1: 檢查祖先是否匹配 parentContext
    if task.has_context and not section.is_descendant_of(task.context):
        return false

    // 規則 2 & 3: 根據容量判斷
    length_to_add = (section.is_h2) ? section.total_length : section.content_length
    if task.content_length + length_to_add > LIMIT:
        return false

    // 成功加入
    task.add(section)
    task.content_length += section.content_length
    return true
```

### 5.4. `translateFile`：雙分支執行者

與規格書之前版本的簡化模型不同，`translator/index.ts` 中實際的 `translateFile` 函式採用了一種更強大的**雙分支迴圈**邏輯，以應對「普通章節」和「巨大 H2 章節」這兩種情況。

其執行流程的虛擬碼如下：

```pseudocode
function translateFile(all_sections):
    tasks = []
    task_factory = new TaskFactory()
    current_task = task_factory.createTask()

    for section in all_sections:
        // 分支 1: 遇到巨大 H2，進入「子分割」模式
        if section.is_huge_h2():
            // 結束並儲存目前累積的普通任務
            if not current_task.is_empty():
                tasks.push(current_task)
            current_task = null

            // 為這個巨大 H2 建立一個或多個帶有上下文的任務
            sub_divide_huge_h2_into_tasks(section, tasks)
            
            // 跳過本次主迴圈的剩餘部分
            continue

        // 分支 2: 處理普通章節
        if current_task.is_full_with(section):
            tasks.push(current_task)
            current_task = task_factory.createTask()
        
        current_task.add(section)

    // 儲存最後一個任務
    if not current_task.is_empty():
        tasks.push(current_task)

    return tasks
```

## 6. 總結：Section 一維化設計的核心優勢

本專案的最終設計，其精髓與穩健性根植於一個核心原則：**將巢狀的樹狀結構問題，降維成線性的陣列問題來處理**。

在開發初期，我們曾嘗試直接操作 Markdown AST（抽象語法樹），但很快就發現這會使分批、合併、計算邊界的邏輯變得極度複雜且難以維護。

最終確立的「一維 `Section` 陣列」設計，其優勢在於：

1.  **迭代邏輯極簡化**：一旦 `markdownParser.ts` 將文件攤平成 `Section[]`，主流程 `translator/index.ts` 就不再需要任何遞迴或複雜的樹狀遍歷。一個單純的 `for` 迴圈，就能從頭到尾處理所有章節，使得核心的分批邏輯可以保持驚人的簡潔與清晰。

2.  **職責徹底分離**：此設計將「理解文件結構」和「執行分批邏輯」兩個複雜問題徹底解耦。
    *   `markdownParser.ts` 專注於扮演「結構專家」，它負責所有的髒活累活，將 Markdown 的巢狀關係、邏輯大小 (`totalLength`) 等資訊，預先計算並儲存到每一個 `Section` 物件中。
    *   `translator/index.ts` 則作為一個「分批策略家」，它面對的是一個極其簡單的、帶有預處理資訊的一維陣列，因此它可以完全專注於實現分批的核心商業邏輯，而無需關心任何 Markdown 的語法細節。

這種「先降維，再處理」的思維，是整個系統得以保持穩健、可擴展且易於理解的根本原因。