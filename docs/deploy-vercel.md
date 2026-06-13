# Deploy to Vercel — web build

This is the step-by-step for deploying the Petbnb web build to Vercel.
Project URL stays NEUTRAL until the trademark question is settled —
don't name the Vercel project `petbnb`. Something like
`petcare-test` is fine.

The repo already contains `vercel.json` and the build command works
locally. The steps below are the manual clicks YOU do in dashboards.

---

## Step 1 — Vercel project setup

1. Sign in at https://vercel.com.
2. **Add New → Project → Import Git Repository.** Pick the GitHub
   repo (`petbnb` or whatever the GitHub repo is called — that
   stays private, only the Vercel project name affects the public
   URL).
3. **Project name:** pick something neutral (`petcare-test`,
   `pet-marketplace-test`, etc.). Vercel will give you
   `<name>.vercel.app`. This is the URL testers will use.
4. **Framework Preset:** leave on `Other` (Vercel auto-detects from
   `vercel.json`).
5. **Build & Output Settings:** leave the auto-detected values
   alone. `vercel.json` already specifies:
   - Build Command → `npx expo export -p web`
   - Output Directory → `dist`
   - SPA rewrites → all unmatched routes go to `/index.html` so
     Expo Router deep links work on refresh.
6. **Environment Variables** — set these BEFORE the first deploy
   (see Step 2 below).
7. **Deploy.**

If a build fails, click into the Vercel deployment logs — the error
will be in `Build Logs`. The most common cause is missing env vars
(see below).

---

## Step 2 — Environment variables (Vercel dashboard)

In the Vercel project, go to **Settings → Environment Variables**
and add exactly these two:

| Name | Value | Environments |
|------|-------|--------------|
| `SUPABASE_URL` | `https://<your-project-ref>.supabase.co` | Production, Preview, Development |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (the NEW publishable key, not the legacy `anon` key) | Production, Preview, Development |

Variable names come from `app.config.ts` — these are the only two
the build reads. Copy from your local `.env`.

### DO NOT add any of these — they'd leak in the public bundle

- ❌ `SUPABASE_SERVICE_ROLE_KEY` (or any `sb_secret_…` key) — bypasses
  RLS. Never enters a web build. Only ever used in trusted server
  code (Edge Functions, admin scripts).
- ❌ `RESEND_API_KEY` (the `re_…` Resend mail key) — server-only.
- ❌ Any Stripe / Moyasar / HyperPay secret — payments are mocked
  in this build; when real, the secret lives in Supabase Edge
  Functions, not the web bundle.

The publishable key is fine in the client bundle by design — it's
gated by RLS at the database. The secret key is NOT gated and would
let any reader bypass every policy.

After adding the vars, click **Save** then **Redeploy** from the
Deployments tab. (Env var changes don't auto-trigger a build.)

---

## Step 3 — Supabase URL configuration (most-skipped step)

Supabase email-OTP auth refuses to send sign-in links to URLs not in
its allow-list. Without this step, every login attempt from the
deployed site will silently fail.

In the Supabase dashboard for your project:

1. **Authentication → URL Configuration.**
2. **Site URL** — set to `https://<your-vercel-project>.vercel.app`.
3. **Redirect URLs (allow-list)** — add both:
   - `https://<your-vercel-project>.vercel.app`
   - `https://<your-vercel-project>.vercel.app/**` (covers all
     deep-link callbacks)
4. **Save.**

If you set up a custom domain later, repeat with the new domain.

> Why this matters: when a user submits the sign-in email form,
> Supabase generates a magic link pointing to `redirectTo`. Anything
> not on the allow-list is rejected with a generic error. This is
> the #1 reason "I deployed it but login is broken" — you didn't
> add the Vercel URL here.

---

## Step 4 — Smoke test the deployed site

1. Open `https://<your-vercel-project>.vercel.app/` in a fresh
   browser window.
2. Sign in with an email you control. You should receive a magic
   link from Supabase that opens `<your-vercel-project>.vercel.app`
   — NOT localhost. If it opens localhost, you missed Step 3.
3. After sign-in, the owner feed should load with at least the
   approved listings. If it errors with "Couldn't load sitters",
   either:
   - The Supabase URL/key is wrong in Vercel (check Step 2)
   - RLS is rejecting (less likely; the same RLS works locally)
   - A migration the deployed code expects isn't applied — check
     the unapplied list in `supabase/migrations/`.
4. Tap a listing → detail page should show the photo mosaic and
   the rich-detail sections. The lightbox should open on tap.
5. Refresh on a deep route like `/listings/<some-id>`. It should
   load directly — if it 404s, the SPA rewrite in `vercel.json`
   isn't being applied (rare; usually means an old deployment
   without the rewrite).

---

## Troubleshooting quick reference

| Symptom | Likely cause |
|---|---|
| Build fails on Vercel | Missing env var (Step 2) or Node version mismatch |
| Login emails don't arrive at the deployed URL | Supabase URL Configuration (Step 3) |
| "Couldn't load sitters" on the feed | Wrong Supabase URL/key in Vercel env vars |
| Refresh on `/listings/abc` shows 404 | `vercel.json` rewrites not deployed — push a fresh build |
| Login email goes to localhost | Supabase redirect URLs missing the Vercel URL |

---

## What's NOT in this batch

- **Native app builds (iOS / Android)** — Expo EAS Build is the path
  there, separate flow with its own credentials. Web is browser-first
  for testers.
- **Payments** — mocked. The web bundle has no payment SDK keys.
- **Real SMS auth** — staying on email OTP until Saudi CR + CITC
  alpha sender ID registration completes (per CLAUDE.md §11).
- **Custom domain** — point a domain at the Vercel project once
  trademark settles. Then repeat Step 3 with the new domain.
