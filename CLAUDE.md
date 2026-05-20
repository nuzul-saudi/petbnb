# CLAUDE.md — Project Build Specification
## Petbnb — Saudi Pet Care Marketplace (MVP)

> This file is the single source of truth for Claude Code. Read this fully before writing any code. Do not deviate from the architecture or scope without explicit instruction. The founder is NOT a deep technical expert — explain decisions in plain language, go one step at a time, and never assume prior knowledge.
>
> NOTE ON NAME: "Petbnb" is the working/codebase name. The public brand name is not finalized (pending Saudi trademark check + an Arabic brand name). Use "Petbnb" throughout code, folder, and config for now.

---

## 0. What we are building (one paragraph)

A two-sided mobile marketplace for Saudi Arabia connecting cat owners with verified hosts who board pets in their own homes (Airbnb-style), plus add-on services (grooming, vet, transport) and a facilitation-only product marketplace. Arabic-first, RTL, mobile-first. This is an MVP to validate the model with the first ~100 bookings in one Riyadh neighborhood — NOT a scaled production system. Prioritize working core flows over feature completeness.

---

## 1. Working with a non-technical founder (READ THIS CAREFULLY)

- The founder has done light technical work before but is NOT an engineer.
- After EVERY step: explain in plain language what you did, why, and what the founder should see on screen.
- Before installing anything or running commands, tell the founder exactly what to type and what should happen.
- If something fails, do not dump raw errors — explain what went wrong in plain words and the fix.
- Never proceed past a numbered build step without the founder confirming "it works, continue."
- When the founder must act outside the code (create a Supabase account, get a key, etc.), give numbered click-by-click instructions.

---

## 2. Tech stack (do not substitute without asking)

- **Framework:** Expo (React Native) with Expo Router. One codebase → iOS, Android, Web.
- **Language:** TypeScript (strict mode).
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security).
  - Use the NEW Supabase API keys (`sb_publishable_...`), not legacy `anon` keys.
  - Config in `app.config.ts` via `extra`, injected from `.env`. Never commit `.env`.
- **Auth:** Supabase **Phone (SMS OTP) authentication** for Saudi mobile numbers (+966). This REPLACES Nafath for the MVP. Nafath is explicitly out of scope. Keep a `nafath_verified` boolean in the profile for the future, default false; build no Nafath flow.
- **Payments:** Mock/stub only. Architect a `PaymentProvider` interface so Moyasar/HyperPay (mada, STC Pay, Apple Pay) can be added later. Do NOT integrate real payments.
- **State:** React Context for auth/session; TanStack Query for server state.
- **Styling:** Single theme file with the tokens in Section 8. RTL by default.
- **i18n:** All user-facing strings in an `ar` locale file from day one. No hardcoded strings in components. Structure for future `en`.

---

## 3. Build order (STRICT — one at a time, confirm each before next)

1. Project scaffold + run it blank on web + Arabic/RTL + theme + i18n skeleton
2. Supabase project connection + `.env` + client helper (founder creates the Supabase project — give instructions)
3. Database schema + Row Level Security (Section 5)
4. Auth: Saudi phone number → SMS OTP → verify → create profile → choose role (owner/host/both)
5. Owner flow: browse Riyadh hosts → host detail with home photo gallery → request booking + optional add-on → confirmation (mock payment)
6. Check-in / check-out condition report flow (CRITICAL — Section 6)
7. Host flow: create listing + upload home gallery photos + accept/decline requests + post daily updates
8. Bookings list + status tracking for both sides
9. Basic in-app messaging (owner ↔ host)
10. Marketplace screen (display only — products + "sold by X" label, NO cart/checkout)

STOP after each numbered item. Run it. Show the founder. Wait for "continue."

---

## 4. Scope discipline (do NOT build these in MVP)

Even if useful: real payments, real insurance, Nafath, push notifications, merchandise cart/checkout, admin dashboard (use Supabase dashboard), multi-city, dogs, ratings algorithm (simple 1–5 stars + text only), subscriptions/wellness plans. If you think something out of scope is needed, ASK first.

---

## 5. Data model (core tables, RLS ON for every table)

- **profiles**: id (uuid fk auth.users), full_name, phone, role (`owner`|`host`|`both`), avatar_url, created_at, nafath_verified (bool default false), id_document_url (nullable, future)
- **pets**: id, owner_id, name, species (default 'cat'), breed, age_months, vaccination_doc_url, behavioral_notes, photo_url
- **listings**: id, host_id, title_ar, description_ar, neighborhood, nightly_price_sar, max_concurrent_pets, has_resident_pets (bool), resident_pets_note, is_active, tier (`bronze`|`silver`|`gold` default bronze), offers_grooming (bool default false), host_gender (`female`|`male`)
- **listing_photos**: id, listing_id, photo_url, sort_order  (THE AIRBNB-STYLE HOME GALLERY)
- **bookings**: id, listing_id, owner_id, pet_id, start_date, end_date, nights, base_price_sar, addons_total_sar, total_sar, status (`requested`|`accepted`|`declined`|`active`|`completed`|`cancelled`|`disputed`), created_at
- **booking_addons**: id, booking_id, type (`grooming`|`vet`|`transport`|`insurance`), provider_label, price_sar
- **condition_reports**: id, booking_id, phase (`check_in`|`check_out`), reporter_id, weight_note, health_notes, behavior_notes, photos (jsonb url array), created_at  (Section 6)
- **daily_updates**: id, booking_id, host_id, photos (jsonb array), video_url (nullable), note_ar, created_at
- **messages**: id, booking_id, sender_id, body, created_at
- **reviews**: id, booking_id, rater_id, ratee_id, stars (1–5), text_ar, created_at
- **products** (display only): id, name_ar, seller_name, brand, price_sar, category, image_url, is_halal_certified (bool)

RLS: users read/write only their own rows; a booking is visible to both its owner and the listing's host; active listings publicly readable.

---

## 6. Check-In Condition Report (HIGHEST PRIORITY FEATURE)

The single most important risk-mitigation feature. Not optional polish.

- At drop-off both owner and host complete a shared report, phase=`check_in`: min 3 photos of the cat, weight note, visible health notes, behavior notes. Both tap "I confirm this is accurate."
- At pickup, same with phase=`check_out`.
- Reports are immutable once submitted (no edit/delete).
- A booking cannot become `active` until a confirmed `check_in` report exists.
- This is the evidence record for disputes. Fast but thorough UX.

---

## 7. Cultural & language requirements (non-negotiable)

- RTL by default. Test every screen in RTL.
- All text in Arabic via i18n. Natural Saudi tone, not stiff MSA.
- Arabic-Indic numerals in display where appropriate (helper function).
- Currency always "ر.س", never "$".
- `host_gender` on listings + owner filter "female hosts only" (real feature).
- Saudi phone format +966 5X XXX XXXX in the auth flow.
- Fonts: Tajawal (body), Reem Kufi (headings) via expo-font.
- Stub `notificationsAllowed()` helper (future prayer-time awareness) — leave the seam.

---

## 8. Design tokens (use exactly these)

```
--sand: #F5EFE6   --cream: #FAF6EE   --paper: #FFFCF5
--ink: #1F2A1D    --ink-soft: #3D4A3A
--moss: #2D4A2F   --moss-deep: #1A3018   --moss-light: #4A6B4A
--gold: #C4A464   --gold-deep: #8C7340
--terracotta: #B45842   --rose: #D49389   --whisper: #E8DFCC
```
Warm, premium, trust-conveying. Deep moss green primary, sand/cream backgrounds, gold accents. NOT bright/cartoonish. Rounded corners 16–22px, soft shadows, generous spacing.

---

## 9. Engineering principles

- Small reviewable commits, one feature each.
- TypeScript strict; no `any` without a justifying comment.
- Every Supabase call in try/catch with a friendly Arabic error message.
- Loading + empty states on every screen — never a blank screen.
- `.env` + `.gitignore` from the very first commit. No secrets in code.
- Comment the "why", not the "what".
- After each step: run on web preview, confirm, summarize changes + next step. Do not batch features.

---

## 10. Definition of done (the entire MVP)

A test user can: sign up with a Saudi phone number via SMS code → browse Riyadh hosts → open a host with a home photo gallery → request a booking with one add-on → (as host) accept it → both complete a check-in condition report → host posts a daily update → owner sees it → both complete check-out → both leave a review. All in Arabic, RTL, on web + one mobile platform. Nothing more until that works end to end.
