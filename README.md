[中文](./README.md) | [English](./README.en.md)

### Markdown-2-HTML

- 让 AI（Claude Code / Codex）用 Markdown 读写文档，定稿后导出单文件 HTML 给人阅读
    - AI 只读写 Markdown，省 token；HTML 带右侧大纲、自动编号、提示块与状态标签，双击即可打开，不依赖外部服务
    - 内置纯 JS 的 PlantUML 引擎：文档里的图导出时渲染，回答里也能单独画图
- 需要 Node.js 18+

### 安装（供 AI 执行）

1. 判断当前是 Claude Code 还是 Codex，只执行对应平台的命令；`claude` / `codex` 不在 PATH 时先定位本机 CLI。
2. 装过旧版 `html-style@html-style-aiplugin` 时，先卸载它并移除 `html-style-aiplugin` 市场。
3. 安装（市场来源可换成本仓库的本地绝对路径）：
    - Claude Code：`claude plugin marketplace add crvsrvn/Markdown-2-HTML-AIPlugin`，再 `claude plugin install markdown-2-html@markdown-2-html-aiplugin`
    - Codex：`codex plugin marketplace add crvsrvn/Markdown-2-HTML-AIPlugin`，再 `codex plugin add markdown-2-html@markdown-2-html-aiplugin`（旧版 Codex 没有 `plugin add`，在 `/plugins` 里安装）
4. 更新：Claude Code 运行 `claude plugin marketplace update markdown-2-html-aiplugin` 和 `claude plugin update markdown-2-html@markdown-2-html-aiplugin`；Codex 先 `codex plugin marketplace upgrade markdown-2-html-aiplugin`，再移除并重新添加插件。
5. 告诉用户：开始新的对话后生效。
