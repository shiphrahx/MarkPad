// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'
import { loadSession, saveSession, signatureOf } from '../../src/app/session.js'

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

function openPaths(app: App): Array<string | null> {
  return app.workspace.tabs.map((buffer) => buffer.path)
}

describe('session storage', () => {
  beforeEach(() => localStorage.clear())

  it('starts with nothing remembered', () => {
    expect(loadSession()).toEqual({ paths: [], active: 0 })
  })

  it('remembers paths and which was in front', () => {
    saveSession({ paths: ['C:/a.md', 'C:/b.md'], active: 1 })
    expect(loadSession()).toEqual({ paths: ['C:/a.md', 'C:/b.md'], active: 1 })
  })

  it('clears itself when nothing is open', () => {
    saveSession({ paths: ['C:/a.md'], active: 0 })
    saveSession({ paths: [], active: 0 })

    expect(localStorage.getItem('markpad.session')).toBeNull()
  })

  it('ignores nonsense in storage rather than failing to start', () => {
    localStorage.setItem('markpad.session', 'not json at all')
    expect(loadSession()).toEqual({ paths: [], active: 0 })

    localStorage.setItem('markpad.session', '{"paths":[1,2],"active":0}')
    expect(loadSession()).toEqual({ paths: [], active: 0 })

    localStorage.setItem('markpad.session', '{"paths":[],"active":-4}')
    expect(loadSession()).toEqual({ paths: [], active: 0 })
  })

  it('changes its signature when the tabs change, not when the text does', () => {
    const one = signatureOf({ paths: ['C:/a.md'], active: 0 })
    const same = signatureOf({ paths: ['C:/a.md'], active: 0 })
    const other = signatureOf({ paths: ['C:/a.md', 'C:/b.md'], active: 1 })

    expect(one).toBe(same)
    expect(one).not.toBe(other)
  })
})

describe('restoring the session', () => {
  beforeEach(() => {
    resetBufferIds()
    localStorage.clear()
    document.body.replaceChildren()
  })

  it('opens a blank buffer on a first run', async () => {
    const { app } = build()
    await app.start()

    expect(app.workspace.tabs).toHaveLength(1)
    expect(app.workspace.active?.path).toBeNull()
  })

  it('reopens the files that were open last time', async () => {
    const { app, host } = build()
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')

    await app.openFiles(['C:/a.md', 'C:/b.md'])

    const second = build()
    second.host.seed('C:/a.md', 'a\n')
    second.host.seed('C:/b.md', 'b\n')
    await second.app.start()

    expect(openPaths(second.app)).toEqual(['C:/a.md', 'C:/b.md'])
  })

  it('brings back the tab that was in front', async () => {
    const { app, host } = build()
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')
    await app.openFiles(['C:/a.md', 'C:/b.md'])
    app.focusTab(app.workspace.tabs[0]!.id)

    const second = build()
    second.host.seed('C:/a.md', 'a\n')
    second.host.seed('C:/b.md', 'b\n')
    await second.app.start()

    expect(second.app.workspace.active?.path).toBe('C:/a.md')
  })

  it('skips a file that has been deleted since, and opens the rest', async () => {
    const { app, host } = build()
    host.seed('C:/gone.md', 'x\n')
    host.seed('C:/still-here.md', 'y\n')
    await app.openFiles(['C:/gone.md', 'C:/still-here.md'])

    const second = build()
    // Only one of them exists this time.
    second.host.seed('C:/still-here.md', 'y\n')
    await second.app.start()

    expect(openPaths(second.app)).toEqual(['C:/still-here.md'])
  })

  it('falls back to a blank buffer when every remembered file is gone', async () => {
    const { app, host } = build()
    host.seed('C:/gone.md', 'x\n')
    await app.openFiles(['C:/gone.md'])

    const second = build()
    await second.app.start()

    expect(second.app.workspace.tabs).toHaveLength(1)
    expect(second.app.workspace.active?.path).toBeNull()
  })

  it('adds a file from the command line to the restored tabs', async () => {
    const { app, host } = build()
    host.seed('C:/a.md', 'a\n')
    await app.openFiles(['C:/a.md'])

    const second = build()
    second.host.seed('C:/a.md', 'a\n')
    second.host.seed('C:/opened.md', 'o\n')
    await second.app.start(['C:/opened.md'])

    expect(openPaths(second.app)).toEqual(['C:/a.md', 'C:/opened.md'])
    expect(second.app.workspace.active?.path).toBe('C:/opened.md')
  })

  it('forgets a file once its tab is closed', async () => {
    const { app, host } = build()
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')
    await app.openFiles(['C:/a.md', 'C:/b.md'])
    await app.closeTab(app.workspace.tabs[0]!.id)

    const second = build()
    second.host.seed('C:/a.md', 'a\n')
    second.host.seed('C:/b.md', 'b\n')
    await second.app.start()

    expect(openPaths(second.app)).toEqual(['C:/b.md'])
  })

  /**
   * A buffer that was never saved has nothing on disk to reopen, and keeping
   * its text in the app's own storage is the vault this app promised not to
   * be. So it is not remembered, and neither is it counted.
   */
  it('does not try to remember an unsaved buffer', async () => {
    const { app, host } = build()
    host.seed('C:/a.md', 'a\n')
    await app.openFiles(['C:/a.md'])
    app.newFile()

    expect(loadSession().paths).toEqual(['C:/a.md'])
  })
})
