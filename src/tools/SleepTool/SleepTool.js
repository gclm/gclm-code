/**
 * SleepTool stub.
 * The full SleepTool implementation is gated on feature('PROACTIVE') || feature('KAIROS').
 * This stub ensures the code compiles when KAIROS is enabled.
 */
export const SleepTool = {
  name: 'Sleep',
  prompt: 'Pause execution and check back later. Use when there is nothing productive to do right now.',
};
