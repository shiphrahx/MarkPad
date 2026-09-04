import type { Platform } from './types.js'

/**
 * Which machine this is, read off the user agent.
 *
 * Not the OS plugin. The only thing the app does with the answer is pick which
 * modifier to draw and which line ending a new file gets, and that is not
 * worth a round trip to Rust on startup or another permission in the
 * capability file.
 *
 * Its own module, and taking the string as an argument, so it can be tested
 * without pulling Tauri into a Node test.
 */
export function platformFromUserAgent(agent: string): Platform {
  // Macintosh first. Every WKWebView says so, and nothing else does.
  if (/macintosh|mac os x/i.test(agent)) return 'macos'

  // WebKitGTK says X11 or Wayland and Linux. Checked explicitly rather than
  // left to the end, because Windows stays the fallback: a user agent nobody
  // recognises is far more likely to be a WebView2 quirk than a Linux one.
  if (/linux|x11|wayland/i.test(agent)) return 'linux'

  return 'windows'
}
