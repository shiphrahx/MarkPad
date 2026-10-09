/**
 * The update check: the one network request MarkPad is allowed to make.
 *
 * Once a day at most, a plain GET to GitHub's public releases API. No ID, no
 * cookie, no referrer, nothing about the machine or the files on it: the
 * request is identical for everybody who runs it. Turning it off stops it
 * completely, and the setting sits in the palette where everything else is.
 *
 * Nothing downloads or installs. A newer version shows up as a line in the
 * status bar that opens the release page, and the rest is up to you.
 */

export const RELEASES_API = 'https://api.github.com/repos/shiphrahx/MarkPad/releases/latest'
const RELEASE_PAGES = 'https://github.com/shiphrahx/MarkPad/releases/'

const ENABLED_KEY = 'markpad.updates'
const CHECKED_KEY = 'markpad.updates.checked'
const DAY_MS = 24 * 60 * 60 * 1000

export interface Update {
  readonly version: string
  readonly url: string
}

/** Whether the check is on. On unless somebody turned it off. */
export function updateChecksEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setUpdateChecks(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(ENABLED_KEY)
    else localStorage.setItem(ENABLED_KEY, 'off')
  } catch {
    // Then it stays as it was, which the palette will go on showing.
  }
}

/**
 * Whether `candidate` is a later version than `current`. Both `1.2.3` with an
 * optional leading `v`. Anything unreadable is not newer, so a strange tag on
 * GitHub never nags anybody.
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parse(candidate)
  const b = parse(current)
  if (a === null || b === null) return false

  for (let index = 0; index < 3; index++) {
    if (a[index]! !== b[index]!) return a[index]! > b[index]!
  }
  return false
}

function parse(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Check, if it is on and has not run in the last day.
 *
 * Null for every outcome that is not "there is a newer version", failures
 * included. Being offline is not something to tell anybody about.
 */
export async function checkForUpdate(
  current: string,
  {
    fetcher = fetch,
    now = Date.now(),
  }: { fetcher?: typeof fetch; now?: number } = {},
): Promise<Update | null> {
  if (!updateChecksEnabled()) return null
  if (now - lastChecked() < DAY_MS) return null
  rememberCheck(now)

  try {
    const response = await fetcher(RELEASES_API, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return null

    const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
    const version = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : ''
    const url = typeof body.html_url === 'string' ? body.html_url : ''

    // The link is only ever one of ours. A response that says otherwise is
    // not one worth putting in front of somebody to click.
    if (!url.startsWith(RELEASE_PAGES)) return null
    if (!isNewer(version, current)) return null

    return { version, url }
  } catch {
    return null
  }
}

function lastChecked(): number {
  try {
    return Number(localStorage.getItem(CHECKED_KEY)) || 0
  } catch {
    return 0
  }
}

function rememberCheck(now: number): void {
  try {
    localStorage.setItem(CHECKED_KEY, String(now))
  } catch {
    // Then it checks again next launch, which is still only one request.
  }
}
