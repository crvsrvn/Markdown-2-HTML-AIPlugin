// 块级改写（在行内解析之前运行）：标题属性、提示块、表格标题、类名容器
import { KINDS, splitTrailingAttrs } from '../util.mjs';

// 标题末尾的 {#id .nonum n="4.1.1"}
function headingAttrs(state) {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'heading_open') continue;
    const inline = t[i + 1];
    const [text, attrs] = splitTrailingAttrs(inline.content);
    if (!attrs) continue;
    inline.content = text;
    t[i].meta = { ...t[i].meta, ...attrs };
  }
}

// 块级元素（便于输出换行）
const blockToken = (state, type, tag, nesting) => Object.assign(new state.Token(type, tag, nesting), { block: true });

// 提示块标题行后补一个空引用行，让标题自成一段，正文可以直接写列表、定义列表等块结构
function calloutTitleBreak(state) {
  state.src = state.src.replace(/^((?:> ?)+)(\[![A-Za-z]+\][^\n]*)\n(?=\1\S)/gm, '$1$2\n$1\n');
}

// GitHub 提示语法的五种类型映射到语义色，这样 README 在 GitHub 上也能正常显示
const GITHUB_ALERTS = { note: 'info', important: 'key', warning: 'warn', caution: 'danger' };
const DEFAULT_TITLES = { info: '说明', tip: '建议', ok: '通过', warn: '注意', danger: '风险', key: '要点', muted: '备注' };

// > [!warn] 标题：引用块第一行是类型和标题，其余是正文；不写标题时用该类型的默认标题
function callouts(state) {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'blockquote_open' || t[i + 1]?.type !== 'paragraph_open') continue;
    const inline = t[i + 2];
    const m = /^\[!(\w+)\][ \t]*([^\n]*)(?:\n([\s\S]*))?$/.exec(inline.content);
    if (!m) continue;
    const kind = GITHUB_ALERTS[m[1].toLowerCase()] ?? m[1].toLowerCase();
    if (!KINDS.includes(kind)) throw new Error(`未知的提示块类型 [!${m[1]}]，可用：${KINDS.join(' ')}`);
    t[i].attrSet('class', 'hs-callout');
    t[i].attrSet('data-kind', kind);
    t[i].meta = { callout: kind };
    t[i + 1].attrSet('class', 'hs-callout-title');
    inline.content = m[2].trim() || DEFAULT_TITLES[kind];
    if (m[3]) {
      // 标题后同一段里剩下的行另起一段
      const open = blockToken(state, 'paragraph_open', 'p', 1);
      const body = new state.Token('inline', '', 0);
      const close = blockToken(state, 'paragraph_close', 'p', -1);
      body.content = m[3];
      body.children = [];
      open.map = body.map = inline.map;
      open.level = close.level = t[i + 1].level;
      body.level = inline.level;
      t.splice(i + 4, 0, open, body, close);
    }
  }
}

// 提示块里的定义列表渲染成键值说明 dl.hs-kv
function calloutKv(state) {
  const stack = [];
  for (const tok of state.tokens) {
    if (tok.type === 'blockquote_open') stack.push(!!tok.meta?.callout);
    else if (tok.type === 'blockquote_close') stack.pop();
    else if (tok.type === 'dl_open' && stack.at(-1)) tok.attrJoin('class', 'hs-kv');
  }
}

// 表格正上方的 “Table: 标题 {.cls}” 段落 → <caption> 与表格容器类名（只认表格上方，避免连续表格时归属不清）
function tableCaptions(state) {
  const t = state.tokens;
  const isCaption = k => t[k]?.type === 'paragraph_open' && /^Table:/.test(t[k + 1].content);
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'table_open' || !isCaption(i - 3)) continue;
    const p = i - 3;
    const [text, attrs] = splitTrailingAttrs(t[p + 1].content.replace(/^Table:\s*/, ''));
    t[i].meta = { classes: attrs?.classes ?? [] };
    const capTokens = [];
    if (text.trim()) {
      const open = blockToken(state, 'caption_open', 'caption', 1);
      const body = new state.Token('inline', '', 0);
      const end = blockToken(state, 'caption_close', 'caption', -1);
      body.content = text.trim();
      body.children = [];
      capTokens.push(open, body, end);
    }
    t.splice(i + 1, 0, ...capTokens);
    t.splice(p, 3);
    i -= 3;
  }
}

// :::qa / :::src / :::muted：不生成外层元素，把类名加到容器里第一个块元素上
const CLASS_WRAPS = ['qa', 'src', 'muted', 'lead'];
function classWraps(state) {
  const t = state.tokens;
  for (let i = t.length - 1; i >= 0; i--) {
    const m = /^container_(\w+)_open$/.exec(t[i].type);
    if (!m || !CLASS_WRAPS.includes(m[1])) continue;
    const name = m[1];
    let depth = 0, j = i;
    for (; j < t.length; j++) {
      if (t[j].type === `container_${name}_open`) depth++;
      else if (t[j].type === `container_${name}_close` && --depth === 0) break;
    }
    t[i + 1]?.attrJoin('class', name === 'muted' ? 'hs-muted' : name);
    t.splice(j, 1);
    t.splice(i, 1);
  }
}

// 文件头的 meta 渲染为 h1 下方的 p.hs-meta
function metaLine(state) {
  const meta = state.env.front?.meta;
  if (!meta) return;
  const t = state.tokens;
  const h1 = t.findIndex(x => x.type === 'heading_open' && x.tag === 'h1');
  if (h1 < 0) return;
  const open = blockToken(state, 'paragraph_open', 'p', 1);
  const body = new state.Token('inline', '', 0);
  const close = blockToken(state, 'paragraph_close', 'p', -1);
  open.attrSet('class', 'hs-meta');
  body.content = String(meta);
  body.children = [];
  t.splice(h1 + 3, 0, open, body, close);
}

export default function blocks(md) {
  md.core.ruler.after('normalize', 'hs-callout-title-break', calloutTitleBreak);
  md.core.ruler.after('block', 'hs-heading-attrs', headingAttrs);
  md.core.ruler.after('hs-heading-attrs', 'hs-callouts', callouts);
  md.core.ruler.after('hs-callouts', 'hs-callout-kv', calloutKv);
  md.core.ruler.after('hs-callout-kv', 'hs-table-captions', tableCaptions);
  md.core.ruler.after('hs-table-captions', 'hs-class-wraps', classWraps);
  md.core.ruler.after('hs-class-wraps', 'hs-meta', metaLine);

  md.renderer.rules.table_open = (tokens, idx) => {
    const cls = ['hs-table', ...(tokens[idx].meta?.classes ?? [])].join(' ');
    return `<div class="${cls}"><table>\n`;
  };
  md.renderer.rules.table_close = () => '</table></div>\n';
}
