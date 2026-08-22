# Host Client v3 Rollout and Product Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 mutating `/api/host/**`를 안전하게 v3 generation으로 전환하고, 혼합 배포·비세션 회귀·권한 상실·캐시 경계·cross-browser·접근성·성능·공개 저장소 안전 증거가 모두 있을 때만 제품 완료와 ADR 승격을 허용한다.

**Architecture:** Spring filter와 BFF가 먼저 `v2|v3` support window를 제공한다. R1은 v2 browser + v2/v3 BFF, R2a는 A7+C1 safety backend/cache policy + v2 browser, R2b는 v3 browser + 같은 pass-through BFF이며 모두 서로 다른 immutable tags다. R2a 뒤 이전 720초 browser policy를 소진하고 cache-safety browser evidence를 얻은 다음에만 R2b를 허용한다. v3 browser는 BFF capability를 preflight하고 generation을 downgrade 없이 전달하며 session-management mutation은 새 envelope를 사용하고 non-session mutation은 기존 의미를 유지한다. Adoption gate 뒤 backend alone enters `ENFORCE_V3`; BFF remains an allowlist/pass-through boundary. Focused Firefox/WebKit projects, production-build performance harness, manual screen-reader ledger, deploy-contract checker, public-release scanner가 구현과 운영 계약을 닫는다.

**Tech Stack:** Cloudflare Pages Functions, Vite dev proxy, React/TypeScript, Vitest, Playwright Chromium/Firefox/WebKit, Kotlin/Spring Security filter, Micrometer, GitHub Actions, repository deploy/public-release scripts.

**Spec:** `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

ADR impact: new — ADR-0034, ADR-0035, ADR-0036, ADR-0037; constraining references — ADR-0029, ADR-0031

## Global Constraints

- Client generation is global to every mutating `/api/host/**`; it is not a session-endpoint feature flag.
- Secret and same-origin Origin/Referer checks remain fail closed and execute before controller side effects. Browser-provided trusted/internal headers are stripped.
- BFF validates/allowlists the browser contract and forwards the same generation; it never downgrades or translates v3 semantics into v2.
- Backend policy is `DISABLED|V2_ONLY|SUPPORT_V2_V3|ENFORCE_V3`. Support accepts v2/v3 and rejects missing/unknown; enforcement rejects v2/missing/unknown host mutation with `428 CLIENT_UPDATE_REQUIRED`. Reads remain available when safe.
- Do not flip browser to v3 until backend and BFF support is live/tested. Do not enforce v3 until browser adoption evidence and non-session mutation regressions pass.
- Repository implementation, tests, immutable artifacts, and runbooks do not authorize a live release. R1, R2a, R2b, and R3 each require a fresh explicit live-mutation approval naming that stage immediately before deploy; only then run `python3 scripts/agent-preflight.py --intent release --base origin/main --authority-scope live-mutation --authority-note '<approved stage>'`. Without it, stop at artifact/runbook-ready and do not deploy, flip flags, or wait on production metrics.
- Residue/compatibility metrics have bounded tags only: generation `v2|v3|missing|unknown` and mode `support|enforce`.
- R1 can roll back to its pre-v3 backend/front pair. R2a rollback restores its safety backend/cache pair while keeping browser v2. After R2b, backend-only rollback is allowed only to a v3-capable backend; older backend requires coordinated Pages/browser rollback, and already-open v3 tabs fail closed. Runbook states explicit abort/rollback conditions.
- Existing member approval, invite, notification policy/preview/confirm/dispatch, and test-mail semantics remain unchanged under v3.
- E2E evidence must distinguish BFF rejection from backend pre-controller rejection and assert no domain side effect.
- Chromium full suite remains; Firefox desktop and WebKit mobile get focused critical-flow projects rather than tripling the full suite.
- Authenticated host performance uses production build, 4× CPU throttle, 10 Mbps/40 ms, cold route, five-run median, synthetic data.
- Lighthouse public/group checks cannot substitute for the authenticated host budget.
- Playwright traces/HAR/screenshots/perf raw output remain in ignored temporary/output paths and never contain real member data, private domains, or credentials.
- Proposed ADRs become Accepted only after code, tests, active architecture, deploy/runbooks, and browser/runtime evidence agree.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Backend support/enforce generation mode | 1 |
| BFF/dev-proxy v2/v3 pass-through boundary | 2 |
| Browser/BFF/backend matrix and non-session regression | 3 |
| Residue-zero enforcement and rollback contract | 4 |
| Authority-loss and public cache browser evidence | 5 |
| Cross-browser, accessibility, 500-member budgets | 6 |
| Active docs, release safety, ADR promotion | 7 |

## Dependency Order

`1 → 2`; after R1 support is separately approved/deployed/tested, shared-shell Task 6 builds the v3 browser candidate but does not deploy it. Server-safety Task 7 + convergence Task 1 build R2a; after separate R2a approval/deploy, C1 waits out 720 seconds and runs its cache-safety spec. B6+B7 and Task 3 can proceed against the candidate/pre-production stack. Task 5 combines C1 cache evidence with B7 authority-loss evidence. Task 4's final R2b checker gate runs only after Task 3 and Task 5 evidence exist: `A7 + C1 → separately approved R2a → 720s cache proof`; `B6 + B7 → 3`; then `3 + 5 → 4 final gate → separately approved R2b`. R2b observation gates R3 enforcement; product completion continues `6 → 7` and convergence Task 4 operator E2E.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Server generation mode | BffSecretFilter, typed configuration, application.yml/env, server security tests |
| BFF generation support | Pages BFF, Vite proxy, BFF tests/diagnostics |
| Deploy matrix | E2E rollout spec/config and non-session fixtures |
| Release stages | workflows, deploy checker, runbooks/config |
| Browser authority-loss proof | route continuity/security tests and focused E2E |
| Public cache/convergence browser proof | convergence plan owns the spec; this plan reruns it |
| Browser/a11y/perf | Playwright config/CI, performance scripts/docs |
| Governance/release | architecture/acceptance/test/perf docs, CHANGELOG, ADR files/index |

---

### Task 1: Add typed backend v2/v3 support and enforcement modes

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/HostClientContractMode.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/HostClientContractProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterUnitTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionBffSecurityTest.kt`

**Interfaces:**

```kotlin
enum class HostClientContractMode { DISABLED, V2_ONLY, SUPPORT_V2_V3, ENFORCE_V3 }
enum class ObservedHostClientGeneration { V2, V3, MISSING, UNKNOWN }
```

The new typed property has explicit precedence over the legacy `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED` boolean. Without the new property, legacy `false → DISABLED` and `true → V2_ONLY`. During one rollback-safe release this mapping remains; legacy removal is a separate follow-up.

- [ ] **Step 1: Write RED filter matrix tests.** Parameterize all four effective policies. Cover legacy mapping, secret/origin failure ordering, DISABLED compatibility, V2_ONLY exact behavior, support v2/v3 success with missing/unknown fail closed, enforce v2/missing/unknown `428`, v3 success, reads unaffected, bounded metrics, and no controller invocation on rejection.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionBffSecurityTest`

  Expected: FAIL because the filter exact-matches v2 and has only a boolean mode.

- [ ] **Step 3: Implement typed configuration and compatibility mapping.** Keep trusted BFF secret and dynamic same-origin behavior intact; emit RFC problem response with code `CLIENT_UPDATE_REQUIRED` for enforcement failure.
- [ ] **Step 4: Add bounded residue metrics.** Count only mutating host paths and the four generation categories; never tag paths/resources.
- [ ] **Step 5: Run GREEN.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionBffSecurityTest`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(auth): support host client contract v3 rollout`

---

### Task 2: Make BFF and dev proxy pass v2/v3 without downgrade

**Files:**
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/vite.config.ts`
- Create: `front/functions/api/bff/__internal/client-contract-status.ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/proxy-bff-secret.test.ts`
- Create: `front/tests/unit/cloudflare-bff-client-contract-status.test.ts`

**Interfaces:**

```ts
type SupportedHostClientContract = "v2" | "v3";
function normalizeHostClientContract(value: string | null): SupportedHostClientContract | null;
```

During support mode the BFF allowlist is `{v2,v3}` and forwards exactly the validated value. A v3 browser against a v2-only BFF is rejected by capability/preflight; it is never rewritten to v2.

`GET /api/bff/__internal/client-contract-status` is a separate public-safe capability surface with `Cache-Control: no-store`. Its exact body is `{ "schemaVersion": 1, "supportedHostClientContracts": ["v2", "v3"] }` (or the injected v2-only list in tests), and it exposes no secret presence, origin, environment, deployment, or config metadata. Do not reuse or modify the existing secret-status endpoint for browser capability. BFF has injectable `V2_ONLY|V2_V3` capability for handler integration tests but production R1/R2a/R2b uses `V2_V3`.

- [ ] **Step 1: Write RED unit matrix.** Inject V2_ONLY and V2_V3 handler capabilities. Assert v2/v3 pass-through, missing/unknown fail closed, v3 downgrade forbidden, capability response no-store/public-safe, internal/trusted headers stripped and recreated, same-origin required, unsafe method/path coverage, and non-session host endpoints included.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts tests/unit/proxy-bff-secret.test.ts tests/unit/cloudflare-bff-client-contract-status.test.ts`

  Expected: FAIL because BFF/dev proxy exact-match v2.

- [ ] **Step 3: Implement one shared normalization rule in production and Vite proxy equivalents.** Keep BFF generic; do not add session path allowlists or translate command bodies.
- [ ] **Step 4: Run GREEN and existing BFF security regression.**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts tests/unit/proxy-bff-secret.test.ts tests/unit/cloudflare-bff-client-contract-status.test.ts`

  Expected: PASS.

- [ ] **Step 5: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(bff): pass host client contracts v2 and v3`

---

### Task 3: Prove the three-axis compatibility and non-session regressions

**Files:**
- Create: `front/tests/e2e/host-client-contract-rollout.spec.ts`
- Create: `front/playwright-rollout.config.ts`
- Create: `front/tests/e2e/support/host-rollout-evidence.ts`
- Create: `front/tests/e2e/support/host-rollout-evidence.test.ts`
- Reuse: `front/tests/e2e/readmates-e2e-db.ts`
- Modify explicit generation fixtures in:
  - `front/tests/e2e/dev-login-session-flow.spec.ts`
  - `front/tests/e2e/host-feedback-notification-composer.spec.ts`
  - `front/tests/e2e/host-next-book-notification-composer.spec.ts`
  - `front/tests/e2e/manual-notifications.spec.ts`
- Add focused server integration fixtures when BFF/backend versions must be pinned independently

**Compatibility matrix:**

| Browser | BFF | Backend | Expected write result | Evidence owner |
| --- | --- | --- | --- | --- |
| v2 | V2_ONLY | V2_ONLY | legacy works; not completion evidence | BFF handler + Spring integration |
| v2 | V2_V3 | SUPPORT_V2_V3 | works and records v2 residue | real-stack Playwright + Spring metric test |
| v2 | V2_V3 | ENFORCE_V3 | reads allowed, host mutation `428` | real-stack Playwright + Spring side-effect test |
| v3 | V2_ONLY | any | BFF capability blocks write, no downgrade | BFF handler integration |
| v3 | V2_V3 | V2_ONLY | deployment forbidden before exposure | deploy-contract checker |
| v3 | V2_V3 | SUPPORT_V2_V3 or ENFORCE_V3 | session envelope and non-session semantics work | real-stack Playwright + server integration |

- [ ] **Step 1: Write RED layered matrix tests.** BFF handler integration owns V2_ONLY/V2_V3 capability rows; Spring parameterized integration owns four backend policies and controller/domain side-effect zero; Playwright owns only reachable real-stack combinations; deploy checker owns forbidden artifact/order rows. Assert problem code/layer and reads remain safe.
- [ ] **Step 2: Add non-session v3 regressions.** Cover member approval, invite, notification policy/preview/confirm/dispatch, manual resend confirmation, and test mail. Their body meaning must remain unchanged.
- [ ] **Step 3: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts tests/unit/proxy-bff-secret.test.ts tests/unit/cloudflare-bff-client-contract-status.test.ts`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionBffSecurityTest`

  Run: `corepack pnpm --dir front exec playwright test --config playwright-rollout.config.ts tests/e2e/host-client-contract-rollout.spec.ts`

  Expected: FAIL until backend/BFF support and browser v3 adoption are integrated.

- [ ] **Step 4: Implement deterministic test fixtures only.** Do not pretend one worktree runs historical BFF/backend artifacts. Use injectable handler capability, typed backend policy, reachable real-stack modes, and deploy artifact metadata. Do not add production endpoint switches solely for E2E.
- [ ] **Step 5: Run GREEN plus existing host mutation E2E and let the required CI producer emit compatibility evidence.** The test reporter writes only structured matrix/command results; the protected CI job binds schema version, git SHA, candidate ID, backend/Pages digests, workflow ref/run/job identity, and timestamps, then uploads and attests ignored `front/output/host-rollout/compatibility.manifest.json`. Do not accept a human-authored PASS field or record credentials, real actors, private hosts, deployment state in tracked docs, or raw traces.

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts tests/unit/proxy-bff-secret.test.ts tests/unit/cloudflare-bff-client-contract-status.test.ts`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionBffSecurityTest`

  Run: `corepack pnpm --dir front exec playwright test --config playwright-rollout.config.ts tests/e2e/host-client-contract-rollout.spec.ts`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-feedback-notification-composer.spec.ts tests/e2e/host-next-book-notification-composer.spec.ts tests/e2e/manual-notifications.spec.ts`

  Run in required CI only: `python3 -B scripts/verify-host-client-rollout-evidence.py --manifest front/output/host-rollout/compatibility.manifest.json --attestation <ci-download>/compatibility.intoto.jsonl --kind compatibility --schema scripts/schemas/host-client-rollout-evidence-v1.schema.json`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `test(host): prove client contract v3 compatibility`

---

### Task 4: Encode staged deploy, residue-zero enforcement, and rollback

**Execution split:** Complete Steps 1–4 first so Tasks 3 and 5 can use the schema, CI producer, verifier, and attestation path. Run Tasks 3 and 5 in the protected evidence workflow. Return to Steps 5–6 only after all three attested CI artifacts exist; Step 5 is the final R2b artifact gate.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/host-client-rollout-evidence.yml`
- Modify: `.github/workflows/sync-config.yml`
- Modify if contract changes: `.github/workflows/deploy-server.yml`
- Modify if contract changes: `.github/workflows/deploy-front.yml`
- Create: `scripts/check-host-client-rollout-contract.py`
- Create: `scripts/verify-host-client-rollout-evidence.py`
- Create: `scripts/schemas/host-client-rollout-evidence-v1.schema.json`
- Create: `scripts/tooling/gh-attestation-lock.json`
- Modify: `scripts/README.md`
- Modify: `scripts/build-public-release-candidate.sh`
- Modify: `scripts/verify-public-release-fixtures.sh`
- Modify: `docs/deploy/release-publish-runbook.md`
- Modify: `docs/deploy/cloudflare-pages.md`
- Modify: `docs/development/release-management.md`
- Modify: `docs/development/versioning.md`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**

```text
R1: backend SUPPORT_V2_V3 + Pages(BFF v2/v3, browser v2), immutable tag 1
R2a: A7+C1 safety backend + Pages(public cache/BFF policy, browser v2), immutable tag 2
Gate A: wait old 120+600 browser lifetime; origin/BFF/CDN/browser cache-safety evidence passes
R2b: backend support retained + Pages(BFF v2/v3, browser v3 + B7 purge), immutable tag 3
Gate: 24h observation with v2=0, v3>0, missing/unknown=0 and pre-production non-session family regressions
R3: backend ENFORCE_V3; BFF remains v2/v3 allowlist/pass-through
```

Every release/gate has preflight, success, abort, and rollback instructions. R1/R2a/R2b cannot share a Pages tag because Functions and browser bundle deploy together. After R2b, an old pre-v3 backend is not a write-compatible backend-only rollback: use a v3-capable backend or coordinated Pages rollback, while already-open v3 tabs fail closed.

The final R2b checker accepts no code-presence or tracked-Markdown substitute. The protected reusable evidence workflow produces three distinct ignored artifacts: R2a `cache-safety.manifest.json`, then R2b `compatibility.manifest.json` and `security.manifest.json`. It uploads and attests each with the official provenance action pinned by full commit SHA. Schema v1 requires `schemaVersion`, `evidenceKind`, `gitSha`, `candidateId`, backend/Pages SHA-256 digests, cache-safety source-set digest, producer repository/workflow-ref/run-id/run-attempt/job, exact command IDs/results, bounded matrix case IDs/results, and timestamps. Cache evidence additionally requires the R2a tag, `preChangeCachedAt`, `policyDeployedAt`, `waitCompletedAt`, and `browserProofCompletedAt`. It forbids secrets, hostnames, actor/member/resource IDs, trace paths, and arbitrary notes.

The checker interface is explicit:

```text
check-host-client-rollout-contract.py
  --cache-manifest <ci-download>/cache-safety.manifest.json
  --cache-attestation <ci-download>/cache-safety.intoto.jsonl
  --compat-manifest <ci-download>/compatibility.manifest.json
  --compat-attestation <ci-download>/compatibility.intoto.jsonl
  --security-manifest <ci-download>/security.manifest.json
  --security-attestation <ci-download>/security.intoto.jsonl
  --r2a-git-sha <protected R2a SHA>
  --r2a-backend-digest sha256:<trusted R2a backend output>
  --r2a-pages-digest sha256:<trusted R2a Pages output>
  --r2b-git-sha <protected R2b candidate SHA>
  --r2b-backend-digest sha256:<the deployed R2a backend output retained by Pages-only R2b>
  --r2b-pages-digest sha256:<trusted R2b Pages output>
  --attestation-repository <owner/repository>
```

Cryptographic verification is normative and not reimplemented in Python. `gh-attestation-lock.json` pins GitHub CLI version and per-platform release checksums. `verify-host-client-rollout-evidence.py` requires independent `--manifest` and `--attestation` inputs, never derives a bundle path from the manifest name, and invokes that verified binary as:

```text
gh attestation verify "$manifest"
  --repo <owner/repository>
  --bundle "$attestation"
  --signer-workflow <owner/repository/.github/workflows/host-client-rollout-evidence.yml>
  --source-digest <manifest gitSha>
  --source-ref <protected ref>
  --deny-self-hosted-runners
  --predicate-type https://slsa.dev/provenance/v1
  --format json
```

GitHub CLI owns certificate chain, signature, subject digest, signer identity, and transparency/timestamp verification. The Python verifier only consumes successful verified JSON and enforces schema/case/candidate policy; unavailable binary, checksum mismatch, missing trusted root/network, empty verified timestamp, or CLI verification failure is fail closed.

The checker binds cache evidence only to R2a digests and compatibility/security only to identical R2b SHA/candidate/backend/Pages digests. Because R2b is Pages-only, it requires `r2bBackendDigest == r2aBackendDigest`; both R2b producers bind to the actually deployed R2a backend digest, never a new backend candidate. Any backend change requires a separately approved live backend stage with deployment, health, and provenance evidence before Pages promotion. It also requires R2a Pages and R2b Pages digests to differ, R2a git SHA to be an ancestor-or-equal of R2b, `waitCompletedAt - max(preChangeCachedAt, policyDeployedAt) >= 720s`, browser proof after the wait, and R2b evidence after R2a proof. The C1 safety source-set digest must be identical in R2a and R2b evidence, and the deterministic cache suite reruns on the R2b candidate. It also requires A7+C1 R2a provenance, B7 R2b provenance, Task 3 compatibility cases, and Task 5 authority cases. Missing or swapped bundle, manifest/bundle subject mismatch, untrusted producer, manual manifest, schema/command/case drift, duplicate case, stale SHA, digest mismatch, invalid ancestry/time order, or redacted-to-ambiguity evidence fails closed. Convergence Task 4 platform-admin/operator E2E remains a final product-completion gate, not an R2b prerequisite.

- [ ] **Step 1: Write RED deploy/evidence-checker self-tests.** Fixtures cover missing/unknown schema, human-authored or unattested manifest, missing/swapped/mismatched manifest and bundle inputs for cache-safety/compatibility/security/accessibility kinds, pinned-gh checksum mismatch, unavailable/network/trusted-root failure, invalid DSSE/signature/transparency/subject/trust identity, wrong workflow/repository/source SHA/ref, R2a cache manifest bound to an R2b digest, unequal R2a/R2b backend digests for the Pages-only stage, equal R2a/R2b Pages digest, invalid git ancestry/time order or <720-second interval, changed cache source-set digest, different compatibility/security R2b candidate bindings, digest mismatch, missing/duplicate/unknown command or matrix case, forbidden sensitive/deployment fields in tracked docs, missing support stage, R2a/R2b same tag, R2a browser accidentally v3, missing A7/C1/B7 provenance, missing residue gate, enforcement without rollback, conflicting legacy/new config, valid staged contract, CI omission, scripts-index omission, release-candidate omission, and public-fixture-verifier omission.
- [ ] **Step 2: Run RED.**

  Run: `python3 -B scripts/check-host-client-rollout-contract.py --self-test`

  Run: `python3 -B scripts/verify-host-client-rollout-evidence.py --self-test`

  Expected: FAIL because the checker does not encode this rollout.

- [ ] **Step 3: Implement workflow/config, protected evidence producers, attestations, and checker contract.** The checker reads CI, sync-config, server deploy, Pages deploy, runbook, typed config, immutable tag provenance, script index, release-candidate builder, and fixture verifier. The protected reusable workflow first produces/attests R2a cache evidence after the real wait, then separately packages the R2b Pages candidate and produces/attests compatibility and security manifests. It takes Pages SHA-256 values from pinned upload-artifact outputs and backend digests from trusted build/deployment jobs; no manifest accepts a human digest input. R2b's producers must import the deployed R2a backend digest and prove equality rather than binding evidence to a new backend build. Lock and checksum-verify GitHub CLI, use `gh attestation verify` with explicit manifest and bundle paths as the only cryptographic trust primitive, then pass verified JSON to Python policy checks. Wire structural/self-test mode into normal CI/public candidate, but allow live-evidence mode only in the protected gate workflow with downloaded artifacts and explicit trusted-job digest inputs. Preserve immutable tag/digest promotion. Remove runbook language that freezes all old-browser writes during R1.
- [ ] **Step 4: Document exact cache, adoption, and authority gates.** R2a keeps browser v2, deploys A7+C1/public cache policy, then waits the full previous 720-second browser lifetime and captures C1 cache-safety evidence. For R2b's named 24-hour follow-up require `v2 writes == 0`, `v3 writes > 0`, `missing/unknown == 0`, BFF capability probe success, and safe pre-production regressions for every non-session operation family. Name metric query/dashboard, abort threshold, and rollback trigger; no club/resource dimensions and no production email/billable smoke without separate authority. Put a fresh explicit live-mutation checkpoint before each R1/R2a/R2b/R3 deploy. If approval is absent, keep digests only in the protected CI artifact/ledger, never tracked docs, and stop artifact/runbook-ready.
- [ ] **Step 5: Run GREEN and inspect workflow diff.**

  Run: `python3 -B scripts/check-host-client-rollout-contract.py --self-test`

  Run: `python3 -B scripts/verify-host-client-rollout-evidence.py --self-test`

  Run in the protected R2b gate: `python3 -B scripts/check-host-client-rollout-contract.py --cache-manifest <ci-download>/cache-safety.manifest.json --cache-attestation <ci-download>/cache-safety.intoto.jsonl --compat-manifest <ci-download>/compatibility.manifest.json --compat-attestation <ci-download>/compatibility.intoto.jsonl --security-manifest <ci-download>/security.manifest.json --security-attestation <ci-download>/security.intoto.jsonl --r2a-git-sha <protected-r2a-sha> --r2a-backend-digest sha256:<trusted-deployed-r2a-backend-digest> --r2a-pages-digest sha256:<trusted-r2a-pages-digest> --r2b-git-sha <protected-r2b-sha> --r2b-backend-digest sha256:<same-trusted-deployed-r2a-backend-digest> --r2b-pages-digest sha256:<trusted-r2b-pages-digest> --attestation-repository <owner/repository>`

  Run: `./scripts/verify-public-release-fixtures.sh`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `chore(deploy): stage host client v3 enforcement`

---

### Task 5: Prove authority-loss purge and cache safety in a browser

**Files:**
- Create: `front/tests/e2e/host-authority-loss.spec.ts`
- Reuse without editing: `front/tests/e2e/public-projection-cache-safety.spec.ts` owned by convergence Task 1
- Modify: `front/tests/e2e/host-session-hardening.spec.ts`
- Reuse without editing: authority-loss unit modules owned by shared-shell Task 7
- Reuse without editing: BFF/cache modules and tests owned by the convergence plan

**Interfaces:**
- Security purge codes: `HOST_AUTHORITY_REVOKED`, `MEMBERSHIP_SUSPENDED`, `CROSS_CLUB_SCOPE`.
- Recoverable preservation: `REVISION_CONFLICT`, authorized `NETWORK_RESPONSE_LOST`.
- Cache never stores origin deny, `private`, `no-store`, `Set-Cookie`, or unsafe `Vary` responses.

- [ ] **Step 1: Write browser security scenarios.** While a form/record/notification preview is open, revoke host or suspend/cross-scope it. Assert request cancel, exact-club cache/storage purge, safe `replace`, reason alert/focus, Back/reload/new-tab/offline non-resurrection, and other-club isolation.
- [ ] **Step 2: Write recoverable scenarios.** Conflict and response loss preserve local draft; response loss reconciles receipt/state before any retry.
- [ ] **Step 3: Re-run convergence Task 1's deterministic cache scenarios on the R2b candidate.** They assert origin immediate deny, old generation not re-served, general 120-second fresh/stale boundary, emergency 60-second policy, and unchanged C1 safety source-set digest. They do not assert provider failure/retry or host/operator timeline; convergence Tasks 2/4 own that final product evidence. If a cache gap appears, return it to convergence Task 1 instead of creating a second implementation here.
- [ ] **Step 4: Run RED.**

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-authority-loss.spec.ts tests/e2e/public-projection-cache-safety.spec.ts`

  Expected: FAIL on any missing purge/cache behavior.

- [ ] **Step 5: Route any discovered defect back to its owning task and rerun after that owner adds the focused unit test.** Do not edit authority purge or convergence/cache modules in this evidence task.
- [ ] **Step 6: Run GREEN browser regressions in the protected R2b producer.** The CI-only helper binds B7 provenance, authority-loss cases, the deterministic R2b cache rerun, C1 safety source-set digest, and exact commands to the same R2b SHA/backend/Pages digests as compatibility evidence. It references but does not rewrite the verified R2a cache-attestation subject digest. It writes ignored `front/output/host-rollout/security.manifest.json`, uploads and attests it, and emits no tracked deployment report, private content, or raw trace material. Provider FAILED/retry/timeline remains outside this manifest.

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-authority-loss.spec.ts tests/e2e/public-projection-cache-safety.spec.ts`

  Run in required CI only: `python3 -B scripts/verify-host-client-rollout-evidence.py --manifest front/output/host-rollout/security.manifest.json --attestation <ci-download>/security.intoto.jsonl --kind security --schema scripts/schemas/host-client-rollout-evidence-v1.schema.json`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `test(host): verify authority and public cache recovery`

---

### Task 6: Add cross-browser, accessibility, and measured 500-member gates

**Files:**
- Modify: `front/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `front/package.json`
- Reuse: `front/shared/testing/accessibility-checks.ts`
- Create: `front/tests/e2e/host-meeting-workspace-browser-smoke.spec.ts`
- Create: `front/tests/performance/host-meeting-workspace-budget.ts`
- Create: `front/tests/performance/host-meeting-workspace-budget.test.ts`
- Create: `front/tests/performance/host-meeting-workspace-performance.spec.ts`
- Create: `front/playwright-performance.config.ts`
- Create: `front/shared/observability/host-meeting-performance.ts`
- Create: `front/shared/observability/host-meeting-performance.test.ts`
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx`
- Modify: `front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `docs/development/performance-budget.md`
- Modify: `docs/development/test-guide.md`
- Create: `docs/reports/host-meeting-workspace-accessibility-evidence-template.md`

**Measured budgets:**

| Metric | Maximum |
| --- | --- |
| 500-member ledger decoded JSON | 500 KB |
| Interactive after route data | 1 s |
| Search/filter input response | 100 ms |
| Single-row save React commit | 100 ms |
| Additional JS heap entering ledger | 25 MB |

Metric definitions are normative:

1. **Decoded JSON bytes:** UTF-8 byte length from `new TextEncoder().encode(await response.clone().text())` after the browser has decoded content encoding, for all API JSON required by the cold ledger route.
2. **Interactive after route data:** `host-meeting-route-data-ready` is marked when required route data is authoritatively reconciled; `host-meeting-first-usable-control` is marked in a layout effect when the first enabled task control is committed. The delta is measured, not navigation start.
3. **Search/filter response:** mark at the trusted input event handler entry, then mark in the first `requestAnimationFrame` after the filtered row DOM has committed. The delta must include React render and paint scheduling.
4. **Single-row save commit:** mark when the authoritative mutation or response-loss reconciliation result is accepted, then mark in the affected row's layout effect only when the returned revision/state is rendered.
5. **Additional JS heap:** via Chromium CDP, force GC and record heap immediately before entering the ledger, enter/render the 500-member ledger, force GC again after quiescence, and subtract the two readings.

Each metric has five cold synthetic runs. Missing start/end marks, non-finite values, a missing raw run, or a fixture not containing exactly 500 synthetic members fails closed. The sanitized summary stores all five raw values and the median for every metric; only that summary is uploadable.

- [ ] **Step 1: Write RED budget-model and mark-contract tests.** Validate decoded UTF-8 byte accounting, the exact five mark/measurement contracts above, forced-GC heap delta, exactly five raw runs, median, fail thresholds, missing/non-finite mark failure, 500-member fixture identity, and public-safe report format.
- [ ] **Step 2: Add focused browser projects and required CI jobs.** Keep full Chromium. `firefox-host` and `webkit-mobile-host` set project-level `testMatch` to the new smoke spec only. CI installs those browsers, runs focused cross-browser and production performance as required jobs, and uploads only the sanitized JSON summary/evidence document, not traces/HAR/private fixtures.
- [ ] **Step 3: Add UI matrix and accessibility checks.** Cover 320/390/768/1024/1440, 200% zoom, long Korean/English, 0/1/50/500, keyboard-only flow, focus restore, reduced motion, mobile keyboard/safe area, and existing automated semantic checks. Compute contrast from rendered foreground/background styles in component fixtures or record it in the manual evidence; do not claim `accessibility-checks.ts` is a contrast engine.
- [ ] **Step 4: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run tests/performance/host-meeting-workspace-budget.test.ts shared/observability/host-meeting-performance.test.ts`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-meeting-workspace-browser-smoke.spec.ts --project=chromium --project=firefox-host --project=webkit-mobile-host`

  Expected: FAIL until projects/harness and complete UI behavior exist.

- [ ] **Step 5: Implement production-build performance harness and exact application marks.** Run `pnpm build` then `pnpm preview`; Playwright route interception supplies synthetic auth/BFF/API responses. Chromium CDP applies 4× CPU, 10 Mbps/40 ms and performs the defined forced-GC readings. Instrument only the exact route, ledger, query reconciliation, and shared observability files listed above. Run five cold synthetic routes; write all raw values plus medians, and fail closed on any missing marker/run. Reduce row/query composition first; introduce virtualization/backend pagination only if measured budgets still fail and record that as a new ADR decision.
- [ ] **Step 6: Add manual screen-reader evidence through the protected artifact workflow.** The tracked Markdown is a value-free public template only. VoiceOver+Safari on macOS covers the full lifecycle and NVDA+Chrome on a Windows executor covers navigation/form/conflict, or vice versa. Reviewers submit date, OS, browser, reader version, synthetic scenario, flow, result, issue reference, and reviewer identity to the protected workflow; CI binds the candidate/digests and attests ignored `front/output/host-rollout/accessibility.manifest.json`. Its independent `accessibility.intoto.jsonl` bundle is subject to the same missing/swapped/mismatched bundle fixtures and explicit-path verification as every other evidence kind. Do not commit build tags, deployment state, reviewer account data, or completed evidence. If either environment or attested manifest/bundle is unavailable, product completion remains blocked rather than marked passed.
- [ ] **Step 7: Run GREEN.**

  Run: `corepack pnpm --dir front exec playwright install --with-deps chromium firefox webkit`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-meeting-workspace-browser-smoke.spec.ts --project=chromium --project=firefox-host --project=webkit-mobile-host`

  Run: `corepack pnpm --dir front performance:budget`

  Run: `corepack pnpm --dir front test:host-workspace-performance`

  Run in protected evidence CI: `python3 -B scripts/verify-host-client-rollout-evidence.py --manifest front/output/host-rollout/accessibility.manifest.json --attestation <ci-download>/accessibility.intoto.jsonl --kind accessibility --schema scripts/schemas/host-client-rollout-evidence-v1.schema.json`

  Expected: PASS with all measured budgets below or equal to thresholds.

- [ ] **Step 8: Check and commit.**

  Run: `git diff --check`

  Commit: `test(front): gate host workspace product quality`

---

### Task 7: Close active documentation, public safety, and ADR status

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/acceptance-matrix.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/development/performance-budget.md`
- Modify: `docs/development/technical-decisions.md`
- Modify: `docs/development/adr/README.md`
- Modify implemented Proposed ADR files among 0018–0038
- Modify: `docs/deploy/release-publish-runbook.md`
- Modify: `CHANGELOG.md`
- Verify: `scripts/build-public-release-candidate.sh`
- Verify: `scripts/public-release-check.sh`
- Verify: `scripts/verify-public-release-fixtures.sh`
- Verify: `scripts/check-flyway-migration-immutability.py`
- Modify: `scripts/check-host-client-rollout-contract.py`

**Interfaces:**
- Every dated plan retains a non-`none` `ADR impact:` line and exact ADR references.
- ADR status is `Accepted` only for decisions proven by current code, tests, active architecture, runbook, and required runtime evidence.
- Active architecture replaces v2-only and old host-shell descriptions; historical plans/specs remain historical.

- [ ] **Step 1: Write RED guidance/rollout checks before docs updates.** Extend checker fixtures if current checks cannot detect v2-only active docs, R1/R2a/R2b same-tag error, Pages/server ordering, missing attested evidence/adoption gate, Proposed/Accepted index drift, or missing evidence contract.
- [ ] **Step 2: Run RED.**

  Run: `python3 scripts/check-agent-guidance.py --self-test`

  Run: `python3 -B scripts/check-host-client-rollout-contract.py --self-test`

  Expected: newly added regression fixture fails before checker/update.

- [ ] **Step 3: Update active architecture, acceptance rows, test/performance instructions, runbook, and CHANGELOG from shipped behavior only.** Include rollback, residue gate, 120/60-second boundary, remote-copy limit, manual a11y evidence, and public artifact location.
- [ ] **Step 4: Review every Proposed ADR individually.** Promote only those whose implementation and evidence are complete. Update ADR index and technical-decision snapshot in the same commit. Leave incomplete ADRs Proposed with exact missing evidence.
- [ ] **Step 5: Run documentation and guidance GREEN.**

  Run: `python3 scripts/check-agent-guidance.py --self-test`

  Run: `python3 scripts/check-agent-guidance.py`

  Run: `python3 -B scripts/check-host-client-rollout-contract.py --self-test`

  Run: `python3 -B scripts/check-host-client-rollout-contract.py`

  Run: `git diff --check -- docs .github scripts CHANGELOG.md`

  Expected: PASS.

- [ ] **Step 6: Build and scan the public release candidate.**

  Run: `./scripts/build-public-release-candidate.sh`

  Run: `./scripts/public-release-check.sh .tmp/public-release-candidate`

  Run: `./scripts/verify-public-release-fixtures.sh`

  Expected: PASS with no secrets, real member data, private domains, token-shaped samples, local absolute paths, traces/HAR/screenshots, or provider error bodies.

- [ ] **Step 7: Run final complete gates and fresh review.**

  Run: `corepack pnpm --dir front lint`

  Run: `corepack pnpm --dir front test`

  Run: `corepack pnpm --dir front build`

  Run: `corepack pnpm --dir front test:e2e`

  Run: `corepack pnpm --dir front test:ct`

  Run: `./scripts/server-ci-check.sh`

  Run: `./server/gradlew -p server integrationTest`

  Run: `python3 -B scripts/check-flyway-migration-immutability.py --self-test`

  Run: `python3 -B scripts/check-flyway-migration-immutability.py --base-ref origin/main`

  Run: `python3 scripts/agent-preflight.py --intent release --base origin/main`

  Ask a fresh reviewer to compare spec §28, all plans, `origin/main..HEAD`, runtime evidence, and ADR status. Resolve every P0/P1 before proceeding.

- [ ] **Step 8: Check and commit.**

  Run: `git diff --check`

  Commit: `docs(readmates): close host meeting workspace rollout`

## Workstream Completion Gate

- [ ] Mixed browser/BFF/backend matrix passes in every row and blocked rows have zero domain side effect.
- [ ] Non-session host mutations retain their pre-v3 semantics.
- [ ] Deployment support → browser → residue zero → enforcement order is machine-checked and rollback documented.
- [ ] Authority-loss purge and 120/60-second browser cache boundaries pass.
- [ ] Chromium/Firefox/WebKit focused evidence, required viewport/zoom, keyboard, reduced motion, and screen-reader ledger exist.
- [ ] Accessibility evidence is an attested ignored CI artifact bound to the shipped candidate; tracked docs contain only the value-free template.
- [ ] All five measured 500-member budgets pass from production build.
- [ ] Public release candidate and fixture scans pass.
- [ ] ADR/index/active architecture match shipped truth; no Proposed decision is promoted on documentation intent alone.
