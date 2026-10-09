import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { message } from '@tauri-apps/plugin-dialog'
import { detectEncoding, detectLineEnding, toEditorText, toFileText } from './text.js'
import { platformFromUserAgent } from './platform.js'
import type {
  Host,
  Platform,
  SaveRequest,
  SaveResult,
  Session,
  TextDocument,
} from './types.js'

/**
 * The real host. This is the only file in `src/` that knows Tauri exists.
 *
 * Rust hands back the file exactly as it sits on disk, byte order mark and
 * line endings included, and the detection happens here. Doing it on both
 * sides would mean two implementations of the same rules drifting apart.
 */
export class TauriHost implements Host {
  readonly platform: Platform = detectPlatform()

  async readFile(path: string): Promise<TextDocument> {
    const { text: raw, modified } = await invoke<{ text: string; modified: number | null }>(
      'read_text_file',
      { path },
    )

    return {
      path,
      text: toEditorText(raw),
      lineEnding: detectLineEnding(raw),
      encoding: detectEncoding(raw),
      byteLength: new TextEncoder().encode(raw).length,
      modified,
    }
  }

  async writeFile(request: SaveRequest): Promise<SaveResult> {
    const contents = toFileText(request.text, request.lineEnding, request.encoding)
    const { bytes, modified } = await invoke<{ bytes: number; modified: number | null }>(
      'write_text_file',
      { path: request.path, contents },
    )

    return { byteLength: bytes, modified }
  }

  async modifiedTime(path: string): Promise<number | null> {
    return invoke<number | null>('file_modified', { path })
  }

  /**
   * The dialogs run in Rust, so the host learns which paths the user really
   * chose. A path from here is one the page is then allowed to read and write.
   */
  async pickFilesToOpen(): Promise<readonly string[]> {
    return invoke<string[]>('pick_files_to_open')
  }

  async pickPathToSave(suggestedName: string): Promise<string | null> {
    return invoke<string | null>('pick_path_to_save', { suggestedName })
  }

  async report(text: string, title = 'MarkPad'): Promise<void> {
    await message(text, { title, kind: 'error' })
  }

  async loadSession(): Promise<unknown> {
    return invoke('load_session')
  }

  async saveSession(session: Session): Promise<void> {
    await invoke('save_session', { session })
  }

  async openLink(url: string): Promise<void> {
    await invoke('open_link', { url })
  }

  imageUrl(path: string): string {
    return convertFileSrc(path, 'markpad-image')
  }

  /**
   * `close` rather than `destroy`. Close asks, and the listener in main.ts is
   * what turns the answer into either a destroyed window or a window that is
   * still there with your work in it.
   */
  async requestClose(): Promise<void> {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }
}

function detectPlatform(): Platform {
  return platformFromUserAgent(navigator.userAgent)
}
