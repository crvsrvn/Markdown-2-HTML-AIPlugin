// 围栏块：代码 → 可折叠代码块（导出时高亮）；plantuml → 预渲染的 SVG 图；mermaid / svg → 图表视窗
import hljs from 'highlight.js';
import { escapeHtml, parseFenceInfo } from '../util.mjs';

// 围栏语言 → 代码块标签上显示的名称
const LANG_LABELS = {
  cpp: 'C++', c: 'C', csharp: 'C#', cs: 'C#', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript',
  json: 'JSON', jsonl: 'JSON Lines', powershell: 'PowerShell', ps1: 'PowerShell', sh: 'Shell', bash: 'Bash',
  ini: 'INI', python: 'Python', py: 'Python', lua: 'Lua', xml: 'XML', yaml: 'YAML', sql: 'SQL', text: 'Text',
};
const COLLAPSE_LINES = 25;

function highlight(code, lang) {
  const name = lang === 'jsonl' ? 'json' : lang;
  if (name && hljs.getLanguage(name)) return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  return escapeHtml(code);
}

const figure = (inner, caption) =>
  `<figure>${inner}${caption ? `<figcaption><span>${caption}</span></figcaption>` : ''}</figure>\n`;

// 直接内联 PlantUML 的 SVG：去掉处理指令，id 加前缀，避免同页多图 id 冲突；白底图用浅色底板
function inlineSvg(svg, prefix, label) {
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  let out = svg.replace(/<\?[^?]*\?>/g, '');
  for (const id of ids) {
    const re = new RegExp(`(\\sid="|url\\(#|href="#)${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[")])`, 'g');
    out = out.replace(re, `$1${prefix}${id}`);
  }
  out = out.replace(/^<svg\b/, `<svg role="img" aria-label="${escapeHtml(label)}"`);
  return `<div class="hs-zoom" data-plate="light">${out}</div>`;
}

function renderCode(token, lang, attrs, md) {
  const code = token.content.replace(/\n$/, '');
  const lines = code.split('\n').length;
  const open = attrs.open === true ? true : attrs.closed === true ? false : lines <= COLLAPSE_LINES;
  const label = attrs.label ?? LANG_LABELS[lang] ?? (lang || 'Text');
  const meta = `${lines} 行${attrs.title ? ' · ' + md.renderInline(attrs.title) : ''}`;
  return `<details class="hs-code"${open ? ' open' : ''}><summary><span class="hs-code-lang">${escapeHtml(label)}</span>`
    + `<span class="hs-code-meta">${meta}</span></summary><pre><code>${highlight(code, lang)}</code></pre></details>\n`;
}

export default function fence(md) {
  md.renderer.rules.fence = (tokens, idx, opts, env) => {
    const token = tokens[idx];
    const { lang, attrs } = parseFenceInfo(token.info);
    const caption = attrs.caption ? md.renderInline(attrs.caption) : '';
    if (lang === 'plantuml-include') return '';
    if (lang === 'plantuml') {
      const svg = env.plantuml?.get(token);
      if (!svg) throw new Error('PlantUML 图未预渲染（render() 需先调用 prepare）');
      env.figureCount = (env.figureCount ?? 0) + 1;
      return figure(inlineSvg(svg, `f${env.figureCount}-`, attrs.alt ?? attrs.caption ?? 'PlantUML 图'), caption);
    }
    if (lang === 'mermaid') return figure(`<pre class="mermaid">${escapeHtml(token.content)}</pre>`, caption);
    if (lang === 'svg') return figure(token.content.trim(), caption);
    if (md.hsFences?.[lang]) return md.hsFences[lang](token, attrs, env);
    return renderCode(token, lang, attrs, md);
  };
}
