// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { drawInlineMathIn } from '../../src/preview/draw.js'

function fragment(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('drawInlineMathIn', () => {
  it('draws every equation in a paragraph and keeps the text between them', async () => {
    const root = fragment('<p>first $a$ then $b$ done</p>')

    await drawInlineMathIn(root)

    expect(root.querySelectorAll('.mp-math')).toHaveLength(2)
    expect(root.textContent).toContain('first ')
    expect(root.textContent).toContain(' done')
  })

  it('leaves dollar signs in code alone', async () => {
    const root = fragment('<p><code>$x$</code></p>')

    await drawInlineMathIn(root)

    expect(root.querySelector('.mp-math')).toBeNull()
    expect(root.querySelector('code')?.textContent).toBe('$x$')
  })

  it('marks display maths differently from inline', async () => {
    const root = fragment('<p>$$x^2$$</p>')

    await drawInlineMathIn(root)

    expect(root.querySelector('.mp-math-display')).not.toBeNull()
  })

  it('draws MathML only when asked to, for exported files', async () => {
    const root = fragment('<p>$x$</p>')

    await drawInlineMathIn(root, { output: 'mathml' })

    expect(root.querySelector('math')).not.toBeNull()
    expect(root.querySelector('.katex-html')).toBeNull()
  })
})
