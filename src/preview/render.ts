import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { createMarkdown, HTML_BLOCK_TOKEN } from '../markdown/markdown.js'

/**
 * Markdown to HTML, for the preview pane, the popovers and the export.
 *
 * The same parser the editor reads files with, from ../markdown. That is the
 * point: a document cannot mean one thing in the window and another in the PDF.
 * Only the rendering differs, and only where it has to.
 *
 * Nothing here sanitises the output. The content is the user's own file, shown
 * back to them, and the window runs under a content security policy of
 * `default-src 'self'` which stops an inline script in a Markdown file from
 * doing anything at all. The exported HTML carries a stricter one in a meta
 * tag, so a file that ends up in a browser behaves the same way.
 */

/** Blocks the preview hands to something else to draw. */
export type BlockKind = 'mermaid' | 'math'

export interface RenderedBlock {
  readonly kind: BlockKind
  readonly id: string
  readonly source: string
}

export interface Rendered {
  readonly html: string
  /** Placeholders in `html`, in document order, waiting to be drawn. */
  readonly blocks: readonly RenderedBlock[]
}

/**
 * Render Markdown.
 *
 * Mermaid diagrams and display maths come back as placeholder elements rather
 * than finished HTML. Drawing either one means loading a library that is larger
 * than the rest of the app put together, so the caller decides whether it is
 * worth it and loads it on demand.
 */
export function render(markdown: string): Rendered {
  const blocks: RenderedBlock[] = []
  const html = renderer.render(markdown, { blocks })

  return { html, blocks }
}

/** What the fence rule collects into while a render is running. */
interface RenderEnvironment {
  blocks: RenderedBlock[]
}

function isCollecting(env: unknown): env is RenderEnvironment {
  return typeof env === 'object' && env !== null && Array.isArray((env as RenderEnvironment).blocks)
}

const renderer = buildRenderer()

function buildRenderer(): MarkdownIt {
  const markdown = createMarkdown()
  const rules = markdown.renderer.rules

  const defaultFence = rules.fence!

  /**
   * Fences that are not code.
   *
   * `mermaid` and `math` are drawn by a library rather than highlighted, so
   * they leave a placeholder behind and the caller fills it in. Done as a
   * renderer rule rather than by rewriting the Markdown before parsing, which
   * is what this used to do: a regular expression looking for fences gets
   * indentation, lists and unterminated blocks wrong, and the parser already
   * knows the answer to all three.
   */
  rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]!
    const kind = drawnRatherThanHighlighted(token.info)

    if (kind === null || !isCollecting(env)) {
      return defaultFence(tokens, index, options, env, self)
    }

    const id = `block-${env.blocks.length + 1}`
    // markdown-it keeps the newline before the closing fence; the drawing
    // libraries do not want it.
    env.blocks.push({ kind, id, source: token.content.replace(/\n$/, '') })

    return `<div class="mp-block" data-block-id="${id}"></div>`
  }

  /** Raw HTML, written out as it arrived. */
  rules[HTML_BLOCK_TOKEN] = (tokens, index) => tokens[index]!.content

  /**
   * markdown-it writes strikethrough as `<s>`. The editor's schema writes
   * `<del>`, and so did the renderer this replaced. Both tags are correct
   * Markdown, but only one of them can be the one MarkPad emits.
   */
  rules.s_open = () => '<del>'
  rules.s_close = () => '</del>'

  /**
   * A task list item.
   *
   * The checked state is an attribute the shared parser puts on the token so
   * the editor can read it. Left alone it would render as `checked="false"` on
   * the `<li>`, which is not what anybody meant, so it becomes the checkbox
   * that a reader expects and the attribute goes away.
   */
  rules.list_item_open = (tokens, index, options, env, self) => {
    const token = tokens[index]!
    const checked = token.attrGet('checked')
    if (checked === null) return self.renderToken(tokens, index, options)

    token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'checked')
    const box = `<input type="checkbox" disabled${checked === 'true' ? ' checked' : ''}> `

    return self.renderToken(tokens, index, options) + box
  }

  return markdown
}

/** Which fences are drawn by a library rather than shown as code. */
function drawnRatherThanHighlighted(info: string): BlockKind | null {
  const language = info.trim().toLowerCase()
  if (language === 'mermaid') return 'mermaid'
  if (language === 'math' || language === 'latex') return 'math'
  return null
}

/**
 * Find inline maths: `$...$` for inline, `$$...$$` for display.
 *
 * Returned as spans rather than rendered, for the same reason as above. A
 * lone dollar sign in prose, as in "it cost $5", is not maths: the opening
 * delimiter has to be followed by a non-space and the closing one preceded by
 * one.
 */
export function findInlineMath(text: string): Array<{ from: number; to: number; source: string; display: boolean }> {
  const found: Array<{ from: number; to: number; source: string; display: boolean }> = []
  const pattern = /(\$\$)([^\n]+?)\1|(\$)(?!\s)([^\n$]+?)(?<!\s)\3/g

  let result: RegExpExecArray | null
  while ((result = pattern.exec(text)) !== null) {
    const display = result[1] !== undefined
    const source = display ? result[2] : result[4]
    if (source === undefined) continue

    found.push({
      from: result.index,
      to: result.index + result[0].length,
      source,
      display,
    })
  }

  return found
}

/** Escape text for dropping into HTML. Used for error messages in popovers. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
