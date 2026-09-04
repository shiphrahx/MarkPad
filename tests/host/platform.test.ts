import { describe, expect, it } from 'vitest'
import { platformFromUserAgent } from '../../src/host/platform.js'

/**
 * Real user agents, copied off each webview rather than written from memory.
 * The whole point of this function is that the three strings differ in ways
 * nobody would guess.
 */
const WEBVIEW2 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'

const WKWEBVIEW =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const WEBKITGTK =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('platformFromUserAgent', () => {
  it('knows each of the three webviews', () => {
    expect(platformFromUserAgent(WEBVIEW2)).toBe('windows')
    expect(platformFromUserAgent(WKWEBVIEW)).toBe('macos')
    expect(platformFromUserAgent(WEBKITGTK)).toBe('linux')
  })

  it('reads a Wayland session as Linux', () => {
    expect(
      platformFromUserAgent('Mozilla/5.0 (Wayland; Linux aarch64) AppleWebKit/605.1.15'),
    ).toBe('linux')
  })

  /**
   * Windows stays the fallback. An unrecognised string is far more likely to
   * be a WebView2 nobody has seen before than a Linux one, and getting it
   * wrong costs a modifier key drawn oddly rather than anything that breaks.
   */
  it('falls back to Windows for something it does not recognise', () => {
    expect(platformFromUserAgent('Mozilla/5.0')).toBe('windows')
    expect(platformFromUserAgent('')).toBe('windows')
  })
})
