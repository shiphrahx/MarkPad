import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markpadExtensions } from '../editor/setup.js'
import { previewPopovers } from '../preview/popover.js'
import type { Host } from '../host/types.js'
import { el } from '../ui/dom.js'
import { TabStrip } from '../ui/tabs.js'
import { StatusBar } from '../ui/statusbar.js'
import { OutlineRail } from '../ui/outline-rail.js'
import { CommandPalette } from '../ui/palette.js'
import { PreviewPane } from '../ui/preview-pane.js'
import { askAboutUnsavedChanges } from '../ui/unsaved-dialog.js'
import { matchesShortcut } from '../commands/keys.js'
import { shortcutFor, type Command } from '../commands/types.js'
import { isDirty, title as titleOf, type Buffer } from './buffer.js'
import { extractHeadings } from './outline.js'
import { Workspace } from './workspace.js'
import { buildCommands } from '../commands/build.js'

/**
 * The app: the workspace, the editor and the chrome, wired together.
 *
 * Everything interesting happens somewhere else. This file is the part that
 * knows what talks to what.
 */
export class App {
  readonly workspace: Workspace
  readonly commands: readonly Command[]

  private readonly view: EditorView
  private readonly tabs: TabStrip
  private readonly status: StatusBar
  private readonly rail: OutlineRail
  private readonly palette: CommandPalette
  private readonly preview: PreviewPane

  /**
   * One editor state per tab, so switching away and back keeps the undo
   * history, the selection and the scroll position. A single shared state
   * would quietly throw all three away every time you changed tab.
   */
  private readonly states = new Map<string, EditorState>()
  private currentId: string | null = null
  private applyingExternally = false

  constructor(
    readonly host: Host,
    root: HTMLElement,
  ) {
    this.workspace = new Workspace(host)

    this.tabs = new TabStrip({
      onFocus: (id) => this.workspace.focus(id),
      onClose: (id) => void this.closeTab(id),
      onNew: () => this.workspace.create(),
    })

    this.status = new StatusBar({
      onLineEndingChange: (lineEnding) => {
        const active = this.workspace.active
        if (active) this.workspace.setLineEnding(active.id, lineEnding)
      },
      onEncodingChange: (encoding) => {
        const active = this.workspace.active
        if (active) this.workspace.setEncoding(active.id, encoding)
      },
    })

    this.rail = new OutlineRail((offset) => this.goTo(offset))
    this.palette = new CommandPalette(host.platform)
    this.preview = new PreviewPane()

    const editorHolder = el('div', { class: 'editor' })
    const middle = el('div', { class: 'middle' })
    middle.append(this.rail.element, editorHolder, this.preview.element)

    root.append(this.tabs.element, middle, this.status.element, this.palette.element)

    this.view = new EditorView({
      parent: editorHolder,
      state: EditorState.create({ extensions: this.extensions() }),
    })

    this.commands = buildCommands(this)

    this.workspace.subscribe(() => this.render())
    document.addEventListener('keydown', (event) => this.onKeyDown(event), true)

    this.workspace.create()
  }

  private extensions() {
    return [
      ...markpadExtensions(),
      previewPopovers(),
      EditorView.updateListener.of((update) => {
        if (this.applyingExternally) return

        if (update.docChanged && this.currentId !== null) {
          this.workspace.setText(this.currentId, update.state.doc.toString())
          this.preview.update(update.state.doc.toString())
        }

        // The caret moving changes Ln/Col and which heading the rail marks,
        // and neither of those goes through the workspace.
        if (update.selectionSet && !update.docChanged) this.renderCaretParts()
      }),
    ]
  }

  // Chrome

  private render(): void {
    const active = this.workspace.active

    this.tabs.render(this.workspace.tabs, active?.id ?? null)
    this.syncEditor(active)
    this.renderCaretParts()

    for (const id of [...this.states.keys()]) {
      if (!this.workspace.tabs.some((buffer) => buffer.id === id)) this.states.delete(id)
    }

    document.title = active ? `${isDirty(active) ? '• ' : ''}${titleOf(active)}` : 'MarkPad'
  }

  private renderCaretParts(): void {
    const active = this.workspace.active
    if (!active) {
      this.status.render(null, null)
      this.rail.render([], 0)
      return
    }

    const head = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(head)

    this.status.render(active, { line: line.number, column: head - line.from + 1 })
    this.rail.render(extractHeadings(active.text), head)
  }

  /**
   * Put the right document in the editor.
   *
   * Text set from outside, by opening a file or by undoing a close, is applied
   * as a change rather than a fresh state, so it lands in the undo history
   * instead of wiping it.
   */
  private syncEditor(active: Buffer | null): void {
    if (active === null) {
      this.currentId = null
      return
    }

    if (active.id !== this.currentId) {
      if (this.currentId !== null) this.states.set(this.currentId, this.view.state)

      const existing = this.states.get(active.id)
      this.applyingExternally = true
      this.view.setState(
        existing ??
          EditorState.create({ doc: active.text, extensions: this.extensions() }),
      )
      this.applyingExternally = false

      this.currentId = active.id
      this.view.focus()
      this.preview.update(active.text, { immediately: true })
      return
    }

    if (this.view.state.doc.toString() !== active.text) {
      this.applyingExternally = true
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: active.text },
      })
      this.applyingExternally = false
    }
  }

  // Actions the commands call

  focusEditor(): void {
    this.view.focus()
  }

  openPalette(): void {
    this.palette.open(this.commands)
  }

  togglePreview(): void {
    this.preview.toggle(this.workspace.active?.text ?? '')
  }

  goTo(offset: number): void {
    this.view.dispatch({
      selection: EditorSelection.cursor(offset),
      scrollIntoView: true,
    })
    this.view.focus()
  }

  /** Save, telling the user plainly if the file could not be written. */
  async save(id: string): Promise<boolean> {
    try {
      return await this.workspace.save(id)
    } catch (error) {
      await this.host.report(describe(error))
      return false
    }
  }

  async saveAs(id: string): Promise<boolean> {
    try {
      return await this.workspace.saveAs(id)
    } catch (error) {
      await this.host.report(describe(error))
      return false
    }
  }

  async openFiles(paths: readonly string[]): Promise<void> {
    try {
      await this.workspace.open(paths)
    } catch (error) {
      await this.host.report(describe(error))
    }
  }

  async openWithDialog(): Promise<void> {
    try {
      await this.workspace.openWithDialog()
    } catch (error) {
      await this.host.report(describe(error))
    }
  }

  /**
   * Close a tab, asking about unsaved work first.
   *
   * Three answers, not two: save it, throw it away, or change your mind. A
   * plain yes or no would make cancelling impossible.
   */
  async closeTab(id: string): Promise<boolean> {
    const buffer = this.workspace.tabs.find((candidate) => candidate.id === id)
    if (!buffer) return false

    if (isDirty(buffer)) {
      const answer = await askAboutUnsavedChanges(titleOf(buffer))

      if (answer === 'cancel') return false
      if (answer === 'save' && !(await this.save(id))) return false
    }

    return this.workspace.close(id, true)
  }

  // Input

  private onKeyDown(event: KeyboardEvent): void {
    if (this.palette.isOpen) return

    for (const command of this.commands) {
      const shortcut = shortcutFor(command, this.host.platform)
      if (!shortcut) continue
      if (!matchesShortcut(event, shortcut, this.host.platform)) continue
      if (command.enabled && !command.enabled()) return

      event.preventDefault()
      event.stopPropagation()
      void command.run()
      return
    }
  }
}

function describe(error: unknown): string {
  // Errors from the Rust side arrive as a plain string, already written for a
  // person to read. Anything else is a bug and says so.
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return 'Something went wrong that MarkPad does not have a message for.'
}
