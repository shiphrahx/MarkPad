import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

/**
 * What a Markdown file means. One answer, for the whole app.
 *
 * There used to be two. The editor read files with markdown-it, because
 * prosemirror-markdown is built on it and the round trip depends on it, and the
 * preview pane and the exports read them with marked. Two parsers with two sets
 * of rules, so the same file could render one way in the window and another way
 * in the PDF, and nobody would find out until they printed something.
 *
 * The clearest case was a task list, but autolinks and a handful of table edge
 * cases went the same way. None of it was a decision. It was two libraries
 * chosen at different times for different jobs.
 *
 * So: one configuration, here, and everything that needs to understand Markdown
 * asks for it. What differs between the editor and the preview is what they do
 * with the tokens, not what the tokens are.
 *
 * `html: false` matters and is not a security setting. With it on, markdown-it
 * emits raw HTML tokens that the editor's schema would silently drop, and
 * dropped content does not come back. `keepHtmlBlocks` below turns the case we
 * care about into a token both sides can hold.
 */
export function createMarkdown(): MarkdownIt {
  return MarkdownIt('commonmark', { html: false })
    .enable(['table', 'strikethrough', 'linkify'])
    .use(taskLists)
    .use(keepHtmlBlocks)
}

/** The token a kept HTML block arrives as. Named once, used on both sides. */
export const HTML_BLOCK_TOKEN = 'html_block_kept'

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
 * and turns it into a block of its own, so it is written out untouched.
 *
 * The editor draws it as dim literal text, because it cannot be edited as rich
 * text and pretending otherwise would rewrite markup somebody wrote by hand.
 * The preview and the exports render it, because those are the finished
 * document and that is what the tag was for.
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

      const replacement = new state.Token(HTML_BLOCK_TOKEN, '', 0)
      replacement.content = inline.content
      replacement.block = true

      tokens.splice(index, 3, replacement)
    }

    return true
  })
}
