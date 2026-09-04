// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'

/**
 * Closing the window with unsaved work in it.
 *
 * The one path in the app where getting it wrong costs somebody their
 * afternoon: there is no autosave and no crash recovery, so this dialog is the
 * only thing standing between a stray click on the X and a lost document.
 */
function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

function dialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.dialog-backdrop')]
}

/** Answer whichever unsaved dialog is on screen. */
function respond(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.dialog-button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (!button) throw new Error(`No dialog offering "${label}"`)
  button.click()
}

async function openDirty(app: App, host: MemoryHost, path: string): Promise<void> {
  host.seed(path, '# Notes\n')
  await app.openFiles([path])
  const buffer = app.workspace.tabs.find((candidate) => candidate.path === path)!
  app.workspace.setText(buffer.id, '# Changed\n')
}

describe('closeEverything', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  it('lets a window with nothing unsaved go without asking', async () => {
    const { app, host } = build()
    host.seed('C:/notes.md', '# Notes\n')
    await app.openFiles(['C:/notes.md'])

    await expect(app.closeEverything()).resolves.toBe(true)
    expect(dialogs()).toHaveLength(0)
  })

  it('lets an empty window go', async () => {
    const { app } = build()

    await expect(app.closeEverything()).resolves.toBe(true)
  })

  it('asks about an unsaved file and takes discard for an answer', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/notes.md')

    const closing = app.closeEverything()
    expect(document.body.textContent).toContain('notes.md')

    respond('Discard changes')
    await expect(closing).resolves.toBe(true)
  })

  /**
   * The answer that has to work. Keep editing means the window stays and every
   * buffer is exactly where it was.
   */
  it('stops the window closing when somebody changes their mind', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/notes.md')

    const closing = app.closeEverything()
    respond('Keep editing')

    await expect(closing).resolves.toBe(false)
    expect(app.workspace.tabs).toHaveLength(1)
    expect(host.raw('C:/notes.md')).toBe('# Notes\n')
  })

  it('writes the file when the answer is save', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/notes.md')

    const closing = app.closeEverything()
    respond('Save changes')

    await expect(closing).resolves.toBe(true)
    expect(host.raw('C:/notes.md')).toContain('# Changed')
  })

  it('asks once per unsaved file', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/one.md')
    await openDirty(app, host, 'C:/two.md')

    const closing = app.closeEverything()
    expect(document.body.textContent).toContain('one.md')
    respond('Discard changes')

    await Promise.resolve()
    expect(document.body.textContent).toContain('two.md')
    respond('Discard changes')

    await expect(closing).resolves.toBe(true)
  })

  /**
   * Changing your mind on the second file has to stop the whole thing, not
   * just that one. Otherwise the window closes anyway and the answer meant
   * nothing.
   */
  it('gives up on the whole close when one answer is to keep editing', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/one.md')
    await openDirty(app, host, 'C:/two.md')

    const closing = app.closeEverything()
    respond('Discard changes')

    await Promise.resolve()
    respond('Keep editing')

    await expect(closing).resolves.toBe(false)
    expect(app.workspace.tabs).toHaveLength(2)
  })

  it('skips the files that are saved', async () => {
    const { app, host } = build()
    host.seed('C:/clean.md', '# Clean\n')
    await app.openFiles(['C:/clean.md'])
    await openDirty(app, host, 'C:/dirty.md')

    const closing = app.closeEverything()

    expect(dialogs()).toHaveLength(1)
    expect(document.body.textContent).toContain('dirty.md')
    respond('Discard changes')

    await expect(closing).resolves.toBe(true)
  })
})

describe('quit', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  /**
   * Quit asks the window to close and does nothing else. That is the point:
   * the close button and Quit take the same route, so there is one unsaved
   * dialog rather than two that will eventually disagree.
   */
  it('asks the window to close rather than doing the asking itself', async () => {
    const { app, host } = build()
    await openDirty(app, host, 'C:/notes.md')

    await app.quit()

    expect(host.closeRequests).toBe(1)
    expect(dialogs()).toHaveLength(0)
  })
})
