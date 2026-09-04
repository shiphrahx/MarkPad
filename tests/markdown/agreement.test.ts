import { describe, expect, it } from 'vitest'
import { markdownParser } from '../../src/wysiwyg/parser.js'
import { render } from '../../src/preview/render.js'
import type { Node as ProseNode } from 'prosemirror-model'

/**
 * The editor and the preview reading the same file the same way.
 *
 * They used to be two different libraries, so a document could mean one thing
 * in the window and another in the exported PDF. These are the constructs where
 * the two actually disagreed, asserted from both ends: what the editor built,
 * and what the preview drew.
 *
 * If one of these ever fails on one side only, the parsers have come apart
 * again.
 */
function firstBlock(markdown: string): ProseNode {
  return markdownParser.parse(markdown).firstChild!
}

describe('the editor and the preview agree about', () => {
  it('a task list', () => {
    const item = firstBlock('- [x] done\n').firstChild!

    expect(item.attrs.checked).toBe(true)
    expect(render('- [x] done\n').html).toContain('type="checkbox"')
    expect(render('- [x] done\n').html).toContain('checked')
  })

  it('an unticked task', () => {
    expect(firstBlock('- [ ] later\n').firstChild!.attrs.checked).toBe(false)

    const html = render('- [ ] later\n').html
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain(' checked')
  })

  /**
   * The marker has to be gone from the text on both sides, or the editor shows
   * a checkbox followed by a literal `[x]`.
   */
  it('taking the marker out of the text', () => {
    expect(firstBlock('- [x] done\n').textContent).toBe('done')
    expect(render('- [x] done\n').html).not.toContain('[x]')
  })

  it('an ordinary list item, which is not a task', () => {
    expect(firstBlock('- plain\n').firstChild!.attrs.checked).toBeNull()
    expect(render('- plain\n').html).not.toContain('checkbox')
  })

  it('strikethrough, and which tag it gets', () => {
    const marks = firstBlock('~~gone~~\n').firstChild!.marks
    expect(marks.map((mark) => mark.type.name)).toEqual(['strikethrough'])
    expect(render('~~gone~~\n').html).toContain('<del>gone</del>')
  })

  it('a table', () => {
    const source = '| a | b |\n| - | - |\n| 1 | 2 |\n'

    expect(firstBlock(source).type.name).toBe('table')
    expect(render(source).html).toContain('<table>')
  })

  it('a lone newline being a space rather than a break', () => {
    // One paragraph with a space in it on both sides, not two lines and not a
    // hard break. Getting this wrong makes every hard-wrapped paragraph render
    // as a ragged column.
    expect(firstBlock('one\ntwo\n').textContent).toBe('one two')
    expect(firstBlock('one\ntwo\n').childCount).toBe(1)
    expect(render('one\ntwo\n').html).not.toContain('<br')
  })

  /**
   * Raw HTML is the one place they deliberately differ, and it is worth
   * pinning so the difference stays a decision. The editor keeps it whole and
   * shows it as literal text, because it cannot be edited as rich text. The
   * preview renders it, because that is the finished document.
   */
  it('keeping raw HTML whole, and differ only in what they draw', () => {
    const source = '<details><summary>More</summary></details>\n'

    const block = firstBlock(source)
    expect(block.type.name).toBe('html_block')
    expect(block.attrs.html).toBe('<details><summary>More</summary></details>')

    expect(render(source).html).toContain('<details>')
  })
})

/**
 * Fences that are drawn rather than highlighted used to be found with a
 * regular expression run over the Markdown before parsing. These are the three
 * things it got wrong that the parser gets right.
 */
describe('finding drawn fences', () => {
  it('finds one indented inside a list item', () => {
    const { blocks } = render('- item\n\n  ```mermaid\n  graph TD;\n  ```\n')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('mermaid')
  })

  it('finds one that was never closed', () => {
    const { blocks, html } = render('```mermaid\ngraph TD;\n')

    expect(blocks).toHaveLength(1)
    expect(html).toContain('data-block-id="block-1"')
  })

  it('leaves a mermaid fence inside a code block alone', () => {
    const source = '````\n```mermaid\ngraph TD;\n```\n````\n'

    expect(render(source).blocks).toEqual([])
  })

  it('still leaves an ordinary fence as code', () => {
    const { html, blocks } = render('```js\nconst x = 1\n```\n')

    expect(blocks).toEqual([])
    expect(html).toContain('const x = 1')
  })

  it('treats math and latex as the same thing', () => {
    expect(render('```math\na\n```\n').blocks[0]?.kind).toBe('math')
    expect(render('```latex\na\n```\n').blocks[0]?.kind).toBe('math')
  })
})
