import { onThemeChange } from './theme.js'

/**
 * Tell the window what colour to paint its own title bar.
 *
 * The design tokens are the only place that knows what the chrome grey is, so
 * the values are read back off the stylesheet rather than written down a
 * second time here. Change tokens.css and the caption follows.
 *
 * Windows only in effect. macOS already tracks the system appearance, which is
 * what the mockup shows there, and the command is a no-op on that side.
 */
export function applyNativeChrome(): void {
  void push()
  onThemeChange(() => void push())
}

async function push(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')

    await invoke('set_caption_colors', {
      background: readToken('--chrome'),
      text: readToken('--muted'),
      border: readToken('--rule'),
    })
  } catch {
    // Windows 10 has no caption colour attribute, and the whole thing is
    // decoration. A grey title bar is not worth an error on startup.
  }
}

/** Read a token and turn it into the bytes the Rust side wants. */
function readToken(name: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return parseColour(value)
}

export function parseColour(value: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())

  if (hex) {
    const digits = hex[1]!
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits

    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ]
  }

  const parts = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (parts) {
    const numbers = parts[1]!
      .split(/[\s,/]+/)
      .filter((part) => part !== '')
      .map(Number)

    return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0]
  }

  // Nothing sensible in the token. Mid grey is a better answer than throwing
  // during startup over the colour of a title bar.
  return [128, 128, 128]
}
