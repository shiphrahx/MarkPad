import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The window renders Markdown from files people download, raw HTML blocks
 * included. The policy is what stops that HTML doing more than drawing.
 */
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
  app: { security: { csp: string } }
}

function directive(name: string): string | undefined {
  return config.app.security.csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))
}

describe('the content security policy', () => {
  it('only runs the app’s own scripts', () => {
    expect(directive('default-src')).toBe("default-src 'self'")
    expect(directive('script-src')).toBeUndefined()
    expect(config.app.security.csp).not.toContain("'unsafe-eval'")
  })

  it('refuses plugins and embedded objects', () => {
    expect(directive('object-src')).toBe("object-src 'none'")
  })

  /** A `<base>` tag in a document would quietly repoint every relative URL. */
  it('refuses a base tag', () => {
    expect(directive('base-uri')).toBe("base-uri 'none'")
  })

  /** A `<form>` in a document could otherwise post whatever is typed into it. */
  it('refuses to submit a form anywhere', () => {
    expect(directive('form-action')).toBe("form-action 'none'")
  })

  it('loads pictures only from the image protocol and data URIs', () => {
    expect(directive('img-src')).not.toContain('https:')
    expect(directive('img-src')).toContain('markpad-image:')
  })
})
