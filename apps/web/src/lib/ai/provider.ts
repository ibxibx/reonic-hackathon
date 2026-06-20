import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import {
  adaptStrategySchema,
  archetypeSchema,
  inboundSchema,
  oracleSchema,
  strategySchema,
  type AdaptedStrategy,
  type ClassifiedArchetype,
  type ClassifiedInbound,
  type GeneratedOracle,
  type GeneratedStrategy,
} from './schemas';
import type { Database } from '@/lib/database.types';
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

export async function generateOracle(
  systemPrompt: string
): Promise<GeneratedOracle> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const timer = startTimer();
    logStep('strategy', 'Oracle AI call → generateObject', { model });
    const result = await generateObject({
      model: openai(model),
      schema: oracleSchema,
      system: systemPrompt,
      prompt: 'Generate the Oracle prediction for this lead.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
    });
    logStep('strategy', 'Oracle AI call ✓', {
      ms: timer(),
      signProbability: result.object.signProbability,
      ghostRisk: result.object.ghostRisk,
      predictedCode: result.object.predictedCode,
    });
    return result.object;
  } catch (error) {
    logError('strategy', 'Oracle AI call failed', error);
    console.error('Oracle generation error:', error);
    throw new AppError(
      'Failed to generate Oracle prediction',
      'AI_GENERATION_ERROR',
      500
    );
  }
}


export async function categorizeInbound(
  systemPrompt: string
): Promise<ClassifiedInbound> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const timer = startTimer();
    logStep('inbound', 'AI call → generateObject', { model });
    const result = await generateObject({
      model: openai(model),
      schema: inboundSchema,
      system: systemPrompt,
      prompt: 'Categorize this customer reply.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(15000),
    });
    logStep('inbound', 'AI call ✓', {
      ms: timer(),
      category: result.object.category,
      confidence: result.object.confidence,
    });
    return result.object;
  } catch (error) {
    logError('inbound', 'AI call failed', error);
    console.error('Inbound categorization error:', error);
    throw new AppError(
      'Failed to categorize inbound reply',
      'AI_CLASSIFICATION_ERROR',
      500
    );
  }
}


export async function adaptStrategy(
  systemPrompt: string
): Promise<AdaptedStrategy> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const timer = startTimer();
    logStep('inbound', 'adapt AI call → generateObject', { model });
    const result = await generateObject({
      model: openai(model),
      schema: adaptStrategySchema,
      system: systemPrompt,
      prompt: 'Rewrite the remaining messages to tackle the concern.',
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(25000),
    });
    logStep('inbound', 'adapt AI call ✓', {
      ms: timer(),
      rewritten: result.object.messages.length,
    });
    return result.object;
  } catch (error) {
    logError('inbound', 'adapt AI call failed', error);
    console.error('Strategy adaptation error:', error);
    throw new AppError(
      'Failed to adapt strategy',
      'AI_GENERATION_ERROR',
      500
    );
  }
}
