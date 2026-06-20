import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import {
  archetypeSchema,
  oracleSchema,
  strategySchema,
  type ClassifiedArchetype,
  type GeneratedOracle,
  type GeneratedStrategy,
} from './schemas';
import type { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';
import { buildArchetypePrompt } from './prompts';

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
      prompt: 'Generate a strategy for this lead.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
    });
    return result.object;
  } catch (error) {
    console.error('AI generation error:', error);
    throw new AppError('Failed to generate strategy', 'AI_GENERATION_ERROR', 500);
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
      prompt: 'Classify this lead into the single most relevant archetype.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(15000),
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

export async function generateOracle(
  systemPrompt: string
): Promise<GeneratedOracle> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const result = await generateObject({
      model: openai(model),
      schema: oracleSchema,
      system: systemPrompt,
      prompt: 'Generate the Oracle prediction for this lead.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
    });
    return result.object;
  } catch (error) {
    console.error('Oracle generation error:', error);
    throw new AppError(
      'Failed to generate Oracle prediction',
      'AI_GENERATION_ERROR',
      500
    );
  }
}
