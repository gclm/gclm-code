/**
 * Assistant command stub.
 * The full assistant connection flow is gated on feature('KAIROS').
 * This stub ensures the CLI command registry compiles when KAIROS is enabled.
 * The actual assistant connection logic is handled in main.tsx.
 */
const assistantCommand = {
  name: 'assistant',
  description: 'Connect to a remote assistant session.',
  execute: async () => {
    // The actual assistant connection flow is handled in main.tsx
    // This command entry point exists for CLI registration only.
  },
};

export default assistantCommand;
