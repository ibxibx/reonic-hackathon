'use server';

import { scoreOracle } from '@/lib/oracle/engine';
import { authActionClient } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const generateOracleSchema = z.object({
  leadId: z.uuid(),
});

/**
 * Run the hybrid Oracle engine for a lead and persist a rich snapshot.
 * RLS is enforced inside the engine (installer-scoped Supabase client); the
 * engine degrades gracefully (LLM mode, missing predictions table) and never
 * throws on thin data. A5 finalizes engine behavior + richer return in Phase B3.
 */
export const generateOracleAction = authActionClient
  .schema(generateOracleSchema)
  .action(async ({ parsedInput }) => {
    const { leadId } = parsedInput;

    const score = await scoreOracle(leadId);

    revalidatePath(`/leads/${leadId}`);
    revalidatePath(`/leads/${leadId}/strategy`);

    return {
      predictionId: score.predictionId,
      mode: score.mode,
      calibrated: score.calibrated,
    };
  });
