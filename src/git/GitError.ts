/**
 * 基礎的 Git 錯誤類別，所有其他 Git 相關的錯誤都應繼承自此類別。
 */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}
