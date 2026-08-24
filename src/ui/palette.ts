import { rank } from '../commands/filter.js'
import { formatShortcut } from '../commands/keys.js'
import { shortcutFor, type Command } from '../commands/types.js'
import type { Platform } from '../host/types.js'
import { el, highlight, replace } from './dom.js'

/**
 * The command palette.
 *
 * Every command lives here first, so this is the one list that has to be
 * complete. Disabled commands are shown greyed rather than hidden: "why is
 * Save as missing" is a worse question than "why is Save as greyed out".
 */
export class CommandPalette {
  readonly element = el('div', { class: 'palette-backdrop', hidden: true })

  private readonly input = el('input', {
    class: 'palette-input',
    type: 'text',
    placeholder: 'Type a command',
    'aria-label': 'Command palette',
    spellcheck: 'false',
    autocomplete: 'off',
  })

  private readonly list = el('ul', { class: 'palette-list', role: 'listbox' })
  private commands: readonly Command[] = []
  private visible: Command[] = []
  private selected = 0
  private returnFocusTo: HTMLElement | null = null

  constructor(private readonly platform: Platform) {
    const panel = el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true' })
    panel.append(this.input, this.list)
    this.element.appendChild(panel)

    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (event) => this.onKeyDown(event))
    this.element.addEventListener('mousedown', (event) => {
      if (event.target === this.element) this.close()
    })
  }

  get isOpen(): boolean {
    return !this.element.hidden
  }

  open(commands: readonly Command[]): void {
    this.commands = commands
    this.returnFocusTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    this.element.hidden = false
    this.input.value = ''
    this.refresh()
    this.input.focus()
  }

  close(): void {
    if (!this.isOpen) return
    this.element.hidden = true
    this.returnFocusTo?.focus()
  }

  private refresh(): void {
    const query = this.input.value
    const results = rank(query, this.commands, (command) => labelOf(command))

    this.visible = results.map((result) => result.item)
    this.selected = 0

    if (this.visible.length === 0) {
      replace(this.list, el('li', { class: 'palette-empty' }, 'No matching commands'))
      return
    }

    const positionsFor = new Map(
      results.map((result) => [result.item.id, result.match.positions]),
    )

    replace(
      this.list,
      ...this.visible.map((command, index) =>
        this.renderRow(command, index, positionsFor.get(command.id) ?? []),
      ),
    )
  }

  private renderRow(
    command: Command,
    index: number,
    positions: readonly number[],
  ): HTMLElement {
    const disabled = command.enabled ? !command.enabled() : false
    const row = el('li', {
      class: `palette-row${index === this.selected ? ' palette-row-selected' : ''}${
        disabled ? ' palette-row-disabled' : ''
      }`,
      role: 'option',
      'aria-selected': index === this.selected,
      'aria-disabled': disabled,
    })

    const label = el('span', { class: 'palette-label' })
    label.appendChild(highlight(labelOf(command), positions))

    const shortcut = shortcutFor(command, this.platform)
    row.append(
      label,
      shortcut
        ? el('kbd', { class: 'palette-shortcut' }, formatShortcut(shortcut, this.platform))
        : el('span', {}),
    )

    row.addEventListener('mousemove', () => this.select(index))
    row.addEventListener('click', () => {
      // Select first. A click that arrives without the pointer having moved
      // over the row, which is what happens on a touchpad tap, would otherwise
      // run whichever command the keyboard had selected.
      this.select(index)
      this.runSelected()
    })

    return row
  }

  private select(index: number): void {
    if (index === this.selected) return
    this.selected = index

    const rows = this.list.querySelectorAll('.palette-row')
    rows.forEach((row, position) => {
      row.classList.toggle('palette-row-selected', position === index)
      row.setAttribute('aria-selected', String(position === index))
    })

    // Guarded because jsdom has no scrollIntoView, and a missing scroll is
    // not worth throwing over in the middle of handling a keypress.
    rows[index]?.scrollIntoView?.({ block: 'nearest' })
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.close()
        break
      case 'ArrowDown':
        event.preventDefault()
        this.select((this.selected + 1) % Math.max(this.visible.length, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        this.select(
          (this.selected - 1 + this.visible.length) % Math.max(this.visible.length, 1),
        )
        break
      case 'Enter':
        event.preventDefault()
        this.runSelected()
        break
      default:
        break
    }
  }

  private runSelected(): void {
    const command = this.visible[this.selected]
    if (!command) return
    if (command.enabled && !command.enabled()) return

    // Close first. A command that opens a dialog should not have the palette
    // sitting on top of it, and one that focuses the editor should win.
    this.close()
    void command.run()
  }
}

function labelOf(command: Command): string {
  return `${command.category}: ${command.title}`
}
