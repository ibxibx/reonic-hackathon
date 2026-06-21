import type { Database } from '@/lib/database.types';
import type { OraclePromptContext } from '@/lib/oracle/contracts';
import { BLOCKER_TAXONOMY } from './blocker-taxonomy';

type Lead = Database['public']['Tables']['leads']['Row'];
type Quote = Database['public']['Tables']['quotes']['Row'];

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

/** Round to a fixed number of decimals; tolerant of NaN/Infinity. */
function n(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(decimals);
}

function num(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(decimals);
}

function trendWord(slope: number): string {
  if (!Number.isFinite(slope) || slope === 0) return 'flat';
  return slope > 0 ? 'rising' : 'falling';
}

/** Render the taxonomy as a bullet list so the model picks exactly one code. */
function renderTaxonomy(): string {
  return (Object.keys(BLOCKER_TAXONOMY) as Array<keyof typeof BLOCKER_TAXONOMY>)
    .map((code) => {
      const info = BLOCKER_TAXONOMY[code];
      return `- ${code} (${info.name}): ${info.definition}`;
    })
    .join('\n');
}

/** Render the supplied model factors the LLM must narrate over (never invent). */
function renderFactors(factors: OraclePromptContext['factors']): string {
  if (factors.length === 0) {
    return '- (none supplied — no model drivers available in this mode)';
  }
  return factors
    .map(
      (f) =>
        `- ${f.feature} ${f.direction} ${f.target} (weight ${n(
          f.weight,
          3
        )}): ${f.plainText}`
    )
    .join('\n');
}

/**
 * Decide whether GHOST (going-quiet) reasoning is in play for this lead, so the
 * prompt can attach an honest engagement-decay framing only when it is relevant.
 * Ghost reasoning is "present" when ANY of:
 *   • the lead has been quiet for at least a day (daysSinceLastTouch >= 1),
 *   • the ghost-risk trend is rising (ghostRiskSlope > 0), or
 *   • a supplied model factor targets the ghost outcome.
 * Guarded against NaN so degenerate inputs never spuriously trip the block.
 */
function ghostReasoningPresent(ctx: OraclePromptContext): boolean {
  const { features, factors } = ctx;
  const quiet =
    Number.isFinite(features.daysSinceLastTouch) &&
    features.daysSinceLastTouch >= 1;
  const ghostRising =
    Number.isFinite(features.ghostRiskSlope) && features.ghostRiskSlope > 0;
  const ghostFactor = factors.some((f) => f.target === 'ghost');
  return quiet || ghostRising || ghostFactor;
}

/**
 * Honest, NUMBER-FREE engagement-decay framing for the ghost side. This is a
 * QUALITATIVE lens grounded in published lead-response / churn research (see
 * lib/oracle/churn-prior.ts): re-engagement odds fall sharply the longer a lead
 * stays quiet, and a lead being actively worked deep in a sequence is less
 * likely to go quiet. It deliberately injects NO specific figures, half-lives,
 * percentages, or rates — those live in the model layer, not the prompt — so the
 * LLM gains the correct directional intuition without any fabricated specifics.
 */
const GHOST_DECAY_FRAMING = `## Ghost (going-quiet) framing — directional only
Use this as a qualitative lens for the ghost side, NOT as data:
- Re-engagement odds fall sharply the longer a lead stays quiet — a widening gap since the last touch should weigh toward higher ghost risk, all else equal.
- A lead being actively worked (further along the outreach sequence, with recent touches) is, all else equal, less likely to go quiet.
- This framing is a general directional pattern from external research, NOT a fact about THIS homeowner. Do NOT state any specific decay rate, percentage, half-life, or count, and do NOT imply a measured outcome — reason only over the actual days-since-touch, trend, and outreach facts supplied above.`;

export function buildOraclePrompt(ctx: OraclePromptContext): string {
  const { lead, quote, strategy, features, factors, modelNumbers, mode } = ctx;

  const personaLabel =
    strategy?.persona_detected || features.persona || 'Not yet classified';
  const personaConfidencePct = Math.round(
    (features.personaConfidence ?? 0) * 100
  );

  const quoteBlock = quote
    ? `- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}`
    : '- No quote on file for this lead.';

  // ── Mode-specific probability instructions ──────────────────────────────
  let probabilityInstructions: string;
  if (mode === 'model' && modelNumbers) {
    probabilityInstructions = `## Probabilities — MODEL-COMPUTED (do not change)
A calibrated statistical model has already computed these probabilities. Echo them EXACTLY in your output; do not recompute, adjust, or second-guess them.
- signProbability: ${modelNumbers.signProbability} (use this exact integer)
- ghostRisk: ${modelNumbers.ghostRisk} (use this exact integer)
Set signConfidence and ghostConfidence (0-100) to reflect how much corroborating evidence the facts and supplied factors give for each number.

## Supplied model drivers (narrate, never invent)
These are the model's top drivers. Your output \`factors[]\` MUST echo these supplied factors (same feature, direction, and weight) and add a one-sentence plainText narration for each — do not introduce new factors and do not change the numbers.
${renderFactors(factors)}`;
  } else {
    probabilityInstructions = `## Probabilities — YOU ESTIMATE (degraded mode)
No fitted-model numbers are available, so YOU estimate them from the facts below.
- signProbability: integer 0-100 chance the lead signs if handled well.
- ghostRisk: integer 0-100 chance the lead goes quiet without a timely, relevant touch.
- signConfidence / ghostConfidence: 0-100 reflecting how much evidence supports each estimate.
When evidence is thin, keep both probabilities in the middle range rather than committing to extremes.

## Factors
Populate \`factors[]\` with the few signals you actually relied on (max 8). For each, give the feature name, direction (increases/decreases the relevant outcome), a weight, and a one-sentence plainText explanation grounded ONLY in the supplied facts.`;
  }

  const ghostFraming = ghostReasoningPresent(ctx)
    ? `\n\n${GHOST_DECAY_FRAMING}`
    : '';

  return `You are the Oracle for a solar installer. Assess this homeowner's likelihood of signing and of going quiet, then classify the dominant blocker and prescribe the single best next action. Be decisive but calibrated: these are sales-prioritization signals, not facts or guarantees.

## Homeowner
- Name: ${lead.name}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}
- Current lead status: ${lead.status}

## Quote
${quoteBlock}

## Derived economics
- Cost per kW: $${num(features.costPerKw)}
- Simple payback: ${n(features.simplePaybackYears, 1)} years
- Monthly savings ratio (savings ÷ bill): ${n(features.monthlySavingsRatio)}
- 25-year ROI ratio (lifetime value ÷ cost): ${n(features.roi25yrRatio)}
- Financing-adjusted upfront: $${num(features.financingAdjustedUpfront)}

## Persona & strategy
- Persona: ${personaLabel} (confidence ${personaConfidencePct}%)
- Signals: ${strategy?.signals?.join('; ') || 'None'}
- Strategy summary: ${strategy?.strategy_summary || 'None'}

## Actual outreach so far
${ctx.engagementSummary}

## Orchestration position
- Step ${features.currentStep} of ${features.totalSteps} (progress ${Math.round(
    (features.stepProgressRatio ?? 0) * 100
  )}%)
- Awaiting reply: ${features.awaitingReply ? 'yes' : 'no'}
- Days to next scheduled action: ${num(features.daysToNextAction)}${
    features.daysToNextAction < 0 ? ' (OVERDUE)' : ''
  }
- Days since last touch: ${num(features.daysSinceLastTouch)}
- Days in pipeline: ${num(features.daysInPipeline)}

## Prediction trend
- signProbability trend: ${trendWord(features.signProbSlope)} (slope ${n(
    features.signProbSlope,
    3
  )})
- ghostRisk trend: ${trendWord(features.ghostRiskSlope)} (slope ${n(
    features.ghostRiskSlope,
    3
  )})

${probabilityInstructions}

## Blocker taxonomy — pick EXACTLY ONE blockerCode
${renderTaxonomy()}${ghostFraming}

## Recommended action
Write exactly ONE recommendedAction. It must name a channel and timing, state the angle, be justified by the persona above, AND be tied to the current orchestration step (step ${
    features.currentStep
  } of ${features.totalSteps}${
    features.awaitingReply ? ', currently awaiting a reply' : ''
  }).

## Evidence
Narrate the evidence ONLY over the facts and supplied factors above. Separate observed facts from inference. ${
    mode === 'model'
      ? 'Ground your reasoning in the supplied model drivers.'
      : 'Cite the specific economics, persona, and outreach signals you used.'
  }

## Rules
- Use only the supplied data. NEVER invent messages, replies, rates, deadlines, incentives, conversations, or homeowner intent.
- Do not claim a message was opened, ignored, or answered unless it appears in the outreach summary above.
- blockerCode must be one of the taxonomy codes; use OK only when no single blocker dominates.
- Return only valid JSON matching the schema.`;
}


export function buildInboundPrompt(
  lead: Lead,
  strategy: any | null,
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


type DraftMessage = {
  channel: string;
  subject: string | null;
  goal: string | null;
};

export function buildAdaptStrategyPrompt(
  lead: Lead,
  strategy: any | null,
  replyBody: string,
  category: string,
  drafts: DraftMessage[],
): string {
  const persona = strategy?.persona_detected || 'unknown';
  const draftList = drafts
    .map(
      (d, i) =>
        `${i + 1}. ${d.channel.toUpperCase()} — current goal: ${d.goal || 'n/a'}`,
    )
    .join('\n');

  return `You are a solar sales strategist. A customer just REPLIED and raised a concern. Your job: rewrite the remaining unsent outreach messages so the WHOLE sequence pivots to address what they actually said — convincingly, specifically, and without being pushy. This is the moment that wins or loses the deal.

## The customer
- Name: ${lead.name}
- Detected persona: ${persona}
- Monthly bill: $${lead.monthly_bill}

## What they just said (their exact words)
"""
${replyBody}
"""

## How we categorized it
${category}

## The remaining unsent messages to rewrite (keep each channel's role)
${draftList}

## How to rewrite — make it genuinely convincing
- Address their SPECIFIC concern head-on, using their own words/framing. If they fear winter production, talk about winter production with concrete reasoning (panels work on diffuse light, annual production accounts for seasonal variation, system was sized for their yearly usage). If they think the price is high, reframe around payback, financing, and cost of doing nothing (rising grid bills).
- Acknowledge the concern as legitimate BEFORE answering it — never dismiss it. Skeptics and worried families need to feel heard.
- Match the persona tone: family = reassurance + reliability; investor = numbers + payback; environmentalist = impact; skeptic = evidence + transparency, no hype.
- Each channel keeps its job: email = the detailed, evidence-rich response; SMS = a short warm nudge pointing to the email's promise; call script = scannable talking points to handle the objection live; voice = a personal, human reassurance.
- For email, write a fresh subject that signals you're answering their concern.
- The 'goal' for each must state why this message, in this tone, now — referencing the concern.

## Hard rules
- Use ONLY real, defensible reasoning. Do NOT invent specific numbers, incentives, guarantees, rates, warranties, or legislation that weren't provided.
- No false promises ("guaranteed savings", "100% offset"). Convincing ≠ dishonest.
- Return ONE rewritten message per channel listed above, in the same set of channels. Return only valid JSON matching the schema.`;
}
