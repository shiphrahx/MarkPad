// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ReaderEditor } from '../../src/wysiwyg/editor.js'

function reader(): ReaderEditor {
  const editor = new ReaderEditor({
    platform: 'windows',
    onChange: () => {},
    onLink: () => {},
    imageUrl: () => null,
  })
  document.body.append(editor.element)
  return editor
}

const FILE = '* star bullets\n\nSome __bold__ text.\n\n| a   | b   |\n| --- | --- |\n| one | two |\n'

describe('saving from reader mode', () => {
  it('writes an untouched file back exactly as it was', () => {
    const editor = reader()
    editor.setMarkdown(FILE)

    expect(editor.getMarkdown()).toBe(FILE)
  })

  it('leaves the lines around an edit alone', () => {
    const editor = reader()
    editor.setMarkdown(FILE)

    // Type at the start of the paragraph, the second block.
    editor.run((state, dispatch) => {
      const start = state.doc.child(0).nodeSize + 1
      dispatch?.(state.tr.insertText('Now ', start))
      return true
    })

    const saved = editor.getMarkdown()
    expect(saved).toContain('* star bullets')
    expect(saved).toContain('| a   | b   |')
    expect(saved).toContain('Now Some')
  })

  it('keeps the memory when a tab is switched away from and back', () => {
    const editor = reader()
    editor.setMarkdown(FILE)
    const kept = editor.state

    editor.setMarkdown('Something else.\n')
    editor.restore(kept)

    expect(editor.getMarkdown()).toBe(FILE)
  })
})
