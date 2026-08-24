import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

/**
 * What a MarkPad document can contain.
 *
 * This is the part of the WYSIWYG design that decides what survives a round
 * trip. Anything the schema cannot hold is dropped on the way in, and dropped
 * content does not come back, so the list is deliberately the whole of GFM
 * rather than a comfortable subset.
 *
 * Raw HTML is the exception. It is kept as an opaque block and written back
 * exactly as it arrived, because parsing it into real nodes and regenerating
 * it would rewrite markup somebody wrote by hand for a reason.
 */

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level}`, 0],
  },

  code_block: {
    attrs: { language: { default: '' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: (node) => [
      'pre',
      { 'data-language': node.attrs.language || null },
      ['code', 0],
    ],
  },

  /**
   * Raw HTML from the source file, kept whole.
   *
   * Not editable as rich text. Showing it as a block you can see and delete is
   * honest; silently dropping it, which is what a schema without this node
   * would do, is not.
   */
  html_block: {
    attrs: { html: { default: '' } },
    group: 'block',
    atom: true,
    selectable: true,
    toDOM: (node) => [
      'div',
      { class: 'pm-html-block', title: 'Raw HTML, kept exactly as written' },
      String(node.attrs.html),
    ],
  },

  ordered_list: {
    attrs: { start: { default: 1 } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({
          start: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) : 1,
        }),
      },
    ],
    toDOM: (node) => ['ol', node.attrs.start === 1 ? {} : { start: node.attrs.start }, 0],
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM: () => ['ul', 0],
  },

  /**
   * A list item, which may be a task.
   *
   * `checked` is null for an ordinary item and a boolean for a task, so the
   * serialiser can tell `- item` from `- [ ] item` without guessing.
   */
  list_item: {
    attrs: { checked: { default: null } },
    content: 'block+',
    defining: true,
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const box = dom.querySelector('input[type=checkbox]')
          if (!box) return { checked: null }
          return { checked: box.hasAttribute('checked') }
        },
      },
    ],
    toDOM: (node) => {
      const checked = node.attrs.checked
      if (checked === null) return ['li', 0]
      return [
        'li',
        { class: 'pm-task', 'data-checked': checked ? 'true' : 'false' },
        0,
      ]
    },
  },

  text: { group: 'inline' },

  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: '' },
      title: { default: null },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: dom.getAttribute('src'),
          alt: dom.getAttribute('alt') ?? '',
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (node) => ['img', node.attrs],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  ...tableNodes({
    tableGroup: 'block',
    cellContent: 'inline*',
    cellAttributes: {
      // GFM only has per-column alignment, which it writes into the delimiter
      // row. Kept per cell here because that is how prosemirror-tables models
      // it, and collapsed back to one alignment per column on the way out.
      alignment: {
        default: null,
        getFromDOM: (dom) => dom.style.textAlign || null,
        setDOMAttr: (value, attrs) => {
          if (value) attrs.style = `text-align: ${value}`
        },
      },
    },
  }),
}

const marks: Record<string, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },

  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ['strong', 0],
  },

  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['del', 0],
  },

  code: {
    // Nothing else applies inside code: `**text**` in a code span is literally
    // two asterisks, and letting bold in would write them back as formatting.
    excludes: '_',
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },

  link: {
    attrs: {
      href: {},
      title: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => ({
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (mark) => ['a', mark.attrs, 0],
  },
}

export const markpadSchema = new Schema({ nodes, marks })
