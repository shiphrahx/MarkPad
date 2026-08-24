/**
 * The numbers the status bar shows.
 *
 * Pure functions over a string, so they are cheap to test and cheap to call.
 * Nothing here parses Markdown: counting the words in a document the way a
 * writer means it would need the syntax tree, and the tree is not always
 * finished parsing when the status bar wants a number.
 */

/**
 * Count words the way a word processor does: runs of letters, digits and
 * apostrophes, separated by anything else.
 *
 * Markdown punctuation does not count. A line of `## Heading` is one word, and
 * `- item` is one word, because the marker is not something anybody typed as
 * prose. An em dash between two words splits them; a hyphen inside one does
 * not, so "well-meaning" stays a single word.
 */
export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)
  return matches?.length ?? 0
}

export function countCharacters(text: string): number {
  // Count what a person would call a character, so an emoji counts once
  // rather than as the two code units JavaScript stores it in.
  return [...text].length
}

/**
 * File size for the status bar.
 *
 * Powers of 1024 with the short units, which is what both Explorer and Finder
 * show, whatever the standards say they ought to.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

export function formatLineEnding(lineEnding: 'lf' | 'crlf'): string {
  return lineEnding === 'crlf' ? 'CRLF' : 'LF'
}

export function formatEncoding(encoding: 'utf-8' | 'utf-8-bom'): string {
  return encoding === 'utf-8-bom' ? 'UTF-8 with BOM' : 'UTF-8'
}
