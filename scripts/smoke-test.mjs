import { spawnSync } from 'node:child_process'

if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke`.\n')
  process.exit(1)
}

function run(command, args, env = {}) {
  const r = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  })
  return { ...r, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function mustPass(name, command, args, check, env) {
  const r = run(command, args, env)
  process.stdout.write(`\n== ${name} ==\n`)
  process.stdout.write(`exit: ${String(r.status ?? r.signal ?? 'unknown')}\n`)
  if (r.stdout.trim()) process.stdout.write(`${r.stdout.trim()}\n`)
  if (r.stderr.trim()) process.stdout.write(`${r.stderr.trim()}\n`)
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${name} failed with ${r.status}`)
  if (check && !check(r)) throw new Error(`${name} output check failed`)
}

mustPass('build', 'bun', ['run', 'build'], r => r.stdout.includes('Built ./cli'))
mustPass('version', './cli', ['--version'], r => r.stdout.length > 0)
mustPass('help', './cli', ['--help'], r => r.stdout.includes('Usage:'))

const gateway = process.env.SMOKE_GATEWAY_BASE_URL
const key = process.env.SMOKE_GATEWAY_API_KEY
if (gateway && key) {
  mustPass(
    'gateway-model-discovery',
    'bun',
    ['-e', `
      const base = process.env.SMOKE_GATEWAY_BASE_URL?.replace(/\\/+$/, '');
      const key = process.env.SMOKE_GATEWAY_API_KEY;
      if (!base || !key) throw new Error('Missing SMOKE_GATEWAY_* env');

      const getPathname = (url) => {
        try {
          return new URL(url).pathname || '';
        } catch {
          const schemeSep = url.indexOf('://');
          const hostStart = schemeSep >= 0 ? schemeSep + 3 : 0;
          const pathStart = url.indexOf('/', hostStart);
          return pathStart >= 0 ? url.slice(pathStart) : '';
        }
      };

      const pathname = getPathname(base).replace(/\\/+$/, '');
      const candidates = /^\\/v\\d+$/.test(pathname)
        ? [base + '/models']
        : [base + '/v1/models'];

      const extract = (payload) => {
        const listFrom = (items) => (items || []).map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') return item.id || item.model || item.name || null;
          return null;
        }).filter(Boolean);
        if (Array.isArray(payload)) return listFrom(payload);
        if (!payload || typeof payload !== 'object') return [];
        if (Array.isArray(payload.data)) return listFrom(payload.data);
        if (Array.isArray(payload.models)) return listFrom(payload.models);
        return [];
      };

      let models = [];
      for (const url of candidates) {
        try {
          const res = await fetch(url, { headers: { 'x-api-key': key } });
          if (!res.ok) continue;
          const data = await res.json();
          models = extract(data);
          if (models.length > 0) break;
        } catch {
          // no-op
        }
      }
      if (models.length === 0) throw new Error('No models discovered from mapped gateway endpoint');
      console.log('discovered models:', models.length);
      console.log('endpoint used:', candidates[0]);
    `],
    r => r.stdout.includes('discovered models:'),
    {
      SMOKE_GATEWAY_BASE_URL: gateway,
      SMOKE_GATEWAY_API_KEY: key,
    },
  )
}

process.stdout.write('\nSmoke test completed successfully.\n')
