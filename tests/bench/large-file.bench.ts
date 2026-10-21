import { test } from 'vitest'
import { parseWithTokens } from '../../src/wysiwyg/parser.js'
import { rememberSource, serialisePreserving } from '../../src/wysiwyg/source-memory.js'
import { toMarkdown } from '../../src/wysiwyg/serializer.js'
import { countWords } from '../../src/app/stats.js'
import { extractHeadings } from '../../src/app/outline.js'

/**
 * The budgets in CLAUDE.md that CI cannot check in a real window: opening a
 * big file and the work done when typing pauses. These measure the parts of
 * both that are plain TypeScript, so a change that makes them several times
 * slower shows up in a number rather than in somebody's laptop fan.
 *
 * Reported, not enforced. Timings on a shared CI runner wobble too much to
 * fail a build on, but a 5x jump is obvious in the log.
 */

const SECTION = `## A heading

A paragraph with **bold**, *italic*, \`code\` and a [link](https://example.com).
It runs on to a second line so the paragraph is not trivially short.

- a bullet
- another bullet
  - nested

| a | b |
| - | - |
| 1 | 2 |

\`\`\`js
const answer = 42
\`\`\`

`

function documentOf(bytes: number): string {
  return SECTION.repeat(Math.ceil(bytes / SECTION.length))
}

const ONE_MB = documentOf(1_000_000)
const FIVE_MB = documentOf(5_000_000)

const parsed = parseWithTokens(ONE_MB)
const memory = rememberSource(ONE_MB, parsed.doc, parsed.tokens)

/**
 * Vitest 5 moved to tinybench 6, which runs 64 iterations for a second by
 * default where the old one ran 10 for half a second. On multi-megabyte
 * inputs that would turn a six minute CI step into the best part of an hour, so
 * these are the old defaults, written down. Keeps the numbers comparable with
 * earlier runs too.
 */
const RUN = { time: 500, iterations: 10, warmupTime: 100, warmupIterations: 5 }

// Benchmarks run inside ordinary tests now, so they inherit the 60 second test
// timeout. Serialising 1 MB from scratch takes ten seconds a go on its own.
const SLOW = { timeout: 10 * 60_000 }

test('opening', SLOW, async ({ bench }) => {
  await bench('parse 1 MB into reader mode', () => {
    parseWithTokens(ONE_MB)
  }).run(RUN)

  await bench('parse 5 MB into reader mode', () => {
    parseWithTokens(FIVE_MB)
  }).run({ ...RUN, iterations: 3 })
})

test('when typing pauses, 1 MB', SLOW, async ({ bench }) => {
  await bench.compare(
    bench('save, keeping untouched blocks', () => {
      serialisePreserving(parsed.doc, memory)
    }),
    bench('save, serialising everything', () => {
      toMarkdown(parsed.doc)
    }),
    RUN,
  )
})

test('when typing pauses, 5 MB', SLOW, async ({ bench }) => {
  await bench.compare(
    bench('count words', () => {
      countWords(FIVE_MB)
    }),
    bench('find headings', () => {
      extractHeadings(FIVE_MB)
    }),
    RUN,
  )
})
