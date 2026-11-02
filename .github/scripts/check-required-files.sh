#!/usr/bin/env bash
# 必需文件检查：协作骨架被误删时立刻报错，而不是等人发现
set -uo pipefail

required_files=(
  "README.md"
  "CONTRIBUTING.md"
  ".editorconfig"
  ".gitattributes"
  ".gitignore"
  ".github/CODEOWNERS"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/labels.json"
  ".github/workflows/ci.yml"
  "docs/git-workflow.md"
  "docs/github-settings.md"
)

missing=0
for f in "${required_files[@]}"; do
  if [[ ! -s "$f" ]]; then
    echo "::error file=$f::缺少必需文件，或文件为空"
    missing=1
  fi
done

if (( missing == 1 )); then
  echo "协作骨架不完整：以上文件属于仓库基础配置，删除前请先讨论。"
  exit 1
fi

echo "必需文件检查通过（${#required_files[@]} 个）。"
