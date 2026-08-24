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

  it('says so in the document when a diagram cannot be drawn', async () => {
    const html = await renderForExport(buffer('```mermaid\nnot a diagram\n```\n'))
    expect(html).toContain('mp-block-error')
  })
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
})
