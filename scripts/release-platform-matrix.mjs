import { getReleasePlatformMatrix } from './lib/release-platforms.mjs'

process.stdout.write(`${JSON.stringify(getReleasePlatformMatrix())}\n`)
