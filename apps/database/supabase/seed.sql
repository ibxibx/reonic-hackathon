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
    'Maya Rodriguez',
    'maya.rodriguez@example.com',
    '+15551001001',
    '1420 Maple Ridge Dr, Austin, TX',
    'shingle',
    245.00,
    'new',
    NOW() - INTERVAL '1 day'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'f0899c31-3b92-4f49-9147-3d6b0fef3c98',
    'Jordan Kim',
    'jordan.kim@example.com',
    '+15551001002',
    '88 Pine Valley Ct, Denver, CO',
    'metal',
    390.00,
    'negotiating',
    NOW() - INTERVAL '2 days'
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
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 7.20, 23800.00, 'loan', 'Interested in reducing summer bills before HVAC replacement.', NOW() - INTERVAL '1 day'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 11.40, 42100.00, 'cash', 'Asked for ROI and payback period before signing.', NOW() - INTERVAL '2 days'),
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
    0.82,
    ARRAY['High monthly bill', 'Timing around HVAC replacement', 'Loan financing preference'],
    'Lead with household budget stability and summer bill control. Keep the proposal practical and focused on predictable monthly savings.',
    'Maya is responding to a clear household cost pressure: a high monthly bill before a planned HVAC replacement. A family-oriented message should make the next step feel low-risk, practical, and easy to understand.',
    NOW() - INTERVAL '12 hours'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'investor',
    0.91,
    ARRAY['Asked for ROI', 'Cash buyer', 'Large system size'],
    'Focus on financial performance, payback logic, and long-term asset value. Avoid emotional framing and keep numbers front and center.',
    'Jordan is evaluating the project as a capital investment. Cash financing and explicit ROI questions suggest they need a concise investment case with transparent assumptions and a clear next decision point.',
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
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'email', 'A practical solar plan before summer usage peaks', 'Hi Maya, I put together the solar plan around your current bill and the upcoming HVAC replacement timing. The goal is to make the monthly impact clear before summer usage climbs. Would a 15-minute review tomorrow work?', 'Book a short quote review focused on monthly budget impact.', 1, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'sms', null, 'Hi Maya, I mapped the solar quote around your current bill and HVAC timing. Want me to send a quick monthly-cost breakdown?', 'Get permission to share the simplified cost breakdown.', 2, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'call', null, 'Open with the HVAC timing, confirm their current bill pressure, walk through monthly payment versus utility bill, then ask what would make the decision feel comfortable.', 'Guide a practical decision call.', 3, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'voice', null, 'Hi Maya, quick note from RayCiprocity. I reviewed your quote with your current electric bill in mind, and I think the cleanest next step is a short walkthrough of the monthly numbers before summer usage picks up.', 'Create a warmer follow-up touchpoint.', 4, 'draft', null, null, NOW() - INTERVAL '12 hours'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'email', 'Solar ROI snapshot for your quote', 'Hi Jordan, I pulled the quote into a simple investment view: system size, total cost, and the decision points that affect payback. If useful, I can walk you through the assumptions and where the return is most sensitive.', 'Move Jordan into an ROI review conversation.', 1, 'sent', NOW() - INTERVAL '1 day', 'mock_2001', NOW() - INTERVAL '2 days'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'sms', null, 'Jordan, I have the ROI view ready for the cash option. Want the quick version or a detailed assumption breakdown?', 'Prompt a preference for review format.', 2, 'draft', null, null, NOW() - INTERVAL '2 days'),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'email', 'Simple lease walkthrough for your solar quote', 'Hi Ava, I can make the lease option easier to compare by showing what changes upfront, monthly, and over time. No pressure to decide on the call; the goal is just to make the tradeoffs clear.', 'Reduce uncertainty and book a lease explanation call.', 1, 'draft', null, null, NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  sent_at = EXCLUDED.sent_at,
  provider_message_id = EXCLUDED.provider_message_id;
