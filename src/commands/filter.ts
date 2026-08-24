/**
 * Matching typed text against command names.
 *
 * A subsequence match, scored so the thing you meant comes first. Typing "sa"
 * should offer Save before Save as, and "cle" should find "Change line
 * endings" through the initials of its words.
 *
 * The obvious greedy version, taking the first occurrence of each character,
 * gets that second case wrong: it matches the "e" inside "line" and never
 * reaches "endings". So this walks every alignment with a small dynamic
 * programme and keeps the best one. Command names are a few dozen characters
 * and the palette is redrawn per keystroke, which this is comfortably fast
 * enough for.
 */

export interface Match {
  readonly score: number
  /** Indices of the matched characters, for highlighting. */
  readonly positions: readonly number[]
}

const START_OF_WORD = 12
const CONSECUTIVE = 10
const EXACT_CASE = 1
const IMPOSSIBLE = Number.NEGATIVE_INFINITY

export function match(query: string, text: string): Match | null {
  const needle = [...query.toLowerCase()].filter((character) => character !== ' ')
  if (needle.length === 0) return { score: 0, positions: [] }
  if (needle.length > text.length) return null

  const haystack = [...text.toLowerCase()]
  const original = [...text]
  const queryOriginal = [...query].filter((character) => character !== ' ')

  // best[j] is the score of the best alignment of the query so far that ends
  // with a match at position j. from[i][j] is where that alignment came from.
  let best = new Array<number>(haystack.length).fill(IMPOSSIBLE)
  const from: Array<Int32Array> = []

  for (let i = 0; i < needle.length; i++) {
    const next = new Array<number>(haystack.length).fill(IMPOSSIBLE)
    const parents = new Int32Array(haystack.length).fill(-1)

    // Running best of every alignment of the previous character that ended
    // strictly before j, so each position is considered in one pass.
    let bestBefore = IMPOSSIBLE
    let bestBeforeAt = -1

    for (let j = 0; j < haystack.length; j++) {
      if (haystack[j] === needle[i]) {
        let base = 0
        if (isStartOfWord(original, j)) base += START_OF_WORD
        if (original[j] === queryOriginal[i]) base += EXACT_CASE

        if (i === 0) {
          next[j] = base
          parents[j] = -1
        } else {
          const separate = bestBefore === IMPOSSIBLE ? IMPOSSIBLE : bestBefore + base
          const adjacent =
            j > 0 && best[j - 1] !== IMPOSSIBLE
              ? best[j - 1]! + base + CONSECUTIVE
              : IMPOSSIBLE

          if (adjacent >= separate && adjacent !== IMPOSSIBLE) {
            next[j] = adjacent
            parents[j] = j - 1
          } else if (separate !== IMPOSSIBLE) {
            next[j] = separate
            parents[j] = bestBeforeAt
          }
        }
      }

      const candidate = best[j]!
      if (candidate > bestBefore) {
        bestBefore = candidate
        bestBeforeAt = j
      }
    }

    from.push(parents)
    best = next
  }

  let score = IMPOSSIBLE
  let end = -1
  for (let j = 0; j < best.length; j++) {
    if (best[j]! > score) {
      score = best[j]!
      end = j
    }
  }
  if (end === -1 || score === IMPOSSIBLE) return null

  const positions: number[] = []
  let position = end
  for (let i = needle.length - 1; i >= 0; i--) {
    positions.unshift(position)
    position = from[i]![position]!
  }

  // A short command that matched is usually the one meant: "Save" beats
  // "Save all open files" for the query "save".
  score += Math.max(0, 20 - text.length)

  return { score, positions }
}

function isStartOfWord(characters: readonly string[], index: number): boolean {
  if (index === 0) return true
  const previous = characters[index - 1]
  return previous === undefined || /[\s\-_/]/.test(previous)
}

/** Filter and sort a list by how well each item's label matches the query. */
export function rank<T>(
  query: string,
  items: readonly T[],
  label: (item: T) => string,
): Array<{ item: T; match: Match }> {
  const results: Array<{ item: T; match: Match }> = []

  for (const item of items) {
    const found = match(query, label(item))
    if (found) results.push({ item, match: found })
  }

  // Array.prototype.sort is stable, so an equal score leaves the declared
  // order alone. That is what makes an empty query list the commands in the
  // order they were registered.
  return results.sort((a, b) => b.match.score - a.match.score)
}
