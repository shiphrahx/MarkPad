import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import { MarkdownParser } from 'prosemirror-markdown'
import { markpadSchema } from './schema.js'

/**
 * Markdown into a document.
 *
 * `html: false` matters: with it on, markdown-it emits raw HTML tokens that
 * the schema would silently drop, and dropped content does not come back.
 * Instead the task-list and html-block plugins below turn the two cases we
 * care about into nodes the schema can hold.
 */
const markdownIt = MarkdownIt('commonmark', { html: false })
  .enable(['table', 'strikethrough', 'linkify'])
  .use(taskLists)
  .use(keepHtmlBlocks)

/**
 * GFM task lists.
 *
 * markdown-it has no notion of them, so this reads the `[ ]` or `[x]` off the
 * front of a list item, records it on the item token and removes it from the
 * text. Without this the brackets survive as literal characters and the item
 * comes back as `- [ ] [ ] thing` after a round trip.
 */
function taskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', (state: StateCore) => {
    const tokens = state.tokens

    for (let index = 0; index < tokens.length; index++) {
      const open = tokens[index]
      if (open?.type !== 'list_item_open') continue

      // paragraph_open, inline, so the text is two tokens along.
      const inline = tokens[index + 2]
      if (inline?.type !== 'inline') continue

      const match = /^\[([ xX])\][ \t]+/.exec(inline.content)
      if (!match) continue

      open.attrSet('checked', match[1] === ' ' ? 'false' : 'true')

      inline.content = inline.content.slice(match[0].length)
      const first = inline.children?.[0]
      if (first?.type === 'text') first.content = first.content.slice(match[0].length)
    }

    return true
  })
}

/**
 * Raw HTML, kept rather than dropped.
 *
 * With `html: false` markdown-it leaves HTML as ordinary paragraph text, which
 * would come back escaped. This spots a paragraph that is nothing but a tag
 * and turns it into an html_block, so it is written out untouched.
 */
function keepHtmlBlocks(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'keep_html_blocks', (state: StateCore) => {
    const tokens = state.tokens

    for (let index = 0; index < tokens.length - 2; index++) {
      const open = tokens[index]
      const inline = tokens[index + 1]
      const close = tokens[index + 2]

      if (open?.type !== 'paragraph_open') continue
      if (inline?.type !== 'inline' || close?.type !== 'paragraph_close') continue
      if (!/^<[a-zA-Z!/][\s\S]*>$/.test(inline.content.trim())) continue

      const replacement = new state.Token('html_block_kept', '', 0)
      replacement.content = inline.content
      replacement.block = true

      tokens.splice(index, 3, replacement)
    }

    return true
  })
}

export const markdownParser = new MarkdownParser(markpadSchema, markdownIt, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: {
    block: 'list_item',
    getAttrs: (token) => {
      const checked = token.attrGet('checked')
      return { checked: checked === null ? null : checked === 'true' }
    },
  },
  bullet_list: { block: 'bullet_list' },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (token) => ({ start: Number(token.attrGet('start') ?? 1) }),
  },
  heading: {
    block: 'heading',
    getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }),
  },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: {
    block: 'code_block',
    getAttrs: (token) => ({ language: token.info.trim() }),
    noCloseToken: true,
  },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (token) => ({
      src: token.attrGet('src'),
      title: token.attrGet('title'),
      alt: token.children?.[0]?.content ?? '',
    }),
  },
  hardbreak: { node: 'hard_break' },
  html_block_kept: {
    node: 'html_block',
    getAttrs: (token) => ({ html: token.content }),
  },

  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: {
    block: 'table_header',
    getAttrs: (token) => ({ alignment: alignmentOf(token.attrGet('style')) }),
  },
  td: {
    block: 'table_cell',
    getAttrs: (token) => ({ alignment: alignmentOf(token.attrGet('style')) }),
  },

  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strikethrough' },
  code_inline: { mark: 'code', noCloseToken: true },
  link: {
    mark: 'link',
    getAttrs: (token) => ({
      href: token.attrGet('href'),
      title: token.attrGet('title') ?? null,
    }),
  },
})

function alignmentOf(style: string | null): string | null {
  if (!style) return null
  const match = /text-align:\s*(left|center|right)/.exec(style)
  return match?.[1] ?? null
}
