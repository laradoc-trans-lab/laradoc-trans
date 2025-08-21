# 翻譯進度管理的方式

在 `INDEX.md` [4.4 翻譯流程](INDEX.md#44-翻譯流程) 中提到了 `.source_commit` 與 `.progress` 這兩種檔案是為了處理翻譯進度所需的檔案，其作用如下:

- `.source_commit` : 用於紀錄當前是翻譯 `workspace/repo/source` 的 `commit hash`，格式相當簡單，就只有一行 16 進制字串，例如 `2e63bf7dd81bdde4c36f6dcc91f7aec91eb4450e`。
- `.progress` : 紀錄待翻譯的檔案，格式如下

  ```text
  a.md = 1
  b.md = 1
  c.md = 0
  d.md = 0
  ```

  其中 `a.md = 1` 代表 `a.md` 已經翻譯完成，`c.md = 0` 代表尚未翻譯。
