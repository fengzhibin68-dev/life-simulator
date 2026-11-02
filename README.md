# 人生模拟器（Life Simulator）

[![CI](https://github.com/fengzhibin68-dev/life-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/fengzhibin68-dev/life-simulator/actions/workflows/ci.yml)

以「人生选择」为核心的文字 / 数值模拟小游戏。

- **单人游玩**：一位玩家从出生推到终老，每个年龄遇到事件、做出选择、结算属性，最后拿到一个结局。
- **两人协作开发**：两名开发者各带一个 AI 助手并行干活，仓库是唯一的同步媒介。

> **当前阶段：MVP 已可玩。** 25 个事件、5 个结局、6 属性 + 4 资源、判定与死亡结算、自动存档、移动端适配。

## 怎么玩

纯静态页面，**需要一个本地服务器**（浏览器不允许 `file://` 读 JSON）：

```bash
git clone https://github.com/fengzhibin68-dev/life-simulator.git
cd life-simulator

python -m http.server 8000      # 任选其一
# 或：npx serve .
```

打开 <http://localhost:8000> 即可。

> 直接双击 `index.html` 会提示数据加载失败 —— 那是浏览器的同源策略，不是 bug。

## 玩法概要

1. 选出身（普通 / 富裕 / 困难），随机获得一个天赋
2. 每年触发 1 个事件，2~3 个选项，部分选项带属性判定
3. 判定成功率 = 属性 + 运气 - 难度，成功 / 失败给不同结果
4. 健康归零或年龄风险判定命中 → 死亡 → 结算结局
5. 五个结局：早逝 / 孤独终老 / 事业有成 / 家庭美满 / 平凡而温暖

完整规则见 [docs/需求.md](docs/需求.md)，数据格式见 [docs/接口.md](docs/接口.md)，平衡数据见 [docs/测试记录.md](docs/测试记录.md)。

## 目录结构

```
.
├─ index.html                   # 单页入口
├─ css/style.css                # 样式（含移动端适配）
├─ src/
│  ├─ core.js                   # 纯逻辑：随机 / 判定 / 结算 / 死亡 / 结局
│  ├─ storage.js                # localStorage 存档
│  └─ ui.js                     # 渲染与绑定，不含规则
├─ data/
│  ├─ events.json               # 25 个事件
│  └─ endings.json              # 5 个结局文案
├─ tools/
│  ├─ simulate.js               # 无头批量模拟 + 数据校验
│  └─ apply-github-settings.ps1 # 标签与分支保护一键配置
├─ docs/
│  ├─ 需求.md                   # 玩法唯一权威
│  ├─ 接口.md                   # 数据契约
│  ├─ 测试记录.md               # 平衡数据与已知问题
│  ├─ 进度.md                   # 当前状态 + 日志（两个 AI 的同步点）
│  ├─ 任务.md                   # 任务看板（带负责人）
│  ├─ git-workflow.md           # 分支 / 提交 / 评审 / 发布细则
│  └─ github-settings.md        # GitHub 仓库设置清单
└─ .github/                     # CI、模板、CODEOWNERS
```

## 测试

```bash
node tools/simulate.js 500     # 500 局 × 3 种选择策略，顺带校验事件数据
```

数据校验失败时退出码为 1。最新平衡数据见 [docs/测试记录.md](docs/测试记录.md)。

## 协作文档

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| **AI 助手规则** | [AGENTS.md](AGENTS.md) | 两个 AI 助手读什么、能改哪、怎么汇报；用 AI 干活前先读它 |
| **进度与任务** | [docs/进度.md](docs/进度.md) · [docs/任务.md](docs/任务.md) | 两个 AI 之间唯一的状态同步点，开工读、收工写 |
| 协作总则 | [CONTRIBUTING.md](CONTRIBUTING.md) | 分支怎么开、提交怎么写、PR 怎么提、谁来评审 |
| 详细流程 | [docs/git-workflow.md](docs/git-workflow.md) | 完整命令示例、冲突处理、回滚与发布 |
| GitHub 后台 | [docs/github-settings.md](docs/github-settings.md) | 标签、分支保护、必需检查的配置步骤 |
| PR / Issue 模板 | [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) · [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) | 提 PR、报 bug、提需求自动套用 |
| CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | 仓库自检：必需文件、PR 标题规范、冲突标记、大文件 |

## 下一步

- [x] 技术栈选型：纯 HTML + CSS + 原生 JS
- [x] 核心循环与数值模型：年龄、属性、事件表、结局判定
- [x] 数据格式：`data/events.json` + `data/endings.json`
- [ ] 玩法深度：事件池从 25 扩到 40+、结局分级、成就
- [ ] `docs/需求.md` 里 Q2 / Q4 两个待确认项（结局优先级、早逝语义）
- [ ] 目录分工：填进 [AGENTS.md](AGENTS.md) 的「任务边界」一节，与 `.github/CODEOWNERS` 保持一致
- [ ] 许可证（License）与仓库可见性

## 约定

- 默认分支 `main`，受保护，只能通过 PR 合入。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，PR 标题同样受 CI 校验。
- 一次 PR 只做一件事。
- 用 AI 助手干活前先让它读 [AGENTS.md](AGENTS.md)，收工前让它更新 [docs/进度.md](docs/进度.md)。
