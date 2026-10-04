// 标题：自动序号（h2 “1.”、h3 “1.1”、h4 “1.1.1”）、id、# 锚点；页内交叉引用 [](#id) 自动填目标序号
import { escapeHtml } from '../util.mjs';

const htmlToken = (state, html) => Object.assign(new state.Token('html_inline', '', 0), { content: html });

function number(state) {
  if (state.inlineMode) return;             // renderInline 也会跑核心规则，不能重置标题表
  const t = state.tokens;
  const numbering = state.env.front?.numbering !== false;
  const counters = [0, 0, 0, 0, 0, 0, 0];
  const parents = [];                       // 各级最近的标题：{ id, children }
  const used = new Set();
  const registry = state.env.headings = new Map();

  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'heading_open') continue;
    const open = t[i], inline = t[i + 1], meta = open.meta ?? {};
    const level = +open.tag[1];
    const text = inline.children.filter(c => c.type === 'text' || c.type === 'code_inline').map(c => c.content).join('');
    if (level === 1) {
      open.attrSet('id', meta.id ?? 'top');
      used.add(open.attrGet('id'));
      continue;
    }
    const numbered = numbering && !meta.classes?.includes('nonum');
    let num = null;
    if (numbered) {
      counters[level]++;
      counters.fill(0, level + 1);
      num = meta.attrs?.n ?? counters.slice(2, level + 1).join('.');
    }
    const parent = parents[level - 1];
    if (parent) parent.children++;
    let id = meta.id;
    if (!id && meta.idFromParent && parent) id = `${parent.id}-${parent.children}`;
    if (!id) id = num ? 's' + num.replace(/\./g, '-') : `h-${i}`;
    if (used.has(id)) throw new Error(`标题 id 重复：#${id}（“${text}”）`);
    used.add(id);
    open.attrSet('id', id);
    parents[level] = { id, children: 0 };
    parents.length = level + 1;
    registry.set(id, num ?? text);

    if (num) inline.children.unshift(htmlToken(state, `<span class="hs-num">${level === 2 ? num + '.' : num}</span>`));
    inline.children.push(htmlToken(state, `<a class="hs-anchor" href="#${escapeHtml(id)}" aria-label="本节链接">#</a>`));
  }
}

// 空文字的页内链接填目标序号；目标不存在时报错
function crossRefs(state) {
  const registry = state.env.headings;
  if (!registry) return;
  const missing = new Set();
  for (const block of state.tokens) {
    const ch = block.children;
    if (!ch) continue;
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].type !== 'link_open') continue;
      const href = ch[i].attrGet('href') ?? '';
      if (!href.startsWith('#')) continue;
      const id = decodeURIComponent(href.slice(1));
      if (!registry.has(id) && !state.env.anchors?.has(id)) { missing.add(id); continue; }
      if (ch[i + 1]?.type === 'link_close') {
        const text = new state.Token('text', '', 0);
        text.content = registry.get(id) ?? id;
        ch.splice(i + 1, 0, text);
      }
    }
  }
  if (missing.size) throw new Error(`页内链接的目标不存在：${[...missing].map(x => '#' + x).join('、')}`);
}

export default function headings(md) {
  md.core.ruler.push('hs-number', number);
  md.core.ruler.push('hs-xref', crossRefs);
}
