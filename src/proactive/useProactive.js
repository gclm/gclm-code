// Proactive mode React hook stub.
// The full proactive subsystem is not included in this build.
import { useMemo } from 'react';

export function useProactive() {
  return useMemo(() => ({
    isProactiveActive: false,
    isProactivePaused: false,
    activateProactive: () => {},
    deactivateProactive: () => {},
    pauseProactive: () => {},
    resumeProactive: () => {},
    setContextBlocked: () => {},
  }), []);
}
