import { describe, expect, it } from 'vitest'
import { directoryOf, isRemote, resolveImage } from '../../src/app/images.js'

describe('directoryOf', () => {
  it('finds the folder on either separator', () => {
    expect(directoryOf('C:/Users/cassia/notes.md')).toBe('C:/Users/cassia')
    expect(directoryOf('C:\\Users\\cassia\\notes.md')).toBe('C:\\Users\\cassia')
    expect(directoryOf('/home/cassia/notes.md')).toBe('/home/cassia')
  })

  it('keeps the slash on a root', () => {
    expect(directoryOf('/notes.md')).toBe('/')
    expect(directoryOf('C:/notes.md')).toBe('C:/')
  })

  it('has nothing to say about a buffer that was never saved', () => {
    expect(directoryOf(null)).toBeNull()
    expect(directoryOf('notes.md')).toBeNull()
  })
})

describe('isRemote', () => {
  it('knows the web when it sees it', () => {
    expect(isRemote('https://example.com/cat.png')).toBe(true)
    expect(isRemote('http://example.com/cat.png')).toBe(true)
    expect(isRemote('data:image/png;base64,iVBOR')).toBe(true)
  })

  it('does not think a plain path is a URL', () => {
    expect(isRemote('diagram.png')).toBe(false)
    expect(isRemote('./images/diagram.png')).toBe(false)
    expect(isRemote('/home/cassia/diagram.png')).toBe(false)
  })

  /**
   * The one that would go wrong quietly. `C:` looks exactly like a scheme, so
   * a naive check reads every Windows path as a URL and no image on Windows
   * ever loads.
   */
  it('does not mistake a Windows drive letter for a scheme', () => {
    expect(isRemote('C:/Users/cassia/diagram.png')).toBe(false)
    expect(isRemote('C:\\Users\\cassia\\diagram.png')).toBe(false)
  })
})

describe('resolveImage', () => {
  it('joins a relative path to the folder the document is in', () => {
    expect(resolveImage('diagram.png', 'C:/notes')).toBe('C:/notes/diagram.png')
    expect(resolveImage('img/diagram.png', '/home/cassia')).toBe(
      '/home/cassia/img/diagram.png',
    )
  })

  it('uses the separator the folder was written with', () => {
    expect(resolveImage('diagram.png', 'C:\\Users\\cassia')).toBe(
      'C:\\Users\\cassia\\diagram.png',
    )
  })

  it('does not double the separator on a root folder', () => {
    expect(resolveImage('diagram.png', '/')).toBe('/diagram.png')
    expect(resolveImage('diagram.png', 'C:/')).toBe('C:/diagram.png')
  })

  it('drops a leading dot slash', () => {
    expect(resolveImage('./diagram.png', '/home/cassia')).toBe('/home/cassia/diagram.png')
  })

  it('leaves an absolute path where it is', () => {
    expect(resolveImage('/var/pics/a.png', '/home/cassia')).toBe('/var/pics/a.png')
    expect(resolveImage('D:/pics/a.png', 'C:/notes')).toBe('D:/pics/a.png')
  })

  /**
   * Markdown holds a URL and the disk holds a name. Without the decode, a file
   * called "my notes.png" is looked for under the name "my%20notes.png".
   */
  it('turns a percent escape back into the character it stands for', () => {
    expect(resolveImage('my%20notes.png', '/home/cassia')).toBe(
      '/home/cassia/my notes.png',
    )
  })

  it('takes a stray percent sign literally rather than throwing', () => {
    expect(resolveImage('100%.png', '/home/cassia')).toBe('/home/cassia/100%.png')
  })

  it('has no answer for a remote image', () => {
    expect(resolveImage('https://example.com/cat.png', '/home/cassia')).toBeNull()
    expect(resolveImage('data:image/png;base64,iVBOR', '/home/cassia')).toBeNull()
  })

  it('has no answer for a relative path with nowhere to be relative to', () => {
    expect(resolveImage('diagram.png', null)).toBeNull()
  })

  it('has no answer for an empty src', () => {
    expect(resolveImage('', '/home/cassia')).toBeNull()
    expect(resolveImage('   ', '/home/cassia')).toBeNull()
  })
})
