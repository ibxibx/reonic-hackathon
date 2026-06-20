import type { Database } from '@/lib/database.types';

type Lead = Database['public']['Tables']['leads']['Row'];
type Quote = Database['public']['Tables']['quotes']['Row'];

export function buildStrategyPrompt(lead: Lead, quote: Quote): string {
  return `You are an expert solar sales strategist. Your task is to analyze a homeowner profile and generate a personalized, multi-channel closing strategy.

## Homeowner Data
- Name: ${lead.name}
- Email: ${lead.email}
- Phone: ${lead.phone}
- Address: ${lead.address}
- Roof type: ${lead.roof_type || 'Unknown'}
- Monthly electricity bill: $${lead.monthly_bill}

## Quote Data
- System size: ${quote.system_size_kw} kW
- Total cost: $${quote.total_cost}
- Financing type: ${quote.financing_type}
- Notes: ${quote.notes || 'None'}

## Your Task
1. Detect the homeowner's sales persona (family, investor, environmentalist, or skeptic).
2. Provide a confidence level (0-1) for your detection.
3. List 1-5 signals that informed your detection. Each signal must cite a SPECIFIC data point above (e.g. "$${lead.monthly_bill}/mo bill signals cost-sensitivity", not "seems cost-conscious").
4. Write a strategy summary (40-800 chars) that names this homeowner's likely #1 hesitation and the through-line of how the sequence overcomes it.
5. Write a detailed rationale (80-1500 chars) that walks the channel SEQUENCE: why this channel first, why the order escalates the way it does, and what specific persona trait each step is built around. Reference the homeowner by name and cite their numbers.
6. Generate four channel-specific messages. For EACH message, the "goal" field is not a generic objective — it must state, in one tight sentence, WHY THIS CHANNEL + WHY THIS TONE + WHY NOW for this specific homeowner (e.g. "Email first because investors want the ROI math in writing to forward to a spouse; formal tone matches their diligence; send now while the quote is fresh."). Make the four goals visibly different from each other.
   - Email: subject (3-120 chars), body (40-2500 chars), goal (10-300 chars)
   - SMS: body (10-320 chars), goal (10-300 chars)
   - Call script: body (40-2500 chars), goal (10-300 chars)
   - Voice script: body (20-1200 chars), goal (10-300 chars)

## Tone calibration by persona (pick the matching row)
- family: warm, reassurance-first, emphasize reliability, kids/home comfort, low-risk. Avoid jargon.
- investor: precise, numbers-forward, ROI/payback/IRR framing, efficient, no fluff.
- environmentalist: mission-driven, CO2/energy-independence framing, values over savings.
- skeptic: evidence-led, concede uncertainty honestly, no hype, proof and references over promises.

## Rules
- Do NOT invent incentives, rates, guarantees, or legislation.
- Use ONLY the data provided above. Every claim ties back to a real data point.
- The four messages must differ in tone AND content — no copy-pasted sentences across channels. If two channels read interchangeably, rewrite them.
- Keep SMS concise and conversational.
- Make voice script natural and spoken-style.
- Make call script easy to scan with bullet points.
- Do NOT promise guaranteed savings.
- Do NOT use discriminatory language.
- Return ONLY valid JSON matching the schema.`;
}
