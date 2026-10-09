import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/**
 * Marks the top-level block the cursor is in with `pm-current`.
 *
 * Focus mode dims everything else, and that is all this is for. One node
 * decoration per selection change, so it costs nothing worth measuring even
 * when focus mode is off and the class does nothing.
 */
export function currentBlock(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $head } = state.selection
        if ($head.depth < 1) return null

        const start = $head.before(1)
        const node = state.doc.child($head.index(0))
        return DecorationSet.create(state.doc, [
          Decoration.node(start, start + node.nodeSize, { class: 'pm-current' }),
        ])
      },
    },
  })
}
