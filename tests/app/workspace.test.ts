import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryHost } from '../../src/host/memory.js'
import { Workspace } from '../../src/app/workspace.js'
import { isDirty, resetBufferIds, title } from '../../src/app/buffer.js'

describe('Workspace', () => {
  let host: MemoryHost
  let workspace: Workspace

  beforeEach(() => {
    resetBufferIds()
    host = new MemoryHost('windows')
    workspace = new Workspace(host)
  })

  it('starts with nothing open', () => {
    expect(workspace.tabs).toEqual([])
    expect(workspace.active).toBeNull()
  })

  it('opens a named buffer that already holds something', () => {
    const buffer = workspace.create({ text: '# Welcome\n', name: 'Welcome' })

    expect(title(buffer)).toBe('Welcome')
    expect(buffer.text).toBe('# Welcome\n')
    expect(isDirty(buffer)).toBe(false)
  })

  it('offers the buffer name in the save dialog', async () => {
    const buffer = workspace.create({ text: '# Welcome\n', name: 'Welcome' })
    host.queueSavePick(null)
    await workspace.save(buffer.id)

    expect(host.suggestedNames).toEqual(['Welcome.md'])
  })

  it('opens a file and focuses it', async () => {
    host.seed('C:/notes.md', '# Notes\n')
    await workspace.open(['C:/notes.md'])

    expect(workspace.tabs).toHaveLength(1)
    expect(workspace.active?.text).toBe('# Notes\n')
    expect(title(workspace.active!)).toBe('notes.md')
  })

  it('focuses an already open file rather than opening it twice', async () => {
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')
    await workspace.open(['C:/a.md', 'C:/b.md'])
    await workspace.open(['C:/a.md'])

    expect(workspace.tabs).toHaveLength(2)
    expect(workspace.active?.path).toBe('C:/a.md')
  })

  it('numbers untitled buffers so two can be told apart', () => {
    const first = workspace.create()
    const second = workspace.create()

    expect(title(first)).toBe('Untitled 1')
    expect(title(second)).toBe('Untitled 2')
  })

  it('marks a buffer dirty on edit and clean again on save', async () => {
    host.seed('C:/notes.md', '# Notes\n')
    await workspace.open(['C:/notes.md'])
    const id = workspace.active!.id

    workspace.setText(id, '# Notes\n\nmore\n')
    expect(isDirty(workspace.active!)).toBe(true)

    await workspace.save(id)
    expect(isDirty(workspace.active!)).toBe(false)
  })

  it('comes clean again if the edit is undone back to the saved text', async () => {
    host.seed('C:/notes.md', '# Notes\n')
    await workspace.open(['C:/notes.md'])
    const id = workspace.active!.id

    workspace.setText(id, 'changed')
    workspace.setText(id, '# Notes\n')

    expect(isDirty(workspace.active!)).toBe(false)
  })

  it('writes back the line endings the file arrived with', async () => {
    host.seed('C:/notes.md', 'one\r\ntwo\r\n')
    await workspace.open(['C:/notes.md'])
    const id = workspace.active!.id

    workspace.setText(id, 'one\ntwo\nthree\n')
    await workspace.save(id)

    expect(host.raw('C:/notes.md')).toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('honours a line ending the user changed by hand', async () => {
    host.seed('C:/notes.md', 'one\r\ntwo\r\n')
    await workspace.open(['C:/notes.md'])
    const id = workspace.active!.id

    workspace.setLineEnding(id, 'lf')
    await workspace.save(id)

    expect(host.raw('C:/notes.md')).toBe('one\ntwo\n')
  })

  it('asks for a path when saving a buffer that has never had one', async () => {
    const buffer = workspace.create()
    workspace.setText(buffer.id, 'hello\n')
    host.queueSavePick('C:/new.md')

    await workspace.save(buffer.id)

    expect(host.raw('C:/new.md')).toBe('hello\r\n')
    expect(workspace.active?.path).toBe('C:/new.md')
  })

  it('reports a cancelled save dialog rather than pretending it saved', async () => {
    const buffer = workspace.create()
    workspace.setText(buffer.id, 'hello\n')
    host.queueSavePick(null)

    expect(await workspace.save(buffer.id)).toBe(false)
    expect(isDirty(workspace.active!)).toBe(true)
  })

  it('updates the byte count from what was actually written', async () => {
    const buffer = workspace.create()
    workspace.setText(buffer.id, 'caf\u00e9\n')
    host.queueSavePick('C:/new.md')

    await workspace.save(buffer.id)

    // Five characters, but six bytes of UTF-8, and CRLF makes seven.
    expect(workspace.active?.byteLength).toBe(7)
  })

  it('refuses to close a dirty tab unless forced', async () => {
    host.seed('C:/notes.md', '# Notes\n')
    await workspace.open(['C:/notes.md'])
    const id = workspace.active!.id
    workspace.setText(id, 'changed')

    expect(workspace.close(id)).toBe(false)
    expect(workspace.tabs).toHaveLength(1)

    expect(workspace.close(id, true)).toBe(true)
    expect(workspace.tabs).toHaveLength(0)
  })

  it('focuses the neighbouring tab when the active one closes', async () => {
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')
    host.seed('C:/c.md', 'c\n')
    await workspace.open(['C:/a.md', 'C:/b.md', 'C:/c.md'])

    workspace.focus(workspace.tabs[1]!.id)
    workspace.close(workspace.tabs[1]!.id)

    expect(workspace.active?.path).toBe('C:/c.md')
  })

  it('wraps around when cycling tabs', async () => {
    host.seed('C:/a.md', 'a\n')
    host.seed('C:/b.md', 'b\n')
    await workspace.open(['C:/a.md', 'C:/b.md'])

    workspace.focusRelative(1)
    expect(workspace.active?.path).toBe('C:/a.md')

    workspace.focusRelative(-1)
    expect(workspace.active?.path).toBe('C:/b.md')
  })

  it('tells subscribers when anything changes', async () => {
    let calls = 0
    workspace.subscribe(() => void (calls += 1))

    workspace.create()
    workspace.setText(workspace.active!.id, 'x')

    expect(calls).toBe(2)
  })

  it('stops telling a subscriber that unsubscribed', () => {
    let calls = 0
    const stop = workspace.subscribe(() => void (calls += 1))

    workspace.create()
    stop()
    workspace.create()

    expect(calls).toBe(1)
  })

  it('knows when anything at all is unsaved', async () => {
    host.seed('C:/a.md', 'a\n')
    await workspace.open(['C:/a.md'])
    expect(workspace.hasUnsavedChanges).toBe(false)

    workspace.setText(workspace.active!.id, 'changed')
    expect(workspace.hasUnsavedChanges).toBe(true)
  })

  it('opens what the dialog returned', async () => {
    host.seed('C:/picked.md', 'picked\n')
    host.queueOpenPick(['C:/picked.md'])

    await workspace.openWithDialog()

    expect(workspace.active?.path).toBe('C:/picked.md')
  })

  it('does nothing when the open dialog is cancelled', async () => {
    host.queueOpenPick([])
    await workspace.openWithDialog()

    expect(workspace.tabs).toEqual([])
  })
})
