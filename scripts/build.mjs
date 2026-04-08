import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'

if (typeof Bun === 'undefined') {
  process.stderr.write('Run this build script with Bun: `bun run build`.\n')
  process.exit(1)
}

// ── Constants ──────────────────────────────────────────────────────────

const root = process.cwd()
const distDir = join(root, 'dist')
const sourceEntrypoint = 'src/entrypoints/cli.tsx'
const sourceBundle = join(distDir, 'cli.js')
const sourceErrorLog = join(distDir, 'source-build-error.log')

const defaultFeatures = ['VOICE_MODE', 'TRANSCRIPT_CLASSIFIER']

const experimentalFeatures = [
  'AGENT_MEMORY_SNAPSHOT',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'AWAY_SUMMARY',
  'BASH_CLASSIFIER',
  'BRIDGE_MODE',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'CACHED_MICROCOMPACT',
  'CCR_AUTO_CONNECT',
  'CCR_MIRROR',
  'CCR_REMOTE_SETUP',
  'COMPACTION_REMINDERS',
  'CONNECTOR_TEXT',
  'EXTRACT_MEMORIES',
  'HISTORY_PICKER',
  'HOOK_PROMPTS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'LODESTONE',
  'MCP_RICH_OUTPUT',
  'MESSAGE_ACTIONS',
  'NATIVE_CLIPBOARD_IMAGE',
  'NEW_INIT',
  'POWERSHELL_AUTO_MODE',
  'PROMPT_CACHE_BREAK_DETECTION',
  'QUICK_SEARCH',
  'SHOT_STATS',
  'TEAMMEM',
  'TOKEN_BUDGET',
  'TREE_SITTER_BASH',
  'TREE_SITTER_BASH_SHADOW',
  'ULTRAPLAN',
  'ULTRATHINK',
  'UNATTENDED_RETRY',
  'VERIFICATION_AGENT',
]

// ── Helpers ────────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env,
  })

  return {
    ...result,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function fail(message, result) {
  if (message) process.stderr.write(`${message}\n`)
  if (result) printOutput(result)
  process.exit(result?.status ?? 1)
}

function formatBuildLog(log) {
  const level = log.level ? `[${String(log.level).toUpperCase()}] ` : ''
  const location = log.position
    ? `${log.position.file}:${log.position.line}:${log.position.column}\n`
    : ''
  const message = typeof log.message === 'string' ? log.message : String(log)
  return `${level}${location}${message}`.trim()
}

function writeSourceLog(message) {
  writeFileSync(sourceErrorLog, `${message.trim()}\n`)
}

function getPackageJson() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
}

function runCommand(cmd) {
  const result = run(cmd[0], cmd.slice(1))
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

function getDevVersion(baseVersion) {
  const timestamp = new Date().toISOString()
  const date = timestamp.slice(0, 10).replaceAll('-', '')
  const time = timestamp.slice(11, 19).replaceAll(':', '')
  const sha = runCommand(['git', 'rev-parse', '--short=8', 'HEAD']) ?? 'unknown'
  return `${baseVersion}-dev.${date}.t${time}.sha${sha}`
}

function getVersionChangelog() {
  return (
    runCommand(['git', 'log', '--format=%h %s', '-20']) ??
    'Local development build'
  )
}

function appendFeatures(target, features) {
  for (const feature of features) {
    target.push(feature)
  }
}

// ── Argument Parsing ───────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    dev: false,
    compile: false,
    features: [...defaultFeatures],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dev') {
      options.dev = true
      continue
    }
    if (arg === '--compile') {
      options.compile = true
      continue
    }
    if (arg === '--feature-set' && argv[i + 1]) {
      if (argv[i + 1] === 'dev-full') {
        appendFeatures(options.features, experimentalFeatures)
      }
      i += 1
      continue
    }
    if (arg === '--feature-set=dev-full') {
      appendFeatures(options.features, experimentalFeatures)
      continue
    }
    if (arg === '--feature' && argv[i + 1]) {
      options.features.push(argv[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--feature=')) {
      options.features.push(arg.slice('--feature='.length))
      continue
    }
  }

  // deduplicate
  options.features = [...new Set(options.features)]

  return options
}

// ── Macro / Define ─────────────────────────────────────────────────────

function getMacroValues(pkg, version) {
  const feedbackChannel =
    process.env.CLAUDE_CODE_FEEDBACK_CHANNEL ||
    pkg.bugs?.url ||
    'https://github.com/gclm/gclm-code/issues'
  const packageUrl =
    process.env.CLAUDE_CODE_PACKAGE_URL ||
    pkg.name ||
    'gclm-code'

  return {
    ISSUES_EXPLAINER:
      process.env.CLAUDE_CODE_ISSUES_EXPLAINER ||
      `report the issue at ${feedbackChannel}`,
    PACKAGE_URL: packageUrl,
    README_URL:
      process.env.CLAUDE_CODE_README_URL ||
      'https://code.claude.com/docs/en/overview',
    VERSION: version,
    FEEDBACK_CHANNEL: feedbackChannel,
    BUILD_TIME: process.env.CLAUDE_CODE_BUILD_TIME || new Date().toISOString(),
    NATIVE_PACKAGE_URL:
      process.env.CLAUDE_CODE_NATIVE_PACKAGE_URL || packageUrl,
    VERSION_CHANGELOG:
      process.env.CLAUDE_CODE_VERSION_CHANGELOG || '',
  }
}

function getMacroBanner(macroValues) {
  return `const MACRO = Object.freeze(${JSON.stringify(macroValues)});\n`
}

function getDefines(options) {
  return {
    'process.env.USER_TYPE': JSON.stringify('external'),
    'process.env.CLAUDE_CODE_FORCE_FULL_LOGO': JSON.stringify('true'),
    'process.env.CLAUDE_CODE_VERIFY_PLAN': JSON.stringify('false'),
    'process.env.CCR_FORCE_BUNDLE': JSON.stringify('true'),
    ...(options.dev
      ? { 'process.env.NODE_ENV': JSON.stringify('development') }
      : {}),
    ...(options.dev
      ? { 'process.env.CLAUDE_CODE_EXPERIMENTAL_BUILD': JSON.stringify('true') }
      : {}),
  }
}

// ── Build: Bun.build() → JS bundle ─────────────────────────────────────

async function buildFromSource(pkg, version, options) {
  const macroValues = getMacroValues(pkg, version)
  // dev-full or explicit features get version changelog
  if (options.dev && !macroValues.VERSION_CHANGELOG) {
    macroValues.VERSION_CHANGELOG = getVersionChangelog()
  }

  const sourceBuild = await Bun.build({
    entrypoints: [sourceEntrypoint],
    outdir: distDir,
    target: 'node',
    format: 'esm',
    banner: getMacroBanner(macroValues),
    define: getDefines(options),
    features: options.features,
  })

  if (!sourceBuild.success) {
    const buildErrors = sourceBuild.logs.map(formatBuildLog).join('\n\n')
    writeSourceLog(
      [
        'Source build failed.',
        '',
        '$ bun build src/entrypoints/cli.tsx --outdir dist --target node',
        '',
        buildErrors,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    process.stderr.write(readFileSync(sourceErrorLog, 'utf8'))
    return false
  }

  return true
}

// ── Build: bun --compile → binary ──────────────────────────────────────

function compileBinary(binaryOut, options) {
  const compiled = run('bun', [
    'build',
    sourceBundle,
    '--compile',
    '--outfile',
    binaryOut,
  ])

  if (compiled.status !== 0) {
    writeSourceLog(
      [
        'Source bundle built, but binary compilation failed.',
        '',
        `$ bun build ${sourceBundle} --compile --outfile ${binaryOut}`,
        '',
        compiled.stdout,
        compiled.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    process.stderr.write(readFileSync(sourceErrorLog, 'utf8'))
    return false
  }

  printOutput(compiled)
  chmodSync(binaryOut, 0o755)
  return true
}

// ── Verify binary ──────────────────────────────────────────────────────

function verifyBinary(binaryOut, expectedVersion) {
  const verify = run(binaryOut, ['--version'])
  if (verify.status !== 0 || !verify.stdout.includes(expectedVersion)) {
    writeSourceLog(
      [
        'Source binary built, but runtime verification failed.',
        '',
        `$ ${binaryOut} --version`,
        '',
        verify.stdout,
        verify.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    process.stderr.write(readFileSync(sourceErrorLog, 'utf8'))
    return false
  }
  return true
}

// ── Main ───────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2))
const pkg = getPackageJson()
const version = options.dev ? getDevVersion(pkg.version) : pkg.version

// compile-only mode: skip JS bundle, use bun CLI directly
if (options.compile) {
  const outputName = options.dev ? 'gclm-dev' : 'gclm'
  const outfile = join(root, outputName)
  const outDir = dirname(outfile)
  if (outDir !== '.') mkdirSync(outDir, { recursive: true })

  const externals = [
    '@ant/*',
    'audio-capture-napi',
    'image-processor-napi',
    'modifiers-napi',
    'url-handler-napi',
  ]

  const macroValues = getMacroValues(pkg, version)
  if (options.dev && !macroValues.VERSION_CHANGELOG) {
    macroValues.VERSION_CHANGELOG = getVersionChangelog()
  }

  const cmd = [
    'bun',
    'build',
    './src/entrypoints/cli.tsx',
    '--compile',
    '--target', 'bun',
    '--format', 'cjs',
    '--outfile', outfile,
    '--minify',
    '--bytecode',
    '--packages', 'bundle',
    '--conditions', 'bun',
  ]

  for (const external of externals) {
    cmd.push('--external', external)
  }

  for (const feature of options.features) {
    cmd.push(`--feature=${feature}`)
  }

  // --define for MACRO fields (compile mode uses CLI define, not banner)
  for (const [key, value] of Object.entries(macroValues)) {
    cmd.push('--define', `MACRO.${key}=${JSON.stringify(value)}`)
  }
  for (const [key, value] of Object.entries(getDefines(options))) {
    cmd.push('--define', `${key}=${value}`)
  }

  const proc = run(cmd[0], cmd.slice(1), { stdio: 'inherit' })
  if (proc.status !== 0) fail('Compile failed.')

  if (existsSync(outfile)) chmodSync(outfile, 0o755)
  process.stdout.write(`\nBuilt: ${outfile}\n`)
  process.exit(0)
}

// Standard / dev build: JS bundle + compiled binary
rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const binaryOut = join(distDir, options.dev ? 'gclm-dev' : 'gclm')

if (!(await buildFromSource(pkg, version, options))) {
  fail(`Source build failed. See ${sourceErrorLog} for details.`)
}

if (!compileBinary(binaryOut, options)) {
  fail(`Binary compilation failed. See ${sourceErrorLog} for details.`)
}

// verify version (only for non-dev, since dev version has custom format)
const verifyExpected = options.dev ? pkg.version : pkg.version
if (!verifyBinary(binaryOut, verifyExpected)) {
  fail(`Binary verification failed. See ${sourceErrorLog} for details.`)
}

writeSourceLog(
  [
    'Source build succeeded.',
    '',
    `$ ${binaryOut} --version`,
    run(binaryOut, ['--version']).stdout.trim(),
    '',
    `Source bundle: ${sourceBundle}`,
    `Binary: ${binaryOut}`,
    `Features: ${options.features.join(', ')}`,
    options.dev ? 'Mode: dev' : 'Mode: standard',
  ]
    .filter(Boolean)
    .join('\n'),
)

process.stdout.write(`\nBuilt from src entrypoint: ${binaryOut}\n`)
