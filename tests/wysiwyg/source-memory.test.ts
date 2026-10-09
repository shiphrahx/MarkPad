import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { undo, history } from 'prosemirror-history'
import { parseWithTokens } from '../../src/wysiwyg/parser.js'
import {
  memoryOf,
  rememberSource,
  serialisePreserving,
  sourceMemory,
} from '../../src/wysiwyg/source-memory.js'

function open(markdown: string): EditorState {
  const { doc, tokens } = parseWithTokens(markdown)
  return EditorState.create({
    doc,
    plugins: [sourceMemory(rememberSource(markdown, doc, tokens)), history()],
  })
}

function save(state: EditorState): string {
  return serialisePreserving(state.doc, memoryOf(state))
}

/** Position just inside the start of the nth top-level block. */
function insideBlock(state: EditorState, n: number): number {
  let position = 0
  for (let index = 0; index < n; index++) position += state.doc.child(index).nodeSize
  return position + 1
}

function typeAt(state: EditorState, block: number, text: string): EditorState {
  return state.apply(state.tr.insertText(text, insideBlock(state, block)))
}

/** House styles the serialiser would rewrite, all in one file. */
const QUIRKY = [
  'Title',
  '=====',
  '',
  '* star bullets',
  '* more stars',
  '',
  'Some __bold__ and _italic_ text.',
  '',
  '| a   | b   |',
  '| --- | --- |',
  '| one | two |',
  '',
  '+ plus bullets',
].join('\n')

describe('saving a file nobody edited', () => {
  it('writes it back byte for byte, odd formatting and all', () => {
    expect(save(open(QUIRKY))).toBe(QUIRKY)
  })

  it('keeps a missing final newline missing', () => {
    expect(save(open('One.\n\nTwo.'))).toBe('One.\n\nTwo.')
  })

  it('keeps extra blank lines between blocks', () => {
    expect(save(open('One.\n\n\n\nTwo.\n'))).toBe('One.\n\n\n\nTwo.\n')
  })

  it('keeps a block that follows another with no blank line', () => {
    expect(save(open('# Title\nText under it.\n'))).toBe('# Title\nText under it.\n')
  })
})

describe('saving after an edit', () => {
  it('rewrites only the block that changed', () => {
    const edited = typeAt(open(QUIRKY), 2, 'New. ')

    const lines = save(edited).split('\n')
    expect(lines).toContain('* star bullets')
    expect(lines).toContain('| a   | b   |')
    expect(lines).toContain('+ plus bullets')
    expect(lines).toContain('Title')
    expect(lines.some((line) => line.startsWith('New. Some'))).toBe(true)
  })

  it('keeps everything else when a block is deleted', () => {
    const state = open('* one\n\nMiddle.\n\n+ two\n')
    const from = insideBlock(state, 1) - 1
    const to = from + state.doc.child(1).nodeSize
    const edited = state.apply(state.tr.delete(from, to))

    expect(save(edited)).toBe('* one\n\n+ two\n')
  })

  it('writes it back exactly once the edit is undone', () => {
    const state = open(QUIRKY)
    const edited = typeAt(state, 2, 'oops')

    let undone = edited
    undo(edited, (transaction) => {
      undone = edited.apply(transaction)
    })

    expect(save(undone)).toBe(QUIRKY)
  })

  it('keeps a reference definition when the block using it changes', () => {
    const state = open('See [the docs][1].\n\n[1]: https://example.com\n')
    const edited = typeAt(state, 0, 'Please ')

    const saved = save(edited)
    expect(saved).toContain('[1]: https://example.com')
  })

  it('keeps a reference definition between two blocks when one changes', () => {
    const state = open('First [a][x].\n\n[x]: https://example.com\n\nSecond.\n')
    const edited = typeAt(state, 1, 'New ')

    expect(save(edited)).toContain('[x]: https://example.com')
  })

  it('serialises a new block added at the end', () => {
    const state = open('* one\n')
    const end = state.doc.content.size
    const paragraph = state.schema.nodes.paragraph!.create(null, state.schema.text('Added.'))
    const edited = state.apply(state.tr.insert(end, paragraph))

    expect(save(edited)).toBe('* one\n\nAdded.\n')
  })
})

describe('when it cannot line up', () => {
  it('serialises the whole document for an empty file', () => {
    expect(save(open(''))).toBe('')
  })

  it('carries the memory through a state that has moved on', () => {
    const state = open('One.\n')
    const moved = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))

    expect(memoryOf(moved)).toBe(memoryOf(state))
  })
})
