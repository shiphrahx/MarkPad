// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanHtml, render } from '../../src/preview/render.js'

describe('raw HTML in a document', () => {
  it('keeps the tags people actually use in Markdown', () => {
    const html = '<details><summary>More</summary><kbd>Ctrl</kbd> <sup>1</sup></details>'

    expect(cleanHtml(html)).toBe(html)
  })

  it('takes out a script', () => {
    expect(cleanHtml('<div><script>alert(1)</script>hi</div>')).toBe('<div>hi</div>')
  })

  it('takes out an event handler', () => {
    expect(cleanHtml('<img src="x.png" onerror="alert(1)">')).not.toContain('onerror')
  })

  it('takes out a javascript: link', () => {
    expect(cleanHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('takes out a form, which could post what is typed into it', () => {
    const cleaned = cleanHtml('<form action="https://example.com"><input name="q"></form>')

    expect(cleaned).not.toContain('<form')
    expect(cleaned).not.toContain('<input')
  })

  it('takes out a base tag, which would repoint every relative URL', () => {
    expect(cleanHtml('<base href="https://example.com/">')).not.toContain('<base')
  })

  it('takes out a meta refresh', () => {
    expect(cleanHtml('<meta http-equiv="refresh" content="0;url=https://example.com">')).toBe('')
  })

  it('is what the renderer uses for an HTML block', () => {
    const { html } = render('<div onclick="alert(1)">hello</div>\n')

    expect(html).toContain('hello')
    expect(html).not.toContain('onclick')
  })
})
