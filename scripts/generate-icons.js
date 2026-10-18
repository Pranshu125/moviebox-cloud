const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create PNG from raw RGBA buffer
function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with filter byte (0) per row
  const rowSize = width * 4;
  const filtered = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowSize + 1)] = 0; // filter None
    rgbaBuffer.copy(filtered, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }

  const idatData = zlib.deflateSync(filtered, { level: 9 });
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Generate stylized Clay-Glass MovieBox App Icon
function renderAppIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  // Squircle distance helper
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const maxDist = size * 0.44;
      
      // Rounded box distance (clay squircle)
      const qx = Math.max(dx - (size / 2 - radius - size * 0.04), 0);
      const qy = Math.max(dy - (size / 2 - radius - size * 0.04), 0);
      const cornerDist = Math.sqrt(qx * qx + qy * qy);

      if (cornerDist > radius) {
        // Outside squircle
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Base gradient: Deep matte obsidian #0a0d16 to #05060a
      const t = (x + y) / (size * 2);
      let r = 10 * (1 - t) + 4 * t;
      let g = 13 * (1 - t) + 6 * t;
      let b = 22 * (1 - t) + 10 * t;

      // Aurora top-left glow (cyan/blue)
      const distTL = Math.sqrt((x - size * 0.25) ** 2 + (y - size * 0.25) ** 2) / size;
      const glowTL = Math.max(0, 1 - distTL * 1.8);
      r += glowTL * 30;
      g += glowTL * 90;
      b += glowTL * 220;

      // Aurora bottom-right glow (ruby/purple)
      const distBR = Math.sqrt((x - size * 0.78) ** 2 + (y - size * 0.78) ** 2) / size;
      const glowBR = Math.max(0, 1 - distBR * 1.8);
      r += glowBR * 180;
      g += glowBR * 30;
      b += glowBR * 120;

      // Claymorphism: Inner top-left specular rim highlight
      const edgeDist = radius - cornerDist;
      if (edgeDist < size * 0.06 && (x < cx || y < cy)) {
        const rim = Math.sin((edgeDist / (size * 0.06)) * Math.PI * 0.5);
        r = r * 0.4 + 255 * 0.6 * rim;
        g = g * 0.4 + 255 * 0.6 * rim;
        b = b * 0.4 + 255 * 0.6 * rim;
      }

      // Center play triangle
      // Equilateral-ish triangle pointing right
      const px = (x - cx) / (size * 0.24);
      const py = (y - cy) / (size * 0.24);
      // Triangle bounds: x in [-0.6, 0.8], |y| <= (0.8 - x) * 0.65
      if (px >= -0.55 && px <= 0.8 && Math.abs(py) <= (0.8 - px) * 0.72) {
        // Clay-glass play prism
        const playGrad = (px + 0.6) / 1.4;
        r = 240 + playGrad * 15;
        g = 245 + playGrad * 10;
        b = 255;
      }

      buf[idx] = Math.min(255, Math.max(0, Math.round(r)));
      buf[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      buf[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      buf[idx + 3] = 255;
    }
  }

  return createPng(size, size, buf);
}

// Generate 192 and 512
const outDirs = [
  path.join(__dirname, '..', 'icons'),
  path.join(__dirname, '..', 'public', 'icons'),
  path.join(__dirname, '..', 'ui')
];

for (const dir of outDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log('Generating 192x192 icon...');
const png192 = renderAppIcon(192);
console.log('Generating 512x512 icon...');
const png512 = renderAppIcon(512);

fs.writeFileSync(path.join(__dirname, '..', 'icons', 'icon-192.png'), png192);
fs.writeFileSync(path.join(__dirname, '..', 'icons', 'icon-512.png'), png512);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon-192.png'), png192);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'), png512);
fs.writeFileSync(path.join(__dirname, '..', 'ui', 'icon-192.png'), png192);
fs.writeFileSync(path.join(__dirname, '..', 'ui', 'icon-512.png'), png512);

console.log('Icons generated successfully.');
