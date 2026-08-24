import { hoverTooltip, type Tooltip } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { drawDiagram, drawMath } from './draw.js'
import { findInlineMath, render } from './render.js'

/**
 * Popover previews.
 *
 * Hover a table, a maths expression or a mermaid block and see what it will
 * look like, without leaving the source. This is the compromise that lets the
 * full preview pane stay switched off by default: the two or three things you
 * genuinely cannot read in source form are available where they are, and the
 * rest of the document stays text.
 */

interface Target {
  readonly kind: 'table' | 'math' | 'mermaid'
  readonly from: number
  readonly to: number
  readonly source: string
  readonly display: boolean
}

export function previewPopovers() {
  return hoverTooltip(
    (view, position): Tooltip | null => {
      const target = targetAt(view.state, position)
      if (!target) return null

      return {
        pos: target.from,
        end: target.to,
        above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'popover markpad-document'
          dom.textContent = '…'

          void fill(dom, target)

          return { dom }
        },
      }
    },
    { hoverTime: 300 },
  )
}

async function fill(dom: HTMLElement, target: Target): Promise<void> {
  const html = await htmlFor(target)

  // The tooltip may already be gone by the time a library finished loading.
  if (!dom.isConnected) return

  dom.innerHTML = html
}

async function htmlFor(target: Target): Promise<string> {
  switch (target.kind) {
    case 'table':
      return render(target.source).html
    case 'math':
      return drawMath(target.source, { display: target.display })
    case 'mermaid':
      return drawDiagram(`popover-${target.from}`, target.source)
  }
}

/** What, if anything, is worth previewing at this position. */
export function targetAt(state: EditorState, position: number): Target | null {
  const tree = syntaxTree(state)
  let node = tree.resolveInner(position, 0)

  while (node.parent) {
    if (node.name === 'Table') {
      return {
        kind: 'table',
        from: node.from,
        to: node.to,
        source: state.doc.sliceString(node.from, node.to),
        display: false,
      }
    }

    if (node.name === 'FencedCode') {
      const text = state.doc.sliceString(node.from, node.to)
      const language = /^\s*(?:`{3,}|~{3,})\s*([A-Za-z]+)/.exec(text)?.[1]?.toLowerCase()
      const body = stripFence(text)

      if (language === 'mermaid') {
        return { kind: 'mermaid', from: node.from, to: node.to, source: body, display: false }
      }
      if (language === 'math' || language === 'latex') {
        return { kind: 'math', from: node.from, to: node.to, source: body, display: true }
      }
      return null
    }

    node = node.parent
  }

  return inlineMathAt(state, position)
}

function inlineMathAt(state: EditorState, position: number): Target | null {
  const line = state.doc.lineAt(position)
  const offset = position - line.from

  for (const found of findInlineMath(line.text)) {
    if (offset >= found.from && offset <= found.to) {
      return {
        kind: 'math',
        from: line.from + found.from,
        to: line.from + found.to,
        source: found.source,
        display: found.display,
      }
    }
  }

  return null
}

function stripFence(text: string): string {
  const lines = text.split('\n')
  return lines
    .slice(1, lines[lines.length - 1]?.trim().match(/^(`{3,}|~{3,})$/) ? -1 : undefined)
    .join('\n')
}
