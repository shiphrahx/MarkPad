import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import type { NodeType } from 'prosemirror-model'
import { markpadSchema } from './schema.js'

/**
 * Formatting, as commands.
 *
 * These exist because of a question with an embarrassing answer: how does
 * somebody add a heading? Typing `# ` worked, and Ctrl+Shift+1 worked, and
 * neither appeared anywhere in the app. In a surface whose whole point is not
 * having to know the Markdown, that is not a feature you can leave undiscovered.
 */

export interface FormatAction {
  readonly id: string
  readonly title: string
  /** Shown in the palette and the menus. Bound in the editor's own keymap. */
  readonly key?: string
  readonly command: Command
}

const schema = markpadSchema

export const FORMAT_ACTIONS: readonly FormatAction[] = [
  { id: 'bold', title: 'Bold', key: 'Mod+B', command: toggleMark(schema.marks.strong!) },
  { id: 'italic', title: 'Italic', key: 'Mod+I', command: toggleMark(schema.marks.em!) },
  {
    id: 'strikethrough',
    title: 'Strikethrough',
    key: 'Mod+Shift+X',
    command: toggleMark(schema.marks.strikethrough!),
  },
  {
    id: 'code',
    title: 'Inline code',
    key: 'Mod+E',
    command: toggleMark(schema.marks.code!),
  },

  {
    id: 'paragraph',
    title: 'Paragraph',
    key: 'Mod+Shift+0',
    command: setBlockType(schema.nodes.paragraph!),
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `heading${level}`,
    title: `Heading ${level}`,
    key: `Mod+Shift+${level}`,
    command: setBlockType(schema.nodes.heading!, { level }),
  })),

  {
    id: 'bulletList',
    title: 'Bullet list',
    command: wrapInList(schema.nodes.bullet_list!),
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    command: wrapInList(schema.nodes.ordered_list!),
  },
  {
    id: 'taskList',
    title: 'Task list',
    command: taskList(),
  },
  {
    id: 'liftList',
    title: 'Remove list formatting',
    command: liftListItem(schema.nodes.list_item!),
  },

  { id: 'quote', title: 'Quote', command: wrapIn(schema.nodes.blockquote!) },
  {
    id: 'codeBlock',
    title: 'Code block',
    command: setBlockType(schema.nodes.code_block!),
  },
  { id: 'rule', title: 'Horizontal rule', command: insertNode(schema.nodes.horizontal_rule!) },
  { id: 'table', title: 'Table', command: insertTable() },
]

/**
 * A bullet list whose items are tasks.
 *
 * Wrapping and then marking the items is two steps rather than one because
 * `wrapInList` decides for itself which paragraphs become items, and there is
 * no way to hand it the attribute up front.
 */
function taskList(): Command {
  const wrap = wrapInList(schema.nodes.bullet_list!)

  return (state, dispatch) => {
    if (!dispatch) return wrap(state)

    let wrapped = false
    wrap(state, (transaction) => {
      wrapped = true

      const { from, to } = transaction.selection
      transaction.doc.nodesBetween(from, to, (node, position) => {
        if (node.type !== schema.nodes.list_item) return
        if (node.attrs.checked !== null) return
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, checked: false })
      })

      dispatch(transaction)
    })

    return wrapped
  }
}

function insertNode(type: NodeType): Command {
  return (state, dispatch) => {
    if (!type.isLeaf && !type.isAtom) return false
    if (dispatch) dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView())
    return true
  }
}

/** A 2x2 table with a header row, which is the smallest useful one. */
function insertTable(): Command {
  return (state, dispatch) => {
    const { table, table_row: row, table_cell: cell, table_header: header } = schema.nodes
    if (!table || !row || !cell || !header) return false

    if (dispatch) {
      const headerRow = row.create(null, [header.create(), header.create()])
      const bodyRow = row.create(null, [cell.create(), cell.create()])

      dispatch(state.tr.replaceSelectionWith(table.create(null, [headerRow, bodyRow])).scrollIntoView())
    }

    return true
  }
}
