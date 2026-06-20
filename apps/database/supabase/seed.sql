-- Seed data for private_items table
-- This creates sample data for testing purposes
-- Insert test private_items with hardcoded UUIDs simulating different users
INSERT INTO public.private_items (id, name, description, created_at)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Project Alpha',
    'A comprehensive project management tool for agile teams',
    NOW() - INTERVAL '5 days'
  ),
  (
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'Marketing Campaign Q4',
    'Strategic marketing initiatives for the fourth quarter',
    NOW() - INTERVAL '3 days'
  ),
  (
    'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'Product Launch Checklist',
    'Complete checklist for new product launch procedures',
    NOW() - INTERVAL '1 day'
  ),
  (
    'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    'Team Building Activities',
    'Collection of team building exercises and activities',
    NOW() - INTERVAL '7 days'
  ),
  (
    'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    'Technical Documentation',
    'Comprehensive technical documentation for the platform',
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Seed demo authors in auth.users
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'olivia@example.com',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Olivia Martin"}',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'liam@example.com',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Liam Patel"}',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'amelia@example.com',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Amelia Chen"}',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Seed blog posts
INSERT INTO public.content_blog_posts (id, slug, title, excerpt, body, author_id, is_published, published_at, created_at)
VALUES
  (
    '44444444-4444-4444-9444-444444444444',
    'supabase-workflows-at-scale',
    'Supabase Workflows at Scale',
    'How we orchestrate Supabase workflows for multi-tenant platforms.',
    'Supabase workflows require robust patterns for scaling teams and data-heavy workloads. In this post we walk through connection pooling, background jobs, and schema design tactics that keep queries fast under load.',
    '11111111-1111-4111-8111-111111111111',
    true,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '12 days'
  ),
  (
    '55555555-5555-4555-9555-555555555555',
    'designing-nextjs-edge-experiences',
    'Designing Next.js Edge Experiences',
    'Blueprints for delivering personalized UX at the edge with Next.js 15.',
    'Edge rendering with Next.js 15 unlocks real-time personalization. We explore caching strategies, streaming responses, and how to pair Supabase RLS with middleware to keep sessions fast and secure.',
    '22222222-2222-4222-8222-222222222222',
    true,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '9 days'
  ),
  (
    '66666666-6666-4666-9666-666666666666',
    'tailwind-shadcn-design-systems',
    'Tailwind + shadcn/ui Design Systems',
    'Practical guide for building cohesive UI systems with Tailwind and shadcn/ui.',
    'Design systems thrive on consistency. Learn how to blend Tailwind, shadcn/ui primitives, and Radix accessibility helpers to ship interfaces that scale with your product roadmap.',
    '33333333-3333-4333-8333-333333333333',
    true,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '6 days'
  ),
  (
    '77777777-7777-4777-9777-777777777777',
    'caching-strategies-for-rsc',
    'Caching Strategies for RSC',
    'Patterns for caching React Server Component data safely.',
    'React Server Components shift the caching story. We cover memoization utilities, revalidation, and how to avoid serving stale personalized content across tenants.',
    '11111111-1111-4111-8111-111111111111',
    true,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '4 days'
  ),
  (
    '88888888-8888-4888-9888-888888888888',
    'shipping-reliable-server-actions',
    'Shipping Reliable Server Actions',
    'Lessons learned from production hardening of Next.js server actions.',
    'Server actions remove client round-trips but require great observability. In this walkthrough we explore logging, retries, and coupling actions with pgTap tests to catch regressions.',
    '22222222-2222-4222-8222-222222222222',
    true,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed blog post comments
INSERT INTO public.content_blog_post_comments (id, blog_post_id, author_id, body, created_at)
VALUES
  (
    '99999999-9999-4999-9999-999999999999',
    '44444444-4444-4444-9444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'Loved the section on connection pooling—would enjoy a deep dive on pgBouncer with Supabase.',
    NOW() - INTERVAL '8 days'
  ),
  (
    'aaaaaaa1-aaaa-4aaa-9aaa-aaaaaaaaaaa1',
    '55555555-5555-4555-9555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    'This aligns perfectly with our edge A/B testing strategy. Appreciate the checklist at the end.',
    NOW() - INTERVAL '6 days'
  ),
  (
    'aaaaaaa2-aaaa-4aaa-9aaa-aaaaaaaaaaa2',
    '66666666-6666-4666-9666-666666666666',
    '11111111-1111-4111-8111-111111111111',
    'Great reminder to document tokens for each primitive. The color recipes example is gold.',
    NOW() - INTERVAL '4 days'
  ),
  (
    'aaaaaaa3-aaaa-4aaa-9aaa-aaaaaaaaaaa3',
    '77777777-7777-4777-9777-777777777777',
    '22222222-2222-4222-8222-222222222222',
    'Could you expand on revalidation timing for incremental static regeneration?',
    NOW() - INTERVAL '2 days'
  ),
  (
    'aaaaaaa4-aaaa-4aaa-9aaa-aaaaaaaaaaa4',
    '88888888-8888-4888-9888-888888888888',
    '33333333-3333-4333-8333-333333333333',
    'The pgTap section is super actionable—thanks for the tips on arranging fixtures.',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed RayCiprocity demo user and pipeline
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES (
  'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
  'authenticated',
  'authenticated',
  'demo-api@solar.test',
  '{"provider":"email","providers":["email"]}',
  '{"sub":"f0899c31-3b92-4f49-9147-3d6b0fef3c98","email":"demo-api@solar.test","full_name":"Demo Installer","company_name":"RayCiprocity Demo Co","email_verified":true,"phone_verified":false}',
  crypt('Password123!', gen_salt('bf', 10)),
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  updated_at = NOW();

INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '7325a8cc-79b5-44ee-a3e8-a763eb2a0200',
  'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
  'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
  '{"sub":"f0899c31-3b92-4f49-9147-3d6b0fef3c98","email":"demo-api@solar.test","full_name":"Demo Installer","company_name":"RayCiprocity Demo Co","email_verified":false,"phone_verified":false}',
  'email',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

INSERT INTO public.profiles (id, company_name, created_at)
VALUES (
  'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
  'RayCiprocity Demo Co',
  NOW() - INTERVAL '14 days'
)
ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name;

INSERT INTO public.leads (
  id,
  installer_id,
  name,
  email,
  phone,
  address,
  roof_type,
  monthly_bill,
  status,
  created_at
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Thomas Schneider',
    'thomas.schneider@gmx.de',
    '+49 157 4589533',
    'Gartenweg 54, 76596 Forbach',
    'shingle',
    190.00,
    'ghosted',
    NOW() - INTERVAL '24 days'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Lukas Becker',
    'lukas.becker@t-online.de',
    '+49 160 3117636',
    'Rosenweg 86, 86911 Dießen am Ammersee',
    'tile',
    410.00,
    'negotiating',
    NOW() - INTERVAL '17 days'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Ava Thompson',
    'ava.thompson@example.com',
    '+15551001003',
    '517 Cedar Springs Rd, Phoenix, AZ',
    'tile',
    315.50,
    'contacted',
    NOW() - INTERVAL '4 days'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Noah Patel',
    'noah.patel@example.com',
    '+15551001004',
    '2108 Lakeview Ave, Tampa, FL',
    'flat',
    510.00,
    'ghosted',
    NOW() - INTERVAL '8 days'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Elena Brooks',
    'elena.brooks@example.com',
    '+15551001005',
    '731 Willow Bend Ln, Raleigh, NC',
    'shingle',
    180.00,
    'closed',
    NOW() - INTERVAL '10 days'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  roof_type = EXCLUDED.roof_type,
  monthly_bill = EXCLUDED.monthly_bill,
  status = EXCLUDED.status;

INSERT INTO public.quotes (
  id,
  lead_id,
  system_size_kw,
  total_cost,
  financing_type,
  notes,
  created_at
)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 6.90, 16300.00, 'loan', 'Vierköpfige Familie, die vor allem Sicherheit und planbare Kosten sucht. Sorgt sich um die Vorabkosten und möchte keine Überraschungen. Fragt, ob die monatliche Rate etwa der aktuellen Stromrechnung entspricht, und möchte zuerst Referenzen und Bewertungen aus der Region sehen, bevor sie unterschreibt.', NOW() - INTERVAL '24 days'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 12.40, 37200.00, 'cash', 'Vergleicht aktiv mehrere Angebote und will harte Zahlen – fragt konkret nach IRR, Amortisationszeit und 25-Jahres-Rendite. Wägt Barzahlung gegen Finanzierung ab und vergleicht die Anlage mit einer Geldanlage am Aktienmarkt. Möchte einen Speicher zur Eigenverbrauchs- und Renditeoptimierung.', NOW() - INTERVAL '17 days'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 8.90, 31250.00, 'lease', 'Wants low upfront cost and predictable payment.', NOW() - INTERVAL '4 days'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 13.10, 48600.00, 'loan', 'Needs reassurance about roof penetration and warranties.', NOW() - INTERVAL '8 days'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 6.50, 21900.00, 'PPA', 'Closed after comparing predictable payment against current utility bill.', NOW() - INTERVAL '10 days')
ON CONFLICT (lead_id) DO UPDATE SET
  system_size_kw = EXCLUDED.system_size_kw,
  total_cost = EXCLUDED.total_cost,
  financing_type = EXCLUDED.financing_type,
  notes = EXCLUDED.notes;

INSERT INTO public.strategies (
  id,
  lead_id,
  persona_detected,
  persona_confidence,
  signals,
  strategy_summary,
  rationale,
  created_at
)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'family',
    0.84,
    ARRAY['Sucht Sicherheit und planbare Kosten', 'Fragt nach Rate etwa wie Stromrechnung', 'Möchte Referenzen aus der Region'],
    'Auf Sicherheit und Planbarkeit setzen: die monatliche Rate als etwa die heutige Stromrechnung rahmen und mit lokalen Referenzen Vertrauen aufbauen. Den nächsten Schritt klein und risikoarm halten.',
    'Thomas ist Teil einer vierköpfigen Familie mit Fokus auf Sicherheit und planbare Kosten. Da der Kontakt abkühlt (Ghost-Risiko), sollte die Ansprache den nächsten Schritt risikoarm und konkret machen: Raten-Vergleich plus regionale Referenzen statt Zahlenflut.',
    NOW() - INTERVAL '12 hours'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'investor',
    0.91,
    ARRAY['Fragt nach ROI und Amortisation', 'Barzahler', 'Große Anlage, vergleicht Angebote'],
    'Auf finanzielle Performance fokussieren: Amortisation, 25-Jahres-Rendite und Vergleich Barkauf vs. Finanzierung. Zahlen in den Vordergrund, kein emotionales Framing.',
    'Lukas bewertet das Projekt als Kapitalanlage. Barzahlung und explizite ROI-Fragen sprechen für eine kompakte Investitionsrechnung mit transparenten Annahmen und einer klaren nächsten Entscheidung.',
    NOW() - INTERVAL '2 days'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'skeptic',
    0.74,
    ARRAY['Lease preference', 'Low upfront cost concern', 'Needs predictable payment'],
    'Reduce friction by explaining the lease path plainly, showing what changes month to month, and inviting a short review call.',
    'Ava appears open but cautious. The lease preference and low-upfront-cost concern mean the sales motion should remove uncertainty, clarify obligations, and make the customer feel in control of the next step.',
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO UPDATE SET
  persona_detected = EXCLUDED.persona_detected,
  persona_confidence = EXCLUDED.persona_confidence,
  signals = EXCLUDED.signals,
  strategy_summary = EXCLUDED.strategy_summary,
  rationale = EXCLUDED.rationale;

INSERT INTO public.messages (
  id,
  lead_id,
  strategy_id,
  channel_type,
  subject,
  content,
  goal,
  sequence_order,
  status,
  sent_at,
  provider_message_id,
  created_at
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'email', 'Ihr Solar-Angebot: planbare Kosten, keine Überraschungen', 'Guten Tag Herr Schneider, ich habe Ihr Angebot so aufbereitet, dass die monatliche Belastung klar wird – im Kern etwa so hoch wie Ihre heutige Stromrechnung. Gern zeige ich Ihnen dazu Referenzprojekte aus Ihrer Region. Passt ein kurzer Rückruf diese Woche?', 'Vertrauen aufbauen und einen kurzen Termin sichern.', 1, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'sms', null, 'Hallo Herr Schneider, kurze Rückmeldung: Ihre monatliche Rate läge etwa bei Ihrer heutigen Stromrechnung. Soll ich Ihnen Referenzen aus der Region schicken?', 'Das Gespräch warmhalten.', 2, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'call', null, 'Mit der Sorge um die Vorabkosten beginnen, die Rate im Vergleich zur aktuellen Stromrechnung erklären, Referenzen aus der Region anbieten und einen kleinen, konkreten nächsten Schritt vereinbaren.', 'Die Entscheidung risikoarm machen.', 3, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'voice', null, 'Hallo Herr Schneider, kurze persönliche Nachricht von Ihrem Solarteam. Ich habe Ihr Angebot mit Blick auf planbare monatliche Kosten angeschaut und denke, der sauberste nächste Schritt ist ein kurzer Blick auf die Zahlen – ganz ohne Druck.', 'Einen wärmeren, persönlichen Touchpoint schaffen.', 4, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'email', 'ROI-Überblick zu Ihrem Solar-Angebot', 'Guten Tag Herr Becker, anbei Ihr Angebot als Investitionssicht: Systemgröße, Gesamtkosten, Amortisationszeit und 25-Jahres-Rendite – inklusive Vergleich Barkauf gegen Finanzierung. Gern gehe ich die Annahmen mit Ihnen durch und zeige, wo die Rendite am sensibelsten ist.', 'In ein ROI-Gespräch überführen.', 1, 'sent', NOW() - INTERVAL '1 day', 'mock_2001', NOW() - INTERVAL '2 days'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'sms', null, 'Herr Becker, die ROI-Übersicht inkl. Speicher-Szenario liegt bereit. Möchten Sie die Kurzfassung oder die detaillierte Annahmen-Tabelle?', 'Format-Präferenz abfragen.', 2, 'draft', null, null, NOW() - INTERVAL '2 days'),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'email', 'Simple lease walkthrough for your solar quote', 'Hi Ava, I can make the lease option easier to compare by showing what changes upfront, monthly, and over time. No pressure to decide on the call; the goal is just to make the tradeoffs clear.', 'Reduce uncertainty and book a lease explanation call.', 1, 'draft', null, null, NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  sent_at = EXCLUDED.sent_at,
  provider_message_id = EXCLUDED.provider_message_id;
