/**
 * Light, dark, or whatever the operating system is doing.
 *
 * System stays the default, because an editor that ignores the machine it is
 * running on is the sort of thing you notice at night. The other two exist
 * because the OS is sometimes wrong about what you want right now.
 *
 * The choice is a single string in localStorage. It is a preference about how
 * the window looks, not data, so there is no file for it and nothing breaks if
 * it goes missing.
 */

export type Theme = 'system' | 'light' | 'dark'

export const THEMES: readonly Theme[] = ['system', 'light', 'dark']

const STORAGE_KEY = 'markpad.theme'

type Listener = (theme: Theme, dark: boolean) => void

const listeners = new Set<Listener>()
let current: Theme = load()

function load(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : 'system'
  } catch {
    // Private mode, a locked-down profile, or a WebView with storage disabled.
    // A theme is not worth failing to start over.
    return 'system'
  }
}

function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function currentTheme(): Theme {
  return current
}

/** What the window is actually showing, once system has been resolved. */
export function isDark(): boolean {
  if (current === 'dark') return true
  if (current === 'light') return false
  return systemPrefersDark()
}

function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function setTheme(theme: Theme): void {
  current = theme

  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Same as above: it just will not be remembered next time.
  }

  apply()
}

/**
 * Put the choice on the root element, where the stylesheets read it.
 *
 * `system` removes the attribute rather than writing a value, so the media
 * query is left to decide and there is one code path for it rather than two.
 */
export function apply(): void {
  const root = document.documentElement

  if (current === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', current)

  // Tells the browser which way round form controls, scrollbars and the
  // default canvas should go. Without it a dark window keeps a white scrollbar.
  root.style.colorScheme = current === 'system' ? 'light dark' : current

  const dark = isDark()
  for (const listener of listeners) listener(current, dark)
}

/**
 * Called when the theme changes, including when the OS switches under a
 * `system` setting.
 */
export function onThemeChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Start following the OS. Call once at startup. */
export function watchSystemTheme(): void {
  if (typeof matchMedia !== 'function') return

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    // Only matters while following the system, but firing regardless keeps
    // listeners from having to work out whether it was relevant.
    if (current === 'system') apply()
  })
}

export function themeLabel(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'system':
      return 'Match the system'
  }
}
