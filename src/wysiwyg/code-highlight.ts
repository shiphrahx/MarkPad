import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import type { Node as ProseNode } from 'prosemirror-model'

/**
 * Syntax highlighting for code blocks in the rendered surface.
 *
 * Source view highlighted code and reader mode showed it as grey text, which
 * is backwards: the mode meant to look like the finished document was the one
 * that looked less finished.
 *
 * lowlight is loaded on demand, the first time a document containing a code
 * block with a language is opened. A document of prose never pays for it, and
 * the cold start budget has no room for a highlighter nobody asked for.
 */

const key = new PluginKey<DecorationSet>('codeHighlight')

type Lowlight = {
  highlight: (language: string, value: string) => HastRoot
  registered: (language: string) => boolean
}

interface HastRoot {
  children: HastNode[]
}

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; properties?: { className?: string[] }; children: HastNode[] }

let lowlight: Lowlight | null = null
let loading: Promise<void> | null = null

/**
 * Common languages only.
 *
 * `all` is most of a megabyte and covers things nobody writes in a Markdown
 * file. This list is what actually turns up in a README, and an unknown
 * language falls back to plain text rather than breaking.
 */
async function load(): Promise<void> {
  loading ??= import('lowlight').then((module) => {
    lowlight = module.createLowlight(module.common) as unknown as Lowlight
  })
  return loading
}

export function codeHighlight() {
  return new Plugin<DecorationSet>({
    key,

    state: {
      init: (_config, state) => build(state),
      apply(transaction, previous, _old, state) {
        // A refresh is asked for once the highlighter finishes loading, since
        // nothing about the document changed at that moment.
        if (!transaction.docChanged && !transaction.getMeta(key)) return previous
        return build(state)
      },
    },

    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty
      },
    },

    view: (view) => {
      let stillMounted = true

      // Kicked off outside the state machinery, because a plugin's state
      // cannot wait for a promise.
      if (hasHighlightableCode(view.state)) {
        void load().then(() => {
          if (!stillMounted) return
          view.dispatch(view.state.tr.setMeta(key, 'loaded'))
        })
      }

      return {
        update(updated) {
          if (lowlight !== null || !hasHighlightableCode(updated.state)) return
          void load().then(() => {
            if (!stillMounted) return
            updated.dispatch(updated.state.tr.setMeta(key, 'loaded'))
          })
        },
        destroy() {
          stillMounted = false
        },
      }
    },
  })
}

function hasHighlightableCode(state: EditorState): boolean {
  let found = false
  state.doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'code_block' && String(node.attrs.language ?? '') !== '') {
      found = true
    }
    return !found
  })
  return found
}

function build(state: EditorState): DecorationSet {
  if (lowlight === null) return DecorationSet.empty

  const decorations: Decoration[] = []

  state.doc.descendants((node, position) => {
    if (node.type.name !== 'code_block') return

    const language = String(node.attrs.language ?? '')
    if (language === '' || !lowlight!.registered(language)) return

    let tree: HastRoot
    try {
      tree = lowlight!.highlight(language, node.textContent)
    } catch {
      // A language that fails to parse is not worth losing the block over.
      return
    }

    // +1 to step inside the code_block node itself.
    walk(tree.children, position + 1, [], decorations)
  })

  return DecorationSet.create(state.doc, decorations)
}

/**
 * Walk the highlighter's tree, turning each run of text into a decoration.
 *
 * Offsets come from the lengths of the text nodes, which line up with the
 * document because the tree was built from exactly this text.
 */
function walk(
  nodes: readonly HastNode[],
  start: number,
  classes: readonly string[],
  into: Decoration[],
): number {
  let at = start

  for (const node of nodes) {
    if (node.type === 'text') {
      if (classes.length > 0 && node.value.length > 0) {
        into.push(Decoration.inline(at, at + node.value.length, { class: classes.join(' ') }))
      }
      at += node.value.length
      continue
    }

    const own = node.properties?.className ?? []
    at = walk(node.children, at, [...classes, ...own], into)
  }

  return at
}
