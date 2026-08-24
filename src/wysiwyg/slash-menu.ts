import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { rank } from '../commands/filter.js'
import { el, highlight, replace } from '../ui/dom.js'
import { FORMAT_ACTIONS, type FormatAction } from './format.js'

/**
 * Type `/` to insert a block.
 *
 * The other half of making formatting visible. The selection toolbar covers
 * marks, which need existing text; this covers blocks, which do not. Between
 * them there is no longer anything you can only reach by knowing it is there.
 *
 * Only the block-shaped actions appear. Offering Bold in a menu you opened on
 * an empty line would be offering to do nothing.
 */

const BLOCK_ACTIONS = new Set([
  'heading1',
  'heading2',
  'heading3',
  'paragraph',
  'bulletList',
  'orderedList',
  'taskList',
  'quote',
  'codeBlock',
  'rule',
  'table',
])

interface SlashState {
  /** Position of the `/`, or null when the menu is closed. */
  readonly from: number | null
  readonly query: string
}

const CLOSED: SlashState = { from: null, query: '' }

export const slashMenuKey = new PluginKey<SlashState>('slashMenu')

export function slashMenu() {
  const actions = FORMAT_ACTIONS.filter((action) => BLOCK_ACTIONS.has(action.id))

  const plugin = new Plugin<SlashState>({
    key: slashMenuKey,

    state: {
      init: () => CLOSED,
      apply(transaction, previous, _old, state) {
        const forced = transaction.getMeta(slashMenuKey) as SlashState | undefined
        if (forced) return forced

        if (previous.from === null) return openedBy(transaction, state)

        const from = transaction.mapping.map(previous.from)
        const head = state.selection.head

        // Anything that moves the cursor off the run of text after the slash
        // closes the menu, including selecting elsewhere and deleting the
        // slash itself.
        if (head < from + 1 || state.selection.empty === false) return CLOSED

        const typed = state.doc.textBetween(from, head, '\n', '\n')
        if (!typed.startsWith('/')) return CLOSED
        if (/\s/.test(typed)) return CLOSED

        return { from, query: typed.slice(1) }
      },
    },

    view: (view) => new SlashView(view, actions),
  })

  // High precedence, so the arrow keys drive the menu rather than the cursor
  // while it is open.
  return [
    keymap({
      ArrowDown: (state, dispatch, view) => move(state, view, 1),
      ArrowUp: (state, dispatch, view) => move(state, view, -1),
      Enter: (state, _dispatch, view) => choose(state, view),
      Escape: (state, dispatch) => {
        if (slashMenuKey.getState(state)?.from === null) return false
        dispatch?.(state.tr.setMeta(slashMenuKey, CLOSED))
        return true
      },
    }),
    plugin,
  ]
}

/** A slash typed at the start of an empty-ish text block opens the menu. */
function openedBy(transaction: Transaction, state: EditorState): SlashState {
  if (!transaction.docChanged) return CLOSED

  const { $from, empty } = state.selection
  if (!empty || !$from.parent.inlineContent || $from.parent.type.spec.code) return CLOSED

  const before = state.doc.textBetween($from.start(), $from.pos, '\n', '\n')
  // Only at the start of a block. Mid-sentence a slash is a slash: dates,
  // paths and and/or all contain one.
  if (before !== '/') return CLOSED

  return { from: $from.pos - 1, query: '' }
}

let selectedIndex = 0

function visibleFor(state: EditorState, actions: readonly FormatAction[]) {
  const slash = slashMenuKey.getState(state)
  if (!slash || slash.from === null) return []
  return rank(slash.query, actions, (action) => action.title)
}

function move(state: EditorState, view: EditorView | undefined, offset: number): boolean {
  const slash = slashMenuKey.getState(state)
  if (!slash || slash.from === null || !view) return false

  const count = visibleFor(state, blockActions()).length
  if (count === 0) return false

  selectedIndex = (selectedIndex + offset + count) % count
  // Nothing about the document changed, so nudge the view into redrawing.
  view.dispatch(state.tr.setMeta(slashMenuKey, slash))
  return true
}

function choose(state: EditorState, view: EditorView | undefined): boolean {
  const slash = slashMenuKey.getState(state)
  if (!slash || slash.from === null || !view) return false

  const results = visibleFor(state, blockActions())
  const chosen = results[selectedIndex]?.item
  if (!chosen) return false

  apply(view, slash, chosen)
  return true
}

function apply(view: EditorView, slash: SlashState, action: FormatAction): void {
  if (slash.from === null) return

  // Take the `/query` out first, so the command acts on the block as it would
  // have been if you had never typed it.
  const transaction = view.state.tr.delete(slash.from, view.state.selection.head)
  transaction.setMeta(slashMenuKey, CLOSED)
  view.dispatch(transaction)

  action.command(view.state, view.dispatch, view)
  view.focus()
}

function blockActions(): readonly FormatAction[] {
  return FORMAT_ACTIONS.filter((action) => BLOCK_ACTIONS.has(action.id))
}

class SlashView {
  private readonly dom = el('div', { class: 'slash-menu', hidden: true })

  constructor(
    private readonly view: EditorView,
    private readonly actions: readonly FormatAction[],
  ) {
    document.body.appendChild(this.dom)
    this.update(view)
  }

  update(view: EditorView): void {
    const slash = slashMenuKey.getState(view.state)

    if (!slash || slash.from === null) {
      this.dom.hidden = true
      selectedIndex = 0
      return
    }

    const results = rank(slash.query, this.actions, (action) => action.title)
    if (results.length === 0) {
      this.dom.hidden = true
      return
    }

    if (selectedIndex >= results.length) selectedIndex = 0

    replace(
      this.dom,
      ...results.map((result, index) => {
        const row = el('button', {
          type: 'button',
          class: `slash-row${index === selectedIndex ? ' slash-row-selected' : ''}`,
        })
        row.appendChild(highlight(result.item.title, result.match.positions))

        row.addEventListener('mousedown', (event) => event.preventDefault())
        row.addEventListener('click', () => apply(view, slash, result.item))

        return row
      }),
    )

    this.dom.hidden = false
    this.position(view, slash.from)
  }

  private position(view: EditorView, from: number): void {
    const at = view.coordsAtPos(from)
    const height = this.dom.offsetHeight
    const width = this.dom.offsetWidth

    const left = Math.max(8, Math.min(at.left, window.innerWidth - width - 8))
    const below = at.bottom + 6

    this.dom.style.left = `${Math.round(left)}px`
    // Flip above when it would fall off the bottom, which is most of the time
    // if you are writing at the end of a long document.
    this.dom.style.top = `${Math.round(
      below + height > window.innerHeight - 8 ? at.top - height - 6 : below,
    )}px`
  }

  destroy(): void {
    this.dom.remove()
  }
}
