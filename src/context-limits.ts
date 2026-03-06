/**
 * Context window limits (max input tokens) for supported models.
 * Used to calculate context usage percentage and trigger auto-compact.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic - 200k context window
  'claude-opus-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-opus-4-1': 200_000,
  'claude-opus-4': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-3-5': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-opus-4-20250514': 200_000,

  // OpenAI
  'gpt-5.3-codex': 400_000,
  'gpt-5.4': 512_000,

  // OpenAI Codex CLI models
  'codex-mini': 200_000,
  'o3': 200_000,
  'o4-mini': 200_000,

  // Kimi
  'kimi-k2.5': 128_000,
};

/** Default context limit when model is not in the map */
export const DEFAULT_CONTEXT_LIMIT = 200_000;

/** Fraction of context window at which auto-compact should trigger */
export const COMPACT_THRESHOLD = 0.85;

export function getContextLimit(modelName: string): number {
  return MODEL_CONTEXT_LIMITS[modelName] ?? DEFAULT_CONTEXT_LIMIT;
}
