# 6. Images, and only the local ones

Date: 2026-09-04

Status: accepted

## Context

Images never worked. The schema had an image node, the parser produced them,
and nothing could load one: the asset protocol was off, so there was no way to
reach a file on disk, and the content security policy allowed `img-src 'self'`
and data URIs only.

So `![](diagram.png)` was a broken image. In a Markdown editor.

Two questions had to be answered together, because the answer to the second one
changes what the first one has to allow: how does a document reach a file on
disk, and should a document be allowed to reach the web.

## Decision

Local images load. Remote images do not.

The asset protocol is enabled and starts with nothing allowed. Opening a file
widens it to that file's own folder, and not recursively. A note shows the
picture sitting beside it and cannot reach anything the user has not opened.

An image with a scheme, which in practice means `http` and `https`, is
recognised and then left alone. It draws as a dashed box with its alt text in
it.

## Why not remote images

The budget in CLAUDE.md allows one runtime network request, and it is the
update check. A remote image is a second one.

It is also the only network request in this app that would be aimed at somebody
else's server, and it would tell them that this machine opened this file at
this time. An app that promises no telemetry should not do that by accident on
behalf of a document.

The honest version of this is a picture that visibly did not load and says why,
rather than one that silently phones home. Hence the dashed box: a broken image
icon reads as a bug, and this is a decision.

Exports are a different context and keep the remote URL. An exported HTML file
opened in a browser is a web page like any other, and its own policy already
allows `img-src https:`.

## Consequences

The path resolution is its own module with no Tauri in it, because it is the
part with the edge cases: Markdown writes paths relative to the file, both
separators turn up on Windows, a drive letter looks exactly like a URL scheme,
and a percent escape in a URL is a space in a filename. All four are tested.
Turning a resolved path into something the window can load stays behind the
host boundary.

The reader, the preview pane and the popovers all resolve through the same
function, so a picture looks the same wherever you are looking at it from.

The image node keeps the path the file wrote. Only what the browser is asked to
fetch changes, so opening a document and saving it does not rewrite every image
path into something only this machine can read. There is a test for that: it is
the failure that would be worst and quietest.

A document whose images live somewhere else entirely, in a shared assets folder
a level up, will not show them. That follows from the scope being one folder,
and widening it is a decision for when somebody actually wants it rather than
now.

`protocol-asset` is a Tauri feature, so the binary grows a little. It stays
inside the 8 MB installer budget, which CI checks.
