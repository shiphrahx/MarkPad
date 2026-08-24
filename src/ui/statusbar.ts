import type { Buffer } from '../app/buffer.js'
import { formatEncoding, formatFileSize, formatLineEnding } from '../app/stats.js'
import type { Encoding, LineEnding } from '../host/types.js'
import { el, replace } from './dom.js'

export interface Caret {
  readonly line: number
  readonly column: number
}

export interface StatusBarHandlers {
  onLineEndingChange: (lineEnding: LineEnding) => void
  onEncodingChange: (encoding: Encoding) => void
}

/**
 * Word count, caret position, encoding, line endings, file size.
 *
 * The line ending and encoding read as plain text but are buttons: the rules
 * say the user can change them per file, and the status bar is where they are
 * already looking to find out what they currently are.
 */
export class StatusBar {
  readonly element = el('footer', { class: 'status' })

  constructor(private readonly handlers: StatusBarHandlers) {}

  /**
   * The word count is passed in rather than counted here. Counting means
   * walking the whole document, and the status bar is redrawn every time the
   * caret moves.
   */
  render(buffer: Buffer | null, caret: Caret | null, words: number): void {
    if (buffer === null) {
      replace(this.element)
      return
    }

    replace(
      this.element,
      el('span', { class: 'status-item' }, `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`),
      caret && el('span', { class: 'status-item' }, `Ln ${caret.line}, Col ${caret.column}`),
      el('span', { class: 'status-spacer' }),
      this.picker(
        formatEncoding(buffer.encoding),
        'Change encoding',
        buffer.encoding === 'utf-8' ? 'Add a byte order mark' : 'Remove the byte order mark',
        () =>
          this.handlers.onEncodingChange(
            buffer.encoding === 'utf-8' ? 'utf-8-bom' : 'utf-8',
          ),
      ),
      this.picker(
        formatLineEnding(buffer.lineEnding),
        'Change line endings',
        buffer.lineEnding === 'lf' ? 'Switch to CRLF' : 'Switch to LF',
        () =>
          this.handlers.onLineEndingChange(buffer.lineEnding === 'lf' ? 'crlf' : 'lf'),
      ),
      el('span', { class: 'status-item' }, formatFileSize(buffer.byteLength)),
    )
  }

  private picker(
    label: string,
    ariaLabel: string,
    hint: string,
    onClick: () => void,
  ): HTMLElement {
    const button = el(
      'button',
      { class: 'status-item status-button', type: 'button', 'aria-label': ariaLabel, title: hint },
      label,
    )
    button.addEventListener('click', onClick)
    return button
  }
}
