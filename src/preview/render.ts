import { Marked } from 'marked'

/**
 * Markdown to HTML, for the preview pane, the popovers and the export.
 *
 * One renderer shared by all three so a table cannot look different depending
 * on where you are looking at it from.
 *
 * Nothing here sanitises the output. The content is the user's own file, shown
 * back to them, and the window runs under a content security policy of
 * `default-src 'self'` which stops an inline script in a Markdown file from
 * doing anything at all. The exported HTML carries the same policy in a meta
 * tag, so a file that ends up in a browser behaves the same way.
 */

const marked = new Marked({
  gfm: true,
  breaks: false,
})

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
 * than finished HTML. Drawing either one means loading a library that is
 * larger than the rest of the app put together, so the caller decides whether
 * it is worth it and loads it on demand.
 */
export function render(markdown: string): Rendered {
  const blocks: RenderedBlock[] = []
  let counter = 0

  const withPlaceholders = markdown.replace(
    /^([ \t]*)```(mermaid|math|latex)[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm,
    (_whole, indent: string, language: string, source: string) => {
      counter += 1
      const id = `block-${counter}`
      blocks.push({
        kind: language === 'mermaid' ? 'mermaid' : 'math',
        id,
        source,
      })
      // A raw HTML block, so marked leaves it alone and the caller can find it.
      return `${indent}<div class="mp-block" data-block-id="${id}"></div>`
    },
  )

  return { html: marked.parse(withPlaceholders) as string, blocks }
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
