import { describe, expect, it } from 'vitest'
import { escapeHtml, findInlineMath, render } from '../../src/preview/render.js'

describe('render', () => {
  it('renders a heading', () => {
    expect(render('# Title\n').html).toContain('<h1>Title</h1>')
  })

  it('renders a GFM table', () => {
    const { html } = render('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders GFM strikethrough', () => {
    expect(render('~~gone~~\n').html).toContain('<del>gone</del>')
  })

  it('renders a task list', () => {
    expect(render('- [x] done\n').html).toContain('checked')
  })

  it('does not turn a single newline into a line break', () => {
    // Markdown says a lone newline is a space. Turning it into <br> makes
    // every hard-wrapped paragraph render wrong.
    expect(render('one\ntwo\n').html).not.toContain('<br')
  })

  it('leaves a mermaid block as a placeholder', () => {
    const { html, blocks } = render('```mermaid\ngraph TD;\nA-->B;\n```\n')

    expect(html).toContain('data-block-id="block-1"')
    expect(html).not.toContain('graph TD')
    expect(blocks).toEqual([
      { kind: 'mermaid', id: 'block-1', source: 'graph TD;\nA-->B;' },
    ])
  })

  it('leaves a math block as a placeholder', () => {
    const { blocks } = render('```math\nE = mc^2\n```\n')
    expect(blocks[0]).toEqual({ kind: 'math', id: 'block-1', source: 'E = mc^2' })
  })

  it('numbers several placeholders in document order', () => {
    const { blocks } = render('```mermaid\na\n```\n\ntext\n\n```math\nb\n```\n')
    expect(blocks.map((block) => block.id)).toEqual(['block-1', 'block-2'])
  })

  it('leaves an ordinary code fence alone', () => {
    const { html, blocks } = render('```js\nconst x = 1\n```\n')
    expect(blocks).toEqual([])
    expect(html).toContain('const x = 1')
  })
})

describe('findInlineMath', () => {
  it('finds inline maths', () => {
    const found = findInlineMath('the value $x + 1$ matters')
    expect(found).toHaveLength(1)
    expect(found[0]?.source).toBe('x + 1')
    expect(found[0]?.display).toBe(false)
  })

  it('finds display maths', () => {
    const found = findInlineMath('$$x^2$$')
    expect(found[0]?.display).toBe(true)
    expect(found[0]?.source).toBe('x^2')
  })

  it('leaves a price alone', () => {
    expect(findInlineMath('it cost $5 and then $10 more')).toEqual([])
  })

  it('will not span a blank line', () => {
    expect(findInlineMath('$a\n\nb$')).toEqual([])
  })

  it('reports where it found things so the popover can anchor', () => {
    const found = findInlineMath('ab $c$ d')
    expect(found[0]?.from).toBe(3)
    expect(found[0]?.to).toBe(6)
  })
})

describe('escapeHtml', () => {
  it('escapes the characters that would break out of an attribute or a tag', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    )
  })
})
