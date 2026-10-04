---
title: 语法样例
meta: 用例 · [来源](https://example.com) · 2026-10-04
toc: [2, 3, 4]
marks:
  实: {kind: ok, title: 事实：代码可证}
---
# 冒烟测试文档

## 结论 {#s1}

> [!key] 结论
> ==重点句==，**术语**“引号”**后文**。:m[实] 见 [](#s2-1) 与 [自定义](#s2)。

> [!info] 文档说明
> 来源
> : 一手资料
>
> 范围
> : 全部

## 细节

### 小节 {#s2-1}

Table: 需求表 {.lead}

| 编号 | 内容 | 状态 |
|---|---|---|
| `RT-01` | 按 :kbd[Shift] 加速 | :ok[完成] |

```cpp title="Engine/x.h:1-3（节选）"
int main() { return 0; } // 注释
```

:::details 展开细节
- 列表项 1
  - 嵌套
:::

::::cards
:::card 客户端 → 服务器
只能通过 **Server RPC**。
:::
::::

:::qa
对本 FSM
: 它把承诺拆开。
:::

```plantuml-include _style.iuml
skinparam defaultFontName "Microsoft YaHei"
```

```plantuml caption="示意图"
@startuml
!include _style.iuml
Alice -> Bob : 你好
@enduml
```

### 2026（3 场） {#y2026}

```records
@会议: GDC 2026

title: 'Genshin Impact' Talk
sub: 《原神》演讲
讲者: Xin Ning
仅会员: :warn[是]
links: [视频（仅会员）](https://gdcvault.com/x){.warn} [PPT](https://gdcvault.com/y)
note: （会员限定，简介不可获取）

title: Second
desc: 简介内容
```

```heatmap plain=1 bins=2,5,9,15 total=合计 row-link=#y{row} cell-link=#y{row}-{n} tip="{row} · {col}：{v} 场" legend="色块深浅" note="点击跳转"
年份,合计,类A,类B
2026,3,1,2
合计,3,1,2
```

## GitHub 提示语法

> [!WARNING]
> GitHub 的 WARNING 映射为 warn，标题缺省为“注意”。

> [!NOTE] 自定义标题
> NOTE 映射为 info。
