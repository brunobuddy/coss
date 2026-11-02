-- What prevents double-booking: no two claims of a host may overlap in both the time they occupy
-- and the time they're live. An expired hold's live range ends, so it stops blocking on its own.
-- The host id is text, which GiST can only index with btree_gist.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "scheduling_claim" ADD CONSTRAINT "scheduling_claim_no_overlap" EXCLUDE USING gist (
  "host_id" WITH =,
  tstzrange("occupied_start", "occupied_end", '[)') WITH &&,
  tstzrange("live_from", "live_until", '[)') WITH &&
);
