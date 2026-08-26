<div align="center">

# MarkPad

**A small, simple Markdown reader and editor for Mac and Windows.**

[![CI](https://github.com/shiphrahx/MarkPad/actions/workflows/ci.yml/badge.svg)](https://github.com/shiphrahx/MarkPad/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/shiphrahx/MarkPad?display_name=tag&sort=semver&color=0E7C66)](https://github.com/shiphrahx/MarkPad/releases/latest)
[![Licence](https://img.shields.io/badge/licence-MIT-0E7C66)](./LICENSE)

[![Platforms](https://img.shields.io/badge/platforms-Windows%2010%2B%20%C2%B7%20macOS%2013%2B-6E7A78)](https://github.com/shiphrahx/MarkPad/releases/latest)
[![Installer size](https://img.shields.io/badge/installer-~3.3%20MB-6E7A78)](#it-doesnt-run-in-your-browser)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-6E7A78)](https://tauri.app)

**[Download for macOS or Windows](https://github.com/shiphrahx/MarkPad/releases/latest)**

</div>

---

You double-click a `.md` file, it opens, and it looks like a document rather than
raw syntax. You type. It saves.

## Why it exists

I wanted a way to read and edit Markdown that was just a small app on my desktop.
Something that opens the file, shows it properly, and doesn't ask for anything else
first. That's what this is.

## It doesn't run in your browser

MarkPad is a real desktop app, not a web page in a tab.

It uses the WebView already on your computer (WebView2 on Windows, WKWebView on macOS)
rather than shipping its own copy of Chromium. That's why the download is around 3 MB.
It starts quickly, it stays small in memory, and when you close it, it's closed.

## What it does

- Opens and edits `.md` files, several at a time, in tabs
- Renders as you type, so you're reading a document and not a source file
- Source view is one keystroke away when you need it
- `Ctrl+K` / `⌘K` reaches every command, so there's no hunting through menus
- Tables, LaTeX and Mermaid diagrams preview in a popover
- Export to HTML or PDF
- Light and dark, following your system setting
- Detects CRLF or LF on open and keeps it on save, which matters if you move files
  between Windows and Mac

## What it doesn't do

No accounts, no sync, no telemetry. No tags, backlinks or graph view. No Markdown
syntax that only works here.

Your files are ordinary files in ordinary folders. Uninstall MarkPad and they still
open in everything else.

## Building it yourself

You'll need [Node 20+](https://nodejs.org), [pnpm](https://pnpm.io) and
[Rust](https://rustup.rs).

```bash
pnpm install
pnpm icons      # generates the app icons, which aren't committed
pnpm tauri dev  # run it
```

To build an installer:

```bash
pnpm tauri build
```

Tests and checks:

```bash
pnpm test        # editor tests (vitest)
pnpm typecheck   # tsc, no emit
cd src-tauri && cargo test
```

## Under the hood

Tauri v2 for the shell, CodeMirror 6 for the editor, TypeScript and hand-written CSS
for the chrome. No UI framework.

There are hard size and speed budgets in [`CLAUDE.md`](./CLAUDE.md) that CI enforces.
If a change breaks one, the change is wrong and not the budget.

Design decisions live in [`docs/decisions/`](./docs/decisions). Worth reading before
suggesting an architectural change.

Owes a lot to [MarkEdit](https://github.com/MarkEdit-app/MarkEdit), which is excellent
and macOS only. This is the cross-platform take on the same idea.

## Licence

MIT. See [`LICENSE`](./LICENSE).
