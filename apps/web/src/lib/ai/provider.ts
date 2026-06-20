import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { strategySchema, type GeneratedStrategy } from './schemas';
import type { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';

type Lead = Database['public']['Tables']['leads']['Row'];
type Quote = Database['public']['Tables']['quotes']['Row'];

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateStrategy(
  _lead: Lead,
  _quote: Quote,
  systemPrompt: string
): Promise<GeneratedStrategy> {
  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    const result = await generateObject({
      model: anthropic(model),
      schema: strategySchema,
      system: systemPrompt,
      prompt: `Generate a strategy for this lead.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000), // 20s timeout
    });

    return result.object;
  } catch (error) {
    console.error('AI generation error:', error);
    throw new AppError(
      'Failed to generate strategy',
      'AI_GENERATION_ERROR',
      500
    );
  }
}
