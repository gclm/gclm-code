if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke:gui`.\n')
  process.exit(1)
}

if (process.platform !== 'darwin') {
  process.stdout.write('GUI smoke skipped: only supported on macOS.\n')
  process.exit(0)
}

process.stdout.write('GUI smoke preflight (macOS) passed.\n')
process.stdout.write('Tip: run references/cli/scripts/gui-smoke-test.mjs for deep native checks if needed.\n')
