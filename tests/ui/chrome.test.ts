// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { TabStrip } from '../../src/ui/tabs.js'
import { StatusBar } from '../../src/ui/statusbar.js'
import { OutlineRail } from '../../src/ui/outline-rail.js'
import { bufferFromDocument, newBuffer, resetBufferIds } from '../../src/app/buffer.js'
import type { Buffer } from '../../src/app/buffer.js'
import { extractHeadings } from '../../src/app/outline.js'

function opened(path: string, text: string): Buffer {
  return bufferFromDocument({
    path,
    text,
    lineEnding: 'lf',
    encoding: 'utf-8',
    byteLength: text.length,
  })
}

describe('TabStrip', () => {
  beforeEach(() => resetBufferIds())

  it('draws a tab per open file plus the new button', () => {
    const strip = new TabStrip({ onFocus: () => {}, onClose: () => {}, onNew: () => {} })
    strip.render([opened('C:/a.md', 'a'), opened('C:/b.md', 'b')], null)

    expect(strip.element.querySelectorAll('.tab')).toHaveLength(2)
    expect(strip.element.querySelector('.tab-new')).not.toBeNull()
  })

  it('shows the file name, and the full path in the tooltip', () => {
    const strip = new TabStrip({ onFocus: () => {}, onClose: () => {}, onNew: () => {} })
    strip.render([opened('C:/notes/todo.md', 'x')], null)

    expect(strip.element.querySelector('.tab-label')?.textContent).toBe('todo.md')
    expect(strip.element.querySelector('.tab')?.getAttribute('title')).toBe(
      'C:/notes/todo.md',
    )
  })

  it('marks the active tab', () => {
    const strip = new TabStrip({ onFocus: () => {}, onClose: () => {}, onNew: () => {} })
    const tabs = [opened('C:/a.md', 'a'), opened('C:/b.md', 'b')]
    strip.render(tabs, tabs[1]!.id)

    const active = strip.element.querySelectorAll('.tab-active')
    expect(active).toHaveLength(1)
    expect(active[0]?.getAttribute('data-tab-id')).toBe(tabs[1]!.id)
  })

  it('marks a tab with unsaved changes', () => {
    const strip = new TabStrip({ onFocus: () => {}, onClose: () => {}, onNew: () => {} })
    const buffer = { ...opened('C:/a.md', 'a'), text: 'changed' }
    strip.render([buffer], buffer.id)

    expect(strip.element.querySelector('.tab-dirty')).not.toBeNull()
  })

  it('reports a click on the label as a focus', () => {
    const focused: string[] = []
    const strip = new TabStrip({
      onFocus: (id) => void focused.push(id),
      onClose: () => {},
      onNew: () => {},
    })
    const buffer = opened('C:/a.md', 'a')
    strip.render([buffer], null)

    strip.element.querySelector<HTMLElement>('.tab-label')!.click()
    expect(focused).toEqual([buffer.id])
  })

  it('reports the close button without also focusing the tab', () => {
    const events: string[] = []
    const strip = new TabStrip({
      onFocus: () => void events.push('focus'),
      onClose: () => void events.push('close'),
      onNew: () => {},
    })
    strip.render([opened('C:/a.md', 'a')], null)

    strip.element.querySelector<HTMLElement>('.tab-close')!.click()
    expect(events).toEqual(['close'])
  })

  it('closes on a middle click', () => {
    const closed: string[] = []
    const strip = new TabStrip({
      onFocus: () => {},
      onClose: (id) => void closed.push(id),
      onNew: () => {},
    })
    const buffer = opened('C:/a.md', 'a')
    strip.render([buffer], null)

    strip.element
      .querySelector('.tab-label')!
      .dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }))

    expect(closed).toEqual([buffer.id])
  })

  it('names untitled buffers so two can be told apart', () => {
    const strip = new TabStrip({ onFocus: () => {}, onClose: () => {}, onNew: () => {} })
    strip.render([newBuffer('macos'), newBuffer('macos')], null)

    expect([...strip.element.querySelectorAll('.tab-label')].map((l) => l.textContent))
      .toEqual(['Untitled 1', 'Untitled 2'])
  })
})

describe('StatusBar', () => {
  beforeEach(() => resetBufferIds())

  function bar(): StatusBar {
    return new StatusBar({ onLineEndingChange: () => {}, onEncodingChange: () => {} })
  }

  it('is empty when nothing is open', () => {
    const status = bar()
    status.render(null, null)
    expect(status.element.textContent).toBe('')
  })

  it('shows the word count, caret, encoding, endings and size', () => {
    const status = bar()
    const buffer = { ...opened('C:/a.md', 'one two three\n'), byteLength: 2048 }
    status.render(buffer, { line: 3, column: 7 })

    const text = status.element.textContent ?? ''
    expect(text).toContain('3 words')
    expect(text).toContain('Ln 3, Col 7')
    expect(text).toContain('UTF-8')
    expect(text).toContain('LF')
    expect(text).toContain('2 KB')
  })

  it('says "1 word" rather than "1 words"', () => {
    const status = bar()
    status.render(opened('C:/a.md', 'one'), null)
    expect(status.element.textContent).toContain('1 word')
    expect(status.element.textContent).not.toContain('1 words')
  })

  it('says when there is a byte order mark', () => {
    const status = bar()
    status.render({ ...opened('C:/a.md', 'x'), encoding: 'utf-8-bom' }, null)
    expect(status.element.textContent).toContain('UTF-8 with BOM')
  })

  it('lets the line ending be changed from the status bar', () => {
    const changes: string[] = []
    const status = new StatusBar({
      onLineEndingChange: (value) => void changes.push(value),
      onEncodingChange: () => {},
    })
    status.render(opened('C:/a.md', 'x'), null)

    const button = [...status.element.querySelectorAll<HTMLElement>('.status-button')].find(
      (candidate) => candidate.textContent === 'LF',
    )!
    button.click()

    expect(changes).toEqual(['crlf'])
  })

  it('lets the byte order mark be added and removed', () => {
    const changes: string[] = []
    const status = new StatusBar({
      onLineEndingChange: () => {},
      onEncodingChange: (value) => void changes.push(value),
    })
    status.render(opened('C:/a.md', 'x'), null)

    const button = [...status.element.querySelectorAll<HTMLElement>('.status-button')].find(
      (candidate) => candidate.textContent === 'UTF-8',
    )!
    button.click()

    expect(changes).toEqual(['utf-8-bom'])
  })
})

describe('OutlineRail', () => {
  it('draws nothing for a document with no headings', () => {
    const rail = new OutlineRail(() => {})
    rail.render(extractHeadings('just prose\n'), 0)
    expect(rail.element.childNodes).toHaveLength(0)
  })

  it('draws one tick per heading, indented by level', () => {
    const rail = new OutlineRail(() => {})
    rail.render(extractHeadings('# One\n## Two\n'), 0)

    const ticks = rail.element.querySelectorAll('.rail-tick')
    expect(ticks).toHaveLength(2)
    expect(ticks[0]?.classList.contains('rail-level-1')).toBe(true)
    expect(ticks[1]?.classList.contains('rail-level-2')).toBe(true)
  })

  it('keeps the heading text out of the rail but in the tooltip', () => {
    const rail = new OutlineRail(() => {})
    rail.render(extractHeadings('# A long heading\n'), 0)

    expect(rail.element.textContent).toBe('')
    expect(rail.element.querySelector('.rail-tick')?.getAttribute('title')).toBe(
      'A long heading',
    )
  })

  it('marks the heading the caret is currently inside', () => {
    const rail = new OutlineRail(() => {})
    const text = '# One\n\nbody\n\n## Two\n\nmore\n'
    const headings = extractHeadings(text)

    rail.render(headings, text.indexOf('more'))

    const current = rail.element.querySelectorAll('.rail-tick-current')
    expect(current).toHaveLength(1)
    expect(current[0]?.getAttribute('title')).toBe('Two')
  })

  it('marks nothing as current above the first heading', () => {
    const rail = new OutlineRail(() => {})
    rail.render(extractHeadings('intro\n\n# One\n'), 0)
    expect(rail.element.querySelectorAll('.rail-tick-current')).toHaveLength(0)
  })

  it('reports the offset to scroll to when a tick is clicked', () => {
    const gone: number[] = []
    const rail = new OutlineRail((offset) => void gone.push(offset))
    const text = '# One\n\n## Two\n'
    rail.render(extractHeadings(text), 0)

    rail.element.querySelectorAll<HTMLElement>('.rail-tick')[1]!.click()
    expect(gone).toEqual([text.indexOf('## Two')])
  })
})
