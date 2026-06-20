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
3. List 1-5 signals that informed your detection.
4. Write a strategy summary (40-800 chars).
5. Write a detailed rationale explaining your reasoning (80-1500 chars).
6. Generate four channel-specific messages:
   - Email: subject (3-120 chars), body (40-2500 chars), goal (10-300 chars)
   - SMS: body (10-320 chars), goal (10-300 chars)
   - Call script: body (40-2500 chars), goal (10-300 chars)
   - Voice script: body (20-1200 chars), goal (10-300 chars)

## Rules
- Do NOT invent incentives, rates, guarantees, or legislation.
- Use ONLY the data provided above.
- Keep SMS concise and conversational.
- Make voice script natural and spoken-style.
- Make call script easy to scan with bullet points.
- Do NOT promise guaranteed savings.
- Do NOT use discriminatory language.
- Return ONLY valid JSON matching the schema.`;
}
