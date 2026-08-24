// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** jsdom has no matchMedia, so the OS preference is faked per test. */
function pretendSystemIsDark(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

/** The module keeps the choice in a variable, so each test needs a fresh one. */
async function freshModule() {
  vi.resetModules()
  return import('../../src/ui/theme.js')
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    pretendSystemIsDark(false)
  })

  it('follows the system by default', async () => {
    const theme = await freshModule()
    expect(theme.currentTheme()).toBe('system')
  })

  it('writes no attribute while following the system', async () => {
    const theme = await freshModule()
    theme.apply()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light dark')
  })

  it('marks the root element with an explicit choice', async () => {
    const theme = await freshModule()
    theme.setTheme('dark')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('resolves what is actually showing', async () => {
    const theme = await freshModule()

    theme.setTheme('dark')
    expect(theme.isDark()).toBe(true)

    theme.setTheme('light')
    expect(theme.isDark()).toBe(false)
  })

  it('asks the system when set to system', async () => {
    pretendSystemIsDark(true)
    const theme = await freshModule()

    expect(theme.currentTheme()).toBe('system')
    expect(theme.isDark()).toBe(true)
  })

  it('lets an explicit light beat a dark system', async () => {
    pretendSystemIsDark(true)
    const theme = await freshModule()

    theme.setTheme('light')
    expect(theme.isDark()).toBe(false)
  })

  it('remembers the choice', async () => {
    const first = await freshModule()
    first.setTheme('dark')

    const second = await freshModule()
    expect(second.currentTheme()).toBe('dark')
  })

  it('forgets it again when set back to system', async () => {
    const first = await freshModule()
    first.setTheme('dark')
    first.setTheme('system')

    const second = await freshModule()
    expect(second.currentTheme()).toBe('system')
  })

  it('tells listeners what changed', async () => {
    const theme = await freshModule()
    const seen: Array<[string, boolean]> = []
    theme.onThemeChange((value, dark) => void seen.push([value, dark]))

    theme.setTheme('dark')
    theme.setTheme('light')

    expect(seen).toEqual([
      ['dark', true],
      ['light', false],
    ])
  })

  it('stops telling a listener that unsubscribed', async () => {
    const theme = await freshModule()
    let calls = 0
    const stop = theme.onThemeChange(() => void (calls += 1))

    theme.setTheme('dark')
    stop()
    theme.setTheme('light')

    expect(calls).toBe(1)
  })

  it('starts up rather than failing when storage is unavailable', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage is disabled')
      })

    const theme = await freshModule()
    expect(theme.currentTheme()).toBe('system')

    getItem.mockRestore()
  })

  it('names each choice in words a person would use', async () => {
    const theme = await freshModule()

    expect(theme.themeLabel('light')).toBe('Light')
    expect(theme.themeLabel('dark')).toBe('Dark')
    expect(theme.themeLabel('system')).toBe('Match the system')
  })
})
