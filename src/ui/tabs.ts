import { isDirty, title as titleOf, type Buffer } from '../app/buffer.js'
import { el, replace } from './dom.js'

export interface TabStripHandlers {
  onFocus: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

/**
 * The row of open files.
 *
 * Sized to the label rather than stretched, rounded at the top, and the active
 * one wears the editor's own background so the two read as a single surface.
 *
 * The dot and the cross share one slot: the dot says there is unsaved work,
 * the cross replaces it on hover. The tab never changes width and there is
 * only ever one thing to aim at.
 */
export class TabStrip {
  readonly element = el('div', { class: 'tabs', role: 'tablist' })

  constructor(private readonly handlers: TabStripHandlers) {
    this.element.addEventListener('auxclick', (event) => {
      // Middle click closes, the way every tabbed thing works.
      if (event.button !== 1) return
      const id = tabIdFrom(event.target)
      if (id) {
        event.preventDefault()
        this.handlers.onClose(id)
      }
    })
  }

  render(tabs: readonly Buffer[], activeId: string | null): void {
    const children = tabs.map((buffer) => this.renderTab(buffer, buffer.id === activeId))

    const add = el('button', {
      class: 'tab-new',
      type: 'button',
      title: 'New file',
      'aria-label': 'New file',
    })
    add.textContent = '+'
    add.addEventListener('click', () => this.handlers.onNew())

    replace(this.element, ...children, add)
  }

  private renderTab(buffer: Buffer, active: boolean): HTMLElement {
    const dirty = isDirty(buffer)

    const tab = el('div', {
      class: `tab${active ? ' tab-active' : ''}${dirty ? ' tab-dirty' : ''}`,
      role: 'tab',
      'aria-selected': active,
      'data-tab-id': buffer.id,
      title: buffer.path ?? titleOf(buffer),
    })

    const label = el('span', { class: 'tab-label' }, titleOf(buffer))
    label.addEventListener('click', () => this.handlers.onFocus(buffer.id))

    const dot = el('span', {
      class: 'tab-dot',
      title: 'Unsaved changes',
      'aria-hidden': 'true',
    })

    const close = el('button', {
      class: 'tab-close',
      type: 'button',
      'aria-label': `Close ${titleOf(buffer)}`,
    })
    close.addEventListener('click', (event) => {
      event.stopPropagation()
      this.handlers.onClose(buffer.id)
    })

    tab.append(label, dot, close)
    return tab
  }
}

function tabIdFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-tab-id]')?.getAttribute('data-tab-id') ?? null
}
