export class Section {

  /** 佔位符 */
  private _placeholders: Map<string, string> = new Map();
  /** 帶有佔位符的內容 (快取) */
  private _contentForTranslation: string | null = null;

  /** 章節標題的錨點 */
  private _anchorOfTitle: string | null = null;

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
   * 檢查此章節是否有佔位符。
   * @returns 如果有佔位符則回傳 true，否則為 false。
   */
  public hasPlaceholders(): boolean {
    return this._placeholders.size > 0;
  }

  /**
   * 將一段文字中的佔位符還原成原始內容。
   * @param translatedText 包含佔位符的已翻譯文字。
   * @returns 還原後的文字。
   */
  public restorePlaceholders(translatedText: string): string {
    if (!this.hasPlaceholders()) {
      return translatedText;
    }

    let restoredText = translatedText;
    for (const [key, value] of this._placeholders.entries()) {
      const placeholderRegex = new RegExp(key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
      restoredText = restoredText.replace(placeholderRegex, value);
    }
    return restoredText;
  }

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
    return this._anchorOfTitle;
  }
  set anchorOfTitle(value: string | null) {
    this._anchorOfTitle = value;
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
    // 1. 儲存原始、完整的內容
    this._content = value;
    // 2. 計算原始長度
    this._contentLength = Buffer.byteLength(this._content, 'utf-8');

    // 3. 同時，對 value 執行正規表示式，找出所有圖片
    this._placeholders.clear();
    let placeholderIndex = 0;

    // 修正後的正規表示式
    const imageRegex = /(!\[.*?\]\()(data:image\/[^)]+)(\))/g;

    // 4. 產生一份帶有佔位符的內容，並將其存入 _contentForTranslation 快取中
    this._contentForTranslation = this._content.replace(imageRegex, (match, g1, g2, g3) => {
      const titleSlug = (this.title || `section-${this.startLine}`).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
      const placeholderKey = `__IMAGE_DATA_${titleSlug}_${placeholderIndex++}__`;
      
      // 5. 只將 data URI (g2) 存入 map
      this._placeholders.set(placeholderKey, g2);
      
      // 6. 重組 tag，將 placeholder 作為新的連結目標
      return g1 + placeholderKey + g3;
    });
  }

  /**
   * 取得用於翻譯的內容，其中 base64 圖片會被替換為佔位符。
   */
  get contentForTranslation(): string {
    if (this._contentForTranslation === null) {
      // 這個情況理論上不應該發生，因為 content setter 會初始化它
      // 但作為一個防禦性措施，我們可以在這裡強制初始化
      this.content = this.content; 
    }
    return this._contentForTranslation!;
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