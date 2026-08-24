import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
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

export interface ReaderOptions {
  readonly platform: Platform
  readonly onChange: () => void
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
    this.element.className = 'reader markpad-document'

    this.view = new EditorView(this.element, {
      state: this.freshState(''),
      dispatchTransaction: (transaction) => this.apply(transaction),
      nodeViews: {
        list_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
      },
      attributes: {
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
        markpadInputRules(),
        ...markpadKeymap(this.options.platform),
        dropCursor({ color: 'var(--accent)' }),
        gapCursor(),
        // Resizing writes no Markdown, since GFM has no column widths, but
        // dragging a column is how people find out a table is editable.
        columnResizing(),
        tableEditing(),
        history(),
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
