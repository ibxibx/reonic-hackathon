import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import {
  archetypeSchema,
  oracleSchema,
  strategySchema,
  type ClassifiedArchetype,
  type GeneratedStrategy,
} from './schemas';
import type { Database } from '@/lib/database.types';
import type {
  GenerateOracleLlm,
  OracleLlmOutput,
} from '@/lib/oracle/contracts';
import { AppError } from '@/lib/errors';
import { buildArchetypePrompt } from './prompts';
import { logStep, logError, startTimer } from './agent-log';

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
    const timer = startTimer();
    logStep('strategy', 'AI call → generateObject', { model });
    const result = await generateObject({
      model: openai(model),
      schema: strategySchema,
      system: systemPrompt,
      prompt: 'Generate a strategy for this lead.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
    });
    logStep('strategy', 'AI call ✓', {
      ms: timer(),
      persona: result.object.persona,
      confidence: result.object.confidence,
      signals: result.object.signals.length,
    });
    return result.object;
  } catch (error) {
    logError('strategy', 'AI call failed', error);
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
    const timer = startTimer();
    logStep('archetype', 'AI call → generateObject', {
      model,
      lead: lead.id,
    });
    const result = await generateObject({
      model: openai(model),
      schema: archetypeSchema,
      system: buildArchetypePrompt(lead, quote),
      prompt: 'Classify this lead into the single most relevant archetype.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(15000),
    });
    logStep('archetype', 'AI call ✓', {
      ms: timer(),
      archetype: result.object.archetype,
      confidence: result.object.confidence,
      signals: result.object.signals.length,
    });
    return result.object;
  } catch (error) {
    logError('archetype', 'AI call failed', error);
    console.error('AI archetype classification error:', error);
    throw new AppError(
      'Failed to classify archetype',
      'AI_CLASSIFICATION_ERROR',
      500
    );
  }
}

/**
 * A4 — Oracle LLM call. Returns the qualitative layer (blockerCode +
 * recommendedAction + evidence, plus degraded-mode numbers and factor
 * narration) via generateObject + the upgraded oracleSchema. The engine (A5)
 * overrides the numbers with the fitted model in model mode. The caller
 * (A5/engine) builds the system prompt via buildOraclePrompt and passes it in.
 */
export const generateOracleLlm: GenerateOracleLlm = async (
  systemPrompt: string
): Promise<OracleLlmOutput> => {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const timer = startTimer();
    logStep('oracle', 'AI call → generateObject', { model });
    const result = await generateObject({
      model: openai(model),
      schema: oracleSchema,
      system: systemPrompt,
      prompt: 'Generate the Oracle prediction for this lead.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
    });
    logStep('oracle', 'AI call ✓', {
      ms: timer(),
      signProbability: result.object.signProbability,
      ghostRisk: result.object.ghostRisk,
      blockerCode: result.object.blockerCode,
      factors: result.object.factors.length,
    });
    return result.object as OracleLlmOutput;
  } catch (error) {
    logError('oracle', 'AI call failed', error);
    console.error('Oracle generation error:', error);
    throw new AppError(
      'Failed to generate Oracle prediction',
      'AI_GENERATION_ERROR',
      500
    );
  }
};
