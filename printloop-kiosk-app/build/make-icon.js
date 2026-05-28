/**
 * Generate a minimal PrintLoop branding icon (256x256 PNG) for
 * electron-builder. Uses only Node built-ins so this runs on any
 * dev machine with no extra deps.
 *
 * Replace `build/icon.png` with a real designer asset whenever you
 * have one — electron-builder picks up whatever is at that path.
 *
 *   node build/make-icon.js
 */
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

const SIZE = 256;
const BG = [248, 244, 237];      // paper #F8F4ED
const FG = [209, 75, 44];        // persimmon #D14B2C
const INK = [26, 20, 16];        // ink #1A1410

// Pre-computed 5x7 bitmap glyphs for the wordmark, scaled up to ~28x39.
// Just "PL" centered in a rounded square keeps it readable at 16x16.
const GLYPHS = {
  P: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10000',
    '10000',
    '10000',
  ],
  L: [
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '11111',
  ],
};

// ── CRC32 (RFC 1952), needed for PNG chunks ──────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ── Draw the 256x256 image to a flat RGB buffer ──────────────────────
const rowBytes = SIZE * 3;
const raw = Buffer.alloc((rowBytes + 1) * SIZE);
function setPx(x, y, rgb) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = y * (rowBytes + 1) + 1 + x * 3;
  raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2];
}

// 1. Fill with the persimmon background.
for (let y = 0; y < SIZE; y++) {
  raw[y * (rowBytes + 1)] = 0; // PNG filter byte (0 = None)
  for (let x = 0; x < SIZE; x++) setPx(x, y, FG);
}

// 2. Carve out an inner rounded square (8px border, 24px radius corners)
//    in the cream paper colour.
const PAD = 12;
const R = 28;
function inRounded(x, y) {
  const minX = PAD, maxX = SIZE - PAD - 1;
  const minY = PAD, maxY = SIZE - PAD - 1;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  // Corner test
  const corners = [
    [minX + R, minY + R],
    [maxX - R, minY + R],
    [minX + R, maxY - R],
    [maxX - R, maxY - R],
  ];
  for (const [cx, cy] of corners) {
    const inCornerBox =
      (Math.sign(cx - x) === Math.sign(cx - minX - R + 1) && Math.abs(x - cx) <= R) &&
      (Math.sign(cy - y) === Math.sign(cy - minY - R + 1) && Math.abs(y - cy) <= R);
    // simpler: check if we're in the 4 corner zones, then enforce the radius
    if (
      ((x < minX + R && y < minY + R) && cx === minX + R && cy === minY + R) ||
      ((x > maxX - R && y < minY + R) && cx === maxX - R && cy === minY + R) ||
      ((x < minX + R && y > maxY - R) && cx === minX + R && cy === maxY - R) ||
      ((x > maxX - R && y > maxY - R) && cx === maxX - R && cy === maxY - R)
    ) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > R * R) return false;
    }
  }
  return true;
}
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (inRounded(x, y)) setPx(x, y, BG);
  }
}

// 3. Stamp "PL" in ink centered inside the rounded square.
function stampGlyph(glyph, ox, oy, scale, rgb) {
  for (let gy = 0; gy < glyph.length; gy++) {
    for (let gx = 0; gx < glyph[gy].length; gx++) {
      if (glyph[gy][gx] === '1') {
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            setPx(ox + gx * scale + px, oy + gy * scale + py, rgb);
          }
        }
      }
    }
  }
}
const SCALE = 20;
const GLYPH_W = 5 * SCALE;
const GLYPH_H = 7 * SCALE;
const GAP = SCALE * 1.5;
const totalW = GLYPH_W * 2 + GAP;
const startX = Math.round((SIZE - totalW) / 2);
const startY = Math.round((SIZE - GLYPH_H) / 2);
stampGlyph(GLYPHS.P, startX, startY, SCALE, INK);
stampGlyph(GLYPHS.L, Math.round(startX + GLYPH_W + GAP), startY, SCALE, INK);

// ── Encode as PNG ────────────────────────────────────────────────────
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // colour type 2 = RGB
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

const idatData = zlib.deflateSync(raw);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log(`[icon] wrote ${out} — ${png.length} bytes, ${SIZE}x${SIZE}`);
