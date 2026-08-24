# 2. The editor only ever sees LF

Date: 2026-08-24

Status: accepted

## Context

MarkPad promises not to rewrite your line endings. A file that arrives as CRLF
leaves as CRLF. That promise has to hold without making every feature in the
app think about it.

The obvious approach is to keep the file's bytes in the buffer as they are. It
does not survive contact with the rest of the editor: a CRLF document makes
offsets, selections, word counts, `Ln/Col` and every regex in the codebase
quietly wrong by one character per line, and those bugs surface a long way from
the cause.

## Decision

The editor works in LF, always. Line endings are detected when a file is read,
stripped, and reapplied byte for byte when it is written. The same goes for a
byte order mark. What the file had is carried on the document, not in the text.

A file with mixed endings counts as CRLF.

A lone CR is folded into LF and not restored. Classic Mac files are not a
supported round trip.

## Consequences

Nothing above the host boundary has to know that CRLF exists, and the status
bar reads the setting off the document rather than scanning the text.

A mixed file gets normalised to CRLF on save, which is a rewrite of lines the
user did not touch. Every option here rewrites something. Choosing CRLF means
the Windows lines survive, which matters more given who is likely to have a
mixed file in the first place.

Byte length has to be computed from the encoded bytes, not the string length,
or the status bar will disagree with Explorer on any file with an accent in it.
