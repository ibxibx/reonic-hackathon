import type { Database } from '@/lib/database.types';

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
  strategy: Strategy | null
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

## Task
- signProbability: integer 0-100 chance the lead signs if handled well.
- ghostRisk: integer 0-100 chance the lead stops responding without a timely relevant touch.
- predictedCode: a concise provisional blocker code such as P2, F1, T2, or C1.
- recommendedAction: exactly one action with channel, timing, and angle.
- evidence: 2-4 specific facts, clearly separating facts from inference.

## Rules
- Use only the supplied data. Do not invent incentives, conversations, rates, deadlines, or intent.
- There are no interaction records yet; do not claim a message was opened, ignored, or answered.
- Use middle-range probabilities when evidence is limited.
- Return only valid JSON matching the schema.`;
}


export function buildInboundPrompt(
  lead: Lead,
  strategy: Strategy | null,
  replyBody: string
): string {
  return `You are the inbound triage agent for a solar installer's sales dashboard. A customer has REPLIED to one of our outreach messages. Read their reply and classify their intent so the dashboard can adjust the next marketing step. You do NOT write a reply — you only categorize and recommend.

## The 4 categories
- interested: engaged and asking questions, wants more info, positive but not yet committing. Keep nurturing.
- objection: raised a specific concern or blocker (price, timing, doubt, comparing competitors, "panels in winter?"). Needs objection handling before advancing.
- ghost_risk: cold, dismissive, non-committal, "not now", "we'll think about it", or signs they're disengaging. Needs a re-engagement touch.
- ready_to_close: strong buying signals — asking about contracts, timelines, next steps, payment, "let's do it". Escalate toward closing.

## Customer context
- Name: ${lead.name}
- Current lead status: ${lead.status}
- Detected persona: ${strategy?.persona_detected || 'Unknown'}

## The customer's reply
"""
${replyBody}
"""

## Task
1. Pick the SINGLE best category from the 4 above.
2. Give confidence 0-1 (lower it when the reply is short or ambiguous).
3. reasoning: cite the specific words/phrases in their reply that drove the category.
4. suggestedNextStep: one concrete next marketing move for the installer, matched to the category and this persona (channel + angle). E.g. "Send a reassurance voice note addressing winter-performance doubt."

## Rules
- Base the category ONLY on the reply text and the context above. Do not invent details.
- If the reply is genuinely ambiguous, pick the closest fit with lower confidence — never refuse.
- Return only valid JSON matching the schema.`;
}
