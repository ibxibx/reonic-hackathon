'use server';

import { authActionClient } from '@/lib/safe-action';
import { generateStrategy } from '@/lib/ai/provider';
import { buildStrategyPrompt } from '@/lib/ai/prompts';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const generateStrategySchema = z.object({
  leadId: z.uuid(),
});

export const generateStrategyAction = authActionClient
  .schema(generateStrategySchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();

    // Obtener lead con verificación de ownership
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('installer_id', ctx.userId)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    // Obtener quote asociado (RLS verifica ownership vía lead)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (quoteError || !quote) {
      throw new Error('Quote not found');
    }

    // Generar estrategia con IA PRIMERO. Si la IA falla (p. ej. sin API key),
    // lanzamos antes de borrar nada, conservando la estrategia/fallback actual.
    const systemPrompt = buildStrategyPrompt(lead, quote);
    const strategy = await generateStrategy(lead, quote, systemPrompt);

    // Eliminar la estrategia anterior SOLO tras una generación exitosa.
    await supabase.from('strategies').delete().eq('lead_id', leadId);

    // Crear strategy record
    const { data: strategyRecord, error: strategyError } = await supabase
      .from('strategies')
      .insert({
        lead_id: leadId,
        persona_detected: strategy.persona,
        persona_confidence: strategy.confidence,
        signals: strategy.signals,
        strategy_summary: strategy.strategySummary,
        rationale: strategy.rationale,
      })
      .select()
      .single();

    if (strategyError || !strategyRecord) {
      throw new Error('Failed to save strategy');
    }

    // Crear mensajes
    const messages = [
      {
        lead_id: leadId,
        strategy_id: strategyRecord.id,
        channel_type: 'email' as const,
        subject: strategy.email.subject,
        content: strategy.email.body,
        goal: strategy.email.goal,
        sequence_order: 1,
      },
      {
        lead_id: leadId,
        strategy_id: strategyRecord.id,
        channel_type: 'sms' as const,
        content: strategy.sms.body,
        goal: strategy.sms.goal,
        sequence_order: 2,
      },
      {
        lead_id: leadId,
        strategy_id: strategyRecord.id,
        channel_type: 'call' as const,
        content: strategy.callScript.body,
        goal: strategy.callScript.goal,
        sequence_order: 3,
      },
      {
        lead_id: leadId,
        strategy_id: strategyRecord.id,
        channel_type: 'voice' as const,
        content: strategy.voiceScript.body,
        goal: strategy.voiceScript.goal,
        sequence_order: 4,
      },
    ];

    const { error: messagesError } = await supabase
      .from('messages')
      .insert(messages);

    if (messagesError) {
      throw new Error('Failed to save messages');
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    return { strategyId: strategyRecord.id };
  });
