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
   * Shortcut in the neutral notation: `Mod` means Command on macOS and Ctrl on
   * Windows. Per-platform overrides go in `windowsKey` where the two
   * conventions genuinely differ.
   */
  readonly key?: string
  readonly windowsKey?: string
  /** Whether the command can run right now. Absent means always. */
  readonly enabled?: () => boolean
  readonly run: () => void | Promise<void>
}

export type CommandCategory = 'File' | 'Edit' | 'View' | 'Go' | 'Help'

export const CATEGORY_ORDER: readonly CommandCategory[] = [
  'File',
  'Edit',
  'View',
  'Go',
  'Help',
]

export function shortcutFor(command: Command, platform: Platform): string | null {
  const raw = platform === 'windows' ? command.windowsKey ?? command.key : command.key
  return raw ?? null
}
