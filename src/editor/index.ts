import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markpadExtensions } from './setup.js'

export interface EditorOptions {
  /** Starting contents. LF only, as everywhere inside the editor. */
  readonly doc?: string
  readonly onChange?: (doc: string) => void
}

/**
 * Mount an editor into `parent`.
 *
 * Nothing in this file or anything it imports knows Tauri exists, which is what
 * lets the whole editor run under Node in tests.
 */
export function createEditor(parent: HTMLElement, options: EditorOptions = {}): EditorView {
  const { doc = '', onChange } = options

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        ...markpadExtensions(),
        ...(onChange
          ? [
              EditorView.updateListener.of((update) => {
                if (update.docChanged) onChange(update.state.doc.toString())
              }),
            ]
          : []),
      ],
    }),
  })

  return view
}

export { markpadExtensions } from './setup.js'
export { markpadHighlighting, markpadTheme } from './theme.js'
