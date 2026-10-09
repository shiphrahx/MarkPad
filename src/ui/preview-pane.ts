import { drawDiagram, drawInlineMathIn, drawMath, mathStyles } from '../preview/draw.js'
import { render } from '../preview/render.js'
import { resolveImagesIn } from '../app/images.js'
import { el } from './dom.js'

/**
 * The full preview pane.
 *
 * Exists, ships switched off. Reader mode already shows the document rendered,
 * so this is for source view: checking a long document reads properly while
 * you edit the Markdown itself, which the popovers do not cover.
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

  /**
   * @param imageUrl turns a Markdown image source into something the window
   *   can load, or null when there is nothing to load. Given rather than
   *   worked out here, because the answer depends on where the open file is.
   */
  constructor(private readonly imageUrl: (src: string) => string | null) {
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
    resolveImagesIn(this.body, this.imageUrl)
    await drawInlineMathIn(this.body)

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

  private async loadStyles(): Promise<void> {
    if (this.stylesLoaded) return
    if (this.body.querySelector('.katex') === null) return

    const style = el('style', { 'data-katex': 'true' })
    style.textContent = await mathStyles()
    document.head.appendChild(style)
    this.stylesLoaded = true
  }
}
