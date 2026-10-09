import { escapeHtml, findInlineMath } from './render.js'
import { isDark } from '../ui/theme.js'

/**
 * Drawing the two things Markdown cannot draw on its own: maths and diagrams.
 *
 * Both libraries are larger than the whole of the rest of the app, so both are
 * loaded with a dynamic import the first time something needs them. A document
 * with no maths in it never pays for KaTeX, and the cold start budget is 400
 * ms, which neither library would leave room inside.
 */

export type MathOutput = 'htmlAndMathml' | 'mathml'

let katexPromise: Promise<typeof import('katex')> | null = null
let mermaidPromise: Promise<typeof import('mermaid')> | null = null

async function katex() {
  katexPromise ??= import('katex')
  return (await katexPromise).default
}

async function mermaid() {
  mermaidPromise ??= import('mermaid')
  return (await mermaidPromise).default
}

/**
 * Render LaTeX.
 *
 * `mathml` is for export: MathML needs no stylesheet and no font files, so an
 * exported document keeps its equations wherever it ends up. In the app itself
 * the HTML output looks better and the fonts are right there in the bundle.
 */
export async function drawMath(
  source: string,
  { display = false, output = 'htmlAndMathml' as MathOutput } = {},
): Promise<string> {
  try {
    const renderer = await katex()
    return renderer.renderToString(source, {
      displayMode: display,
      output,
      // Show the offending macro in place rather than throwing away the whole
      // block, which is how you find the typo.
      throwOnError: false,
      strict: false,
    })
  } catch (error) {
    return errorHtml('This maths could not be rendered', error)
  }
}

/**
 * Draw every `$...$` and `$$...$$` in the text of a rendered fragment.
 *
 * Runs after the Markdown, over the rendered text nodes, so `$x$` inside a code
 * span is left alone: the renderer has already said which parts are code. The
 * preview pane and the export both need this, and used to carry a copy each.
 *
 * Every equation is drawn at once and the text swapped in afterwards. KaTeX is
 * synchronous once loaded, but awaiting one at a time still meant one trip
 * through the microtask queue per equation.
 */
export async function drawInlineMathIn(
  root: HTMLElement,
  { output = 'htmlAndMathml' as MathOutput } = {},
): Promise<void> {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const candidates: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.parentElement?.closest('code, pre')) continue
    if (node.data.includes('$')) candidates.push(node)
  }

  await Promise.all(
    candidates.map(async (node) => {
      const found = findInlineMath(node.data)
      if (found.length === 0) return

      const drawn = await Promise.all(
        found.map((item) => drawMath(item.source, { display: item.display, output })),
      )

      const fragment = root.ownerDocument.createDocumentFragment()
      let cursor = 0

      found.forEach((item, index) => {
        fragment.append(node.data.slice(cursor, item.from))
        const span = root.ownerDocument.createElement('span')
        span.className = item.display ? 'mp-math-display' : 'mp-math'
        span.innerHTML = drawn[index]!
        fragment.append(span)
        cursor = item.to
      })

      fragment.append(node.data.slice(cursor))
      node.replaceWith(fragment)
    }),
  )
}

/** The stylesheet KaTeX's HTML output needs, for the preview pane. */
export async function mathStyles(): Promise<string> {
  const { default: css } = await import('katex/dist/katex.min.css?inline')
  return css
}

let mermaidReady = false

export async function drawDiagram(id: string, source: string): Promise<string> {
  try {
    const renderer = await mermaid()

    if (!mermaidReady) {
      renderer.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: isDark() ? 'dark' : 'default',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      })
      mermaidReady = true
    }

    const { svg } = await renderer.render(`mermaid-${id}`, source)
    return svg
  } catch (error) {
    return errorHtml('This diagram could not be drawn', error)
  }
}

/**
 * Mermaid caches its theme at initialise time, so a diagram drawn before the
 * OS switched to dark stays light. Called when the colour scheme changes.
 */
export function resetDiagramTheme(): void {
  mermaidReady = false
}

function errorHtml(headline: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `<div class="mp-block-error">${escapeHtml(headline)}: ${escapeHtml(detail)}</div>`
}
