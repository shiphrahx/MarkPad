import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules'
import type { MarkType } from 'prosemirror-model'
import { markpadSchema } from './schema.js'

/**
 * Typing Markdown still works.
 *
 * The whole objection to a rendered editor is losing the muscle memory: you
 * type `## ` and nothing happens, so you go hunting in a menu. These rules
 * mean the shorthand still does what it always did. It turns into formatting
 * as you type rather than staying as characters.
 *
 * Deliberately no smart quotes and no em dash substitution. Those change the
 * characters in the file, and an editor that quietly rewrites an apostrophe
 * you typed is doing something other than formatting.
 */
export function markpadInputRules() {
  const schema = markpadSchema

  return inputRules({
    rules: [
      // > quote
      wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote!),

      // - item, * item, + item
      wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list!),

      // 1. item
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list!,
        (match) => ({ start: Number(match[1]) }),
        (match, node) => node.childCount + node.attrs.start === Number(match[1]),
      ),

      // # heading, up to six
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading!, (match) => ({
        level: match[1]!.length,
      })),

      // ``` or ```language
      textblockTypeInputRule(
        /^```([a-zA-Z0-9+#-]*)\s$/,
        schema.nodes.code_block!,
        (match) => ({ language: match[1] ?? '' }),
      ),

      // --- on its own
      new InputRule(/^(?:---|___|\*\*\*)$/, (state, _match, start, end) =>
        state.tr.replaceRangeWith(start, end, schema.nodes.horizontal_rule!.create()),
      ),

      // - [ ] task
      new InputRule(/^\s*[-+*]\s\[([ xX])\]\s$/, (state, match, start, end) => {
        const item = schema.nodes.list_item!.create(
          { checked: match[1] !== ' ' },
          schema.nodes.paragraph!.create(),
        )
        return state.tr.replaceRangeWith(start, end, schema.nodes.bullet_list!.create(null, item))
      }),

      // The lookbehinds keep the single-asterisk rule from firing on the first
      // half of a `**bold**` pair, so match[0] always starts at the delimiter
      // and the arithmetic below stays simple.
      markRule(/\*\*([^*]+)\*\*$/, schema.marks.strong!),
      markRule(/(?<!\*)\*(?!\*)([^*]+)\*$/, schema.marks.em!),
      markRule(/(?<!_)__([^_]+)__$/, schema.marks.strong!),
      markRule(/~~([^~]+)~~$/, schema.marks.strikethrough!),
      markRule(/`([^`]+)`$/, schema.marks.code!),
    ],
  })
}

/**
 * Turn `**text**` into bold text as the closing delimiter is typed.
 *
 * The delimiters disappear, which is the point: they were the instruction, not
 * the content. The mark is taken off the stored set afterwards so whatever you
 * type next is not also bold.
 */
function markRule(pattern: RegExp, markType: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const full = match[0]!
    const captured = match[1]
    if (captured === undefined || captured.trim() === '') return null

    const openLength = full.indexOf(captured)
    const closeLength = full.length - openLength - captured.length

    const transaction = state.tr
      // Later positions first, so the earlier delete is still in range.
      .delete(end - closeLength, end)
      .delete(start, start + openLength)

    const from = start
    const to = start + captured.length

    return transaction.addMark(from, to, markType.create()).removeStoredMark(markType)
  })
}
