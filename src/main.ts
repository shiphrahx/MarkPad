import './app.css'
import { App } from './app/app.js'
import { TauriHost } from './host/tauri.js'
import { resetDiagramTheme } from './preview/draw.js'
import { apply as applyTheme, onThemeChange, watchSystemTheme } from './ui/theme.js'
import { applyZoom, onZoomChange } from './ui/zoom.js'
import { installMenus } from './ui/menus.js'
import { applyNativeChrome } from './ui/native-chrome.js'
import { DOCUMENT_CSS } from './preview/document-css.js'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('MarkPad could not find its root element.')

// Before anything is drawn, so the window never flashes the wrong colours on
// the way to the right ones, or the wrong size on the way to the right one.
applyTheme()
applyZoom()

// The preview pane and the popovers both render Markdown, so the document
// styles have to exist in the app as well as inside an exported file.
const documentStyles = document.createElement('style')
documentStyles.textContent = DOCUMENT_CSS
document.head.appendChild(documentStyles)

const host = new TauriHost()

// The traffic lights sit over the window on macOS, so the tab strip starts
// clear of them. Windows draws its caption buttons on the right, where there
// is nothing to move.
if (host.platform === 'macos') {
  document.documentElement.style.setProperty('--chrome-inset', '78px')
}
const app = new App(host, root)

// Everything below is either optional or slow, so none of it stands between
// launching and being able to type. The cold start budget is 400 ms.
void start()

async function start(): Promise<void> {
  applyNativeChrome()
  await Promise.allSettled([openStartupFiles(), followCommandState()])
  listenForDroppedFiles()
  followSystemTheme()
}

/**
 * The menu bar, and the wiring that stops it going stale.
 *
 * Half the commands can only run some of the time, and the bar is built once
 * where the palette is rebuilt on every open. Without these three the menu
 * shows whatever was true a moment after launch for the rest of the session:
 * Save greyed out on a file you have since opened, Theme: Light greyed out
 * after you switched to dark.
 */
async function followCommandState(): Promise<void> {
  const refresh = await installMenus(app.commands, host.platform)

  app.onStateChange(refresh)
  onThemeChange(refresh)
  onZoomChange(refresh)
}

/**
 * Last time's tabs, plus whatever was double-clicked to get here.
 *
 * Both, rather than one or the other: opening a file should add to what you
 * had, not replace it.
 */
async function openStartupFiles(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  const paths = await invoke<string[]>('startup_files')
  await app.start(paths)
}

/**
 * Files dragged onto the window.
 *
 * Tauri reports the drop on the window rather than through a DOM event,
 * because the WebView never sees a file that came from the desktop.
 */
function listenForDroppedFiles(): void {
  void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== 'drop') return

      const markdown = event.payload.paths.filter(looksLikeText)
      if (markdown.length > 0) void app.openFiles(markdown)
    })
  })
}

function looksLikeText(path: string): boolean {
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(path)
}

/**
 * Mermaid picks its colours when it first initialises, so a diagram drawn
 * before the theme changed would keep the old ones.
 */
function followSystemTheme(): void {
  watchSystemTheme()
  onThemeChange(() => resetDiagramTheme())
}
