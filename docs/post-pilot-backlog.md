# Post-pilot backlog

The single home for deferred items — things intentionally punted until
after the pilot validates the core loop. Each entry names its trigger /
prod evidence so we know *why* it's safe to defer and *when* it stops
being safe.

> **⚠️ Note (2026-07-07):** Strategy has a comprehensive index to paste
> here verbatim (per-listing OG cards + district-only privacy guardrail,
> 2b-deploy, read receipts, nights metric, session-replay gate, file diet,
> E2E smoke, leakage ratio, parked North-Star scope). That paste hasn't
> come through yet (arrived as an empty placeholder twice). The items
> below were added from explicit in-flight decisions; **merge the
> canonical index in when it lands** — these entries are additive, not a
> replacement for it.

---

## Data model / RLS

### `bookings.pet_id` — keep the dual-write or migrate off it?
**Trigger:** the 0050 pets host-visibility fix (Phase 4) makes the
`booking_pets` junction the source of truth for a host's pet-visibility.
After that, `bookings.pet_id` (a pre-0009 single-pet column, still
**dual-written** by the request flow) is pure legacy — the only thing it
still powers is the OR-ed legacy clause in
`pets_select_owner_or_booking_host` (for any genuinely pre-0009 rows).

**Decision (post-0050):**
- **Keep the dual-write** — cheap back-compat, one redundant column, the
  legacy OR-clause stays as a safety net. OR
- **Migrate off `bookings.pet_id`** — stop dual-writing, backfill any
  legacy-only rows into `booking_pets`, drop the column + the legacy
  OR-clause once no code reads it. Cleaner model, one migration.

Not urgent; do it when touching the booking-request/junction code next.

## Product / lifecycle gaps

### Admin-disable should cascade to pending requests
When a listing is set to `admin_disabled`, its **pending booking
requests are not touched** — they sit in `requested` forever, and the
owner is never told the listing went away. Admin-disable should
**auto-decline the listing's pending requests and notify the affected
owners** (a `booking_declined` notification already exists via 0047 —
wire the admin-disable path to emit it, with an admin-disabled reason).
**Prod evidence:** booking `5331357f` — pending forever on a
disabled listing.

## Data hygiene (pre-pilot sweep)

### Orphaned legacy-only booking + junk test pets
- **Booking `5331357f` has zero `booking_pets` rows** — an orphaned,
  legacy-only booking (pet linked via `bookings.pet_id` only, nothing in
  the junction). Clean up (or backfill its junction row) during the
  pre-pilot sweep; also a data point for the `bookings.pet_id`
  migrate-off decision above.
- **Junk test pets throughout the pending set** — names like `"test"`,
  `"adf"`, `"12"`, `"11"`. Purge together with the shell/test accounts
  (`@petbnb.local`, `perbnb1`/`petbnb1`, `testtest`, `s234324`, the
  `+tos` aliases) so they don't pollute the first real pilot analytics.
  Add the detect + purge SQL to `docs/data-hygiene-prelaunch.md` when
  running the sweep.
