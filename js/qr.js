// A small QR encoder — byte mode, error correction level M, versions 1–10.
//
// Why not an image service: these codes are printed into a book somebody keeps
// for fifty years. Fetching them from a third party at render time means the
// book's contents depend on that company answering an HTTP request on the day
// it happens to be printed. This has no dependencies and no network.
//
// Level M corrects ~15% damage, which is the usual choice for a printed URL —
// enough to survive a thumbprint or a crease without inflating the grid.

const EC_M = {
  //        total, ecPerBlock, [ [blocks, dataCodewords], ... ]
  1:  { total: 26,  ec: 10, groups: [[1, 16]] },
  2:  { total: 44,  ec: 16, groups: [[1, 28]] },
  3:  { total: 70,  ec: 26, groups: [[1, 44]] },
  4:  { total: 100, ec: 18, groups: [[2, 32]] },
  5:  { total: 134, ec: 24, groups: [[2, 43]] },
  6:  { total: 172, ec: 16, groups: [[4, 27]] },
  7:  { total: 196, ec: 18, groups: [[4, 31]] },
  8:  { total: 242, ec: 22, groups: [[2, 38], [2, 39]] },
  9:  { total: 292, ec: 22, groups: [[3, 36], [2, 37]] },
  10: { total: 346, ec: 26, groups: [[4, 43], [1, 44]] },
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* ---- GF(256), the field QR's Reed-Solomon lives in (primitive poly 0x11d) ---- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function generatorPoly(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];                          // × x
      next[i + 1] ^= gfMul(poly[i], EXP[d]);       // × α^d
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data, count) {
  const gen = generatorPoly(count);
  const rem = new Array(data.length + count).fill(0);
  for (let i = 0; i < data.length; i++) rem[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const factor = rem[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], factor);
  }
  return rem.slice(data.length);
}

/* ---- BCH, for the format and version strips ---- */
function bch(value, poly, bits) {
  let v = value << bits;
  const polyBits = 32 - Math.clz32(poly);
  while (32 - Math.clz32(v) >= polyBits) v ^= poly << ((32 - Math.clz32(v)) - polyBits);
  return (value << bits) | v;
}
// Level M is indicator 0b00; the spec then masks the 15 bits with 0x5412.
const formatBits = (mask) => bch((0b00 << 3) | mask, 0b10100110111, 10) ^ 0b101010000010010;
const versionBits = (v) => bch(v, 0b1111100100101, 12);

/* ---- data encoding ---- */
function toBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const spec = EC_M[v];
    const dataCw = spec.groups.reduce((n, [blocks, cw]) => n + blocks * cw, 0);
    const lenBits = v < 10 ? 8 : 16;
    // 4-bit mode indicator + length + payload, rounded up to whole codewords
    if (4 + lenBits + byteLen * 8 <= dataCw * 8) return v;
  }
  throw new Error('QR payload too long for versions 1-10: ' + byteLen + ' bytes');
}

function bitStream(text, version) {
  const bytes = toBytes(text);
  const spec = EC_M[version];
  const dataCw = spec.groups.reduce((n, [blocks, cw]) => n + blocks * cw, 0);
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };

  push(0b0100, 4);                             // byte mode
  push(bytes.length, version < 10 ? 8 : 16);   // character count
  for (const b of bytes) push(b, 8);

  const capacity = dataCw * 8;
  push(0, Math.min(4, capacity - bits.length));      // terminator
  while (bits.length % 8) bits.push(0);              // pad to a byte boundary

  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    cw.push(byte);
  }
  // The spec's alternating pad bytes
  const PADS = [0xec, 0x11];
  for (let i = 0; cw.length < dataCw; i++) cw.push(PADS[i % 2]);
  return cw;
}

function interleave(codewords, version) {
  const spec = EC_M[version];
  const blocks = [], eccs = [];
  let at = 0;
  for (const [count, dataLen] of spec.groups) {
    for (let b = 0; b < count; b++) {
      const chunk = codewords.slice(at, at + dataLen);
      at += dataLen;
      blocks.push(chunk);
      eccs.push(ecCodewords(chunk, spec.ec));
    }
  }
  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < spec.ec; i++) for (const e of eccs) out.push(e[i]);
  return out;
}

/* ---- the matrix ---- */
function placeFunctionPatterns(size, version) {
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) m[r][c] = v; };

  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(r0 + r, c0 + c, on ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {          // timing
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  const centers = ALIGN[version];
  const first = centers[0], last = centers[centers.length - 1];
  const onFinder = (r, c) =>
    (r === first && c === first) || (r === first && c === last) || (r === last && c === first);
  for (const r of centers) for (const c of centers) {
    if (onFinder(r, c)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      m[r + dr][c + dc] = on ? 1 : 0;
    }
  }

  m[size - 8][8] = 1;                           // the lone dark module

  // reserve format areas
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
  }
  if (version >= 7) {                           // reserve version areas
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      m[size - 11 + j][i] = 0; m[i][size - 11 + j] = 0;
    }
  }
  return m;
}

function isFunction(reserved, r, c) { return reserved[r][c] !== null; }

function placeData(m, reserved, bits, size) {
  let i = 0, up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;                   // the vertical timing column
    for (let step = 0; step < size; step++) {
      const row = up ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (isFunction(reserved, row, col)) continue;
        m[row][col] = i < bits.length ? bits[i] : 0;
        i++;
      }
    }
    up = !up;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m, size) {
  let score = 0;
  // rule 1: runs of five or more
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score += 1; }
        else run = 1;
      }
    }
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // rule 3: the finder-lookalike sequence, either polarity, both directions
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const hit = (line, i, pat) => pat.every((v, k) => line[i + k] === v);
  for (let i = 0; i < size; i++) {
    const row = m[i], col = m.map((r2) => r2[i]);
    for (let j = 0; j + 11 <= size; j++) {
      if (hit(row, j, A) || hit(row, j, B)) score += 40;
      if (hit(col, j, A) || hit(col, j, B)) score += 40;
    }
  }
  // rule 4: overall balance
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

function applyFormat(m, size, mask) {
  const bits = formatBits(mask);
  // Both copies run most-significant bit first along these paths. (Getting
  // this backwards still produces a plausible-looking code that no scanner
  // will read — the format strip is what tells a reader the mask.)
  const copy1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const copy2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
                 [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
  for (let i = 0; i < 15; i++) {
    const b = (bits >> (14 - i)) & 1;
    m[copy1[i][0]][copy1[i][1]] = b;
    m[copy2[i][0]][copy2[i][1]] = b;
  }
  m[size - 8][8] = 1;                            // always dark
}

function applyVersion(m, size, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = i % 3;
    m[size - 11 + c][r] = b;
    m[r][size - 11 + c] = b;
  }
}

/** Build with one specific mask. Exported so the test suite can pin it. */
export function qrMatrixWithMask(text, forceMask) {
  return build(text, forceMask);
}

/** Returns a size×size array of 0/1 — 1 is a dark module. */
export function qrMatrix(text) {
  return build(text, null);
}

function build(text, forceMask) {
  const bytes = toBytes(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = interleave(bitStream(text, version), version);
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);

  const reserved = placeFunctionPatterns(size, version);
  let best = null, bestScore = Infinity;
  const masks = forceMask === null || forceMask === undefined ? [0,1,2,3,4,5,6,7] : [forceMask];
  for (const mask of masks) {
    const m = reserved.map((row) => row.slice());
    placeData(m, reserved, bits, size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!isFunction(reserved, r, c) && MASKS[mask](r, c)) m[r][c] ^= 1;
    }
    applyFormat(m, size, mask);
    applyVersion(m, size, version);
    const s = penalty(m, size);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/** An inline SVG string. `size` is the printed edge length in CSS units. */
export function qrSvg(text, { size = 120, quiet = 4, dark = '#000', light = null, title = '' } = {}) {
  const m = qrMatrix(text);
  const n = m.length;
  const total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c++; continue; }
      let run = 1;
      while (c + run < n && m[r][c + run]) run++;   // merge runs so the path stays small
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" ' +
    'viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img"' +
    (title ? ' aria-label="' + title.replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"') + '>' +
    (light ? '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' : '') +
    '<path fill="' + dark + '" d="' + d + '"/></svg>';
}
