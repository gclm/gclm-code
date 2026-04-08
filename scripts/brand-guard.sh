#!/usr/bin/env bash
set -euo pipefail

# Brand guard — ensures no legacy upstream brand words leak into our codebase.
# Excludes references/ (frozen upstream snapshots) and this script itself.

# Detect if rg is available, otherwise fall back to grep
if command -v rg >/dev/null 2>&1; then
  USE_RG=true
else
  USE_RG=false
fi

PATTERNS=(
  'Free Code'
  'Claude Code'
)

for pat in "${PATTERNS[@]}"; do
  if [ "$USE_RG" = true ]; then
    found=$(rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$pat" . || true)
  else
    found=$(grep -rn --exclude-dir=references --exclude=brand-guard.sh "$pat" . 2>/dev/null || true)
  fi
  if [ -n "$found" ]; then
    echo "$found"
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

if [ "$USE_RG" = true ]; then
  found=$(rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$LEGACY_COMMAND_HINT_PATTERN" src docs README.md 2>/dev/null || true)
else
  found=$(grep -rnE --exclude-dir=references --exclude=brand-guard.sh "$LEGACY_COMMAND_HINT_PATTERN" src docs README.md 2>/dev/null || true)
fi
if [ -n "$found" ]; then
  echo "$found"
  echo ""
  echo "Brand guard failed: found legacy command hints using 'claude' or 'gclm'."
  echo "Switch user-facing command examples to 'gc' and keep compatibility aliases out of default guidance."
  exit 1
fi

echo "Brand guard passed."
