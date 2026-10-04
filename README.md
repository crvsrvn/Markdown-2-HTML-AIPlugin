# Markdown-2-HTML

同时支持 Claude Code 与 Codex 的文档插件：AI 读写的文档一律是 Markdown，省 token；文档定稿后，用插件导出 html-style 风格的单文件 HTML 给人阅读。生成的 HTML 只给人看，AI 不读取也不修改。

> [!IMPORTANT] 读写约定
> 插件在 AI 读写任何文档之前生效：AI 只读写 `.md`。插件生成的 HTML 在 `<head>` 里带 `<meta name="generator" content="Markdown-2-HTML/版本">` 标记；Claude Code 里由 hook 拦截对这类 HTML 的读取、搜索和修改，并提示去读对应的 `.md`。没有这个标记的 HTML 不受影响。

## 功能

| 项 | 说明 |
|----|------|
| 源文件 | CommonMark + GFM 表格，加少量扩展：提示块、状态标签、图例记号、交叉引用、折叠段落、卡片、条目卡片、热力表。语法见 [syntax.md](plugins/markdown-2-html/skills/markdown-2-html/references/syntax.md) |
| 导出 | 单文件 HTML，双击即可打开；样式、脚本、图表都在文件里，不依赖任何外部服务（只有字体从 Google Fonts 加载，失败时用本机字体） |
| 样式 | 沿用 html-style v1.8.1：Comic Sans MS 16px、右侧可筛选可折叠的大纲、自动章节序号、`#FCFCFB` / `#151515` 底色、988px 版心、语义提示块、状态标签、ID 着色 |
| 图表 | PlantUML 源码在导出时用官方纯 JS 引擎渲染成 SVG 内联，不需要 Java；可拖动、滚轮缩放、双击网页全屏 |
| 表格与代码 | 表格网页全屏、表头吸顶；代码导出时高亮，超过 25 行默认折叠 |
| 检查 | 未知语法、不存在的页内链接、PlantUML 语法错误都会让导出报错 |
| 迁移 | 旧版 html-style 页面可转成 Markdown，并逐项比对原页面与新导出页面 |
| 读取守卫 | Claude Code：hook 拦截 Read、Edit、Write、Grep、Bash、PowerShell 对生成 HTML 的读取和修改。Codex 没有对应 hook，靠 Skill 里的规则约束 |

完整规则见 [SKILL.md](plugins/markdown-2-html/skills/markdown-2-html/SKILL.md)。

## 运行要求

Node.js 18 或更新版本。导出工具已打包成单个文件 `scripts/dist/m2h.mjs`，PlantUML 引擎在 `scripts/vendor/` 里，使用时不需要 `npm install`。

## 安装

下文 `<市场来源>` 二选一：

- GitHub：`crvsrvn/Markdown-2-HTML-AIPlugin`，或 fork 后的 `<owner>/<repo>`；也可以传 HTTPS / SSH 克隆地址。
- 本地目录：仓库根目录，即包含 `.claude-plugin/marketplace.json` 的目录。写绝对路径。

### 让 AI 安装（推荐）

在 Claude Code 或 Codex 里直接说：

```text
按 README 安装这个插件：<GitHub 地址或本地路径>
```

> [!NOTE] 给执行安装的 AI
> 1. 判断当前平台是 Claude Code 还是 Codex，只执行对应平台的命令。
> 2. 本地路径先解析成绝对路径，并确认其中存在 `.claude-plugin/marketplace.json`（Codex 为 `.agents/plugins/marketplace.json`）。
> 3. `claude` / `codex` 不在 PATH 时，先定位本机的 CLI 可执行文件再调用，不要假设固定路径。
> 4. 装过旧版 `html-style@html-style-aiplugin` 时，先卸载它并移除 `html-style-aiplugin` 市场，避免两套规则同时生效。
> 5. 市场已用同一来源添加过时跳过添加；来源不同时先移除旧市场再添加。
> 6. 完成后告诉用户：开始新的对话 / 任务后生效。

### Claude Code

```bash
claude plugin marketplace add <市场来源>
claude plugin install markdown-2-html@markdown-2-html-aiplugin
```

从旧版迁移：

```bash
claude plugin uninstall html-style@html-style-aiplugin
claude plugin marketplace remove html-style-aiplugin
```

### Codex

```bash
codex plugin marketplace add <市场来源>
codex plugin add markdown-2-html@markdown-2-html-aiplugin
```

较旧的 Codex CLI 没有 `codex plugin add`，添加市场后在 Codex 里用 `/plugins` 安装。

### 仅安装 Skill

把 `plugins/markdown-2-html/skills/markdown-2-html/` 整个目录复制到工具的用户级 Skills 目录（例如 Claude Code 的 `~/.claude/skills/markdown-2-html/`）。这种方式没有读取守卫 hook，只靠 Skill 规则约束。与插件安装二选一。

### 更新

```bash
claude plugin marketplace update markdown-2-html-aiplugin
claude plugin update markdown-2-html@markdown-2-html-aiplugin
```

`claude plugin update` 按插件清单里的版本号判断有没有新版本。Codex 安装的是快照：先 `codex plugin marketplace upgrade markdown-2-html-aiplugin`，再移除并重新添加插件。

## 使用

不需要记命令。直接说“把这份方案写成文档”“定稿了，导出 HTML”“把这个旧 HTML 页面迁移成 Markdown”即可。AI 调用的命令如下（`<技能目录>` 为 `plugins/markdown-2-html/skills/markdown-2-html`）：

```bash
node <技能目录>/scripts/dist/m2h.mjs check  doc.md
node <技能目录>/scripts/dist/m2h.mjs build  doc.md [-o out.html]
node <技能目录>/scripts/dist/m2h.mjs migrate page.html doc.md [--puml-dir <目录>]
node <技能目录>/scripts/dist/m2h.mjs verify 原页面.html 导出页面.html
```

## 目录结构

```
.claude-plugin/marketplace.json            Claude Code 市场清单
.agents/plugins/marketplace.json           Codex 市场清单
README.md / README.html                    说明（README.html 由插件导出，给人阅读）
plugins/markdown-2-html/
  .claude-plugin/plugin.json               Claude Code 插件清单
  .codex-plugin/plugin.json                Codex 插件清单
  hooks/hooks.json, guard.mjs              读取守卫（Claude Code）
  skills/markdown-2-html/
    SKILL.md                               规则与工作流程
    references/syntax.md                   语法参考
    assets/template.html                   样式、图标、大纲与图表 / 表格脚本（样式唯一来源）
    assets/presets.css                     模板之外的组件样式（卡片、热力表、条目卡片等）
    scripts/src/                           导出工具源码
    scripts/build.mjs                      打包脚本：生成 dist/m2h.mjs 与第三方许可证清单
    scripts/dist/m2h.mjs                   打包后的导出工具（提交到仓库）
    scripts/vendor/plantuml-engine.js      PlantUML 官方 TeaVM 引擎（来自 @plantuml/mcp-js 0.2.2）
    scripts/test/sample.md                 语法样例
```

## 维护

- 改样式或交互：只改 `template.html` 的字体链接、`hs-style`、回到顶部标记、`hs-script` 四块，或 `presets.css`。
- 改导出工具：改 `scripts/src/`，在 `scripts/` 下运行 `npm install`、`npm run build`、`npm test`，把重新生成的 `dist/` 一起提交。
- 每次发布都提升版本号，否则 Claude Code 不会更新已安装的插件。各清单文件与 `scripts/src/render.mjs` 里的 `VERSION` 保持一致。
- README 定稿后用插件重新导出 `README.html`。

## 第三方组件

PlantUML（MIT）、Viz.js / Graphviz、markdown-it 及其插件、highlight.js、js-yaml、linkedom 等，许可证全文见 `scripts/dist/THIRD_PARTY_LICENSES.txt`（构建时自动收集）。

## 许可证

MIT
