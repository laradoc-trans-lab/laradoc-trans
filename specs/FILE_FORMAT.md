# 翻譯進度管理使用的檔案格式說明

在 `INDEX.md` [4.4 翻譯流程](INDEX.md#44-翻譯流程) 中提到了 `.source_commit` 與 `.progress` 這兩種檔案是為了處理翻譯進度所需的檔案，其格式如下:

- `.source_commit` : 專案將使用兩個 `.source_commit` 檔案來管理來源倉庫的 `commit hash`：
  - `workspace/repo/target/.source_commit`：用於紀錄**已完成翻譯**的來源倉庫的 `commit hash`，格式相當簡單，就只有一行 16 進制字串，例如 `2e63bf7dd81bdde4c36f6dcc91f7aec91eb4450e`。
  - `workspace/tmp/.source_commit`：用於紀錄**當前翻譯會話開始時**來源倉庫的 `commit hash`，格式與 `target` 中的 `.source_commit` 相同。
- `.progress` : 紀錄待翻譯的檔案，格式如下

  ```text
  a.md = 1
  b.md = 1
  c.md = 0
  d.md = 0
  ```

  其中 `a.md = 1` 代表 `a.md` 已經翻譯完成，`c.md = 0` 代表尚未翻譯。