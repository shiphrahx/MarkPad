import { beforeEach, describe, expect, it } from 'vitest'
import { isDirty, newBuffer, resetBufferIds, title } from '../../src/app/buffer.js'

describe('newBuffer', () => {
  beforeEach(() => {
    resetBufferIds()
  })

  it('numbers an ordinary new buffer', () => {
    expect(title(newBuffer('windows'))).toBe('Untitled 1')
  })

  it('uses the given name instead of a number', () => {
    const buffer = newBuffer('macos', { text: '# Hello\n', name: 'Welcome' })

    expect(title(buffer)).toBe('Welcome')
    expect(buffer.text).toBe('# Hello\n')
  })

  it('treats starting content as already saved', () => {
    const buffer = newBuffer('macos', { text: '# Hello\n', name: 'Welcome' })

    expect(isDirty(buffer)).toBe(false)
  })

  it('goes dirty once the starting content is edited', () => {
    const buffer = newBuffer('macos', { text: '# Hello\n', name: 'Welcome' })

    expect(isDirty({ ...buffer, text: '# Hello there\n' })).toBe(true)
  })

  /**
   * A new buffer has no file to inherit an ending from, so it takes the
   * platform's habit. Windows is the only one of the three that writes CRLF,
   * and getting this wrong means every file MarkPad creates on Linux shows up
   * in a diff as a whole-file change.
   */
  it('starts a new file with the ending the platform writes', () => {
    expect(newBuffer('windows').lineEnding).toBe('crlf')
    expect(newBuffer('macos').lineEnding).toBe('lf')
    expect(newBuffer('linux').lineEnding).toBe('lf')
  })

  it('measures the starting content in bytes, not characters', () => {
    const buffer = newBuffer('macos', { text: '£10\n', name: 'Welcome' })

    expect(buffer.byteLength).toBe(5)
  })
})
