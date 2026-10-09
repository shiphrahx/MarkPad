// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'
import { ReaderEditor } from '../../src/wysiwyg/editor.js'
import { insertImage, picturesIn } from '../../src/wysiwyg/paste-image.js'

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

const PICTURE = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })

beforeEach(() => {
  resetBufferIds()
  document.body.replaceChildren()
})

describe('pasting a picture', () => {
  it('saves it beside the document and hands back the link', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', 'Text.\n')
    await app.openFiles(['C:/notes/today.md'])

    const link = await app.pasteImage(PICTURE)

    expect(link).toBe('images/pasted-1.png')
    expect([...host.pastedImages.get('images/pasted-1.png')!]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('says to save first when the document has no folder yet', async () => {
    const { app, host } = build()
    app.newFile()

    expect(await app.pasteImage(PICTURE)).toBeNull()
    expect(host.reported).toEqual(['Save the document first, so the picture has a folder to go in.'])
  })

  it('only takes over a paste that is pictures', () => {
    const text = new File(['hi'], 'note.txt', { type: 'text/plain' })
    const image = new File(['x'], 'shot.png', { type: 'image/png' })
    const data = { files: [text, image] } as unknown as DataTransfer

    expect(picturesIn(data)).toEqual([image])
    expect(picturesIn(null)).toEqual([])
  })

  it('puts the image in the document where the cursor is', () => {
    const editor = new ReaderEditor({
      platform: 'windows',
      onChange: () => {},
      onLink: () => {},
      imageUrl: () => null,
    })
    document.body.append(editor.element)
    editor.setMarkdown('Text.\n')

    editor.run((_state, _dispatch, view) => {
      if (view) insertImage(view, 'images/pasted-1.png')
      return true
    })

    expect(editor.getMarkdown()).toContain('![](images/pasted-1.png)')
  })
})
