#!/usr/bin/env bash
set -euo pipefail

# Brand word guard (excluding references/)
# Fails if forbidden legacy brand words are present.

PATTERN='Free Code|Claude Code'

if rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$PATTERN" .; then
  echo ""
  echo "Brand guard failed: found legacy brand words (Free Code / Claude Code)."
  echo "Please replace them with Gclm Code, or move historical material under references/."
  exit 1
fi

# Command hint guard (user-visible guidance should default to gc)
# We intentionally target only instruction-like phrases to avoid false
# positives in internal identifiers, file names, compatibility code, and
# provider/model names.
COMMAND_HINT_PATTERN='(Run|Usage:|Resume with:|Resume this session with:|Try[[:space:]]+`?)\s*claude([[:space:]]|`)' 

if rg -n --glob '!references/**' --glob '!scripts/brand-guard.sh' -S "$COMMAND_HINT_PATTERN" src docs README.md; then
  echo ""
  echo "Brand guard failed: found legacy command hints using 'claude'."
  echo "Please switch user-facing command examples to 'gc' (keep 'claude' only as compatibility entrypoint)."
  exit 1
fi

echo "Brand guard passed: no legacy brand words or legacy command hints found outside references/."
