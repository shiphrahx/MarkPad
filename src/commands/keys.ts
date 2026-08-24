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
    return parts.map((part) => MAC_SYMBOLS[part] ?? capitalise(part)).join('')
  }

  return parts.map((part) => WINDOWS_NAMES[part] ?? capitalise(part)).join('+')
}

/** Does this keyboard event match the shortcut? */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
  platform: Platform,
): boolean {
  const parts = shortcut.split('+').map((part) => part.trim().toLowerCase())
  const key = parts[parts.length - 1]
  if (key === undefined) return false

  const wanted = new Set(parts.slice(0, -1))
  const wantsMod = wanted.has('mod')

  const modPressed = platform === 'macos' ? event.metaKey : event.ctrlKey
  // The modifier that Mod did not claim must be up, or Ctrl+K on a Mac would
  // fire a command that asked for Command+K.
  const otherMod = platform === 'macos' ? event.ctrlKey : event.metaKey

  if (wantsMod !== modPressed) return false
  if (!wanted.has(platform === 'macos' ? 'ctrl' : 'cmd') && otherMod) return false
  if (wanted.has('shift') !== event.shiftKey) return false
  if (wanted.has('alt') !== event.altKey) return false

  return event.key.toLowerCase() === key
}

function capitalise(text: string): string {
  return text.length <= 1 ? text.toUpperCase() : text[0]!.toUpperCase() + text.slice(1)
}
