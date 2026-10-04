// 迁移：旧版 html-style 页面 → Markdown 正文
//   pumlDir：图里没有内嵌 plantuml-src 时，到该目录按图标题匹配 .puml 源文件
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import yaml from 'js-yaml';
import { decodePlantUmlSrc } from './plantuml.mjs';

const LANG_IDS = {
  'C++': 'cpp', 'C#': 'csharp', JavaScript: 'js', JSON: 'json', 'JSON Lines': 'jsonl', PowerShell: 'powershell',
  Shell: 'sh', Bash: 'bash', INI: 'ini', Python: 'python', Lua: 'lua', XML: 'xml', YAML: 'yaml', SQL: 'sql',
};
const TABLE_CLASS = { cmp: 'lead', 'gdc-cats': 'lead' };     // 原页面特有类 → 预设类；其余丢弃并告警
const DROPPED_CLASSES = new Set(['gdc-appendix']);

const warnings = [];
const warn = msg => { if (!warnings.includes(msg)) warnings.push(msg); };

// ---------- 行内 ----------

const isWordChar = ch => !!ch && /[\p{L}\p{N}]/u.test(ch);

function escapeText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/[*`[\]]/g, '\\$&')
    .replace(/(=)(?==)/g, '\\$1')
    .replace(/~~/g, '\\~\\~')
    .replace(/&(?=#?\w+;)/g, '\\&')
    .replace(/:(?=(?:[a-z]+)\[)/g, '\\:')
    .replace(/_/g, (m, i, str) => (isWordChar(str[i - 1]) && isWordChar(str[i + 1]) ? '_' : '\\_'))
    .replace(/\{(?=[#.]|[\w-]+=)/g, '\\{');
}

const codeSpan = text => {
  const ticks = Math.max(0, ...(text.match(/`+/g) ?? []).map(x => x.length)) + 1;
  const fence = '`'.repeat(ticks);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return fence + pad + text + pad + fence;
};

// 强调符号不能紧贴空白：把首尾空白移到符号外
const wrap = (inner, mark) => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
};

function inline(node, ctx) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += escapeText(child.textContent.replace(/\s+/g, ' ')); continue; }
    if (child.nodeType !== 1) continue;
    const el = child, tag = el.tagName.toLowerCase(), cls = el.classList;
    if (cls.contains('hs-num') || cls.contains('hs-anchor')) continue;
    if (tag === 'strong' || tag === 'b') out += wrap(inline(el, ctx), '**');
    else if (tag === 'em' || tag === 'i' && !cls.contains('hs-ico')) out += wrap(inline(el, ctx), '*');
    else if (tag === 'mark') out += wrap(inline(el, ctx), '==');
    else if (tag === 'code') out += codeSpan(el.textContent);
    else if (tag === 'kbd') out += `:kbd[${inline(el, ctx)}]`;
    else if (tag === 'br') out += ' ';
    else if (tag === 'a') out += link(el, ctx);
    else if (cls.contains('hs-tag')) out += `:${el.dataset.kind ?? 'muted'}[${inline(el, ctx)}]`;
    else if (cls.contains('hs-mark')) {
      const label = el.textContent.trim();
      ctx.marks[label] = { kind: el.dataset.kind, title: el.getAttribute('title') ?? '' };
      out += `:m[${escapeText(label)}]`;
    } else if (cls.contains('gdc-k')) out += `:k[${inline(el, ctx)}]`;
    else if (cls.contains('hs-ico')) out += `:icon[${el.dataset.icon}]`;
    else {
      if (tag !== 'span' || el.className && !cls.contains('gdc-links')) warn(`未识别的行内元素 <${tag} class="${el.className}">，按纯文本处理`);
      out += inline(el, ctx);
    }
  }
  return out;
}

function link(el, ctx) {
  const href = el.getAttribute('href') ?? '';
  const text = inline(el, ctx).trim();
  let attrs = '';
  if (el.classList.contains('gdc-link')) attrs = `{.pill${el.dataset.kind ? ' .' + el.dataset.kind : ''}}`;
  if (href.startsWith('#')) {
    const num = ctx.numbers.get(href.slice(1));
    if (num && text === num) return `[](${href})`;
  }
  const dest = /[\s()<>]/.test(href) ? `<${href.replace(/>/g, '%3E')}>` : href;
  return `[${text}](${dest})${attrs}`;
}

const inlineText = (node, ctx) => inline(node, ctx).replace(/\s+/g, ' ').trim();

// ---------- 块 ----------

const elements = node => [...node.children];
const cssClasses = el => [...el.classList];

function container(name, title, innerLines) {
  const depth = Math.max(2, ...innerLines.map(l => (/^:{3,}/.exec(l)?.[0].length ?? 0)));
  const marker = ':'.repeat(depth + 1);
  return [`${marker}${name}${title ? ' ' + title : ''}`, ...innerLines, marker];
}

const prefixLines = (lines, first, rest = ' '.repeat(first.length)) =>
  lines.map((l, i) => (l === '' ? '' : (i === 0 ? first : rest) + l));

const escapeLineStart = s => s.replace(/^([#>+-]|\d+[.)])(?=\s|$)/, '\\$1');

function paragraph(el, ctx) {
  return [escapeLineStart(inlineText(el, ctx))];
}

function list(el, ctx) {
  const ordered = el.tagName === 'OL';
  let n = +(el.getAttribute('start') ?? 1);
  const out = [];
  for (const li of elements(el)) {
    const marker = ordered ? `${n++}. ` : '- ';
    const blocks = [];
    let text = '';
    const flush = () => { if (text.trim()) blocks.push([escapeLineStart(text.replace(/\s+/g, ' ').trim())]); text = ''; };
    for (const child of li.childNodes) {
      const isBlock = child.nodeType === 1 && /^(UL|OL|P|PRE|DETAILS|TABLE|DIV|BLOCKQUOTE|DL|FIGURE)$/.test(child.tagName);
      if (!isBlock) {
        const tmp = li.ownerDocument.createElement('span');
        tmp.append(child.cloneNode(true));
        text += inline(tmp, ctx);
        continue;
      }
      flush();
      blocks.push(block(child, ctx));
    }
    flush();
    // 紧跟文字的子列表保持紧凑；其他块之间空一行
    const lines = [];
    blocks.forEach((b, i) => { if (i > 0 && !isListLines(b)) lines.push(''); lines.push(...b); });
    out.push(...prefixLines(lines.length ? lines : [''], marker));
  }
  return out;
}
const isListLines = lines => /^(\d+\.|-) /.test(lines[0] ?? '');

function deflist(el, ctx) {
  const out = [];
  for (const item of elements(el)) {
    if (item.tagName === 'DT') { if (out.length) out.push(''); out.push(escapeLineStart(inlineText(item, ctx))); }
    else out.push(': ' + inlineText(item, ctx));
  }
  return out;
}

function table(wrapper, tbl, ctx) {
  const rows = [...tbl.querySelectorAll('tr')];
  const cell = c => inlineText(c, ctx).replace(/\|/g, '\\|') || ' ';
  const head = rows[0];
  const body = rows.slice(1);
  if (rows.some(r => [...r.children].some(c => c.hasAttribute('colspan') || c.hasAttribute('rowspan')))) warn('表格有合并单元格，GFM 无法表达');
  const lines = [
    '| ' + [...head.children].map(cell).join(' | ') + ' |',
    '|' + [...head.children].map(() => '---').join('|') + '|',
    ...body.map(r => '| ' + [...r.children].map(cell).join(' | ') + ' |'),
  ];
  const classes = [...cssClasses(wrapper), ...(wrapper === tbl ? [] : cssClasses(tbl))]
    .filter(c => c !== 'hs-table' && !DROPPED_CLASSES.has(c))
    .map(c => TABLE_CLASS[c] ?? (warn(`表格类名 .${c} 没有对应的预设，已丢弃`), null)).filter(Boolean);
  const caption = tbl.querySelector('caption');
  const capText = caption ? inlineText(caption, ctx) : '';
  const attrs = classes.length ? `{${classes.map(c => '.' + c).join(' ')}}` : '';
  if (capText || attrs) lines.unshift(['Table:', capText, attrs].filter(Boolean).join(' '), '');
  return lines;
}

function codeBlock(el, ctx) {
  const label = el.querySelector('.hs-code-lang')?.textContent.trim() ?? '';
  const meta = el.querySelector('.hs-code-meta')?.textContent.trim() ?? '';
  const code = el.querySelector('pre').textContent.replace(/\n$/, '');
  const lang = LANG_IDS[label] ?? (warn(`代码语言“${label}”没有对应的围栏语言名`), label.toLowerCase());
  const m = /^(\d+) 行(?: · (.*))?$/.exec(meta);
  const lines = code.split('\n').length;
  if (m && +m[1] !== lines) warn(`代码块行数标注 ${m[1]} 与实际 ${lines} 不符（${meta}），导出时按实际行数显示`);
  const title = m ? m[2] : meta;
  const open = el.hasAttribute('open');
  const flag = open === (lines <= 25) ? '' : open ? ' open' : ' closed';
  const info = `${lang}${title ? ` title="${title.replace(/"/g, '\'')}"` : ''}${flag}`;
  return fence(info, code);
}

const fence = (info, body) => {
  const ticks = Math.max(2, ...(body.match(/^`{3,}/gm) ?? []).map(x => x.length)) + 1;
  return ['`'.repeat(ticks) + info, ...body.split('\n'), '`'.repeat(ticks)];
};

function figure(el, ctx) {
  const img = el.querySelector('img');
  const caption = el.querySelector('figcaption');
  const capText = caption ? inlineText(caption, ctx) : '';
  if (!img) { warn('figure 里没有 img，已跳过'); return []; }
  const src = img.getAttribute('src') ?? '';
  const svg = src.startsWith('data:image/svg+xml;base64,') ? Buffer.from(src.slice(26), 'base64').toString('utf8') : null;
  const alt = img.getAttribute('alt') ?? '';
  const attrs = `${capText ? ` caption="${capText.replace(/"/g, '\'')}"` : ''}${alt && alt !== capText ? ` alt="${alt.replace(/"/g, '\'')}"` : ''}`;
  const out = [];
  let source = null;
  const enc = svg && /<\?plantuml-src (\S+)\?>/.exec(svg);
  if (enc) {
    source = decodePlantUmlSrc(enc[1]).replace(/\n\n[\d.]+\s*$/, '').trimEnd();
    if (!source.startsWith('@start')) source = `@startuml\n${source}\n@enduml`;
  } else if (svg && ctx.pumlDir) {
    const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/\s+/g, '');
    const hit = ctx.pumls.find(p => p.title && text.startsWith(p.title.replace(/\s+/g, '')));
    if (hit) {
      source = hit.source.trimEnd();
      for (const inc of hit.includes) {
        if (ctx.includesEmitted.has(inc.name)) continue;
        ctx.includesEmitted.add(inc.name);
        out.push(...fence(`plantuml-include ${inc.name}`, inc.body.trimEnd()), '');
      }
    }
  }
  if (!source) { warn('有一张图找不到 PlantUML 源码，按原图另存'); return [`<!-- 缺少源码的图：${alt} -->`]; }
  out.push(...fence(`plantuml${attrs}`, source));
  return out;
}

function cards(el, ctx) {
  const out = [];
  for (const card of elements(el)) {
    const title = card.querySelector('.ds-card-t');
    const body = elements(card).filter(x => x !== title).flatMap(x => ['', ...block(x, ctx)]).slice(1);
    out.push(...container('card', title ? inlineText(title, ctx) : '', body), '');
  }
  return container('cards', '', out.slice(0, -1));
}

// GDC 热力表：校验每格的分档、链接、悬停说明都能由规则推出，再输出 CSV
function heatmap(el, legend, ctx) {
  const rows = [...el.querySelectorAll('tr')];
  const head = [...rows[0].children].map(c => c.textContent.trim());
  const opts = { plain: 2, bins: [2, 5, 9, 15], total: '合计', rowLink: '#y{row}', cellLink: '#y{row}-{n}', tip: '{row} · {col}：{v} 场' };
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const heatOf = v => { const i = opts.bins.findIndex(b => v <= b); return i < 0 ? 5 : i + 1; };
  const csv = [head.join(',')];
  for (const r of rows.slice(1)) {
    const cells = [...r.children];
    const row = cells[0].textContent.trim();
    let n = 0;
    cells.slice(1).forEach((c, k) => {
      const v = c.textContent.trim();
      if (!v || k < opts.plain || row === opts.total) return;
      n++;
      const a = c.querySelector('a');
      const expect = { heat: String(heatOf(+v)), href: fill(opts.cellLink, { row, n }), title: fill(opts.tip, { row, col: head[k + 1], v }) };
      const got = { heat: c.dataset.heat, href: a?.getAttribute('href'), title: a?.getAttribute('title') };
      if (JSON.stringify(expect) !== JSON.stringify(got)) throw new Error(`热力表单元格无法由规则推出：${JSON.stringify({ row, k, expect, got })}`);
    });
    csv.push(cells.map(c => c.textContent.trim()).join(','));
  }
  const ks = legend ? [...legend.querySelectorAll('.gdc-k')].map(k => k.textContent.trim()) : [];
  const info = `heatmap plain=${opts.plain} bins=${opts.bins} total=${opts.total} row-link=${opts.rowLink} cell-link=${opts.cellLink} tip="${opts.tip}"`
    + (ks[0] ? ` legend="${ks[0]}"` : '') + (ks[1] ? ` note="${ks[1]}"` : '');
  return fence(info, csv.join('\n'));
}

// GDC 分享条目 → ```records（同一小节的连续条目合成一块，会议取本块最常见的值作默认）
function records(articles, ctx) {
  const items = articles.map(art => {
    const h = art.querySelector('h4, h3, h5');
    const fields = [['title', inlineText(h, ctx)]];
    const expectId = `${ctx.lastHeadingId}-${++ctx.recordIndex}`;
    if (h.id !== expectId) fields.push(['id', h.id]);
    for (const p of elements(art).filter(x => x !== h)) {
      const c = p.className;
      if (c === 'gdc-zh') fields.push(['sub', inlineText(p.querySelector('strong') ?? p, ctx)]);
      else if (c === 'gdc-facts') {
        for (const fact of elements(p)) {
          const key = fact.querySelector('.gdc-k');
          const k = key.textContent.trim();
          key.remove();
          fields.push([k, inlineText(fact, ctx)]);
        }
      } else if (c === 'gdc-links') fields.push(['links', elements(p).map(a => link(a, ctx).replace(/\{\.pill( \.(\w+))?\}$/, (m, x, kind) => (kind ? `{.${kind}}` : ''))).join(' ')]);
      else if (c === 'gdc-desc') fields.push(['desc', inlineText(p, ctx)]);
      else if (c === 'gdc-desc is-none') fields.push(['note', inlineText(p, ctx)]);
      else warn(`条目里未识别的段落 .${c}`);
    }
    return fields;
  });
  const confs = items.map(f => f.find(([k]) => k === '会议')?.[1]).filter(Boolean);
  const top = confs.sort((a, b) => confs.filter(x => x === b).length - confs.filter(x => x === a).length)[0];
  // 渲染时默认值排在事实的最前面，所以只有“会议”本来就是第一个事实时才能省略
  const omittable = fields => fields.find(([k]) => !['title', 'id', 'sub'].includes(k))?.[0] === '会议';
  const useDefault = top && items.every(f => f.some(([k]) => k === '会议') && omittable(f));
  const lines = useDefault ? [`@会议: ${top}`, ''] : [];
  for (const fields of items) {
    const kept = useDefault ? fields.filter(([k, v]) => !(k === '会议' && v === top)) : fields;
    lines.push(...kept.map(([k, v]) => `${k}: ${v}`), '');
  }
  return fence('records', lines.slice(0, -1).join('\n'));
}

function block(el, ctx) {
  const tag = el.tagName.toLowerCase(), cls = el.classList;
  if (/^h[1-6]$/.test(tag)) return heading(el, ctx);
  if (tag === 'p') {
    if (cls.contains('hs-meta')) { ctx.front.meta = inlineText(el, ctx); return []; }
    if (cls.contains('gdc-legend')) return [];                           // 由热力表生成
    if (cls.contains('gdc-conf')) return container('muted', '', paragraph(el, ctx));
    if (cls.contains('src')) return container('src', '', paragraph(el, ctx));
    if (el.className) warn(`段落类名 .${el.className} 没有对应写法，按普通段落处理`);
    return paragraph(el, ctx);
  }
  if (tag === 'ul' || tag === 'ol') return cls.contains('src') ? container('src', '', list(el, ctx)) : list(el, ctx);
  if (tag === 'dl') {
    const lines = deflist(el, ctx);
    return cls.contains('qa') ? container('qa', '', lines) : lines;
  }
  if (tag === 'blockquote') {
    const inner = [];
    if (cls.contains('hs-callout')) {
      const title = el.querySelector(':scope > .hs-callout-title');
      inner.push(`[!${el.dataset.kind}] ${title ? inlineText(title, ctx) : ''}`.trimEnd());
    }
    for (const child of elements(el)) {
      if (child.classList.contains('hs-callout-title')) continue;
      inner.push('', ...block(child, ctx));
    }
    if (cls.contains('hs-callout') && inner[1] === '') inner.splice(1, 1);
    return inner.map(l => (l ? '> ' + l : '>'));
  }
  if (tag === 'div' && cls.contains('hs-table')) {
    const tbl = el.querySelector('table');
    if (cls.contains('gdc-overview')) {
      const legend = el.nextElementSibling?.classList.contains('gdc-legend') ? el.nextElementSibling : null;
      return heatmap(tbl, legend, ctx);
    }
    return table(el, tbl, ctx);
  }
  if (tag === 'table') return table(el, el, ctx);
  if (tag === 'details') {
    if (cls.contains('hs-code')) return codeBlock(el, ctx);
    const summary = el.querySelector(':scope > summary');
    const body = elements(el).filter(x => x !== summary).flatMap(x => ['', ...block(x, ctx)]).slice(1);
    return container('details', summary ? inlineText(summary, ctx) : '', body);
  }
  if (tag === 'pre') return fence('', el.textContent.replace(/\n$/, ''));
  if (tag === 'figure') return figure(el, ctx);
  if (tag === 'div' && cls.contains('ds-grid')) return cards(el, ctx);
  if (tag === 'hr') return ['---'];
  warn(`未识别的块元素 <${tag} class="${el.className}">，按段落处理`);
  return paragraph(el, ctx);
}

// 标题：序号与自动编号一致时不写；id 与自动 id 一致时不写
function heading(el, ctx) {
  const level = +el.tagName[1];
  const text = inlineText(el, ctx);
  if (level === 1) return [`# ${text}`];
  const num = el.querySelector('.hs-num')?.textContent.trim().replace(/\.$/, '') ?? null;
  const attrs = [];
  if (num) {
    ctx.counters[level]++;
    ctx.counters.fill(0, level + 1);
    const auto = ctx.counters.slice(2, level + 1).join('.');
    if (auto !== num) attrs.push(`n="${num}"`);
  } else attrs.push('.nonum');
  const autoId = num ? 's' + num.replace(/\./g, '-') : null;
  if (el.id && el.id !== autoId) attrs.unshift('#' + el.id);
  ctx.lastHeadingId = el.id;
  ctx.recordIndex = 0;
  return [`${'#'.repeat(level)} ${text}${attrs.length ? ' {' + attrs.join(' ') + '}' : ''}`];
}

function loadPumls(dir) {
  if (!dir) return [];
  const files = readdirSync(dir);
  const read = f => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
  return files.filter(f => f.endsWith('.puml')).map(f => {
    const source = read(f);
    const includes = [...source.matchAll(/^!include\s+(\S+)/gm)].map(m => ({ name: m[1], body: read(m[1]) }));
    return { file: f, source, includes, title: /^title\s+(.+)$/m.exec(source)?.[1].trim() };
  });
}

export function convert(html, { pumlDir } = {}) {
  warnings.length = 0;
  const { document } = parseHTML(html);
  const main = document.querySelector('main.hs-doc');
  const ctx = {
    front: {}, marks: {}, numbers: new Map(), counters: [0, 0, 0, 0, 0, 0, 0],
    pumlDir, pumls: loadPumls(pumlDir), includesEmitted: new Set(), lastHeadingId: null, recordIndex: 0,
  };
  for (const h of main.querySelectorAll('h2, h3, h4, h5, h6')) {
    const num = h.querySelector('.hs-num')?.textContent.trim().replace(/\.$/, '');
    if (h.id && num) ctx.numbers.set(h.id, num);
  }
  const title = document.querySelector('title')?.textContent.trim();
  const h1 = main.querySelector('h1');
  if (title && title !== h1?.textContent.trim()) ctx.front.title = title;
  const out = [];
  const kids = elements(main);
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].tagName === 'ARTICLE') {
      const group = [];
      while (kids[i]?.tagName === 'ARTICLE') group.push(kids[i++]);
      i--;
      out.push(records(group, ctx));
      continue;
    }
    const lines = block(kids[i], ctx);
    if (lines.length) out.push(lines);
  }
  const levels = (main.dataset.tocLevels ?? '2,3').split(',').map(Number);
  if (levels.join() !== '2,3') ctx.front.toc = levels;
  if (Object.keys(ctx.marks).length) ctx.front.marks = ctx.marks;
  // toc 写成一行 [2, 3, 4]，marks 每个记号一行
  const yamlText = yaml.dump(ctx.front, { lineWidth: -1, flowLevel: 2 })
    .replace(/^toc:\n((?: {2}- \d+\n)+)/m, (_, items) => `toc: [${items.match(/\d+/g).join(', ')}]\n`);
  const front = Object.keys(ctx.front).length ? `---\n${yamlText.trimEnd()}\n---\n\n` : '';
  return { md: front + out.filter(x => x.length).map(x => x.join('\n')).join('\n\n') + '\n', warnings };
}

