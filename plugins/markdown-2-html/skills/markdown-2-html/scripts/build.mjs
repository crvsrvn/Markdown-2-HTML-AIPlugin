// 打包导出工具为 dist/m2h.mjs，并收集被打包的第三方包的许可证到 dist/THIRD_PARTY_LICENSES.txt
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [join(ROOT, 'src', 'm2h.mjs')],
  outfile: join(ROOT, 'dist', 'm2h.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  legalComments: 'none',
  metafile: true,
  banner: { js: "import { createRequire as __m2hRequire } from 'node:module'; const require = __m2hRequire(import.meta.url);" },
});

// 从打包清单里找出用到的 npm 包（含嵌套依赖）
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
  if (m) packages.add(input.replace(/\\/g, '/').slice(0, m.index) + 'node_modules/' + m[1]);
}

const sections = [];
for (const dir of [...packages].sort()) {
  const pkgDir = join(ROOT, dir);
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const file = readdirSync(pkgDir).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const text = file ? readFileSync(join(pkgDir, file), 'utf8').trim() : `License: ${pkg.license ?? '未声明'}`;
  sections.push(`${pkg.name}@${pkg.version}（${pkg.license ?? '未声明'}）\n${'-'.repeat(60)}\n${text}`);
}
const plantuml = join(ROOT, 'vendor', 'PLANTUML-LICENSE.txt');
if (existsSync(plantuml)) sections.push(`PlantUML 官方 TeaVM 引擎（vendor/plantuml.js，@plantuml/core 1.2026.8）\n${'-'.repeat(60)}\n${readFileSync(plantuml, 'utf8').trim()}`);

writeFileSync(join(ROOT, 'dist', 'THIRD_PARTY_LICENSES.txt'),
  `Markdown-2-HTML 的 dist/m2h.mjs 与 vendor/ 包含以下第三方组件：\n\n${sections.join('\n\n\n')}\n`);
console.log(`dist/m2h.mjs 已生成；第三方许可证 ${sections.length} 份`);
