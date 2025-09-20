export class CodeBlockMismatchError extends Error {
  constructor(
    message: string,
    public originalSection: string,
    public translatedSection: string
  ) {
    super(message);
    this.name = 'CodeBlockMismatchError';
  }
}
