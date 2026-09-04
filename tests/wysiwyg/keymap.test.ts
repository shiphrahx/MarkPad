// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { history } from 'prosemirror-history'
import { markpadSchema } from '../../src/wysiwyg/schema.js'
import { markpadKeymap } from '../../src/wysiwyg/keymap.js'
import type { Platform } from '../../src/host/types.js'

/**
 * The keymap decides whether Command or Control is the modifier, and nothing
 * had ever checked it. Get it wrong and bold, italic and undo do nothing on
 * one platform, which is not the sort of thing that shows up in a diff.
 *
 * Driven through the plugins' own handleKeyDown rather than through a real
 * EditorView. jsdom has no layout engine, and none of this needs one: the
 * question is only which binding a keystroke lands on.
 */
interface Keystroke {
  readonly key: string
  readonly mods?: KeyboardEventInit
}

function type(platform: Platform, ...keys: Keystroke[]): EditorState {
  const doc = markpadSchema.node('doc', null, [
    markpadSchema.node('paragraph', null, [markpadSchema.text('hello')]),
  ])

  const plugins = [...markpadKeymap(platform), history()]

  let state = EditorState.create({ doc, plugins })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)))

  const view = {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = state.apply(transaction)
    },
  } as unknown as EditorView

  for (const stroke of keys) {
    const event = new KeyboardEvent('keydown', { key: stroke.key, ...stroke.mods })
    for (const plugin of plugins) {
      // Called rather than invoked, because handleKeyDown declares its `this`
      // as the plugin and reaching it off props would bind the wrong one.
      if (plugin.props.handleKeyDown?.call(plugin, view, event)) break
    }
  }

  return state
}

function press(
  platform: Platform,
  key: string,
  mods: KeyboardEventInit = {},
): EditorState {
  return type(platform, { key, mods })
}

function isBold(state: EditorState): boolean {
  const paragraph = state.doc.firstChild!
  return paragraph.firstChild!.marks.some((mark) => mark.type.name === 'strong')
}

describe('markpadKeymap', () => {
  it('bolds on Ctrl+B on Windows and Linux', () => {
    expect(isBold(press('windows', 'b', { ctrlKey: true }))).toBe(true)
    expect(isBold(press('linux', 'b', { ctrlKey: true }))).toBe(true)
  })

  it('bolds on Command+B on macOS', () => {
    expect(isBold(press('macos', 'b', { metaKey: true }))).toBe(true)
  })

  /**
   * The two that prove the branch is doing something. Control+B on a Mac is
   * an Emacs binding that moves the caret, and the Windows key is not a
   * modifier anybody bolds with.
   */
  it('does not bold on Control+B on macOS', () => {
    expect(isBold(press('macos', 'b', { ctrlKey: true }))).toBe(false)
  })

  it('does not bold on Meta+B on Windows', () => {
    expect(isBold(press('windows', 'b', { metaKey: true }))).toBe(false)
  })

  it('italicises with the same modifier per platform', () => {
    const emphasised = (state: EditorState) =>
      state.doc.firstChild!.firstChild!.marks.some((mark) => mark.type.name === 'em')

    expect(emphasised(press('macos', 'i', { metaKey: true }))).toBe(true)
    expect(emphasised(press('linux', 'i', { ctrlKey: true }))).toBe(true)
    expect(emphasised(press('linux', 'i', { metaKey: true }))).toBe(false)
  })

  it('makes a heading on Shift+Mod+1', () => {
    const state = press('linux', '1', { ctrlKey: true, shiftKey: true })

    expect(state.doc.firstChild!.type.name).toBe('heading')
    expect(state.doc.firstChild!.attrs.level).toBe(1)
  })

  it('goes back to a paragraph on Shift+Mod+0', () => {
    const heading = press('macos', '2', { metaKey: true, shiftKey: true })
    expect(heading.doc.firstChild!.type.name).toBe('heading')

    const state = press('macos', '0', { metaKey: true, shiftKey: true })
    expect(state.doc.firstChild!.type.name).toBe('paragraph')
  })

  /**
   * Undo is the editor's own, which is why the Edit menu deliberately does not
   * carry a native Undo item. If this stops working the menu decision needs
   * revisiting, not just the keymap.
   */
  it('undoes the change it just made', () => {
    const bold = { key: 'b', mods: { ctrlKey: true } }
    expect(isBold(type('windows', bold))).toBe(true)
    expect(isBold(type('windows', bold, { key: 'z', mods: { ctrlKey: true } }))).toBe(false)

    const macBold = { key: 'b', mods: { metaKey: true } }
    expect(isBold(type('macos', macBold, { key: 'z', mods: { metaKey: true } }))).toBe(false)
  })

  it('does not undo on the wrong modifier', () => {
    const bold = { key: 'b', mods: { ctrlKey: true } }

    expect(isBold(type('windows', bold, { key: 'z', mods: { metaKey: true } }))).toBe(true)
  })

  it('redoes on both Ctrl+Y and Shift+Mod+Z', () => {
    const bold = { key: 'b', mods: { ctrlKey: true } }
    const undo = { key: 'z', mods: { ctrlKey: true } }

    expect(isBold(type('windows', bold, undo, { key: 'y', mods: { ctrlKey: true } }))).toBe(true)
    expect(
      isBold(type('windows', bold, undo, { key: 'z', mods: { ctrlKey: true, shiftKey: true } })),
    ).toBe(true)
  })
})
