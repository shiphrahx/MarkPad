import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { formatShortcut } from '../commands/keys.js'
import type { Platform } from '../host/types.js'

/**
 * What an empty document says.
 *
 * A blank rendered surface is indistinguishable from a broken one: no cursor
 * you can see until you click, nothing to click on, and no sign that typing a
 * slash or pressing the palette key would do anything. One line of grey text
 * fixes all three.
 *
 * It goes in an attribute and comes out through CSS `content`, so the text is
 * never part of the document and cannot be selected, copied or serialised.
 */
export function placeholder(platform: Platform): Plugin {
  const palette = formatShortcut('Mod+K', platform)
  const text = `Start writing. Type / for blocks, or press ${palette} for everything else.`

  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state

        const isEmpty =
          doc.childCount === 1 &&
          doc.firstChild?.type.name === 'paragraph' &&
          doc.firstChild.content.size === 0

        if (!isEmpty) return null

        return DecorationSet.create(doc, [
          Decoration.node(0, doc.firstChild!.nodeSize, {
            class: 'pm-placeholder',
            'data-placeholder': text,
          }),
        ])
      },
    },
  })
}
