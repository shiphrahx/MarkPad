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
import {
  matchesParsed,
  parseShortcut,
  type ParsedShortcut,
} from '../commands/keys.js'
import { shortcutFor, type Command } from '../commands/types.js'
import { countWords } from './stats.js'
import { isDirty, title as titleOf, type Buffer } from './buffer.js'
import { extractHeadings, type Heading } from './outline.js'
import { Workspace } from './workspace.js'
import { buildCommands } from '../commands/build.js'

/**
 * How long the editor may run ahead of the rest of the app.
 *
 * Everything that has to walk the whole document — pulling the text out of
 * CodeMirror's rope, counting words, finding headings — happens once when
 * typing pauses, not once per keystroke. On a 5 MB file each of those is
 * several milliseconds, and three of them per letter is exactly the thing the
 * typing budget forbids.
 *
 * The visible cost is that the unsaved dot and the word count trail your
 * typing by a tenth of a second. Nobody has ever noticed that. Everybody
 * notices the keyboard lagging.
 */
const IDLE_MS = 100

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

  /** Shortcuts taken apart once, rather than on every keystroke. */
  private readonly bindings: Array<{ command: Command; shortcut: ParsedShortcut }> = []

  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private unsyncedEdits = false
  /** Derived from the document, recomputed when typing stops. */
  private words = 0
  private headings: readonly Heading[] = []
  /**
   * The exact string last put into, or taken out of, the editor.
   *
   * Compared by reference, so the common case where the workspace holds the
   * very string the editor just produced costs nothing. Comparing the contents
   * of two multi-megabyte strings on every workspace change is the thing this
   * whole file exists to avoid.
   */
  private syncedText: string | null = null

  constructor(
    readonly host: Host,
    root: HTMLElement,
  ) {
    this.workspace = new Workspace(host)

    this.tabs = new TabStrip({
      onFocus: (id) => this.focusTab(id),
      onClose: (id) => void this.closeTab(id),
      onNew: () => this.newFile(),
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

    for (const command of this.commands) {
      const shortcut = shortcutFor(command, host.platform)
      const parsed = shortcut === null ? null : parseShortcut(shortcut)
      if (parsed) this.bindings.push({ command, shortcut: parsed })
    }

    this.workspace.subscribe(() => this.render())
    document.addEventListener('keydown', (event) => this.onKeyDown(event), true)

    // Nothing in the editor is worth losing to a window closing, and the
    // last tenth of a second of typing lives only in CodeMirror until this
    // runs.
    addEventListener('beforeunload', () => this.flush())

    this.workspace.create()
  }

  private extensions() {
    return [
      ...markpadExtensions(),
      previewPopovers(),
      EditorView.updateListener.of((update) => {
        if (this.applyingExternally) return

        if (update.docChanged) {
          // Deliberately does not touch the document. Everything that has to
          // read it waits for the pause.
          this.unsyncedEdits = true
          this.scheduleIdleWork()
          this.renderCaretParts()
        } else if (update.selectionSet) {
          this.renderCaretParts()
        }
      }),
    ]
  }

  // Keeping the workspace in step with the editor

  private scheduleIdleWork(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.flush(), IDLE_MS)
  }

  /**
   * Pull the text out of the editor and let everything derived from it catch
   * up. Called when typing pauses, and before anything that has to see the
   * current document: saving, closing, exporting, previewing.
   */
  flush(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (!this.unsyncedEdits || this.currentId === null) return

    this.unsyncedEdits = false

    const text = this.view.state.doc.toString()
    this.syncedText = text
    this.recomputeDerived(text)
    // Triggers a render through the subscription, which is where the tab dot,
    // the word count and the rail all catch up at once.
    this.workspace.setText(this.currentId, text)
    this.preview.update(text)
  }

  private recomputeDerived(text: string): void {
    this.words = countWords(text)
    this.headings = extractHeadings(text)
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

  /**
   * The parts that change as the caret moves.
   *
   * Cheap on purpose: a line lookup in the rope, and two redraws of a handful
   * of elements. The word count and the headings come from the last idle pass
   * rather than being recomputed here.
   */
  private renderCaretParts(): void {
    const active = this.workspace.active
    if (!active) {
      this.status.render(null, null, 0)
      this.rail.render([], 0)
      return
    }

    const head = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(head)

    this.status.render(
      active,
      { line: line.number, column: head - line.from + 1 },
      this.words,
    )
    this.rail.render(this.headings, head)
  }

  /**
   * Put the right document in the editor.
   *
   * Text set from outside, by opening a file, is applied as a change rather
   * than a fresh state, so it lands in the undo history instead of wiping it.
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
        existing ?? EditorState.create({ doc: active.text, extensions: this.extensions() }),
      )
      this.applyingExternally = false

      this.currentId = active.id
      this.syncedText = active.text
      this.recomputeDerived(active.text)
      this.view.focus()
      this.preview.update(active.text, { immediately: true })
      return
    }

    if (active.text !== this.syncedText) {
      this.applyingExternally = true
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: active.text },
      })
      this.applyingExternally = false
      this.syncedText = active.text
      this.recomputeDerived(active.text)
    }
  }

  // Actions the commands call

  focusEditor(): void {
    this.view.focus()
  }

  openPalette(): void {
    this.flush()
    this.palette.open(this.commands)
  }

  togglePreview(): void {
    this.flush()
    this.preview.toggle(this.workspace.active?.text ?? '')
  }

  newFile(): void {
    this.flush()
    this.workspace.create()
  }

  focusTab(id: string): void {
    this.flush()
    this.workspace.focus(id)
  }

  focusRelative(offset: number): void {
    this.flush()
    this.workspace.focusRelative(offset)
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
    this.flush()
    try {
      return await this.workspace.save(id)
    } catch (error) {
      await this.host.report(describe(error))
      return false
    }
  }

  async saveAs(id: string): Promise<boolean> {
    this.flush()
    try {
      return await this.workspace.saveAs(id)
    } catch (error) {
      await this.host.report(describe(error))
      return false
    }
  }

  async openFiles(paths: readonly string[]): Promise<void> {
    this.flush()
    try {
      await this.workspace.open(paths)
    } catch (error) {
      await this.host.report(describe(error))
    }
  }

  async openWithDialog(): Promise<void> {
    this.flush()
    try {
      await this.workspace.openWithDialog()
    } catch (error) {
      await this.host.report(describe(error))
    }
  }

  /**
   * Close a tab, asking about unsaved work first.
   *
   * Three answers, not two: save it, throw it away, or change your mind.
   */
  async closeTab(id: string): Promise<boolean> {
    this.flush()

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

    for (const { command, shortcut } of this.bindings) {
      if (!matchesParsed(event, shortcut, this.host.platform)) continue
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
