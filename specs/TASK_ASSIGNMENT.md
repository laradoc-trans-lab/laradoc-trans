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
  - `contentLength`: **物理大小**。代表該 `Section` **自身**的內容（不含標題行）的實際位元組數。
  - `totalLength`: **邏輯大小**。代表該 `Section` 的 `contentLength` **加上其所有後代 `Section` 的 `contentLength` 之和**。這個值被用來評估一個邏輯區塊的整體規模。

### 1.2. `Task` (任務)

`Task` 代表一個準備發送給 LLM 進行翻譯的具體工作單元。它由一個或多個 `Section` 組成。

- **目的**: 將多個小的 `Section` 組合成一個較大的 `Task`，以達到 API 請求的經濟效益。
- **容量限制**: 一個 `Task` 的內容總量不應超過一個預設的上限（目前為 10KB），以避免觸發 LLM 的輸出中斷問題。
- **決策中心**: `Task.addSection` 方法是整個分批邏輯的核心，它封裝了所有關於「一個 `Section` 是否能被加入當前 `Task`」的複雜判斷。

---

## 2. 核心問題

語言模型 (LLM) 如 Gemini，在處理過長的單次請求時，可能會在未達到理論 Token 上限（如 64K）的情況下，無預警地中斷輸出。這是一個必須透過應用層邏輯來規避的外部現實約束。

## 3. 解決方案：切割文章

為了確保翻譯的穩定性和完整性，我們不能將整篇 Markdown 文件一次性發送給 LLM。必須將其切割成多個更小的「任務 (Task)」，並分批發送進行翻譯。

## 4. 設計挑戰

切割任務的核心挑戰在於，如何在遵守大小限制（目前為 10KB）的同時，盡可能地保持文章的邏輯完整性，並最大化 API 請求的經濟效益。我們不希望將一個只有三行的小段落也當成一個獨立的 `Task`。

## 5. 最終設計方案詳解

目前的設計方案，透過對 Markdown 文件進行結構化解析，並在 `Task` 層級實現動態的准入判斷，優雅地解決了上述挑戰。

### 5.1. `Section`：一維化的結構

- **目的**：此為設計基石。`markdownParser.ts` 中的 `splitMarkdownIntoSections` 函式，將一個具有巢狀層級的 Markdown 文件，**攤平**成一個線性的、可依序遍歷的 `Section[]` 一維陣列。
- **優點**：主流程（`translator/index.ts` 中）不再需要處理複雜的樹狀結構或遞迴，一個簡單的 `for` 迴圈即可從頭到尾處理整個文件流。
- **結構保留**：雖然陣列是一維的，但每個 `Section` 物件都透過 `depth` 和 `parent` 屬性，完整地保留了它在原始文件中的層級和父子關係。

### 5.2. `contentLength` vs `totalLength`：雙長度驅動

`Section` 的這兩個長度屬性是實現智能分批的關鍵。

- **`contentLength` (物理大小)**: 是 `Task` 容量的「金標準」。一個 `Task` 的實際大小，永遠是其包含的所有 `section.contentLength` 的總和。這代表了最終發送給 LLM 的真實 Payload 大小。

- **`totalLength` (邏輯大小)**: 是一個**「預警指標」**，專門用來處理 H2 層級的章節，以判斷其是否過於龐大，不適合與其他章節組合。

### 5.3. `Task.addSection`：動態決策中心

`Task.ts` 中的 `addSection` 方法是整個分批邏輯的精髓所在。它封裝了所有複雜的判斷，使得上層的 `translateFile` 函式可以保持極簡。

```typescript
addSection(section: Section): boolean {
    const lengthToAdd = section.depth === 2 ? section.totalLength : section.contentLength;

    if (lengthToAdd > BATCH_SIZE_LIMIT) {
      return this.isEmpty();
    }
    if (this.currentSize + lengthToAdd > BATCH_SIZE_LIMIT) {
      return false;
    }
    this.currentSize += lengthToAdd;
    return true;
}
```

- **`currentSize` 的角色**：它不是一個代表真實內容長度的數字，而是一個抽象的**「權重」或「容量指標」**，專門用於准入判斷。

- **`lengthToAdd` 的動態性**：
  - 當傳入的是 **H1, H3, H4...** (`depth !== 2`) 時，`lengthToAdd` 是 `contentLength`。`Task` 將這些 `section` 視為「散裝零件」，只評估它們自身的物理大小。這使得多個小的、不同層級的章節可以被高效地組合進同一個 `Task`。
  - 當傳入的是 **H2** (`depth === 2`) 時，`lengthToAdd` 是 `totalLength`。`Task` 將這個 H2 視為一個「貨櫃」來評估。`addSection` 在做的是一個**預判**：「如果我把這個完整的 H2 邏輯區塊（貨櫃）放進來，我的 `Task` 容量（權重）會不會爆掉？」

### 5.4. `translateFile`：簡潔的執行者

由於所有的複雜判斷都已封裝在 `Task.addSection` 中，`translateFile` 的核心迴圈可以保持極度的簡潔和清晰：

```typescript
let currentTask = new Task();
for (const section of allSections) {
    if (!currentTask.addSection(section)) {
        if (!currentTask.isEmpty()) tasks.push(currentTask);
        currentTask = new Task();
        currentTask.addSection(section);
    }
}
if (!currentTask.isEmpty()) tasks.push(currentTask);
```

這個迴圈完全信任 `Task.addSection` 的回傳值。如果一個 `section` 無法被加入，無論原因（H2 的 `totalLength`太大，或普通 `section` 的 `contentLength` 會導致超標），流程都是一樣的：結束當前 `Task`，建立一個新的 `Task`，並將該 `section` 作為新 `Task` 的第一個成員。

## 6. 行為總結

這個設計完美地平衡了效率和邏輯完整性：

1.  **高效組合**：對於 H1 和其他非 H2 的小章節，`addSection` 使用 `contentLength` 判斷，允許它們被高效地填充進同一個 `Task`，直到 `currentSize` (權重) 接近上限。

2.  **邏輯隔離**：當遇到一個 `totalLength` 巨大的 H2（如 `Method Listing`）時，`addSection` 會因為 `lengthToAdd` (`totalLength`) 超標而拒絕將其加入任何已有的 `Task`。這會觸發 `translateFile` 建立一個新的、空的 `Task`。`Method Listing` 會作為第一個成員被加入這個新 `Task`，並將其巨大的 `totalLength` 設定為 `Task` 的初始 `currentSize`。這個巨大的 `currentSize` 會有效地阻止任何後續的 `section` 被加入這個 `Task`，從而實現了巨大邏輯區塊的隔離，並迫使它的子章節在後續的 `Task` 中進行新的分批。