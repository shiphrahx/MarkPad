# MarkPad

A small, simple Markdown reader and editor for Mac and Windows.

That's it, really. You double-click a `.md` file, it opens, it looks like a document
instead of a wall of asterisks. You type. It saves. Done.

**[Download it here](https://github.com/shiphrahx/MarkPad/releases/latest)** — about
3 MB, works on Windows 10+ and macOS 13+.

## Why bother making another one

Because every time I wanted to just *read* a Markdown file, my options were:

- open it in a code editor, and squint at the raw syntax
- paste it into some website, which means the file leaves my machine
- install a note-taking app that wants an account, a vault, a sync folder and
  a monthly fee before it'll show me my own text

None of those are "open the file". So this one just opens the file.

## It doesn't run in your browser

Worth saying twice, because it's the whole point. MarkPad is a real desktop app.
Not a web page pretending to be one, not a tab you have to keep finding again.

It uses the WebView that's already on your computer (WebView2 on Windows, WKWebView
on macOS) instead of shipping its own copy of Chromium, which is why the download is
3 MB and not 300 MB. It starts fast. It stays out of your RAM. Close it and it's gone.

## What it does

- Opens and edits `.md` files, several at a time, in tabs
- Renders as you type, so you're reading a document not a source file
- Source view is still there, one keystroke away, when you need it
- `Ctrl+K` / `⌘K` for everything, so you're never hunting through menus
- Tables, LaTeX and Mermaid diagrams preview in a popover
- Export to HTML or PDF
- Light and dark, following whatever your system is set to
- Handles CRLF vs LF properly, which matters more than you'd think if you work
  across both platforms

## What it doesn't do

No accounts. No sync. No telemetry. No tags, backlinks or graph view. No special
Markdown syntax that only works here.

Your files are just files, sitting in whatever folder you put them in. Uninstall
MarkPad tomorrow and every one of them still opens in anything else.

## Building it yourself

You'll need [Node 20+](https://nodejs.org), [pnpm](https://pnpm.io) and
[Rust](https://rustup.rs).

```bash
pnpm install
pnpm icons      # generates the app icons, they aren't committed
pnpm tauri dev  # run it
```

To build an installer:

```bash
pnpm tauri build
```

Other things you might want:

```bash
pnpm test        # editor tests (vitest)
pnpm typecheck   # tsc, no emit
cd src-tauri && cargo test
```

## Under the hood

Tauri v2 for the shell, CodeMirror 6 for the editor, TypeScript and hand-written CSS
for the chrome. No UI framework. There are hard size and speed budgets in
[`CLAUDE.md`](./CLAUDE.md) that CI enforces, and if a change breaks one then the change
is wrong, not the budget.

Design decisions live in [`docs/decisions/`](./docs/decisions). Start there before
suggesting an architectural change.

Owes a lot to [MarkEdit](https://github.com/MarkEdit-app/MarkEdit), which is excellent
and macOS only. This is the cross-platform take on the same idea.

## Licence

MIT.
