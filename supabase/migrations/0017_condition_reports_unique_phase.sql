-- Step 7 prep: at most one check_in and one check_out per booking.
--
-- The condition_reports table doesn't currently have a uniqueness
-- constraint on (booking_id, phase), so an INSERT could in principle
-- write a second check_in or check_out row for the same booking.
-- Phase 6.4's design treats each phase as a single immutable record;
-- this migration enforces that at the DB level so the host can't end
-- up with two competing "drop-off" reports for the same stay.
--
-- A unique INDEX (rather than a UNIQUE CONSTRAINT) is used because it
-- supports IF NOT EXISTS — the migration is idempotent on re-run, and
-- it's functionally identical to a constraint for FK purposes.
--
-- Existing rows: production-clean (test bookings were just deleted).
-- If duplicates somehow exist at apply time, this CREATE INDEX will
-- fail loudly with a unique-violation error and the migration will
-- not partially apply — better than silently keeping bad data.

create unique index if not exists condition_reports_booking_phase_uniq
  on public.condition_reports (booking_id, phase);
