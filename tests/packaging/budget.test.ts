import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The budget check is the only thing standing between a change and an
 * installer nobody wants to download, and it had never been run against
 * anything but a real release. It exits with a code rather than returning a
 * value, so the test runs it the way CI does.
 */
function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, ['scripts/check-budget.mjs', ...args], {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (error) {
    const failed = error as { status: number | null; stdout: string; stderr: string }
    return { code: failed.status ?? -1, out: `${failed.stdout}${failed.stderr}` }
  }
}

let directory: string

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'markpad-budget-'))
  writeFileSync(join(directory, 'small.deb'), Buffer.alloc(1024 * 1024))
  writeFileSync(join(directory, 'small.rpm'), Buffer.alloc(2 * 1024 * 1024))
  writeFileSync(join(directory, 'huge.AppImage'), Buffer.alloc(9 * 1024 * 1024))
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('check-budget', () => {
  it('passes a file inside the budget', () => {
    const { code, out } = run(join(directory, 'small.deb'))

    expect(code).toBe(0)
    expect(out).toContain('ok')
  })

  it('takes more than one glob, which is how a Linux release arrives', () => {
    const { code, out } = run(join(directory, '*.deb'), join(directory, '*.rpm'))

    expect(code).toBe(0)
    expect(out).toContain('small.deb')
    expect(out).toContain('small.rpm')
  })

  it('fails on a file over the budget', () => {
    const { code, out } = run(join(directory, 'huge.AppImage'))

    expect(code).toBe(1)
    expect(out).toContain('OVER BUDGET')
  })

  /**
   * The one that matters most. A build that quietly produced nothing would
   * otherwise sail through the check that exists to catch it.
   */
  it('fails when a pattern matches nothing at all', () => {
    const { code, out } = run(join(directory, '*.nothing'))

    expect(code).toBe(2)
    expect(out).toContain('Did the bundle step run?')
  })

  it('fails when only the second of two patterns matches nothing', () => {
    const { code } = run(join(directory, '*.deb'), join(directory, '*.nothing'))

    expect(code).toBe(2)
  })

  it('says how to use it when given nothing', () => {
    const { code, out } = run()

    expect(code).toBe(2)
    expect(out).toContain('Usage')
  })
})
