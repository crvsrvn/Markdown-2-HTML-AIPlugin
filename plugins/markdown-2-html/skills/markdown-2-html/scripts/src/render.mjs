// Markdown → 单文件 HTML：样式与脚本取自 assets/template.html，PlantUML 预渲染为内联 SVG，无外部依赖
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { createMd } from './md.mjs';
import { renderPlantUml } from './plantuml.mjs';
import { escapeHtml, parseFenceInfo } from './util.mjs';

export const VERSION = '2.0.1';
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
  const body = md.renderer.render(tokens, md.options, env);
  const h1 = tokens.find(t => t.type === 'heading_open' && t.tag === 'h1');
  const title = front.title ?? tokens[tokens.indexOf(h1) + 1]?.content ?? basename(mdPath, '.md');
  const css = front.css ? readFileSync(resolve(dirname(resolve(mdPath)), front.css), 'utf8') : '';
  const sourceRef = outPath ? relative(dirname(resolve(outPath)), resolve(mdPath)).replace(/\\/g, '/') : basename(mdPath);
  return page({ title, toc: front.toc ?? [2, 3], body, css, source: sourceRef });
}
