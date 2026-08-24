/**
 * The document's headings, for the outline rail.
 *
 * Scans lines rather than reading the syntax tree, for the same reason the
 * word count does: the rail has to be right the instant a document opens, and
 * the parser is still working on a 10 MB file at that point. A line scan of
 * the whole document costs a few milliseconds and never lies about a heading
 * that is plainly there.
 */

export interface Heading {
  /** 1 for `#`, 6 for `######`. */
  readonly level: number
  readonly text: string
  /** Zero-based line number. */
  readonly line: number
  /** Character offset of the start of the line, for scrolling to it. */
  readonly offset: number
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const ATX = /^(#{1,6})(\s+(.*?))?\s*$/
const SETEXT = /^\s{0,3}(=+|-+)\s*$/

export function extractHeadings(text: string): Heading[] {
  const lines = text.split('\n')
  const headings: Heading[] = []

  let offset = 0
  let openFence: string | null = null
  let previousLine: { text: string; line: number; offset: number } | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const lineOffset = offset
    offset += line.length + 1

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]![0]!
      if (openFence === null) {
        openFence = marker
      } else if (marker === openFence) {
        openFence = null
      }
      previousLine = null
      continue
    }

    if (openFence !== null) {
      previousLine = null
      continue
    }

    const atx = ATX.exec(line)
    if (atx) {
      headings.push({
        level: atx[1]!.length,
        // A trailing run of hashes is a closing marker, not part of the title.
        text: (atx[3] ?? '').replace(/\s*#+\s*$/, '').trim(),
        line: index,
        offset: lineOffset,
      })
      previousLine = null
      continue
    }

    // Setext: the underline comes after the text, so the heading is the line
    // we have just walked past.
    if (previousLine !== null && SETEXT.test(line) && previousLine.text.trim() !== '') {
      headings.push({
        level: line.trim().startsWith('=') ? 1 : 2,
        text: previousLine.text.trim(),
        line: previousLine.line,
        offset: previousLine.offset,
      })
      previousLine = null
      continue
    }

    previousLine = { text: line, line: index, offset: lineOffset }
  }

  return headings
}
