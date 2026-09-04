import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { formatShortcut } from '../commands/keys.js'
import {
  CATEGORY_ORDER,
  shortcutFor,
  type Command,
  type CommandCategory,
} from '../commands/types.js'
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
    const inCategory = commands.filter(
      (command) => command.category === category && !belongsToTheAppMenu(command, platform),
    )
    const native = await nativeItems(category)
    if (inCategory.length === 0 && native.length === 0) continue

    const items = await Promise.all(
      inCategory.map((command) => buildItem(command, platform, live)),
    )

    submenus.push(
      await Submenu.new({
        text: category,
        items:
          native.length > 0 && items.length > 0
            ? [...native, await PredefinedMenuItem.new({ item: 'Separator' }), ...items]
            : [...native, ...items],
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
          // Ours rather than the predefined one. The predefined Quit quits,
          // and this app has unsaved work to ask about first.
          ...(await appMenuItems(commands, platform, live)),
        ],
      }),
    )
  }

  const menu = await Menu.new({ items: submenus })
  await menu.setAsAppMenu()

  return refresher(live)
}

/**
 * The items the operating system owns rather than we do.
 *
 * Cut, copy and paste are not MarkPad commands and cannot be: nothing running
 * in the page can reach the system clipboard, so the webview only does them
 * when the menu it is under says it can. Setting an app menu replaces the
 * default one, and the default one is where these lived, which is how the
 * editor ended up with a Ctrl+C that did nothing.
 *
 * Undo, redo and select all are deliberately not here even though they are
 * predefined too. The editor binds all three and keeps its own history; a
 * native item would take the key and hand it to something that has never
 * heard of the document.
 */
async function nativeItems(category: CommandCategory): Promise<PredefinedMenuItem[]> {
  if (category !== 'Edit') return []

  return Promise.all(
    (['Cut', 'Copy', 'Paste'] as const).map((item) => PredefinedMenuItem.new({ item })),
  )
}

/**
 * Commands macOS expects in the application menu rather than where their
 * category would otherwise put them.
 *
 * Quit is the whole list. It is a File command everywhere else, and on macOS
 * a File menu with a Quit in it is one of those small things that makes an app
 * feel like it came from somewhere else.
 */
const APP_MENU_COMMANDS = new Set(['file.quit'])

function belongsToTheAppMenu(command: Command, platform: Platform): boolean {
  return platform === 'macos' && APP_MENU_COMMANDS.has(command.id)
}

/** Those same commands, built, for the menu they were held back for. */
async function appMenuItems(
  commands: readonly Command[],
  platform: Platform,
  live: Live[],
): Promise<MenuItem[]> {
  const wanted = commands.filter((command) => APP_MENU_COMMANDS.has(command.id))
  return Promise.all(wanted.map((command) => buildItem(command, platform, live)))
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
