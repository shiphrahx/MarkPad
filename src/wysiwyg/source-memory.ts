import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import type { Node as ProseNode } from 'prosemirror-model'
import type Token from 'markdown-it/lib/token.mjs'
import { markpadSchema } from './schema.js'
import { toMarkdown } from './serializer.js'

/**
 * Writing back exactly what the file said, for every block nobody touched.
 *
 * Serialising the whole document on save rewrote every line into the
 * serialiser's preferred form: `*` bullets became `-`, `__bold__` became
 * `**bold**`, a hand-padded table lost its padding. On lines nobody edited.
 * One typo fix and the diff was the whole file.
 *
 * So when a file opens, this remembers each top-level block's original text,
 * from the line numbers markdown-it puts on its tokens. ProseMirror never
 * rebuilds a node it did not change, so on save a top-level node that is the
 * very same object as one from the open is written back as its original text.
 * Only blocks that were edited, added or moved go through the serialiser.
 *
 * An unchanged file saves byte for byte, missing final newline and all.
 */
export interface SourceMemory {
  /** The top-level nodes the file opened as, in order. */
  readonly nodes: readonly ProseNode[]
  /** Each one's original text, without the line break after it. */
  readonly texts: readonly string[]
  /** What sat between block i and block i + 1: blank lines, usually. */
  readonly gaps: readonly string[]
  /** Anything before the first block, and after the last. */
  readonly before: string
  readonly after: string
  readonly indexOf: ReadonlyMap<ProseNode, number>
}

/**
 * Remember where each block came from, or null when the tokens and the
 * document do not line up one to one. Null just means saving serialises
 * everything, which is what it always did.
 */
export function rememberSource(
  markdown: string,
  doc: ProseNode,
  tokens: readonly Token[],
): SourceMemory | null {
  const blocks = tokens.filter(
    (token) => token.level === 0 && token.nesting !== -1 && token.block && token.map !== null,
  )
  if (blocks.length === 0 || blocks.length !== doc.childCount) return null

  const lineStarts = startsOfLines(markdown)
  const startOf = (line: number) => lineStarts[line] ?? markdown.length

  const ranges = blocks.map((token) => {
    const [first, last] = token.map!
    const from = startOf(first)
    let to = startOf(last)
    while (to > from && markdown[to - 1] === '\n') to--
    return { from, to }
  })

  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index]!.from < ranges[index - 1]!.to) return null
  }

  const nodes: ProseNode[] = []
  doc.forEach((node) => nodes.push(node))

  return {
    nodes,
    texts: ranges.map(({ from, to }) => markdown.slice(from, to)),
    gaps: ranges.slice(1).map(({ from }, index) => markdown.slice(ranges[index]!.to, from)),
    before: markdown.slice(0, ranges[0]!.from),
    after: markdown.slice(ranges[ranges.length - 1]!.to),
    indexOf: new Map(nodes.map((node, index) => [node, index])),
  }
}

/** The document as Markdown, untouched blocks exactly as they were. */
export function serialisePreserving(doc: ProseNode, memory: SourceMemory | null): string {
  if (memory === null || isBlank(doc)) return toMarkdown(doc)

  const children: ProseNode[] = []
  doc.forEach((node) => children.push(node))

  const origins = matchOrigins(children, memory)

  // Between and around the blocks is usually only blank lines, but it is also
  // where reference definitions live (`[1]: https://...`), which markdown-it
  // reads and keeps no token for. Those are kept whatever happens to the
  // blocks either side, or every `[text][1]` in the file would break.
  let text = origins[0] === 0 || hasContent(memory.before) ? memory.before : ''
  const usedGaps = new Set<number>()

  const gap = (index: number): string => {
    usedGaps.add(index)
    return memory.gaps[index]!
  }
  const unusedWithContent = (index: number): boolean =>
    index >= 0 &&
    index < memory.gaps.length &&
    !usedGaps.has(index) &&
    hasContent(memory.gaps[index]!)

  children.forEach((child, index) => {
    const origin = origins[index]!
    if (index > 0) {
      const previous = origins[index - 1]!
      // The original spacing only means anything between two blocks that
      // were next to each other in the original.
      if (previous !== null && origin !== null && origin === previous + 1) text += gap(previous)
      else if (previous !== null && unusedWithContent(previous)) text += gap(previous)
      else if (origin !== null && unusedWithContent(origin - 1)) text += gap(origin - 1)
      else text += '\n\n'
    }
    text += origin === null ? serialiseBlock(child) : memory.texts[origin]!
  })

  const last = origins[origins.length - 1]
  text += last === memory.nodes.length - 1 || hasContent(memory.after) ? memory.after : '\n'
  return text
}

function hasContent(text: string): boolean {
  return /\S/.test(text)
}

/**
 * Which original block each child is, or null for one that changed.
 *
 * Identity first, which is what an untouched node keeps. Then equality with
 * the block that would be next in line, which catches an edit that was undone:
 * undo builds a new node with the old content, and that should still come
 * back as the old text.
 */
function matchOrigins(children: readonly ProseNode[], memory: SourceMemory): Array<number | null> {
  let expected = 0

  return children.map((child) => {
    let origin = memory.indexOf.get(child) ?? null
    if (origin === null) {
      const candidate = memory.nodes[expected]
      if (candidate !== undefined && child.eq(candidate)) origin = expected
    }
    expected = (origin ?? expected) + 1
    return origin
  })
}

function serialiseBlock(node: ProseNode): string {
  return toMarkdown(markpadSchema.topNodeType.create(null, node)).replace(/\n+$/, '')
}

function isBlank(doc: ProseNode): boolean {
  const only = doc.firstChild
  return doc.childCount === 0 || (doc.childCount === 1 && only?.type.name === 'paragraph' && only.content.size === 0)
}

function startsOfLines(text: string): number[] {
  const starts = [0]
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1)
  }
  return starts
}

const key = new PluginKey<SourceMemory | null>('source-memory')

/**
 * Carries the memory inside the editor state, so it travels with the state
 * when a tab is switched away from and back to, undo history and all.
 */
export function sourceMemory(memory: SourceMemory | null): Plugin<SourceMemory | null> {
  return new Plugin({
    key,
    state: {
      init: () => memory,
      apply: (_transaction, value) => value,
    },
  })
}

export function memoryOf(state: EditorState): SourceMemory | null {
  return key.getState(state) ?? null
}
