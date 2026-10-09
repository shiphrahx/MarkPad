# 8. The page only touches files the user gave it

Date: 2026-10-09

Status: accepted

## Context

The window renders Markdown from files people download. The Rust commands
behind it read and wrote any path the page asked for, so the content security
policy was the only thing between a rendering bug (ours, Mermaid's, KaTeX's,
DOMPurify's) and every file the user can reach.

## Decision

Rust keeps a set of paths the user gave the app, and the read and write
commands refuse anything outside it. A path gets in by being:

- picked in the open or save dialog, which moved from the page to Rust so the
  choice can't be faked
- dropped on the window, handled in Rust for the same reason
- on the command line, or handed over by macOS or a second launch
- in last time's session, which moved from localStorage to a file Rust owns,
  and which only ever saves paths that were already in the set

`src-tauri/src/access.rs` holds the set. Pictures are a separate question,
answered in 0007.

## Consequences

A script running in the page can no longer read `~/.ssh` or rewrite a shell
profile. It can still read and write the documents that are open, which is the
part that can't be helped in an editor.

The first launch after upgrading has no tabs restored, because the old session
in localStorage can't be trusted and is thrown away.

Anything new that touches the disk needs a way to say where its path came from.
The paste command is the example: it only writes beside a document already in
the set.
