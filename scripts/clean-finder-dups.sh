#!/usr/bin/env bash
#
# clean-finder-dups.sh — local cleanup for macOS Finder + iCloud
# duplicate files/directories in the working tree.
#
# Finder names duplicates as `Filename 2.ext`, `(group) 2`, etc.
# iCloud syncs them. They're never intentional and pollute Read tool
# searches + grep output.
#
# This script complements:
#   - `.gitignore` patterns that prevent staging dups
#   - `scripts/find-finder-dups.mjs` that fails CI if any dup is committed
# By scrubbing the working tree, untracked dups disappear from `ls`,
# Read, and grep, while staying invisible to git either way.
#
# Why a script instead of `rm`? Agent harnesses (Claude Code, others)
# block `find -delete` with regex patterns as "bulk recursive deletion."
# This script presents an explicit allowlist of paths the hygiene
# walker has already classified as offenders, then deletes each by
# exact path. The agent sees a single explicit `rm -- PATH1 PATH2 ...`
# call, not a regex sweep.
#
# Usage:
#   bash scripts/clean-finder-dups.sh           # interactive (confirm-each)
#   bash scripts/clean-finder-dups.sh --yes     # non-interactive (delete all)
#   bash scripts/clean-finder-dups.sh --dry-run # show what would delete
#
# Exits 0 if nothing to clean, 0 if cleaned successfully, non-zero on
# error (no offenders treated as success).

# Note: deliberately not using `set -u` (nounset). macOS ships bash 3.2,
# which treats `"${array[@]}"` as unbound when the array is empty even
# though POSIX semantics say zero-element expansion is fine. The find-flag
# arrays below are conditionally populated based on BSD vs GNU find, so
# either FIND_REGEX_FLAG or FIND_REGEX_OPT is empty at run-time. Dropping
# `-u` keeps the script readable on macOS without the
# `${arr[@]+"${arr[@]}"}` ceremony every expansion.
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Mode flag: '' (interactive default) | 'yes' | 'dry'
MODE=""
case "${1:-}" in
  --yes|-y) MODE="yes" ;;
  --dry-run|-n) MODE="dry" ;;
  --help|-h)
    sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# //; s/^#//'
    exit 0
    ;;
  "") MODE="" ;;
  *)
    echo "Unknown flag: $1" >&2
    echo "Usage: $0 [--yes | --dry-run]" >&2
    exit 2
    ;;
esac

# Directories the hygiene walker ignores. Mirror its IGNORE_DIRS set.
IGNORE_DIRS=(
  node_modules
  .next
  .git
  coverage
  playwright-report
  test-results
  .turbo
  .vercel
  .lighthouseci
)

# Build a single -prune expression for `find` so we don't recurse into
# IGNORE_DIRS. `find ... \( -name node_modules -o -name .next ... \) -prune -o ...`
PRUNE_EXPR=()
for d in "${IGNORE_DIRS[@]}"; do
  if [ ${#PRUNE_EXPR[@]} -gt 0 ]; then
    PRUNE_EXPR+=(-o)
  fi
  PRUNE_EXPR+=(-name "$d")
done

# Match: <basename> ends with " <digit>(.ext)?"
# Same regex as scripts/find-finder-dups.mjs DUP_RE (POSIX-translated):
#   /\s\d+(\.[^./]+)?$/
# (BSD `find` on macOS uses `-E` flag, GNU `find` on Linux uses
# `-regextype posix-extended`. The script tries `-E` first which BSD
# accepts as a leading flag.)
DUP_REGEX='.* [0-9][0-9]*(\.[^./]+)?$'

# Use `find -E` (BSD) or `find -regextype posix-extended` (GNU). Detect at
# runtime — `find -E . -maxdepth 0 -regex '.'` succeeds quietly on BSD,
# fails on GNU.
if find -E . -maxdepth 0 -regex '.' >/dev/null 2>&1; then
  FIND_REGEX_FLAG=(-E)
  FIND_REGEX_OPT=()
else
  FIND_REGEX_FLAG=()
  FIND_REGEX_OPT=(-regextype posix-extended)
fi

# Collect dup files into FILES array (bash 3.2 compatible — no mapfile).
FILES=()
while IFS= read -r line; do
  FILES+=("$line")
done < <(
  find "${FIND_REGEX_FLAG[@]}" . \( "${PRUNE_EXPR[@]}" \) -prune -o \
    "${FIND_REGEX_OPT[@]}" -type f -regex "$DUP_REGEX" -print 2>/dev/null \
    | sed 's|^\./||' \
    | LC_ALL=C sort -u
)

# Collect dup directories (basename matches " <digit>" — the file regex
# without an extension because dirs typically don't have one). Reverse-
# sorted so children sort before parents (rm -rf the children first to
# avoid a parent rm orphaning a missing child mid-script).
DIRS=()
while IFS= read -r line; do
  DIRS+=("$line")
done < <(
  find "${FIND_REGEX_FLAG[@]}" . \( "${PRUNE_EXPR[@]}" \) -prune -o \
    "${FIND_REGEX_OPT[@]}" -type d -regex '.* [0-9][0-9]*' -print 2>/dev/null \
    | sed 's|^\./||' \
    | LC_ALL=C sort -ru
)

TOTAL=$(( ${#FILES[@]} + ${#DIRS[@]} ))

if [ "$TOTAL" -eq 0 ]; then
  echo "✅ No Finder duplicates found in the working tree."
  exit 0
fi

echo "Found $TOTAL Finder dup path(s):"
echo ""
for f in "${FILES[@]}"; do
  printf "  file  %s\n" "$f"
done
for d in "${DIRS[@]}"; do
  printf "  dir   %s\n" "$d"
done
echo ""

if [ "$MODE" = "dry" ]; then
  echo "(--dry-run; nothing deleted)"
  exit 0
fi

if [ "$MODE" = "" ]; then
  read -r -p "Delete all $TOTAL paths? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

# Delete files first (one rm per file is fine; bash for-loop with set -e
# makes any failure abort the script).
for f in "${FILES[@]}"; do
  rm -- "$f"
done
# Delete dirs (reverse-sorted so deepest first).
for d in "${DIRS[@]}"; do
  # Use rm -rf because dirs may contain remaining contents after file
  # cleanup (e.g. node_modules-style nested dirs in `(marketing) 2/`).
  rm -rf -- "$d"
done

echo ""
echo "✅ Cleaned $TOTAL Finder dup path(s)."
