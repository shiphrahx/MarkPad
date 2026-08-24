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
import { loadSession, saveSession, signatureOf, type Session } from './session.js'
import { buildCommands } from '../commands/build.js'
import { ReaderEditor } from '../wysiwyg/editor.js'
import { markpadSchema } from '../wysiwyg/schema.js'
import { askForText } from '../ui/prompt-dialog.js'
import type { Command as ProseCommand } from 'prosemirror-state'
import type { EditorState as ProseState } from 'prosemirror-state'

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
 * Which surface is showing.
 *
 * Reader is the default: a file opens rendered and you type into it. Source is
 * the same document as Markdown, and it exists because an app that generates
 * Markdown you cannot inspect is worse than one that does not generate it.
 */
export type Mode = 'reader' | 'source'

/**
 * The app: the workspace, the editor and the chrome, wired together.
 *
 * Everything interesting happens somewhere else. This file is the part that
 * knows what talks to what.
 */
export class App {
  readonly workspace: Workspace
  readonly commands: readonly Command[]

  /** The rendered surface, which is what a file opens into. */
  private readonly reader: ReaderEditor
  /** The Markdown source, one command away. */
  private readonly view: EditorView
  private mode: Mode = 'reader'
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
  private readonly readerStates = new Map<string, ProseState>()
  private currentId: string | null = null
  private applyingExternally = false

  /** Shortcuts taken apart once, rather than on every keystroke. */
  private readonly bindings: Array<{ command: Command; shortcut: ParsedShortcut }> = []

  private readonly sourceHolder: HTMLElement
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
  /** Last session written to storage, so an unchanged one is not rewritten. */
  private sessionSignature = ''

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

    this.rail = new OutlineRail((heading, index) => this.goToHeading(heading, index))
    this.palette = new CommandPalette(host.platform)
    this.preview = new PreviewPane()

    this.reader = new ReaderEditor({
      platform: host.platform,
      onChange: () => this.onSurfaceEdited(),
      onLink: () => void this.addLink(),
    })

    const sourceHolder = el('div', { class: 'editor', hidden: true })
    const middle = el('div', { class: 'middle' })
    middle.append(this.rail.element, this.reader.element, sourceHolder, this.preview.element)

    root.append(this.tabs.element, middle, this.status.element, this.palette.element)

    this.view = new EditorView({
      parent: sourceHolder,
      state: EditorState.create({ extensions: this.extensions() }),
    })
    this.sourceHolder = sourceHolder

    this.commands = buildCommands(this)

    for (const command of this.commands) {
      const shortcut = shortcutFor(command, host.platform)
      const parsed = shortcut === null ? null : parseShortcut(shortcut)
      if (parsed) this.bindings.push({ command, shortcut: parsed })
    }

    this.workspace.subscribe(() => {
      this.render()
      this.rememberSession()
    })
    document.addEventListener('keydown', (event) => this.onKeyDown(event), true)

    // Nothing in the editor is worth losing to a window closing, and the
    // last tenth of a second of typing lives only in CodeMirror until this
    // runs.
    addEventListener('beforeunload', () => this.flush())
  }

  /**
   * Open whatever should be on screen: last time's tabs, then anything named
   * on the command line, then a blank buffer if that came to nothing.
   *
   * Kept out of the constructor because it reads the disk, and a constructor
   * that does IO is a constructor you cannot use in a test without a disk.
   */
  async start(commandLineFiles: readonly string[] = []): Promise<void> {
    await this.restoreSession()
    if (commandLineFiles.length > 0) await this.openFiles(commandLineFiles)
    if (this.workspace.tabs.length === 0) this.workspace.create()
  }

  /**
   * Reopen last time's files.
   *
   * One at a time, because a file that has been deleted or renamed since must
   * not stop the rest from opening. A missing file is dropped quietly: you
   * already know you deleted it, and a dialog at every launch until you
   * happen to open something else would be its own kind of rude.
   */
  private async restoreSession(): Promise<void> {
    const session = loadSession()
    if (session.paths.length === 0) return

    const opened: string[] = []
    for (const path of session.paths) {
      try {
        await this.workspace.open([path])
        opened.push(path)
      } catch {
        continue
      }
    }

    const wanted = session.paths[session.active]
    const target = this.workspace.tabs.find((buffer) => buffer.path === wanted)
    if (target) this.workspace.focus(target.id)
    else if (opened.length > 0) this.workspace.focus(this.workspace.tabs[0]!.id)
  }

  /** Remember the open files, if which files are open has actually changed. */
  private rememberSession(): void {
    const paths = this.workspace.tabs
      .map((buffer) => buffer.path)
      .filter((path): path is string => path !== null)

    const activePath = this.workspace.active?.path ?? null
    const session: Session = {
      paths,
      active: activePath === null ? 0 : Math.max(0, paths.indexOf(activePath)),
    }

    const signature = signatureOf(session)
    if (signature === this.sessionSignature) return

    this.sessionSignature = signature
    saveSession(session)
  }

  private extensions() {
    return [
      ...markpadExtensions(),
      previewPopovers(),
      EditorView.updateListener.of((update) => {
        if (this.applyingExternally) return

        if (update.docChanged) {
          this.onSurfaceEdited()
        } else if (update.selectionSet) {
          this.renderCaretParts()
        }
      }),
    ]
  }

  /**
   * Something was typed, in whichever surface is showing.
   *
   * Deliberately does not read the document. Pulling Markdown out of the
   * rendered surface means serialising the whole thing, which is the one job
   * that must not happen per keystroke.
   */
  private onSurfaceEdited(): void {
    this.unsyncedEdits = true
    this.scheduleIdleWork()
    this.renderCaretParts()
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

    const text =
      this.mode === 'reader' ? this.reader.getMarkdown() : this.view.state.doc.toString()
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
      if (this.workspace.tabs.some((buffer) => buffer.id === id)) continue
      this.states.delete(id)
      this.readerStates.delete(id)
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

    if (this.mode === 'source') {
      const head = this.view.state.selection.main.head
      const line = this.view.state.doc.lineAt(head)

      this.status.render(
        active,
        { line: line.number, column: head - line.from + 1 },
        this.words,
      )
      this.rail.render(this.headings, head)
      return
    }

    // The rendered surface has no line and column to report: the document is
    // not laid out as lines of Markdown, and inventing a number by counting
    // the serialised text would be a lie that moved as you typed.
    this.status.render(active, null, this.words)

    const current = this.reader.currentHeadingIndex()
    this.rail.render(this.headings, this.headings[current]?.offset ?? -1)
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
      this.rememberState()

      this.applyingExternally = true
      if (this.mode === 'reader') {
        const kept = this.readerStates.get(active.id)
        if (kept) this.reader.restore(kept)
        else this.reader.setMarkdown(active.text)
      } else {
        const kept = this.states.get(active.id)
        this.view.setState(
          kept ?? EditorState.create({ doc: active.text, extensions: this.extensions() }),
        )
      }
      this.applyingExternally = false

      this.currentId = active.id
      this.syncedText = active.text
      this.recomputeDerived(active.text)
      this.focusEditor()
      this.preview.update(active.text, { immediately: true })
      return
    }

    if (active.text !== this.syncedText) {
      this.applyingExternally = true

      if (this.mode === 'reader') {
        // Reparsing throws away the undo history, which is why this only runs
        // for text that arrived from outside the surface rather than from
        // somebody typing in it.
        this.reader.setMarkdown(active.text)
      } else {
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: active.text },
        })
      }
      this.applyingExternally = false
      this.syncedText = active.text
      this.recomputeDerived(active.text)
    }
  }

  // Actions the commands call

  focusEditor(): void {
    if (this.mode === 'reader') this.reader.focus()
    else this.view.focus()
  }

  /** Keep the current tab's undo history before switching away from it. */
  private rememberState(): void {
    if (this.currentId === null) return
    this.states.set(this.currentId, this.view.state)
    this.readerStates.set(this.currentId, this.reader.state)
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

  /**
   * Jump to a heading from the outline rail.
   *
   * Source view has a character offset to scroll to. The rendered surface does
   * not, so it counts headings instead and both ends agree on the ordinal.
   */
  goToHeading(heading: Heading, index: number): void {
    if (this.mode === 'reader') {
      this.reader.goToHeading(index)
      return
    }

    this.view.dispatch({
      selection: EditorSelection.cursor(heading.offset),
      scrollIntoView: true,
    })
    this.view.focus()
  }

  get currentMode(): Mode {
    return this.mode
  }

  /**
   * Whether a formatting command would do anything.
   *
   * Formatting only applies to the rendered surface. In source view you type
   * the Markdown, which is the whole reason source view exists, so the palette
   * greys these out rather than pretending.
   */
  canFormat(command: ProseCommand): boolean {
    return this.mode === 'reader' && this.reader.can(command)
  }

  format(command: ProseCommand): void {
    if (this.mode !== 'reader') return
    this.reader.run(command)
  }

  /**
   * Turn the selection into a link, or change the address of one it is already
   * inside.
   */
  async addLink(): Promise<void> {
    if (this.mode !== 'reader') return

    const existing = this.reader.linkAtSelection()
    const href = await askForText({
      title: existing === null ? 'Add a link' : 'Edit the link',
      label: 'Address',
      value: existing ?? '',
      placeholder: 'https://example.com',
      confirmLabel: existing === null ? 'Add link' : 'Update link',
    })

    if (href === null) {
      this.focusEditor()
      return
    }

    const mark = markpadSchema.marks.link!
    if (href === '') {
      this.reader.run((state, dispatch) => {
        const { from, to } = state.selection
        if (dispatch) dispatch(state.tr.removeMark(from, to, mark))
        return true
      })
      return
    }

    this.reader.run((state, dispatch) => {
      const { from, to, empty } = state.selection
      // With nothing selected there is no text to make into a link, so the
      // address becomes the text as well. That is what a person means when
      // they paste a URL into an empty line.
      if (empty) {
        if (dispatch) {
          dispatch(
            state.tr.replaceSelectionWith(
              state.schema.text(href, [mark.create({ href, title: null })]),
              false,
            ),
          )
        }
        return true
      }

      if (dispatch) {
        dispatch(state.tr.addMark(from, to, mark.create({ href, title: null })))
      }
      return true
    })
  }

  /**
   * Swap between the rendered surface and the Markdown source.
   *
   * Flushes first, so whichever surface is about to appear gets the text as it
   * stands rather than as it stood a tenth of a second ago.
   */
  toggleSource(): void {
    this.flush()

    const active = this.workspace.active
    this.mode = this.mode === 'reader' ? 'source' : 'reader'

    this.sourceHolder.hidden = this.mode !== 'source'
    this.reader.element.hidden = this.mode !== 'reader'

    if (active) this.loadIntoSurface(active.text)
    this.renderCaretParts()
  }

  /** Put text into whichever surface is showing, and focus it. */
  private loadIntoSurface(text: string): void {
    if (this.mode === 'reader') {
      this.reader.setMarkdown(text)
      this.reader.focus()
      return
    }

    this.applyingExternally = true
    this.view.setState(EditorState.create({ doc: text, extensions: this.extensions() }))
    this.applyingExternally = false
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
