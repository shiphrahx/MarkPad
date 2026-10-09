import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * ProseMirror's packages check each other's objects with `instanceof`, so a
 * second copy of any of them in the bundle is a second, incompatible set of
 * classes. Nothing throws. The editor just stops being able to take typed
 * text, and unit tests under jsdom never notice, because they don't type.
 *
 * It happened when prosemirror-view was bumped for a security fix: the new
 * version wanted a newer prosemirror-model than everything else had, and pnpm
 * kept both. Only the Linux smoke test caught it.
 */
const lock = readFileSync('pnpm-lock.yaml', 'utf8')

function versionsOf(name: string): string[] {
  const found = new Set<string>()
  for (const match of lock.matchAll(new RegExp(`^ {2}${name}@([0-9][^:\\s]*):`, 'gm'))) {
    found.add(match[1]!)
  }
  return [...found]
}

describe('the lockfile', () => {
  it.each([
    'prosemirror-model',
    'prosemirror-state',
    'prosemirror-view',
    'prosemirror-transform',
    'prosemirror-commands',
    'prosemirror-keymap',
    'prosemirror-history',
    'prosemirror-tables',
    'prosemirror-schema-list',
    'prosemirror-inputrules',
    'prosemirror-markdown',
    'prosemirror-dropcursor',
    'prosemirror-gapcursor',
  ])('has one copy of %s', (name) => {
    expect(versionsOf(name)).toHaveLength(1)
  })
})
