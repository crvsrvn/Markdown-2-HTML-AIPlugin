// 渲染器共用的小工具

export const KINDS = ['info', 'tip', 'ok', 'warn', 'danger', 'key', 'muted'];

export const escapeHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 解析 {#id .cls key=value key="v w"} 的内部；返回 { id, classes, attrs }
export function parseAttrs(body) {
  const out = { id: null, classes: [], attrs: {} };
  const re = /#([\w-]+)|\.([\w-]+)|([\w-]+)=(?:"([^"]*)"|(\S+))/g;
  for (const m of body.matchAll(re)) {
    if (m[1]) out.id = m[1];
    else if (m[2]) out.classes.push(m[2]);
    else out.attrs[m[3]] = m[4] ?? m[5];
  }
  return out;
}

// 文本末尾的 {…} 属性块：返回 [去掉属性后的文本, 属性]；没有时属性为 null
export function splitTrailingAttrs(text) {
  const m = /\s*\{([#.][^{}]*|[\w-]+=[^{}]*)\}\s*$/.exec(text);
  return m ? [text.slice(0, m.index), parseAttrs(m[1])] : [text, null];
}

// 围栏信息串：语言 + key="value" / key=value / 单独的开关词
export function parseFenceInfo(info) {
  const lang = (info.match(/^\s*([^\s{]+)/) || [])[1] || '';
  const rest = info.slice(info.indexOf(lang) + lang.length);
  const attrs = {};
  for (const m of rest.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?/g)) attrs[m[1]] = m[2] ?? m[3] ?? true;
  return { lang, attrs };
}

