import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import {
  bracketMatching,
  codeFolding,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { markpadHighlighting, markpadTheme } from './theme.js'

/**
 * The editor's extensions, assembled by hand rather than pulled in through the
 * `codemirror` meta package. Half of that package is things this app has said
 * it will not have, and the installer budget is 8 MB.
 *
 * `markdownLanguage` is the GFM dialect: tables, task lists, strikethrough,
 * autolinks.
 */
export function markpadExtensions(): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    codeFolding(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage }),
    markpadTheme,
    markpadHighlighting,
    EditorView.lineWrapping,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...markdownKeymap,
      indentWithTab,
    ]),
  ]
}
