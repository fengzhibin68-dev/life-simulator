# 人生模拟器（Life Simulator）

以「人生选择」为核心的文字 / 数值模拟小游戏，设计目标是**双人协作**：两名玩家共同推进一段人生，分歧即玩法。

> **当前阶段：协作骨架。** 仓库里只有工程协作配置与规范，还没有游戏代码，技术栈也尚未确定。

## 现在仓库里有什么

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 协作总则 | [CONTRIBUTING.md](CONTRIBUTING.md) | 分支怎么开、提交怎么写、PR 怎么提、谁来评审 |
| 详细流程 | [docs/git-workflow.md](docs/git-workflow.md) | 完整命令示例、冲突处理、回滚与发布 |
| GitHub 后台 | [docs/github-settings.md](docs/github-settings.md) | 标签、分支保护、必需检查的配置步骤 |
| PR / Issue 模板 | [.github/](.github/) | 提 PR、报 bug、提需求自动套用 |
| CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | 仓库自检：必需文件、PR 标题规范、冲突标记、大文件 |
| 一键后台配置 | [tools/apply-github-settings.ps1](tools/apply-github-settings.ps1) | 用 token 批量同步标签与 main 分支保护 |

## 目录结构

```
.
├─ README.md                    # 项目说明（本文件）
├─ CONTRIBUTING.md              # 协作规范，动手前先读
├─ .editorconfig                # 编辑器统一缩进 / 换行
├─ .gitattributes               # 换行与二进制策略
├─ .gitignore                   # 各技术栈忽略规则
├─ .gitmessage                  # 提交信息模板
├─ .github/
│  ├─ CODEOWNERS                # 评审归属
│  ├─ PULL_REQUEST_TEMPLATE.md  # PR 模板
│  ├─ ISSUE_TEMPLATE/           # Issue 表单
│  ├─ labels.json               # 标签体系（脚本的唯一数据源）
│  ├─ scripts/                  # CI 自检脚本
│  └─ workflows/ci.yml          # CI 工作流
├─ docs/
│  ├─ git-workflow.md           # 分支 / 提交 / 评审 / 发布细则
│  └─ github-settings.md        # GitHub 仓库设置清单
└─ tools/
   └─ apply-github-settings.ps1 # 标签与分支保护一键配置
```

## 本地开始

```bash
git clone https://github.com/sssttt972/Homework.git
cd Homework
git config user.name  "你的名字"
git config user.email "你的邮箱"
git config commit.template .gitmessage   # 可选：提交时带模板
```

然后按 [CONTRIBUTING.md](CONTRIBUTING.md) 开分支、写提交、提 PR。

## 下一步（待定清单）

- [ ] 技术栈选型：Web / Godot / Python 原型，需先确定双人协作的游玩形态
- [ ] 双人协作形态：同屏分屏、轮流决策、还是联机各自视角
- [ ] 核心循环与数值模型：年龄、属性、事件表、结局判定
- [ ] 数据格式：事件 / 选项用 JSON 还是表格维护，谁负责内容
- [ ] 许可证（License）与仓库可见性

## 约定

- 默认分支 `main`，受保护，只能通过 PR 合入。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，PR 标题同样受 CI 校验。
- 一次 PR 只做一件事，改动尽量控制在 400 行以内。
