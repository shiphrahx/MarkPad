import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The version is written once, in package.json. Tauri reads it from there for
 * the installers and the release workflow checks the tag against it. Cargo
 * cannot point at another file, so Cargo.toml keeps a copy, and this is what
 * stops the copy going stale.
 */
const declared = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

describe('the version', () => {
  it('is taken from package.json by Tauri', () => {
    const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as { version: string }
    expect(config.version).toBe('../package.json')
  })

  it('matches in Cargo.toml', () => {
    const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
    expect(/^version = "(.+)"$/m.exec(cargo)?.[1]).toBe(declared)
  })
})
