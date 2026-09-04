/**
 * How rendered Markdown looks.
 *
 * Kept as a string rather than a stylesheet because the exported HTML has to
 * carry its own styles: a file you email someone cannot link back to the app.
 * The preview pane injects the same text, so what you see and what you export
 * are the same document.
 */
export const DOCUMENT_CSS = `
:root {
  --doc-bg: #ffffff;
  --doc-fg: #1b1b1f;
  --doc-muted: #6b6b76;
  --doc-rule: #e4e4e9;
  --doc-accent: #3b6ea5;
  --doc-code-bg: #f4f4f7;
}

/* Guarded so an explicit choice beats the operating system, both ways. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --doc-bg: #1b1b1f;
    --doc-fg: #e6e6ea;
    --doc-muted: #9a9aa5;
    --doc-rule: #2e2e35;
    --doc-accent: #7aa7d9;
    --doc-code-bg: #26262c;
  }
}

:root[data-theme='dark'] {
  --doc-bg: #1b1b1f;
  --doc-fg: #e6e6ea;
  --doc-muted: #9a9aa5;
  --doc-rule: #2e2e35;
  --doc-accent: #7aa7d9;
  --doc-code-bg: #26262c;
}

.markpad-document {
  background: var(--doc-bg);
  color: var(--doc-fg);
  font-family: system-ui, -apple-system, "Segoe UI", Cantarell, "Noto Sans",
    "DejaVu Sans", Roboto, sans-serif;
  /* These styles are also the ones an exported file carries, where nothing
     sets --zoom and the fallback is what applies. Inside the app the preview
     pane and the popovers follow the zoom level like everything else. */
  font-size: calc(16px * var(--zoom, 1));
  line-height: 1.65;
  max-width: 42rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 6rem;
  overflow-wrap: break-word;
}

.markpad-document h1,
.markpad-document h2,
.markpad-document h3,
.markpad-document h4,
.markpad-document h5,
.markpad-document h6 {
  line-height: 1.25;
  margin: 2em 0 0.6em;
  font-weight: 600;
}

.markpad-document h1 { font-size: 1.9em; margin-top: 0; }
.markpad-document h2 { font-size: 1.45em; }
.markpad-document h3 { font-size: 1.2em; }
.markpad-document h4, .markpad-document h5, .markpad-document h6 { font-size: 1em; }

.markpad-document p { margin: 0 0 1.1em; }

.markpad-document a { color: var(--doc-accent); }

.markpad-document blockquote {
  margin: 1.2em 0;
  padding: 0 0 0 1.1em;
  border-left: 3px solid var(--doc-rule);
  color: var(--doc-muted);
}

.markpad-document code {
  font-family: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas,
    "Noto Sans Mono", "DejaVu Sans Mono", monospace;
  font-size: 0.9em;
  background: var(--doc-code-bg);
  border-radius: 4px;
  padding: 0.15em 0.35em;
}

.markpad-document pre {
  background: var(--doc-code-bg);
  border-radius: 8px;
  padding: 0.9em 1.1em;
  overflow-x: auto;
}

.markpad-document pre code {
  background: none;
  padding: 0;
  font-size: 0.875em;
}

.markpad-document table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.2em 0;
  font-size: 0.95em;
  display: block;
  overflow-x: auto;
}

.markpad-document th,
.markpad-document td {
  border: 1px solid var(--doc-rule);
  padding: 0.45em 0.7em;
  text-align: left;
}

.markpad-document th { background: var(--doc-code-bg); font-weight: 600; }

.markpad-document img { max-width: 100%; height: auto; }

/*
 * A picture MarkPad will not fetch, which today means one on the web: the app
 * makes a single network request and it is the update check. Drawn as a quiet
 * outlined box showing the alt text, so it reads as a decision rather than as
 * a broken image.
 */
.markpad-document img[data-unresolved] {
  display: inline-block;
  min-width: 8em;
  padding: 10px 14px;
  border: 1px dashed var(--rule, #e1e6e3);
  border-radius: 6px;
  color: var(--muted, #6e7a78);
  font-size: 12.5px;
  font-style: italic;
}

.markpad-document hr {
  border: none;
  border-top: 1px solid var(--doc-rule);
  margin: 2em 0;
}

.markpad-document ul,
.markpad-document ol { padding-left: 1.4em; margin: 0 0 1.1em; }

.markpad-document li { margin: 0.25em 0; }

.markpad-document li input[type="checkbox"] { margin-right: 0.4em; }

.markpad-document .mp-block { margin: 1.2em 0; text-align: center; }

.markpad-document .mp-block svg { max-width: 100%; height: auto; }

.markpad-document .mp-block-error {
  color: #b3261e;
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  text-align: left;
  white-space: pre-wrap;
}

@media print {
  .markpad-document {
    max-width: none;
    padding: 0;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }

  /* A heading with its section starting on the next page reads as an orphan. */
  .markpad-document h1,
  .markpad-document h2,
  .markpad-document h3 { break-after: avoid; }

  .markpad-document pre,
  .markpad-document blockquote,
  .markpad-document table { break-inside: avoid; }
}
`
