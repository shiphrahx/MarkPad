import type { Heading } from '../app/outline.js'
import { el, replace } from './dom.js'

/**
 * The outline spine: one tick per heading down the left edge, indented by
 * level. Not a sidebar, and never wider than a scrollbar.
 *
 * The heading text lives in the tooltip and in the accessible name rather than
 * on screen, which is what keeps it a rail. Hovering shows where you are;
 * clicking goes there.
 */
export class OutlineRail {
  readonly element = el('nav', { class: 'rail', 'aria-label': 'Outline' })

  constructor(private readonly onGo: (offset: number) => void) {}

  render(headings: readonly Heading[], activeOffset: number): void {
    if (headings.length === 0) {
      replace(this.element)
      return
    }

    // The heading you are inside is the last one at or above the caret.
    let currentIndex = -1
    for (let index = 0; index < headings.length; index++) {
      if (headings[index]!.offset <= activeOffset) currentIndex = index
    }

    const ticks = headings.map((heading, index) => {
      const tick = el('button', {
        type: 'button',
        class: `rail-tick rail-level-${Math.min(heading.level, 4)}${
          index === currentIndex ? ' rail-tick-current' : ''
        }`,
        title: heading.text || '(untitled heading)',
        'aria-label': `Go to ${heading.text || 'untitled heading'}`,
      })
      tick.addEventListener('click', () => this.onGo(heading.offset))
      return tick
    })

    replace(this.element, ...ticks)
  }
}
