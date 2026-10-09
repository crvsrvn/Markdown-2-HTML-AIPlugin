// 图片与视频：![说明](a.png "图注") 独占一段时导出为 figure，默认宽高取导出时的测量结果（文字接近正文字号），
// 页面上可拖右下角等比缩放；地址是视频文件时导出为页内播放器
import { escapeHtml } from '../util.mjs';

const VIDEO = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;

export const isVideo = src => VIDEO.test(src.replace(/[?#].*$/, ''));

// 段落里只有一张图片（允许首尾空白）时，去掉段落标签，图片改为块级渲染
function standalone(state) {
  const tokens = state.tokens;
  for (let i = 1; i < tokens.length - 1; i++) {
    if (tokens[i].type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
    const media = tokens[i].children.filter(t => !(t.type === 'text' && !t.content.trim()));
    if (media.length !== 1 || media[0].type !== 'image') continue;
    tokens[i].children = media;
    media[0].meta = { ...media[0].meta, block: true };
    tokens[i - 1].hidden = tokens[i + 1].hidden = true;
  }
}

export default function media(md) {
  md.core.ruler.after('inline', 'hs-media', standalone);

  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    const size = env.media?.get(token);
    const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
    let inner;
    if (isVideo(src)) {
      const alt = self.renderInlineAsText(token.children ?? [], opts, env);
      inner = `<video src="${escapeHtml(src)}"${dims} controls preload="metadata"${alt ? ` aria-label="${escapeHtml(alt)}"` : ''}></video>`;
    } else {
      if (size) { token.attrSet('width', String(size.width)); token.attrSet('height', String(size.height)); }
      inner = image(tokens, idx, opts, env, self);
    }
    if (!token.meta?.block) return inner;
    const title = token.attrGet('title');
    const caption = title ? `<figcaption><span>${escapeHtml(title)}</span></figcaption>` : '';
    return `<figure><span class="hs-media">${inner}</span>${caption}</figure>\n`;
  };
}
