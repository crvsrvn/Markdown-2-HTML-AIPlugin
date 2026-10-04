// PlantUML 源码 → SVG：官方 TeaVM 引擎（vendor/plantuml-engine.js，来自 @plantuml/mcp-js）+ @viz-js/viz，不需要 Java。
// 结果按源码哈希缓存到系统临时目录，重复导出不再渲染。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(tmpdir(), 'markdown-2-html', 'plantuml');
const originalLog = console.log;

let enginePromise = null;

// 引擎把 Java 的 System.out 映射到 console.log，渲染期间静音
const muted = async fn => {
  console.log = () => {};
  try { return await fn(); } finally { console.log = originalLog; }
};

const loadEngine = () => (enginePromise ??= muted(async () => {
  const vizModule = await import('@viz-js/viz');
  let viz = null;
  globalThis.Viz = { instance: () => (viz ??= vizModule.instance()) };
  return import(pathToFileURL(join(ROOT, 'vendor', 'plantuml-engine.js')).href);
}));

const hashOf = text => createHash('sha1').update(text).digest('hex').slice(0, 16);

// 渲染单张图，返回 SVG 字符串；语法错误时抛出带行号的异常
export async function renderPlantUml(source) {
  const file = join(CACHE_DIR, hashOf(source) + '.svg');
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const engine = await loadEngine();
  const result = JSON.parse(await muted(() => new Promise(resolve => engine.renderSvg(source, resolve))));
  if (result.valid === false || !result.svg) {
    throw new Error(`PlantUML 渲染失败：${result.errorMessage ?? '未知错误'}（第 ${result.errorLine ?? '?'} 行）`);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, result.svg);
  return result.svg;
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
