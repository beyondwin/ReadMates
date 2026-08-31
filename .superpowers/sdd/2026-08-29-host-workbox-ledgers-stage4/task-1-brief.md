# Stage 4 Task 1 brief — workbox persistence foundation

## Scope

Implement only Stage 4 plan Task 1 from Stage start `d1e51114ba9a47c03f82c49d5f9949ae49c798e1`.

- Create `V62__host_workbox_deferrals_and_snapshots.sql` after one final migration-tail check.
- Create the `hostworkspace` domain key/state contracts, application models and persistence ports needed for deferrals and immutable snapshots.
- Implement `JdbcHostWorkboxAdapter` for owned deferral upsert/read/remove, immutable snapshot persistence/page reads and bounded indexed cleanup.
- Add focused domain, migration/persistence and architecture tests. Modify architecture inventory files only when a RED assertion requires the new package/file classification.
- Keep both architecture dependency baseline files byte-identical.

## Required behavior

- A work-item key is authoritative, ASCII-safe, nonblank and at most 255 characters. Invalid keys fail before persistence.
- Deferral identity is exactly `(club_id, host_membership_id, work_item_key)`; ownership cannot cross club or host membership.
- A defer time must be strictly after the operation/evaluation time. Upsert overwrites the same owned key. `deferred_until <= evaluatedAt` reads as NOW even before physical cleanup.
- Persist the exact three-table V62 schema from the approved plan: deferrals, immutable snapshots and ordered snapshot items, with the specified FKs/checks/indexes.
- Snapshot metadata binds club, host membership, state, filter fingerprint, schema version, evaluatedAt and expiry. Snapshot item ordinals and keys are unique within the snapshot. Existing snapshot content is never updated in place.
- Cleanup is bounded and uses the indexed expiry paths: expired deferrals older than 30 days and expired snapshots only.
- Snapshot projections are privacy-safe opaque/allowlisted data for later normalization; tests must reject or avoid raw email, token, URL, provider body, page history and userId examples.
- No work-source predicate, derived completion implementation, cursor codec, controller, deferral HTTP route or SecurityConfig change belongs to Task 1.
- `hostworkspace.application` and `hostworkspace.domain` import no other ReadMates feature; no foreign persistence adapter import is allowed.

## TDD and evidence

1. Establish RED for key validation/future-only defer, overwrite/expiry, exact club+host ownership/cross-club isolation, immutable snapshot ordering/ownership/expiry and bounded cleanup.
2. Implement the smallest migration/domain/ports/adapter surface.
3. Run focused domain tests, `JdbcHostWorkboxAdapterTest`, migration/Flyway test selected for V62, `architectureTest`, `ktlintCheck`, `detekt`, baseline byte checks, `git diff --check` and targeted public-safety scan.
4. Commit only Task 1 files and report per-file SHA-256 plus RED/GREEN commands. Preserve the external untracked design directory.

## Exclusions

- No frontend work.
- No source aggregation, five source adapters, cursor signing or workbox API.
- No actual notification/email action.
- No unrelated baseline, snapshot or documentation changes.
