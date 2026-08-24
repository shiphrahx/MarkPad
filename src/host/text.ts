import type { Encoding, LineEnding } from './types.js'

const BOM = '\uFEFF'

/**
 * Guess a file's line endings from its content.
 *
 * A file counts as CRLF if any CRLF appears in it. Mixed files exist, usually
 * because two tools disagreed, and picking the majority would mean rewriting
 * the minority on save. Preserving the dominant style is the least surprising
 * thing we can do without rewriting lines the user never touched.
 */
export function detectLineEnding(text: string): LineEnding {
  return text.includes('\r\n') ? 'crlf' : 'lf'
}

export function detectEncoding(text: string): Encoding {
  return text.startsWith(BOM) ? 'utf-8-bom' : 'utf-8'
}

/**
 * Strip the BOM and collapse every ending to LF for the editor to work in.
 *
 * A lone CR is folded into LF too. Classic Mac line endings are not a
 * supported round trip, and leaving a bare CR in the buffer would put
 * CodeMirror's line numbers out of step with what the user can see.
 */
export function toEditorText(raw: string): string {
  const withoutBom = raw.startsWith(BOM) ? raw.slice(BOM.length) : raw
  return withoutBom.replace(/\r\n?/g, '\n')
}

/** Put back whatever the file had before we touched it. */
export function toFileText(
  text: string,
  lineEnding: LineEnding,
  encoding: Encoding,
): string {
  const withEndings = lineEnding === 'crlf' ? text.replace(/\n/g, '\r\n') : text
  return encoding === 'utf-8-bom' ? BOM + withEndings : withEndings
}
