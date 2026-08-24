import { drawDiagram, drawMath, mathStyles } from '../preview/draw.js'
import { findInlineMath, render } from '../preview/render.js'
import { el } from './dom.js'

/**
 * The full preview pane.
 *
 * Exists, ships switched off. MarkPad edits Markdown source, and a permanent
 * rendered half-screen is how a source editor turns into a WYSIWYG one by
 * degrees. It is here because sometimes you do want to check a long document
 * reads properly, and the popovers do not cover that.
 *
 * Rendering is debounced and only runs while the pane is visible, so a hidden
 * pane costs nothing per keystroke.
 */
export class PreviewPane {
  readonly element = el('aside', { class: 'preview', hidden: true })

  private readonly body = el('article', { class: 'markpad-document' })
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: string | null = null
  private stylesLoaded = false
  private generation = 0

  constructor() {
    this.element.appendChild(this.body)
  }

  get isOpen(): boolean {
    return !this.element.hidden
  }

  toggle(text: string): void {
    if (this.isOpen) {
      this.element.hidden = true
      return
    }

    this.element.hidden = false
    this.update(text, { immediately: true })
  }

  update(text: string, { immediately = false } = {}): void {
    if (!this.isOpen) return

    this.pending = text
    if (this.timer !== null) clearTimeout(this.timer)

    if (immediately) {
      void this.draw()
      return
    }

    // Long enough that typing a sentence redraws once rather than per letter.
    this.timer = setTimeout(() => void this.draw(), 200)
  }

  private async draw(): Promise<void> {
    const text = this.pending
    if (text === null) return

    // Every render is numbered. A slow diagram from an older keystroke must
    // not overwrite the newer document once it finally resolves.
    const generation = ++this.generation

    const { html, blocks } = render(text)
    this.body.innerHTML = html
    await this.drawInlineMath()

    for (const block of blocks) {
      const holder = this.body.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)
      if (!holder) continue

      const drawn =
        block.kind === 'mermaid'
          ? await drawDiagram(block.id, block.source)
          : await drawMath(block.source, { display: true })

      if (generation !== this.generation) return
      holder.innerHTML = drawn
    }

    await this.loadStyles()
  }

  /**
   * Inline maths runs after the Markdown, over the rendered text nodes, so
   * `$x$` inside a code span is left alone: the renderer has already told us
   * which parts of the document are code.
   */
  private async drawInlineMath(): Promise<void> {
    const walker = document.createTreeWalker(this.body, NodeFilter.SHOW_TEXT)
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
        const span = el('span', { class: item.display ? 'mp-math-display' : 'mp-math' })
        span.innerHTML = await drawMath(item.source, { display: item.display })
        fragment.append(span)
        cursor = item.to
      }

      fragment.append(node.data.slice(cursor))
      node.replaceWith(fragment)
    }
  }

  private async loadStyles(): Promise<void> {
    if (this.stylesLoaded) return
    if (this.body.querySelector('.katex') === null) return

    const style = el('style', { 'data-katex': 'true' })
    style.textContent = await mathStyles()
    document.head.appendChild(style)
    this.stylesLoaded = true
  }
}
