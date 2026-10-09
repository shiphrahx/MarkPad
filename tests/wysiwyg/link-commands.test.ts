import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { markdownParser } from '../../src/wysiwyg/parser.js'
import { toMarkdown } from '../../src/wysiwyg/serializer.js'
import { removeLink, setLink } from '../../src/wysiwyg/format.js'
import type { Command } from 'prosemirror-state'

function run(markdown: string, from: number, to: number, command: Command): string {
  let state = EditorState.create({ doc: markdownParser.parse(markdown) })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
  command(state, (transaction) => {
    state = state.apply(transaction)
  })
  return toMarkdown(state.doc)
}

describe('link commands', () => {
  it('makes the selected words a link', () => {
    expect(run('Read the docs.\n', 6, 14, setLink('https://example.com'))).toBe(
      'Read [the docs](https://example.com).\n',
    )
  })

  it('writes the address as the text when nothing is selected', () => {
    expect(run('See here.\n', 5, 5, setLink('https://example.com'))).toBe(
      'See <https://example.com>here.\n',
    )
  })

  it('takes a link off and keeps its words', () => {
    expect(run('Read [the docs](https://example.com).\n', 6, 14, removeLink)).toBe('Read the docs.\n')
  })
})
