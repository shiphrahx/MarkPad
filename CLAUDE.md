# MarkPad

A Markdown editor for Windows, macOS and Linux. Like MarkEdit, but cross-platform.

Plain text in, plain text out. No vault, no database, no account, no sync, no telemetry.
Files created in MarkPad are ordinary `.md` files. Delete the app and nothing breaks.

## Repositories

- **This project:** https://github.com/shiphrahx/MarkPad
- **Reference implementation (macOS only, MIT):** https://github.com/MarkEdit-app/MarkEdit
  - Philosophy: https://github.com/MarkEdit-app/MarkEdit/wiki/Why-MarkEdit
  - Extension API worth mirroring: https://github.com/MarkEdit-app/MarkEdit-api

Read MarkEdit for its editor decisions and its restraint. Do not copy its Swift code —
it is macOS-native and MIT licensed; if any of it is ever adapted, attribute it.

## Non-goals — do not build these

Reject these even if they seem like an easy win. Ask before adding anything not listed under Scope.

- Note-taking, backlinks, tags, graph view, "second brain" features
- Any proprietary Markdown syntax beyond GFM
- Accounts, cloud sync, analytics, crash reporting, update pings that carry an ID
- A file tree / workspace sidebar (a single-folder mode may come later, behind a flag)
- Electron, or any runtime the user has to install separately

## The editing surface

MarkPad opens a file in **reader mode**: a rendered surface you type directly
into. The Markdown source is generated from what you edit and written on save.
Source view still exists, one command away, for when you need to see the file
as it really is.

This reverses the original non-goal, which said MarkPad would edit Markdown
source and never render it. `docs/decisions/0003-wysiwyg.md` records why, and
what it costs.

The cost is real and worth repeating here: the round trip is lossy in the ways
every Markdown serialiser is lossy. Marker characters, emphasis delimiters,
table padding and line wrapping come back in the serialiser's preferred form,
including on lines nobody touched. Anything that reduces that is worth doing.

## Stack

- **Shell:** Tauri v2 (Rust). WebView2 on Windows, WKWebView on macOS, WebKitGTK on
  Linux. No bundled Chromium.
- **Editor:** CodeMirror 6 + TypeScript. `@codemirror/lang-markdown` with GFM extensions.
- **Build:** Vite, pnpm.
- **Tests:** Vitest for editor logic, `cargo test` for the Rust side.

Do not add a UI framework. The chrome is a few hundred lines of hand-written TS and CSS.
Every new dependency needs a one-line justification in the PR description.

## Hard budgets

These are pass/fail, checked in CI:

| Budget | Limit |
|---|---|
| Installer size, per platform | < 8 MB |
| Cold start to first keystroke | < 400 ms |
| Open a 10 MB `.md` file | < 1 s, no dropped frames while scrolling |
| Typing latency in a 5 MB file | indistinguishable from an empty file |
| Runtime network requests | one, the opt-out update check |

If a change breaks a budget, the change is wrong — not the budget.

## Scope for v0.1

1. Open, edit, save `.md` files. Multiple tabs. Drag-and-drop to open.
2. GFM syntax highlighting, code folding, multi-caret editing.
3. Command palette (`Ctrl/⌘K`) — every command lives here first, menus second.
4. Outline spine: a narrow left rail of heading ticks. No sidebar.
5. Popover previews for tables, LaTeX and Mermaid. Full preview pane exists but ships off.
6. Export to HTML and PDF via the system print engine.
7. Status bar: word count, `Ln/Col`, encoding, line endings, file size.
8. Light and dark themes that follow the OS.

## Cross-platform rules

MarkEdit could assume macOS. We cannot. Get these right or the app feels foreign:

- **Line endings.** Detect on open, preserve on save. Never silently rewrite CRLF to LF.
  Surface the current setting in the status bar and let the user change it per file.
- **Encoding.** Detect UTF-8 and UTF-8 BOM. Preserve the BOM if it was there.
- **Saving.** Atomic write via temp file + rename. Handle Windows file locking and
  antivirus scan delays — retry, then report a real error, never lose the buffer.
- **Window chrome.** Traffic lights on macOS, caption buttons on Windows. Native positions,
  native hit targets, native maximise/snap behaviour. No custom chrome that fakes either.
  On Linux the decorations belong to the window manager and we do not touch them at all.
- **Keybindings.** Per-platform defaults. `Cmd` on macOS maps to `Ctrl` on Windows and
  Linux, except where those two have their own convention (`F2`, `Ctrl+Shift+P`-adjacent
  habits). Linux follows the Windows habits rather than getting a third set.
- **Fonts.** Ship a fallback stack; do not assume SF Mono or Cascadia Code exists.
- **WebView2.** Some Windows installs lack it. Detect at launch and offer the bootstrapper
  with a clear message. Do not crash into a blank window.
- **Packaging.** `.deb` and `.rpm` on Linux, never AppImage: it bundles WebKitGTK and blows
  the installer budget ten times over. `docs/decisions/0004-shipping-on-linux.md` has the
  working.

## Voice for anything the user reads

- Sentence case. Plain verbs. No exclamation marks.
- Buttons say what happens: "Save changes", not "Submit". The name stays the same
  through the whole flow — a "Publish" button produces a "Published" toast.
- Errors say what went wrong and what to do next. They do not apologise and are never vague.
- Name things the way a writer would, not the way the code does.

## Working agreements

- Read `docs/decisions/` before proposing an architecture change; add an entry when you make one.
- Keep the editor core (TypeScript) free of Tauri APIs. All host access goes through one
  `src/host/` boundary so the editor stays testable in Node.
- Small commits, conventional commit messages, one concern each.
- New behaviour ships with a test. Bug fixes ship with the failing test first.
- Never commit binaries, `.env` files, or generated bundles.
- When something in this file conflicts with a request, say so before writing code.
