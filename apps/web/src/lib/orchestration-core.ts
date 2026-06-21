import 'server-only';
import type { createSupabaseClient } from '@/supabase-clients/server';
import { logStep } from '@/lib/ai/agent-log';

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseClient>>;

/**
 * Core orchestration state logic — plain functions, no auth wrapper.
 * Callers MUST have already verified the lead belongs to the current user
 * (RLS also enforces this at the DB level). Used by both the server actions
 * in data/user/orchestration.ts and the send-actions in data/user/messages.ts
 * so the orchestrator advances automatically when a touch is sent.
 *
 * Deterministic TS + SQL — no AI calls.
 */

/**
 * Seed (or reset) the orchestration row for a lead from its latest strategy.
 * total_steps = number of messages in that strategy. Idempotent upsert on
 * the unique lead_id. Returns null if the lead has no strategy yet.
 */
export async function seedOrchestration(
  supabase: SupabaseServerClient,
  leadId: string
): Promise<{ totalSteps: number; currentStep: number } | null> {
  const { data: strategy } = await supabase
    .from('strategies')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!strategy) {
    logStep('orchestrator', 'seed skipped (no strategy)', { leadId });
    return null;
  }

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('strategy_id', strategy.id);

  const totalSteps = count ?? 0;

  const { error } = await supabase.from('lead_orchestration').upsert(
    {
      lead_id: leadId,
      strategy_id: strategy.id,
      current_step: 0,
      total_steps: totalSteps,
      status: totalSteps > 0 ? 'in_progress' : 'not_started',
      next_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lead_id' }
  );

  if (error) {
    throw new Error('Failed to initialize orchestration');
  }

  logStep('orchestrator', 'seeded', { leadId, totalSteps, currentStep: 0 });
  return { totalSteps, currentStep: 0 };
}

/**
 * Advance the lead one step forward. Flips status: completed at the last step,
 * otherwise awaiting_reply. No-op (returns current state) if not initialized
 * or already at the end — safe to call opportunistically after a send.
 */
export async function bumpStep(
  supabase: SupabaseServerClient,
  leadId: string
): Promise<{ currentStep: number; status: string } | null> {
  const { data: state } = await supabase
    .from('lead_orchestration')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (!state) {
    // Not initialized — nothing to advance. Caller may seed first if desired.
    logStep('orchestrator', 'bump skipped (not initialized)', { leadId });
    return null;
  }

  if (state.current_step >= state.total_steps) {
    await supabase
      .from('lead_orchestration')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('lead_id', leadId);
    logStep('orchestrator', 'bump → already at end', { leadId });
    return { currentStep: state.current_step, status: 'completed' };
  }

  const nextStep = state.current_step + 1;
  const isLast = nextStep >= state.total_steps;
  const nextStatus = isLast ? 'completed' : 'awaiting_reply';

  const { error } = await supabase
    .from('lead_orchestration')
    .update({
      current_step: nextStep,
      status: nextStatus,
      next_action_at: isLast ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId);

  if (error) {
    throw new Error('Failed to advance step');
  }

  logStep('orchestrator', 'bumped', {
    leadId,
    from: state.current_step,
    to: nextStep,
    status: nextStatus,
  });
  return { currentStep: nextStep, status: nextStatus };
}
