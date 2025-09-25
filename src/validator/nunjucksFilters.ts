// src/validator/nunjucksFilters.ts

/**
 * Calculates the display width of a single character based on its UTF-8 byte length.
 * Characters with UTF-8 byte length >= 3 (typically CJK characters) are considered 2 units wide,
 * others are 1 unit wide.
 * @param char The character to calculate the width for.
 * @returns The display width of the character.
 */
function getCharDisplayWidth(char: string): number {
  // In Node.js, Buffer.from(char, "utf8").length gives the byte length in UTF-8.
  // CJK characters typically have a byte length of 3 or more in UTF-8.
  if (Buffer.from(char, "utf8").length >= 3) {
    return 2;
  }
  return 1;
}

/**
 * Calculates the total display width of a string.
 * @param str The string to calculate the width for.
 * @returns The total display width of the string.
 */
function getStringDisplayWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    width += getCharDisplayWidth(str[i]);
  }
  return width;
}

/**
 * Left-justifies a string within a given display width, padding with a specified character.
 * Considers CJK characters as 2 units wide based on UTF-8 byte length.
 * @param str The string to justify.
 * @param displayWidth The total display width of the resulting string.
 * @param fillchar The character to use for padding (defaults to space).
 * @returns The left-justified string.
 */
export function ljust(str: string, displayWidth: number, fillchar: string = ' '): string {
  str = String(str); // Ensure it's a string
  const currentDisplayWidth = getStringDisplayWidth(str);

  if (currentDisplayWidth >= displayWidth) {
    return str;
  }

  const paddingNeeded = displayWidth - currentDisplayWidth;
  // Repeat fillchar based on the *display width* needed, not character count
  // Assuming fillchar is a single-width character like ' '
  return str + fillchar.repeat(paddingNeeded);
}