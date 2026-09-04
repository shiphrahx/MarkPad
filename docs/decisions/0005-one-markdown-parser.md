# 5. One Markdown parser

Date: 2026-09-04

Status: accepted

## Context

MarkPad read Markdown twice, with two different libraries.

The editor used markdown-it, because prosemirror-markdown is built on it and
the round trip in 0003 depends on it. The preview pane, the popovers and both
exports used marked, which had been there since before the reader existed and
was never revisited when it did.

Two parsers means two answers to "what does this file mean". A task list was
the clearest: markdown-it has no notion of them and needed a plugin, marked has
them natively, and the two produced different markup. Autolinks and a handful
of table edge cases went the same way, in whichever direction each library
happened to go.

None of that was decided. It was two libraries picked at different times for
different jobs, and the gap between them was invisible until somebody exported
a PDF and found it did not match the window.

## Decision

markdown-it, everywhere.

It is the one that cannot be replaced: prosemirror-markdown is built on it, and
the round trip is the thing 0003 spent its whole budget on. So the shared
configuration lives in `src/markdown` and both sides ask for it. What differs
between the editor and the preview is what they do with the tokens, not what
the tokens are.

marked is gone.

## What changed on the way

Strikethrough renders as `<del>` rather than `<s>`. markdown-it writes `<s>`,
but the editor's own schema writes `<del>` and so did marked, so a renderer
rule keeps the tag MarkPad already emitted everywhere else. Both are correct
Markdown. Only one of them can be ours.

Mermaid and maths fences are found by a renderer rule rather than by a regular
expression run over the text before parsing. The old approach rewrote the
Markdown into a raw HTML placeholder and let the parser pass it through, which
worked but got three things wrong that the parser gets right: a fence indented
inside a list item, a fence that was never closed, and a mermaid fence nested
inside a wider code block, which used to be drawn as a diagram rather than
shown as the code it is.

## Consequences

Raw HTML is now the only place the two sides deliberately differ, and it stays
that way. The editor keeps an HTML block whole and draws it as dim literal
text, because it cannot be edited as rich text and pretending otherwise would
rewrite markup somebody wrote by hand. The preview and the exports render it,
because those are the finished document and that is what the tag was for.
There is a test that says so, so it stays a decision rather than drifting back
into an accident.

About 40 kB comes off the main bundle, which was never the reason but is not
nothing against a 400 ms cold start.

Anything markdown-it does not support, MarkPad does not support. That was
already true of the editor, which is the surface people actually use, so this
only makes the preview honest about it.
