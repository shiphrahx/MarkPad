import type { Platform } from '../host/types.js'

/**
 * One thing MarkPad can do.
 *
 * Every command lives here first. The palette lists them, the menus are built
 * from them and the keyboard shortcuts are declared on them, so there is one
 * place where a new feature becomes visible to the user rather than three
 * places to remember to update.
 */
export interface Command {
  readonly id: string
  readonly title: string
  /** Groups the palette and the menu bar. */
  readonly category: CommandCategory
  /**
   * Shortcut in the neutral notation: `Mod` means Command on macOS and Ctrl
   * everywhere else. Overrides go in `windowsStyleKey` where the conventions
   * genuinely differ.
   */
  readonly key?: string
  /**
   * The shortcut on Windows and Linux, where the two follow the same habits
   * and both differ from macOS. Named for the convention rather than for one
   * of the platforms that keeps it, because it is used by both.
   */
  readonly windowsStyleKey?: string
  /**
   * Shortcuts that also fire the command but are never drawn.
   *
   * One key produces different characters depending on what else is held, and
   * people press whichever of them means the thing they want. Ctrl+= and
   * Ctrl+Shift+= are the same gesture to anyone zooming in, so both fire, and
   * the palette shows the one worth teaching.
   */
  readonly extraKeys?: readonly string[]
  /** Whether the command can run right now. Absent means always. */
  readonly enabled?: () => boolean
  readonly run: () => void | Promise<void>
}

export type CommandCategory = 'File' | 'Edit' | 'Format' | 'View' | 'Go' | 'Help'

export const CATEGORY_ORDER: readonly CommandCategory[] = [
  'File',
  'Edit',
  'Format',
  'View',
  'Go',
  'Help',
]

export function shortcutFor(command: Command, platform: Platform): string | null {
  const raw = platform === 'macos' ? command.key : command.windowsStyleKey ?? command.key
  return raw ?? null
}
