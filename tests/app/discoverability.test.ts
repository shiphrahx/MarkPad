// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { isDirty, resetBufferIds, title } from '../../src/app/buffer.js'
import { rememberLaunch } from '../../src/app/session.js'

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

async function withDocument(text: string): Promise<App> {
  const { app, host } = build()
  host.seed('C:/notes.md', text)
  await app.openFiles(['C:/notes.md'])
  return app
}

function reader(): HTMLElement {
  return document.querySelector<HTMLElement>('.reader')!
}

describe('empty document', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    // Not a first launch, so no welcome document in the way.
    rememberLaunch()
    document.body.replaceChildren()
  })

  it('says what to do rather than sitting there blank', async () => {
    const { app } = build()
    await app.start()

    const hint = reader().querySelector('.pm-placeholder')
    expect(hint?.getAttribute('data-placeholder')).toContain('Type /')
  })

  it('names the palette shortcut for this platform', async () => {
    const { app } = build()
    await app.start()

    const hint = reader().querySelector('.pm-placeholder')
    expect(hint?.getAttribute('data-placeholder')).toContain('Ctrl+K')
  })

  it('keeps the hint out of the document itself', async () => {
    const { app } = build()
    await app.start()
    app.flush()

    // Nothing was typed, so the file is still empty. If the hint were real
    // text it would be in here.
    expect(app.workspace.active?.text).toBe('')
  })

  it('goes away once there is something in the document', async () => {
    const app = await withDocument('# Something\n')
    expect(reader().querySelector('.pm-placeholder')).toBeNull()
  })
})

describe('selection toolbar', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    // Not a first launch, so no welcome document in the way.
    rememberLaunch()
    document.body.replaceChildren()
  })

  it('stays out of the way when nothing is selected', async () => {
    await withDocument('Some text.\n')

    const toolbar = document.querySelector<HTMLElement>('.selection-toolbar')
    expect(toolbar).not.toBeNull()
    expect(toolbar?.hidden).toBe(true)
  })

  it('offers the marks, and a way to add a link', async () => {
    await withDocument('Some text.\n')

    const labels = [...document.querySelectorAll('.selection-toolbar-button')].map(
      (button) => button.textContent,
    )
    expect(labels).toEqual(['B', 'I', 'S', '<>', 'Link'])
  })
})

describe('slash menu', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    // Not a first launch, so no welcome document in the way.
    rememberLaunch()
    document.body.replaceChildren()
  })

  it('exists and starts closed', async () => {
    await withDocument('text\n')

    const menu = document.querySelector<HTMLElement>('.slash-menu')
    expect(menu).not.toBeNull()
    expect(menu?.hidden).toBe(true)
  })
})

describe('code blocks', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    // Not a first launch, so no welcome document in the way.
    rememberLaunch()
    document.body.replaceChildren()
  })

  it('keeps the language through a round trip', async () => {
    const source = '```js\nconst x = 1\n```\n'
    const app = await withDocument(source)
    app.flush()

    expect(app.workspace.active?.text).toBe(source)
  })

  it('renders the code as text, whatever the highlighter does to it', async () => {
    await withDocument('```js\nconst x = 1\n```\n')

    expect(reader().querySelector('pre')?.textContent).toContain('const x = 1')
  })

  it('highlights a block once the highlighter has loaded', async () => {
    await withDocument('```js\nconst x = 1\n```\n')

    // The highlighter is imported on demand, so the decorations arrive a tick
    // or two after the document does.
    await vi.waitFor(() => {
      expect(reader().querySelector('pre .hljs-keyword')).not.toBeNull()
    })

    expect(reader().querySelector('pre .hljs-keyword')?.textContent).toBe('const')
  })

  it('does not load the highlighter for a document with no code in it', async () => {
    await withDocument('Just prose.\n')

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reader().querySelector('.hljs-keyword')).toBeNull()
  })

  it('leaves a block with no language alone', async () => {
    const source = '```\nplain text\n```\n'
    const app = await withDocument(source)
    app.flush()

    expect(app.workspace.active?.text).toBe(source)
  })
})

describe('first launch', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    document.body.replaceChildren()
  })

  it('opens the welcome document instead of a blank tab', async () => {
    const { app } = build()
    await app.start()

    expect(title(app.workspace.active!)).toBe('Welcome')
    expect(app.workspace.active?.text).toContain('# Welcome to MarkPad')
  })

  it('leaves the welcome document unsaved and clean', async () => {
    const { app } = build()
    await app.start()

    expect(app.workspace.active?.path).toBeNull()
    expect(isDirty(app.workspace.active!)).toBe(false)
  })

  it('does not show it again on the next launch', async () => {
    const first = build()
    await first.app.start()

    const second = build()
    await second.app.start()

    expect(title(second.app.workspace.active!)).toBe('Untitled 2')
    expect(second.app.workspace.active?.text).toBe('')
  })

  it('stays out of the way when a file was opened from the command line', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', '# Notes\n')
    await app.start(['C:/notes.md'])

    expect(app.workspace.tabs).toHaveLength(1)
    expect(app.workspace.active?.path).toBe('C:/notes.md')
  })
})
