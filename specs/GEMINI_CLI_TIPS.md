# GEMINI CLI 操作時注意事項

一個簡單範例 `echo "你好" | gemini -p -m gemini-2.5-flash` , 可以用非交互模式單獨執行對話。

因此實作時可建立子程序將提示詞透過 `pipe` 方式送到 `gemini` 的 `stdin` 進行處理，然後接收翻譯後的結果即可。提示詞已經寫在 `TRANSLATE_PROMPT.md`，但必須於程式中合併一段話請 `翻譯某某檔案`，這樣 `gemini` 才知道要翻譯哪個檔案。

## 回傳內容過濾

如果我們請 `gemini` 命令進行翻譯 `markdown` 內容，若真的成功了，通常於第一行或第二行會有該命令的系統訊息出現，這不是我們要的。

正確的過濾方式是，檢查回傳的內容是否出現 `markdown` 語法的標題

如 `# Installtion` 這種標題，這代表真正的翻譯結果是由此開始。

如果都沒有出現標題，那就算有回傳結果也可能是錯的，必須視為翻譯錯誤，必須將此次回傳結果寫入 `workspace/logs/error.log` 並且結束程式。

## `stderr` 處理

`gemini` 在某些狀況會將錯誤訊息送到 `stderr`，但 `gemini` 本身並不會因此結束程式，例如可用的 `token` 額度用完了，就可能出現這種情況。

因此實作時必須注意，當收到 `stderr` 訊息時，必須告知使用者 `調用gemini 發生錯誤，本程式5秒內將結束，請參閱 workspace/logs/error.log`，程式內會有計數器，在5秒內足以將 `stderr` 訊息寫到 `error.log`。