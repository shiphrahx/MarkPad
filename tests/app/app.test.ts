// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'

const SAMPLE = `# Notes

Some **bold** text and a [link](https://example.com).

- one
- two
- [x] done

| a   | b   |
| --- | --- |
| 1   | 2   |

> Quoted.

\`\`\`js
const x = 1
\`\`\`
`

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

describe('App', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  it('opens into reader mode', () => {
    const { app } = build()
    expect(app.currentMode).toBe('reader')
  })

  it('shows the rendered document rather than the source', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', SAMPLE)

    await app.openFiles(['C:/notes.md'])

    const rendered = document.querySelector('.reader')!
    expect(rendered.querySelector('h1')?.textContent).toBe('Notes')
    expect(rendered.querySelector('strong')?.textContent).toBe('bold')
    expect(rendered.querySelector('table')).not.toBeNull()
    expect(rendered.querySelector('input[type=checkbox]')).not.toBeNull()
    // The markup itself is gone: this is the rendered surface, not source.
    expect(rendered.textContent).not.toContain('**bold**')
  })

  /**
   * The one that matters. Opening a file and saving it without typing has to
   * leave the bytes exactly as they were, or every file you merely looked at
   * turns up in a diff.
   */
  it('does not rewrite a file that was opened and saved untouched', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', SAMPLE)

    await app.openFiles(['C:/notes.md'])
    await app.save(app.workspace.active!.id)

    expect(host.raw('C:/notes.md')).toBe(SAMPLE)
  })

  it('keeps CRLF and the byte order mark on a file it never touched', async () => {
    const { app, host } = build()
    const original = '\uFEFF# Title\r\n\r\nBody.\r\n'
    host.seed('C:/notes.md', original)

    await app.openFiles(['C:/notes.md'])
    await app.save(app.workspace.active!.id)

    expect(host.raw('C:/notes.md')).toBe(original)
  })

  it('swaps to the source view and back', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', SAMPLE)
    await app.openFiles(['C:/notes.md'])

    app.toggleSource()
    expect(app.currentMode).toBe('source')
    expect(document.querySelector('.cm-content')?.textContent).toContain('**bold**')

    app.toggleSource()
    expect(app.currentMode).toBe('reader')
  })

  it('carries an edit made in the source view back into the reader', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', '# One\n')
    await app.openFiles(['C:/notes.md'])

    app.toggleSource()
    app.workspace.setText(app.workspace.active!.id, '# Changed\n')
    app.toggleSource()

    expect(document.querySelector('.reader h1')?.textContent).toBe('Changed')
  })

  it('reports the word count from the rendered document', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', 'one two three\n')
    await app.openFiles(['C:/notes.md'])

    expect(document.querySelector('.status')?.textContent).toContain('3 words')
  })

  it('leaves out Ln and Col in reader mode, and shows them in source', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', '# One\n')
    await app.openFiles(['C:/notes.md'])

    expect(document.querySelector('.status')?.textContent).not.toContain('Ln ')

    app.toggleSource()
    expect(document.querySelector('.status')?.textContent).toContain('Ln ')
  })

  it('draws a tick per heading in the rail', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', '# One\n\n## Two\n\n## Three\n')
    await app.openFiles(['C:/notes.md'])

    expect(document.querySelectorAll('.rail-tick')).toHaveLength(3)
  })
})
