// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../../src/ui/palette.js'
import type { Command } from '../../src/commands/types.js'

function command(partial: Partial<Command> & Pick<Command, 'id' | 'title'>): Command {
  return {
    category: 'File',
    run: () => {},
    ...partial,
  }
}

describe('CommandPalette', () => {
  let palette: CommandPalette
  let commands: Command[]
  let ran: string[]

  beforeEach(() => {
    document.body.replaceChildren()
    ran = []
    commands = [
      command({ id: 'save', title: 'Save', key: 'Mod+S', run: () => void ran.push('save') }),
      command({ id: 'save-as', title: 'Save as', run: () => void ran.push('save-as') }),
      command({
        id: 'close',
        title: 'Close tab',
        enabled: () => false,
        run: () => void ran.push('close'),
      }),
    ]
    palette = new CommandPalette('windows')
    document.body.appendChild(palette.element)
  })

  function rows(): HTMLElement[] {
    return [...palette.element.querySelectorAll<HTMLElement>('.palette-row')]
  }

  function type(query: string): void {
    const input = palette.element.querySelector<HTMLInputElement>('.palette-input')!
    input.value = query
    input.dispatchEvent(new Event('input'))
  }

  function press(key: string): void {
    const input = palette.element.querySelector<HTMLInputElement>('.palette-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  it('starts hidden', () => {
    expect(palette.isOpen).toBe(false)
    expect(palette.element.hidden).toBe(true)
  })

  it('lists every command when it opens', () => {
    palette.open(commands)
    expect(palette.isOpen).toBe(true)
    expect(rows()).toHaveLength(3)
  })

  it('narrows the list as you type', () => {
    palette.open(commands)
    type('save')
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Save'),
      expect.stringContaining('Save as'),
    ])
  })

  it('says so when nothing matches', () => {
    palette.open(commands)
    type('zzzz')
    expect(rows()).toHaveLength(0)
    expect(palette.element.textContent).toContain('No matching commands')
  })

  it('draws shortcuts in the platform notation', () => {
    palette.open(commands)
    expect(palette.element.querySelector('kbd')?.textContent).toBe('Ctrl+S')
  })

  it('runs the selected command on Enter and closes', () => {
    palette.open(commands)
    press('Enter')

    expect(ran).toEqual(['save'])
    expect(palette.isOpen).toBe(false)
  })

  it('moves the selection with the arrow keys', () => {
    palette.open(commands)
    press('ArrowDown')
    press('Enter')

    expect(ran).toEqual(['save-as'])
  })

  it('wraps the selection around the ends', () => {
    palette.open(commands)
    type('save')
    press('ArrowUp')
    press('Enter')

    expect(ran).toEqual(['save-as'])
  })

  it('shows a disabled command greyed rather than hiding it', () => {
    palette.open(commands)
    const disabled = rows().find((row) => row.textContent?.includes('Close tab'))
    expect(disabled?.classList.contains('palette-row-disabled')).toBe(true)
  })

  it('refuses to run a disabled command', () => {
    palette.open(commands)
    type('close')
    press('Enter')

    expect(ran).toEqual([])
  })

  it('closes on Escape without running anything', () => {
    palette.open(commands)
    press('Escape')

    expect(palette.isOpen).toBe(false)
    expect(ran).toEqual([])
  })

  it('closes when the backdrop is clicked', () => {
    palette.open(commands)
    palette.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(palette.isOpen).toBe(false)
  })

  it('gives focus back to whatever had it', () => {
    const editor = document.createElement('input')
    document.body.appendChild(editor)
    editor.focus()

    palette.open(commands)
    press('Escape')

    expect(document.activeElement).toBe(editor)
  })

  it('starts from an empty query each time it opens', () => {
    palette.open(commands)
    type('save')
    press('Escape')
    palette.open(commands)

    expect(rows()).toHaveLength(3)
  })

  it('runs a command that was clicked', () => {
    palette.open(commands)
    const spy = vi.spyOn(commands[1]!, 'run')
    rows()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(spy).toHaveBeenCalled()
  })
})
