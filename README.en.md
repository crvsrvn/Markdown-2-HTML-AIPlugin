[中文](./README.md) | [English](./README.en.md)

### Markdown-2-HTML

- Lets AI (Claude Code / Codex) read and write documents as Markdown, then export a single-file HTML for people to read once the document is final
    - AI only reads and writes Markdown, saving tokens; the HTML has a right-side outline, automatic numbering, callouts and status tags, opens with a double-click, and needs no external services
    - Built-in pure-JS PlantUML engine: diagrams in documents are rendered on export, and standalone diagrams can be drawn in replies
- Requires Node.js 18+

### Installation (for AI)

1. Determine whether you are running in Claude Code or Codex and run only that platform's commands; if `claude` / `codex` is not on PATH, locate the local CLI first.
2. If the legacy `html-style@html-style-aiplugin` is installed, uninstall it and remove the `html-style-aiplugin` marketplace first.
3. Install (the marketplace source can be replaced with an absolute local path to this repository):
    - Claude Code: `claude plugin marketplace add crvsrvn/Markdown-2-HTML-AIPlugin`, then `claude plugin install markdown-2-html@markdown-2-html-aiplugin`
    - Codex: `codex plugin marketplace add crvsrvn/Markdown-2-HTML-AIPlugin`, then `codex plugin add markdown-2-html@markdown-2-html-aiplugin` (older Codex versions lack `plugin add`; install from `/plugins` instead)
4. Update: in Claude Code run `claude plugin marketplace update markdown-2-html-aiplugin` and `claude plugin update markdown-2-html@markdown-2-html-aiplugin`; in Codex run `codex plugin marketplace upgrade markdown-2-html-aiplugin`, then remove and re-add the plugin.
5. Tell the user it takes effect in a new conversation.
