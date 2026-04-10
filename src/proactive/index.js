/**
 * Proactive mode stub module.
 * The full proactive subsystem is gated on feature('PROACTIVE') || feature('KAIROS').
 * These stubs ensure the code compiles when KAIROS is enabled.
 */

let active = false;
let paused = false;
let contextBlocked = false;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}

export function isProactiveActive() {
  return active;
}

export function isProactivePaused() {
  return paused;
}

export function activateProactive(_source) {
  active = true;
  paused = false;
  emit();
}

export function deactivateProactive() {
  active = false;
  emit();
}

export function pauseProactive() {
  paused = true;
  emit();
}

export function resumeProactive() {
  paused = false;
  emit();
}

export function setContextBlocked(val) {
  contextBlocked = val;
  emit();
}

export function subscribeToProactiveChanges(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNextTickAt() {
  return null;
}
