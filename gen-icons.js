// Generates icon16/48/128 PNGs with zlib (built into node). No deps.
const zlib = require("zlib");
const fs = require("fs");

function makePNG(size, pixels) {
  // pixels: Uint8Array RGBA length size*size*4
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const idat = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// crc32
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const r = size * 0.46;
  const corner = size * 0.28; // rounded square radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect mask
      const dx = Math.max(Math.abs(x - cx) - (size / 2 - corner), 0);
      const dy = Math.max(Math.abs(y - cy) - (size / 2 - corner), 0);
      const distCorner = Math.sqrt(dx * dx + dy * dy);
      const inside = distCorner <= corner - size * 0.04;
      const edge = distCorner <= corner;
      // diagonal gradient (fire): red -> orange -> violet
      const t = (x + y) / (2 * size);
      let R, G, B;
      if (t < 0.55) {
        const tt = t / 0.55;
        R = lerp(255, 255, tt); G = lerp(77, 158, tt); B = lerp(77, 64, tt);
      } else {
        const tt = (t - 0.55) / 0.45;
        R = lerp(255, 139, tt); G = lerp(158, 92, tt); B = lerp(64, 246, tt);
      }
      let a = 0;
      if (inside) a = 255;
      else if (edge) a = Math.round(255 * (1 - (distCorner - (corner - size * 0.04)) / (size * 0.04)));

      // simple check-mark glyph in white
      // check: two strokes forming ✓ centered
      const nx = (x - cx) / size, ny = (y - cy) / size;
      let isCheck = false;
      const w = 0.055;
      // stroke 1: from (-0.18,0.02) to (-0.02,0.18)
      isCheck = isCheck || pointToSeg(nx, ny, -0.18, 0.0, -0.03, 0.16) < w;
      // stroke 2: from (-0.02,0.18) to (0.2,-0.16)
      isCheck = isCheck || pointToSeg(nx, ny, -0.03, 0.16, 0.2, -0.16) < w;

      if (isCheck && a > 0) { R = 255; G = 255; B = 255; }

      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = a;
    }
  }
  return px;
}

function pointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

[16, 48, 128].forEach((s) => {
  const buf = makePNG(s, drawIcon(s));
  fs.writeFileSync(`icons/icon${s}.png`, buf);
  console.log(`wrote icons/icon${s}.png (${buf.length} bytes)`);
});
