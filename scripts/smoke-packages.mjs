import { fetchGatewayModels } from './lib/gateway-models.mjs'

if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke:packages[:core|:gui|:gateway]`.\n')
  process.exit(1)
}

const mode = process.argv[2] || process.env.SMOKE_PACKAGES_MODE || 'all'
const validModes = new Set(['all', 'core', 'gui', 'gateway'])
if (!validModes.has(mode)) {
  process.stderr.write(`Invalid mode: ${mode}. Use one of: all, core, gui, gateway.\n`)
  process.exit(1)
}

function pass(name, detail = '') {
  process.stdout.write(`PASS ${name}${detail ? ` - ${detail}` : ''}\n`)
}

function fail(name, error) {
  const msg = error instanceof Error ? error.message : String(error)
  process.stderr.write(`FAIL ${name} - ${msg}\n`)
  process.exitCode = 1
}

async function check(name, fn) {
  try {
    const detail = await fn()
    pass(name, detail)
  } catch (error) {
    fail(name, error)
  }
}

async function runCoreSuite() {
  process.stdout.write('\n== CORE ==\n')

  await check('audio-capture-napi', async () => {
    const mod = await import('audio-capture-napi')
    if (typeof mod.isNativeAudioAvailable !== 'function') {
      throw new Error('isNativeAudioAvailable not found')
    }
    return `available=${String(mod.isNativeAudioAvailable())}`
  })

  await check('image-processor-napi', async () => {
    const mod = await import('image-processor-napi')
    if (typeof mod.getNativeModule !== 'function') {
      throw new Error('getNativeModule not found')
    }
    const native = mod.getNativeModule()
    if (!native || typeof native.processImage !== 'function') {
      throw new Error('native module contract invalid')
    }
    return 'native wrapper ready'
  })

  await check('modifiers-napi', async () => {
    const mod = await import('modifiers-napi')
    if (typeof mod.prewarm !== 'function') {
      throw new Error('prewarm not found')
    }
    mod.prewarm()
    return `shift=${String(mod.isModifierPressed?.('shift') ?? false)}`
  })

  await check('url-handler-napi', async () => {
    const mod = await import('url-handler-napi')
    if (typeof mod.waitForUrlEvent !== 'function') {
      throw new Error('waitForUrlEvent not found')
    }
    const value = mod.waitForUrlEvent(1)
    return `event=${value ? 'present' : 'none'}`
  })
}

async function runGuiSuite() {
  process.stdout.write('\n== GUI ==\n')

  await check('@ant/claude-for-chrome-mcp', async () => {
    const mod = await import('@ant/claude-for-chrome-mcp')
    if (!Array.isArray(mod.BROWSER_TOOLS)) {
      throw new Error('BROWSER_TOOLS not found')
    }
    return `tools=${String(mod.BROWSER_TOOLS.length)}`
  })

  await check('@ant/computer-use-input', async () => {
    const mod = await import('@ant/computer-use-input')
    if (!mod.default || typeof mod.default.isSupported !== 'boolean') {
      throw new Error('default.isSupported missing')
    }
    return `supported=${String(mod.default.isSupported)}`
  })

  await check('@ant/computer-use-mcp', async () => {
    const mod = await import('@ant/computer-use-mcp')
    if (typeof mod.buildComputerUseTools !== 'function') {
      throw new Error('buildComputerUseTools not found')
    }
    const tools = mod.buildComputerUseTools(
      {
        screenshotFiltering: 'native',
        platform: process.platform === 'win32' ? 'win32' : 'darwin',
      },
      'pixels',
    )
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error('empty tools list')
    }
    return `tools=${String(tools.length)}`
  })

  await check('@ant/computer-use-swift', async () => {
    try {
      const mod = await import('@ant/computer-use-swift')
      if (!mod.default) {
        throw new Error('default export missing')
      }
      return 'loaded'
    } catch (error) {
      if (process.platform !== 'darwin') {
        return 'expected macOS-only load failure'
      }
      throw error
    }
  })
}

async function runGatewaySuite() {
  process.stdout.write('\n== GATEWAY ==\n')

  const base = process.env.SMOKE_GATEWAY_BASE_URL
  const key = process.env.SMOKE_GATEWAY_API_KEY

  if (!base || !key) {
    pass('gateway-env', 'skipped (set SMOKE_GATEWAY_BASE_URL + SMOKE_GATEWAY_API_KEY)')
    return
  }

  await check('gateway-models-endpoint', async () => {
    const { endpoint, models } = await fetchGatewayModels(base, key)
    return `models=${String(models.length)} endpoint=${endpoint}`
  })
}

if (mode === 'all' || mode === 'core') {
  await runCoreSuite()
}

if (mode === 'all' || mode === 'gui') {
  await runGuiSuite()
}

if (mode === 'all' || mode === 'gateway') {
  await runGatewaySuite()
}

if (process.exitCode && process.exitCode !== 0) {
  throw new Error('Package smoke test failed')
}

process.stdout.write(`\nPackage smoke test completed successfully (mode=${mode}).\n`)
