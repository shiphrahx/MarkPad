// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/app.js'
import { MemoryHost } from '../../src/host/memory.js'
import { resetBufferIds } from '../../src/app/buffer.js'

function build(): { app: App; host: MemoryHost } {
  const host = new MemoryHost('windows')
  const root = document.createElement('div')
  document.body.append(root)
  return { app: new App(host, root), host }
}

/** Run a command by the id the palette and the menus use. */
function run(app: App, id: string): void {
  const command = app.commands.find((candidate) => candidate.id === id)
  if (!command) throw new Error(`No command ${id}`)
  void command.run()
}

function enabled(app: App, id: string): boolean {
  const command = app.commands.find((candidate) => candidate.id === id)
  if (!command) throw new Error(`No command ${id}`)
  return command.enabled ? command.enabled() : true
}

/** What the buffer holds once the app has caught up. */
function markdown(app: App): string {
  app.flush()
  return app.workspace.active!.text
}

async function withDocument(text: string): Promise<App> {
  const { app, host } = build()
  host.seed('C:/notes.md', text)
  await app.openFiles(['C:/notes.md'])
  return app
}

describe('formatting commands', () => {
  beforeEach(() => {
    resetBufferIds()
    document.body.replaceChildren()
  })

  it('offers every heading level', async () => {
    const app = await withDocument('text\n')
    const titles = app.commands
      .filter((command) => command.category === 'Format')
      .map((command) => command.title)

    expect(titles).toContain('Heading 1')
    expect(titles).toContain('Heading 6')
    expect(titles).toContain('Paragraph')
  })

  it('shows the keyboard shortcut next to the heading command', async () => {
    const app = await withDocument('text\n')
    const heading = app.commands.find((command) => command.id === 'format.heading1')

    expect(heading?.key).toBe('Mod+Shift+1')
  })

  it('turns a paragraph into a heading', async () => {
    const app = await withDocument('A line of text\n')

    run(app, 'format.heading1')

    expect(markdown(app)).toBe('# A line of text\n')
  })

  it('turns a heading back into a paragraph', async () => {
    const app = await withDocument('# A heading\n')

    run(app, 'format.paragraph')

    expect(markdown(app)).toBe('A heading\n')
  })

  it('changes a heading from one level to another', async () => {
    const app = await withDocument('# A heading\n')

    run(app, 'format.heading3')

    expect(markdown(app)).toBe('### A heading\n')
  })

  it('makes a bullet list', async () => {
    const app = await withDocument('one\n')

    run(app, 'format.bulletList')

    expect(markdown(app)).toBe('- one\n')
  })

  it('makes a numbered list', async () => {
    const app = await withDocument('one\n')

    run(app, 'format.orderedList')

    expect(markdown(app)).toBe('1. one\n')
  })

  it('makes a task list', async () => {
    const app = await withDocument('one\n')

    run(app, 'format.taskList')

    expect(markdown(app)).toBe('- [ ] one\n')
  })

  it('makes a quote', async () => {
    const app = await withDocument('one\n')

    run(app, 'format.quote')

    expect(markdown(app)).toBe('> one\n')
  })

  it('makes a code block', async () => {
    const app = await withDocument('const x = 1\n')

    run(app, 'format.codeBlock')

    expect(markdown(app)).toBe('```\nconst x = 1\n```\n')
  })

  it('inserts a table with a header row', async () => {
    const app = await withDocument('\n')

    run(app, 'format.table')

    const result = markdown(app)
    expect(result).toContain('| --- | --- |')
    expect(result.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3)
  })

  it('inserts a horizontal rule', async () => {
    const app = await withDocument('\n')

    run(app, 'format.rule')

    expect(markdown(app)).toContain('---')
  })

  it('greys formatting out in source view, where you type the markdown', async () => {
    const app = await withDocument('text\n')
    expect(enabled(app, 'format.heading1')).toBe(true)

    app.toggleSource()
    expect(enabled(app, 'format.heading1')).toBe(false)
    expect(enabled(app, 'format.link')).toBe(false)
  })

  it('puts formatting in its own category so the menus group it', async () => {
    const app = await withDocument('text\n')
    const categories = new Set(app.commands.map((command) => command.category))

    expect(categories.has('Format')).toBe(true)
  })
})
