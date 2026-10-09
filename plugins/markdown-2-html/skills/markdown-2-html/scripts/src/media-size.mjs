// 媒体默认尺寸：解码图片（视频用 ffmpeg 取一帧），估算其中文字的字号，换算成让文字接近正文字号的显示尺寸
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';

const BODY_FONT_PX = 16;          // 正文字号，与 template.html 的 body 一致
const MAX_PIXELS = 4e6;           // 分析前把大图缩到约 400 万像素以内
const SCALE_RANGE = [0.15, 1.5];  // 最多放大 1.5 倍，避免小字截图被放得发糊
const INK_THRESHOLD = 40;         // 与局部均值相差超过该灰度才算墨迹，滤掉背景纹理与压缩噪点
const LINE_INK_RATIO = 0.9;       // 一行文字的墨迹高度约为字号的 0.9 倍
const LINE_TRIM = 0.1;            // 行高取字形上沿 10% 分位到下沿 90% 分位，排除括号、斜杠、连线等偏高字符

// ---------- 解码为灰度（透明像素按白底合成）----------

const lum = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// 支持非隔行的灰度 / RGB / 调色板 / 带 Alpha，位深 1–16；其他情况返回 null
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') [w, h, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (name === 'PLTE') palette = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!w || !h || !channels || interlace || (type === 3 && !palette)) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  const gray = new Uint8Array(w * h);
  let prev = new Uint8Array(stride), row = new Uint8Array(stride);
  const sample = (x, c) => {
    const i = x * channels + c;
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const v = (row[(i * depth) >> 3] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1), filter = raw[off];
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, v = raw[off + 1 + i];
      row[i] = filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : filter === 4 ? v + paeth(a, b, c) : v;
    }
    for (let x = 0; x < w; x++) {
      let g, alpha = 255;
      if (type === 3) { const p = sample(x, 0) * 3; g = lum(palette[p], palette[p + 1], palette[p + 2]); }
      else if (channels >= 3) { g = lum(sample(x, 0), sample(x, 1), sample(x, 2)); if (channels === 4) alpha = sample(x, 3); }
      else { g = sample(x, 0); if (channels === 2) alpha = sample(x, 1); }
      gray[y * w + x] = (g * alpha + 255 * (255 - alpha)) / 255;
    }
    [prev, row] = [row, prev];
  }
  return { w, h, gray };
}

function decodeJpeg(buf) {
  if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const { width: w, height: h, data } = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return { w, h, gray };
}

// ---------- 估算字号 ----------

// 按整数倍做盒式缩小，返回缩小后的图与倍数
function shrink({ w, h, gray }) {
  const f = Math.max(1, Math.ceil(Math.sqrt((w * h) / MAX_PIXELS)));
  if (f === 1) return { w, h, gray, f };
  const sw = Math.floor(w / f), sh = Math.floor(h / f), out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let sum = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += gray[(y * f + dy) * w + x * f + dx];
    out[y * sw + x] = sum / (f * f);
  }
  return { w: sw, h: sh, gray: out, f };
}

// 比局部均值明显暗 / 明显亮的像素分别视为深色、浅色墨迹，对应深字浅底与浅字深底；
// 分开统计是因为大字笔画旁的底色也会偏离均值，混在一起会把整行字粘成一块
function inkMasks({ w, h, gray }, r = 15) {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let line = 0;
    for (let x = 0; x < w; x++) {
      line += gray[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + line;
    }
  }
  const dark = new Uint8Array(w * h), light = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      const d = gray[y * w + x] - sum / ((x1 - x0) * (y1 - y0));
      if (d < -INK_THRESHOLD) dark[y * w + x] = 1;
      else if (d > INK_THRESHOLD) light[y * w + x] = 1;
    }
  }
  return [dark, light];
}

// 8 连通分量，只保留像字形（或字形部件）的分量
function glyphs(mask, w, h) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), out = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, count = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const p = stack[--top], px = p % w, py = (p - px) / w;
      count++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy, q = ny * w + nx;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
      }
    }
    // 排除方框边线（大而空）、连线与分隔线（细长）、色块（实心）
    const gw = x1 - x0 + 1, gh = y1 - y0 + 1, density = count / (gw * gh);
    if (gh >= 4 && gh <= 160 && gw <= gh * 4 && gw >= gh * 0.1 && density > 0.15 && density < 0.9) out.push({ x0, x1, y0, y1, h: gh });
  }
  return out;
}

const quantile = (sorted, p) => sorted[Math.floor(p * (sorted.length - 1))];

// 把横向相邻、纵向重叠的字形并成文本行，返回 { h: 各行墨迹高度按字形数加权的中位数, n: 参与统计的字形数 }
function lineHeight(gs) {
  gs.sort((a, b) => a.x0 - b.x0);
  const parent = gs.map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < gs.length; i++) {
    const a = gs[i];
    for (let j = i + 1; j < gs.length && gs[j].x0 <= a.x1 + a.h * 0.8; j++) {
      const b = gs[j], overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
      if (overlap >= 0.5 * Math.min(a.h, b.h) && Math.max(a.h, b.h) <= 3 * Math.min(a.h, b.h)) parent[find(j)] = find(i);
    }
  }
  const lines = new Map();
  gs.forEach((g, i) => {
    const r = find(i);
    if (!lines.has(r)) lines.set(r, { tops: [], bottoms: [] });
    lines.get(r).tops.push(g.y0);
    lines.get(r).bottoms.push(g.y1);
  });
  const samples = [...lines.values()].filter(l => l.tops.length >= 3).map(l => {
    const tops = l.tops.sort((a, b) => a - b), bottoms = l.bottoms.sort((a, b) => a - b);
    return { h: quantile(bottoms, 1 - LINE_TRIM) - quantile(tops, LINE_TRIM) + 1, n: tops.length };
  }).sort((a, b) => a.h - b.h);
  const total = samples.reduce((s, l) => s + l.n, 0);
  if (total < 12) return null;
  let acc = 0;
  for (const l of samples) if ((acc += l.n) >= total / 2) return { h: l.h, n: total };
  return null;
}

// 返回图中正文文字的估计字号（原图像素）；深浅两种墨迹里取识别出字形更多的一种；识别不到文字时返回 null
export function estimateFontPx(image) {
  const small = shrink(image);
  const [best] = inkMasks(small).map(mask => lineHeight(glyphs(mask, small.w, small.h)))
    .filter(Boolean).sort((a, b) => b.n - a.n);
  return best ? (best.h * small.f) / LINE_INK_RATIO : null;
}

// ---------- 对外接口 ----------

function videoFrame(path) {
  for (const at of ['2', '0']) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', at, '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
      { maxBuffer: 256 * 1024 * 1024, timeout: 20000 });
    if (!r.error && r.status === 0 && r.stdout.length) return r.stdout;
  }
  return null;
}

// 媒体文件的默认显示尺寸 { width, height, fontPx }；文件读不了或无法解码时返回 null，识别不到文字时按原始尺寸
export function measureMedia(path, isVideo) {
  let image;
  try {
    const buf = isVideo ? videoFrame(path) : readFileSync(path);
    image = buf && (decodePng(buf) ?? decodeJpeg(buf));
  } catch {
    return null;
  }
  if (!image) return null;
  const fontPx = estimateFontPx(image);
  const scale = fontPx ? Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], BODY_FONT_PX / fontPx)) : 1;
  return { width: Math.round(image.w * scale), height: Math.round(image.h * scale), fontPx };
}
