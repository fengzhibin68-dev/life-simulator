# Git 协作细则

[CONTRIBUTING.md](../CONTRIBUTING.md) 是速查版，这里是完整操作手册：每一步都给命令，照抄即可。

---

## 1. 一次性初始化（每台机器做一次）

```bash
git clone https://github.com/fengzhibin68-dev/life-simulator.git
cd life-simulator

git config user.name  "你的名字"
git config user.email "你的邮箱"
git config commit.template .gitmessage     # 提交时自动带格式模板
git config pull.rebase true                # pull 时用 rebase，避免无谓 merge 提交
git config core.autocrlf false             # 换行交给 .gitattributes，不交给全局设置
```

### Windows 环境提示

- **`where git` 没输出**：把 Git 安装目录下的 `cmd` 子目录加进用户 PATH（例如 `D:\programme\Git\cmd`），或直接用完整路径调用 `git.exe`。
- **`push` 报 `schannel: AcquireCredentialsHandle failed`**：把 TLS 后端换成 OpenSSL：

  ```powershell
  git config --global http.sslBackend openssl
  git config --global http.sslCAInfo "<Git 安装目录>\ucrt64\etc\ssl\certs\ca-bundle.crt"
  ```

- **`无法加载文件…因为在此系统上禁止运行脚本`**：PowerShell 执行策略限制，运行 `tools/apply-github-settings.ps1` 时加 `-ExecutionPolicy Bypass`，见 [github-settings.md](github-settings.md)。

## 2. 一个任务的完整循环

```bash
# ① 从最新主干切分支
git switch main
git pull --ff-only
git switch -c feat/two-player-turn

# ② 小步提交
git add -A
git commit -m "feat(game): 加入双人共同决策回合"

# ③ 推送并建立 PR（首次推送用 -u）
git push -u origin feat/two-player-turn

# ④ 在网页上开 PR：标题用提交格式，描述填模板，关联 Issue
# ⑤ 等 CI 绿 + 对方批准 → Squash and merge → Delete branch

# ⑥ 回来同步主干，删掉本地分支
git switch main
git pull --ff-only
git branch -d feat/two-player-turn
```

## 3. 保持分支新鲜

分支活过一天就要同步一次，越晚同步，冲突越贵。

```bash
git fetch origin
git rebase origin/main
# 有冲突：编辑文件解决 → git add <文件> → git rebase --continue
```

规则：

- 只允许 rebase **自己尚未被评审** 的分支；已被别人拉去测试的分支不要再 rebase，改用 merge。
- 永远不要 rebase `main`，也不要 `git push --force` 到 `main`（分支保护会拒绝）。

## 4. 冲突处理

```bash
git status                 # 看哪些文件冲突
# 打开文件，搜索 <<<<<<< ======= >>>>>>>
# 保留正确内容，删掉标记
git add <冲突文件>
git rebase --continue      # 或 git merge --continue
```

约定：

- 冲突里出现「两边都要」的情况，先在 Issue / 聊天里说一句结论，再动代码。
- 不要用「全部接受我的」了事，尤其是事件表、数值表这类数据文件。
- 数据文件（JSON / 表格）建议按条目拆分或按模块分文件，冲突面会小很多。

## 5. 合并策略

仓库只开启一种合并方式：**Squash and merge**。

- 一个 PR 压成一个提交进 `main`，历史是线性的，回滚就是回滚一个提交。
- 压出来的提交信息 = PR 标题 + PR 描述，所以 PR 标题必须符合 `type(scope): 描述`。
- 合并后自动删除远程分支。

## 6. 发布与回滚

打标签表示一个可玩版本：

```bash
git switch main && git pull --ff-only
git tag -a v0.1.0 -m "第一个可玩原型：单局人生 + 双人决策"
git push origin v0.1.0
```

回滚线上问题（不要 reset，不要改写历史）：

```bash
git revert <出问题的提交>
git push origin main
```

## 7. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| PR 上 `hygiene` 检查红 | 标题格式不对 / 有冲突标记 / 提交了超大文件 | 看 CI 日志里 `::error` 那一行 |
| 推不上去，提示 protected branch | 直接往 `main` 推 | 改推功能分支，开 PR |
| 提交里混进了构建产物 | `.gitignore` 没覆盖到 | 补规则后 `git rm -r --cached <路径>` 再提交 |
| 提交作者显示错误 | 本地 `user.name` / `user.email` 没配 | 配好后 `git commit --amend --reset-author` |
| 不小心提交了密钥 | 一旦推上去就视为泄露 | 立刻吊销该密钥，再清理历史；只删文件不算处理 |
