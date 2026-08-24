// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { el, highlight, replace } from '../../src/ui/dom.js'

describe('el', () => {
  it('builds an element with attributes and children', () => {
    const node = el('div', { class: 'thing', 'data-id': 4 }, 'text')
    expect(node.outerHTML).toBe('<div class="thing" data-id="4">text</div>')
  })

  it('writes a true attribute as bare and skips a false one', () => {
    expect(el('input', { disabled: true }).outerHTML).toBe('<input disabled="">')
    expect(el('input', { disabled: false }).outerHTML).toBe('<input>')
  })

  it('skips an attribute that is undefined', () => {
    expect(el('div', { title: undefined }).outerHTML).toBe('<div></div>')
  })

  it('treats a string child as text, not markup', () => {
    const node = el('div', {}, '<script>alert(1)</script>')
    expect(node.querySelector('script')).toBeNull()
    expect(node.textContent).toBe('<script>alert(1)</script>')
  })
})

describe('replace', () => {
  it('swaps the contents wholesale', () => {
    const parent = el('div', {}, 'old')
    replace(parent, 'new')
    expect(parent.textContent).toBe('new')
  })

  it('empties an element when given nothing', () => {
    const parent = el('div', {}, 'old')
    replace(parent)
    expect(parent.childNodes).toHaveLength(0)
  })
})

describe('highlight', () => {
  function html(label: string, positions: number[]): string {
    const holder = el('span')
    holder.appendChild(highlight(label, positions))
    return holder.innerHTML
  }

  it('marks the matched characters', () => {
    expect(html('Save', [0, 2])).toBe('<mark>S</mark>a<mark>v</mark>e')
  })

  it('joins adjacent matches into one mark', () => {
    expect(html('Save', [0, 1])).toBe('<mark>Sa</mark>ve')
  })

  it('leaves an unmatched label alone', () => {
    expect(html('Save', [])).toBe('Save')
  })

  it('cannot be tricked into producing markup', () => {
    expect(html('<b>', [0])).toBe('<mark>&lt;</mark>b&gt;')
  })
})
