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

  it('measures the starting content in bytes, not characters', () => {
    const buffer = newBuffer('macos', { text: '£10\n', name: 'Welcome' })

    expect(buffer.byteLength).toBe(5)
  })
})
