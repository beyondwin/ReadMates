# ReadMates Backend Quality Phase 1 — Flyway Migration Immutability

> **Execution:** Use subagent-driven development in this session. Run one fresh implementer and one independent reviewer per task, sequentially. Keep the plan-specific ledger and reports under the workspace returned by `scripts/sdd-workspace`.

**Goal:** Make every production Flyway migration that exists in the comparison base immutable, allow only valid forward migrations, and give CI and operators actionable evidence before a changed migration reaches an already-migrated database.

**Plan base:** Admin Health final reviewed HEAD `fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af` plus this plan commit.

**Approved source:** `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md` §8.2, Wave 2, validation, and final acceptance criteria.

**Current evidence:** The production source of truth is `server/src/main/resources/db/mysql/migration/` with 40 versioned files (`V1`, `V9` through `V47`). `MySqlFlywayMigrationTest` already proves clean installation and populated supported upgrades from V42 and V44. It does not compare the current tree with a base commit, and the CI checkouts currently use the shallow default, so an edited or deleted historical SQL file can pass on a fresh database.

**Architecture:** A repository-level, standard-library-only Python checker owns Git history comparison and migration catalog validation. It receives an explicit trusted base ref, resolves the merge base, compares every production versioned migration present there with the checked-out worktree, and fails closed on missing history. Flyway/Testcontainers retains runtime checksum and upgrade evidence. CI supplies complete history and an event-derived base SHA. No application runtime package depends on repository or CI details.

**Technology:** Python 3 standard library, Git, GitHub Actions, Kotlin 2.4, Flyway, JUnit 5, Testcontainers MySQL 8.4, Bash public-release fixtures.

## Scope and fixed decisions

- The only production migration directory is `server/src/main/resources/db/mysql/migration/`.
- Every production `.sql` file must match `V{positive integer}__{lower_snake_case_description}.sql`. Existing intentional gaps V2 through V8 remain valid; repeatable `R__` migrations are not introduced.
- A migration path and byte content that exist at the resolved comparison base are immutable. Modification, deletion, rename, or relocation fails.
- A new migration is allowed only when its version is unique and strictly greater than the highest version in the comparison base. Corrections use a new forward-only migration; never edit history or invoke Flyway repair as a normal remediation.
- The checker validates the checked-out worktree, including untracked migration files, so it is useful before commit as well as in CI.
- A version-looking SQL file outside the canonical production directory under `server/src/main/resources/` fails. Test resources and the supported-upgrade fixture are not production migrations.
- An unresolved base ref, missing merge base, shallow/incomplete history, malformed catalog, duplicate version, symlinked migration, or unreadable file fails with a bounded public-safe message and a forward-migration remedy. SQL contents and local absolute paths are not printed.
- CI uses event-provided immutable SHAs: pull-request base SHA for PRs and the push `before` SHA for `main` pushes. An all-zero or otherwise unavailable push base falls back only to a verified `HEAD^`; it never silently skips the gate.
- Preserve all existing migration SQL byte-for-byte. This plan adds no production migration and does not use production data, a live database, Flyway repair, remote push, PR, tag, or deploy.

---

### Task 1: Fail-Closed Migration History And Catalog Checker

**Files:**
- Create: `scripts/check-flyway-migration-immutability.py`
- Modify: `scripts/README.md`

**RED:**

Add the checker self-test harness first. Each case creates an isolated temporary Git repository with a canonical V1/V9 base and invokes the same public checker entry point. Capture failures before the implementation exists for:

1. a historical migration modified in place;
2. a historical migration deleted, renamed, or moved;
3. duplicate versions with different descriptions;
4. malformed filename, zero version, uppercase/non-snake description, non-SQL file in the production migration directory, and a version-looking SQL file in a wrong main-resource directory;
5. a new version at or below the base maximum;
6. unresolved base ref, unrelated history/no merge base, and deliberately shallow history;
7. symlinked or unreadable production migration input.

Positive fixtures must include an unchanged tree, a new unique `V10` above the base maximum, and pre-commit detection of an untracked valid migration.

**GREEN:**

- Implement `--base-ref <ref>` as a required normal-mode input and `--self-test` as a hermetic mode that requires no repository or network.
- Resolve and report the exact merge-base object ID, but compare base-tree bytes with the checked-out worktree rather than only `HEAD`, so staged, unstaged, deleted, and untracked changes are covered.
- Enumerate the base tree with Git plumbing and the current catalog without following symlinks. Normalize versions as positive decimal integers and reject duplicate numeric identities such as `V047` versus `V47`.
- Emit deterministic violation categories and relative paths, then a concise remedy naming the next valid version. Do not emit SQL bodies, environment variables, remote URLs, usernames, or absolute paths.
- Document local use and forward-only remediation in `scripts/README.md`.

**Focused GREEN:**

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py \
  --base-ref fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af
```

**Commit:** `feat(scripts): enforce immutable flyway history`

---

### Task 2: CI History And Trusted Base Contract

**Files:**
- Modify: `scripts/check-flyway-migration-immutability.py`
- Modify: `.github/workflows/ci.yml`

**RED:**

- Extend hermetic self-tests with minimal workflow fixtures and assert that the CI contract rejects a scripts-job checkout without `fetch-depth: 0`, a missing checker self-test, a missing history check, an event base that can become empty, and a gate guarded by `continue-on-error` or an always-success fallback.
- Run the workflow contract against the current CI file and capture the expected failure caused by shallow checkout and missing Flyway steps.

**GREEN:**

- Add `--check-workflow <path>` to validate only the load-bearing scripts-job contract without becoming a general YAML linter.
- Set `fetch-depth: 0` on the `scripts` job checkout only; do not expand unrelated jobs that do not compare history.
- In the scripts job, run the checker self-test, workflow-contract check, and real history check.
- Select the PR base SHA from `github.event.pull_request.base.sha`; select `github.event.before` for a `main` push. Reject empty/unresolved SHAs. Permit a zero-SHA push fallback only after `HEAD^` resolves locally.
- Keep `permissions: contents: read`; do not fetch or contact any remote from the checker itself.

**Focused GREEN:**

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py \
  --check-workflow .github/workflows/ci.yml
python3 -B scripts/check-flyway-migration-immutability.py \
  --base-ref fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af
```

**Commit:** `ci: verify immutable flyway migrations`

---

### Task 3: Runtime Checksum And Supported Upgrade Evidence

**Files:**
- Create: `server/src/test/kotlin/com/readmates/support/FlywayChecksumImmutabilityTest.kt`
- Verify without weakening: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Verify without editing: `server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql`

**RED:**

- Against a local Testcontainers MySQL 8.4 database and a temporary filesystem migration directory, apply a minimal V1, mutate its bytes, and assert Flyway validation/startup fails with a checksum mismatch. Capture the missing test before adding production-independent fixture support.
- Add a companion scenario that leaves V1 untouched, adds forward-only V2, and migrates successfully with both history rows intact.
- Assert failure evidence exposes the migration version and checksum-mismatch category without requiring SQL contents or a database repair operation.

**GREEN:**

- Keep the fixture isolated from the production migration directory and use only synthetic public-safe schema/table names.
- Do not catch or normalize Flyway failures in production code. The test documents the runtime backstop; the repository checker remains the pre-merge guard.
- Re-run the existing `MySqlFlywayMigrationTest` to preserve clean install plus populated V42 and V44 upgrade paths through the current V47 schema.

**Focused GREEN:**

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.support.FlywayChecksumImmutabilityTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `test(server): prove flyway checksum immutability`

---

### Task 4: Public Candidate And Operator Contract

**Files:**
- Modify: `scripts/build-public-release-candidate.sh`
- Modify: `scripts/verify-public-release-fixtures.sh`
- Modify: `docs/development/adr/0007-mysql-with-flyway-over-alternatives.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/test-guide.md`
- Modify: `CHANGELOG.md`

**RED:**

- Require the public candidate to contain the checker and run its hermetic self-test from the candidate. Capture the current candidate fixture failure because the checker is not copied.
- Add documentation assertions or targeted scans that fail while ADR-0007 still claims V1–V28/21 migrations and a disabled `test` command, and while the test guide lacks the base-ref/history gate and forward-only remediation.

**GREEN:**

- Copy the checker as a required public-candidate file and add it to the required-workspace fixture list. Run `--self-test` from the built candidate without `.git`; do not run history mode in the candidate.
- Update ADR-0007 to the current V1/V9–V47, 40-file state or replace the drift-prone full table with a generated/source-of-truth description. Use the active `integrationTest` command, not the disabled Gradle `test` task.
- Document the two complementary controls: repository base-tree immutability before merge and Flyway checksum validation after application. State that historical edits, deletes, renames, repair, and baseline growth are not remediation; a new higher forward migration is.
- Document CI base selection, failure evidence, local commands, supported V42/V44 upgrade evidence, and the fact that this plan changes no production schema.
- Add an Unreleased CHANGELOG entry for the quality gate and operator behavior.

**Focused GREEN:**

```bash
./scripts/verify-public-release-fixtures.sh
git diff --check
rg -n "check-flyway-migration-immutability|forward-only|V42|V44" \
  scripts/README.md docs/development/adr/0007-mysql-with-flyway-over-alternatives.md \
  docs/development/architecture.md docs/development/test-guide.md CHANGELOG.md
```

**Commit:** `docs: record immutable flyway workflow`

---

### Task 5: Canonical Verification And Plan Review

**Files:**
- Modify only if evidence is factually incomplete: the documentation files from Task 4.
- Create ignored SDD reports and update the plan ledger; do not commit them.

**Verification:** Run sequentially at final task HEAD and retain exit codes and Testcontainers XML totals:

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py \
  --check-workflow .github/workflows/ci.yml
python3 -B scripts/check-flyway-migration-immutability.py \
  --base-ref fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af
git diff --exit-code fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af..HEAD -- \
  server/src/main/resources/db/mysql/migration
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check fbb96288ea3cf9b93cdf2e26a7cb1ea0ecc951af..HEAD
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Also inspect the checker and generated evidence for private paths, remote URLs, token-shaped values, SQL bodies, and accidental production-data fixtures. Do not claim a skipped command passed.

**Plan review:** Generate a full-range review package from this plan commit to final HEAD. The independent reviewer must explicitly inspect history completeness, merge-base semantics, working-tree coverage, rename/delete detection, numeric version identity, CI event-base selection, fail-closed messages, checksum evidence, supported upgrade preservation, public-candidate inclusion, and whether tests actually fail when each control is removed. Any material finding receives one fresh-implementer fix wave, full relevant verification, and re-review.

**Commit:** `docs: close flyway immutability plan` only if final evidence requires a factual documentation correction; otherwise no tracked commit.

## Plan acceptance criteria

- Historical production migrations from the resolved comparison base cannot be modified, deleted, renamed, moved, or replaced without a failing repository gate.
- New production migration additions pass only with a valid canonical name and a unique version strictly above the base maximum.
- Duplicate versions, malformed names, wrong locations, missing history, and unresolved comparison bases fail closed with actionable public-safe evidence.
- CI has complete history in the one job that performs the comparison and derives an immutable explicit base SHA for PR and `main` push events.
- Flyway runtime checksum mismatch and a forward-only successor are proven on local MySQL 8.4; existing clean-install and supported V42/V44 upgrade tests pass.
- The public release candidate contains the checker, its hermetic self-test passes without `.git`, and the public scanner reports no leaks.
- No existing production migration bytes change, no Flyway repair is used, no test/gate is weakened, and the tracked worktree is clean after independent approval.
