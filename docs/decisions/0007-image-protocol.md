# 7. Images by kind of file, not by folder

Date: 2026-10-09

Status: accepted. Replaces the folder scope in 0006; the rest of 0006 stands.

## Context

0006 let the window read pictures out of the folder an open file lives in, not
recursively. Two things went wrong with that.

`![](images/chart.png)` never loaded. A subfolder of pictures beside the note is
the most common layout there is, and the scope didn't reach it. Neither did a
shared `../assets` folder, which 0006 called out and left for later.

And the obvious fix, a recursive scope, would let the page read every file
under wherever a note was opened. Open `~/notes.md` and that's the whole home
folder, SSH keys included. Only images ever needed reading.

## Decision

A small custom protocol, `markpad-image`, replaces Tauri's asset protocol. It
takes an absolute path and serves it if, and only if, the real file behind it
is an image: png, jpeg, gif, webp, avif, bmp, ico or svg, under 64 MB. Anything
else is refused, wherever it is.

So the question is "is this a picture" rather than "is this in an allowed
folder". A document can show you a picture from anywhere on your disk. It can't
read anything that isn't one, whatever it puts in a `src`.

## Consequences

Subfolders and `../` work, with no scope to widen per file and nothing to
revoke when a tab closes.

A document you open can show you any image you already have. That's a change
from 0006. It's still only shown to you, in your window, with no network
request, so it tells nobody anything.

Symlinks are judged by what they point at, so `innocent.png` linking to a text
file is refused.

`protocol-asset` is gone from the Tauri features, so the binary loses a little
rather than gaining it.
