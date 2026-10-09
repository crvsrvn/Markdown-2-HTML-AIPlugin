// Markdown → 单文件 HTML：样式与脚本取自 assets/template.html，PlantUML 预渲染为内联 SVG，无外部依赖
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { createMd } from './md.mjs';
import { measureMedia } from './media-size.mjs';
import { renderPlantUml } from './plantuml.mjs';
import { isVideo } from './plugins/media.mjs';
import { escapeHtml, parseFenceInfo } from './util.mjs';

export const VERSION = '2.3.0';
// 生成标记：读取守卫（hooks/guard.mjs）只拦截带这个标记的 HTML
export const GENERATOR = `Markdown-2-HTML/${VERSION}`;

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(SCRIPTS, '..', 'assets');

// 从模板里原样取出字体链接、样式、回到顶部按钮与脚本，模板是样式的唯一来源
let templateParts = null;
function template() {
  if (templateParts) return templateParts;
  const html = readFileSync(join(ASSETS, 'template.html'), 'utf8');
  const pick = (re, name) => {
    const m = html.match(re);
    if (!m) throw new Error(`template.html 里找不到${name}`);
    return m[0];
  };
  templateParts = {
    fonts: pick(/<link rel="preconnect"[\s\S]*?<link rel="stylesheet"[^>]*>/, '字体链接'),
    style: pick(/<style id="hs-style">[\s\S]*?<\/style>/, ' <style id="hs-style">'),
    top: pick(/<a class="hs-top"[\s\S]*?<\/a>/, '回到顶部按钮'),
    script: pick(/<script id="hs-script">[\s\S]*?<\/script>/, ' <script id="hs-script">'),
    presets: readFileSync(join(ASSETS, 'presets.css'), 'utf8').trim(),
  };
  return templateParts;
}

function splitFrontMatter(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
  return m ? [yaml.load(m[1]) ?? {}, src.slice(m[0].length)] : [{}, src];
}

// 预渲染所有 PlantUML 图；```plantuml-include 名称 定义的片段替换图里的 !include 名称
async function preparePlantUml(tokens, env) {
  const fences = tokens.filter(t => t.type === 'fence');
  const includes = new Map();
  for (const t of fences) {
    const { lang } = parseFenceInfo(t.info);
    if (lang === 'plantuml-include') includes.set(t.info.trim().slice(lang.length).trim(), t.content.trimEnd());
  }
  env.plantuml = new Map();
  for (const t of fences) {
    if (parseFenceInfo(t.info).lang !== 'plantuml') continue;
    const source = t.content.replace(/^[ \t]*!include\s+(\S+)[ \t]*$/gm, (line, name) => {
      if (!includes.has(name)) throw new Error(`PlantUML !include ${name} 没有对应的 plantuml-include 块`);
      return includes.get(name);
    });
    env.plantuml.set(t, await renderPlantUml(source));
  }
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  svg: 'image/svg+xml', bmp: 'image/bmp', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  ogg: 'video/ogg', mov: 'video/quicktime',
};
// 嵌入数据总量上限（base64 字符数）：整页 HTML 是一个字符串，Node 单个字符串最长约 5.3 亿字符
const MAX_EMBED_CHARS = 400e6;

// 本地图片与视频嵌入 HTML（base64），独占一段的再测出让其中文字接近正文字号的默认宽高；外链不嵌入
function prepareMedia(tokens, env, mdPath) {
  env.media = new Map();
  const cache = new Map();
  let total = 0;
  for (const t of tokens) {
    for (const img of t.type === 'inline' ? t.children : []) {
      const src = img.type === 'image' ? img.attrGet('src') : '';
      if (!src || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue;
      const path = resolve(dirname(resolve(mdPath)), decodeURIComponent(src.replace(/[?#].*$/, '')));
      if (!existsSync(path)) throw new Error(`图片或视频文件不存在：${src}（${path}）`);
      const mime = MIME[extname(path).slice(1).toLowerCase()];
      if (!mime) throw new Error(`不支持嵌入的媒体类型：${src}`);
      if (!cache.has(path)) {
        const data = readFileSync(path).toString('base64');
        if ((total += data.length) > MAX_EMBED_CHARS) throw new Error(`嵌入的图片与视频超过 ${MAX_EMBED_CHARS / 1e6 * 0.75} MB，单个 HTML 放不下：${src}`);
        cache.set(path, { mime, data });
      }
      const media = cache.get(path);
      if (img.meta?.block && !('size' in media)) media.size = measureMedia(path, isVideo(src));
      env.media.set(img, media);
    }
  }
}

function page({ title, toc, body, css, source }) {
  const t = template();
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="generator" content="${GENERATOR}">
<meta name="m2h-source" content="${escapeHtml(source)}">
<title>${escapeHtml(title)}</title>
${t.fonts}
${t.style}
<style id="m2h-presets">
${t.presets}
</style>
${css ? `<style>\n${css.trim()}\n</style>\n` : ''}</head>
<body>
<main class="hs-doc" data-toc-levels="${toc.join(',')}">
${body.trim()}
</main>
${t.top}
${t.script}
</body>
</html>
`;
}

// mdPath：Markdown 文件路径；outPath：导出的 HTML 路径（HTML 里记下源文件相对它的路径）
export async function renderDocument(text, { mdPath = 'doc.md', outPath = null } = {}) {
  const [front, source] = splitFrontMatter(text);
  const md = createMd();
  const env = { front };
  const tokens = md.parse(source, env);
  await preparePlantUml(tokens, env);
  prepareMedia(tokens, env, mdPath);
  const body = md.renderer.render(tokens, md.options, env);
  const h1 = tokens.find(t => t.type === 'heading_open' && t.tag === 'h1');
  const title = front.title ?? tokens[tokens.indexOf(h1) + 1]?.content ?? basename(mdPath, '.md');
  const css = front.css ? readFileSync(resolve(dirname(resolve(mdPath)), front.css), 'utf8') : '';
  const sourceRef = outPath ? relative(dirname(resolve(outPath)), resolve(mdPath)).replace(/\\/g, '/') : basename(mdPath);
  return page({ title, toc: front.toc ?? [2, 3], body, css, source: sourceRef });
}
