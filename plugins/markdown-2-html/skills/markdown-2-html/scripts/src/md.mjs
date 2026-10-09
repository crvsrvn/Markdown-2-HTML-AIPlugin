// 组装 markdown-it：CommonMark + GFM 表格 + 定义列表 + 脚注 + ==高亮== + 中日韩友好的强调规则 + Markdown-2-HTML 扩展
import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';
import deflist from 'markdown-it-deflist';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import blocks from './plugins/blocks.mjs';
import containers from './plugins/containers.mjs';
import fence from './plugins/fence.mjs';
import headings from './plugins/headings.mjs';
import { renderHeatmap } from './plugins/heatmap.mjs';
import inline from './plugins/inline.mjs';
import media from './plugins/media.mjs';
import records from './plugins/records.mjs';

export function createMd() {
  // html: false：正文里的 < > 都是普通字符，不会混入原始 HTML
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.use(cjkFriendly).use(deflist).use(footnote).use(mark);
  md.use(containers).use(blocks).use(records).use(inline).use(media).use(fence).use(headings);
  md.hsFences = { heatmap: (token, attrs, env) => renderHeatmap(md, token, attrs, env) };
  return md;
}
