export const HARNESS_CONFIG = {
  defaultModel: 'claude-sonnet-4-6',
  maxIterations: 15,
  maxTokens: 8096,
  // Compress conversation history when estimated tokens exceed this fraction of the context window
  contextCompressionThreshold: 0.80,
  // Rough estimate: ~4 characters per token
  charsPerToken: 4,
  // Claude's usable context window for conversation history
  maxContextTokens: 180_000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
  },
  memory: {
    // Maximum number of insight lines kept in MEMORY.md per agent
    maxInsightLines: 50,
    // Max chars stored per insight entry
    insightMaxLength: 200,
  },
} as const;
