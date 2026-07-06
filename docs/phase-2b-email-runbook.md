# Phase 2b — Email notifications: deploy runbook (⛔ Omar checkpoint)

> **Status: WRITTEN, not deployed.** Same posture as written-not-applied
> migrations — Strategy reviews the function + 0049 before anything runs.
> Code: `supabase/functions/notify-email/index.ts` + migration
> `0049_notifications_email_guard.sql`. Design: plan doc §6
> (`docs/migration-0047-notifications-plan.md`).

## What this ships

Every in-app notification (0047) also delivers an **email** via Resend,
so a host who isn't in the app still hears about a booking request within
seconds. `message_received` is throttled to **one email per thread per
hour**; all other types always email. The email contains only the
localized title + a button back into the app — no message bodies.

## Deploy order (IMPORTANT)

**0049 first, webhook last.** If the webhook fires before 0049 is
applied, the `emailed_at` stamp raises and every send reports failure.

## Steps

### 1. Resend API key (NOT the SMTP credentials)
1. resend.com → sign in (same account that powers the auth SMTP).
2. **API Keys → Create API Key** — name `petbnb-notify`, permission
   "Sending access". Copy the `re_...` key (shown once).
3. Sender address: for smoke-testing, `onboarding@resend.dev` works
   without any domain setup (but only delivers to YOUR OWN Resend account
   email). For real recipients, verify a domain in Resend → Domains and
   use e.g. `Petbnb <notify@yourdomain.com>`.

### 2. Apply migration 0049
Supabase dashboard → SQL Editor → paste
`supabase/migrations/0049_notifications_email_guard.sql` wrapped in
`begin;` / `commit;` → run the verification queries at its tail → log
the apply in `docs/migration-apply-log.md`.

### 3. Deploy the Edge Function (needs the Supabase CLI once)
```bash
npx supabase login                      # one-time browser auth
npx supabase link --project-ref <ref>   # <ref> = dashboard URL slug
npx supabase functions deploy notify-email
```

### 4. Set the function secrets
```bash
npx supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  EMAIL_FROM="onboarding@resend.dev" \
  WEBHOOK_SECRET=<long random string — e.g. `openssl rand -hex 24`> \
  APP_BASE_URL=https://<your-vercel-app>.vercel.app
```
(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

### 5. Create the Database Webhook
Dashboard → **Database → Webhooks → Create**:
- Table: `public.notifications` · Events: **INSERT** only
- Type: **Supabase Edge Function** → `notify-email`
- HTTP header: `x-webhook-secret: <the same WEBHOOK_SECRET>`
- Timeout: default is fine.

### 6. Smoke
1. As an owner, request a booking → host gets the in-app row **and** an
   email within ~seconds (check Resend → Logs if not).
2. Send two messages in one thread within an hour (recipient doesn't
   open it) → exactly **one** email (Resend Logs shows one send; the
   second webhook call returns `throttled`).
3. In SQL editor: `select id, type, emailed_at from public.notifications
   order by created_at desc limit 5;` → the delivered rows carry
   `emailed_at`.

## Failure modes & posture
- **No RESEND_API_KEY secret** → function acks with "email disabled";
  in-app notifications unaffected.
- **Resend non-2xx** → function returns 500 so the webhook retries;
  `emailed_at` stays NULL (a retry won't be throttle-blocked).
- **Stamp fails after a successful send** → logged loudly in the
  function logs (double-send risk on retry); check Edge Function logs.
- Killing email entirely = disable the webhook. In-app keeps working.

## Review notes for Strategy
- The function only ever reads `auth.users.email` server-side; emails
  contain no message bodies or personal data beyond the localized title.
- 0049 knowingly lets a row owner set their OWN `emailed_at`
  (forward-only). Only consequence: self-suppressing one's own emails.
  Called out in the migration header.
- WhatsApp channel stays a no-op (plan: stub behind WHATSAPP_ENABLED).
