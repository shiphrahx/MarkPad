# 3. MarkPad renders by default

Date: 2026-08-24

Status: accepted

Reverses: the WYSIWYG non-goal in `CLAUDE.md`

## Context

MarkPad was specified as a source editor: Markdown source with syntax
highlighting, never a rendered surface. That was listed under non-goals, in the
section that says to reject these even when they look like an easy win.

Cassia asked for the opposite: a file should open rendered, be editable in
that state, and have its Markdown generated underneath. She was shown what the
round trip costs and chose it anyway.

## Decision

Files open in a rendered editing surface. ProseMirror holds the document,
`prosemirror-markdown` parses the file into it and serialises it back out. The
Markdown text in the workspace stays the thing that gets saved, so line
endings, encoding, atomic writes, export and the status bar all keep working
unchanged.

Source view stays, on a command. It is the only way to see what is actually in
the file, and an app that generates Markdown you cannot inspect is worse than
one that does not generate it at all.

## Consequences

The round trip is lossy, in the way every Markdown serialiser is lossy. A file
written with `-` bullets comes back with `*`. `_emphasis_` comes back as
`*emphasis*`. Table cells get padded to an even width. Hard-wrapped paragraphs
get rejoined into one long line. None of that changes what the document means,
and all of it shows up in a diff on lines nobody edited.

That matters most for files under version control, which is most of the files
this app was built for. It is the reason the original non-goal existed.

Two things reduce it, and both are worth doing:

- Serialise only what changed where that is possible, so an untouched
  paragraph keeps its original bytes.
- Match the serialiser's choices to the conventions the file already uses,
  rather than to a fixed house style.

Neither is done yet. Until they are, opening a file and saving it without
typing anything can still rewrite it, and that should be treated as a bug
rather than as the cost of doing business.

Anything the schema does not know about gets dropped on the way through, which
is worse than reformatting because the content does not come back. The parser
is restricted to the GFM subset the app supports, and raw HTML in a Markdown
file is preserved as a literal block rather than being parsed and re-emitted.
