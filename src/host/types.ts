/**
 * The vocabulary the editor and the host agree on. Nothing in here imports
 * Tauri, so the editor can be tested in Node against the in-memory host.
 */

export type Platform = 'windows' | 'macos'

/** What a file had on disk. Detected on open, written back unchanged on save. */
export type LineEnding = 'lf' | 'crlf'

/** UTF-8 with or without a byte order mark. Nothing else is supported yet. */
export type Encoding = 'utf-8' | 'utf-8-bom'

/**
 * A file as the editor sees it.
 *
 * `text` is always LF, whatever the file had. The editor never reasons about
 * CRLF: a document with mixed or Windows endings would otherwise make every
 * offset, selection and word count subtly wrong. The original ending is kept
 * in `lineEnding` and reapplied when the bytes go back to disk.
 */
export interface TextDocument {
  /** Absolute path, or null for a buffer that has never been saved. */
  readonly path: string | null
  /** Contents, normalised to LF. */
  readonly text: string
  readonly lineEnding: LineEnding
  readonly encoding: Encoding
  /** Size of the file on disk in bytes, or 0 for an unsaved buffer. */
  readonly byteLength: number
}

export interface SaveRequest {
  readonly path: string
  readonly text: string
  readonly lineEnding: LineEnding
  readonly encoding: Encoding
}

export interface SaveResult {
  readonly byteLength: number
}

/**
 * Everything the editor is allowed to ask the outside world for.
 *
 * Kept deliberately small. If a feature needs a new method here, that is worth
 * noticing, because it is the only place the app touches the machine.
 */
export interface Host {
  readonly platform: Platform
  /** Read a file, detecting its encoding and line endings. */
  readFile(path: string): Promise<TextDocument>
  /** Write a file atomically, preserving encoding and line endings. */
  writeFile(request: SaveRequest): Promise<SaveResult>
  /** Native open dialog. Empty array if the user cancelled. */
  pickFilesToOpen(): Promise<readonly string[]>
  /** Native save dialog. Null if the user cancelled. */
  pickPathToSave(suggestedName: string): Promise<string | null>
  /** Tell the user something went wrong. */
  report(message: string, title?: string): Promise<void>
  /**
   * Ask the window to close.
   *
   * Asking rather than closing. The unsaved check lives on the way out, so
   * everything that ends the session goes through the same door: the close
   * button, Quit, and the menu item that calls this.
   */
  requestClose(): Promise<void>
  /**
   * Let the window load images out of one folder.
   *
   * Called with the folder a file was opened from, and nothing else. The
   * window starts able to read no pictures at all, and a document can only
   * ever show the ones sitting beside it.
   */
  allowImagesIn(directory: string): Promise<void>
  /** A path on disk, written as something the window can actually load. */
  assetUrl(path: string): string
}

