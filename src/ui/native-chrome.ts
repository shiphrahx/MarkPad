import { currentTheme, onThemeChange } from './theme.js'

/**
 * Keep the parts of the window we do not draw in step with the parts we do.
 *
 * Two separate things, and they were not both being done. The caption colours
 * are ours to pick and come from the tokens. The window's theme is the
 * operating system's business, and it is what everything native reads: the
 * menu bar, the scrollbars, the context menus, the system dialogs. Setting
 * only the first is how you end up with a light app wearing a dark menu bar.
 *
 * The design tokens stay the only place that knows what the chrome grey is,
 * so the caption values are read back off the stylesheet rather than written
 * down a second time here.
 */
export function applyNativeChrome(): void {
  void push()
  onThemeChange(() => void push())
}

async function push(): Promise<void> {
  // Theme first. It repaints the caption to the system's idea of light or
  // dark, so our own colours have to go on top of it rather than under it.
  await pushWindowTheme()
  await pushCaptionColours()
}

/**
 * What the native furniture follows.
 *
 * `system` is the absence of a preference rather than a third value, so it
 * goes over as null and the window tracks the OS on its own.
 */
async function pushWindowTheme(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')

    const theme = currentTheme()
    await getCurrentWindow().setTheme(theme === 'system' ? null : theme)
  } catch {
    // Same reasoning as the colours below: worth trying, not worth failing
    // a launch over.
  }
}

async function pushCaptionColours(): Promise<void> {
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
