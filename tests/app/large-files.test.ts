// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App, LARGE_FILE_CHARACTERS } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'

function build(): { app: App; host: MemoryHost; root: HTMLElement } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host, root }
}

const big = 'A line of a very long document.\n'.repeat(
  Math.ceil((LARGE_FILE_CHARACTERS + 1) / 32),
)

beforeEach(() => {
  resetBufferIds()
  document.body.replaceChildren()
})

describe('a large file', () => {
  it('opens as source, which can draw it in time', async () => {
    const { app, host, root } = build()
    host.seed('C:/big.md', big)

    await app.openFiles(['C:/big.md'])

    expect(app.currentMode).toBe('source')
    expect(root.querySelector('.status')?.textContent).toContain('Large file, opened as source')
  })

  it('can still be switched to reader mode by hand', async () => {
    const { app, host } = build()
    host.seed('C:/big.md', big)
    await app.openFiles(['C:/big.md'])

    app.toggleSource()

    expect(app.currentMode).toBe('reader')
  })

  it('leaves an ordinary file in reader mode', async () => {
    const { app, host } = build()
    host.seed('C:/small.md', '# Small\n')

    await app.openFiles(['C:/small.md'])

    expect(app.currentMode).toBe('reader')
  })
})
