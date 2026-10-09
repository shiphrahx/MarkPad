// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  apply,
  focusMode,
  setFocusMode,
  setSpellCheck,
  spellCheck,
} from '../../src/ui/writing.js'
import { ReaderEditor } from '../../src/wysiwyg/editor.js'

beforeEach(() => {
  setFocusMode(false)
  setSpellCheck(true)
  localStorage.clear()
})

describe('focus mode', () => {
  it('is off until somebody turns it on', () => {
    expect(focusMode()).toBe(false)
    expect(document.documentElement.hasAttribute('data-focus')).toBe(false)
  })

  it('marks the page so the chrome can step out of the way', () => {
    setFocusMode(true)

    expect(document.documentElement.hasAttribute('data-focus')).toBe(true)
    expect(localStorage.getItem('markpad.focus')).toBe('on')
  })

  it('marks the block the cursor is in, which is the one left undimmed', () => {
    const editor = new ReaderEditor({
      platform: 'windows',
      onChange: () => {},
      onLink: () => {},
      imageUrl: () => null,
    })
    document.body.append(editor.element)
    editor.setMarkdown('First.\n\nSecond.\n')

    const current = editor.element.querySelectorAll('.pm-current')
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toBe('First.')
  })
})

describe('spell check', () => {
  it('is on by default, as it is in any text box', () => {
    apply()

    expect(spellCheck()).toBe(true)
    expect(document.documentElement.getAttribute('spellcheck')).toBe('true')
  })

  it('can be turned off, and stays off', () => {
    setSpellCheck(false)

    expect(document.documentElement.getAttribute('spellcheck')).toBe('false')
    expect(localStorage.getItem('markpad.spellcheck')).toBe('off')
  })
})
