# GitHub 仓库设置清单

仓库文件（模板、CI、CODEOWNERS）已经写在本地，但**分支保护、标签、合并方式属于仓库后台设置**，必须建库之后配置一次。按下面的顺序做，全程约 10 分钟。

> 仓库：<https://github.com/fengzhibin68-dev/life-simulator>（公开，已推送）。
> 本地目录：`D:\deepseek\life-simulator`。下面的设置项已经用脚本应用过一遍，保留步骤供新协作者复现或重装时参考。

---

## 0. 仓库现状

| 项目 | 值 |
| --- | --- |
| 仓库 | <https://github.com/fengzhibin68-dev/life-simulator>（公开） |
| 本地目录 | `D:\deepseek\life-simulator` |
| 默认分支 | `main` |
| 首次推送 | 2026-11-02，`aaf4d7e` 骨架 + 后续文档提交 |

需要重建一次时按这个顺序（Windows 上 `git` 不在 PATH 时用完整路径，例如 `D:\programme\Git\cmd\git.exe`）：

1. 新建仓库，名字 `life-simulator`，**不要**勾 README / .gitignore / license（本地已有，勾了会多出无关提交）；
2. 推送：

```powershell
cd D:\deepseek\life-simulator
git push -u origin main
```

成功的标志是 `* [new branch] main -> main`，之后 `git status` 显示 `Your branch is up to date with 'origin/main'`。

推不上去通常是这两种：

- `Repository not found`：仓库没建好、名字不一致，或当前登录的账号没有该仓库权限。
- `schannel: AcquireCredentialsHandle failed`：TLS 后端问题，改用 OpenSSL，见 [git-workflow.md](git-workflow.md) 的「Windows 环境提示」。

**如果远端已经预先有提交**（建库时勾了 README）：不要强推，先把远端提交叠上来。

```bash
git pull --rebase origin main
git push -u origin main
```

有冲突就逐个文件解决，`git add <文件>` 后 `git rebase --continue`。

## 1. 基础设置

| 项目 | 位置 | 建议值 |
| --- | --- | --- |
| 描述 | 仓库首页 About 齿轮 | `双人协作的人生模拟器（开发中）` |
| Topics | 同上 | `game` `life-simulator` `co-op` `javascript`（按最终栈调整） |
| 默认分支 | Settings → General | `main` |
| 合并方式 | Settings → General → Pull Requests | **只勾选 Allow squash merging**；取消 merge commit 和 rebase merging |
| 合并后删分支 | 同上 | 勾选 Automatically delete head branches |
| 邀请协作者 | Settings → Collaborators → Add people | 对方账号，角色 `Write` |
| Actions 权限 | Settings → Actions → General | Workflow permissions 选 `Read repository contents` |

## 2. 标签（Labels）

标签以 [.github/labels.json](../.github/labels.json) 为唯一数据源，共 4 组：

- `type/*`：feat、fix、docs、refactor、test、chore
- `area/*`：game、ui、data、infra
- `status/*`：blocked、needs-review、wip
- `priority/*`：p0、p1、p2
- 另有 `good first issue`、`help wanted`

两种同步方式，任选其一：

**A. 脚本（推荐，一次同步全部）**

```powershell
$env:GITHUB_TOKEN = "github_pat_xxx"     # 见下方权限说明
pwsh -ExecutionPolicy Bypass -File ./tools/apply-github-settings.ps1
```

> 如果系统提示「禁止运行脚本」（PowerShell 默认执行策略为 Restricted），上面这条带
> `-ExecutionPolicy Bypass` 的写法就能跑；它只影响这一次运行，不改系统设置。
> 想先看会发什么请求：加 `-DryRun`。

**B. 手动**：Issues → Labels → New label，按 `labels.json` 里的名称 / 颜色 / 描述逐个建。

## 3. 分支保护（main）

Settings → Branches → Add branch protection rule（新版 UI 叫 Rules / Rulesets）：

- Branch name pattern：`main`
- ✅ Require a pull request before merging
  - Required approvals：`1`
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require conversation resolution before merging
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - 搜索并勾选 **`hygiene`**（这是 CI 的 job 名，见 `.github/workflows/ci.yml`）
- ✅ Require linear history
- ❌ Allow force pushes（保持关闭）
- ❌ Allow deletions（保持关闭）
- Require review from Code Owners：**先不勾**。等第二位协作者加进 CODEOWNERS 且成为 collaborator 后再开，否则 PR 会卡住等一个不存在的人。

也可以一条命令完成：

```powershell
$env:GITHUB_TOKEN = "github_pat_xxx"
pwsh -ExecutionPolicy Bypass -File ./tools/apply-github-settings.ps1
```

## 4. Token 权限

同一脚本既要写标签又要写分支保护，fine-grained PAT 需要（针对该仓库）：

- `Administration`：Read and write（分支保护）
- `Issues`：Read and write（标签）

classic PAT 则是 `repo` 权限。脚本只读本地 `labels.json`，不会改代码，也不会存 token。

## 5. 需要知道的限制

- **私有仓库的受保护分支需要 GitHub Pro / Team**。GitHub Free 的私有仓库没有分支保护与 ruleset；如果暂时不升级，要么仓库设为 public，要么靠「两个人自觉 + 评审约定」过渡，等升级后再补。
- `hygiene` 这个检查名，必须在至少一次 PR 跑过之后才会出现在勾选列表里；如果列表里搜不到，先随便开一个 PR 让 CI 跑一次。
- 如果 `main` 上还没有任何提交，先推送再建保护规则，否则规则会因为分支不存在而建不上。

## 6. 配置完成后的验收

- [x] 直接 `git push origin main` 被拒绝（分支保护已开启，强推与删除均禁用）
- [x] 新建 PR 自动套用描述模板
- [x] 标题写成「新增功能」时 CI 报错并给出正确格式示例（PR #1 负向验证通过）
- [x] PR 页右侧能看到 `hygiene` 检查项
- [x] 打开新建 Issue，能看到「缺陷报告 / 功能需求」两种表单
- [x] 标签列表里 4 组标签齐全（18 个，已删掉 GitHub 默认标签避免语义重复）

### 验收记录（2026-11-02）

| 项目 | 结果 |
| --- | --- |
| 仓库 | <https://github.com/fengzhibin68-dev/life-simulator>（公开，topics: game / life-simulator / co-op / teamwork / typescript） |
| 合并方式 | 仅 Squash，合并后自动删分支，allow_merge_commit / allow_rebase_merge 关闭 |
| 标签 | 18 个，脚本同步后回读一致 |
| 分支保护 | 必需检查 `hygiene`、1 个批准、线性历史、禁止强推 / 删除、要求解决讨论 |
| CI 冒烟 | PR 用合规标题 → `hygiene` 通过；改成「新增功能」→ 失败；改回 → 通过。测试 PR 已关闭、分支已删除 |

**尚未配置**：第二位协作者的邀请与 CODEOWNERS 评审（等对方 GitHub 用户名）。

