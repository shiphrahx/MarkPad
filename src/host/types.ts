/**
 * The vocabulary the editor and the host agree on. Nothing in here imports
 * Tauri, so the editor can be tested in Node against the in-memory host.
 */

export type Platform = 'windows' | 'macos' | 'linux'

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
  /**
   * When the file was last changed on disk, in milliseconds, or null when
   * there is no file or the filesystem does not say. Compared later to tell
   * whether something else has written to it.
   */
  readonly modified: number | null
}

export interface SaveRequest {
  readonly path: string
  readonly text: string
  readonly lineEnding: LineEnding
  readonly encoding: Encoding
}

/** Which files were open last time, and which one was in front. */
export interface Session {
  readonly paths: readonly string[]
  /** Index into `paths` of the tab that was in front. */
  readonly active: number
  /** Files opened lately, newest first, open or not. */
  readonly recent: readonly string[]
}

export interface SaveResult {
  readonly byteLength: number
  /** The file's modified time after this write. */
  readonly modified: number | null
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
  /** When a file was last changed on disk, or null if it is not there. */
  modifiedTime(path: string): Promise<number | null>
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
   * Last time's open files. Unchecked: whatever is stored comes back, and the
   * caller decides whether it is a session at all.
   */
  loadSession(): Promise<unknown>
  /** Remember the open files for next time. Nothing open or recent forgets them. */
  saveSession(session: Session): Promise<void>
  /**
   * Open a link from a document in the browser or mail client. Only web and
   * email links; anything else is refused with a message saying so.
   */
  openLink(url: string): Promise<void>
  /**
   * A picture on disk, written as a URL the window can load.
   *
   * Only pictures. The host serves image files and refuses everything else,
   * so a document can point anywhere and still only ever show you an image.
   */
  imageUrl(path: string): string
}
