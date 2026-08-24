import { MarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown'
import type { Node as ProseNode } from 'prosemirror-model'
import { markpadSchema } from './schema.js'

/**
 * A document back into Markdown.
 *
 * This is where the round trip loses things, so the choices here are the ones
 * worth arguing about. Every rule below picks whatever leaves the file closest
 * to the shape it probably had, rather than whatever was easiest to write.
 */

const nodes = {
  blockquote(state: MarkdownSerializerState, node: ProseNode) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node))
  },

  code_block(state: MarkdownSerializerState, node: ProseNode) {
    const language = String(node.attrs.language ?? '')
    // Long enough a fence to survive backticks inside the code.
    const backticks = node.textContent.match(/`{3,}/gm)
    const fence = backticks ? '`'.repeat(Math.max(...backticks.map((run) => run.length)) + 1) : '```'

    state.write(`${fence}${language}\n`)
    state.text(node.textContent, false)
    state.ensureNewLine()
    state.write(fence)
    state.closeBlock(node)
  },

  heading(state: MarkdownSerializerState, node: ProseNode) {
    state.write(`${'#'.repeat(Number(node.attrs.level))} `)
    state.renderInline(node, false)
    state.closeBlock(node)
  },

  horizontal_rule(state: MarkdownSerializerState, node: ProseNode) {
    // Three hyphens, which is also what a setext h2 underline looks like, but
    // only ever emitted here as its own block with blank lines around it.
    state.write('---')
    state.closeBlock(node)
  },

  bullet_list(state: MarkdownSerializerState, node: ProseNode) {
    state.renderList(node, '  ', () => '- ')
  },

  ordered_list(state: MarkdownSerializerState, node: ProseNode) {
    const start = Number(node.attrs.start ?? 1)
    const widest = String(start + node.childCount - 1).length
    const padding = ' '.repeat(widest + 2)

    state.renderList(node, padding, (index) => {
      const label = String(start + index)
      return `${' '.repeat(widest - label.length)}${label}. `
    })
  },

  list_item(state: MarkdownSerializerState, node: ProseNode) {
    const checked = node.attrs.checked
    if (checked !== null) state.write(checked ? '[x] ' : '[ ] ')
    state.renderContent(node)
  },

  paragraph(state: MarkdownSerializerState, node: ProseNode) {
    state.renderInline(node)
    state.closeBlock(node)
  },

  image(state: MarkdownSerializerState, node: ProseNode) {
    const alt = state.esc(String(node.attrs.alt ?? ''))
    const source = String(node.attrs.src ?? '').replace(/[()]/g, '\\$&')
    const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''
    state.write(`![${alt}](${source}${title})`)
  },

  hard_break(state: MarkdownSerializerState, node: ProseNode, parent: ProseNode, index: number) {
    // A backslash rather than two trailing spaces. Invisible trailing
    // whitespace is the kind of thing editors and linters strip without
    // telling you, which turns the break into a space.
    for (let after = index + 1; after < parent.childCount; after++) {
      if (parent.child(after).type !== node.type) {
        state.write('\\\n')
        return
      }
    }
  },

  text(state: MarkdownSerializerState, node: ProseNode) {
    state.text(node.text ?? '')
  },

  html_block(state: MarkdownSerializerState, node: ProseNode) {
    state.write(String(node.attrs.html ?? ''))
    state.closeBlock(node)
  },

  table(state: MarkdownSerializerState, node: ProseNode) {
    writeTable(state, node)
  },

  // Reached only through writeTable, but the serialiser insists every node
  // type in the schema has a rule.
  table_row: noop,
  table_cell: noop,
  table_header: noop,
}

function noop(): void {}

/**
 * GFM tables.
 *
 * Cells are padded to a common width per column. Unpadded output is legal and
 * renders the same, but a table nobody can read in source form is not much of
 * a Markdown file.
 */
function writeTable(state: MarkdownSerializerState, node: ProseNode): void {
  const rows: string[][] = []
  const alignments: Array<string | null> = []

  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell, _offset, index) => {
      if (alignments[index] === undefined) alignments[index] = cell.attrs.alignment ?? null
      cells.push(inlineToText(cell).replace(/\|/g, '\\|').trim())
    })
    rows.push(cells)
  })

  const columns = Math.max(0, ...rows.map((row) => row.length))
  const widths: number[] = []

  for (let column = 0; column < columns; column++) {
    let width = 3
    for (const row of rows) width = Math.max(width, (row[column] ?? '').length)
    widths[column] = width
  }

  const line = (cells: string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 3)).join(' | ')} |`

  const header = rows[0] ?? []
  state.write(line(padTo(header, columns)))
  state.ensureNewLine()

  state.write(
    `| ${widths
      .map((width, column) => delimiter(alignments[column] ?? null, width))
      .join(' | ')} |`,
  )
  state.ensureNewLine()

  for (const row of rows.slice(1)) {
    state.write(line(padTo(row, columns)))
    state.ensureNewLine()
  }

  state.closeBlock(node)
}

function padTo(row: string[], columns: number): string[] {
  return Array.from({ length: columns }, (_, index) => row[index] ?? '')
}

function delimiter(alignment: string | null, width: number): string {
  switch (alignment) {
    case 'center':
      return `:${'-'.repeat(Math.max(1, width - 2))}:`
    case 'right':
      return `${'-'.repeat(Math.max(2, width - 1))}:`
    case 'left':
      return `:${'-'.repeat(Math.max(2, width - 1))}`
    default:
      return '-'.repeat(width)
  }
}

/**
 * Render one cell to a string.
 *
 * A cell has to be measured before the row it belongs to can be written, and
 * the serialiser has no way to render a fragment in isolation. So the cell's
 * content is wrapped in a throwaway paragraph and run through a second
 * serialiser, which is all public API and cheap enough at cell size.
 */
function inlineToText(cell: ProseNode): string {
  const paragraph = markpadSchema.nodes.paragraph!.create(null, cell.content)
  const doc = markpadSchema.nodes.doc!.create(null, [paragraph])

  return cellSerializer.serialize(doc, { tightLists: true }).trim()
}

const marks = {
  em: {
    open: '*',
    close: '*',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  strong: {
    open: '**',
    close: '**',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  strikethrough: {
    open: '~~',
    close: '~~',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  link: {
    open(_state: MarkdownSerializerState, _mark: unknown, parent: ProseNode, index: number) {
      return isPlainAutolink(parent, index) ? '<' : '['
    },
    close(state: MarkdownSerializerState, mark: { attrs: Record<string, unknown> }, parent: ProseNode, index: number) {
      if (isPlainAutolink(parent, index)) return '>'

      const href = String(mark.attrs.href ?? '').replace(/[()"]/g, '\\$&')
      const title = mark.attrs.title
        ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"`
        : ''
      return `](${href}${title})`
    },
    mixable: false,
  },
  code: {
    open(_state: MarkdownSerializerState, _mark: unknown, parent: ProseNode, index: number) {
      return backticksFor(parent.child(index), -1)
    },
    close(_state: MarkdownSerializerState, _mark: unknown, parent: ProseNode, index: number) {
      return backticksFor(parent.child(index - 1), 1)
    },
    escape: false,
  },
}

/**
 * `<https://example.com>` rather than `[https://example.com](https://example.com)`
 * when the link text is the URL. Both render identically; only one is
 * readable, and it is the one people actually type.
 */
function isPlainAutolink(parent: ProseNode, index: number): boolean {
  const node = parent.child(Math.max(0, index === 0 ? 0 : index - 1))
  const link = node.marks.find((mark) => mark.type.name === 'link')
  return link !== undefined && node.isText && node.text === link.attrs.href
}

/** A code span needs more backticks than the longest run inside it. */
function backticksFor(node: ProseNode, side: number): string {
  const runs = /`+/g
  let length = 0

  if (node.isText) {
    let match: RegExpExecArray | null
    while ((match = runs.exec(node.text ?? '')) !== null) {
      length = Math.max(length, match[0].length)
    }
  }

  let result = length > 0 && side > 0 ? ' `' : '`'
  for (let index = 0; index < length; index++) result += '`'
  if (length > 0 && side < 0) result += ' '

  return result
}

export const markdownSerializer = new MarkdownSerializer(nodes, marks)

/** Used only to measure table cells. Same rules, so cells match the rest. */
const cellSerializer = new MarkdownSerializer(nodes, marks)

export function toMarkdown(doc: ProseNode): string {
  // An empty document is an empty file. A blank document is still one empty
  // paragraph in the model, and serialising that produces a newline, which
  // would turn a new and untouched buffer into a one-byte change.
  if (isBlank(doc)) return ''

  const text = markdownSerializer.serialize(doc, { tightLists: true })

  // Files end with a newline. Every tool that touches text expects one, and
  // its absence shows up as "no newline at end of file" in every diff.
  return text.endsWith('\n') ? text : `${text}\n`
}

function isBlank(doc: ProseNode): boolean {
  if (doc.childCount === 0) return true
  if (doc.childCount > 1) return false

  const only = doc.firstChild
  return only?.type.name === 'paragraph' && only.content.size === 0
}
