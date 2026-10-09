import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Double-clicking a `.md` file is the first thing the README promises. On
 * Windows and macOS that only works if the installer registers MarkPad for
 * the extension, and nothing short of a release would show it missing.
 */
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
  bundle: {
    fileAssociations?: Array<{ ext: string[]; role?: string; mimeType?: string }>
  }
}

const markdown = config.bundle.fileAssociations?.find((entry) => entry.ext.includes('md'))

describe('file associations', () => {
  it('registers MarkPad for .md and .markdown', () => {
    expect(markdown?.ext).toEqual(expect.arrayContaining(['md', 'markdown']))
  })

  it('says it edits them, not only views them', () => {
    expect(markdown?.role).toBe('Editor')
  })

  it('uses the registered Markdown type', () => {
    expect(markdown?.mimeType).toBe('text/markdown')
  })
})
