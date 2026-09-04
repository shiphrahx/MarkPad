// ProseMirror needs white-space: pre-wrap or it collapses runs of spaces and
// drops trailing ones, which quietly changes what you typed. The other two
// draw the gap cursor and the table selection, neither of which is decoration.
import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import 'prosemirror-tables/style/tables.css'
import {
  EditorState,
  TextSelection,
  type Command as ProseCommand,
  type Transaction,
} from 'prosemirror-state'
import { EditorView, type NodeView } from 'prosemirror-view'
import type { Node as ProseNode } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { columnResizing, tableEditing } from 'prosemirror-tables'
import type { Platform } from '../host/types.js'
import { markpadSchema } from './schema.js'
import { markdownParser } from './parser.js'
import { toMarkdown } from './serializer.js'
import { markpadInputRules } from './input-rules.js'
import { markpadKeymap } from './keymap.js'
import { placeholder } from './placeholder.js'
import { selectionToolbar } from './selection-toolbar.js'
import { slashMenu } from './slash-menu.js'
import { codeHighlight } from './code-highlight.js'

export interface ReaderOptions {
  readonly platform: Platform
  readonly onChange: () => void
  /** Opens the link dialog, which lives in the app because it draws one. */
  readonly onLink: () => void
  /**
   * A Markdown image source, turned into something the window can load, or
   * null when there is nothing to load. Given rather than worked out here,
   * because the answer depends on where the open file lives and this class
   * deliberately knows nothing about files.
   */
  readonly imageUrl: (src: string) => string | null
}

/**
 * The rendered editing surface. What a file opens into.
 *
 * Holds a ProseMirror document rather than text. The Markdown is generated
 * from it on demand, which is why nothing here calls the serialiser on every
 * keystroke: `onChange` only says that something changed, and the app decides
 * when it is worth paying to find out what.
 */
export class ReaderEditor {
  readonly element = document.createElement('div')

  private readonly view: EditorView
  private applyingExternally = false

  constructor(private readonly options: ReaderOptions) {
    // The scroll container is layout only. The document styles go on the
    // ProseMirror element inside it, because they cap the width and centre it,
    // and a centred scroll container puts its scrollbar down the middle of the
    // window.
    this.element.className = 'reader'

    this.view = new EditorView(this.element, {
      state: this.freshState(''),
      dispatchTransaction: (transaction) => this.apply(transaction),
      nodeViews: {
        list_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
        image: (node) => new ImageView(node, this.options.imageUrl),
      },
      attributes: {
        class: 'markpad-document',
        // The document is the thing being edited, so it gets the name rather
        // than a wrapper nobody can see.
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document',
      },
    })
  }

  private freshState(markdown: string): EditorState {
    return EditorState.create({
      doc: markdownParser.parse(markdown),
      plugins: [
        // Before the keymap, so the slash menu gets the arrow keys and Enter
        // while it is open.
        ...slashMenu(),
        markpadInputRules(),
        ...markpadKeymap(this.options.platform),
        dropCursor({ color: 'var(--accent)' }),
        gapCursor(),
        // Resizing writes no Markdown, since GFM has no column widths, but
        // dragging a column is how people find out a table is editable.
        columnResizing(),
        tableEditing(),
        history(),
        placeholder(this.options.platform),
        selectionToolbar({ onLink: this.options.onLink }),
        codeHighlight(),
      ],
    })
  }

  private apply(transaction: Transaction): void {
    this.view.updateState(this.view.state.apply(transaction))
    if (transaction.docChanged && !this.applyingExternally) this.options.onChange()
  }

  /** Replace the document. Used when a tab is opened or switched to. */
  setMarkdown(markdown: string): void {
    this.applyingExternally = true
    this.view.updateState(this.freshState(markdown))
    this.applyingExternally = false
  }

  /** Serialise. Walks the whole document, so the app calls it sparingly. */
  getMarkdown(): string {
    return toMarkdown(this.view.state.doc)
  }

  /** Keep the undo history and selection when switching away and back. */
  get state(): EditorState {
    return this.view.state
  }

  restore(state: EditorState): void {
    this.applyingExternally = true
    this.view.updateState(state)
    this.applyingExternally = false
  }

  focus(): void {
    this.view.focus()
  }

  /** The address of the link the selection sits in, if it is in one. */
  linkAtSelection(): string | null {
    const { state } = this.view
    const mark = state.schema.marks.link
    if (!mark) return null

    const { $from, empty } = state.selection
    const marks = empty ? state.storedMarks ?? $from.marks() : $from.marksAcross(state.selection.$to) ?? []
    const found = marks.find((candidate) => candidate.type === mark)

    return found ? String(found.attrs.href) : null
  }

  /** Would this command do anything here? Used to grey out the palette. */
  can(command: ProseCommand): boolean {
    return command(this.view.state)
  }

  /** Run a command and put the cursor back where the typing happens. */
  run(command: ProseCommand): boolean {
    const applied = command(this.view.state, this.view.dispatch, this.view)
    this.view.focus()
    return applied
  }

  /**
   * Scroll to the nth heading in the document.
   *
   * The outline rail counts headings in the Markdown text, and the rendered
   * document has no character offsets to match them against, so both ends
   * agree on the ordinal instead.
   */
  goToHeading(index: number): void {
    const position = this.headingPositions()[index]
    if (position === undefined) return

    const { state } = this.view
    const selection = TextSelection.near(state.doc.resolve(position + 1))

    this.view.dispatch(state.tr.setSelection(selection).scrollIntoView())
    this.view.focus()
  }

  /** Which heading the cursor is currently under, or -1 above them all. */
  currentHeadingIndex(): number {
    const head = this.view.state.selection.head
    const positions = this.headingPositions()

    let current = -1
    for (let index = 0; index < positions.length; index++) {
      if (positions[index]! <= head) current = index
    }
    return current
  }

  /**
   * Where each heading sits, as a fraction of the scrollable height.
   *
   * Measured against the scroll container rather than the window, so it stays
   * right whatever else is on screen. Cheap: a document has a handful of
   * headings, not a handful of thousands.
   */
  headingOffsets(): number[] {
    const scroller = this.element
    const total = scroller.scrollHeight
    if (total <= 0) return []

    return this.headingPositions().map((position) => {
      try {
        const box = this.view.coordsAtPos(position + 1)
        const top = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop
        return top / total
      } catch {
        // A position the view cannot measure yet, usually mid-update.
        return Number.NaN
      }
    })
  }

  private headingPositions(): number[] {
    const positions: number[] = []
    this.view.state.doc.forEach((node, offset) => {
      if (node.type.name === 'heading') positions.push(offset)
    })
    return positions
  }

  destroy(): void {
    this.view.destroy()
  }
}

/**
 * An image, pointed at the file it actually means.
 *
 * The `src` in a Markdown file is written relative to the file, and the window
 * cannot load a bare path. The node keeps what the file said, which is what
 * gets written back on save; only what the browser is asked to fetch changes.
 *
 * An image that cannot be resolved, which today means one on the web, keeps its
 * alt text and says so in the DOM rather than turning into a broken icon.
 */
class ImageView implements NodeView {
  readonly dom: HTMLImageElement

  constructor(
    private node: ProseNode,
    private readonly resolve: (src: string) => string | null,
  ) {
    this.dom = document.createElement('img')
    this.draw()
  }

  private draw(): void {
    const src = String(this.node.attrs.src ?? '')
    const title = this.node.attrs.title

    this.dom.alt = String(this.node.attrs.alt ?? '')
    this.dom.dataset.src = src

    if (title === null || title === undefined) this.dom.removeAttribute('title')
    else this.dom.title = String(title)

    const resolved = this.resolve(src)
    if (resolved === null) {
      this.dom.removeAttribute('src')
      this.dom.dataset.unresolved = 'true'
    } else {
      this.dom.src = resolved
      delete this.dom.dataset.unresolved
    }
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false

    this.node = node
    this.draw()
    return true
  }
}

/**
 * A list item that might be a task.
 *
 * Rendered with a real checkbox rather than a styled pseudo-element, so it can
 * be clicked, reached by keyboard and read out by a screen reader as the
 * checkbox it is.
 */
class TaskItemView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('li')
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'pm-item-content'

    if (node.attrs.checked !== null) {
      this.dom.className = 'pm-task'
      this.dom.appendChild(this.checkbox(Boolean(node.attrs.checked)))
    }

    this.dom.appendChild(this.contentDOM)
  }

  private checkbox(checked: boolean): HTMLInputElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = checked
    box.className = 'pm-checkbox'
    box.setAttribute('aria-label', 'Done')

    // contentEditable would otherwise swallow the click and try to put a
    // cursor inside the checkbox.
    box.contentEditable = 'false'
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('click', (event) => {
      event.preventDefault()
      this.toggle()
    })

    return box
  }

  private toggle(): void {
    const position = this.getPos()
    if (position === undefined) return

    const { state, dispatch } = this.view
    dispatch(
      state.tr.setNodeMarkup(position, undefined, {
        ...this.node.attrs,
        checked: !this.node.attrs.checked,
      }),
    )
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    // A plain item becoming a task, or the reverse, changes the DOM shape, so
    // let ProseMirror rebuild it rather than patching around it.
    if ((node.attrs.checked === null) !== (this.node.attrs.checked === null)) return false

    this.node = node

    const box = this.dom.querySelector<HTMLInputElement>('.pm-checkbox')
    if (box) box.checked = Boolean(node.attrs.checked)

    return true
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLInputElement
  }
}

export { markpadSchema }
