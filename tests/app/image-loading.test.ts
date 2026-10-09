// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'
import { resolveImagesIn } from '../../src/app/images.js'

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

describe('imageUrl', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  it('resolves against the folder the open file is in', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '# Today\n')
    await app.openFiles(['C:/notes/today.md'])

    expect(app.imageUrl('diagram.png')).toBe('markpad-image://C:/notes/diagram.png')
  })

  /**
   * The old asset protocol was scoped to the file's own folder, not
   * recursively, so the most common layout there is showed broken images.
   */
  it('resolves a picture in a subfolder', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '# Today\n')
    await app.openFiles(['C:/notes/today.md'])

    expect(app.imageUrl('images/diagram.png')).toBe('markpad-image://C:/notes/images/diagram.png')
  })

  it('resolves a picture in a folder beside this one', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '# Today\n')
    await app.openFiles(['C:/notes/today.md'])

    expect(app.imageUrl('../assets/diagram.png')).toBe('markpad-image://C:/notes/../assets/diagram.png')
  })

  it('has no answer for a picture on the web', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '# Today\n')
    await app.openFiles(['C:/notes/today.md'])

    expect(app.imageUrl('https://example.com/cat.png')).toBeNull()
  })

  it('has no answer for a buffer that was never saved', () => {
    const { app } = build()
    app.newFile()

    expect(app.imageUrl('diagram.png')).toBeNull()
  })
})

describe('the reader', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  it('points an image at the file it actually means', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '![A chart](chart.png)\n')

    await app.openFiles(['C:/notes/today.md'])

    const image = document.querySelector<HTMLImageElement>('.markpad-document img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe('markpad-image://C:/notes/chart.png')
    expect(image?.alt).toBe('A chart')
  })

  /**
   * The Markdown source is kept on the element. What the serialiser writes back
   * comes off the document rather than the DOM, but a picture that did not
   * appear should still say what it was looking for.
   */
  it('keeps what the file said next to what it loaded', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '![](chart.png)\n')

    await app.openFiles(['C:/notes/today.md'])

    const image = document.querySelector<HTMLImageElement>('.markpad-document img')
    expect(image?.dataset.src).toBe('chart.png')
  })

  it('marks a picture it will not fetch rather than leaving a broken one', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '![A cat](https://example.com/cat.png)\n')

    await app.openFiles(['C:/notes/today.md'])

    const image = document.querySelector<HTMLImageElement>('.markpad-document img')
    expect(image?.hasAttribute('src')).toBe(false)
    expect(image?.dataset.unresolved).toBe('true')
    expect(image?.alt).toBe('A cat')
  })

  /**
   * Saving has to write back what the file said, not the asset URL the window
   * was handed. Otherwise opening a document and saving it rewrites every
   * image path into something only this machine can read.
   */
  it('writes the original path back out again', async () => {
    const { app, host } = build()
    host.seed('C:/notes/today.md', '![A chart](chart.png)\n')

    await app.openFiles(['C:/notes/today.md'])
    await app.save(app.workspace.active!.id)

    expect(host.raw('C:/notes/today.md')).toContain('](chart.png)')
    expect(host.raw('C:/notes/today.md')).not.toContain('markpad-image://')
  })
})

describe('resolveImagesIn', () => {
  it('rewrites what it can and marks what it cannot', () => {
    const holder = document.createElement('div')
    holder.innerHTML =
      '<img src="local.png"><img src="https://example.com/cat.png"><img src="">'

    resolveImagesIn(holder, (src) => (src === 'local.png' ? 'markpad-image://x/local.png' : null))

    const images = [...holder.querySelectorAll('img')]
    expect(images[0]?.getAttribute('src')).toBe('markpad-image://x/local.png')
    expect(images[0]?.hasAttribute('data-unresolved')).toBe(false)
    expect(images[1]?.hasAttribute('src')).toBe(false)
    expect(images[1]?.getAttribute('data-unresolved')).toBe('true')
    expect(images[2]?.getAttribute('data-src')).toBe('')
  })
})
