/**
 * Following the links in a document.
 *
 * Outside the editor, in the preview pane and the popovers, a click on a link
 * opens it. Inside the editor a plain click puts the caret there, because
 * that is what typing into a document needs, and Ctrl+click (Cmd+click on a
 * Mac) opens it, the way every word processor does.
 *
 * Opening always goes to the host. Left to the browser, a link would navigate
 * the app's own window to the page.
 */
export function followLinks(target: Document | HTMLElement, open: (href: string) => void): () => void {
  const onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent) || event.button !== 0) return

    const anchor = (event.target as Element | null)?.closest?.('a[href]')
    if (!anchor) return

    const href = anchor.getAttribute('href') ?? ''
    // A jump within the page stays a jump within the page.
    if (href === '' || href.startsWith('#')) return

    const editable = anchor.closest('[contenteditable="true"]') !== null
    if (editable && !(event.ctrlKey || event.metaKey)) return

    event.preventDefault()
    open(href)
  }

  target.addEventListener('click', onClick, true)
  return () => target.removeEventListener('click', onClick, true)
}
