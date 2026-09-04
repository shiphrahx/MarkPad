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
    new: async (options: { text: string }) => ({
      kind: 'item',
      text: options.text,
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
