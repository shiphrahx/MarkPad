import { keymap } from 'prosemirror-keymap'
import {
  baseKeymap,
  chainCommands,
  exitCode,
  setBlockType,
  toggleMark,
} from 'prosemirror-commands'
import type { Command } from 'prosemirror-state'
import { redo, undo } from 'prosemirror-history'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import { undoInputRule } from 'prosemirror-inputrules'
import { goToNextCell } from 'prosemirror-tables'
import type { Platform } from '../host/types.js'
import { markpadSchema } from './schema.js'

/**
 * Keys for the rendered surface.
 *
 * Mod is Command on macOS and Ctrl on Windows, same rule as everywhere else in
 * the app. Mod+K is deliberately absent: that belongs to the command palette,
 * and a link shortcut is not worth taking it.
 */
export function markpadKeymap(platform: Platform) {
  const schema = markpadSchema
  const mod = platform === 'macos' ? 'Meta' : 'Ctrl'

  const bindings: Record<string, Command> = {
    [`${mod}-z`]: undo,
    [`${mod}-y`]: redo,
    [`Shift-${mod}-z`]: redo,

    [`${mod}-b`]: toggleMark(schema.marks.strong!),
    [`${mod}-i`]: toggleMark(schema.marks.em!),
    [`Shift-${mod}-x`]: toggleMark(schema.marks.strikethrough!),
    [`${mod}-e`]: toggleMark(schema.marks.code!),

    // Backspace undoes an input rule before it does anything else, so typing
    // "## " and immediately regretting it gives back the hashes rather than
    // eating a character of the heading.
    Backspace: chainCommands(undoInputRule, baseKeymap.Backspace!),

    Enter: chainCommands(splitListItem(schema.nodes.list_item!), baseKeymap.Enter!),
    Tab: chainCommands(goToNextCell(1), sinkListItem(schema.nodes.list_item!)),
    'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(schema.nodes.list_item!)),

    [`Shift-${mod}-0`]: setBlockType(schema.nodes.paragraph!),

    // Ctrl+Enter breaks out of a code block or a quote, which is otherwise a
    // one-way door: everything you type stays inside it.
    [`${mod}-Enter`]: exitCode,
  }

  for (const level of [1, 2, 3, 4, 5, 6]) {
    bindings[`Shift-${mod}-${level}`] = setBlockType(schema.nodes.heading!, { level })
  }

  return [keymap(bindings), keymap(baseKeymap)]
}
