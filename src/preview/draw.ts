import { escapeHtml } from './render.js'

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
        theme: prefersDark() ? 'dark' : 'default',
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

function prefersDark(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function errorHtml(headline: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `<div class="mp-block-error">${escapeHtml(headline)}: ${escapeHtml(detail)}</div>`
}
