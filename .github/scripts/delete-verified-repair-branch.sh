#!/usr/bin/env bash
set -euo pipefail

# The verification job supplies both the exact reviewed repair branch and the
# exact merged head SHA. Refuse to infer either value inside this script.
repair_branch="${REPAIR_BRANCH:-}"
repair_head="${REPAIR_HEAD:-}"

if [[ ! "$repair_head" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Missing or invalid verified repair SHA; refusing deletion.' >&2
  exit 1
fi

if [[ -z "$repair_branch" ]] ||
   [[ "$repair_branch" != fix/naari-kavach-* && "$repair_branch" != fix/naari-formal-assurance-v12 ]] ||
   [[ "$repair_branch" == refs/* ]] ||
   ! git check-ref-format --branch "$repair_branch" >/dev/null 2>&1; then
  echo 'Missing or invalid verified repair branch; refusing deletion.' >&2
  exit 1
fi

repair_ref="refs/heads/${repair_branch}"
git push --force-with-lease="${repair_ref}:${repair_head}" origin ":${repair_ref}"
