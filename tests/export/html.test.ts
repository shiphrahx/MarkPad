import { describe, expect, it } from 'vitest'
import { buildHtmlDocument, htmlNameFor, pdfNameFor } from '../../src/export/html.js'

describe('buildHtmlDocument', () => {
  const document = buildHtmlDocument({ title: 'Notes', bodyHtml: '<p>Hello</p>' })

  it('is a whole html file', () => {
    expect(document.startsWith('<!doctype html>')).toBe(true)
    expect(document).toContain('</html>')
  })

  it('carries its styles inline, with nothing to link to', () => {
    expect(document).toContain('.markpad-document')
    expect(document).not.toContain('<link')
  })

  it('escapes the title rather than letting it close the tag', () => {
    const risky = buildHtmlDocument({
      title: 'A </title><script>alert(1)</script>',
      bodyHtml: '',
    })
    expect(risky).not.toContain('<script>alert(1)</script>')
    expect(risky).toContain('&lt;/title&gt;')
  })

  it('carries a policy so a script in the file cannot run in a browser', () => {
    expect(document).toContain("default-src 'none'")
  })

  it('takes extra styles when the document has maths in it', () => {
    const withMath = buildHtmlDocument({
      title: 'Maths',
      bodyHtml: '',
      extraCss: '.katex { font-size: 1.1em; }',
    })
    expect(withMath).toContain('.katex')
  })
})

describe('names', () => {
  it('swaps a markdown extension for html', () => {
    expect(htmlNameFor('notes.md')).toBe('notes.html')
    expect(htmlNameFor('notes.markdown')).toBe('notes.html')
  })

  it('adds the extension when there was not one', () => {
    expect(htmlNameFor('notes')).toBe('notes.html')
  })

  it('leaves a dot in the middle of a name alone', () => {
    expect(htmlNameFor('v0.1 notes.md')).toBe('v0.1 notes.html')
  })

  it('does the same for pdf', () => {
    expect(pdfNameFor('notes.md')).toBe('notes.pdf')
  })
})
