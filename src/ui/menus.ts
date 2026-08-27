import { Menu, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { formatShortcut } from '../commands/keys.js'
import { CATEGORY_ORDER, shortcutFor, type Command } from '../commands/types.js'
import type { Platform } from '../host/types.js'

/**
 * The native menu bar, built from the same command list the palette shows.
 *
 * Menus second, as the rules put it: nothing appears here that is not already
 * a command, so the two can never drift apart.
 *
 * Built from TypeScript rather than declared in Rust for the same reason. A
 * menu defined on the other side of the boundary would be a second copy of
 * every label and every shortcut.
 */
export async function installMenus(
  commands: readonly Command[],
  platform: Platform,
): Promise<void> {
  const submenus: Submenu[] = []

  for (const category of CATEGORY_ORDER) {
    const inCategory = commands.filter((command) => command.category === category)
    if (inCategory.length === 0) continue

    const items = await Promise.all(
      inCategory.map((command) =>
        buildItem(command, platform),
      ),
    )

    submenus.push(
      await Submenu.new({
        text: category,
        items,
      }),
    )
  }

  // macOS wants the application menu first, with the standard items in it.
  // Without this there is no Quit, no Hide and no About, and the app looks
  // broken in a way that is entirely about the menu bar.
  if (platform === 'macos') {
    submenus.unshift(
      await Submenu.new({
        text: 'MarkPad',
        items: [
          await PredefinedMenuItem.new({
            item: { About: { name: 'MarkPad', version: '0.1.0' } },
          }),
          await PredefinedMenuItem.new({ item: 'Separator' }),
          await PredefinedMenuItem.new({ item: 'Services' }),
          await PredefinedMenuItem.new({ item: 'Separator' }),
          await PredefinedMenuItem.new({ item: 'Hide' }),
          await PredefinedMenuItem.new({ item: 'HideOthers' }),
          await PredefinedMenuItem.new({ item: 'ShowAll' }),
          await PredefinedMenuItem.new({ item: 'Separator' }),
          await PredefinedMenuItem.new({ item: 'Quit' }),
        ],
      }),
    )
  }

  const menu = await Menu.new({ items: submenus })
  await menu.setAsAppMenu()
}

async function buildItem(command: Command, platform: Platform) {
  const shortcut = shortcutFor(command, platform)

  return {
    id: command.id,
    text: command.title,
    // Tauri wants the accelerator in its own notation, which is the neutral
    // one we already write. formatShortcut is only for what the user reads.
    accelerator: shortcut ? toAccelerator(shortcut) : undefined,
    enabled: command.enabled ? command.enabled() : true,
    action: () => void command.run(),
  }
}

/** `Mod+Shift+S` becomes `CmdOrCtrl+Shift+S`, which is what Tauri expects. */
function toAccelerator(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => (part.toLowerCase() === 'mod' ? 'CmdOrCtrl' : part))
    .join('+')
}

/** Only used in tests and for the tooltip text. */
export const drawShortcut = formatShortcut
