# 9. Untouched blocks go back exactly as they were

Date: 2026-10-09

Status: accepted. Narrows the cost described in 0003.

## Context

0003 accepted that reader mode's round trip is lossy: saving re-serialised the
whole document, so `*` bullets, `__bold__` and hand-padded tables came back in
the serialiser's style on every line, edited or not. A one-word fix was a
whole-file diff.

It was also slow. Serialising a 1 MB document whole takes about 11 seconds,
and reader mode did that every time typing paused.

## Decision

When a file opens, remember each top-level block's original text, using the
line numbers markdown-it already puts on its tokens. ProseMirror never rebuilds
a node it didn't change, so on save any top-level node that's the same object
as one from the open is written back as its original text. Only blocks that
were edited, added or moved go through the serialiser. Text between blocks,
including reference link definitions, is kept too.

`src/wysiwyg/source-memory.ts`. The memory rides inside the editor state, so it
survives switching tabs.

## Consequences

An unchanged file saves byte for byte. An edited one changes only the blocks
that were edited. Saving a 1 MB file takes milliseconds rather than seconds.

The loss 0003 describes still happens inside an edited block.

Two lists of the same kind next to each other, one edited, can merge on save,
because the serialiser uses `-` for every bullet list. The whole-document
serialiser had the same problem, so this isn't new, but it's worth fixing in
the serialiser one day.

Anything that rebuilds top-level nodes it didn't change, such as a plugin that
recreates the document, quietly brings the old behaviour back.
