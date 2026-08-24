import { describe, expect, it } from 'vitest'
import { MemoryHost } from '../../src/host/memory.js'

describe('MemoryHost', () => {
  it('hands the editor lf text whatever the file had', async () => {
    const host = new MemoryHost('windows')
    host.seed('C:/notes.md', 'one\r\ntwo\r\n')

    const doc = await host.readFile('C:/notes.md')

    expect(doc.text).toBe('one\ntwo\n')
    expect(doc.lineEnding).toBe('crlf')
    expect(doc.encoding).toBe('utf-8')
  })

  it('writes crlf back to a file that came in as crlf', async () => {
    const host = new MemoryHost('windows')
    host.seed('C:/notes.md', 'one\r\ntwo\r\n')

    const doc = await host.readFile('C:/notes.md')
    await host.writeFile({
      path: doc.path!,
      text: `${doc.text}three\n`,
      lineEnding: doc.lineEnding,
      encoding: doc.encoding,
    })

    expect(host.raw('C:/notes.md')).toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('keeps a byte order mark that was already there', async () => {
    const host = new MemoryHost()
    host.seed('/notes.md', '\uFEFF# Title\n')

    const doc = await host.readFile('/notes.md')
    await host.writeFile({
      path: doc.path!,
      text: doc.text,
      lineEnding: doc.lineEnding,
      encoding: doc.encoding,
    })

    expect(host.raw('/notes.md')).toBe('\uFEFF# Title\n')
  })

  it('counts bytes rather than characters', async () => {
    const host = new MemoryHost()
    host.seed('/notes.md', 'café\n')

    const doc = await host.readFile('/notes.md')

    expect(doc.text.length).toBe(5)
    expect(doc.byteLength).toBe(6)
  })

  it('refuses to read a file it has never heard of', async () => {
    const host = new MemoryHost()
    await expect(host.readFile('/missing.md')).rejects.toThrow('No such file')
  })
})
