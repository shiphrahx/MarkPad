// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { clipboardHtml, copyRich } from '../../src/export/clipboard.js'

describe('clipboardHtml', () => {
  it('turns Markdown into the HTML a mail client or word processor wants', () => {
    const html = clipboardHtml('# Title\n\nSome **bold** text.\n')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  /** An empty placeholder would paste as nothing at all. */
  it('sends a diagram across as its source rather than an empty box', () => {
    const html = clipboardHtml('```mermaid\ngraph TD; A-->B\n```\n')

    expect(html).not.toContain('mp-block')
    expect(html).toContain('<pre><code>graph TD; A--&gt;B</code></pre>')
  })
})

describe('copyRich', () => {
  it('puts both HTML and the Markdown on the clipboard', () => {
    const set = new Map<string, string>()
    // jsdom has no clipboard, so stand in for the browser: run the copy
    // event the way execCommand would, and say it worked.
    document.execCommand = ((command: string) => {
      if (command !== 'copy') return false
      const event = new Event('copy', { cancelable: true }) as ClipboardEvent
      Object.defineProperty(event, 'clipboardData', {
        value: { setData: (type: string, value: string) => set.set(type, value) },
      })
      document.dispatchEvent(event)
      return true
    }) as typeof document.execCommand

    expect(copyRich('<p>hi</p>', 'hi')).toBe(true)
    expect(set.get('text/html')).toBe('<p>hi</p>')
    expect(set.get('text/plain')).toBe('hi')
  })
})
