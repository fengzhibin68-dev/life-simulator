#!/usr/bin/env bash
# 改动内容检查：冲突标记、行尾空白、超大文件、不该入库的文件
set -uo pipefail

base_ref="${BASE_REF:-main}"
base="origin/${base_ref}"

if ! git rev-parse --verify --quiet "$base" >/dev/null; then
  echo "::warning::找不到 $base，改用 HEAD~1 作比较基线"
  base="HEAD~1"
fi

merge_base="$(git merge-base "$base" HEAD 2>/dev/null || printf '%s' "$base")"
range="${merge_base}..HEAD"

mapfile -t files < <(git diff --name-only --diff-filter=AMR "$range")

if (( ${#files[@]} == 0 )); then
  echo "本次 PR 没有文件改动。"
  exit 0
fi

echo "本次改动 ${#files[@]} 个文件："
printf '  %s\n' "${files[@]}"
echo

fail=0
fail_msg() {
  echo "::error file=$1::$2"
  fail=1
}

# ---------- 1. 未解决的合并冲突标记 ----------
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  grep -Iq . "$f" 2>/dev/null || continue   # 跳过二进制 / 空文件
  if grep -nE '^(<<<<<<< |>>>>>>> |=======$)' "$f" >/dev/null 2>&1; then
    fail_msg "$f" "发现未解决的合并冲突标记，请先解决冲突再提交"
  fi
done

# ---------- 2. 行尾空白（Markdown 除外，行尾空格在 Markdown 里是换行） ----------
ws_report="$(git diff --check "$range" 2>&1 || true)"
if [[ -n "$ws_report" ]]; then
  filtered="$(printf '%s\n' "$ws_report" | grep -v '\.md:' || true)"
  if [[ -n "$filtered" ]]; then
    printf '%s\n' "$filtered"
    echo "::error::发现行尾空白，请开启编辑器的 trim trailing whitespace（.editorconfig 已声明）"
    fail=1
  fi
fi

# ---------- 3. 超大文件 ----------
limit=$((10 * 1024 * 1024))
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  size="$(wc -c < "$f" | tr -d ' ')"
  if (( size > limit )); then
    fail_msg "$f" "文件约 $((size / 1024 / 1024)) MB，超过 10 MB 上限；素材请走 Git LFS 或放到发布产物里"
  fi
done

# ---------- 4. 不该入库的文件 ----------
for f in "${files[@]}"; do
  name="$(basename "$f")"
  case "$name" in
    .DS_Store | Thumbs.db | desktop.ini | .env | secrets.json)
      fail_msg "$f" "这个文件属于本地环境或密钥，不应该提交" ;;
    *.pem | *.key | *.p12 | *.pfx)
      fail_msg "$f" "疑似密钥文件，请立刻移除并吊销对应凭据" ;;
    *.log)
      fail_msg "$f" "日志文件不应入库" ;;
  esac
  case "$f" in
    node_modules/* | */node_modules/* | dist/* | */dist/* | build/* | */build/*)
      fail_msg "$f" "构建产物 / 依赖目录不应入库，请检查 .gitignore" ;;
  esac
done

if (( fail == 1 )); then
  echo
  echo "改动内容检查未通过，修正后重新提交即可（无需关闭 PR）。"
  exit 1
fi

echo "改动内容检查通过。"
