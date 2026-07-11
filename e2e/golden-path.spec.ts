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
  addDate: 'إضافة تاريخ',
  nextMonth: 'الشهر التالي',
  perPetServices: 'خدمات لكل قطة',
};

test('golden path: browse → sign-in → inquiry → booking request', async ({
  page,
}) => {
  test.skip(!OWNER_PASSWORD, 'E2E secrets not configured');

  // confirmDialog() is window.confirm on web (vaccination warn, contact
  // nudge, leave-guard). Accept everything — the flow should proceed.
  page.on('dialog', (d) => void d.accept());

  // Diagnostics — the trace artifact isn't reachable from CI's runner
  // egress, so surface the browser's own signals into the CI log. A JS
  // exception in a render path, or a failed Supabase query (RLS/network),
  // will show up here and name the cause directly.
  const browserLog: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      browserLog.push(`[console.${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => browserLog.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) =>
    browserLog.push(
      `[requestfailed] ${r.url()} — ${r.failure()?.errorText ?? '?'}`,
    ),
  );

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

  // The RangeCalendar lives inside SearchWhenModal — it only mounts
  // once the date card is tapped. Open it first, then hop to next
  // month (so both days are future) and tap start (10th) + end (12th).
  // Picking a complete range auto-applies and closes the modal
  // (RangeCalendar.onRangeComplete), so no explicit "Apply" tap.
  await page.getByText(AR.addDate).first().click();
  await page.getByLabel(AR.nextMonth).click();
  // Scope the day taps to the open dialog so a stray "10"/"12" on the
  // request screen behind the modal can't be matched instead.
  const calendar = page.getByRole('dialog');
  await calendar.getByText('10', { exact: true }).click();
  await calendar.getByText('12', { exact: true }).click();

  // Picking a complete range auto-closes the picker; wait for the dialog
  // to detach before touching the pet row.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });

  // Pet picker. ROOT CAUSE of the earlier "0 قطط" failures: request.tsx
  // auto-selects the pet on load when the owner has exactly ONE pet
  // (`p.length === 1`), which is the seed reality here. Blindly tapping
  // it then TOGGLED it OFF (togglePet is a toggle), leaving zero pets
  // selected. So: wait for the row, and tap ONLY if it isn't already
  // selected — i.e. if the per-pet services section (which mounts once a
  // pet is selected) isn't showing yet. Robust to both the 1-pet
  // auto-select seed and a hypothetical multi-pet owner. The seed pet is
  // "E2e cat" (lowercase); match case-insensitively.
  const petCheckbox = page
    .getByRole('checkbox', { name: new RegExp(PET_NAME, 'i') })
    .first();
  await expect(petCheckbox, 'pet row must load').toBeVisible({ timeout: 15_000 });
  const perPetServices = page.getByText(AR.perPetServices).first();
  const alreadySelected = await perPetServices.isVisible().catch(() => false);
  if (!alreadySelected) {
    await petCheckbox.click();
  }
  try {
    await expect(perPetServices).toBeVisible({ timeout: 15_000 });
  } catch {
    // Safety net — surface page state into the CI log if selection still
    // isn't reflected (the trace artifact isn't reachable from CI egress).
    const catsMeta = await page
      .getByText(/\d+\s*قطط/)
      .first()
      .textContent()
      .catch(() => '(no cats-count)');
    throw new Error(
      `per-pet services not visible after ensuring pet selection.\n` +
        `sticky cats-count: ${catsMeta}\n` +
        `browser log:\n${browserLog.join('\n') || '(empty)'}`,
    );
  }

  // ── 7. Submit → booking detail ─────────────────────────────────────
  await page.getByText(AR.submitRequest, { exact: true }).first().click();
  // If the submit doesn't navigate, the screen shows an inline error
  // (validation or a write/RLS rejection). Surface its text so the CI
  // log names the cause instead of a bare navigation timeout.
  try {
    await page.waitForURL(/\/bookings\//, { timeout: 30_000 });
  } catch (navErr) {
    const inlineError = await page
      .getByText(/تعذّر|يرجى اختيار|تاريخ (المغادرة|الوصول)|محجوبة|موقوفة/)
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `booking submit did not navigate to /bookings/. On-screen error: ${
        inlineError ?? '(none found)'
      }`,
    );
  }
});
