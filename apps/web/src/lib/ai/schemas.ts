import { z } from 'zod';

export const personaEnum = z.enum([
  'family',
  'investor',
  'environmentalist',
  'skeptic',
]);

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
