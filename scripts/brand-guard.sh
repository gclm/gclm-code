#!/usr/bin/env bash
set -euo pipefail

# Brand guard — ensures no legacy upstream brand words leak into our codebase.
# Excludes references/ (frozen upstream snapshots) and this script itself.

PATTERNS=(
  'Free Code'
  'Claude Code'
)

for pat in "${PATTERNS[@]}"; do
  if rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$pat" .; then
    echo ""
    echo "Brand guard failed: found legacy brand word '$pat'."
    echo "Replace with 'Gclm Code', or move historical material under references/."
    exit 1
  fi
done

# Command hint guard — user-visible guidance should default to 'gc'.
# Targets instruction-like phrases to avoid false positives in internal
# identifiers, file names, compatibility code, and provider/model names.
LEGACY_COMMAND_HINT_PATTERN='(Run|Usage:|Resume with:|Resume this session with:|Try[[:space:]]+`?)\s*(claude|gclm)([[:space:]]|`)'

if rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$LEGACY_COMMAND_HINT_PATTERN" src docs README.md; then
  echo ""
  echo "Brand guard failed: found legacy command hints using 'claude' or 'gclm'."
  echo "Switch user-facing command examples to 'gc' and keep compatibility aliases out of default guidance."
  exit 1
fi

echo "Brand guard passed."
