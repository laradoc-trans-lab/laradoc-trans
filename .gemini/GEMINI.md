# 專案 : 在 NodeJS 程式中透過 `Gemini CLI` 將 Laravel 官方文件翻譯成繁體中文版

本專案目的是為了將 [Laravel 官方文件](https://github.com/laravel/docs) 進行繁體中文化的翻譯，翻譯的工作主要是交給 `Gemini CLI` 進行。

詳細的實作規格，請參考專案根目錄內的 **`specs/INDEX.md`**。

## 生成程式碼時的注意事項

1. 務必透過 `context7` 以取得以下套件的技術文件並以該文件所提供的資訊撰寫程式碼
   - `i18next`
   - `commander`
   - `dotenv`
   - `jest`
2. 當用戶接受 Gemini 所建議的程式碼修改動作後，若有必要，必須詢問是否要執行 `npm run build` 以確認修改過後的程式能進行正確的編譯。
3. 當需要於 `package.json` 增加或修改套件時，在務必先行確認使用的是最新的版本。
4. 請勿任意將原本以繁體中文撰寫的註解修改為英文。
5. 若使用 `console.log` 與 `console.error` 來輸出文字，請記得要撰寫對應的 `i18n` 語言檔。