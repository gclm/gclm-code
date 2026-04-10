// Dream mode stub.
// The actual dream/consolidation logic lives in src/services/autoDream/.
// This module provides the legacy KAIROS_DREAM entry point.

import { initAutoDream, executeAutoDream } from './services/autoDream/autoDream.js';

/**
 * Register the dream skill for the bundled skill system.
 * Delegates to the autoDream subsystem.
 */
export async function registerDreamSkill() {
  // The autoDream system is initialized via backgroundHousekeeping.
  // This legacy entry point just ensures it's available.
  initAutoDream();
  return { name: 'dream', description: 'Background memory consolidation' };
}

/**
 * Legacy dream trigger — delegates to autoDream.
 */
export async function executeDream(opts) {
  return executeAutoDream(opts);
}
