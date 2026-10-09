import { escapeHtml, render } from '../preview/render.js'

/**
 * Copying the document as formatted text, for pasting into an email, Word or
 * Google Docs, where Markdown would arrive as a page of asterisks.
 *
 * The clipboard gets both: HTML for anything that takes formatting, and the
 * Markdown itself as plain text for anything that does not.
 */

/**
 * The document as HTML fit for a clipboard.
 *
 * Diagrams and display maths are drawn by libraries that load asynchronously,
 * and a copy has to happen inside the keypress or click that asked for it. So
 * they go across as their source in a code block, which pastes as something
 * readable rather than as nothing.
 */
export function clipboardHtml(markdown: string): string {
  const { html, blocks } = render(markdown)

  return blocks.reduce(
    (out, block) =>
      out.replace(
        `<div class="mp-block" data-block-id="${block.id}"></div>`,
        `<pre><code>${escapeHtml(block.source)}</code></pre>`,
      ),
    html,
  )
}

/**
 * Put HTML and plain text on the clipboard together.
 *
 * Done through a copy event rather than the async clipboard API, which
 * WebKitGTK only half supports. Returns false if the copy did not happen.
 */
export function copyRich(html: string, text: string, doc: Document = document): boolean {
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault()
    event.clipboardData?.setData('text/html', html)
    event.clipboardData?.setData('text/plain', text)
  }

  doc.addEventListener('copy', onCopy, { once: true })
  try {
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    doc.removeEventListener('copy', onCopy)
  }
}
