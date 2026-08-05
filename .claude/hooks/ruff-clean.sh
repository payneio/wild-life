#!/usr/bin/env bash
# Stop hook: `api/` must be ruff-clean before a turn ends.
#
# Both commands, because `ruff check` passes on an unformatted tree — which is
# how four migrations sat unformatted across several phases while every lint run
# reported success.
#
# Scoped to the files this change touched (vs HEAD, plus untracked), so a
# pre-existing failure somewhere else cannot wedge the session in a stop loop
# over work that is not ours to fix.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root" || exit 0

changed=$(
  {
    git diff --name-only --diff-filter=d HEAD -- api/ 2>/dev/null
    git ls-files --others --exclude-standard -- api/ 2>/dev/null
  } | grep '\.py$' | sed 's|^api/||' | sort -u
)
[ -z "$changed" ] && exit 0

cd api || exit 0
# shellcheck disable=SC2086  # word splitting is the point: one arg per file
lint=$(uv run ruff check $changed 2>&1); lint_rc=$?
# shellcheck disable=SC2086
fmt=$(uv run ruff format --check $changed 2>&1); fmt_rc=$?

if [ $lint_rc -ne 0 ] || [ $fmt_rc -ne 0 ]; then
  {
    echo "ruff is not clean on the files this change touched:"
    [ $lint_rc -ne 0 ] && echo "$lint"
    [ $fmt_rc -ne 0 ] && echo "$fmt"
    echo
    echo "Fix, do not revert: cd api && uv run ruff format <files> && uv run ruff check --fix <files>"
    echo "A formatted repository beats a tidy diff."
  } >&2
  exit 2
fi
exit 0
