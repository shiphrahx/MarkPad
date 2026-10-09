// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkForUpdate,
  isNewer,
  RELEASES_API,
  setUpdateChecks,
  updateChecksEnabled,
} from '../../src/app/updates.js'

function replying(body: unknown, ok = true): { fetcher: typeof fetch; calls: RequestInit[] } {
  const calls: RequestInit[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    expect(url).toBe(RELEASES_API)
    calls.push(init)
    return { ok, json: async () => body } as Response
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

const RELEASE = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/shiphrahx/MarkPad/releases/tag/v0.2.0',
}

beforeEach(() => localStorage.clear())

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('0.1.10', '0.1.9')).toBe(true)
    expect(isNewer('1.0.0', '0.9.9')).toBe(true)
    expect(isNewer('0.1.4', '0.1.4')).toBe(false)
    expect(isNewer('0.1.3', '0.1.4')).toBe(false)
  })

  it('takes a leading v', () => {
    expect(isNewer('v0.2.0', '0.1.4')).toBe(true)
  })

  it('never calls something it cannot read newer', () => {
    expect(isNewer('nightly', '0.1.4')).toBe(false)
    expect(isNewer('0.2.0-beta', '0.1.4')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('finds a newer release', async () => {
    const { fetcher } = replying(RELEASE)

    expect(await checkForUpdate('0.1.4', { fetcher })).toEqual({
      version: '0.2.0',
      url: RELEASE.html_url,
    })
  })

  it('says nothing when this is the latest', async () => {
    const { fetcher } = replying({ ...RELEASE, tag_name: 'v0.1.4' })

    expect(await checkForUpdate('0.1.4', { fetcher })).toBeNull()
  })

  it('sends no cookies and no referrer', async () => {
    const { fetcher, calls } = replying(RELEASE)
    await checkForUpdate('0.1.4', { fetcher })

    expect(calls[0]?.credentials).toBe('omit')
    expect(calls[0]?.referrerPolicy).toBe('no-referrer')
  })

  it('asks at most once a day', async () => {
    const { fetcher, calls } = replying(RELEASE)
    const now = Date.UTC(2026, 9, 9)

    await checkForUpdate('0.1.4', { fetcher, now })
    await checkForUpdate('0.1.4', { fetcher, now: now + 60_000 })
    await checkForUpdate('0.1.4', { fetcher, now: now + 25 * 60 * 60 * 1000 })

    expect(calls).toHaveLength(2)
  })

  it('makes no request at all once turned off', async () => {
    const { fetcher, calls } = replying(RELEASE)
    setUpdateChecks(false)

    expect(await checkForUpdate('0.1.4', { fetcher })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('can be turned back on', () => {
    setUpdateChecks(false)
    setUpdateChecks(true)

    expect(updateChecksEnabled()).toBe(true)
  })

  it('will not offer a link that is not one of our release pages', async () => {
    const { fetcher } = replying({ ...RELEASE, html_url: 'https://example.com/download' })

    expect(await checkForUpdate('0.1.4', { fetcher })).toBeNull()
  })

  it('keeps quiet when offline', async () => {
    const fetcher = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    expect(await checkForUpdate('0.1.4', { fetcher })).toBeNull()
  })

  it('keeps quiet when GitHub says no', async () => {
    const { fetcher } = replying({}, false)

    expect(await checkForUpdate('0.1.4', { fetcher })).toBeNull()
  })
})
