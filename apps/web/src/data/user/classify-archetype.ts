'use server';

import { authActionClient } from '@/lib/safe-action';
import { classifyArchetype } from '@/lib/ai/provider';
import { createSupabaseClient } from '@/supabase-clients/server';
import { z } from 'zod';

const classifyArchetypeSchema = z.object({
  leadId: z.uuid(),
});

/**
 * First-pass marketing agent: reads a lead + its quote and classifies the
 * homeowner into the single most relevant archetype (family / investor /
 * environmentalist / skeptic), with confidence, signals and reasoning.
 *
 * Standalone and stateless — returns the classification, writes nothing.
 * The orchestrator (Phase 2.5) can call this before defining a strategy.
 */
export const classifyArchetypeAction = authActionClient
  .schema(classifyArchetypeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();

    // Lead con verificación de ownership
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('installer_id', ctx.userId)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    // Quote asociado (RLS verifica ownership vía lead)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (quoteError || !quote) {
      throw new Error('Quote not found');
    }

    const classification = await classifyArchetype(lead, quote);

    return classification;
  });
