import { el } from './dom.js'

export interface PromptOptions {
  readonly title: string
  readonly label: string
  readonly value?: string
  readonly placeholder?: string
  readonly confirmLabel: string
}

/**
 * Ask for one line of text.
 *
 * Used for a link's address. Drawn in the app rather than through the host,
 * because neither platform has a native "type something" dialog and the ones
 * people build out of a message box are worse than this.
 *
 * Resolves to null when cancelled, which is a different answer from the empty
 * string: one means "leave it alone", the other means "make it empty".
 */
export function askForText(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'dialog-backdrop' })
    const panel = el('div', {
      class: 'dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'prompt-title',
    })

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const input = el('input', {
      class: 'dialog-input',
      type: 'text',
      id: 'prompt-input',
      value: options.value ?? '',
      placeholder: options.placeholder ?? '',
      spellcheck: 'false',
      autocomplete: 'off',
    })

    const finish = (answer: string | null) => {
      backdrop.remove()
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus()
      resolve(answer)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(null)
      }
    }

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      finish(input.value)
    })

    const cancel = button('Cancel', '', () => finish(null))
    const confirm = button(options.confirmLabel, 'dialog-primary', () => finish(input.value))

    panel.append(
      el('h2', { class: 'dialog-title', id: 'prompt-title' }, options.title),
      el('label', { class: 'dialog-message', for: 'prompt-input' }, options.label),
      input,
      el('div', { class: 'dialog-buttons' }, cancel, confirm),
    )

    backdrop.appendChild(panel)
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) finish(null)
    })

    document.addEventListener('keydown', onKeyDown, true)
    document.body.appendChild(backdrop)

    input.focus()
    input.select()
  })
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el(
    'button',
    { type: 'button', class: `dialog-button ${className}`.trim() },
    label,
  )
  node.addEventListener('click', onClick)
  return node
}
