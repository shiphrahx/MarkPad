// Runs tsc after Claude edits a TypeScript file, so a type error shows up on
// the edit that caused it rather than at the next commit.
//
// Exit code 2 hands tsc's output back to Claude to fix. Anything that isn't a
// .ts file is ignored.
import { execSync } from 'node:child_process'

let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let path = ''
  try {
    const payload = JSON.parse(input)
    path = payload.tool_input?.file_path ?? payload.tool_response?.filePath ?? ''
  } catch {
    process.exit(0)
  }

  if (!/\.tsx?$/.test(path)) process.exit(0)

  try {
    execSync('pnpm -s typecheck', { stdio: ['ignore', 2, 2] })
  } catch {
    process.exit(2)
  }
})
