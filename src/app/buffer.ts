import type { Encoding, LineEnding, Platform, TextDocument } from '../host/types.js'

/**
 * One open file, or one file that has never been saved.
 *
 * `savedText` is what is currently on disk. Comparing it against `text` is the
 * whole of the dirty check: no flag to forget to clear, and undoing back to
 * the saved state correctly marks the buffer clean again.
 */
export interface Buffer {
  readonly id: string
  readonly path: string | null
  /**
   * What the tab says when there is no file name to say instead.
   *
   * Null for an ordinary new buffer, which is numbered. Set for the few
   * buffers the app opens on your behalf and can name better than that.
   */
  readonly name: string | null
  readonly text: string
  readonly savedText: string
  readonly lineEnding: LineEnding
  readonly encoding: Encoding
  readonly byteLength: number
}

/** Content a new buffer starts with, when it does not start empty. */
export interface Contents {
  readonly text: string
  readonly name: string
}

let counter = 0

/** Reset the untitled numbering. Tests only. */
export function resetBufferIds(): void {
  counter = 0
}

/**
 * A blank buffer, or one that starts with something in it.
 *
 * The platform decides the line ending, because a new file has no opinion of
 * its own and CRLF is what everything else on Windows will write. It comes
 * from the host rather than being sniffed off the user agent, so the rule is
 * testable without pretending to be a browser.
 *
 * Starting content counts as already saved. It came from the app rather than
 * from you, so a buffer you never touched should close without asking whether
 * you meant to keep it.
 */
export function newBuffer(platform: Platform, contents?: Contents): Buffer {
  counter += 1
  const text = contents?.text ?? ''

  return {
    id: `buffer-${counter}`,
    path: null,
    name: contents?.name ?? null,
    text,
    savedText: text,
    lineEnding: platform === 'windows' ? 'crlf' : 'lf',
    encoding: 'utf-8',
    byteLength: new TextEncoder().encode(text).length,
  }
}

export function bufferFromDocument(document: TextDocument): Buffer {
  counter += 1
  return {
    id: `buffer-${counter}`,
    path: document.path,
    name: null,
    text: document.text,
    savedText: document.text,
    lineEnding: document.lineEnding,
    encoding: document.encoding,
    byteLength: document.byteLength,
  }
}

export function isDirty(buffer: Buffer): boolean {
  return buffer.text !== buffer.savedText
}

/**
 * What the tab shows. Untitled buffers are numbered off their id so two of
 * them are told apart, which is the only thing the number is for.
 */
export function title(buffer: Buffer): string {
  if (buffer.path !== null) return fileName(buffer.path)
  if (buffer.name !== null) return buffer.name
  return `Untitled ${buffer.id.replace('buffer-', '')}`
}

export function fileName(path: string): string {
  const parts = path.split(/[\/]/)
  return parts[parts.length - 1] ?? path
}
