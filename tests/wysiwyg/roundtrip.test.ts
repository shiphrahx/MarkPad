import { describe, expect, it } from 'vitest'
import { markdownParser } from '../../src/wysiwyg/parser.js'
import { toMarkdown } from '../../src/wysiwyg/serializer.js'

/** Markdown in, document, Markdown out. What saving a file actually does. */
function trip(markdown: string): string {
  return toMarkdown(markdownParser.parse(markdown))
}

/**
 * The property that matters: a file that has been through once does not keep
 * changing. The first pass may reformat, but the second must be identical to
 * the first, or every save rewrites the file again and the diffs never settle.
 */
function isStable(markdown: string): boolean {
  const once = trip(markdown)
  return trip(once) === once
}

describe('survives the round trip unchanged', () => {
  const unchanged: ReadonlyArray<[string, string]> = [
    ['a paragraph', 'Just some prose.\n'],
    ['a heading', '# Title\n'],
    ['every heading level', '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n'],
    ['bold', 'Some **bold** text.\n'],
    ['italic', 'Some *italic* text.\n'],
    ['strikethrough', 'Some ~~struck~~ text.\n'],
    ['inline code', 'Some `code` here.\n'],
    ['a link', 'A [link](https://example.com) here.\n'],
    ['a link with a title', 'A [link](https://example.com "Title") here.\n'],
    ['an image', '![alt text](image.png)\n'],
    ['a bullet list', '- one\n- two\n- three\n'],
    ['a numbered list', '1. one\n2. two\n3. three\n'],
    ['a blockquote', '> Quoted.\n'],
    ['a fenced code block', '```js\nconst x = 1\n```\n'],
    ['a code block with no language', '```\nplain\n```\n'],
    ['a horizontal rule', 'Above.\n\n---\n\nBelow.\n'],
    ['a task list', '- [ ] not done\n- [x] done\n'],
    ['a nested list', '- one\n  - nested\n- two\n'],
    ['several paragraphs', 'One.\n\nTwo.\n\nThree.\n'],
    ['an empty document', ''],
  ]

  it.each(unchanged)('%s', (_name, markdown) => {
    expect(trip(markdown)).toBe(markdown)
  })
})

describe('tables', () => {
  it('keeps a table that is already padded', () => {
    const table = '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n'
    expect(trip(table)).toBe(table)
  })

  it('pads a table that was not padded, then leaves it alone', () => {
    const cramped = '|a|b|\n|-|-|\n|1|2|\n'
    const once = trip(cramped)

    expect(once).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |\n')
    expect(trip(once)).toBe(once)
  })

  it('keeps column alignment', () => {
    const aligned = '| left | centre | right |\n| :--- | :----: | ----: |\n| a    | b      | c     |\n'
    expect(isStable(aligned)).toBe(true)
    expect(trip(aligned)).toContain(':--')
    expect(trip(aligned)).toContain('--:')
  })

  it('keeps formatting inside a cell', () => {
    const table = '| a        | b   |\n| -------- | --- |\n| **bold** | `x` |\n'
    expect(trip(table)).toContain('**bold**')
    expect(trip(table)).toContain('`x`')
  })

  it('escapes a pipe inside a cell rather than breaking the table', () => {
    const result = trip('| a     | b   |\n| ----- | --- |\n| x \\| y | z   |\n')
    expect(result).toContain('x \\| y')
    expect(isStable(result)).toBe(true)
  })
})

describe('the reformatting it does do', () => {
  // These are the losses. Each one is a deliberate choice, and each one shows
  // up in a diff on a line nobody edited. Written down so a change to any of
  // them is a decision rather than an accident.

  it('rewrites underscore emphasis as asterisks', () => {
    expect(trip('_italic_\n')).toBe('*italic*\n')
  })

  it('rewrites asterisk bullets as hyphens', () => {
    expect(trip('* one\n* two\n')).toBe('- one\n- two\n')
  })

  it('rejoins a hard-wrapped paragraph onto one line', () => {
    expect(trip('One sentence\nwrapped over lines.\n')).toBe(
      'One sentence wrapped over lines.\n',
    )
  })

  it('renumbers a list that was all ones', () => {
    expect(trip('1. one\n1. two\n')).toBe('1. one\n2. two\n')
  })

  it('rewrites a setext heading as hashes', () => {
    expect(trip('Title\n=====\n')).toBe('# Title\n')
  })

  it('rewrites two trailing spaces as a backslash break', () => {
    expect(trip('one  \ntwo\n')).toBe('one\\\ntwo\n')
  })
})

describe('stability', () => {
  const documents: ReadonlyArray<[string, string]> = [
    ['underscores', '_italic_ and __bold__\n'],
    ['asterisk bullets', '* one\n* two\n'],
    ['hard wrapping', 'One sentence\nwrapped over lines.\n'],
    ['lazy numbering', '1. one\n1. two\n'],
    ['setext headings', 'Title\n=====\n\nSub\n---\n'],
    ['mixed everything', '# Title\n\nSome **bold** and _italic_.\n\n* a\n* b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n'],
    ['nested quotes and lists', '> - one\n>   - two\n>\n> Text.\n'],
    ['code containing backticks', '````\n```\nnested\n```\n````\n'],
    ['a task list inside a quote', '> - [x] done\n'],
  ]

  it.each(documents)('settles after one pass: %s', (_name, markdown) => {
    expect(isStable(markdown)).toBe(true)
  })
})

describe('nothing gets silently dropped', () => {
  it('keeps raw HTML exactly as written', () => {
    const html = '<div class="note">Hand written</div>\n'
    expect(trip(html)).toContain('<div class="note">Hand written</div>')
  })

  it('keeps text that looks like markdown inside a code span', () => {
    expect(trip('Use `**not bold**` here.\n')).toBe('Use `**not bold**` here.\n')
  })

  it('escapes a literal asterisk so it does not become emphasis', () => {
    const result = trip('A \\* literal asterisk.\n')
    expect(isStable(result)).toBe(true)
    expect(trip(result)).not.toBe('A * literal asterisk.\n')
  })

  it('keeps a fenced block that contains a fence', () => {
    const nested = '````\n```\ninner\n```\n````\n'
    expect(trip(nested)).toContain('inner')
    expect(isStable(nested)).toBe(true)
  })

  it('keeps an autolink readable', () => {
    expect(trip('<https://example.com>\n')).toBe('<https://example.com>\n')
  })
})
