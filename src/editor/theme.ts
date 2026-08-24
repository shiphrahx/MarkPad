import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Every colour here is a CSS variable defined in app.css, so light and dark
 * come from prefers-color-scheme and CodeMirror never has to be told which
 * theme it is in.
 */
export const markpadTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--sheet)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--size-doc)',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'var(--line-doc)',
    padding: '26px 0',
  },
  '.cm-content': {
    caretColor: 'var(--ink)',
    maxWidth: '100ch',
    margin: '0 auto',
    padding: '0 40px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--ink)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--ink) 4%, transparent)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: '1px solid var(--rule)',
    borderRadius: '3px',
    color: 'var(--muted)',
    padding: '0 4px',
  },
})

/**
 * Markdown source, highlighted as source. Headings get weight and colour but
 * not a larger size: growing the line height as you type a hash is the kind of
 * reflow that belongs in a WYSIWYG editor, which this is not.
 */
export const markpadHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading, color: 'var(--ink)', fontWeight: '600' },
    { tag: tags.strong, fontWeight: '600' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
    { tag: tags.url, color: 'var(--accent)' },
    { tag: tags.monospace, color: 'var(--accent)' },
    { tag: tags.quote, color: 'var(--muted)', fontStyle: 'italic' },
    { tag: tags.list, color: 'var(--accent)' },
    { tag: tags.meta, color: 'var(--muted)' },
    { tag: tags.processingInstruction, color: 'var(--muted)' },
    { tag: tags.contentSeparator, color: 'var(--muted)' },
    { tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
    { tag: tags.keyword, color: 'var(--accent)' },
    { tag: tags.string, color: 'var(--accent)' },
  ]),
)
