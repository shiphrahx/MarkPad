// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'
import { ChangedOnDisk } from '../../src/app/workspace.js'

const PATH = 'C:/notes/today.md'

async function opened(text = 'mine\n'): Promise<{ app: App; host: MemoryHost; id: string }> {
  const host = new MemoryHost('windows')
  host.seed(PATH, text)
  const root = document.createElement('div')
  document.body.append(root)
  const app = new App(host, root)
  await app.openFiles([PATH])
  return { app, host, id: app.workspace.active!.id }
}

function dialog(): HTMLElement | null {
  return document.querySelector('.dialog')
}

async function answer(label: string): Promise<void> {
  // The dialog appears after the save has checked the disk, which is a tick.
  for (let tries = 0; tries < 20 && !dialog(); tries++) await Promise.resolve()
  const button = [...document.querySelectorAll<HTMLButtonElement>('.dialog-button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (!button) throw new Error(`No button labelled ${label}`)
  button.click()
}

beforeEach(() => {
  resetBufferIds()
  document.body.replaceChildren()
})

describe('saving a file something else has changed', () => {
  it('refuses at the workspace level rather than saving over it', async () => {
    const { app, host, id } = await opened()
    host.changeOnDisk(PATH, 'theirs\n')
    app.workspace.setText(id, 'edited\n')

    await expect(app.workspace.save(id)).rejects.toBeInstanceOf(ChangedOnDisk)
    expect(host.raw(PATH)).toBe('theirs\n')
  })

  it('asks, and saves over it when told to', async () => {
    const { app, host, id } = await opened()
    host.changeOnDisk(PATH, 'theirs\n')
    app.workspace.setText(id, 'edited\n')

    const saving = app.save(id)
    await answer('Save my version')

    expect(await saving).toBe(true)
    expect(host.raw(PATH)).toBe('edited\n')
  })

  it('reloads their version when told to, and does not save', async () => {
    const { app, host, id } = await opened()
    host.changeOnDisk(PATH, 'theirs\n')
    app.workspace.setText(id, 'edited\n')

    const saving = app.save(id)
    await answer('Reload from disk')

    expect(await saving).toBe(false)
    expect(app.workspace.active?.text).toBe('theirs\n')
    expect(host.raw(PATH)).toBe('theirs\n')
  })

  it('leaves both alone on Keep editing', async () => {
    const { app, host, id } = await opened()
    host.changeOnDisk(PATH, 'theirs\n')
    app.workspace.setText(id, 'edited\n')

    const saving = app.save(id)
    await answer('Keep editing')

    expect(await saving).toBe(false)
    expect(app.workspace.active?.text).toBe('edited\n')
    expect(host.raw(PATH)).toBe('theirs\n')
  })

  it('does not ask when nothing else touched the file', async () => {
    const { app, host, id } = await opened()
    app.workspace.setText(id, 'edited\n')

    expect(await app.save(id)).toBe(true)
    expect(dialog()).toBeNull()
    expect(host.raw(PATH)).toBe('edited\n')
  })

  it('does not ask on the second save of a file we wrote ourselves', async () => {
    const { app, host, id } = await opened()
    app.workspace.setText(id, 'one\n')
    await app.save(id)
    app.workspace.setText(id, 'two\n')

    expect(await app.save(id)).toBe(true)
    expect(host.raw(PATH)).toBe('two\n')
  })
})

describe('coming back to the window', () => {
  it('picks up a newer version of a file with no unsaved work', async () => {
    const { app, host } = await opened('old\n')
    host.changeOnDisk(PATH, 'new\n')

    await app.catchUpWithDisk()

    expect(app.workspace.active?.text).toBe('new\n')
  })

  it('leaves a tab with unsaved work alone, so nothing is lost', async () => {
    const { app, host, id } = await opened('old\n')
    app.workspace.setText(id, 'mine\n')
    host.changeOnDisk(PATH, 'theirs\n')

    await app.catchUpWithDisk()

    expect(app.workspace.active?.text).toBe('mine\n')
  })

  it('does nothing when nothing changed', async () => {
    const { app } = await opened('same\n')

    await app.catchUpWithDisk()

    expect(app.workspace.active?.text).toBe('same\n')
  })
})
