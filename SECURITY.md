# Security

## Reporting a problem

Please don't open a public issue for a security problem. Use GitHub's private
reporting instead: the **Report a vulnerability** button on the
[Security tab](https://github.com/shiphrahx/MarkPad/security/advisories/new).

Say what you found, how to reproduce it, and which version. You'll get a reply
within a week. MarkPad is maintained by one person in their spare time, so a
fix can take longer than that, but you'll hear what's happening.

## What counts

The thing MarkPad most needs to get right is opening a Markdown file somebody
else wrote. Anything where a document can do more than show you text and
pictures is in scope, for example:

- running script in the window
- reading or writing a file you didn't open
- making a network request other than the update check
- launching another program from a link

Only the latest release gets fixes.

## What the app does to stay safe

- The window only reads and writes files you gave it: picked in a dialog,
  dropped on the window, opened from your file manager, or reopened from last
  time. See `src-tauri/src/access.rs`.
- Pictures load through a protocol that serves image files and nothing else.
  See `docs/decisions/0007-image-protocol.md`.
- Raw HTML in a document is sanitised with DOMPurify, and a content security
  policy blocks script, forms and plugins on top of that.
- Links open in your browser, and only `http`, `https` and `mailto` ones.
- Every installer has a SHA-256 checksum and a GitHub build attestation on the
  release page.
