'use server';

import { authActionClient } from '@/lib/safe-action';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const leadIdSchema = z.object({
  leadId: z.uuid(),
});

/**
 * Phase 2.5 Orchestrator — per-lead strategy-execution state.
 * DB is the source of truth for "which step of the sequence is this lead on".
 * These actions are deterministic TS+SQL — no AI calls. The strategy (what each
 * step IS) is generated elsewhere by lib/ai; the orchestrator only tracks
 * execution position + status.
 */

// Verify the lead belongs to the current installer. Returns lead_id on success.
async function assertLeadOwnership(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  leadId: string,
  userId: string
) {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('installer_id', userId)
    .single();

  if (error || !lead) {
    throw new Error('Lead not found');
  }
  return lead.id;
}

/**
 * Seed (or reset) the orchestration row for a lead from its latest strategy.
 * total_steps = number of messages in that strategy. Idempotent: upserts on
 * the unique lead_id, resetting the lead to step 0 / not_started.
 */
export const initOrchestrationAction = authActionClient
  .schema(leadIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();
    await assertLeadOwnership(supabase, leadId, ctx.userId);

    // Latest strategy for this lead
    const { data: strategy, error: strategyError } = await supabase
      .from('strategies')
      .select('id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (strategyError || !strategy) {
      throw new Error('No strategy found for this lead — generate one first');
    }

    // Step count = number of messages in that strategy
    const { count, error: countError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('strategy_id', strategy.id);

    if (countError) {
      throw new Error('Failed to count strategy steps');
    }

    const totalSteps = count ?? 0;

    const { error: upsertError } = await supabase
      .from('lead_orchestration')
      .upsert(
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

    if (upsertError) {
      throw new Error('Failed to initialize orchestration');
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    return { totalSteps, currentStep: 0 };
  });

/**
 * Advance the lead one step forward in its sequence. Flips status:
 * completed when the last step is reached, otherwise awaiting_reply
 * (a touch was just sent, now we wait). No-op past the end.
 */
export const advanceStepAction = authActionClient
  .schema(leadIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();
    await assertLeadOwnership(supabase, leadId, ctx.userId);

    const { data: state, error: stateError } = await supabase
      .from('lead_orchestration')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (stateError || !state) {
      throw new Error('Orchestration not initialized for this lead');
    }

    if (state.current_step >= state.total_steps) {
      // Already at the end — mark completed, nothing to advance.
      const { error } = await supabase
        .from('lead_orchestration')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId);
      if (error) throw new Error('Failed to update orchestration');
      revalidatePath(`/leads/${leadId}`);
      return { currentStep: state.current_step, status: 'completed' as const };
    }

    const nextStep = state.current_step + 1;
    const isLast = nextStep >= state.total_steps;
    const nextStatus = isLast ? 'completed' : 'awaiting_reply';

    const { error: updateError } = await supabase
      .from('lead_orchestration')
      .update({
        current_step: nextStep,
        status: nextStatus,
        next_action_at: isLast ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    if (updateError) {
      throw new Error('Failed to advance step');
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    return { currentStep: nextStep, status: nextStatus };
  });

/**
 * Read the current orchestration state for a lead. Returns null if not yet
 * initialized (lead has no orchestration row).
 */
export const getOrchestrationStateAction = authActionClient
  .schema(leadIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();
    await assertLeadOwnership(supabase, leadId, ctx.userId);

    const { data: state } = await supabase
      .from('lead_orchestration')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle();

    return state ?? null;
  });
