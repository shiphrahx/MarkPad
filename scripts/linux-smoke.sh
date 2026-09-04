#!/usr/bin/env bash
#
# Drive a real MarkPad window on a real X server and press real keys.
#
# Two things about the Linux build cannot be answered by a unit test, and both
# have no fallback if they turn out not to work:
#
#   1. Cut, copy and paste go through GTK's menu rather than through the
#      webview, so the tests that assert we ask for those items prove nothing
#      about whether the keystrokes arrive.
#   2. PDF export is window.print() in an iframe, and whether WebKitGTK opens
#      the GTK print dialog is a question about WebKitGTK, not about us.
#
# So this launches the app under Xvfb, types into it with xdotool, and reads the
# X clipboard back with xclip. Runs in CI and in WSL, which is the only way
# somebody on Windows can check any of it.
#
# Usage: scripts/linux-smoke.sh [path-to-binary]

set -euo pipefail

BINARY="${1:-}"
DISPLAY_NUMBER=99
MARKER="copied-by-xdotool"
PASTED="pasted-by-xdotool"
SECOND="and-typed-after"

if [ -z "$BINARY" ]; then
  for candidate in \
    src-tauri/target/debug/markpad \
    src-tauri/target/debug/MarkPad \
    src-tauri/target/release/markpad \
    src-tauri/target/release/MarkPad; do
    if [ -x "$candidate" ]; then
      BINARY="$candidate"
      break
    fi
  done
fi

if [ ! -x "$BINARY" ]; then
  echo "No MarkPad binary. Build one first:" >&2
  echo "  pnpm tauri build --debug --no-bundle" >&2
  exit 2
fi

for tool in Xvfb xdotool xclip openbox; do
  command -v "$tool" >/dev/null || {
    echo "$tool is not installed. See the smoke job in .github/workflows/ci.yml." >&2
    exit 2
  }
done

export DISPLAY=":$DISPLAY_NUMBER"
export GDK_BACKEND=x11
# Without these the webview paints nothing on a machine with no GPU, and every
# assertion below fails for a reason that has nothing to do with the assertion.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1

XVFB_PID=""
WM_PID=""
APP_PID=""

cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$WM_PID" ] && kill "$WM_PID" 2>/dev/null || true
  [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT

step() { printf '\n=== %s\n' "$1"; }
fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

# Wait for a command to succeed, up to a number of half seconds.
wait_for() {
  local attempts="$1"
  shift
  for _ in $(seq "$attempts"); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

clipboard() {
  xclip -selection clipboard -o -t text/plain 2>/dev/null ||
    xclip -selection clipboard -o 2>/dev/null ||
    true
}

step "Starting Xvfb and a window manager"
Xvfb ":$DISPLAY_NUMBER" -screen 0 1280x900x24 -nolisten tcp &
XVFB_PID=$!
wait_for 30 xdotool getdisplaygeometry || fail "Xvfb never came up"

# A window manager, because xdotool cannot reliably focus a window that nothing
# is managing, and an unfocused window gets none of the keystrokes below.
openbox &
WM_PID=$!
sleep 1

step "Launching $BINARY"
"$BINARY" &
APP_PID=$!

wait_for 120 xdotool search --onlyvisible --pid "$APP_PID" ||
  fail "no window appeared within a minute"

WINDOW=$(xdotool search --onlyvisible --pid "$APP_PID" | head -1)
echo "window $WINDOW"

xdotool windowactivate --sync "$WINDOW"
xdotool windowfocus --sync "$WINDOW"
# The editing surface, safely below the tab strip and above the status bar.
xdotool mousemove --window "$WINDOW" 450 400 click 1
sleep 2

step "Copy: type a marker, select all, Ctrl+C"
xdotool type --delay 30 "$MARKER"
sleep 1
xdotool key --clearmodifiers ctrl+a
sleep 0.5
xdotool key --clearmodifiers ctrl+c
sleep 1

COPIED=$(clipboard)
case "$COPIED" in
*"$MARKER"*) echo "clipboard has the marker" ;;
*) fail "Ctrl+C put nothing useful on the clipboard. Got: ${COPIED:0:200}" ;;
esac

step "Paste: put text on the clipboard, select all, Ctrl+V"
printf '%s' "$PASTED" | xclip -selection clipboard -i
sleep 1
xdotool key --clearmodifiers ctrl+a
sleep 0.5
xdotool key --clearmodifiers ctrl+v
sleep 1

# Typing after the paste proves the caret ended up in the document rather than
# the paste being swallowed and the clipboard simply still holding what we put
# there a moment ago.
xdotool type --delay 30 "$SECOND"
sleep 1
xdotool key --clearmodifiers ctrl+a
sleep 0.5
xdotool key --clearmodifiers ctrl+c
sleep 1

AFTER=$(clipboard)
case "$AFTER" in
*"$PASTED"*"$SECOND"*) echo "the paste landed in the document" ;;
*) fail "Ctrl+V did not insert the clipboard. Document reads: ${AFTER:0:200}" ;;
esac

step "Print: Ctrl+P should open the GTK print dialog"
xdotool key --clearmodifiers ctrl+p

if wait_for 60 xdotool search --onlyvisible --name '[Pp]rint'; then
  echo "a print dialog opened"
  xdotool key --clearmodifiers Escape
else
  fail "Ctrl+P opened no print dialog, so PDF export has no route on Linux"
fi

step "All three passed"
