import type { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { buildArchetypePrompt } from './prompts';
import {
  archetypeSchema,
  strategySchema,
  type ClassifiedArchetype,
  type GeneratedStrategy,
} from './schemas';

type Lead = Database['public']['Tables']['leads']['Row'];
type Quote = Database['public']['Tables']['quotes']['Row'];

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateStrategy(
  _lead: Lead,
  _quote: Quote,
  systemPrompt: string
): Promise<GeneratedStrategy> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const result = await generateObject({
      model: openai(model),
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


export async function classifyArchetype(
  lead: Lead,
  quote: Quote
): Promise<ClassifiedArchetype> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const result = await generateObject({
      model: openai(model),
      schema: archetypeSchema,
      system: buildArchetypePrompt(lead, quote),
      prompt: `Classify this lead into the single most relevant archetype.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(15000), // classification is lighter than full strategy
    });

    return result.object;
  } catch (error) {
    console.error('AI archetype classification error:', error);
    throw new AppError(
      'Failed to classify archetype',
      'AI_CLASSIFICATION_ERROR',
      500
    );
  }
}
