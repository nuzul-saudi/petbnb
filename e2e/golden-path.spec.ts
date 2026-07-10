// S10 — the golden path (UX review, Wave 1a):
//   guest → browse feed → open listing → sign-in (password, no OTP)
//   → send inquiry → submit booking request.
//
// Runs against the exported web build (expo export -p web + e2e/serve.mjs)
// with a REAL Supabase backend — see README "E2E in CI" for the required
// secrets and seed data. Selectors are the app's visible Arabic strings
// (the app ships ar-locale-first and has no testIDs); seed data uses
// deterministic names so targeting never depends on ordering:
//   * listing titled  "E2E Test Listing"  (host: e2e-host@petbnb.local,
//     approved + verified, NO blocked dates)
//   * pet named       "E2E Cat"           (owner: e2e-owner@petbnb.local,
//     vaccinated so the soft vaccination warn never fires)
//
// Analytics safety: the E2E build env omits POSTHOG_KEY / SENTRY_DSN, so
// both SDKs no-op and are never even imported — zero analytics pollution.

import { expect, test } from '@playwright/test';

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@petbnb.local';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';

const LISTING_TITLE = 'E2E Test Listing';
const PET_NAME = 'E2E Cat';

// Visible-string selectors (ar locale — the guest default).
const AR = {
  messageHost: 'راسل المضيف',
  requestBooking: 'اطلب الحجز',
  usePasswordInstead: 'تسجيل الدخول بكلمة المرور بدلاً من ذلك',
  signInWithPassword: 'تسجيل الدخول بكلمة المرور',
  emailPlaceholder: 'you@example.com',
  passwordPlaceholder: '••••••••',
  composerPlaceholder: 'اكتب رسالتك…',
  send: 'إرسال',
  submitRequest: 'إرسال الطلب',
  nextMonth: 'الشهر التالي',
};

test('golden path: browse → sign-in → inquiry → booking request', async ({
  page,
}) => {
  test.skip(!OWNER_PASSWORD, 'E2E secrets not configured');

  // confirmDialog() is window.confirm on web (vaccination warn, contact
  // nudge, leave-guard). Accept everything — the flow should proceed.
  page.on('dialog', (d) => void d.accept());

  // ── 1. Guest browses the feed ──────────────────────────────────────
  await page.goto('/');
  const card = page.getByText(LISTING_TITLE).first();
  await expect(card, 'seeded listing must be visible in the guest feed').toBeVisible({
    timeout: 30_000,
  });

  // ── 2. Open the listing ────────────────────────────────────────────
  await card.click();
  await expect(page.getByText(AR.messageHost).first()).toBeVisible({
    timeout: 30_000,
  });
  const listingUrl = page.url();

  // ── 3. Message host as guest → bounced to sign-in ─────────────────
  await page.getByText(AR.messageHost).first().click();
  await expect(
    page.getByPlaceholder(AR.emailPlaceholder),
    'guest tap should land on sign-in',
  ).toBeVisible({ timeout: 30_000 });

  // ── 4. Password sign-in (no OTP in CI) ─────────────────────────────
  await page.getByPlaceholder(AR.emailPlaceholder).fill(OWNER_EMAIL);
  await page.getByText(AR.usePasswordInstead).click();
  await page.getByPlaceholder(AR.passwordPlaceholder).first().fill(OWNER_PASSWORD);
  await page.getByText(AR.signInWithPassword, { exact: true }).click();

  // Post-auth the listing screen auto-fires the inquiry open (Round 5b
  // returnTo intent) and lands on /inquiries/[id]. Fall back to a manual
  // re-tap if the auto-fire didn't run (e.g. intent lost on reload).
  try {
    await page.waitForURL(/\/inquiries\//, { timeout: 20_000 });
  } catch {
    await page.goto(listingUrl);
    await page.getByText(AR.messageHost).first().click();
    await page.waitForURL(/\/inquiries\//, { timeout: 30_000 });
  }

  // ── 5. Send an inquiry message ─────────────────────────────────────
  const messageBody = `رسالة تجريبية آلية ${Date.now()}`;
  await page.getByPlaceholder(AR.composerPlaceholder).fill(messageBody);
  await page.getByText(AR.send, { exact: true }).first().click();
  await expect(
    page.getByText(messageBody),
    'sent message must appear in the timeline',
  ).toBeVisible({ timeout: 30_000 });

  // ── 6. Booking request: dates (next month, always future) + pet ───
  await page.goto(listingUrl);
  await page.getByText(AR.requestBooking).first().click();
  await page.waitForURL(/\/request/, { timeout: 30_000 });

  // RangeCalendar: hop to next month so both days are in the future,
  // then tap start (10th) and end (12th).
  await page.getByLabel(AR.nextMonth).first().click();
  await page.getByText('10', { exact: true }).first().click();
  await page.getByText('12', { exact: true }).first().click();

  // Pet picker — deterministic seed name.
  await page.getByText(PET_NAME).first().click();

  // ── 7. Submit → booking detail ─────────────────────────────────────
  await page.getByText(AR.submitRequest, { exact: true }).first().click();
  await page.waitForURL(/\/bookings\//, { timeout: 30_000 });
});
