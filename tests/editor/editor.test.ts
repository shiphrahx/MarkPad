// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { EditorSelection } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { createEditor } from '../../src/editor/index.js'

describe('createEditor', () => {
  let parent: HTMLElement

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.append(parent)
  })

  it('mounts into the element it was given', () => {
    createEditor(parent)
    expect(parent.querySelector('.cm-editor')).not.toBeNull()
  })

  it('starts with the document it was handed', () => {
    const view = createEditor(parent, { doc: '# Title\n\nSome text.\n' })
    expect(view.state.doc.toString()).toBe('# Title\n\nSome text.\n')
  })

  it('reports changes back through onChange', () => {
    const seen: string[] = []
    const view = createEditor(parent, { doc: 'a', onChange: (doc) => seen.push(doc) })

    view.dispatch({ changes: { from: 1, insert: 'b' } })

    expect(seen).toEqual(['ab'])
  })

  it('keeps more than one caret so multi-caret editing works', () => {
    const view = createEditor(parent, { doc: 'one\ntwo\n' })

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4),
      ]),
    })

    expect(view.state.selection.ranges.length).toBe(2)
  })

  it('types into every caret at once', () => {
    const view = createEditor(parent, { doc: 'one\ntwo\n' })

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4),
      ]),
    })
    view.dispatch(view.state.replaceSelection('- '))

    expect(view.state.doc.toString()).toBe('- one\n- two\n')
  })
})

describe('markdown parsing', () => {
  let parent: HTMLElement

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.append(parent)
  })

  function nodeNames(doc: string): string[] {
    const view = createEditor(parent, { doc })
    const tree = ensureSyntaxTree(view.state, doc.length, 5000)
    if (!tree) throw new Error('The document did not finish parsing.')

    const names: string[] = []
    tree.iterate({ enter: (node) => void names.push(node.name) })
    return names
  }

  it('parses commonmark headings', () => {
    expect(nodeNames('# Title\n')).toContain('ATXHeading1')
  })

  it('parses GFM strikethrough', () => {
    expect(nodeNames('~~gone~~\n')).toContain('Strikethrough')
  })

  it('parses GFM tables', () => {
    expect(nodeNames('| a | b |\n| - | - |\n| 1 | 2 |\n')).toContain('Table')
  })

  it('parses GFM task lists', () => {
    expect(nodeNames('- [x] done\n')).toContain('TaskMarker')
  })
})
