// 对比原页面与重新导出的页面：按类别抽取语义单元（标题、段落、列表项、表格、代码、提示块、标签、链接…），逐项比对
import { parseHTML } from 'linkedom';

const norm = s => s.replace(/\s+/g, ' ').trim();

function ownText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('ul, ol, .hs-num, .hs-anchor').forEach(n => n.remove());
  return norm(clone.textContent);
}

function extract(html) {
  const { document } = parseHTML(html);
  const main = document.querySelector('main.hs-doc');
  const all = sel => [...main.querySelectorAll(sel)];
  const kindOf = el => el.dataset.kind ?? '';
  return {
    title: [norm(document.querySelector('title')?.textContent ?? '')],
    tocLevels: [main.dataset.tocLevels ?? '2,3'],
    headings: all('h1, h2, h3, h4, h5, h6').map(h => `${h.tagName}|${h.id}|${norm(h.querySelector('.hs-num')?.textContent ?? '')}|${ownText(h)}`),
    paragraphs: all('p').filter(p => !p.closest('figure, .gdc-legend, .hs-heat-legend') && !p.matches('.gdc-legend, .hs-heat-legend')).map(p => norm(p.textContent)),
    listItems: all('li').map(ownText),
    tables: all('table').map(t => [...t.querySelectorAll('caption, tr')].map(r => [...(r.children.length ? r.children : [r])].map(c => norm(c.textContent)).join(' | ')).join(' / ')),
    code: all('pre').map(p => p.textContent.replace(/\r\n/g, '\n').replace(/\s+$/, '')),
    codeLabels: all('details.hs-code > summary').map(s => norm(s.querySelector('.hs-code-lang')?.textContent ?? '')),
    callouts: all('.hs-callout').map(c => `${kindOf(c)}|${norm(c.querySelector('.hs-callout-title')?.textContent ?? '')}`),
    tags: all('.hs-tag').map(t => `${kindOf(t)}|${norm(t.textContent)}`),
    marks: all('.hs-mark').map(m => `${kindOf(m)}|${m.getAttribute('title')}|${norm(m.textContent)}`),
    links: all('a[href]').filter(a => !a.matches('.hs-anchor')).map(a => `${a.getAttribute('href')}|${norm(a.textContent)}|${a.dataset.kind ?? ''}`),
    strong: all('strong').map(s => norm(s.textContent)),
    mark: all('mark').map(s => norm(s.textContent)),
    code_inline: all('code').filter(c => !c.closest('pre')).map(c => c.textContent),
    kbd: all('kbd').map(k => k.textContent),
    defs: all('dt, dd').map(d => `${d.tagName}|${norm(d.textContent)}`),
    dlClasses: all('dl').map(d => [...d.classList].sort().join('.')),
    details: all('details:not(.hs-code) > summary').map(s => norm(s.textContent)),
    figures: all('figure').map(f => norm(f.querySelector('figcaption')?.textContent ?? '')),
    heat: all('td[data-heat]').map(td => `${td.dataset.heat}|${td.querySelector('a')?.getAttribute('href')}|${td.querySelector('a')?.getAttribute('title')}`),
  };
}

export function compare(origHtml, newHtml) {
  const a = extract(origHtml), b = extract(newHtml);
  const report = [];
  let ok = true;
  for (const key of Object.keys(a)) {
    const x = a[key], y = b[key];
    let first = -1;
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { first = i; break; }
    if (first < 0) { report.push(`  ✓ ${key}：${x.length}`); continue; }
    ok = false;
    const diffs = x.map((v, i) => v !== y[i]).filter(Boolean).length;
    report.push(`  ✗ ${key}：原 ${x.length} / 新 ${y.length}，不同 ${diffs} 处，首处 #${first}`);
    report.push(`      原：${JSON.stringify(x[first])?.slice(0, 400)}`);
    report.push(`      新：${JSON.stringify(y[first])?.slice(0, 400)}`);
  }
  return { ok, report };
}

