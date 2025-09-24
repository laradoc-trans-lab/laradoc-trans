
export class Section {

  /** 章節標題的錨點 */
  private _anchorOfTitile: string | null = null;

  /** 章節的標題 */
  private _title: string | null = null;
  /**
   * 章節的標題層級。
   * - `0`: 代表文件本身 (prologue)，通常用於內文沒有任何標題的檔案。
   * - `1`: 代表 H1 標題 (`#`)。
   * - `2`: 代表 H2 標題 (`##`)，依此類推。
   */
  private _depth?: number;
  /** 章節內容，不包含子章節 */
  private _content?: string;
  /** 本章節位於完整文章中的開始行號 */
  private _startLine?: number;
  /** 本章節位於完整文章中的結束行號 */
  private _endLine?: number;
  /** 父章節的參照 */
  private _parent: Section | null = null;


  /**
   * The byte length of the content of this section ONLY.
   * This does not include the content of any child sections.
   * This represents the content from the current heading until the next heading of a deeper level.
   */
  private _contentLength: number | null = null;

  /**
   * The total byte length of the logical block starting from this section,
   * extending until the next section of the same or higher depth.
   * This is used to determine if a logical block of content (e.g., an H2 and all its H3s/H4s)
   * is larger than the batch size limit and thus needs to be split.
   */
  private _totalLength: number = 0;

  /**
   * Checks if this section has any child sections based on content length.
   * If contentLength equals totalLength, it means this section has no content beyond its own heading,
   * or its descendants have no content, implying no meaningful children.
   */
  get hasChildren(): boolean {
    return this._contentLength !== this._totalLength;
  }

  /**
   * The byte length of the content of this section ONLY.
   * This does not include the content of any child sections.
   * This represents the content from the current heading until the next heading of a deeper level.
   */
  get anchorOfTitle(): string | null {
    return this._anchorOfTitile;
  }
  set anchorOfTitle(value: string | null) {
    this._anchorOfTitile = value;
  }

  /**
   * 章節的標題
   */
  get title(): string {
    if(this._title === null) {
      this._title = 'Pologue';
    }
    return this._title;
  }

  set title(value: string) {
    this._title = value;
  }

  /**
   * 章節的標題層級。
   * - `0`: 代表文件本身 (prologue)，通常用於內文沒有任何標題的檔案。
   * - `1`: 代表 H1 標題 (`#`)。
   * - `2`: 代表 H2 標題 (`##`)，依此類推。
   */
  get depth(): number {
    if(this._depth === undefined) {
      throw new Error('Header depth is undefined');
    }
    return this._depth;
  }

  set depth(value: number) {
    this._depth = value;
  }

  /**
   * 章節內容，不包含子章節
   */
  get content(): string {
    if(this._content === undefined) {
      throw new Error('Section content is undefined');
    }
    return this._content;
  }

  set content(value: string) {
    this._content = value;
    this._contentLength = Buffer.byteLength(this._content, 'utf-8');
  }

  /**
   * 本章節位於完整文章中的開始行號
   */
  get startLine(): number {
    if(this._startLine === undefined) {
      throw new Error('Section startLine is undefined');
    }
    return this._startLine;
  }

  set startLine(value: number) {
    this._startLine = value;
  }

  /**
   * 本章節位於完整文章中的結束行號
   */
  get endLine(): number {
    if(this._endLine === undefined) {
      throw new Error('Section endLine is undefined');
    }
    return this._endLine;
  }

  set endLine(value: number) {
    this._endLine = value;
  }

  /**
   * The byte length of the content of this section ONLY.
   * This does not include the content of any child sections.
   * This represents the content from the current heading until the next heading of a deeper level.
   */
  get contentLength(): number {
    if(this._contentLength === null) {
      this._contentLength = Buffer.byteLength(this.content, 'utf-8');
    }
    return this._contentLength;
  }


  /**
   * The total byte length of the logical block starting from this section,
   * extending until the next section of the same or higher depth.
   */
  get totalLength(): number {
    return this._totalLength;
  }

  set totalLength(value: number) {
    this._totalLength = value;
  }

  /**
   * 父章節的參照
   */
  get parent(): Section | null {
    return this._parent;
  }

  set parent(value: Section) {
    this._parent = value;
  }
}
