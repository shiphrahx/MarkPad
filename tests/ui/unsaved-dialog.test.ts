// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { askAboutUnsavedChanges } from '../../src/ui/unsaved-dialog.js'

function click(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.dialog-button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (!button) throw new Error(`No button labelled ${label}`)
  button.click()
}

describe('askAboutUnsavedChanges', () => {
  beforeEach(() => document.body.replaceChildren())

  it('names the file in the question', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    expect(document.body.textContent).toContain('notes.md')

    click('Keep editing')
    await answer
  })

  it('offers all three answers', async () => {
    const answer = askAboutUnsavedChanges('notes.md')

    const labels = [...document.querySelectorAll('.dialog-button')].map(
      (button) => button.textContent,
    )
    expect(labels).toEqual(['Keep editing', 'Discard changes', 'Save changes'])

    click('Keep editing')
    await answer
  })

  it('reports save', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    click('Save changes')
    expect(await answer).toBe('save')
  })

  it('reports discard', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    click('Discard changes')
    expect(await answer).toBe('discard')
  })

  it('reports cancel', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    click('Keep editing')
    expect(await answer).toBe('cancel')
  })

  it('treats Escape as cancel, because that answer cannot cost you anything', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(await answer).toBe('cancel')
  })

  it('treats a click outside as cancel', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    document
      .querySelector('.dialog-backdrop')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(await answer).toBe('cancel')
  })

  it('clears itself away afterwards', async () => {
    const answer = askAboutUnsavedChanges('notes.md')
    click('Save changes')
    await answer

    expect(document.querySelector('.dialog-backdrop')).toBeNull()
  })

  it('gives focus back to whatever had it', async () => {
    const editor = document.createElement('input')
    document.body.appendChild(editor)
    editor.focus()

    const answer = askAboutUnsavedChanges('notes.md')
    click('Keep editing')
    await answer

    expect(document.activeElement).toBe(editor)
  })
})
