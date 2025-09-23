
/**
 * Represents a single section (heading and its content) in the Markdown document.
 * All sections are stored in a flat array, but linked via the `parent` property
 * to represent the document's hierarchy.
 */
export class Section {
  title: string;
  depth: number;
  content: string = '';
  startLine: number;
  endLine: number = 0;
  parent: Section | null = null;

  /**
   * The byte length of the content of this section ONLY.
   * This does not include the content of any child sections.
   * This represents the content from the current heading until the next heading of a deeper level.
   */
  contentLength: number = 0;

  /**
   * The total byte length of the logical block starting from this section,
   * extending until the next section of the same or higher depth.
   * This is used to determine if a logical block of content (e.g., an H2 and all its H3s/H4s)
   * is larger than the batch size limit and thus needs to be split.
   */
  totalLength: number = 0;

  constructor(title: string, depth: number, startLine: number) {
    this.title = title;
    this.depth = depth;
    this.startLine = startLine;
  }

  /**
   * Checks if this section has any child sections based on content length.
   * If contentLength equals totalLength, it means this section has no content beyond its own heading,
   * or its descendants have no content, implying no meaningful children.
   */
  get hasChildren(): boolean {
    return this.contentLength !== this.totalLength;
  }
}
