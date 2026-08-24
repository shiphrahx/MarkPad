import { DOCUMENT_CSS } from '../preview/document-css.js'
import { escapeHtml } from '../preview/render.js'

/**
 * Wrap rendered Markdown into a file somebody can open, email or keep.
 *
 * Everything is inline. An exported file that depends on a stylesheet next to
 * it is not a document, it is half of one, and the half that goes missing is
 * always the other half.
 */
export interface ExportOptions {
  readonly title: string
  readonly bodyHtml: string
  /** KaTeX's stylesheet, when the document contains maths. */
  readonly extraCss?: string
}

export function buildHtmlDocument({ title, bodyHtml, extraCss }: ExportOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(title)}</title>
<style>
${DOCUMENT_CSS}
${extraCss ?? ''}
</style>
</head>
<body>
<article class="markpad-document">
${bodyHtml}
</article>
</body>
</html>
`
}

/** `notes.md` becomes `notes.html`. Anything else just gains the extension. */
export function htmlNameFor(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.html'
}

export function pdfNameFor(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.pdf'
}
