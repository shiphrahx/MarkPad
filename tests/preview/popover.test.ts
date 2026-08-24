// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { markpadExtensions } from '../../src/editor/setup.js'
import { targetAt } from '../../src/preview/popover.js'

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: markpadExtensions() })
  // Force the parse, so resolveInner sees real nodes rather than an empty tree.
  ensureSyntaxTree(state, doc.length, 5000)
  return state
}

describe('targetAt', () => {
  it('finds a table', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n'
    const target = targetAt(stateFor(doc), 3)

    expect(target?.kind).toBe('table')
    expect(target?.source).toContain('| a | b |')
  })

  it('finds a mermaid block and hands back its body without the fence', () => {
    const doc = '```mermaid\ngraph TD;\nA-->B;\n```\n'
    const target = targetAt(stateFor(doc), 15)

    expect(target?.kind).toBe('mermaid')
    expect(target?.source).toBe('graph TD;\nA-->B;')
  })

  it('finds a math block', () => {
    const doc = '```math\nE = mc^2\n```\n'
    const target = targetAt(stateFor(doc), 12)

    expect(target?.kind).toBe('math')
    expect(target?.source).toBe('E = mc^2')
    expect(target?.display).toBe(true)
  })

  it('treats a latex fence as maths too', () => {
    const doc = '```latex\nE = mc^2\n```\n'
    expect(targetAt(stateFor(doc), 13)?.kind).toBe('math')
  })

  it('ignores an ordinary code fence', () => {
    const doc = '```js\nconst x = 1\n```\n'
    expect(targetAt(stateFor(doc), 10)).toBeNull()
  })

  it('finds inline maths in a paragraph', () => {
    const doc = 'the value $x + 1$ matters\n'
    const target = targetAt(stateFor(doc), 13)

    expect(target?.kind).toBe('math')
    expect(target?.source).toBe('x + 1')
    expect(target?.display).toBe(false)
  })

  it('is not fooled by a price', () => {
    const doc = 'it cost $5 and then $10 more\n'
    expect(targetAt(stateFor(doc), 9)).toBeNull()
  })

  it('finds nothing in ordinary prose', () => {
    expect(targetAt(stateFor('just some words\n'), 5)).toBeNull()
  })

  it('reports the range so the popover can anchor to it', () => {
    const doc = 'a $x$ b\n'
    const target = targetAt(stateFor(doc), 3)

    expect(target?.from).toBe(2)
    expect(target?.to).toBe(5)
  })
})
