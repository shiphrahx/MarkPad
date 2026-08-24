import { describe, expect, it } from 'vitest'
import { extractHeadings } from '../../src/app/outline.js'

describe('extractHeadings', () => {
  it('finds nothing in a document with no headings', () => {
    expect(extractHeadings('just some prose\n')).toEqual([])
  })

  it('reads the level off the number of hashes', () => {
    const headings = extractHeadings('# One\n## Two\n###### Six\n')
    expect(headings.map((heading) => heading.level)).toEqual([1, 2, 6])
  })

  it('stops at six hashes, because seven is not a heading', () => {
    expect(extractHeadings('####### Nope\n')).toEqual([])
  })

  it('keeps the text without the marker', () => {
    expect(extractHeadings('## A heading\n')[0]?.text).toBe('A heading')
  })

  it('drops a closing run of hashes', () => {
    expect(extractHeadings('## Tidy ##\n')[0]?.text).toBe('Tidy')
  })

  it('reports the line and the offset so the rail can scroll to it', () => {
    const headings = extractHeadings('intro\n\n## Second\n')
    expect(headings[0]?.line).toBe(2)
    expect(headings[0]?.offset).toBe(7)
  })

  it('ignores a hash inside a fenced code block', () => {
    const text = '# Real\n\n```sh\n# a shell comment\n```\n\n## Also real\n'
    expect(extractHeadings(text).map((heading) => heading.text)).toEqual([
      'Real',
      'Also real',
    ])
  })

  it('ignores hashes in a tilde fence too', () => {
    const text = '~~~\n# not a heading\n~~~\n'
    expect(extractHeadings(text)).toEqual([])
  })

  it('does not let a backtick fence be closed by a tilde one', () => {
    const text = '```\n~~~\n# still inside the code block\n```\n# out\n'
    expect(extractHeadings(text).map((heading) => heading.text)).toEqual(['out'])
  })

  it('reads setext headings', () => {
    const headings = extractHeadings('Title\n=====\n\nSubtitle\n--------\n')
    expect(headings).toEqual([
      { level: 1, text: 'Title', line: 0, offset: 0 },
      { level: 2, text: 'Subtitle', line: 3, offset: 13 },
    ])
  })

  it('does not treat a horizontal rule as a setext heading', () => {
    expect(extractHeadings('\n---\n')).toEqual([])
  })

  it('handles an empty heading', () => {
    expect(extractHeadings('#\n')[0]).toEqual({
      level: 1,
      text: '',
      line: 0,
      offset: 0,
    })
  })

  it('copes with CRLF text having already been normalised', () => {
    expect(extractHeadings('# One\n## Two\n')).toHaveLength(2)
  })
})
