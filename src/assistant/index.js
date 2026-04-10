// KAIROS assistant mode module.
//
// Provides the assistant-mode latch, team initialization, and system prompt
// addendum. The assistant mode enables multi-agent collaboration where
// Agent(name: "foo") spawns teammates without explicit TeamCreate.

import { setCliTeammateModeOverride } from '../utils/swarm/backends/teammateModeSnapshot.js';
import { getOriginalCwd } from '../bootstrap/state.js';

// ── Mode latch ─────────────────────────────────────────────────────────

let forced = false;

/**
 * Set the assistant-mode latch. Called by --assistant daemon mode which
 * has already checked entitlement externally.
 */
export function markAssistantForced() {
  forced = true;
}

/**
 * Returns true if markAssistantForced() was called. Used as a short-circuit
 * so daemon-mode processes skip the GrowthBook gate re-check.
 */
export function isAssistantForced() {
  return forced;
}

/**
 * Returns true if assistant mode is active (either forced via --assistant
 * or via CLI `gc assistant` path). Checks process.argv for the assistant
 * subcommand and the forced latch.
 */
export function isAssistantMode() {
  if (forced) return true;
  // Check if launched via `gc assistant` or `gc assistant <sessionId>`
  const argv = process.argv.slice(2);
  return argv[0] === 'assistant';
}

// ── Team initialization ────────────────────────────────────────────────

/**
 * Pre-seed an in-process team so Agent(name: "foo") spawns teammates
 * without TeamCreate. Must run BEFORE setup() captures the teammateMode
 * snapshot.
 *
 * @returns {object} Context object for downstream telemetry
 */
export async function initializeAssistantTeam() {
  setCliTeammateModeOverride(true);
  return {
    teamInitialized: true,
    activatedAt: Date.now(),
  };
}

// ── System prompt ──────────────────────────────────────────────────────

/**
 * System prompt addendum appended when KAIROS is active. Gives the model
 * instructions about its assistant role and capabilities.
 */
export function getAssistantSystemPromptAddendum() {
  return (
    '# Assistant Mode\n\n' +
    'You are operating as part of a multi-agent assistant team. ' +
    'You can spawn specialized sub-agents by name to handle parallel tasks. ' +
    'Coordinate with teammates when appropriate and delegate work that ' +
    'benefits from parallelization.\n\n' +
    'The user will see a brief summary of your progress at checkpoints.'
  );
}

// ── Activation path (telemetry) ────────────────────────────────────────

/**
 * Returns the directory path where the assistant is activated, used for
 * analytics telemetry (assistantActivationPath in tengu_init event).
 */
export function getAssistantActivationPath() {
  try {
    return getOriginalCwd() || process.cwd();
  } catch {
    return undefined;
  }
}
