// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { followLinks } from '../../src/app/links.js'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'

let opened: string[]
let stop: () => void

function click(element: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  element.dispatchEvent(event)
  return event
}

beforeEach(() => {
  opened = []
  document.body.innerHTML = `
    <article class="preview"><a href="https://example.com">site</a><a href="#intro">jump</a></article>
    <div contenteditable="true"><a href="https://example.org">in the editor</a></div>
  `
  stop = followLinks(document, (href) => opened.push(href))
})

afterEach(() => stop())

describe('followLinks', () => {
  it('opens a link in the preview rather than letting the window follow it', () => {
    const event = click(document.querySelector('.preview a')!)

    expect(opened).toEqual(['https://example.com'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a jump to a heading alone', () => {
    const event = click(document.querySelector('a[href="#intro"]')!)

    expect(opened).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('lets a plain click in the editor place the caret', () => {
    click(document.querySelector('[contenteditable] a')!)

    expect(opened).toEqual([])
  })

  it('opens a link in the editor on Ctrl+click', () => {
    click(document.querySelector('[contenteditable] a')!, { ctrlKey: true })

    expect(opened).toEqual(['https://example.org'])
  })

  it('opens a link in the editor on Cmd+click', () => {
    click(document.querySelector('[contenteditable] a')!, { metaKey: true })

    expect(opened).toEqual(['https://example.org'])
  })

  it('ignores anything that is not a link', () => {
    click(document.querySelector('.preview')!)

    expect(opened).toEqual([])
  })
})

describe('links in the app', () => {
  it('sends a click in the preview pane to the host', async () => {
    stop()
    document.body.replaceChildren()

    const host = new MemoryHost('windows')
    host.seed('C:/notes/today.md', '[a site](https://example.com)\n')
    const root = document.createElement('div')
    document.body.append(root)
    const app = new App(host, root)
    await app.openFiles(['C:/notes/today.md'])

    app.togglePreview()
    await new Promise((resolve) => setTimeout(resolve, 0))
    click(root.querySelector('.preview a')!)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(host.openedLinks).toEqual(['https://example.com'])
  })
})
