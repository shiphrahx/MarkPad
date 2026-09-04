// Fails the build if the installer is over budget.
//
// The rules put it plainly: if a change breaks a budget, the change is wrong,
// not the budget. So this exits non-zero rather than printing a warning
// somebody scrolls past.

import { globSync } from 'node:fs'
import { statSync } from 'node:fs'

const LIMIT_MB = 8

// More than one, because a Linux release is a deb and an rpm and both of them
// are something somebody downloads.
const patterns = process.argv.slice(2)
if (patterns.length === 0) {
  console.error('Usage: check-budget.mjs <glob> [glob...]')
  process.exit(2)
}

const matches = patterns.flatMap((pattern) => {
  const found = globSync(pattern)
  if (found.length === 0) {
    console.error(`No installer matched ${pattern}. Did the bundle step run?`)
    process.exit(2)
  }
  return found
})

let worst = 0
for (const file of matches) {
  const megabytes = statSync(file).size / 1024 / 1024
  worst = Math.max(worst, megabytes)
  const verdict = megabytes < LIMIT_MB ? 'ok' : 'OVER BUDGET'
  console.log(`${megabytes.toFixed(2)} MB of ${LIMIT_MB} MB  ${verdict}  ${file}`)
}

if (worst >= LIMIT_MB) {
  console.error(
    `\nThe installer is ${worst.toFixed(2)} MB, over the ${LIMIT_MB} MB budget.`,
  )
  process.exit(1)
}

console.log(`\nUsing ${((worst / LIMIT_MB) * 100).toFixed(0)}% of the installer budget.`)
