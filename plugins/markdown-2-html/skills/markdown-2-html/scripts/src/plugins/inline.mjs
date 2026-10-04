// 行内扩展：:ok[完成] 状态标签、:m[实] 图例记号、:kbd[Shift]、:k[会议] 标签字、:icon[warn]，以及链接属性 [文字](url){.pill .warn}
import { KINDS, escapeHtml, parseAttrs } from '../util.mjs';

const NAMES = new Set([...KINDS, 'm', 'kbd', 'k', 'icon']);

function directive(state, silent) {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x3a /* : */) return false;
  const prev = start > 0 ? state.src[start - 1] : '';
  if (/[A-Za-z0-9:]/.test(prev)) return false;
  const m = /^:([a-z]+)\[/.exec(state.src.slice(start, start + 12));
  if (!m || !NAMES.has(m[1])) return false;
  const labelStart = start + m[1].length + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, labelStart - 1, true);
  if (labelEnd < 0) return false;
  if (!silent) {
    const open = state.push('hs_dir_open', '', 1);
    open.meta = { name: m[1], label: state.src.slice(labelStart, labelEnd) };
    if (m[1] !== 'icon') {
      const oldMax = state.posMax;
      state.pos = labelStart;
      state.posMax = labelEnd;
      state.md.inline.tokenize(state);
      state.posMax = oldMax;
    }
    state.push('hs_dir_close', '', -1).meta = { name: m[1] };
  }
  state.pos = labelEnd + 1;
  return true;
}

// 链接后紧跟的 {.pill .warn}：类名里的语义色转成 data-kind，pill 转成 hs-pill
function linkAttrs(state) {
  for (const block of state.tokens) {
    const ch = block.children;
    if (!ch) continue;
    const stack = [];
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].type === 'link_open') stack.push(ch[i]);
      if (ch[i].type !== 'link_close') continue;
      const open = stack.pop();
      const next = ch[i + 1];
      const m = next?.type === 'text' && /^\{(\.[^{}]*)\}/.exec(next.content);
      if (!m) continue;
      next.content = next.content.slice(m[0].length);
      for (const c of parseAttrs(m[1]).classes) {
        if (KINDS.includes(c)) open.attrSet('data-kind', c);
        else open.attrJoin('class', c === 'pill' ? 'hs-pill' : c);
      }
    }
  }
}

export default function inline(md) {
  md.inline.ruler.before('emphasis', 'hs-directive', directive);
  md.core.ruler.after('inline', 'hs-link-attrs', linkAttrs);

  md.renderer.rules.hs_dir_open = (tokens, idx, opts, env) => {
    const { name, label } = tokens[idx].meta;
    if (KINDS.includes(name)) return `<span class="hs-tag" data-kind="${name}">`;
    if (name === 'kbd') return '<kbd>';
    if (name === 'k') return '<span class="hs-k">';
    if (name === 'icon') return `<i class="hs-ico" data-icon="${escapeHtml(label)}"></i>`;
    const mark = env.front?.marks?.[label];
    if (!mark) throw new Error(`图例记号 :m[${label}] 没有在文件头 marks 里声明`);
    return `<span class="hs-mark" data-kind="${mark.kind}" title="${escapeHtml(mark.title)}">`;
  };
  md.renderer.rules.hs_dir_close = (tokens, idx) => {
    const { name } = tokens[idx].meta;
    return name === 'kbd' ? '</kbd>' : name === 'icon' ? '' : '</span>';
  };

  // 外链统一在新标签打开
  const linkOpen = md.renderer.rules.link_open ?? ((t, i, o, e, self) => self.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    if (/^https?:/.test(tokens[idx].attrGet('href') ?? '')) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
    }
    return linkOpen(tokens, idx, opts, env, self);
  };
}
