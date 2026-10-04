// Markdown-2-HTML 命令行
//   build  <doc.md> [-o <out.html>]                 导出单文件 HTML（默认与 .md 同目录同名）
//   check  <doc.md>                                 只检查能否导出（语法、页内链接、PlantUML），不写文件
//   migrate <page.html> <doc.md> [--puml-dir <目录>] 把旧版 html-style 页面转成 Markdown 正文
//   verify <原页面.html> <导出页面.html>             逐项比对两份页面的语义内容
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convert } from './migrate.mjs';
import { GENERATOR, renderDocument } from './render.mjs';
import { compare } from './verify.mjs';

const USAGE = `用法：
  node m2h.mjs build <doc.md> [-o <out.html>]
  node m2h.mjs check <doc.md>
  node m2h.mjs migrate <page.html> <doc.md> [--puml-dir <目录>]
  node m2h.mjs verify <原页面.html> <导出页面.html>`;

function option(args, name) {
  const i = args.indexOf(name);
  return i < 0 ? null : args.splice(i, 2)[1];
}

const kb = text => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`;

async function main([command, ...args]) {
  if (command === 'build' || command === 'check') {
    const out = option(args, '-o');
    const [input] = args;
    if (!input) throw new Error(USAGE);
    const outPath = out ?? resolve(input).replace(/\.md$/i, '') + '.html';
    const html = await renderDocument(readFileSync(input, 'utf8'), { mdPath: input, outPath });
    if (command === 'check') return console.log(`可以导出：${input}`);
    writeFileSync(outPath, html);
    return console.log(`已导出 ${outPath}（${kb(html)}，${GENERATOR}）`);
  }
  if (command === 'migrate') {
    const pumlDir = option(args, '--puml-dir');
    const [input, output] = args;
    if (!input || !output) throw new Error(USAGE);
    const { md, warnings } = convert(readFileSync(input, 'utf8'), { pumlDir });
    writeFileSync(output, md);
    console.log(`已转换 ${output}（${kb(md)}）`);
    for (const w of warnings) console.log(`  警告：${w}`);
    return;
  }
  if (command === 'verify') {
    const [orig, regen] = args;
    if (!orig || !regen) throw new Error(USAGE);
    const { ok, report } = compare(readFileSync(orig, 'utf8'), readFileSync(regen, 'utf8'));
    console.log(`${ok ? '一致' : '有差异'}：${orig} ↔ ${regen}\n${report.join('\n')}`);
    process.exitCode = ok ? 0 : 1;
    return;
  }
  throw new Error(USAGE);
}

main(process.argv.slice(2)).catch(err => {
  console.error(err.message);
  process.exitCode = 2;
});
