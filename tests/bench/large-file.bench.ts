import { bench, describe } from 'vitest'
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

describe('opening', () => {
  bench('parse 1 MB into reader mode', () => {
    parseWithTokens(ONE_MB)
  })

  bench('parse 5 MB into reader mode', () => {
    parseWithTokens(FIVE_MB)
  }, { iterations: 3 })
})

describe('when typing pauses, 1 MB', () => {
  bench('save, keeping untouched blocks', () => {
    serialisePreserving(parsed.doc, memory)
  })

  bench('save, serialising everything', () => {
    toMarkdown(parsed.doc)
  })
})

describe('when typing pauses, 5 MB', () => {
  bench('count words', () => {
    countWords(FIVE_MB)
  })

  bench('find headings', () => {
    extractHeadings(FIVE_MB)
  })
})
