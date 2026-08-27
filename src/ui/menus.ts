import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
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

/** One item, and what we last told the operating system about it. */
interface Live {
  readonly command: Command
  readonly item: MenuItem
  enabled: boolean
}

/**
 * Builds the bar and hands back the function that keeps it honest.
 *
 * The palette asks every command whether it can run each time it opens, so it
 * is never wrong. A menu bar is built once and then sits there for the life of
 * the window, which means whatever was true at startup stays on screen until
 * something says otherwise. Call the returned function when it might have
 * changed.
 */
export async function installMenus(
  commands: readonly Command[],
  platform: Platform,
): Promise<() => void> {
  const live: Live[] = []
  const submenus: Submenu[] = []

  for (const category of CATEGORY_ORDER) {
    const inCategory = commands.filter((command) => command.category === category)
    if (inCategory.length === 0) continue

    const items = await Promise.all(
      inCategory.map((command) => buildItem(command, platform, live)),
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
    // Asked for rather than written down. There are already four files that
    // have to agree on the version number and this does not need to be a
    // fifth, quietly telling people they are on an older build than they are.
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()

    submenus.unshift(
      await Submenu.new({
        text: 'MarkPad',
        items: [
          await PredefinedMenuItem.new({
            item: { About: { name: 'MarkPad', version } },
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

  return refresher(live)
}

async function buildItem(
  command: Command,
  platform: Platform,
  live: Live[],
): Promise<MenuItem> {
  const shortcut = shortcutFor(command, platform)
  const enabled = isEnabled(command)

  const item = await MenuItem.new({
    id: command.id,
    text: command.title,
    // Tauri wants the accelerator in its own notation, which is the neutral
    // one we already write. formatShortcut is only for what the user reads.
    ...(shortcut ? { accelerator: toAccelerator(shortcut) } : {}),
    enabled,
    // Asked again here rather than trusting the greying. The item's state is
    // only ever as fresh as the last refresh, and a command that runs when it
    // said it could not is a worse bug than one that looks available.
    action: () => {
      if (!isEnabled(command)) return
      void command.run()
    },
  })

  live.push({ command, item, enabled })
  return item
}

/**
 * Push whatever changed since last time, and nothing else.
 *
 * This runs off every caret move, so it does the cheap thing first: eighteen
 * predicates in JavaScript, then a call across the boundary only for the items
 * whose answer actually flipped. Coalesced to once a microtask, because a
 * redraw can touch it several times in a row.
 */
function refresher(live: readonly Live[]): () => void {
  let queued = false

  return () => {
    if (queued) return
    queued = true

    queueMicrotask(() => {
      queued = false

      for (const entry of live) {
        const now = isEnabled(entry.command)
        if (now === entry.enabled) continue

        entry.enabled = now
        void entry.item.setEnabled(now)
      }
    })
  }
}

function isEnabled(command: Command): boolean {
  return command.enabled ? command.enabled() : true
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
