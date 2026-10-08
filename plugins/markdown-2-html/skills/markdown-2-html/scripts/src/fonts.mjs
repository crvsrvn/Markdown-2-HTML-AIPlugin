// 系统字体：按字体族名找到本机字体文件，测量文字宽度与上下高度（供 PlantUML 引擎的 canvas 测字使用）
// 找不到的字体族、以及字体里缺的字形，都回退到操作系统默认字体链
import { readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import * as fontkit from 'fontkit';

const OS = platform() === 'win32' || platform() === 'darwin' ? platform() : 'linux';

const FONT_DIRS = {
  win32: [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), join(process.env.LOCALAPPDATA ?? homedir(), 'Microsoft', 'Windows', 'Fonts')],
  darwin: ['/System/Library/Fonts', '/Library/Fonts', join(homedir(), 'Library', 'Fonts')],
  linux: ['/usr/share/fonts', '/usr/local/share/fonts', join(homedir(), '.fonts'), join(homedir(), '.local', 'share', 'fonts')],
}[OS];

// 操作系统默认字体链，参照 Java 在各系统上的逻辑字体映射；按顺序取第一个已安装的字体，其余用于补缺字
const DEFAULTS = {
  win32: { sans: ['Arial', 'SimSun', 'Microsoft YaHei'], serif: ['Times New Roman', 'SimSun'], mono: ['Courier New', 'SimSun'] },
  darwin: { sans: ['Helvetica', 'PingFang SC', 'Hiragino Sans GB', 'Arial Unicode MS'], serif: ['Times', 'Songti SC'], mono: ['Courier', 'Menlo', 'PingFang SC'] },
  linux: {
    sans: ['DejaVu Sans', 'Liberation Sans', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei'],
    serif: ['DejaVu Serif', 'Liberation Serif', 'Noto Serif CJK SC'],
    mono: ['DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono CJK SC'],
  },
}[OS];
const LOGICAL = { 'sans-serif': 'sans', sansserif: 'sans', dialog: 'sans', serif: 'serif', monospace: 'mono', monospaced: 'mono' };

let index = null;                  // 小写字体族名 → [{ file, postscriptName, weight, italic }]
const opened = new Map();          // file#postscriptName → fontkit 字体
const chains = new Map();          // "族名|bold" → 字体链

function* fontFiles(dir) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const path = join(dir, name);
    if (/\.(ttf|otf|ttc|otc)$/i.test(name)) yield path;
    else if (OS === 'linux' && !name.includes('.') && statSync(path, { throwIfNoEntry: false })?.isDirectory()) yield* fontFiles(path);
  }
}

// 只记录名字与字重；字体对象用完即弃，避免整机字体常驻内存
function buildIndex() {
  index = new Map();
  for (const file of FONT_DIRS.flatMap(dir => [...fontFiles(dir)])) {
    let faces;
    try { const f = fontkit.openSync(file); faces = f.fonts ?? [f]; } catch { continue; }
    for (const face of faces) {
      const records = face.name?.records ?? {};
      const families = new Set([...Object.values(records.fontFamily ?? {}), ...Object.values(records.preferredFamily ?? {})]);
      const entry = { file, postscriptName: face.postscriptName, weight: face['OS/2']?.usWeightClass ?? 400, italic: /italic|oblique/i.test(face.subfamilyName ?? '') };
      for (const family of families) {
        const key = family.toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(entry);
      }
    }
  }
}

function openFace({ file, postscriptName }) {
  const id = `${file}#${postscriptName}`;
  if (!opened.has(id)) {
    const f = fontkit.openSync(file);
    opened.set(id, f.fonts?.find(x => x.postscriptName === postscriptName) ?? f.fonts?.[0] ?? f);
  }
  return opened.get(id);
}

// 同一族里取字重最接近、优先非斜体的字形
function findFont(family, bold) {
  const faces = index.get(family.toLowerCase());
  if (!faces) return null;
  const target = bold ? 700 : 400;
  const best = faces.reduce((a, b) => (Math.abs(b.weight - target) + b.italic * 1000 < Math.abs(a.weight - target) + a.italic * 1000 ? b : a));
  return openFace(best);
}

function fontChain(familyList, bold) {
  const key = `${familyList}|${bold}`;
  if (!chains.has(key)) {
    if (!index) buildIndex();
    const names = familyList.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const wanted = names.flatMap(n => (LOGICAL[n.toLowerCase()] ? DEFAULTS[LOGICAL[n.toLowerCase()]] : [n]));
    const fonts = [...wanted, ...DEFAULTS.sans].map(n => findFont(n, bold)).filter(Boolean);
    chains.set(key, [...new Set(fonts)]);
  }
  return chains.get(key);
}

// 返回 { width, ascent, descent }（像素）；本机一个可用字体都没有时返回 null
export function measureText(text, familyList, size, bold) {
  const chain = fontChain(familyList, bold);
  if (!chain.length) return null;
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const font = chain.find(f => f.hasGlyphForCodePoint(cp)) ?? chain[0];
    width += font.glyphForCodePoint(cp).advanceWidth * size / font.unitsPerEm;
  }
  const main = chain[0], k = size / main.unitsPerEm;
  return { width, ascent: main.hhea.ascent * k, descent: -main.hhea.descent * k };
}
