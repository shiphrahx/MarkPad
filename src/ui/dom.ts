/**
 * The whole of the app's "UI framework".
 *
 * Two functions. The chrome is a tab strip, a status bar, a rail and a
 * palette, and a framework would cost more in bundle size than it saves in
 * typing at that scale.
 */

type Attributes = Record<string, string | number | boolean | undefined>
type Child = Node | string | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    if (value === true) {
      node.setAttribute(name, '')
      continue
    }
    node.setAttribute(name, String(value))
  }

  append(node, children)
  return node
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
}

/** Replace an element's contents in one go. */
export function replace(parent: Element, ...children: Child[]): void {
  parent.replaceChildren()
  append(parent, children)
}

/**
 * Wrap the parts of a label that matched a search, for highlighting.
 *
 * Builds nodes rather than a string of HTML, so a command whose title
 * contained a bracket could never be misread as markup.
 */
export function highlight(label: string, positions: readonly number[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const marked = new Set(positions)
  const characters = [...label]

  let run = ''
  let runIsMatch = false

  const flush = () => {
    if (run === '') return
    fragment.appendChild(
      runIsMatch ? el('mark', {}, run) : document.createTextNode(run),
    )
    run = ''
  }

  for (let index = 0; index < characters.length; index++) {
    const isMatch = marked.has(index)
    if (isMatch !== runIsMatch) {
      flush()
      runIsMatch = isMatch
    }
    run += characters[index]
  }
  flush()

  return fragment
}
