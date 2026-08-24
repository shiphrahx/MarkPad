// Draws the 1024px source icon that `pnpm tauri icon` slices up.
//
// Written by hand rather than committing a binary, because the repo rules say
// no binaries and a placeholder PNG is exactly the kind of thing that ends up
// shipping. Run it, then run `pnpm tauri icon build/icon.png`.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SIZE = 1024
const RADIUS = 208

const INK = [27, 27, 31]
const PAPER = [244, 244, 247]

const canvas = Buffer.alloc(SIZE * SIZE * 4)

function set(x, y, [r, g, b], alpha = 255) {
  const offset = (y * SIZE + x) * 4
  canvas[offset] = r
  canvas[offset + 1] = g
  canvas[offset + 2] = b
  canvas[offset + 3] = alpha
}

// Rounded square background.
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = Math.max(RADIUS - x, x - (SIZE - 1 - RADIUS), 0)
    const dy = Math.max(RADIUS - y, y - (SIZE - 1 - RADIUS), 0)
    const inside = Math.hypot(dx, dy) <= RADIUS
    set(x, y, INK, inside ? 255 : 0)
  }
}

// A slab M, drawn as four strokes so it reads at 32px.
const stroke = 84
const top = 300
const bottom = 724
const left = 268
const right = 756
const middle = (left + right) / 2

function bar(x0, y0, x1, y1) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) set(x, y, PAPER)
    }
  }
}

function diagonal(x0, y0, x1, y1) {
  const steps = Math.round(Math.hypot(x1 - x0, y1 - y0)) * 2
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    bar(cx - stroke / 2, cy - stroke / 2, cx + stroke / 2, cy + stroke / 2)
  }
}

bar(left, top, left + stroke, bottom)
bar(right - stroke, top, right, bottom)
diagonal(left + stroke / 2, top + stroke / 2, middle, bottom - 150)
diagonal(middle, bottom - 150, right - stroke / 2, top + stroke / 2)

// Minimal PNG encoder: one IHDR, one IDAT, one IEND.
function chunk(type, body) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([length, typed, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // no per-row filter
  canvas.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = resolve(process.argv[2] ?? 'build/icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`Wrote ${out} (${png.length} bytes)`)
