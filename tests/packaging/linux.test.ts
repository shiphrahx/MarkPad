import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The packaging config is only exercised by a release, which is the worst
 * place to find out something is missing from it. None of this needs a build:
 * it is reading two files and asserting what they say.
 */
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
  bundle: {
    targets: string[]
    linux?: {
      deb?: { depends?: string[]; desktopTemplate?: string; section?: string }
      rpm?: { depends?: string[] }
    }
  }
}

const linux = config.bundle.linux ?? {}

describe('bundle targets', () => {
  it('builds a package for every platform MarkPad claims', () => {
    expect(config.bundle.targets).toEqual(
      expect.arrayContaining(['nsis', 'dmg', 'deb', 'rpm']),
    )
  })

  /**
   * Not an oversight. An AppImage carries its own WebKitGTK and lands around
   * 80 MB against an 8 MB budget. 0004 has the reasoning; this is here so
   * adding it back is a deliberate act rather than a tidy-up.
   */
  it('does not build an AppImage', () => {
    expect(config.bundle.targets).not.toContain('appimage')
  })
})

describe('the Linux packages', () => {
  it('depends on a WebKitGTK new enough to run the editor', () => {
    const depends = linux.deb?.depends ?? []
    expect(depends.some((entry) => entry.startsWith('libwebkit2gtk-4.1-0'))).toBe(true)
    expect(depends.join(' ')).toContain('>=')
  })

  it('depends on WebKitGTK in the rpm as well', () => {
    expect(linux.rpm?.depends ?? []).toContain('webkit2gtk4.1')
  })
})

describe('the desktop entry', () => {
  const template = readFileSync(`src-tauri/${linux.deb?.desktopTemplate}`, 'utf8')

  it('is where the config says it is', () => {
    expect(linux.deb?.desktopTemplate).toBe('markpad.desktop')
    expect(template).toContain('[Desktop Entry]')
  })

  /**
   * The two lines the whole thing is for. Without %F the file manager launches
   * MarkPad with no arguments and startup_files has nothing to open; without
   * MimeType, MarkPad never appears in Open With at all.
   */
  it('passes the files it was opened with', () => {
    expect(template).toMatch(/^Exec=.*%F$/m)
  })

  it('claims Markdown', () => {
    const mime = /^MimeType=(.*)$/m.exec(template)?.[1] ?? ''
    expect(mime).toContain('text/markdown')
    expect(mime).toContain('text/plain')
  })

  it('lands somewhere sensible in an application menu', () => {
    expect(template).toMatch(/^Categories=.*TextEditor.*$/m)
  })

  it('does not open a terminal window alongside itself', () => {
    expect(template).toMatch(/^Terminal=false$/m)
  })
})
