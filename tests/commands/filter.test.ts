import { describe, expect, it } from 'vitest'
import { match, rank } from '../../src/commands/filter.js'

describe('match', () => {
  it('matches a straight prefix', () => {
    expect(match('sav', 'Save')).not.toBeNull()
  })

  it('matches a subsequence with gaps', () => {
    expect(match('sf', 'Save file')).not.toBeNull()
  })

  it('refuses a query that is not a subsequence', () => {
    expect(match('zz', 'Save')).toBeNull()
  })

  it('ignores case', () => {
    expect(match('SAVE', 'save')).not.toBeNull()
  })

  it('reports where it matched so the palette can highlight it', () => {
    expect(match('sv', 'Save')?.positions).toEqual([0, 2])
  })

  it('matches everything on an empty query', () => {
    expect(match('', 'Anything')).toEqual({ score: 0, positions: [] })
  })

  it('scores a word start above a match mid-word', () => {
    const start = match('f', 'Save file')!.score
    const middle = match('v', 'Save file')!.score
    expect(start).toBeGreaterThan(middle)
  })

  it('scores the same query higher where the characters sit together', () => {
    const together = match('ab', 'abacus')!.score
    const scattered = match('ab', 'axxxbxx')!.score
    expect(together).toBeGreaterThan(scattered)
  })

  it('reaches past an earlier match to land on a word start', () => {
    // The greedy version stopped at the "e" in "line" and never got here.
    expect(match('cle', 'Change line endings')?.positions).toEqual([0, 7, 12])
  })
})

describe('rank', () => {
  const commands = ['Save', 'Save as', 'Save all', 'Close tab', 'Change line endings']

  function order(query: string): string[] {
    return rank(query, commands, (command) => command).map((result) => result.item)
  }

  it('puts the shorter exact match first', () => {
    expect(order('save')[0]).toBe('Save')
  })

  it('finds a command through the initials of its words', () => {
    expect(order('cle')[0]).toBe('Change line endings')
  })

  it('drops everything that does not match', () => {
    expect(order('zzz')).toEqual([])
  })

  it('keeps the declared order when the query is empty', () => {
    expect(order('')).toEqual(commands)
  })
})
