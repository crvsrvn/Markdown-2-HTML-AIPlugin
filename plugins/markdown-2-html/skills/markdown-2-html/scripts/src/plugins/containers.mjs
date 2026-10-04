// 容器：:::details 标题、::::cards / :::card 标题，以及只加类名的 :::qa / :::src / :::muted / :::lead（见 blocks.mjs）
import container from 'markdown-it-container';

const titleOf = (md, token, name) => md.renderInline(token.info.trim().slice(name.length).trim());

export default function containers(md) {
  md.use(container, 'details', {
    render: (tokens, idx) => tokens[idx].nesting === 1
      ? `<details><summary>${titleOf(md, tokens[idx], 'details')}</summary>\n`
      : '</details>\n',
  });
  md.use(container, 'cards', {
    render: (tokens, idx) => tokens[idx].nesting === 1 ? '<div class="hs-cards">\n' : '</div>\n',
  });
  md.use(container, 'card', {
    render: (tokens, idx) => tokens[idx].nesting === 1
      ? `<div class="hs-card"><p class="hs-card-t">${titleOf(md, tokens[idx], 'card')}</p>\n`
      : '</div>\n',
  });
  for (const name of ['qa', 'src', 'muted', 'lead']) md.use(container, name);
}
