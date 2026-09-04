// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseColour } from '../../src/ui/native-chrome.js'

/**
 * The Windows caption colour comes from a design token read back off the
 * stylesheet, which means it arrives as whatever form the browser felt like
 * serialising it in. Getting this wrong paints the title bar a colour that
 * appears nowhere else in the app, and nothing else in the codebase would
 * notice.
 *
 * The function was exported to be tested and then never was.
 */
describe('parseColour', () => {
  it('reads a six digit hex', () => {
    expect(parseColour('#0e7c66')).toEqual([14, 124, 102])
  })

  it('reads a three digit hex by doubling each digit', () => {
    expect(parseColour('#fff')).toEqual([255, 255, 255])
    expect(parseColour('#012')).toEqual([0, 17, 34])
  })

  it('does not care about case', () => {
    expect(parseColour('#0E7C66')).toEqual([14, 124, 102])
  })

  it('reads rgb and rgba, dropping the alpha', () => {
    expect(parseColour('rgb(19, 26, 25)')).toEqual([19, 26, 25])
    expect(parseColour('rgba(19, 26, 25, 0.28)')).toEqual([19, 26, 25])
  })

  it('reads the slash form that getComputedStyle sometimes returns', () => {
    expect(parseColour('rgb(19 26 25 / 0.28)')).toEqual([19, 26, 25])
  })

  it('ignores whitespace around the value', () => {
    expect(parseColour('  #0e7c66  ')).toEqual([14, 124, 102])
  })

  /**
   * Mid grey rather than a throw. This runs during startup, and the colour of
   * a title bar is not worth failing to launch over.
   */
  it('falls back to mid grey for anything it cannot read', () => {
    expect(parseColour('teal')).toEqual([128, 128, 128])
    expect(parseColour('')).toEqual([128, 128, 128])
    expect(parseColour('#12345')).toEqual([128, 128, 128])
  })
})
