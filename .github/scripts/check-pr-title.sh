#!/usr/bin/env bash
# PR 标题检查：合并策略是 Squash，PR 标题会变成主干上的提交信息，所以必须合规范
set -uo pipefail

title="${PR_TITLE:-}"

if [[ -z "$title" ]]; then
  echo "::error::读不到 PR 标题（PR_TITLE 为空）"
  exit 1
fi

pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .{2,}'

if printf '%s' "$title" | grep -Eq "$pattern"; then
  echo "PR 标题符合规范：$title"
else
  cat <<'EOF'
::error::PR 标题不符合 Conventional Commits 规范。

要求的格式：type(scope): 描述
  type  ：feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
  scope ：可选，小写英文，例如 game / ui / data / ci
  描述  ：中文或英文都可以，不要为空，不要以句号结尾

正确示例：
  feat(game): 加入双人共同决策回合
  fix(ui): 修复属性面板在窄屏下溢出
  docs: 补充双人分工说明
  chore(ci): 缩短流水线耗时

错误示例：
  新增功能              （缺少 type）
  feat(game):           （描述为空）
  Feat(Game): 新增功能   （type 与 scope 必须小写）
EOF
  exit 1
fi

if (( ${#title} > 100 )); then
  echo "::warning::PR 标题偏长（${#title} 字符），建议控制在 72 字符以内。"
fi

exit 0
