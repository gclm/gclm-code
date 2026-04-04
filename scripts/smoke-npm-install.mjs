if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke:npm-install`.\n')
  process.exit(1)
}

const root = process.cwd()
const tmpBase = await Bun.$`mktemp -d /tmp/gclm-npm-install-XXXXXX`.text()
const tmpDir = tmpBase.trim()

function fail(message) {
  process.stderr.write(`FAIL npm-install-smoke - ${message}\n`)
  process.exit(1)
}

try {
  process.stdout.write(`Using temp dir: ${tmpDir}\n`)

  const packResult = await Bun.$`npm pack --silent`.cwd(root).text()
  const tarball = packResult.trim().split('\n').filter(Boolean).at(-1)
  if (!tarball) fail('npm pack returned empty tarball name')

  const tarballPath = `${root}/${tarball}`
  await Bun.$`cp ${tarballPath} ${tmpDir}/`

  await Bun.$`npm init -y`.cwd(tmpDir).quiet()
  await Bun.$`npm i ./${tarball} --loglevel=warn`.cwd(tmpDir)

  // Package name itself is a CLI package and not guaranteed to be resolvable as a JS module export.
  // We assert its installability by checking package.json presence under node_modules.
  const selfPkgJson = `${tmpDir}/node_modules/gclm-code/package.json`
  const selfCheck = Bun.file(selfPkgJson)
  if (!(await selfCheck.exists())) {
    fail('installed package missing: node_modules/gclm-code/package.json')
  }

  const checks = [
    'audio-capture-napi',
    'image-processor-napi',
    'modifiers-napi',
    'url-handler-napi',
    '@ant/claude-for-chrome-mcp',
    '@ant/computer-use-input',
    '@ant/computer-use-mcp',
    '@ant/computer-use-swift',
  ]

  for (const pkg of checks) {
    const cmd = `require.resolve(${JSON.stringify(pkg)})`
    const proc = Bun.spawn(['node', '-e', cmd], {
      cwd: tmpDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    })
    const code = await proc.exited
    if (code !== 0) {
      const err = await new Response(proc.stderr).text()
      fail(`cannot resolve ${pkg}: ${err.trim()}`)
    }
  }

  process.stdout.write(`PASS npm-install-smoke - tarball=${tarball} resolved=${checks.length}\n`)
} finally {
  await Bun.$`rm -rf ${tmpDir}`.quiet()
}
