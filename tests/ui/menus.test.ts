import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMenus } from '../../src/ui/menus.js'
import type { Command } from '../../src/commands/types.js'

/**
 * A stand-in for the native menu.
 *
 * The real thing lives in the operating system and cannot be inspected from a
 * test, so the fake records the shape it was asked for and the assertions read
 * that. Enough to tell an Edit menu with a Paste item in it from one without.
 */
const native = vi.hoisted(() => {
  interface Fake {
    readonly kind: string
    readonly text?: string
    readonly predefined?: string
    readonly items?: Fake[]
  }

  return {
    appMenu: null as Fake | null,
    reset(): void {
      native.appMenu = null
    },
  }
})

vi.mock('@tauri-apps/api/menu', () => ({
  MenuItem: {
    new: async (options: { text: string; accelerator?: string }) => ({
      kind: 'item',
      text: options.text,
      accelerator: options.accelerator ?? null,
      setEnabled: async () => {},
    }),
  },
  PredefinedMenuItem: {
    new: async (options: { item: unknown }) => ({
      kind: 'predefined',
      predefined: typeof options.item === 'string' ? options.item : 'About',
    }),
  },
  Submenu: {
    new: async (options: { text: string; items: unknown[] }) => ({
      kind: 'submenu',
      text: options.text,
      items: options.items,
    }),
  },
  Menu: {
    new: async (options: { items: unknown[] }) => ({
      kind: 'menu',
      items: options.items,
      setAsAppMenu: async () => {
        native.appMenu = { kind: 'menu', items: options.items as never }
      },
    }),
  },
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: async () => '0.0.0-test',
}))

function command(partial: Partial<Command> & Pick<Command, 'id' | 'title'>): Command {
  return {
    category: 'Edit',
    run: () => {},
    ...partial,
  }
}

function submenu(text: string): { text?: string; items?: unknown[] } {
  const menu = native.appMenu as { items?: Array<{ text?: string; items?: unknown[] }> } | null
  return menu?.items?.find((entry) => entry.text === text) ?? {}
}

function predefinedIn(text: string): string[] {
  const items = (submenu(text).items ?? []) as Array<{ kind?: string; predefined?: string }>
  return items.filter((item) => item.kind === 'predefined').map((item) => item.predefined!)
}

function acceleratorFor(menu: string, label: string): string | null | undefined {
  const items = (submenu(menu).items ?? []) as Array<{
    kind?: string
    text?: string
    accelerator?: string | null
  }>
  return items.find((item) => item.text === label)?.accelerator
}

function labelsIn(text: string): string[] {
  const items = (submenu(text).items ?? []) as Array<{ kind?: string; text?: string }>
  return items.filter((item) => item.kind === 'item').map((item) => item.text!)
}

describe('installMenus', () => {
  beforeEach(() => native.reset())

  it('gives the Edit menu the clipboard items on Windows', async () => {
    await installMenus([command({ id: 'edit.lineEndings', title: 'Change line endings' })], 'windows')

    expect(predefinedIn('Edit')).toEqual(expect.arrayContaining(['Cut', 'Copy', 'Paste']))
  })

  it('gives the Edit menu the clipboard items on macOS', async () => {
    await installMenus([command({ id: 'edit.lineEndings', title: 'Change line endings' })], 'macos')

    expect(predefinedIn('Edit')).toEqual(expect.arrayContaining(['Cut', 'Copy', 'Paste']))
  })

  it('gives the Edit menu the clipboard items on Linux', async () => {
    await installMenus([command({ id: 'edit.lineEndings', title: 'Change line endings' })], 'linux')

    expect(predefinedIn('Edit')).toEqual(expect.arrayContaining(['Cut', 'Copy', 'Paste']))
  })

  /**
   * The application menu with About, Hide and Quit in it is a macOS shape.
   * Linux and Windows put those elsewhere, and a menu called MarkPad sitting
   * inside a MarkPad window is the sort of thing that reads as a port.
   */
  it('only gives macOS the application menu', async () => {
    await installMenus([command({ id: 'file.new', title: 'New file', category: 'File' })], 'linux')
    expect(submenu('MarkPad').items).toBeUndefined()

    await installMenus([command({ id: 'file.new', title: 'New file', category: 'File' })], 'macos')
    expect(predefinedIn('MarkPad')).toEqual(expect.arrayContaining(['Quit', 'Hide']))
  })

  it('still builds an Edit menu when no command lives in it', async () => {
    await installMenus([command({ id: 'file.new', title: 'New file', category: 'File' })], 'windows')

    expect(predefinedIn('Edit')).toEqual(expect.arrayContaining(['Cut', 'Copy', 'Paste']))
  })

  it('keeps the commands in the Edit menu below the clipboard items', async () => {
    await installMenus([command({ id: 'edit.lineEndings', title: 'Change line endings' })], 'windows')

    const items = (submenu('Edit').items ?? []) as Array<{ kind?: string }>
    const kinds = items.map((item) => item.kind)
    const lastClipboard = kinds.lastIndexOf('predefined')
    const firstCommand = items.findIndex((item) => item.kind === 'item')

    expect(labelsIn('Edit')).toEqual(['Change line endings'])
    expect(lastClipboard).toBeLessThan(firstCommand)
  })

  /**
   * Undo and select all are the editor's, not the menu's. A native item would
   * take the key and hand it to something that knows nothing about the
   * document's history.
   */
  it('leaves undo and select all alone', async () => {
    await installMenus([command({ id: 'edit.lineEndings', title: 'Change line endings' })], 'windows')

    expect(predefinedIn('Edit')).not.toContain('Undo')
    expect(predefinedIn('Edit')).not.toContain('SelectAll')
  })
})

/**
 * Every keyboard shortcut the operating system registers goes through one
 * translation from our notation into Tauri's, and nothing had ever checked it.
 * An accelerator that does not parse is dropped, and the menu item quietly
 * appears with no shortcut next to it on every platform at once.
 */
describe('menu accelerators', () => {
  beforeEach(() => native.reset())

  const save = command({
    id: 'file.save',
    title: 'Save',
    category: 'File',
    key: 'Mod+S',
  })

  it('turns Mod into the notation Tauri wants', async () => {
    await installMenus([save], 'windows')
    expect(acceleratorFor('File', 'Save')).toBe('CmdOrCtrl+S')

    await installMenus([save], 'macos')
    expect(acceleratorFor('File', 'Save')).toBe('CmdOrCtrl+S')

    await installMenus([save], 'linux')
    expect(acceleratorFor('File', 'Save')).toBe('CmdOrCtrl+S')
  })

  it('keeps the other modifiers where they were', async () => {
    const saveAs = command({
      id: 'file.saveAs',
      title: 'Save as',
      category: 'File',
      key: 'Mod+Shift+S',
    })

    await installMenus([saveAs], 'windows')
    expect(acceleratorFor('File', 'Save as')).toBe('CmdOrCtrl+Shift+S')
  })

  it('uses the override on Windows and Linux and the plain key on macOS', async () => {
    const palette = command({
      id: 'view.palette',
      title: 'Show all commands',
      category: 'View',
      key: 'Mod+K',
      windowsStyleKey: 'Mod+Shift+P',
    })

    await installMenus([palette], 'macos')
    expect(acceleratorFor('View', 'Show all commands')).toBe('CmdOrCtrl+K')

    await installMenus([palette], 'windows')
    expect(acceleratorFor('View', 'Show all commands')).toBe('CmdOrCtrl+Shift+P')

    await installMenus([palette], 'linux')
    expect(acceleratorFor('View', 'Show all commands')).toBe('CmdOrCtrl+Shift+P')
  })

  it('gives a command with no shortcut no accelerator at all', async () => {
    const about = command({ id: 'help.about', title: 'About MarkPad', category: 'Help' })

    await installMenus([about], 'windows')

    expect(acceleratorFor('Help', 'About MarkPad')).toBeNull()
  })
})
