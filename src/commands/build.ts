import type { App } from '../app/app.js'
import { isDirty } from '../app/buffer.js'
import { exportHtml, exportPdf } from '../export/export.js'
import { currentTheme, setTheme, THEMES, themeLabel } from '../ui/theme.js'
import {
  canZoomIn,
  canZoomOut,
  currentZoom,
  DEFAULT_ZOOM,
  resetZoom,
  zoomIn,
  zoomLabel,
  zoomOut,
} from '../ui/zoom.js'
import { FORMAT_ACTIONS } from '../wysiwyg/format.js'
import type { Command } from './types.js'

/**
 * Every command MarkPad has.
 *
 * One list. The palette shows it, the menus are built from it, the keyboard
 * handler reads the shortcuts off it. Adding a feature means adding a line
 * here, and then it is reachable three ways at once.
 */
export function buildCommands(app: App): Command[] {
  const active = () => app.workspace.active
  const hasFile = () => active() !== null

  return [
    {
      id: 'file.new',
      title: 'New file',
      category: 'File',
      key: 'Mod+N',
      run: () => app.newFile(),
    },
    {
      id: 'file.open',
      title: 'Open…',
      category: 'File',
      key: 'Mod+O',
      run: () => app.openWithDialog(),
    },
    {
      id: 'file.save',
      title: 'Save',
      category: 'File',
      key: 'Mod+S',
      enabled: hasFile,
      run: async () => {
        const buffer = active()
        if (buffer) await app.save(buffer.id)
      },
    },
    {
      id: 'file.saveAs',
      title: 'Save as…',
      category: 'File',
      key: 'Mod+Shift+S',
      enabled: hasFile,
      run: async () => {
        const buffer = active()
        if (buffer) await app.saveAs(buffer.id)
      },
    },
    {
      id: 'file.close',
      title: 'Close tab',
      category: 'File',
      key: 'Mod+W',
      enabled: hasFile,
      run: async () => {
        const buffer = active()
        if (buffer) await app.closeTab(buffer.id)
      },
    },
    {
      id: 'file.exportHtml',
      title: 'Export as HTML…',
      category: 'File',
      enabled: hasFile,
      run: async () => {
        const buffer = active()
        if (buffer) await exportHtml(buffer, app.host)
      },
    },
    {
      id: 'file.exportPdf',
      title: 'Export as PDF…',
      category: 'File',
      key: 'Mod+P',
      enabled: hasFile,
      run: async () => {
        const buffer = active()
        if (buffer) await exportPdf(buffer)
      },
    },
    {
      id: 'edit.lineEndings',
      title: 'Change line endings',
      category: 'Edit',
      enabled: hasFile,
      run: () => {
        const buffer = active()
        if (!buffer) return
        app.workspace.setLineEnding(buffer.id, buffer.lineEnding === 'lf' ? 'crlf' : 'lf')
      },
    },
    {
      id: 'edit.byteOrderMark',
      title: 'Add or remove the byte order mark',
      category: 'Edit',
      enabled: hasFile,
      run: () => {
        const buffer = active()
        if (!buffer) return
        app.workspace.setEncoding(
          buffer.id,
          buffer.encoding === 'utf-8' ? 'utf-8-bom' : 'utf-8',
        )
      },
    },
    {
      id: 'view.palette',
      title: 'Show all commands',
      category: 'View',
      key: 'Mod+K',
      windowsKey: 'Mod+K',
      run: () => app.openPalette(),
    },
    // Formatting. These were reachable by shortcut and by typing Markdown
    // long before they were reachable by looking, which is no use at all in a
    // surface whose point is not having to know the Markdown.
    ...FORMAT_ACTIONS.map((action) => ({
      id: `format.${action.id}`,
      title: action.title,
      category: 'Format' as const,
      ...(action.key === undefined ? {} : { key: action.key }),
      enabled: () => app.canFormat(action.command),
      run: () => app.format(action.command),
    })),
    {
      id: 'format.link',
      title: 'Link…',
      category: 'Format',
      key: 'Mod+Shift+K',
      enabled: () => app.currentMode === 'reader' && hasFile(),
      run: () => app.addLink(),
    },
    {
      id: 'view.source',
      title: 'Toggle Markdown source',
      category: 'View',
      key: 'Mod+Shift+M',
      enabled: hasFile,
      run: () => app.toggleSource(),
    },
    {
      id: 'view.preview',
      title: 'Toggle the preview pane',
      category: 'View',
      key: 'Mod+Shift+V',
      enabled: hasFile,
      run: () => app.togglePreview(),
    },
    // Bigger and smaller text, which is what zoom means here: the chrome is
    // drawn at native metrics and stays there. Ctrl+= is the shortcut anyone
    // reaches for, and Ctrl+Shift+= and the numpad key are the same gesture,
    // so they fire it too without cluttering the palette.
    {
      id: 'view.zoomIn',
      title: 'Zoom in',
      category: 'View',
      key: 'Mod+=',
      extraKeys: ['Mod+Shift+Plus', 'Mod+Plus'],
      enabled: canZoomIn,
      run: () => zoomIn(),
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom out',
      category: 'View',
      key: 'Mod+Minus',
      enabled: canZoomOut,
      run: () => zoomOut(),
    },
    {
      id: 'view.zoomReset',
      // Says where it puts you, and the palette greys it out when you are
      // already there, so the level is discoverable without a readout.
      title: `Actual size (${zoomLabel(DEFAULT_ZOOM)})`,
      category: 'View',
      key: 'Mod+0',
      enabled: () => currentZoom() !== DEFAULT_ZOOM,
      run: () => resetZoom(),
    },
    // One command per theme rather than one that cycles. A cycle makes you
    // press it twice to find out where you are; these say what they do and the
    // palette greys out the one you are already on.
    ...THEMES.map((theme) => ({
      id: `view.theme.${theme}`,
      title: `Theme: ${themeLabel(theme)}`,
      category: 'View' as const,
      enabled: () => currentTheme() !== theme,
      run: () => setTheme(theme),
    })),
    {
      id: 'go.nextTab',
      title: 'Next tab',
      category: 'Go',
      key: 'Mod+Alt+ArrowRight',
      // Ctrl+Tab is the Windows habit, and the browser engine underneath does
      // not hand it over reliably, so this stays on the arrow keys on both.
      enabled: () => app.workspace.tabs.length > 1,
      run: () => app.focusRelative(1),
    },
    {
      id: 'go.previousTab',
      title: 'Previous tab',
      category: 'Go',
      key: 'Mod+Alt+ArrowLeft',
      enabled: () => app.workspace.tabs.length > 1,
      run: () => app.focusRelative(-1),
    },
    {
      id: 'go.editor',
      title: 'Back to the editor',
      category: 'Go',
      key: 'Escape',
      run: () => app.focusEditor(),
    },
    {
      id: 'file.saveAll',
      title: 'Save all',
      category: 'File',
      enabled: () => app.workspace.hasUnsavedChanges,
      run: async () => {
        for (const buffer of app.workspace.tabs) {
          if (isDirty(buffer)) await app.save(buffer.id)
        }
      },
    },
  ]
}
