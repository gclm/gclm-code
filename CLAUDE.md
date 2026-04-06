# CLAUDE.md

This file provides guidance to Gclm Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
# Install dependencies
bun install

# Standard build (dist/cli.js + dist/gclm)
bun run build

# Dev build (dist/cli.js + dist/gclm-dev)
bun run build:dev

# Dev build with all experimental features (dist/gclm-dev)
bun run build:dev:full

# Compiled build (./gclm)
bun run compile

# Run from source without compiling
bun run dev
```

Run the built binary with `./dist/gclm` or `./dist/gclm-dev`. Set `ANTHROPIC_API_KEY` in the environment or use OAuth via `./dist/gclm /login`.

## High-level architecture

- **Entry point/UI loop**: src/entrypoints/cli.tsx bootstraps the CLI, with the main interactive UI in src/screens/REPL.tsx (Ink/React).
- **Command/tool registries**: src/commands.ts registers slash commands; src/tools.ts registers tool implementations. Implementations live in src/commands/ and src/tools/.
- **LLM query pipeline**: src/QueryEngine.ts coordinates message flow, tool use, and model invocation.
- **Core subsystems**:
  - src/services/: API clients, OAuth/MCP integration, analytics stubs
  - src/state/: app state store
  - src/hooks/: React hooks used by UI/flows
  - src/components/: terminal UI components (Ink)
  - src/skills/: skill system
  - src/plugins/: plugin system
  - src/bridge/: IDE bridge
  - src/voice/: voice input
  - src/tasks/: background task management

## Build system

- scripts/build.mjs is the unified build script and feature-flag bundler. Supports `--dev`, `--compile`, `--feature=X`, and `--feature-set=dev-full`.