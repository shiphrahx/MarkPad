import { detectEncoding, detectLineEnding, toEditorText, toFileText } from './text.js'
import type {
  Host,
  Platform,
  SaveRequest,
  SaveResult,
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
  private nextPick: readonly string[] = []
  private nextSavePath: string | null = null

  /** Everything the app has told the user about. */
  readonly reported: string[] = []
  /** Every name the app has offered in a save dialog. */
  readonly suggestedNames: string[] = []

  constructor(platform: Platform = 'macos') {
    this.platform = platform
  }

  /** Seed a file, written exactly as the bytes would be on disk. */
  seed(path: string, rawContents: string): void {
    this.files.set(path, rawContents)
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
    }
  }

  async writeFile(request: SaveRequest): Promise<SaveResult> {
    const raw = toFileText(request.text, request.lineEnding, request.encoding)
    this.files.set(request.path, raw)
    return { byteLength: byteLength(raw) }
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
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
