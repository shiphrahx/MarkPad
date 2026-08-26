import { describe, expect, it } from 'vitest'
import { formatShortcut, matchesShortcut } from '../../src/commands/keys.js'

describe('formatShortcut', () => {
  it('draws macOS shortcuts as run-together symbols', () => {
    expect(formatShortcut('Mod+K', 'macos')).toBe('⌘K')
    expect(formatShortcut('Mod+Shift+P', 'macos')).toBe('⌘⇧P')
  })

  it('draws Windows shortcuts as names joined by a plus', () => {
    expect(formatShortcut('Mod+K', 'windows')).toBe('Ctrl+K')
    expect(formatShortcut('Mod+Shift+P', 'windows')).toBe('Ctrl+Shift+P')
  })

  it('spells out the named keys per platform', () => {
    expect(formatShortcut('Escape', 'macos')).toBe('⎋')
    expect(formatShortcut('Escape', 'windows')).toBe('Esc')
  })

  it('leaves a plain function key alone', () => {
    expect(formatShortcut('F2', 'windows')).toBe('F2')
  })

  it('draws a spelled key as the character on the keyboard', () => {
    expect(formatShortcut('Mod+Minus', 'windows')).toBe('Ctrl+-')
    expect(formatShortcut('Mod+Plus', 'macos')).toBe('⌘+')
  })
})

function press(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  } as KeyboardEvent
}

describe('matchesShortcut', () => {
  it('maps Mod to Command on macOS', () => {
    expect(matchesShortcut(press('k', { metaKey: true }), 'Mod+K', 'macos')).toBe(true)
    expect(matchesShortcut(press('k', { ctrlKey: true }), 'Mod+K', 'macos')).toBe(false)
  })

  it('maps Mod to Ctrl on Windows', () => {
    expect(matchesShortcut(press('k', { ctrlKey: true }), 'Mod+K', 'windows')).toBe(true)
    expect(matchesShortcut(press('k', { metaKey: true }), 'Mod+K', 'windows')).toBe(false)
  })

  it('will not fire on the wrong modifier being held as well', () => {
    const event = press('k', { metaKey: true, altKey: true })
    expect(matchesShortcut(event, 'Mod+K', 'macos')).toBe(false)
  })

  it('needs shift when shift was asked for', () => {
    expect(
      matchesShortcut(press('p', { metaKey: true, shiftKey: true }), 'Mod+Shift+P', 'macos'),
    ).toBe(true)
    expect(matchesShortcut(press('p', { metaKey: true }), 'Mod+Shift+P', 'macos')).toBe(false)
  })

  it('ignores the case of the key that was pressed', () => {
    expect(matchesShortcut(press('K', { ctrlKey: true }), 'Mod+k', 'windows')).toBe(true)
  })

  it('understands a key that had to be spelled out', () => {
    expect(matchesShortcut(press('+', { ctrlKey: true }), 'Mod+Plus', 'windows')).toBe(true)
    expect(matchesShortcut(press('-', { ctrlKey: true }), 'Mod+Minus', 'windows')).toBe(true)
    expect(matchesShortcut(press('=', { ctrlKey: true }), 'Mod+Equals', 'windows')).toBe(true)
  })

  it('tells the two ways of asking for a bigger font apart', () => {
    // Shift turns the same physical key from = into +, so the shortcut that
    // wants shift has to be written against the character shift produces.
    const shifted = press('+', { ctrlKey: true, shiftKey: true })
    expect(matchesShortcut(shifted, 'Mod+Shift+Plus', 'windows')).toBe(true)
    expect(matchesShortcut(shifted, 'Mod+=', 'windows')).toBe(false)
  })

  it('matches a bare key with no modifiers', () => {
    expect(matchesShortcut(press('F2'), 'F2', 'windows')).toBe(true)
    expect(matchesShortcut(press('F2', { ctrlKey: true }), 'F2', 'windows')).toBe(false)
  })
})
