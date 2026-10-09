/**
 * Two preferences about how writing feels: focus mode and spell check.
 *
 * Both are switches on the root element rather than state in the editor, so
 * they reach every surface at once and the CSS and the browser do the work.
 * Like the theme and the zoom they are preferences rather than data, so they
 * live in localStorage and nothing breaks if it goes missing.
 */

const FOCUS_KEY = 'markpad.focus'
const SPELLING_KEY = 'markpad.spellcheck'

type Listener = () => void
const listeners = new Set<Listener>()

let focus = read(FOCUS_KEY) === 'on'
let spelling = read(SPELLING_KEY) !== 'off'

/**
 * Focus mode hides the tabs, the rail and the status bar, and dims every
 * block except the one being written in. Off by default.
 */
export function focusMode(): boolean {
  return focus
}

export function setFocusMode(on: boolean): void {
  focus = on
  write(FOCUS_KEY, on ? 'on' : null)
  apply()
}

/**
 * The webview's own spell checker, in the rendered surface. On by default,
 * which is what a contenteditable does anyway. The source view never checks:
 * underlining every `**` and URL in Markdown is noise rather than help.
 */
export function spellCheck(): boolean {
  return spelling
}

export function setSpellCheck(on: boolean): void {
  spelling = on
  write(SPELLING_KEY, on ? null : 'off')
  apply()
}

/** Put both preferences on the page. Called at launch and after a change. */
export function apply(root: HTMLElement = document.documentElement): void {
  root.toggleAttribute('data-focus', focus)
  // Inherited by everything without its own setting, which includes the
  // reader. CodeMirror sets its own, so the source view stays unchecked.
  if (!spelling) root.setAttribute('spellcheck', 'false')
  else root.removeAttribute('spellcheck')
  for (const listener of listeners) listener()
}

export function onWritingChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Then the change lasts until the window closes, which is still a change.
  }
}
