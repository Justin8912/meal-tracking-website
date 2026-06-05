#!/usr/bin/env bash
#
# push-stack.sh — push the meal-tracking stacked branches to origin in
# dependency order (base branches first, so each PR base exists before the
# branch that targets it).
#
# Usage:
#   scripts/push-stack.sh            # push every branch in the stack
#   scripts/push-stack.sh --dry-run  # print what would be pushed, do nothing
#
# Notes:
#   - Uses the existing 'origin' remote (HTTPS). Opening PRs still needs gh auth
#     sorted separately; this only does `git push`.
#   - Safe to re-run: already-pushed / up-to-date branches are no-ops.
#   - Order matters for stacked PRs: each branch's PR base is the line above it.

set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

REMOTE="origin"

# Branches in stack order (PR base = the entry directly above).
BRANCHES=(
  "docs/meal-tracking-mvp-design"        # base: main
  "tasks/recipe-library"                 # base: docs/meal-tracking-mvp-design
  "tasks/weekly-planner"                 # base: tasks/recipe-library (docs-only; planner design+tasks)
  "impl/platform-foundation/bundle-1"    # base: tasks/recipe-library
  "impl/platform-foundation/bundle-2"    # base: impl/platform-foundation/bundle-1
  "impl/platform-foundation/bundle-3"    # base: impl/platform-foundation/bundle-2
  "impl/platform-foundation/bundle-4"    # base: impl/platform-foundation/bundle-3
  "impl/recipe-library/bundle-1"         # base: impl/platform-foundation/bundle-4
  "impl/recipe-library/bundle-2"         # base: impl/recipe-library/bundle-1
  "impl/recipe-library/bundle-3"         # base: impl/recipe-library/bundle-2
  "impl/recipe-library/bundle-4"         # base: impl/recipe-library/bundle-3
  "impl/recipe-library/bundle-5"         # base: impl/recipe-library/bundle-4
  "impl/recipe-library/bundle-6"         # base: impl/recipe-library/bundle-5
  "impl/weekly-planner/bundle-1"         # base: impl/recipe-library/bundle-6
  "impl/weekly-planner/bundle-2"         # base: impl/weekly-planner/bundle-1
  "impl/weekly-planner/bundle-3"         # base: impl/weekly-planner/bundle-2
  "impl/weekly-planner/bundle-4"         # base: impl/weekly-planner/bundle-3
  "impl/weekly-planner/bundle-5"         # base: impl/weekly-planner/bundle-4
  "impl/weekly-planner/bundle-6"         # base: impl/weekly-planner/bundle-5
  "impl/weekly-planner/bundle-7"         # base: impl/weekly-planner/bundle-6
)

cd "$(git rev-parse --show-toplevel)"

echo "Pushing ${#BRANCHES[@]} branches to '${REMOTE}' in stack order..."
echo

for branch in "${BRANCHES[@]}"; do
  if ! git rev-parse --verify --quiet "refs/heads/${branch}" >/dev/null; then
    echo "SKIP  ${branch}  (no local branch)"
    continue
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "DRY   git push -u ${REMOTE} ${branch}"
    continue
  fi

  echo ">>> ${branch}"
  # -u sets upstream tracking; harmless if already set.
  git push -u "${REMOTE}" "${branch}"
  echo
done

echo "Done."
