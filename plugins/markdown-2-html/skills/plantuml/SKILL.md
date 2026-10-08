---
name: plantuml
description: 画 UML 或示意图（时序图、类图、状态图、组件图、活动图、用例图、思维导图、甘特图等），或把 .puml 导出成 SVG 时使用——不论是用户明确要求，还是回答中主动判断需要配图。用 PlantUML 源码和本插件内置的纯 JS 引擎在本机渲染，不需要 Java。写进 Markdown 文档的图不在这里渲染，交给 markdown-2-html 技能。禁止手写 SVG、把未渲染的 PlantUML 源码当成品图、调用在线渲染服务。
---

# PlantUML

## 按图的去处分流

| 图放在哪里 | 做法 |
|------------|------|
| Markdown 文档（方案、报告、说明等） | 在 `.md` 里写 ```` ```plantuml ```` 块，按 markdown-2-html 技能 `check` / `build`。不单独渲染，不在文档里引用图片文件 |
| 回答里配图 | 用 `render` 渲染成 SVG，再展示给用户（见下文） |
| 导出单独的图 | 用 `render` 写到用户指定的路径 |

## 命令

`<本技能目录>` 是加载本技能时给出的 Base directory。渲染器与 markdown-2-html 共用，只需要 Node.js 18+。

```bash
node "<本技能目录>/../markdown-2-html/scripts/dist/m2h.mjs" render diagram.puml [-o out.svg]   # 默认输出到源文件同目录同名 .svg
node "<本技能目录>/../markdown-2-html/scripts/dist/m2h.mjs" render - -o out.svg               # 源码从标准输入读
```

- 只输出 SVG；用户要 PNG 等位图时说明暂不支持。
- 一个源文件一张图，保留与图类型匹配的 `@start...` / `@end...` 标记。
- `!include` 读不到本地文件或 URL，需要的定义直接写进源码。
- 用户给的是 `.puml` 文件时直接渲染它，不为了渲染去改它，除非用户要求。

## 出错时

语法错误和警告（例如过时语法）都会让 `render` 失败，错误信息带行号。按诊断改源码后重试，最多两次；仍失败就如实报告原始诊断，不要把失败的图说成成功，也不要改成贴源码交差。

## 回答里配图

1. 把源码写到临时目录的 `.puml`（会话有 scratchpad 目录时用它），或用标准输入传入。
2. `render` 出 SVG。
3. 有展示文件的工具时用它展示（例如 Claude 桌面版的 SendUserFile，`display: render`）；没有时告诉用户 SVG 的绝对路径。用户没要源码时，回答里不贴源码。

## 画法

- 颜色必须编码含义，不做纯装饰。
- 一张图只表达一件事；节点多于一屏时拆图。
