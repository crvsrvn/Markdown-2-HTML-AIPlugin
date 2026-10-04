// ```heatmap 热力表：正文只写 CSV 数字，分档着色、每格链接与悬停说明、竖排表头、图例都在渲染时生成
//
//   ```heatmap plain=2 bins=2,5,9,15 total=合计 row-link=#y{row} cell-link=#y{row}-{n} tip="{row} · {col}：{v} 场" legend="色块深浅 = …" note="点击…"
//   年份,合计,其中渲染向,引擎架构与工具链,…
//   2026,107,18,8,12,…            ← 空格表示 0
//   ```
//   plain：标签列之后不着色的列数；bins：前 4 档的上限；{n}：本行第几个非空着色格
import { escapeHtml } from '../util.mjs';

const csvRow = line => {
  const cells = [];
  for (const m of line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)) cells.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
  return cells;
};
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function renderHeatmap(md, token, attrs, env) {
  const lines = token.content.replace(/\r\n/g, '\n').trim().split('\n');
  const [head, ...rows] = lines.map(csvRow);
  const plain = +(attrs.plain ?? 0);
  const bins = String(attrs.bins ?? '').split(',').filter(Boolean).map(Number);
  const heatOf = v => { const i = bins.findIndex(b => v <= b); return i < 0 ? bins.length + 1 : i + 1; };
  const ids = env.headings ?? new Map();
  const target = href => {
    if (href.startsWith('#') && !ids.has(href.slice(1))) throw new Error(`热力表链接的目标不存在：${href}`);
    return escapeHtml(href);
  };

  let html = `<div class="hs-table hs-heat${attrs.class ? ' ' + attrs.class : ''}"><table>\n<thead><tr><th>${escapeHtml(head[0])}</th>`
    + head.slice(1).map(h => `<th class="hs-v"><span>${escapeHtml(h)}</span></th>`).join('') + '</tr></thead>\n<tbody>\n';
  for (const r of rows) {
    const row = r[0];
    const isTotal = row === attrs.total;
    const label = isTotal || !attrs['row-link'] ? escapeHtml(row) : `<a href="${target(fill(attrs['row-link'], { row }))}">${escapeHtml(row)}</a>`;
    let n = 0;
    const cells = r.slice(1).map((v, k) => {
      if (!v.trim()) return '<td></td>';
      if (k < plain) return isTotal ? `<td><strong>${v}</strong></td>` : `<td>${v}</td>`;
      if (isTotal) return `<td>${v}</td>`;
      n++;
      const tip = attrs.tip ? ` title="${escapeHtml(fill(attrs.tip, { row, col: head[k + 1], v }))}"` : '';
      const link = attrs['cell-link'] ? target(fill(attrs['cell-link'], { row, n })) : null;
      const inner = link ? `<a href="${link}"${tip}>${v}</a>` : v;
      return `<td data-heat="${heatOf(+v)}">${inner}</td>`;
    });
    html += `<tr${isTotal ? ' class="hs-total"' : ''}><td>${isTotal ? `<strong>${label}</strong>` : label}</td>${cells.join('')}</tr>\n`;
  }
  html += '</tbody></table></div>\n';

  if (bins.length) {
    const ranges = bins.map((b, i) => [i ? bins[i - 1] + 1 : 1, b]);
    const labels = ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).concat(`≥${bins.at(-1) + 1}`);
    html += '<p class="hs-heat-legend">'
      + (attrs.legend ? `<span class="hs-k">${md.renderInline(attrs.legend)}</span>` : '')
      + labels.map((l, i) => `<span class="hs-sw" data-heat="${i + 1}">${l}</span>`).join('')
      + (attrs.note ? `<span class="hs-k">${md.renderInline(attrs.note)}</span>` : '') + '</p>\n';
  }
  return html;
}
