# Batch run — autonomous plan + checklist

> Resume rule: on session drop / "continue", run `git log --oneline -10` + `git status`, read this file, and pick up at the first unchecked item below.

## CORE

### Phase 0a — Finish Step 8 (8i)
- [ ] Migration 0024: drop trigger `listings_sync_is_active`, drop function, drop `is_active` column.
- [ ] Code: remove `is_active` from `database.ts` listings types + stale bridge comments.
- [ ] Commit `chore(listings): drop is_active column (8i)`.

### Phase 0b — DB-level status guard
- [ ] Migration 0025: BEFORE INSERT OR UPDATE trigger on listings.
- [ ] Permitted transitions for non-admins (admin bypass via `is_admin()`):
  - INSERT: status must be 'pending'.
  - UPDATE: only `approved↔paused`.
- [ ] Verification queries appended as comments.
- [ ] Commit `feat(listings): DB-level status transition guard (0b)`.

### Phase 0c — Sweep
- [ ] Recon: admin filter pills (broken/tall), Sitter/Sitter chips, zero-count dashboard cards.
- [ ] Fix admin host-gender chips: "Sitter/Sitter" → "Female/Male" labels.
- [ ] Fix zero-count dashboard cards → inert.
- [ ] Fix 8e last-photo edge case (block deleting last photo with message).
- [ ] Dead-code cleanup: orphaned styles/imports in bookings/[id].tsx, newBadge rename.
- [ ] Docs: ONBOARDING.md + CLAUDE.md §11 — mark check-out reports + status/two-copy model as SHIPPED.
- [ ] Commit each fix or batch sensibly.

## MILESTONE A — Vaccination & care

### Migration 0026
- [ ] `pets` adds: `rabies_vaccinated_at date`, `fvrcp_vaccinated_at date`, `vaccination_doc_url text`.
- [ ] `pets` adds: `care_notes text`.
- [ ] `listings` adds: `requires_vaccination boolean not null default false`.
- [ ] `listing_drafts` mirrors: `requires_vaccination`.
- [ ] `promote_listing_draft` RPC CREATE OR REPLACE — copy `requires_vaccination` from draft to live.
- [ ] Verification queries appended.

### Code chain (two-copy seams)
- [ ] `database.ts` types updated (pets + listings + listing_drafts).
- [ ] `createListing` accepts + writes `requires_vaccination`.
- [ ] `UpdateListingPatch` adds `requiresVaccination`.
- [ ] `updateListing` full-snapshot + upsert paths include the field.
- [ ] `getListingForEdit` returns it in `values`.
- [ ] `ListingForm` adds the toggle.
- [ ] Pet form gains vaccination section (3 date fields + doc upload).
- [ ] Pet form gains care_notes textarea.
- [ ] Booking request screen: if listing requires vaccination AND pet missing → warn.
- [ ] Host sees pet vaccination status on booking request.
- [ ] Care notes visible to host on confirmed booking.
- [ ] i18n both locales.
- [ ] Commit `feat(pets+listings): vaccination & care (A)`.

## MILESTONE B — Availability & capacity

### Recon
- [ ] Read bookings schema (statuses, listing_id, pet_id link table or single, start/end date columns).

### Migration 0027
- [ ] `listing_blocked_dates` table.
- [ ] RLS: host-of-listing + admin manage; authenticated read.
- [ ] Capacity trigger: BEFORE INSERT OR UPDATE on bookings — exceed `max_concurrent_pets` or overlap blocked range → raise.
- [ ] Verification queries appended.

### Code
- [ ] Lib helpers: list/add/remove blocked ranges.
- [ ] Host "Manage availability" screen.
- [ ] Entry from edit screen.
- [ ] Client-side pre-check at booking request (warn before submit).
- [ ] i18n both locales.
- [ ] Commit `feat(listings+bookings): availability + capacity (B)`.

## STRETCH

### S1 — Payments foundations (mock)
- [ ] Migration 0028: bookings adds price snapshot + fee + payout + cancellation fields.
- [ ] Mock charge at host-accept.
- [ ] Payout release on stay completion / check-out report filed.
- [ ] Cancellation refund per locked policy (≥48h full, <48h 50%, after start none).
- [ ] Booking request screen breakdown.
- [ ] Host sees payout amount.
- [ ] Commit `feat(bookings): payments foundations (S1)`.

### S2 — Discovery (filters + reviews)
- [ ] Owner-feed price-range filter, grooming-offered filter, no-resident-pets filter (chip pattern).
- [ ] Recon: does a reviews table exist?
- [ ] If yes: avg rating + review count on ListingCard + detail.
- [ ] If no: skip and log.
- [ ] Commit(s).

## Final report (last thing)
- [ ] Commit list with SHAs.
- [ ] Decision log summary.
- [ ] Migration run-list (0024 → 0028) with expected verification.
- [ ] Consolidated smoke-test checklist.
