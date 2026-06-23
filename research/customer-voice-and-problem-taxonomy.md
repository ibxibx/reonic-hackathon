# Customer-Voice Research & Problem Taxonomy — Why Solar/Heat-Pump Deals Stall

> **What this is.** The multi-country customer-feedback research behind RayCiprocity's diagnosis layer — the evidence from which the Problem-Code taxonomy was crystallized. It was originally synthesized in NotebookLM ("Mastering the Solar Sales Cycle: Regrets, CRM, and Closing") from **18 primary video sources across 5 markets (DE, EN, IT, FR, NL)**, then ported into this build repo so the research is legible alongside the code it grounds.
>
> *Ported 23 June 2026, after the hackathon, to close the gap identified in the post-mortem: research that lives only in NotebookLM or a separate prep repo is invisible to judges and to teammates. This is the canonical, in-repo version.*
>
> **How to read it.** Three layers: (1) the **source corpus** with market + type, (2) the **problem taxonomy** grouped into families (this is what the 12 shipped Problem-Codes in `apps/web/src/lib/problem-codes.ts` compress, and what the full 40-code design expands), and (3) the **objection -> counter-strategy playbook** distilled from the sales-training sources, which directly informs the AI's per-channel message angles.

---

## 1. Source corpus (18 primary sources, 5 markets)

Voice-of-customer was deliberately gathered cross-market, not just German, because the *pain patterns* repeat across countries even though the regulatory detail differs. Sources are real homeowner testimonials, consumer-protection/news segments, installer interviews, and professional sales-training material.

| # | Source (video) | Market | Type |
| --- | --- | --- | --- |
| 1 | 5 Things Homeowners Regret After Buying Solar for Home | EN | Homeowner regret |
| 2 | Complaints pile up after long-time solar company abruptly shuts doors | EN | Consumer news / insolvency |
| 3 | Die Erfolgsgeschichte von MySolarExpress mit Reonic | DE | Installer success (Reonic) |
| 4 | ENPAL KUNDEN SUPPORT ERFAHRUNG | DE | Homeowner complaint (support) |
| 5 | Enpal Solar Test & Erfahrungen, Bewertungen | DE | Review / testimonial |
| 6 | How to Overcome Every Homeowner Objection in Solar Sales | EN | Sales training |
| 7 | Hoer als PV-Vertriebler auf mit Technik, fang an zu verkaufen! | DE | Sales training |
| 8 | I'm Stuck In A Solar Panel Contract! | EN | Homeowner regret (contract) |
| 9 | Ich will noch ueberlegen - Einwandbehandlung im Verkaufsgespraech | DE | Sales training (objection) |
| 10 | LA TRUFFA DEL SOLARE | IT | Consumer protection / scam |
| 11 | Panneau solaire : Temoignage des victimes d'arnaque (Vendee) | FR | Consumer protection / scam |
| 12 | Prospects say "I need to think about it" and you'll say "..." | EN | Sales training (objection) |
| 13 | Vraag zonnepanelen gekelderd, installateurs stoppen ermee | NL | Market-demand news |
| 14 | Waermepumpen Fiasko geht weiter: 1 JAHR warten (Kabel Eins) | DE | Consumer protection (heat pump) |
| 15 | Wuerde ich Enpal heute nochmal mieten? (@ingostipps) | DE | Homeowner long-term review |
| 16 | weg von Enpal - und nun? | DE | Homeowner exit / lease regret |
| 17 | Aerger mit Waermepumpe: "Wir wollen wieder heizen" (krone.tv) | DE/AT | Consumer news (heat pump) |
| 18 | Evitez les Arnaques des Panneaux Solaires a 1 EUR avant de SIGNER | FR | Consumer protection / scam |

**Corpus shape:** ~7 homeowner regret/review, ~5 consumer-protection/scam/news, ~4 sales-training, ~2 installer/market. The scam-and-regret weighting (IT/FR especially) is deliberate — it surfaces *post-signature* and *trust* failures that pure sales-training material hides.

---

## 2. Problem taxonomy — the 40 reasons deals stall, ghost, or unwind

Grouped into 8 families. Each entry: **`code` Label — definition `[market(s)]`**. The `code` column is the full design taxonomy; the **-> Pn** mapping shows the 12 codes actually wired into the demo (`apps/web/src/lib/problem-codes.ts`). Codes without a mapping are the expansion backlog.

### Family A — Price & Total Cost (shipped: P1, P2)
- **A1 Upfront price shock** — Sticker price feels too high versus the homeowner's mental budget, independent of financing. `[EN/DE]` -> **P1**
- **A2 Monthly affordability** — "I can't afford it / I have no money"; the monthly figure strains cash flow (often a deflective tactic, but real often enough to treat seriously). `[EN/DE]` -> **P2**
- **A3 Rental/lease lifetime cost** — Rental lowers the entry barrier but the 20-25y total dwarfs a purchase; one homeowner computed a 25-year plan at **EUR 84,000**. `[DE]`
- **A4 Price-increase exposure** — Shock at base-price and per-kWh rate hikes inside the contract ("der Grundpreis erhoeht wird und auch der Kilowattstunden Preis"). `[DE]`
- **A5 Inflated buyout price** — The "fair market" buyout after 5/10y on a leased system is widely seen as inflated. `[DE]`
- **A6 Opaque virtual-pool compensation** — New power-pool models (e.g. Enpal One) are "nicht vollstaendig transparent"; homeowners can't tell what they actually earn. `[DE]`

### Family B — Financing & Credit (shipped: F1, F2)
- **B1 Financing-structure fit** — The loan/lease structure (not the headline price) is the blocker. `[EN/DE]` -> **F1**
- **B2 ROI / payback proof** — Homeowner doubts the return case or its assumptions; wants the math shown. `[EN/DE]` -> **F2**
- **B3 Loan aversion / no-debt stance** — "I don't want to take out a loan / finance it"; refusal of debt on principle. `[EN/DE]`
- **B4 Credit rejection** — A poor score (e.g. 450) is a definitive barrier; trainers say disengage rather than push. `[EN]`
- **B5 Opaque Bonitaetspruefung** — German providers run internal credit checks; rejections aren't transparently explained to the homeowner. `[DE]`

### Family C — Trust, Scams & Installer Risk (shipped: T1, T2)
- **C1 Installer credibility gap** — Homeowner needs proof points/references before committing to *this* installer. `[EN/DE]` -> **T1**
- **C2 Roof/warranty risk** — Worry about roof damage, labor warranty, and who honors it. `[EN]` -> **T2**
- **C3 Outright scam fear** — IT/FR "arnaque/truffa" framing: fear of being defrauded, esp. "1 EUR" panel hooks. `[IT/FR]`
- **C4 "Fly-by-night" contractor risk** — Installer goes insolvent, leaving worthless labor/roof warranties. `[EN/DE]`
- **C5 Insolvency-in-progress distrust** — News of a provider "abruptly shutting doors" poisons trust market-wide. `[EN]`
- **C6 High-pressure-tactic recoil** — Doorstep/closing pressure itself triggers refusal as self-defense. `[EN/DE]`
- **C7 Lease-transfer horror stories** — Buyers can't get mortgage approval / walk away because of an attached solar lease. `[EN]`

### Family D — Comparison & Decision Unit (shipped: C1, C2)
- **D1 Quote comparison** — Homeowner is benchmarking competing offers and wants an apples-to-apples frame. `[EN/DE]` -> **C1**
- **D2 Household alignment / non-decision-maker** — Talking to someone who isn't the decider ("kein Entscheider"); spouse absent. `[EN/DE]` -> **C2**
- **D3 "I need to talk to my spouse"** — Defer-to-partner stall, sometimes genuine, sometimes a smoke screen. `[EN/DE]`
- **D4 Advisor/stakeholder review** — Wants a third party (family, advisor) to vet before signing. `[EN]`

### Family E — Timing, Delivery & Disruption (shipped: S1, S2)
- **E1 Delivery / completion-time anxiety** — Fear of long waits to completion; wants a credible timeline. `[DE]` -> **S1**
- **E2 Installation disruption** — Uncertainty about what install day does to the home/roof. `[EN]` -> **S2**
- **E3 Heat-pump wait-time fiasco** — 1-year waits with no resolution (Kabel Eins); erodes willingness to start. `[DE]`
- **E4 Relocation / short horizon** — "I'm moving"; won't invest for only a few more years in the home. `[EN]`
- **E5 Reflexive "need to think about it"** — Default stall to escape pressure; the single most common objection. `[EN/DE]`
- **E6 "Sleep on it" rule** — Personal rule to never decide same-day ("immer ueber eine Entscheidung schlafen"). `[DE]`

### Family F — Psychology & Sales-Process (expansion — no shipped code yet)
- **F1 Reflexive disinterest** — "I'm not interested" knee-jerk to any unsolicited offer. `[EN]`
- **F2 Decision fear (Entscheidungsangst)** — Anxiety about committing to any large decision. `[DE]`
- **F3 Information overload / Ueberforderung** — Too much technical detail -> paralysis by analysis. `[DE/EN]`
- **F4 Hidden refusal (politeness mask)** — Already a "no" but won't say it to spare the rep ("will den schuetzen"). `[DE]`
- **F5 Technical-uncertainty smoke screen (Fachliche Unklarheit)** — Unspoken technical doubts surface as vague stalls. `[DE]`

### Family G — Technical & System-Quality (expansion)
- **G1 Poor system design** — Lazy layout (panels only on the easy East face, ignoring South/West yield). `[EN]`
- **G2 Software over-promise** — Cheap design tools overstate production by ignoring shading/LIDAR/sun path. `[EN]`
- **G3 Post-install technical defects** — Malfunctions and feed-in-remuneration ("Einspeiseverguetung") problems after go-live. `[DE]`
- **G4 Aesthetic objection** — "I don't like the look"; an emotional, not rational, blocker. `[EN]`

### Family H — Post-Install Service & O&M (expansion — strongest white-space, ties to our monitoring thesis)
- **H1 Support inaccessibility** — Can't reach anyone; "Kundensupport Katastrophe". `[DE]`
- **H2 No emergency service** — No 24h support when a failure blocks (e.g.) EV charging for work. `[DE]`
- **H3 Abandonment after insolvency** — Provider gone; no one services the system or honors warranties. `[EN/DE]`
- **H4 Long-term-rental regret** — After years, homeowner concludes the lease wasn't worth it ("weg von Enpal"). `[DE]`

> **40 problems, 8 families.** The demo shipped a 12-code compression (one to two per core family) to keep the board legible in a 2-minute pitch. Families **F, G, H** are the highest-value expansion: F (psychology) sharpens *diagnosis*, H (service/O&M) is the post-install white space that aligns with Reonic's confirmed funnel gap.

---

## 3. Objection -> counter-strategy playbook (from the sales-training sources)

These are the closing techniques the professional sales-training sources (EN + DE) actually teach. They feed the AI's per-channel **message angle** for each Problem-Code: the diagnosis names the blocker, this table supplies the move.

| Objection (homeowner says) | Counter-strategy the trainers teach | Maps to |
| --- | --- | --- |
| "I need to think about it" | Agree, book a firm calendar commitment, then surface the real question: "Before I go, what were you wanting to go over, so I know what you'll have when we talk tomorrow?" | E5, F3 |
| "I can't afford it / no money" | Reframe: you aren't taking money out of their pocket, you're putting it back by swapping a utility bill for a lower payment. | A2 |
| "I'm not interested" | Treat as a knee-jerk reaction; use it as an opening to ask questions and find true interest level. | F1 |
| "I don't like the look" | Ask what color their current roof is (they usually don't know), then: "Does a $0 utility bill look better than panels?" | G4 |
| "I'm moving" | Ask when; reframe solar as a tool to sell the house for more by offering the next buyer free electricity. | E4 |
| "I don't want a loan / to finance" | Reframe the agreement as simply paying for power produced on-site, not taking on debt. | B3 |
| "I have bad credit" (e.g. 450) | Disengage; leave the doorstep — a definitive barrier, not worth pushing. | B4 |
| "Ich will es mir nochmal ueberlegen" | "Return Technique": "That shows me we haven't covered everything. What is it that makes you thoughtful?" | E5, F5 |
| "Unterm Strich" (bottom-line) doubt | "Condition Question": "If we calculate this specifically and it's a good deal, with what amount would you like to start?" | B2 |
| Technical confusion / overload | Stop the "technical bomb"; use a fixed script; focus only on emotional outcomes the customer wants. | F3 |
| "I need to talk to my spouse" | Lower the guard by acting as if leaving, then ask what they need to discuss to identify the real concern. | D2, D3 |
| Decision fear (Entscheidungsangst) | "Therapeutic Technique": validate the feeling first ("I can well understand that"), then walk the decision down. | F2 |

**Cross-cutting principle the DE sources hammer:** *stop selling technology, start selling outcomes* ("Hoer auf mit Technik, fang an zu verkaufen"). Most stalls are emotional, not technical — which is exactly why a diagnosis layer that names the *emotional* blocker (families C, F) beats one that only handles price/spec.

---

## 4. How this grounds the product

- **Diagnosis (Problem-Codes).** Section 2 is the evidence base for `problem-codes.ts`. The shipped 12 are the compression; the 40 are the roadmap. Every code traces to real homeowner language in a cited source and a market.
- **Action (message angles).** Section 3 supplies the counter-move per code — the AI doesn't invent tactics, it applies trainer-validated ones.
- **The Oracle.** The blocker families map onto the Oracle's single-blocking-objection output (`blocker-taxonomy.ts`): A->Price, B->Financing, C->Trust, D->Competition, E->Timing, G->Technical. Families F (psychology) and H (service) are Oracle blind spots today and the clearest place to deepen it.
- **Strategic edge vs. the field.** This cross-market (DE/EN/IT/FR/NL) corpus is wider than a single-market review scrape. The IT/FR scam sources and the DE post-install/service sources surface *trust* and *O&M* failure modes that sales-only research misses — and O&M is the confirmed Reonic funnel white space.

---

## Provenance

- **Notebook:** NotebookLM — "Mastering the Solar Sales Cycle: Regrets, CRM, and Closing" (18 sources, 5 markets). Synthesis regenerated from all sources and ported here 23 Jun 2026.
- **In-repo consumers:** `apps/web/src/lib/problem-codes.ts` (12 codes), `apps/web/src/lib/ai/blocker-taxonomy.ts` (Oracle blockers), `apps/web/src/lib/ai/prompts.ts` (strategy/message generation).
