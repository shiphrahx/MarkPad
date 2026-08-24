import { toggleMark } from 'prosemirror-commands'
import { Plugin } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { MarkType } from 'prosemirror-model'
import { el } from '../ui/dom.js'
import { markpadSchema } from './schema.js'

export interface ToolbarHooks {
  /** Opens the link dialog. Lives in the app, because it draws a dialog. */
  readonly onLink: () => void
}

interface Button {
  readonly label: string
  readonly title: string
  readonly mark?: MarkType
  readonly onClick?: () => void
}

/**
 * A small toolbar over the selection.
 *
 * Reader mode had no visible sign that formatting existed at all: no toolbar,
 * no obvious menu, nothing. You had to already know Markdown or already know
 * the palette, which is exactly the knowledge a rendered editor is supposed to
 * make unnecessary.
 *
 * It appears only for a selection inside ordinary text, so selecting a code
 * block does not offer to make it bold.
 */
export function selectionToolbar(hooks: ToolbarHooks): Plugin {
  const marks = markpadSchema.marks

  const buttons: Button[] = [
    { label: 'B', title: 'Bold', mark: marks.strong! },
    { label: 'I', title: 'Italic', mark: marks.em! },
    { label: 'S', title: 'Strikethrough', mark: marks.strikethrough! },
    { label: '<>', title: 'Inline code', mark: marks.code! },
    { label: 'Link', title: 'Link', onClick: hooks.onLink },
  ]

  return new Plugin({
    view: (view) => new ToolbarView(view, buttons),
  })
}

class ToolbarView {
  private readonly dom = el('div', { class: 'selection-toolbar', hidden: true })
  private readonly buttons: Array<{ node: HTMLButtonElement; button: Button }> = []

  constructor(
    private readonly view: EditorView,
    buttons: readonly Button[],
  ) {
    for (const button of buttons) {
      const node = el(
        'button',
        { type: 'button', class: 'selection-toolbar-button', title: button.title },
        button.label,
      )

      // Without this the editor loses focus the moment you press, which
      // collapses the selection you were trying to format.
      node.addEventListener('mousedown', (event) => event.preventDefault())
      node.addEventListener('click', () => {
        if (button.mark) toggleMark(button.mark)(this.view.state, this.view.dispatch, this.view)
        else button.onClick?.()
        this.view.focus()
      })

      this.buttons.push({ node, button })
      this.dom.appendChild(node)
    }

    document.body.appendChild(this.dom)
    this.update(view)
  }

  update(view: EditorView): void {
    const { state } = view

    if (!shouldShow(state)) {
      this.dom.hidden = true
      return
    }

    for (const { node, button } of this.buttons) {
      if (!button.mark) continue
      node.classList.toggle('is-active', markIsOn(state, button.mark))
      node.disabled = !toggleMark(button.mark)(state)
    }

    this.dom.hidden = false
    this.position(view)
  }

  /**
   * Sit above the selection, clamped to the window.
   *
   * Fixed positioning, because the editor scrolls and a toolbar that scrolls
   * away from the text it belongs to is worse than one that is not there.
   */
  private position(view: EditorView): void {
    const { from, to } = view.state.selection
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to, -1)

    const width = this.dom.offsetWidth
    const height = this.dom.offsetHeight
    const centre = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2

    const left = Math.max(8, Math.min(centre - width / 2, window.innerWidth - width - 8))
    const above = Math.min(start.top, end.top) - height - 8

    this.dom.style.left = `${Math.round(left)}px`
    // Flip below the selection when there is no room above it, which happens
    // on the first line of the document.
    this.dom.style.top = `${Math.round(above < 8 ? Math.max(start.bottom, end.bottom) + 8 : above)}px`
  }

  destroy(): void {
    this.dom.remove()
  }
}

function shouldShow(state: EditorState): boolean {
  const { selection } = state
  if (selection.empty) return false

  const { $from, $to } = selection
  // Inside a code block the marks mean nothing: the text there is literal.
  if ($from.parent.type.spec.code) return false
  // A selection spanning whole blocks is usually a drag to delete, not a drag
  // to format, and a toolbar in the way of that is a nuisance.
  return $from.parent.inlineContent && $to.parent.inlineContent
}

function markIsOn(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
  return state.doc.rangeHasMark(from, to, type)
}
