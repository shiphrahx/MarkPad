# 1. Tauri and CodeMirror, no UI framework

Date: 2026-08-24

Status: accepted

## Context

MarkPad has to run on Windows and macOS, start in under 400 ms, and fit in an
installer under 8 MB. MarkEdit gets its size and speed by being a thin Swift
shell around a WebView. That trick only works on macOS.

## Decision

Tauri v2 for the shell. It uses the WebView the operating system already has:
WebView2 on Windows, WKWebView on macOS. Nothing is bundled, which is the only
way the installer budget is reachable.

CodeMirror 6 for the editor. It is the only browser editor that handles a 5 MB
document without the typing latency falling apart, because it renders the
viewport rather than the document.

No UI framework. The chrome is a tab strip, a status bar, an outline rail and a
command palette. A framework would cost more than it saves at that size, and
every kilobyte comes out of the same budget.

## Consequences

The Rust side is small and mostly does file I/O, which is exactly where the
cross-platform work lives anyway.

We inherit two rendering engines instead of one, so anything visual needs
checking on both. Sharper than Electron's problem of shipping a third.

WebView2 is missing on some Windows installs. The app has to detect that and
offer the bootstrapper rather than opening a blank window.

If CodeMirror ever stops meeting the typing budget on a large file, that is a
rewrite of the editor core, not a tweak. Worth knowing now.
