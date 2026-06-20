'use server';

import { authActionClient } from '@/lib/safe-action';
import { categorizeInbound } from '@/lib/ai/provider';
import { buildInboundPrompt } from '@/lib/ai/prompts';
import { logStep } from '@/lib/ai/agent-log';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const processInboundSchema = z.object({
  leadId: z.uuid(),
  body: z.string().min(1).max(5000),
});

/**
 * Demo: a customer reply "lands on the dashboard". This action persists the
 * inbound reply, AI-categorizes its intent (interested / objection /
 * ghost_risk / ready_to_close), stores the category, and reacts on the
 * orchestrator — changing the suggested next marketing step based on intent.
 *
 * Orchestrator reaction by category:
 *   - objection      → hold current step (handle the concern first), in_progress
 *   - ghost_risk     → pause the sequence (needs a re-engagement touch)
 *   - ready_to_close → flag for closing (awaiting_reply), keep step
 *   - interested     → keep nurturing, in_progress
 */
export const processInboundAction = authActionClient
  .schema(processInboundSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId, body } = parsedInput;
    const supabase = await createSupabaseClient();
    logStep('inbound', 'action → start', { leadId, chars: body.length });

    // Lead ownership
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('installer_id', ctx.userId)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    // Latest strategy for persona context (optional)
    const { data: strategy } = await supabase
      .from('strategies')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Categorize the reply
    logStep('inbound', 'action → categorizing', { leadId });
    const prompt = buildInboundPrompt(lead, strategy ?? null, body);
    const result = await categorizeInbound(prompt);

    // Persist the inbound + its category
    const { error: insertError } = await supabase
      .from('inbound_messages')
      .insert({
        lead_id: leadId,
        body,
        category: result.category,
        confidence: result.confidence,
        reasoning: result.reasoning,
        suggested_next_step: result.suggestedNextStep,
      });

    if (insertError) {
      throw new Error('Failed to save inbound message');
    }

    // React on the orchestrator (if one exists for this lead)
    const reactionByCategory: Record<string, string> = {
      objection: 'in_progress',
      ghost_risk: 'paused',
      ready_to_close: 'awaiting_reply',
      interested: 'in_progress',
    };
    const newStatus = reactionByCategory[result.category] ?? 'in_progress';

    const { data: orchestration } = await supabase
      .from('lead_orchestration')
      .select('lead_id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (orchestration) {
      await supabase
        .from('lead_orchestration')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('lead_id', leadId);
      logStep('inbound', 'action → orchestrator reacted', {
        leadId,
        category: result.category,
        newStatus,
      });
    } else {
      logStep('inbound', 'action → no orchestration to react on', { leadId });
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    logStep('inbound', 'action ✓', {
      leadId,
      category: result.category,
      newStatus,
    });

    return {
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      suggestedNextStep: result.suggestedNextStep,
      newStatus,
    };
  });
