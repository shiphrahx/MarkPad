# 4. Shipping on Linux

Date: 2026-09-04

Status: accepted

## Context

MarkPad ships a `.dmg` and an NSIS `.exe`. Everything else in the project
assumes those two: `Platform` is `'windows' | 'macos'`, the release matrix has
three legs, and CLAUDE.md opens with "A Markdown editor for Windows and macOS."

Nothing in the stack is a blocker. Tauri v2 builds Linux targets, WebKitGTK is
the third webview it already supports, and the editor core is plain TypeScript
that has never met an operating system. The work is in the seams: the packaging
format, the size budget, and a handful of places that treat "not macOS" as
"Windows".

Written as an investigation first, then built. What follows is what the work
turned out to be, with the two things still unverified called out at the end.

## Decision

Ship `.deb` and `.rpm`. Do not ship AppImage.

Add `'linux'` to `Platform` rather than letting it fall through to `'windows'`.

## Why not AppImage

The 8 MB installer budget decides this on its own.

A `.deb` links against the system `libwebkit2gtk-4.1`, so it carries the binary
and the frontend and nothing else. `dist/` is 6.3 MB uncompressed and
compresses to roughly 2 MB; the stripped `opt-level = "s"` binary is a similar
size once xz has had it. That lands in the same range as the NSIS installer,
which is currently inside the budget.

An AppImage bundles WebKitGTK and GTK itself. That is 80 MB and up before
MarkPad's own code, which is ten times the budget. The rules say a change that
breaks a budget is the wrong change, and there is no version of AppImage that
does not break this one.

The cost is that `.deb` and `.rpm` cover Debian, Ubuntu, Fedora and their
derivatives, and nothing else. Arch and NixOS users build from source or wait
for somebody to package it. That seems like the right trade for a first Linux
release.

Flatpak is the honest answer to the coverage gap later. It has the same runtime
sharing property that keeps the download small, and Tauri documents the
manifest. Out of scope for a first pass.

## What the work actually is

### The platform type

`src/host/types.ts` has `Platform = 'windows' | 'macos'`. Widening it to
include `'linux'` is one line and then a compiler-driven tour of every branch:

- `src/host/tauri.ts:71` `detectPlatform` reads the user agent and returns
  `'windows'` for anything that is not a Mac. Needs a real third case.
- `src/commands/types.ts:49` picks `windowsKey` only when the platform is
  Windows. Linux follows the Windows conventions here (`F2`, `Ctrl+Shift+P`),
  so it should get the override too. That probably means renaming the field to
  something that is not a platform name.
- `src/commands/keys.ts` draws shortcuts as either Mac symbols or Windows
  names. Linux uses the Windows names, so the existing else branch is right,
  but the naming inside the file becomes a lie worth fixing.
- `src/app/buffer.ts:62` and `src/export/export.ts:85` default new files to
  CRLF on Windows and LF elsewhere. Already correct for Linux.
- `src/main.ts:30` insets the tab strip for the macOS traffic lights. Correct
  as is.
- `src/host/memory.ts:28` defaults the test host to `'macos'`. Fine, but the
  test suite should grow a Linux case.

### Saving files

`src-tauri/src/files.rs` writes to a temporary file and renames it over the
target. That is the right shape, and on Linux it has two problems the current
tests would not catch.

The rename replaces the file rather than writing through it, so the new file
gets fresh permissions from the umask. A note that was `0600` comes back
world-readable, and a group-writable file in a shared directory stops being
group-writable. The fix is to read the target's mode before the rename and
apply it to the temporary file.

It also replaces symlinks. A `~/notes.md` pointing at `~/Dropbox/notes.md` is a
normal thing to have on Linux, and saving would turn the symlink into a regular
file and leave the real one stale. The target needs canonicalising first.

Separately, `is_locked` treats `PermissionDenied` as "in use by another
program". On Windows that is usually true. On Linux it means a read-only file
or a directory you cannot write, and the message would send the user looking
for a program that is not holding anything.

### The window

`src-tauri/src/chrome.rs` colours the Windows caption and already does nothing
everywhere else, so there is nothing to do. Linux window decorations belong to
the window manager and we should not touch them.

`src/ui/native-chrome.ts` calls `getCurrentWindow().setTheme()`. Needs checking
on Linux; if it is not supported the existing `try`/`catch` already swallows
it, which is the right outcome.

The menu bar is the one to actually test. `installMenus` calls
`setAsAppMenu()`, which behaves differently per platform, and Linux draws the
menu inside the window rather than at the top of the screen. The predefined
Cut, Copy and Paste items are supported on all three platforms, so the fix on
`fix/clipboard-menu-items` covers Linux too, but "supported" and "works" are
different claims until somebody presses the keys.

### Export to PDF

`exportPdf` prints a hidden iframe and lets the system print dialog offer "Save
as PDF". WebKitGTK implements `window.print()` and opens the GTK print dialog,
which has a Print to File option. Needs verifying rather than assuming, because
it is the one feature with no fallback if it does not work.

### Fonts

Both typefaces are bundled, so the app looks the same everywhere. The fallback
stacks in `src/ui/tokens.css` name Windows and macOS faces only. They should
pick up Cantarell, Noto Sans and DejaVu Sans for the UI, and DejaVu Sans Mono
and Noto Sans Mono for code.

### Opening files

`startup_files` reads `argv`, which works on Linux as long as the desktop entry
passes `%F`. That means a `.desktop` file with the right `MimeType` and `Exec`,
which Tauri generates from `bundle.linux.deb.desktopTemplate`. Without it,
double-clicking a `.md` file in a file manager does nothing.

### CI and release

`ci.yml` runs the TypeScript checks on Ubuntu already, so those are free. The
`rust` job matrix needs a Linux leg, and every Linux leg needs the WebKitGTK
development packages installed first:

```
libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
patchelf build-essential curl wget file libxdo-dev libssl-dev
```

`release.yml` gets a fourth matrix entry building `.deb` and `.rpm`, with
`scripts/check-budget.mjs` pointed at both. Build on the oldest Ubuntu runner
still available, because the binary links against the build machine's glibc and
that sets the floor for who can install it. On `ubuntu-22.04` that floor is
glibc 2.35, which rules out Debian 11 and anything older.

### Paperwork

`tauri.conf.json` needs `bundle.targets` to stop being implicit, plus a
`bundle.linux` section for the desktop entry and the package dependencies.
`Cargo.toml` and `package.json` both describe MarkPad as being for Windows and
macOS. So does CLAUDE.md, the README and the landing page.

## The two things a unit test cannot answer

`window.print()` in WebKitGTK is how PDF export works. It should open the GTK
print dialog, which has a Print to File option. If it does not, PDF export has
no second route on Linux and the command should be hidden there rather than
left to do nothing.

`setAsAppMenu()` draws the menu inside the window on Linux rather than at the
top of the screen, and the predefined Cut, Copy and Paste items go through GTK
rather than through the webview. The tests assert we ask for them. Only pressing
the keys proves they arrive.

Neither could be checked from a Windows machine, and both matter enough that
"we will find out when somebody complains" is not good enough. So
`scripts/linux-smoke.sh` launches the real binary under Xvfb, types into it with
xdotool and reads the X clipboard back with xclip. It runs as its own CI job and
it runs in WSL, which is the only way anybody developing this on Windows can
check either of them.

It is the one test in the repo that can fail for reasons that are nothing to do
with the code: a missing window manager, a webview that painted nothing, a
keystroke that arrived before the editor had focus. It screenshots the display
on failure for that reason. If it turns flaky rather than failing honestly, the
answer is to make it wait for the right thing rather than to delete it.

## Consequences

Three platforms means three sets of native behaviour to keep straight, and the
cross-platform rules in CLAUDE.md become genuinely harder to hold. Linux has no
single answer for window chrome, and the menu bar convention varies by desktop
environment.

The `.deb` and `.rpm` route means the app is only as good as the distribution's
WebKitGTK. An old WebKitGTK is an old browser engine, and the editor is a large
contenteditable surface that will find the differences. Worth deciding a
minimum version and checking it at launch, the way the Windows build checks for
WebView2.

None of the file handling changes are Linux-only improvements. Preserving the
mode and following symlinks are both right on macOS too, and neither is
currently done.
