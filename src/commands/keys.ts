import type { Platform } from '../host/types.js'

/**
 * Shortcuts, written once and drawn differently per platform.
 *
 * `Mod` is Command on macOS and Ctrl on Windows, which covers almost every
 * shortcut. Where the two platforms genuinely disagree, a command declares
 * `windowsKey` and says so explicitly rather than relying on a translation
 * that would be wrong.
 */

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  cmd: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  enter: '↩',
  escape: '⎋',
  backspace: '⌫',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
}

const WINDOWS_NAMES: Record<string, string> = {
  mod: 'Ctrl',
  cmd: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
}

/**
 * Draw a shortcut the way the platform writes it.
 *
 * macOS runs the symbols together with no separator, Windows joins the names
 * with a plus. Getting this wrong is one of the first things that makes an app
 * feel like it was ported.
 */
export function formatShortcut(shortcut: string, platform: Platform): string {
  const parts = shortcut.split('+').map((part) => part.trim().toLowerCase())

  if (platform === 'macos') {
    return parts.map((part) => MAC_SYMBOLS[part] ?? draw(part)).join('')
  }

  return parts.map((part) => WINDOWS_NAMES[part] ?? draw(part)).join('+')
}

/**
 * Keys that cannot be written as themselves.
 *
 * A shortcut is split on `+`, so a shortcut whose key *is* `+` has to be
 * spelled. The rest are here for company, because `Mod+Minus` reads better
 * than `Mod+-` in a list of commands.
 */
const KEY_ALIASES: Record<string, string> = {
  plus: '+',
  minus: '-',
  equals: '=',
  space: ' ',
}

/**
 * A shortcut, taken apart once.
 *
 * The keyboard handler runs on every keystroke against every command, so
 * splitting strings in there would mean a few dozen allocations per letter
 * typed. The typing budget says a 5 MB file should feel like an empty one, and
 * that is not the place to be casual about constant work.
 */
export interface ParsedShortcut {
  readonly key: string
  readonly mod: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly otherMod: boolean
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  const parts = shortcut.split('+').map((part) => part.trim().toLowerCase())
  const last = parts[parts.length - 1]
  if (last === undefined) return null
  const key = KEY_ALIASES[last] ?? last

  const wanted = new Set(parts.slice(0, -1))

  return {
    key,
    mod: wanted.has('mod'),
    shift: wanted.has('shift'),
    alt: wanted.has('alt'),
    // Ctrl on macOS, or the Windows key on Windows: the modifier Mod did not
    // claim. Named once here so the matcher does not have to think about it.
    otherMod: wanted.has('ctrl') || wanted.has('cmd'),
  }
}

export function matchesParsed(
  event: KeyboardEvent,
  shortcut: ParsedShortcut,
  platform: Platform,
): boolean {
  const modPressed = platform === 'macos' ? event.metaKey : event.ctrlKey
  // The modifier Mod did not claim must be up, or Ctrl+K on a Mac would fire a
  // command that asked for Command+K.
  const otherPressed = platform === 'macos' ? event.ctrlKey : event.metaKey

  if (shortcut.mod !== modPressed) return false
  if (shortcut.otherMod !== otherPressed) return false
  if (shortcut.shift !== event.shiftKey) return false
  if (shortcut.alt !== event.altKey) return false

  return event.key.toLowerCase() === shortcut.key
}

/** Does this keyboard event match the shortcut? Parses as it goes. */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
  platform: Platform,
): boolean {
  const parsed = parseShortcut(shortcut)
  return parsed !== null && matchesParsed(event, parsed, platform)
}

/** A key as the user sees it printed on the keyboard. */
function draw(part: string): string {
  return KEY_ALIASES[part] ?? capitalise(part)
}

function capitalise(text: string): string {
  return text.length <= 1 ? text.toUpperCase() : text[0]!.toUpperCase() + text.slice(1)
}
