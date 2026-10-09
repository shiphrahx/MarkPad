import { el } from './dom.js'

export type UnsavedAnswer = 'save' | 'discard' | 'cancel'

/** One button in a question. `style` picks the colour, not the meaning. */
export interface Choice<Answer extends string> {
  readonly answer: Answer
  readonly label: string
  readonly style?: 'primary' | 'danger'
}

export interface Question<Answer extends string> {
  readonly title: string
  readonly message: string
  /** Left to right as drawn. The last one has focus. */
  readonly choices: readonly Choice<Answer>[]
  /** What Escape and a click outside mean. Should be the answer that costs nothing. */
  readonly cancel: Answer
}

/**
 * A question with more answers than a native dialog can offer, drawn in the
 * app.
 *
 * Escape and clicking outside both give the cancel answer, so pressing Escape
 * out of habit can never be the thing that loses work.
 */
export function ask<Answer extends string>(question: Question<Answer>): Promise<Answer> {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'dialog-backdrop' })
    const panel = el('div', {
      class: 'dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'dialog-title',
    })

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const finish = (answer: Answer) => {
      backdrop.remove()
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus()
      resolve(answer)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(question.cancel)
      }
    }

    const buttons = question.choices.map((choice) =>
      button(choice.label, choice.style ? `dialog-${choice.style}` : '', () =>
        finish(choice.answer),
      ),
    )

    panel.append(
      el('h2', { class: 'dialog-title', id: 'dialog-title' }, question.title),
      el('p', { class: 'dialog-message' }, question.message),
      el('div', { class: 'dialog-buttons' }, ...buttons),
    )

    backdrop.appendChild(panel)
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) finish(question.cancel)
    })

    document.addEventListener('keydown', onKeyDown, true)
    document.body.appendChild(backdrop)
    buttons[buttons.length - 1]?.focus()
  })
}

/**
 * "You have unsaved changes" needs three answers, not two.
 *
 * Save it, throw it away, or change your mind. A native yes/no dialog can only
 * offer two, and the version where the cancel button means discard loses work
 * the moment somebody presses Escape out of habit.
 */
export function askAboutUnsavedChanges(fileName: string): Promise<UnsavedAnswer> {
  return ask<UnsavedAnswer>({
    title: 'Unsaved changes',
    message: `${fileName} has changes that have not been saved.`,
    choices: [
      { answer: 'cancel', label: 'Keep editing' },
      { answer: 'discard', label: 'Discard changes', style: 'danger' },
      { answer: 'save', label: 'Save changes', style: 'primary' },
    ],
    cancel: 'cancel',
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
