/* eslint-disable */
// UI screenshot capture for the design-iteration loop.
// Drives the running Next.js dev server with Playwright (chromium) and captures
// full-page screenshots across viewports + routes, recording console errors.
//
// Usage (from repo root, with the dev server up on :3000):
//   node tools/ui-capture.cjs            -> pass dir defaults to "pass00"
//   PASS=pass01 node tools/ui-capture.cjs
//   ONLY=dashboard,leads node tools/ui-capture.cjs   (subset of auth labels)
//
// Playwright isn't symlinked at node_modules root in this workspace, so resolve
// it directly from the pnpm store.
const path = require('path');
const fs = require('fs');

const PW = path.join(
  __dirname,
  '..',
  'node_modules',
  '.pnpm',
  'playwright@1.60.0',
  'node_modules',
  'playwright'
);
const { chromium } = require(PW);

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASS = process.env.PASS || 'pass00';
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = path.join(__dirname, '..', 'apps', 'web', 'iteration-shots', PASS);
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.DEMO_EMAIL || 'demo-api@solar.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'Password123!';

const VIEWPORTS = [
  { name: '390', w: 390, h: 844 },
  { name: '834', w: 834, h: 1112 },
  { name: '1440', w: 1440, h: 900 },
];

// Public routes (captured in a fresh, unauthenticated context).
const PUBLIC = [
  ['landing', '/'],
  ['login', '/login'],
  ['signup', '/sign-up'],
];

// Auth routes (captured with a logged-in storage state). Lead-scoped routes get
// the discovered lead id substituted for {id}.
let AUTH = [
  ['dashboard', '/dashboard'],
  ['leads', '/leads'],
  ['lead-new', '/leads/new'],
  ['lead-detail', '/leads/{id}'],
  ['strategy', '/leads/{id}/strategy'],
  ['settings', '/settings'],
];
if (ONLY.length) AUTH = AUTH.filter(([label]) => ONLY.includes(label));

const report = { pass: PASS, base: BASE, captured: [], errors: {}, notes: [] };

async function capture(ctx, label, url, vp) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 240));
  });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 240)));
  let status = 'ok';
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 35000 });
    status = resp ? resp.status() : 'no-response';
  } catch (e) {
    status = 'NAV_ERR:' + String(e.message).slice(0, 120);
  }
  // settle animations / lazy content
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${label}@${vp.name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
  } catch (e) {
    await page.screenshot({ path: file }); // fallback: viewport-only
  }
  const key = `${label}@${vp.name}`;
  if (errs.length) report.errors[key] = errs;
  report.captured.push({ key, url, status, file: path.relative(path.join(__dirname, '..'), file) });
  console.log(`[${key}] ${status} ${url} ${errs.length ? '(' + errs.length + ' console errors)' : ''}`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();

  // ---- Authenticate once, persist storage state ----
  let storageState = undefined;
  let leadId = process.env.LEAD_ID || '';
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 35000 });
    await page.fill('#sign-in-email', EMAIL);
    await page.fill('#sign-in-password', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {}),
      page.click('button[type=submit]'),
    ]);
    await page.waitForTimeout(2500);
    const landed = new URL(page.url()).pathname;
    if (landed.startsWith('/login')) {
      report.notes.push(`LOGIN FAILED — still on ${landed}. Auth screens not captured.`);
      console.log('LOGIN FAILED, still on ' + landed);
    } else {
      storageState = await ctx.storageState();
      console.log('login OK, landed on ' + landed);
      // discover a lead id if not provided
      if (!leadId) {
        await page.goto(BASE + '/leads', { waitUntil: 'networkidle', timeout: 35000 });
        leadId = await page
          .$$eval('a[href*="/leads/"]', (as) => {
            const re = /\/leads\/([0-9a-fA-F-]{16,})/;
            for (const a of as) {
              const m = (a.getAttribute('href') || '').match(re);
              if (m) return m[1];
            }
            return '';
          })
          .catch(() => '');
      }
      report.notes.push(`leadId = ${leadId || '(none found)'}`);
      console.log('leadId = ' + (leadId || '(none)'));
    }
    await ctx.close();
  } catch (e) {
    report.notes.push('AUTH SETUP ERROR: ' + String(e.message).slice(0, 200));
    console.log('AUTH SETUP ERROR: ' + e.message);
  }

  for (const vp of VIEWPORTS) {
    // public (no auth)
    const pub = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    for (const [label, url] of PUBLIC) await capture(pub, label, url, vp);
    await pub.close();

    // auth
    if (storageState) {
      const auth = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, storageState });
      for (const [label, url] of AUTH) {
        const finalUrl = url.replace('{id}', leadId);
        if (url.includes('{id}') && !leadId) {
          report.notes.push(`skipped ${label} (no leadId)`);
          continue;
        }
        await capture(auth, label, finalUrl, vp);
      }
      await auth.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== DONE. report -> ' + path.join(OUT, '_report.json'));
  const errKeys = Object.keys(report.errors);
  console.log('pages with console errors: ' + (errKeys.length ? errKeys.join(', ') : 'none'));
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
