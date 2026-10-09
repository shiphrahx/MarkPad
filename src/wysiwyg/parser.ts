import { MarkdownParser } from 'prosemirror-markdown'
import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import type { Node as ProseNode } from 'prosemirror-model'
import { createMarkdown, HTML_BLOCK_TOKEN } from '../markdown/markdown.js'
import { markpadSchema } from './schema.js'

/**
 * Markdown into a document.
 *
 * The parser itself lives in ../markdown, because the preview and the exports
 * have to read a file exactly the same way this does. All that belongs here is
 * the mapping from its tokens onto the schema.
 */
const markdownIt = createMarkdown()

/**
 * The tokens from the most recent parse.
 *
 * prosemirror-markdown tokenises and builds the document in one call and
 * throws the tokens away. They know which lines of the file each block came
 * from, which is what writing untouched blocks back exactly needs, so the
 * tokenizer it is handed keeps hold of them. Tokenising twice would cost the
 * same again on a 10 MB file.
 */
let lastTokens: Token[] = []

const tokenizer = {
  parse(text: string, env: object): Token[] {
    lastTokens = markdownIt.parse(text, env)
    return lastTokens
  },
} as unknown as MarkdownIt

/** A document and the tokens it was built from. */
export function parseWithTokens(markdown: string): { doc: ProseNode; tokens: Token[] } {
  const doc = markdownParser.parse(markdown)
  return { doc, tokens: lastTokens }
}

export const markdownParser = new MarkdownParser(markpadSchema, tokenizer, {
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
  [HTML_BLOCK_TOKEN]: {
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
