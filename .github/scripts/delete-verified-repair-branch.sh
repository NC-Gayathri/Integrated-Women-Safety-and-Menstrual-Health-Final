#!/usr/bin/env bash
set -euo pipefail

# The verification job supplies the exact merged, reviewed head SHA.
if [[ ! "${REPAIR_HEAD:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Missing or invalid verified repair SHA; refusing deletion.' >&2
  exit 1
fi
repair_ref='refs/heads/fix/naari-kavach-optical-ready'
git push --force-with-lease="${repair_ref}:${REPAIR_HEAD}" origin ":${repair_ref}"
