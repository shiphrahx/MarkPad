import { detectEncoding, detectLineEnding, toEditorText, toFileText } from './text.js'
import type {
  Host,
  Platform,
  SaveRequest,
  SaveResult,
  Session,
  TextDocument,
} from './types.js'

/**
 * A host backed by a Map instead of a disk.
 *
 * This is what the editor runs against in tests. It deliberately does not try
 * to imitate file locking, antivirus delays or partial writes. Those belong to
 * the Rust side and are tested there, against a real filesystem.
 */
export class MemoryHost implements Host {
  readonly platform: Platform
  private readonly files = new Map<string, string>()
  private readonly times = new Map<string, number>()
  /** A clock that only moves when a file is written. */
  private clock = 1000
  private nextPick: readonly string[] = []
  private nextSavePath: string | null = null

  /** Everything the app has told the user about. */
  readonly reported: string[] = []
  /** Every name the app has offered in a save dialog. */
  readonly suggestedNames: string[] = []
  /** Every link the app has asked to open outside. */
  readonly openedLinks: string[] = []
  /** How many times the app has asked the window to close. */
  closeRequests = 0
  /**
   * What `saveSession` last stored. Public so a test can carry it from one
   * host to the next, the way a real one carries it across launches.
   */
  session: unknown = null

  constructor(platform: Platform = 'macos') {
    this.platform = platform
  }

  /** Seed a file, written exactly as the bytes would be on disk. */
  seed(path: string, rawContents: string): void {
    this.files.set(path, rawContents)
    this.times.set(path, this.tick())
  }

  /**
   * Change a file behind the app's back, the way git or another editor
   * would. Moves its modified time on.
   */
  changeOnDisk(path: string, rawContents: string): void {
    this.seed(path, rawContents)
  }

  private tick(): number {
    this.clock += 1
    return this.clock
  }

  /** Read back what a save actually wrote, endings and BOM included. */
  raw(path: string): string | undefined {
    return this.files.get(path)
  }

  queueOpenPick(paths: readonly string[]): void {
    this.nextPick = paths
  }

  queueSavePick(path: string | null): void {
    this.nextSavePath = path
  }

  async readFile(path: string): Promise<TextDocument> {
    const raw = this.files.get(path)
    if (raw === undefined) throw new Error(`No such file: ${path}`)
    return {
      path,
      text: toEditorText(raw),
      lineEnding: detectLineEnding(raw),
      encoding: detectEncoding(raw),
      byteLength: byteLength(raw),
      modified: this.times.get(path) ?? null,
    }
  }

  async writeFile(request: SaveRequest): Promise<SaveResult> {
    const raw = toFileText(request.text, request.lineEnding, request.encoding)
    this.files.set(request.path, raw)
    const modified = this.tick()
    this.times.set(request.path, modified)
    return { byteLength: byteLength(raw), modified }
  }

  async modifiedTime(path: string): Promise<number | null> {
    return this.times.get(path) ?? null
  }

  async pickFilesToOpen(): Promise<readonly string[]> {
    return this.nextPick
  }

  async pickPathToSave(suggestedName: string): Promise<string | null> {
    this.suggestedNames.push(suggestedName)
    return this.nextSavePath
  }

  async report(message: string): Promise<void> {
    this.reported.push(message)
  }

  async requestClose(): Promise<void> {
    this.closeRequests += 1
  }

  async loadSession(): Promise<unknown> {
    return this.session
  }

  async saveSession(session: Session): Promise<void> {
    this.session = session.paths.length === 0 && session.recent.length === 0 ? null : session
  }

  async openLink(url: string): Promise<void> {
    this.openedLinks.push(url)
  }

  imageUrl(path: string): string {
    return `markpad-image://${path}`
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
