# GitHub 仓库设置清单

仓库文件（模板、CI、CODEOWNERS）已经写在本地，但**分支保护、标签、合并方式属于仓库后台设置**，必须建库之后配置一次。按下面的顺序做，全程约 10 分钟。

> 前提：仓库 https://github.com/sssttt972/Homework 已经创建，内容也已推送。还没推的先看第 0 节。

---

## 0. 先把本地骨架推上去

本地仓库已在 `D:\deepseek\Homework` 初始化，全部文件已 `git add`（**尚未提交**，因为这台机器还没配 git 身份）。按远端情况二选一：

**情况 A：远端仓库是空的**

```bash
cd /d/deepseek/Homework
git config user.name  "你的名字"
git config user.email "你的邮箱"
git commit -m "chore: 初始化双人协作骨架"
git remote add origin https://github.com/sssttt972/Homework.git
git push -u origin main
```

**情况 B：远端已经有提交**

不要强推，先把远端拉下来再叠加：

```bash
git clone https://github.com/sssttt972/Homework.git D:/deepseek/Homework-remote
# 把 D:\deepseek\Homework 下（除 .git 外）的文件覆盖到 Homework-remote，
# 冲突的文件逐个合并，不要直接覆盖远端已有内容
cd /d/deepseek/Homework-remote
git add -A
git commit -m "chore: 补充双人协作配置"
git push origin main
```

推上去之后，再往下做第 1 节。

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

- [ ] 直接 `git push origin main` 被拒绝
- [ ] 新建 PR 自动套用描述模板
- [ ] 标题写成「新增功能」时 CI 报错并给出正确格式示例
- [ ] PR 页右侧能看到 `hygiene` 检查项
- [ ] 打开新建 Issue，能看到「缺陷报告 / 功能需求」两种表单
- [ ] 标签列表里 4 组标签齐全
