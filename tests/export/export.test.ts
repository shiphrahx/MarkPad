// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { exportHtml, renderForExport } from '../../src/export/export.js'
import { bufferFromDocument, resetBufferIds } from '../../src/app/buffer.js'
import type { Buffer } from '../../src/app/buffer.js'
import { MemoryHost } from '../../src/host/memory.js'

function buffer(text: string, path = 'C:/notes.md'): Buffer {
  return bufferFromDocument({
    path,
    text,
    lineEnding: 'lf',
    encoding: 'utf-8',
    byteLength: text.length,
  })
}

describe('renderForExport', () => {
  beforeEach(() => resetBufferIds())

  it('produces a whole html file', async () => {
    const html = await renderForExport(buffer('# Title\n\nBody.\n'))

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<h1>Title</h1>')
  })

  it('titles the document after the file, without its extension', async () => {
    const html = await renderForExport(buffer('x\n', 'C:/notes/My draft.md'))
    expect(html).toContain('<title>My draft</title>')
  })

  it('renders maths as MathML, so the file needs no fonts', async () => {
    const html = await renderForExport(buffer('The value $x^2$ here.\n'))

    expect(html).toContain('<math')
    expect(html).not.toContain('katex-html')
  })

  it('renders a display maths block', async () => {
    const html = await renderForExport(buffer('```math\nE = mc^2\n```\n'))
    expect(html).toContain('<math')
  })

  it('leaves maths inside a code span alone', async () => {
    const html = await renderForExport(buffer('Write `$x$` for maths.\n'))

    expect(html).not.toContain('<math')
    expect(html).toContain('<code>$x$</code>')
  })

  it('keeps a table', async () => {
    const html = await renderForExport(buffer('| a | b |\n| - | - |\n| 1 | 2 |\n'))
    expect(html).toContain('<table>')
  })

  /**
   * Thirty seconds because this is the test that pays for Mermaid. It is
   * imported on demand, this is the first thing in the suite to ask for it,
   * and on a cold module cache loading and initialising it takes a good deal
   * longer than the five second default. Warm, it runs in milliseconds.
   */
  it('says so in the document when a diagram cannot be drawn', async () => {
    const html = await renderForExport(buffer('```mermaid\nnot a diagram\n```\n'))
    expect(html).toContain('mp-block-error')
  }, 30_000)
})

describe('exportHtml', () => {
  beforeEach(() => resetBufferIds())

  it('writes the file where the dialog said', async () => {
    const host = new MemoryHost('windows')
    host.queueSavePick('C:/notes.html')

    expect(await exportHtml(buffer('# Title\n'), host)).toBe(true)
    expect(host.raw('C:/notes.html')).toContain('<h1>Title</h1>')
  })

  it('suggests the markdown file name with an html extension', async () => {
    const host = new MemoryHost('windows')
    host.queueSavePick('C:/out.html')

    await exportHtml(buffer('x\n', 'C:/notes.md'), host)

    expect(host.suggestedNames).toEqual(['notes.html'])
  })

  it('does nothing when the dialog is cancelled', async () => {
    const host = new MemoryHost('windows')
    host.queueSavePick(null)

    expect(await exportHtml(buffer('# Title\n'), host)).toBe(false)
  })

  /**
   * An exported file is a new file, so it gets the platform's own habit rather
   * than whatever the Markdown source happened to use. The buffer here is LF
   * either way, which is the point: the source's ending is not consulted.
   */
  it('writes CRLF on Windows and LF on the other two', async () => {
    const windows = new MemoryHost('windows')
    windows.queueSavePick('C:/notes.html')
    await exportHtml(buffer('# Title\n'), windows)
    expect(windows.raw('C:/notes.html')).toContain('\r\n')

    const linux = new MemoryHost('linux')
    linux.queueSavePick('/home/cassia/notes.html')
    await exportHtml(buffer('# Title\n'), linux)
    expect(linux.raw('/home/cassia/notes.html')).not.toContain('\r')

    const mac = new MemoryHost('macos')
    mac.queueSavePick('/Users/cassia/notes.html')
    await exportHtml(buffer('# Title\n'), mac)
    expect(mac.raw('/Users/cassia/notes.html')).not.toContain('\r')
  })
})
