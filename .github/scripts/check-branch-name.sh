#!/usr/bin/env bash
# 分支命名检查：只给警告，不阻断（紧急修复不该被命名规则卡住）
set -uo pipefail

ref="${HEAD_REF:-}"
author="${AUTHOR:-}"

if [[ -z "$ref" ]]; then
  echo "跳过：没有 HEAD_REF（非 PR 事件）。"
  exit 0
fi

# 机器人分支直接放过
case "$ref" in
  dependabot/* | renovate/* | release/*)
    echo "跳过机器人 / 发布分支：$ref"
    exit 0
    ;;
esac

pattern='^(feat|fix|docs|refactor|test|chore|ci|build)/[a-z0-9._-]+$'

if printf '%s' "$ref" | grep -Eq "$pattern"; then
  echo "分支命名符合规范：$ref"
else
  echo "::warning::分支名「$ref」不符合约定，建议使用 feat/ fix/ docs/ refactor/ test/ chore/ ci/ 前缀，全小写加连字符。"
fi

if [[ -n "$author" ]]; then
  echo "操作者：$author"
fi

exit 0
