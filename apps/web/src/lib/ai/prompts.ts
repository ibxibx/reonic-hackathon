import type { Database } from '@/lib/database.types';
import { PROBLEM_CODE_LIBRARY, PROBLEM_CODES } from '@/lib/problem-codes';

type Lead = Database['public']['Tables']['leads']['Row'];
type Quote = Database['public']['Tables']['quotes']['Row'];
type Strategy = Database['public']['Tables']['strategies']['Row'];

export function buildStrategyPrompt(lead: Lead, quote: Quote): string {
  return `You are an expert solar sales strategist. Generate a personalized multi-channel closing strategy.

## Homeowner data
- Name: ${lead.name}
- Email: ${lead.email}
- Phone: ${lead.phone}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}

## Quote data
- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}

## Task
1. Detect one persona: family, investor, environmentalist, or skeptic; include 1-5 specific signals.
2. Write a strategy summary and rationale that explain why each channel, tone, and timing is right for this homeowner.
3. Generate email, SMS, call, and voice messages. Every goal must state why this channel, why this tone, and why now for this person.
4. Return 1-3 priority-ordered problemCodes. Each code must be one of the allowed codes below, with confidence (0-1) and evidence grounded in the homeowner or quote data.

## Allowed problem codes
${PROBLEM_CODES.map(
  (code) =>
    `- ${code}: ${PROBLEM_CODE_LIBRARY[code].label} — ${PROBLEM_CODE_LIBRARY[code].counterStrategy}`
).join('\n')}

## Tone calibration
- family: warm, reassurance-first, reliability and household comfort.
- investor: precise, numbers-forward, ROI and payback.
- environmentalist: mission-driven, CO2 and energy independence.
- skeptic: evidence-led, transparent, no hype.

## Rules
- Use only the provided data; do not invent incentives, rates, guarantees, or legislation.
- Make every channel visibly different in both tone and content.
- Keep SMS concise, voice natural, and call scripts scannable.
- Return only valid JSON matching the schema.`;
}

export function buildArchetypePrompt(lead: Lead, quote: Quote): string {
  return `You are a marketing-strategy classifier for a solar installer. Assign the single best buyer archetype and explain why; do not write marketing messages.

## Archetypes
- family: stability, household savings, reliability, and predictable monthly cost.
- investor: ROI, payback, asset value, larger systems, high bills, or cash financing.
- environmentalist: sustainability, emissions, clean energy, or independence.
- skeptic: proof, transparency, risk reassurance, references, or cautious hesitation.

## Homeowner data
- Name: ${lead.name}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}

## Quote data
- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}

## Task
Pick one archetype, give confidence from 0-1, list 1-5 evidence-based signals, and explain why it wins over the closest alternative.

## Rules
- Use only the supplied data. Do not invent details.
- Lower confidence when evidence is thin or conflicting.
- Return only valid JSON matching the schema.`;
}

export function buildOraclePrompt(
  lead: Lead,
  quote: Quote,
  strategy: Strategy | null,
  problemCodes: Array<{ code: string; confidence: number; evidence: string }>
): string {
  return `You are the Oracle for a solar installer. Assess this homeowner's likelihood of signing and going quiet. Be decisive but calibrated: these are sales prioritization signals, not facts or guarantees.

## Homeowner data
- Name: ${lead.name}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}
- Current lead status: ${lead.status}

## Quote data
- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}

## Existing strategy signals
- Persona: ${strategy?.persona_detected || 'Not generated'}
- Signals: ${strategy?.signals.join('; ') || 'None'}
- Strategy summary: ${strategy?.strategy_summary || 'None'}

## Diagnosed problem codes
${
  problemCodes.length > 0
    ? problemCodes
        .map(
          (problemCode) =>
            `- ${problemCode.code} (${Math.round(problemCode.confidence * 100)}%): ${problemCode.evidence}`
        )
        .join('\n')
    : '- No diagnosis generated yet.'
}

## Task
- signProbability: integer 0-100 chance the lead signs if handled well.
- ghostRisk: integer 0-100 chance the lead stops responding without a timely relevant touch.
- predictedCode: the single best matching code from the diagnosed stack. If no stack exists, use one allowed code only when the supplied data supports it.
- recommendedAction: exactly one action with channel, timing, and angle.
- evidence: 2-4 specific facts, clearly separating facts from inference.

## Rules
- Use only the supplied data. Do not invent incentives, conversations, rates, deadlines, or intent.
- There are no interaction records yet; do not claim a message was opened, ignored, or answered.
- Use middle-range probabilities when evidence is limited.
- Return only valid JSON matching the schema.`;
}
