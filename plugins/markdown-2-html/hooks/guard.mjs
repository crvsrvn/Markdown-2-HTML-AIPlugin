// PreToolUse 守卫：禁止 AI 读取或修改 Markdown-2-HTML 生成的 HTML（给人看的成品），引导去读写 Markdown 源文件。
// 只拦截 <head> 里带生成标记的 HTML，其他 HTML 不受影响。守卫自身出错时一律放行，不妨碍正常工作。
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const MARKER = /<meta name="generator" content="Markdown-2-HTML\//;
const SOURCE = /<meta name="m2h-source" content="([^"]*)"/;
// 只操作文件本身、不读内容的命令；以及本插件自己的导出 / 校验脚本
const ALLOWED_COMMANDS = /^(ls|dir|rm|del|mv|move|cp|copy|start|explorer|open|xdg-open|stat|touch|Remove-Item|Move-Item|Copy-Item|Rename-Item|Invoke-Item|Get-ChildItem|Test-Path|ii)$/i;
// git 只放行不输出文件内容的子命令（diff、show、blame 等会打印内容，不放行）
const ALLOWED_GIT = /^(add|rm|mv|status|commit|restore|checkout|reset|stash|ls-files|check-ignore)$/;

function head(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4096);
    return buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0));
  } finally {
    closeSync(fd);
  }
}

// Git Bash 路径 /f/x → f:/x
const nativePath = (p, cwd) => {
  const unquoted = p.replace(/^['"]|['"]$/g, '').replace(/^\/([a-zA-Z])\//, '$1:/');
  return isAbsolute(unquoted) ? unquoted : resolve(cwd ?? '.', unquoted);
};

// 是生成的 HTML 时返回其路径与源文件，否则返回 null；git 的 “版本:路径” 写法取冒号后的路径
function generated(path, cwd) {
  if (!path || !/\.html?$/i.test(path.replace(/['"]$/, ''))) return null;
  const revPath = /^['"]?[^:'"\\/]{2,}:(.+)$/.exec(path);
  const file = nativePath(revPath ? revPath[1] : path, cwd);
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const text = head(file);
  return MARKER.test(text) ? { file, source: SOURCE.exec(text)?.[1] } : null;
}

function deny(hit) {
  const src = hit.source ? `源文件是 ${hit.source}（相对这个 HTML 所在目录）` : '源文件是同目录同名的 .md';
  const reason = `${hit.file} 是 Markdown-2-HTML 生成的 HTML，只给人阅读，AI 不读取也不修改。${src}；`
    + '请读写源文件，修改后用插件的 m2h build 重新导出。';
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

// 命令行：按 && || ; | 拆段，含生成 HTML 的段只允许文件操作类命令或本插件脚本
function checkCommand(command, cwd) {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    for (const word of words) {
      const hit = generated(word, cwd);
      if (!hit) continue;
      const [verb = '', sub = ''] = words.map(w => w.replace(/^['"]|['"]$/g, ''));
      if (ALLOWED_COMMANDS.test(verb) || verb === 'git' && ALLOWED_GIT.test(sub) || /m2h\.mjs/.test(segment)) continue;
      return hit;
    }
  }
  return null;
}

function check({ tool_name: tool, tool_input: input = {}, cwd }) {
  switch (tool) {
    case 'Read': case 'Edit': case 'Write': case 'NotebookEdit':
      return generated(input.file_path ?? input.notebook_path, cwd);
    case 'Grep':
      return generated(input.path, cwd);
    case 'Bash': case 'PowerShell':
      return checkCommand(input.command ?? '', cwd);
    default:
      return null;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const hit = check(JSON.parse(raw));
    if (hit) deny(hit);
  } catch {
    // 守卫出错时放行
  }
});
