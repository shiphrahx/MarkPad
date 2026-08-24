import { invoke } from '@tauri-apps/api/core'
import { ask, message, open, save } from '@tauri-apps/plugin-dialog'
import { detectEncoding, detectLineEnding, toEditorText, toFileText } from './text.js'
import type {
  ConfirmRequest,
  Host,
  Platform,
  SaveRequest,
  SaveResult,
  TextDocument,
} from './types.js'

const MARKDOWN_FILTER = {
  name: 'Markdown',
  extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'],
}

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
    const raw = await invoke<string>('read_text_file', { path })

    return {
      path,
      text: toEditorText(raw),
      lineEnding: detectLineEnding(raw),
      encoding: detectEncoding(raw),
      byteLength: new TextEncoder().encode(raw).length,
    }
  }

  async writeFile(request: SaveRequest): Promise<SaveResult> {
    const contents = toFileText(request.text, request.lineEnding, request.encoding)
    const byteLength = await invoke<number>('write_text_file', {
      path: request.path,
      contents,
    })

    return { byteLength }
  }

  async pickFilesToOpen(): Promise<readonly string[]> {
    const picked = await open({ multiple: true, filters: [MARKDOWN_FILTER] })
    if (picked === null) return []
    return Array.isArray(picked) ? picked : [picked]
  }

  async pickPathToSave(suggestedName: string): Promise<string | null> {
    return save({ defaultPath: suggestedName, filters: [MARKDOWN_FILTER] })
  }

  async confirm(question: ConfirmRequest): Promise<boolean> {
    return ask(question.message, {
      title: question.title,
      kind: 'warning',
      okLabel: question.okLabel,
      cancelLabel: question.cancelLabel,
    })
  }

  async report(text: string, title = 'MarkPad'): Promise<void> {
    await message(text, { title, kind: 'error' })
  }
}

/**
 * Which machine this is.
 *
 * Read off the user agent rather than pulling in the OS plugin, because the
 * only thing the editor uses it for is which modifier key to draw in the
 * command palette.
 */
function detectPlatform(): Platform {
  const agent = navigator.userAgent
  return /mac/i.test(agent) ? 'macos' : 'windows'
}
