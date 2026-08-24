import { el } from './dom.js'

export type UnsavedAnswer = 'save' | 'discard' | 'cancel'

/**
 * "You have unsaved changes" needs three answers, not two.
 *
 * Save it, throw it away, or change your mind. A native yes/no dialog can only
 * offer two, and the version where the cancel button means discard loses work
 * the moment somebody presses Escape out of habit. So this one is drawn in the
 * app.
 *
 * Escape and clicking outside both mean cancel, which is the answer that
 * cannot cost you anything.
 */
export function askAboutUnsavedChanges(fileName: string): Promise<UnsavedAnswer> {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'dialog-backdrop' })
    const panel = el('div', {
      class: 'dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'unsaved-title',
    })

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const finish = (answer: UnsavedAnswer) => {
      backdrop.remove()
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus()
      resolve(answer)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish('cancel')
      }
    }

    const save = button('Save changes', 'dialog-primary', () => finish('save'))
    const discard = button('Discard changes', 'dialog-danger', () => finish('discard'))
    const cancel = button('Keep editing', '', () => finish('cancel'))

    panel.append(
      el('h2', { class: 'dialog-title', id: 'unsaved-title' }, 'Unsaved changes'),
      el(
        'p',
        { class: 'dialog-message' },
        `${fileName} has changes that have not been saved.`,
      ),
      el('div', { class: 'dialog-buttons' }, cancel, discard, save),
    )

    backdrop.appendChild(panel)
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) finish('cancel')
    })

    document.addEventListener('keydown', onKeyDown, true)
    document.body.appendChild(backdrop)
    save.focus()
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
