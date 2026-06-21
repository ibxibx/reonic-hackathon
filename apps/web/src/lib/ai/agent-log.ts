import 'server-only';

/**
 * Dev-only structured console logging for agent execution steps.
 *
 * Prints a single tagged, timestamped line per step so the full end-to-end
 * flow of an agent run is greppable in the server console (filter by `[agent]`
 * or by a specific agent name). Silenced in production, or when DEBUG_AGENTS
 * is explicitly set to 'false'.
 *
 * Never logs secrets — callers pass small, safe summary objects (ids, counts,
 * personas, durations), not full prompts or API keys.
 */
const ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.DEBUG_AGENTS !== 'false';

type AgentName = 'archetype' | 'strategy' | 'orchestrator' | 'oracle';

export function logStep(
  agent: AgentName,
  step: string,
  data?: Record<string, unknown>
): void {
  if (!ENABLED) return;
  const ts = new Date().toISOString();
  const tag = `[agent:${agent}]`;
  if (data && Object.keys(data).length > 0) {
    console.log(`${ts} ${tag} ${step}`, data);
  } else {
    console.log(`${ts} ${tag} ${step}`);
  }
}

/**
 * Log a failed step with the error message only (not the full stack/secrets).
 */
export function logError(
  agent: AgentName,
  step: string,
  error: unknown
): void {
  if (!ENABLED) return;
  const ts = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  console.log(`${ts} [agent:${agent}] ✗ ${step} — ${message}`);
}

/**
 * Returns a millisecond timer for measuring step duration.
 * Usage: const t = startTimer(); ... logStep(a, 'done', { ms: t() });
 */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
