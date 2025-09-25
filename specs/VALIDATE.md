# 驗證翻譯品質規格

本文說明 `laradoc-trans validate` 命令進行驗證的內部實作邏輯

## 報告產出的目錄結構

產出報告時必須於工作區目錄中建立 `validate-report` 路徑，並且其中有一子目錄 `details`。

`details` 目錄存放每個翻譯文件的驗證結果，例如檢驗原文與譯文的檔案室 `mcp.md`，那麼詳細報告就會是 `details/mcp.md`。

`SUMMARY.md` 則是一個報告的總整理統計，這個檔案放在 `validate-report` 之下。

用戶可以先看看 `SUMMARY.md` 列出有問題的檔案，然後再去 `details` 目錄看詳細問題。

### `SUMMARY.md` 的內容

- 比對章節的數量是否相符
- 比對程式碼區塊數量是否相符
- 比對行內程式碼數量是否相符
- 比對特殊標記的數量是否相符

> 特殊標記指的是 `[!INFO]` 這種以 `[!` 與 `]` 組合的字串。 

### `detail/*.md` 的內容

- 列出章節或錨點的缺失
- 列出程式碼區塊不一致的內容與所在章節
- 列出行內程式碼驗證內容不一致的內容與所在章節
- 列出特殊標記缺失的內容與所在章節


## 規則

由於我們無法事前得知到底每個標題會被翻譯成甚麼文字，所以必須借助翻譯後的序言部分進行驗證

Laravel 的序言通常是這樣，如 `cache.md` 的原文 :

<pre>
# Cache

- [Introduction](#introduction)
- [Configuration](#configuration)
    - [Driver Prerequisites](#driver-prerequisites)
- [Cache Usage](#cache-usage)
    - [Obtaining a Cache Instance](#obtaining-a-cache-instance)
    - [Retrieving Items From the Cache](#retrieving-items-from-the-cache)
    - [Storing Items in the Cache](#storing-items-in-the-cache)
    - [Removing Items From the Cache](#removing-items-from-the-cache)
    - [Cache Memoization](#cache-memoization)
    - [The Cache Helper](#the-cache-helper)
- [Cache Tags](#cache-tags)
- [Atomic Locks](#atomic-locks)
    - [Managing Locks](#managing-locks)
    - [Managing Locks Across Processes](#managing-locks-across-processes)
- [Adding Custom Cache Drivers](#adding-custom-cache-drivers)
    - [Writing the Driver](#writing-the-driver)
    - [Registering the Driver](#registering-the-driver)
- [Events](#events)
</pre>

由序言，可以得到章節的的結構，因此可以從中得知有多少章節以及錨點


所以必須依照步驟驗證

1. 序言的驗證 : 比對原文與譯文序言的結構是否完全一致，如果不一致，那麼這個檔案就無法驗證，必須於 `SUMMARY.md` 標註序言結構不符，無法進行驗證。
2. 錨點與標題驗證 :依照譯文的序文結構，檢視每個錨點與章節標題是否遺漏，將遺漏的數量標註在 `SUMMARY.md`，並且也要將遺漏的詳細標題或錨點寫在 `details` 的檔案內。
3. 程式碼區塊驗證 : 我們的翻譯結果不允許程式碼區塊任何一個 bytes 被改變，因此必須將原文的程式碼區塊提取出來與譯文做比對，如果有不相符的必須詳細寫在 `details` ，需要讓用戶知道這段程式碼位於那個章節 , 該章節的開始行號也必須標示出來。
4. 行內程式碼驗證: 與程式碼區塊驗證的邏輯是一樣的。
5. 特殊標記驗證 : 找出原文中的特殊標記及其所在章節並與譯文做比對。

### 不需要驗證的檔案

以下列出不需要驗證的檔案，報告中無須產出

1. `license.md`
2. `readme.md`

### 特殊檔案驗證

`documentation.md` 是 Laravel 中區分章節的目錄檔案，主要用於生成文件網站或 epub 有用的，這個檔案要單獨處理，只需要驗證結構是否相符，因為這檔案只有目錄索引沒有內文。


## 使用技術

雖然本專案有安裝了 `remark` 的套件，但使用 AST 樹狀結構會使驗證的邏輯變得複雜難以理解，所以必須使用 `src/markdownParser.ts` 中提供的 `splitMarkdownIntoSections` 函式所生成的 `Section[]` 一維陣列。

Section[] 陣列其實是經過分析 markdown 內容將每個章節拆分出一個 Section，由此物件能得到章節的內文，錨點，標題。

因此若要知道序言的內容，通常是陣列中的第一個 Section 物件。

只要序言的結構相符，就可以進行驗證了。


