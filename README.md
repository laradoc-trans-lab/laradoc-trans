# laradoc-trans

[![NPM Version](https://img.shields.io/npm/v/laradoc-trans.svg)](https://www.npmjs.com/package/laradoc-trans)
[![Build Status](https://img.shields.io/github/actions/workflow/status/laradoc-trans-lab/laradoc-trans/ci.yml?branch=main)](https://github.com/laradoc-trans-lab/laradoc-trans/actions)

**一套由 Gemini 驅動，專為 Laravel 官方文件設計的自動化翻譯工具。**

`laradoc-trans` 旨在簡化繁體中文化 Laravel 文件的繁瑣流程。它能自動比對版本差異、管理翻譯進度，並透過強大的 AI 模型確保翻譯品質，讓您能專注於內容的校對與潤飾。

---

## ✨ 功能亮點

- **🤖 AI 驅動翻譯**：預設使用 Google Gemini，並可透過 LangChain 彈性更換為 OpenAI GPT 等不同模型。
- **🔄 智慧差異比對**：只翻譯官方文件更新的部分，無需重複勞動，節省時間與成本。
- **📈 進度自動管理**：自動記錄與追蹤每個檔案的翻譯狀態，即使中斷也能無縫接續。
- **✅ 品質驗證報告**：提供 `validate` 指令，對比原文與譯文，產生詳細的結構與內容一致性報告。
- **⚙️ 高度可設定**：可自訂提示詞 (Prompt) 與模型，以符合您的特定翻譯風格與需求。

## 🚀 5 分鐘快速上手

1.  **安裝工具** (建議 Node.js v22+):
    ```bash
    npm install -g laradoc-trans
    ```
    > 要使用本工具也要確認 `git` 都有安裝好

2.  **初始化工作區**:
    此命令會自動建立 `workspace` 目錄、複製官方文件（預設分支），並為您準備好 `.env` 設定檔。
    ```bash
    laradoc-trans init --workspace-path workspace
    cd workspace
    ```

3.  **填寫 API 金鑰**: 
    編輯 `workspace/.env` 檔案，設定要使用的 `LLM_PROVIDER` 並填入對應的 API 金鑰。
    ```
    # 可選 'gemini' 或 'openai'，預設為 'gemini'
    LLM_PROVIDER="gemini"

    # 如果使用 gemini
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY

    # 如果使用 openai
    # OPENAI_API_KEY=YOUR_OPENAI_API_KEY
    ```
4.  **執行翻譯**:
    ```bash
    # 嘗試翻譯 5 個檔案看看效果，翻譯後的檔案會暫存於工作區的 `tmp` 目錄。
    laradoc-trans run --branch 12.x --limit 5
    ```

    ```bash
    # 完整翻譯，會將剩餘未翻譯完的檔案進行翻譯，翻譯結果會存放於工作區的 `repo/target` 目錄。
    laradoc-trans run --branch 12.x --all
    ```

5.  **驗證翻譯品質**:
    ```bash
    # 針對指定分支，比對原始與翻譯檔案的內容與結構一致性
    laradoc-trans validate --branch 12.x

    # 完成後，請查看 `workspace/validate-report` 目錄下的報告
    ```

## 深入了解

- **想知道更多的用法？**
  請閱讀 ➡️ **[使用者指南 (User Guide)](./docs/USER_GUIDE.md)**

- **想知道如何利用 `validate` 命令提升翻譯品質？**
  請閱讀 ➡️ **[Validate 指南](./docs/VALIDATE_GUIDE.md)**

- **想了解程式內部設計或參與開發？**
  請閱讀 ➡️ **[開發者指南 (Developer Guide)](./docs/DEVELOPER_GUIDE.md)**

## 👨‍💻 作者

- Pigo Chu <pigochu@gmail.com>

## 📄 授權

本專案採用 [AGPL-3.0-only](LICENSE) 授權.
