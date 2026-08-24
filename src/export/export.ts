import type { Buffer } from '../app/buffer.js'
import { title as titleOf } from '../app/buffer.js'
import type { Host } from '../host/types.js'
import { drawDiagram, drawMath } from '../preview/draw.js'
import { findInlineMath, render } from '../preview/render.js'
import { buildHtmlDocument, htmlNameFor } from './html.js'

/**
 * Turning a buffer into a finished document.
 *
 * Both exports go through the same rendered HTML, so a PDF and an HTML file of
 * the same document cannot disagree with each other.
 */

/** Render to a complete HTML string, diagrams and maths drawn in place. */
export async function renderForExport(buffer: Buffer): Promise<string> {
  const { html, blocks } = render(buffer.text)

  const holder = document.createElement('div')
  holder.innerHTML = html

  for (const block of blocks) {
    const target = holder.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)
    if (!target) continue

    target.innerHTML =
      block.kind === 'mermaid'
        ? await drawDiagram(`export-${block.id}`, block.source)
        : await drawMath(block.source, { display: true, output: 'mathml' })
  }

  await drawInlineMath(holder)

  return buildHtmlDocument({
    title: titleOf(buffer).replace(/\.[^.]+$/, ''),
    bodyHtml: holder.innerHTML,
  })
}

async function drawInlineMath(root: HTMLElement): Promise<void> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const candidates: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.parentElement?.closest('code, pre')) continue
    if (node.data.includes('$')) candidates.push(node)
  }

  for (const node of candidates) {
    const found = findInlineMath(node.data)
    if (found.length === 0) continue

    const fragment = document.createDocumentFragment()
    let cursor = 0

    for (const item of found) {
      fragment.append(node.data.slice(cursor, item.from))
      const span = document.createElement('span')
      // MathML, so the exported file needs no stylesheet and no font files.
      span.innerHTML = await drawMath(item.source, {
        display: item.display,
        output: 'mathml',
      })
      fragment.append(span)
      cursor = item.to
    }

    fragment.append(node.data.slice(cursor))
    node.replaceWith(fragment)
  }
}

/** Ask where to put it, render, write it. Returns false if cancelled. */
export async function exportHtml(buffer: Buffer, host: Host): Promise<boolean> {
  const path = await host.pickPathToSave(htmlNameFor(titleOf(buffer)))
  if (path === null) return false

  const document = await renderForExport(buffer)
  await host.writeFile({
    path,
    text: document,
    // An exported file is a fresh file, so it gets the platform's own habit
    // rather than inheriting whatever the Markdown source happened to use.
    lineEnding: host.platform === 'windows' ? 'crlf' : 'lf',
    encoding: 'utf-8',
  })

  return true
}

/**
 * Export to PDF through the system print engine.
 *
 * The rules said to use the system print engine rather than bundling a PDF
 * writer, which is also the only way the output matches what the platform
 * would produce from anything else. It means the user picks "Save as PDF" in
 * the print dialog themselves; there is no way to skip that step without
 * shipping our own renderer.
 *
 * The document is printed from a hidden iframe so the app's own chrome, the
 * tab strip and the status bar, does not end up on the page.
 */
export async function exportPdf(buffer: Buffer): Promise<void> {
  const html = await renderForExport(buffer)

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  // The title in the rendered document is the file name without its
  // extension, which is what the print dialog offers as the PDF's name.
  frame.srcdoc = html

  document.body.appendChild(frame)

  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })

  const view = frame.contentWindow
  if (view) {
    view.focus()
    view.print()
  }

  // The print dialog is modal to the window, so by the time print() returns
  // the user has finished with it. Waiting a beat avoids tearing the frame
  // down underneath a spooler that is still reading from it.
  setTimeout(() => frame.remove(), 1000)
}
