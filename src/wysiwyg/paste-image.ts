import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

/**
 * Pasting a picture into the document.
 *
 * The picture has to become a file before Markdown can point at it, and
 * writing files is not this editor's business, so `save` is handed in. It
 * resolves to the link to insert, or null when the picture was not saved,
 * in which case the paste does nothing and whoever saved it has already said
 * why.
 *
 * Only pastes that are nothing but pictures are taken over. Text with a
 * picture attached, which is what copying from a web page gives you, goes to
 * ProseMirror as usual.
 */
export function pasteImages(save: (file: File) => Promise<string | null>): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const files = picturesIn(event.clipboardData)
        if (files.length === 0) return false
        if (event.clipboardData?.getData('text/plain')) return false

        event.preventDefault()
        void insertAll(view, files, save)
        return true
      },
    },
  })
}

export function picturesIn(data: DataTransfer | null): File[] {
  if (!data) return []
  return [...data.files].filter((file) => file.type.startsWith('image/'))
}

async function insertAll(
  view: EditorView,
  files: readonly File[],
  save: (file: File) => Promise<string | null>,
): Promise<void> {
  for (const file of files) {
    const src = await save(file)
    if (src !== null) insertImage(view, src)
  }
}

/** Put an image where the cursor is. */
export function insertImage(view: EditorView, src: string): void {
  const type = view.state.schema.nodes.image
  if (!type) return

  view.dispatch(
    view.state.tr.replaceSelectionWith(type.create({ src, alt: '', title: null })).scrollIntoView(),
  )
}
