/**
 * QR encoder — byte mode, error-correction level M, versions 1–10 (up to 213
 * bytes). Browser-safe: no node: imports, no dependencies (the repo adds none
 * for this; `qr.test.ts` pins the output against fixtures generated with the
 * `qrcode` npm package so a table typo cannot ship silently).
 *
 * Only what the top-up page needs: a payment URI or address is ASCII and well
 * under 213 bytes, and level M (≈15% recovery) is the usual choice for a screen
 * QR. Anything longer throws rather than silently truncating.
 */

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  size: number;
  /** `modules[y][x]` — true is a dark module. */
  modules: boolean[][];
  version: number;
}

/** Error-correction level M, per version: EC codewords per block, then [block count, data codewords per block][]. */
const EC_M: Record<number, { ecPerBlock: number; groups: Array<[number, number]> }> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
  7: { ecPerBlock: 18, groups: [[4, 31]] },
  8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
};

/** Alignment-pattern centre coordinates per version (version 1 has none). */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const MAX_VERSION = 10;

// ---------- GF(256), primitive polynomial 0x11d ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `n` error-correction codewords. */
function generatorPoly(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed–Solomon remainder: the EC codewords for one block. */
function ecCodewords(data: number[], count: number): number[] {
  const gen = generatorPoly(count);
  const rem = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < count; i += 1) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ---------- bit stream ----------
class Bits {
  readonly bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }
}

function characterCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function totalDataCodewords(version: number): number {
  return EC_M[version].groups.reduce((sum, [blocks, data]) => sum + blocks * data, 0);
}

/** Smallest version that fits `byteLength` bytes in byte mode at level M. */
function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= MAX_VERSION; v += 1) {
    const capacity = Math.floor((totalDataCodewords(v) * 8 - 4 - characterCountBits(v)) / 8);
    if (byteLength <= capacity) return v;
  }
  throw new Error(
    `QR payload too long: ${byteLength} bytes (limit ${Math.floor((totalDataCodewords(MAX_VERSION) * 8 - 4 - characterCountBits(MAX_VERSION)) / 8)} at version ${MAX_VERSION}, level M)`,
  );
}

/** UTF-8 bytes, so a non-ASCII payload still encodes correctly. */
function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

/** Data codewords for the whole symbol: header, payload, terminator, pad bytes. */
function dataCodewords(bytes: number[], version: number): number[] {
  const total = totalDataCodewords(version);
  const bits = new Bits();
  bits.push(0b0100, 4); // byte mode
  bits.push(bytes.length, characterCountBits(version));
  for (const b of bytes) bits.push(b, 8);
  const capacityBits = total * 8;
  const terminator = Math.min(4, capacityBits - bits.bits.length);
  bits.push(0, terminator);
  while (bits.bits.length % 8 !== 0) bits.bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.bits.length; i += 8) {
    let word = 0;
    for (let j = 0; j < 8; j += 1) word = (word << 1) | bits.bits[i + j];
    words.push(word);
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; words.length < total; i += 1) words.push(PAD[i % 2]);
  return words;
}

/** Split into blocks, add EC, then interleave data and EC codewords. */
function interleave(words: number[], version: number): number[] {
  const { ecPerBlock, groups } = EC_M[version];
  const dataBlocks: number[][] = [];
  let offset = 0;
  for (const [blocks, perBlock] of groups) {
    for (let b = 0; b < blocks; b += 1) {
      dataBlocks.push(words.slice(offset, offset + perBlock));
      offset += perBlock;
    }
  }
  const ecBlocks = dataBlocks.map((block) => ecCodewords(block, ecPerBlock));
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// ---------- matrix ----------
type Grid = Array<Array<boolean | null>>;

function placeFinder(grid: Grid, reserved: boolean[][], row: number, col: number) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= grid.length || x < 0 || x >= grid.length) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[y][x] = inRing || inCore;
      reserved[y][x] = true;
    }
  }
}

function buildFunctionPatterns(version: number): { grid: Grid; reserved: boolean[][] } {
  const size = 17 + 4 * version;
  const grid: Grid = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  placeFinder(grid, reserved, 0, 0);
  placeFinder(grid, reserved, 0, size - 7);
  placeFinder(grid, reserved, size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    grid[6][i] = i % 2 === 0;
    reserved[6][i] = true;
    grid[i][6] = i % 2 === 0;
    reserved[i][6] = true;
  }

  // Alignment patterns, skipping the three finder corners.
  const centres = ALIGNMENT[version];
  for (const cy of centres) {
    for (const cx of centres) {
      const nearFinder =
        (cy <= 8 && cx <= 8) || (cy <= 8 && cx >= size - 9) || (cy >= size - 9 && cx <= 8);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          grid[cy + r][cx + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          reserved[cy + r][cx + c] = true;
        }
      }
    }
  }

  // Dark module and the format-information areas.
  grid[size - 8][8] = true;
  reserved[size - 8][8] = true;
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  // Version information (version 7 and up).
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        reserved[i][size - 11 + j] = true;
        reserved[size - 11 + j][i] = true;
      }
    }
  }
  return { grid, reserved };
}

function placeData(grid: Grid, reserved: boolean[][], codewords: number[]) {
  const size = grid.length;
  let bitIndex = 0;
  const nextBit = (): boolean => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex += 1;
    return bit === 1;
  };
  let upward = true;
  let right = size - 1;
  while (right >= 1) {
    if (right === 6) right = 5; // column 6 is the vertical timing pattern
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (reserved[y][x]) continue;
        grid[y][x] = nextBit();
      }
    }
    upward = !upward;
    right -= 2;
  }
}

const MASKS: Array<(y: number, x: number) => boolean> = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/** 15-bit BCH format information for level M and the given mask. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // 00 = level M
  let value = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >> i) & 1) value ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

/** 18-bit BCH version information (version 7 and up). */
function versionBits(version: number): number {
  let value = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    // G(18,6) generator 0x1f25; its top bit sits at position 12.
    if ((value >> i) & 1) value ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | value;
}

function applyFormatAndVersion(grid: Grid, version: number, mask: number) {
  const size = grid.length;
  const fmt = formatBits(mask);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((fmt >> i) & 1) === 1;
    // Column 8: bits 0–7 run down the top-left corner (skipping the timing row),
    // bits 8–14 run up the bottom-left corner.
    if (i < 6) grid[i][8] = bit;
    else if (i < 8) grid[i + 1][8] = bit;
    else grid[size - 15 + i][8] = bit;
    // Row 8: bits 0–7 from the right edge inwards, bits 8–14 across the top-left.
    if (i < 8) grid[8][size - i - 1] = bit;
    else if (i === 8) grid[8][15 - i] = bit;
    else grid[8][15 - i - 1] = bit;
  }
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      grid[a][b] = bit;
      grid[b][a] = bit;
    }
  }
}

/** Penalty score (ISO/IEC 18004 §8.8.2) used to pick the mask. */
function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;
  const run = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i += 1) {
      let count = 1;
      for (let j = 1; j < size; j += 1) {
        if (get(i, j) === get(i, j - 1)) {
          count += 1;
        } else {
          if (count >= 5) score += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) score += 3 + (count - 5);
    }
  };
  run((i, j) => modules[i][j]);
  run((i, j) => modules[j][i]);
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const v = modules[y][x];
      if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) score += 3;
    }
  }
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const rev = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (get: (k: number) => boolean, at: number, pat: boolean[]) =>
    pat.every((p, k) => get(at + k) === p);
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j + 11 <= size; j += 1) {
      if (matches((k) => modules[i][k], j, pattern) || matches((k) => modules[i][k], j, rev)) score += 40;
      if (matches((k) => modules[k][i], j, pattern) || matches((k) => modules[k][i], j, rev)) score += 40;
    }
  }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark += 1;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Encode `text` as a QR symbol (byte mode, level M). Throws if it does not fit version 10. */
export function encodeQr(text: string): QrMatrix {
  if (!text) throw new Error("QR payload is empty");
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length);
  const codewords = interleave(dataCodewords(bytes, version), version);

  // Each candidate is scored as a finished symbol — format and version bits
  // included — and the lowest penalty wins (ISO/IEC 18004 §8.8.2).
  let best: { modules: boolean[][]; score: number } | null = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const { grid, reserved } = buildFunctionPatterns(version);
    placeData(grid, reserved, codewords);
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid.length; x += 1) {
        if (!reserved[y][x] && MASKS[mask](y, x)) grid[y][x] = !grid[y][x];
      }
    }
    applyFormatAndVersion(grid, version, mask);
    const modules = grid.map((row) => row.map((cell) => cell === true));
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, score };
  }
  return { size: best!.modules.length, modules: best!.modules, version };
}

/**
 * The QR as one SVG path `d` string, one `M…h1v1h-1z` box per dark module, in a
 * viewBox of `size + 2 * quietZone`. Rendering as a single path keeps the DOM to
 * one node instead of hundreds of rects.
 */
export function qrSvgPath(matrix: QrMatrix, quietZone = 2): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y][x]) parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    }
  }
  return parts.join("");
}
