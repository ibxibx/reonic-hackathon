import { z } from 'zod';
import { blockerCodeEnum } from './blocker-taxonomy';

export const personaEnum = z.enum([
  'family',
  'investor',
  'environmentalist',
  'skeptic',
]);

// Standalone archetype classifier (first-pass agent). Returns only the
// matched archetype + why — does NOT generate a full strategy.
export const archetypeSchema = z.object({
  archetype: personaEnum,
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()).min(1).max(5),
  reasoning: z.string().min(40).max(600),
});

export type ClassifiedArchetype = z.infer<typeof archetypeSchema>;

export const strategySchema = z.object({
  persona: personaEnum,
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()).min(1).max(5),
  strategySummary: z.string().min(40).max(800),
  rationale: z.string().min(80).max(1500),
  email: z.object({
    subject: z.string().min(3).max(120),
    body: z.string().min(40).max(2500),
    goal: z.string().min(10).max(300),
  }),
  sms: z.object({
    body: z.string().min(10).max(320),
    goal: z.string().min(10).max(300),
  }),
  callScript: z.object({
    body: z.string().min(40).max(2500),
    goal: z.string().min(10).max(300),
  }),
  voiceScript: z.object({
    body: z.string().min(20).max(1200),
    goal: z.string().min(10).max(300),
  }),
});

export type GeneratedStrategy = z.infer<typeof strategySchema>;

// Mirrors contracts.OracleLlmOutput exactly. In degraded mode the LLM supplies
// the probabilities; in model mode the engine overrides them. `blockerCode` is
// the frozen taxonomy enum; `factors[]` is the LLM's narration over supplied
// model factors (never invented in model mode).
export const oracleSchema = z.object({
  signProbability: z.number().int().min(0).max(100),
  ghostRisk: z.number().int().min(0).max(100),
  signConfidence: z.number().min(0).max(100),
  ghostConfidence: z.number().min(0).max(100),
  blockerCode: blockerCodeEnum,
  factors: z
    .array(
      z.object({
        feature: z.string(),
        direction: z.enum(['increases', 'decreases']),
        weight: z.number(),
        plainText: z.string().min(1).max(300),
      })
    )
    .max(8),
  recommendedAction: z.string().min(20).max(500),
  evidence: z.string().min(40).max(1200),
});

export type GeneratedOracle = z.infer<typeof oracleSchema>;
