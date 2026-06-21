import { PROBLEM_CODES } from '@/lib/problem-codes';
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
  problemCodes: z
    .array(
      z.object({
        code: z.enum(PROBLEM_CODES),
        confidence: z.number().min(0).max(1),
        evidence: z.string().min(20).max(500),
      })
    )
    .min(1)
    .max(3),
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
    predictedCode: z.enum(PROBLEM_CODES),
  recommendedAction: z.string().min(20).max(500),
  evidence: z.string().min(40).max(1200),
});

export type GeneratedOracle = z.infer<typeof oracleSchema>;

// Inbound customer reply categorizer. Reads a customer's email reply and
// classifies intent so the orchestrator can react (advance / hold / escalate).
export const inboundCategoryEnum = z.enum([
  'interested',
  'objection',
  'ghost_risk',
  'ready_to_close',
]);

export const inboundSchema = z.object({
  category: inboundCategoryEnum,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(600),
  suggestedNextStep: z.string().min(10).max(300),
});

export type InboundCategory = z.infer<typeof inboundCategoryEnum>;
export type ClassifiedInbound = z.infer<typeof inboundSchema>;

// Strategy adaptation: after a customer reply, rewrite the remaining unsent
// outreach messages to directly tackle the customer's concern, keeping each
// channel's role and the persona's tone. Returns one adapted message per
// channel that was passed in (the unsent ones).
export const channelEnum = z.enum(['email', 'sms', 'call', 'voice']);

export const adaptedMessageSchema = z.object({
  channel: channelEnum,
  // subject only meaningful for email; null for other channels.
  // Must be nullable (not optional) — OpenAI strict mode requires every key.
  subject: z.string().max(120).nullable(),
  body: z.string().min(10).max(2500),
  goal: z.string().min(10).max(300),
});

export const adaptStrategySchema = z.object({
  messages: z.array(adaptedMessageSchema).min(1).max(4),
});

export type AdaptedMessage = z.infer<typeof adaptedMessageSchema>;
export type AdaptedStrategy = z.infer<typeof adaptStrategySchema>;

// A/B testing: given one already-drafted message, produce a single contrasting
// variant for the SAME channel and the SAME underlying goal — a deliberately
// different angle (tone / framing / hook) so the installer can pick the one
// they'd actually send. `angle` is a short human label for how Variant B
// differs (e.g. "ROI-led, numbers-forward" vs "reassurance-led"). subject is
// nullable (only meaningful for email) — OpenAI strict mode requires every key.
export const messageVariantSchema = z.object({
  angle: z.string().min(3).max(80),
  subject: z.string().max(120).nullable(),
  body: z.string().min(10).max(2500),
});

export type GeneratedMessageVariant = z.infer<typeof messageVariantSchema>;
