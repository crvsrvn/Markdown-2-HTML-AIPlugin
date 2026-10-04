// ```records 条目卡片：每条一张卡片，标题是真正的标题（参与序号、大纲与交叉引用）
//
//   ```records level=4
//   @会议: Game Developers Conference 2026      ← 本块默认值，条目缺省时补上
//
//   title: 英文标题                             ← 必填；id 缺省为 “上级标题 id-序号”
//   sub: 《中文译名》
//   讲者: Xin Ning                              ← 其余键都是“键值事实”，按出现顺序显示
//   links: [视频](https://…){.warn}             ← 渲染为链接胶囊
//   desc: 简介 / note: （无简介时的灰色说明）
//   ```
import { parseFenceInfo } from '../util.mjs';

const SLOTS = new Set(['title', 'id', 'sub', 'links', 'desc', 'note']);

function parseRecords(text) {
  const defaults = [];
  const records = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const fields = [];
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      const m = /^(@?)([^:：]+?):\s?(.*)$/.exec(line);
      if (!m) throw new Error(`records 行格式应为 “键: 值”：${line}`);
      (m[1] ? defaults : fields).push([m[2].trim(), m[3]]);
    }
    if (fields.length) records.push(fields);
  }
  return { defaults, records };
}

function expand(state) {
  const t = state.tokens;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i].type !== 'fence' || parseFenceInfo(t[i].info).lang !== 'records') continue;
    const { attrs } = parseFenceInfo(t[i].info);
    const level = +(attrs.level ?? 4);
    const { defaults, records } = parseRecords(t[i].content);
    const out = [];
    for (const fields of records) {
      const map = new Map(fields);
      if (!map.has('title')) throw new Error(`records 条目缺少 title：${JSON.stringify(fields)}`);
      // 事实：缺省的默认值排在前面，其余按条目里的顺序
      const facts = defaults.filter(([k]) => !map.has(k)).concat(fields.filter(([k]) => !SLOTS.has(k)));
      const tag = 'h' + level;
      const hOpen = new state.Token('heading_open', tag, 1);
      hOpen.meta = map.has('id') ? { id: map.get('id') } : { idFromParent: true };
      const hInline = Object.assign(new state.Token('inline', '', 0), { content: map.get('title'), children: [] });
      const body = new state.Token('hs_record_body', '', 0);
      body.meta = { sub: map.get('sub'), facts, links: map.get('links'), desc: map.get('desc'), note: map.get('note') };
      const hClose = new state.Token('heading_close', tag, -1);
      hOpen.block = hClose.block = true;
      out.push(
        Object.assign(new state.Token('html_block', '', 0), { content: '<article class="hs-rec">\n' }),
        hOpen, hInline, hClose,
        body,
        Object.assign(new state.Token('html_block', '', 0), { content: '</article>\n' }),
      );
    }
    t.splice(i, 1, ...out);
  }
}

export default function recordsPlugin(md) {
  md.core.ruler.after('hs-heading-attrs', 'hs-records', expand);
  md.renderer.rules.hs_record_body = (tokens, idx, opts, env) => {
    const { sub, facts, links, desc, note } = tokens[idx].meta;
    const inline = s => md.renderInline(s, env);
    let html = '';
    if (sub) html += `<p class="hs-rec-sub"><strong>${inline(sub)}</strong></p>\n`;
    if (facts.length) {
      html += '<p class="hs-rec-facts">'
        + facts.map(([k, v]) => `<span><span class="hs-k">${inline(k)}</span>${inline(v)}</span>`).join('') + '</p>\n';
    }
    if (links) {
      const pills = inline(links).replace(/<a (?![^>]*class=)/g, '<a class="hs-pill" ').replace(/<\/a>\s+<a /g, '</a><a ');
      html += `<p class="hs-rec-links">${pills}</p>\n`;
    }
    if (desc) html += `<p class="hs-rec-desc">${inline(desc)}</p>\n`;
    if (note) html += `<p class="hs-rec-desc is-none">${inline(note)}</p>\n`;
    return html;
  };
}
