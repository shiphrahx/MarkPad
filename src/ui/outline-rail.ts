import type { Heading } from '../app/outline.js'
import { el, replace } from './dom.js'

/**
 * Where a heading sits on screen, as a fraction of the scrollable document.
 *
 * The rail cannot work this out on its own: only the editor knows where its
 * own lines ended up, and there are two different editors. So each of them
 * measures and the rail draws.
 */
export type HeadingPositions = readonly number[]

/**
 * The outline spine: a 26px rail down the left edge, one tick per heading.
 *
 * Not a sidebar. The heading text lives in the tooltip and the accessible
 * name rather than on screen, which is the whole difference between the two.
 *
 * Ticks are placed at the heading's own height rather than stacked from the
 * top, because a tick that is not level with its heading tells you the order
 * of the document and nothing else. When no measurement is available they
 * fall back to even spacing, which is at least not wrong about the order.
 */
export class OutlineRail {
  readonly element = el('nav', { class: 'rail', 'aria-label': 'Outline' })

  constructor(private readonly onGo: (heading: Heading, index: number) => void) {}

  render(
    headings: readonly Heading[],
    currentIndex: number,
    positions?: HeadingPositions,
  ): void {
    if (headings.length === 0) {
      replace(this.element)
      return
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

      tick.style.top = `${percentFor(index, headings.length, positions)}%`
      tick.addEventListener('click', () => this.onGo(heading, index))
      return tick
    })

    replace(this.element, ...ticks)
  }
}

function percentFor(
  index: number,
  count: number,
  positions?: HeadingPositions,
): number {
  const measured = positions?.[index]

  if (measured !== undefined && Number.isFinite(measured)) {
    // Kept off both ends so the first and last ticks stay visible rather than
    // half-clipped by the edge of the rail.
    return clamp(measured * 100, 2, 98)
  }

  // Evenly spaced, starting a little way down, which is what the mockup shows
  // for a document whose headings have not been measured yet.
  return clamp(((index + 0.5) / count) * 100, 2, 98)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
