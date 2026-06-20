'use server';

import { generateOracle } from '@/lib/ai/provider';
import { buildOraclePrompt } from '@/lib/ai/prompts';
import { authActionClient } from '@/lib/safe-action';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const generateOracleSchema = z.object({
  leadId: z.uuid(),
});

export const generateOracleAction = authActionClient
  .schema(generateOracleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { leadId } = parsedInput;
    const supabase = await createSupabaseClient();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('installer_id', ctx.userId)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (quoteError || !quote) {
      throw new Error('Quote not found');
    }

    const { data: strategy, error: strategyError } = await supabase
      .from('strategies')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (strategyError) {
      throw new Error('Failed to load strategy signals');
    }

    const { data: problemCodes, error: problemCodesError } = await supabase
      .from('problem_codes')
      .select('code, confidence, evidence')
      .eq('lead_id', leadId)
      .is('resolved_at', null)
      .order('confidence', { ascending: false });

    if (problemCodesError) {
      throw new Error('Failed to load problem-code diagnosis');
    }

    const oracle = await generateOracle(
      buildOraclePrompt(lead, quote, strategy, problemCodes)
    );

    const { data: prediction, error: predictionError } = await supabase
      .from('predictions')
      .insert({
        lead_id: leadId,
        sign_prob: oracle.signProbability,
        ghost_risk: oracle.ghostRisk,
        predicted_code: oracle.predictedCode,
        recommended_action: oracle.recommendedAction,
        evidence: oracle.evidence,
      })
      .select()
      .single();

    if (predictionError || !prediction) {
      throw new Error('Failed to save Oracle prediction');
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    return { predictionId: prediction.id };
  });
