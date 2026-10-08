// PlantUML 源码 → SVG：官方 @plantuml/core（TeaVM 浏览器构建，vendor/plantuml.js 原样使用）+ @viz-js/viz，不需要 Java。
// 引擎按浏览器设计，这里在 Node 中补上它用到的最小环境：linkedom 的 DOM，以及按本机字体测字的 canvas。
// 结果按引擎版本与源码哈希缓存到系统临时目录，重复导出不再渲染。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { parseHTML } from 'linkedom';
import { measureText } from './fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = '@plantuml/core 1.2026.8';
// v2：旧缓存里可能有带警告的 SVG，换目录使其失效；缓存键另含引擎版本
const CACHE_DIR = join(tmpdir(), 'markdown-2-html', 'plantuml-v2');
const SVG_NS = 'http://www.w3.org/2000/svg';
const originalLog = console.log;

let enginePromise = null;

// 引擎把 Java 的 System.out 映射到 console.log，渲染期间静音
const muted = async fn => {
  console.log = () => {};
  try { return await fn(); } finally { console.log = originalLog; }
};

// canvas 2D 上下文的替身：只实现引擎用到的 font 与 measureText
function measureContext() {
  let font = { size: 14, family: 'sans-serif', bold: false };
  return {
    set font(value) {
      const m = /^(\S*)\s*([\d.]+)px\s+(.+)$/.exec(value);
      if (m) font = { bold: /bold|[6-9]00/.test(m[1]), size: +m[2], family: m[3] };
    },
    measureText(text) {
      const r = measureText(String(text), font.family, font.size, font.bold)
        ?? { width: String(text).length * font.size * 0.6, ascent: font.size * 0.8, descent: font.size * 0.2 };
      return { width: r.width, actualBoundingBoxAscent: r.ascent, actualBoundingBoxDescent: r.descent, fontBoundingBoxAscent: r.ascent, fontBoundingBoxDescent: r.descent };
    },
  };
}

function installBrowserEnv() {
  const { window, document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
  const ctx = measureContext();
  const createElement = document.createElement.bind(document);
  document.createElement = tag => (tag === 'canvas' ? { getContext: () => ctx } : createElement(tag));
  // linkedom 没有布局：getBBox 返回 0 高度，引擎随即改用 fontBoundingBox 的上下高度
  Object.getPrototypeOf(document.createElementNS(SVG_NS, 'text')).getBBox ??= () => ({ width: 0, height: 0, x: 0, y: 0 });
  // linkedom 没有处理指令节点：用注释暂存，序列化时还原成 <?…?>
  Object.getPrototypeOf(document).createProcessingInstruction = function (target, data) { return this.createComment(`?${target} ${data}?`); };
  globalThis.XMLSerializer = class { serializeToString(node) { return node.toString().replace(/<!--\?([\s\S]*?)\?-->/g, '<?$1?>'); } };
  globalThis.DOMParser = window.DOMParser;
  globalThis.window = globalThis.self = globalThis;
  globalThis.document = document;
}

const loadEngine = () => (enginePromise ??= muted(async () => {
  const vizModule = await import('@viz-js/viz');
  let viz = null;
  globalThis.Viz = { instance: () => (viz ??= vizModule.instance()) };
  installBrowserEnv();
  return import(pathToFileURL(join(ROOT, 'vendor', 'plantuml.js')).href);
}));

const hashOf = text => createHash('sha1').update(text).digest('hex').slice(0, 16);
const decodeText = s => s.replace(/&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// 语法错误时引擎不回调 onError，而是返回一张错误图：从中取出行号与最后一行错误信息
function syntaxError(svg, source) {
  const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => decodeText(m[1]).trim()).filter(Boolean);
  const head = texts.find(t => /^\[From .*\(line \d+\)\s*\]$/.test(t));
  if (!head) return null;
  const line = +/\(line (\d+)\)/.exec(head)[1];
  return `${texts.at(-1)}（第 ${line} 行：${source.split(/\r?\n/)[line - 1]?.trim() ?? ''}）`;
}

// 有警告（如过时语法）时引擎把警告画在图顶部的黄框（#FFDD88 边、#FFFFCC 底）里：取出框中的文字
function drawnWarnings(svg) {
  const m = /^<svg\b[^>]*>\s*(?:<defs\b[^>]*\/>|<defs\b[^>]*>[\s\S]*?<\/defs>)?\s*<g>\s*(<rect\b[^>]*>)((?:\s*<text\b[^>]*>[^<]*<\/text>)+)/.exec(svg);
  if (!m || !/stroke="#FFDD88"/i.test(m[1]) || !/fill="#FFFFCC"/i.test(m[1])) return [];
  return [...m[2].matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(t => decodeText(t[1]).trim());
}

// 渲染单张图，返回 SVG 字符串；语法错误时抛出带行号的异常；有警告时也抛出，因为引擎会把警告画进图里
export async function renderPlantUml(source) {
  const file = join(CACHE_DIR, hashOf(`${ENGINE}\n${source}`) + '.svg');
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const engine = await loadEngine();
  const svg = await muted(() => new Promise((resolve, reject) =>
    engine.renderToString(source.split(/\r?\n/), resolve, message => reject(new Error(`PlantUML 渲染失败：${message}`)))));
  const error = syntaxError(svg, source);
  if (error) throw new Error(`PlantUML 渲染失败：${error}`);
  const warnings = drawnWarnings(svg);
  if (warnings.length) throw new Error(`PlantUML 警告（会画进图里）：\n  ${warnings.join('\n  ')}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, svg);
  return svg;
}

// 解码 SVG 里 <?plantuml-src …?> 内嵌的源码（PlantUML 文本编码：raw deflate + 自定义 64 进制字母表）
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
export function decodePlantUmlSrc(encoded) {
  const bytes = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const [c1, c2, c3, c4] = [0, 1, 2, 3].map(k => ALPHABET.indexOf(encoded[i + k] ?? '0') & 0x3f);
    bytes.push((c1 << 2) | (c2 >> 4), ((c2 & 0xf) << 4) | (c3 >> 2), ((c3 & 0x3) << 6) | c4);
  }
  return inflateRawSync(Buffer.from(bytes), { finishFlush: 2 }).toString('utf8');
}
