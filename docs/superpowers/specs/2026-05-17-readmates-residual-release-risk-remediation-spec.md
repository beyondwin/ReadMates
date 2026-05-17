# ReadMates Residual Release Risk Remediation Spec

## Scope

검토 기준은 현재 `main` branch의 `origin/main..HEAD` 전체 diff입니다. 직전 release-risk remediation은 Flyway 중복 버전, OpenAI model ID, Redis transcript 문서 불일치, public release scanner 표면을 닫았지만, 후속 release readiness review에서 backend CI gate와 AI generation / platform admin runtime path의 잔여 리스크가 확인되었습니다.

이 문서는 남은 release blocker와 high-risk 항목을 닫기 위한 제품/기술 요구사항을 고정합니다. 실행 순서와 파일별 작업은 `docs/superpowers/plans/2026-05-17-readmates-residual-release-risk-remediation-implementation-plan.md`를 따릅니다.

## Source Documents

- Release readiness checklist: `docs/development/release-readiness-review.md`
- Architecture source of truth: `docs/development/architecture.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`
- Current release-risk remediation spec: `docs/superpowers/specs/2026-05-17-readmates-release-risk-remediation-spec.md`
- Current release-risk remediation plan: `docs/superpowers/plans/2026-05-17-readmates-release-risk-remediation-implementation-plan.md`
- AI generation runbook: `docs/operations/runbooks/ai-session-generation.md`

## Release Invariants

1. CI backend job must pass the same local gate: `./server/gradlew -p server check`.
2. Expected application denials must map to typed RFC 7807 responses, not `500 UNKNOWN`.
3. AI generation must validate user-edited commit overrides against the original session metadata, not against author names supplied by the edited snapshot.
4. Platform admin onboarding must not send a host invitation email until the database transaction that creates the club, host invitation, and optional domain has committed.
5. AI generation logs, audit rows, metrics, Kafka messages, and public error responses must not include transcript bodies or member names from invalid import issues.
6. Redis AI job load must never rehydrate a job with an empty transcript merely because the transcript key expired before the hash/result keys.
7. Frontend validation should be quiet enough that warnings do not hide actual regressions.

## Findings To Close

### P0: Backend `check` fails on detekt

Evidence:

- Local release readiness run: `./server/gradlew -p server check` failed.
- `server/build/reports/detekt/detekt.txt` reported 49 active findings.
- CI backend job runs `./gradlew check` from `.github/workflows/ci.yml`, so the same failure blocks PR/release readiness.

Representative active findings:

- `NotificationDeliveryPlanningOperations.kt:92` — `LongMethod` and `CyclomaticComplexMethod`.
- `NotificationEmailTemplates.kt:114` — `LongMethod`.
- `AiGenerationWorker.kt:59` — `TooManyFunctions`.
- `AiGenerationOrchestrator.kt:54` — `LongParameterList`.
- `AiGenerationJobQueue.kt:24` — `LongParameterList`.
- `SessionImportService.kt:32` — `TooManyFunctions`.
- `AiGenerationOrchestrator.kt:288` and `:329` — `UseCheckOrError`, caused by bare `IllegalStateException`.
- `AiGenerationRegenerationService.kt:406` — `UseCheckOrError`, caused by bare `IllegalStateException`.
- `AiGenerationCommitService.kt:186` — `UseCheckOrError`, caused by bare `IllegalStateException`.

Decision:

- Do not loosen `server/config/detekt/detekt.yml`.
- Do not lower CI coverage or split `check` to hide detekt.
- Prefer small refactors or typed suppressions where the rule conflicts with Spring dependency injection or test fixture builders.
- Test-only suppressions are acceptable for fixture builders when they are local, explicit, and narrower than updating the global baseline.
- Updating `server/config/detekt/baseline.xml` is not the default path. Use it only if a finding is proven to predate this branch and cannot be addressed safely in the touched slice.

Acceptance criteria:

- `./server/gradlew -p server check` exits `BUILD SUCCESSFUL`.
- `server/build/reports/detekt/detekt.txt` has no active findings from the current branch.
- No detekt config weakening was used to make the gate green.

### P0: AI generation expected failures map to `500 UNKNOWN`

Evidence:

- `AiGenerationOrchestrator.failStart(...)` writes a FAILED audit row and throws `IllegalStateException`.
- `AiGenerationRegenerationService.failRegen(...)` throws `IllegalStateException` for cap denials, rate limits, disabled AI, expired jobs, and queue failures.
- `AiGenerationCommitService.failCommit(...)` throws `IllegalStateException` after validation failures.
- `AiGenerationErrorHandler.handleUnknown(...)` maps generic `RuntimeException` to `500 UNKNOWN`.
- `AiGenerationException` KDoc states that bare `IllegalStateException` was the previous problem and should be replaced by the sealed hierarchy.

Impact:

- A host can see `500 UNKNOWN` for normal product states such as disabled AI, model not allowlisted, daily cap exceeded, monthly cap exceeded, or invalid commit override.
- Frontend and operators lose stable `code` values for actionable states.
- The public API contract in `docs/development/architecture.md` is weaker than the shipped behavior.

Decision:

- Expected AI generation service failures must throw `AiGenerationException.Coded(code, message)` after writing the audit row.
- Provider failures should continue to use `LlmGenerationException` so provider-specific status mapping remains centralized.
- Job not found / job session mismatch / illegal generation state should continue to use the typed exception classes already in `AiGenerationException`.
- The catch-all handler remains as a scrubbed safety net only.

Acceptance criteria:

- Service unit tests assert `AiGenerationException.Coded` for disabled model, cost guard deny, regenerate cap deny, and commit validation failure.
- API integration tests assert problem+json status and `code` for at least one start denial and one commit validation denial.
- No `throw IllegalStateException("$code: $message")` remains in `server/src/main/kotlin/com/readmates/aigen`.

### P1: Commit override validation trusts client-supplied author names

Evidence:

- `AiGenerationCommitService.commit(...)` builds validation `SessionMeta` from the submitted `snapshot`.
- `buildSessionMeta(record, snapshot)` sets `expectedAuthorNames` from `snapshot.highlights + snapshot.oneLineReviews`.
- `DefaultSessionImportV1Validator` validates authors only against `SessionMeta.expectedAuthorNames`.
- `SessionImportService.commitValidated(...)` still validates against real session attendees and can throw `InvalidSessionImportException`.

Impact:

- A user-edited override can add an arbitrary author name and pass the AI commit service validator.
- The downstream commit path can reject the command later, currently through the generic `500 UNKNOWN` path.
- Invalid issue details can include member names, which must not be logged by AI generation catch-all handling.

Decision:

- `AiGenerationCommitService` must validate both generated result and override result against `record.toSessionMeta()`.
- `JobRecord.toSessionMeta()` KDoc must be updated so commit is listed as a caller, not a special exception.
- `InvalidSessionImportException` escaping from `commitDelegate.commitValidated(...)` must be caught at the AI boundary and translated to `AiGenerationException.Coded(ErrorCode.SCHEMA_INVALID, "Generated session import failed validation")` or a more specific safe AI error code when available.
- Logs may include issue count and stable issue codes, but must not log issue messages that include member names.

Acceptance criteria:

- A commit override containing an author outside `record.sessionMeta.expectedAuthorNames` fails before `commitDelegate` is called.
- The failure writes a FAILED `COMMIT` audit row with `AUTHOR_NAME_MISMATCH`.
- API response is `422` with a stable AI generation `code`.
- No AI generation logger writes raw `InvalidSessionImportException.issues` messages.

Open follow-up (not blocking this remediation): the validator's `AUTHOR_NAME_MISMATCH` message embeds the offender list (e.g. "Unknown authorName(s) not in expectedAuthorNames: [Injected Person]"). `AiGenerationCommitService.failCommit(...)` currently writes that raw message to the audit row's `errorMessage`. Since the offenders originate in attacker-controlled override snapshots, symmetry with the log-scrub rule suggests recording only the code and offender count in the audit row. Track separately if it ships outside this scope.

### P1: Platform admin onboarding can email before rollback

Evidence:

- `PlatformAdminOnboardingService.commit(...)` is `@Transactional`.
- New-host path creates the invitation, sends the email immediately, then returns to commit optional domain / load club work.
- `JdbcPlatformAdminAdapter.createClubDomain(...)` can return `DuplicateHostname` from the database unique key after preview and conflict pre-checks.

Impact:

- A race on domain hostname, or any later database failure, can roll back the invitation while a host has already received an accept URL.
- Operators can create support tickets for invalid invite links that never existed in committed state.

Decision:

- The database mutation slice must commit before `SendPlatformAdminHostInvitationEmailPort.send(...)` is called.
- Keep the existing API response shape: `emailDelivery.status` remains `SENT`, `FAILED`, or `SKIPPED`.
- Existing-user assignment remains email-free and returns `SKIPPED`.
- The fix should not introduce browser-visible secrets or real deployment details.

Acceptance criteria:

- A failing optional domain creation path does not call the mail port.
- A successful new-host onboarding sends exactly one email after the transaction returns.
- The response still contains `hostOnboarding.acceptUrl`, `invitationId`, and `emailDelivery.status`.
- Existing platform admin controller tests continue to pass.

### P1: AI error logging can include private member names

Evidence:

- `AiGenerationErrorHandler.handleUnknown(...)` logs `InvalidSessionImportException.issues`.
- `SessionImportService` issue messages can include author names, for example duplicate one-line author or missing author names.

Impact:

- Invalid AI-generated or user-edited content can put member names into server logs.
- This violates the public-repo and AI generation PII posture, even if HTTP response bodies are scrubbed.

Decision:

- AI generation error logging must log only sanitized metadata for `InvalidSessionImportException`: issue count and issue codes.
- AI generation service boundary should translate expected downstream import validation failures before they hit `handleUnknown(...)`.

Acceptance criteria:

- `handleUnknown(...)` no longer logs `error.issues` directly.
- A unit test or log-capture test proves issue messages are not emitted by the AI generation handler.

### P2: Redis job store can load a job with missing transcript as empty text

Evidence:

- `RedisAiGenerationJobStore.load(...)` reads the transcript key and uses `?: ""`.
- `saveResult(...)`, `patchItem(...)`, and `incrementLlmCallCount(...)` refresh hash/result TTLs but do not refresh the transcript TTL.
- Regeneration builds provider input from `record.transcript`.

Impact:

- If the transcript key expires while hash/result survives, regeneration can call a provider with an empty transcript.
- The resulting snapshot can pass some validators while being semantically detached from the source meeting.

Decision:

- Missing transcript key means the AI job is expired/incomplete; `load(jobId)` should return `null` and remove stale job keys.
- Result patch operations must refresh the transcript TTL together with the hash/result keys when the transcript key still exists.
- The store must never synthesize an empty transcript.

Acceptance criteria:

- Redis job-store tests cover missing transcript key and TTL refresh on `saveResult(...)` / `patchItem(...)`.
- `load(...)` returns `null` for a hash without transcript.
- API callers observe the existing `JOB_EXPIRED` / 410 behavior through `JobNotFoundException`.

### P2: Frontend validation has avoidable warning noise

Evidence:

- `pnpm --dir front lint` exits 0 but reports an unused eslint-disable warning from generated `front/coverage/lcov-report/block-navigation.js` when coverage artifacts are present.
- `pnpm --dir front test` passes but emits React `act(...)` warnings from `features/host/aigen/hooks/useAiGenerationJob.test.tsx`.

Impact:

- Local validation output is noisy, making real regressions easier to miss.
- CI may avoid the coverage warning by order of operations, but local release checks do not.

Decision:

- Exclude `coverage/**` in `front/eslint.config.mjs`.
- Wrap polling timer advancement in React `act(...)` in the hook tests.

Acceptance criteria:

- `pnpm --dir front lint` produces no generated coverage warning when `front/coverage` exists.
- `pnpm --dir front test -- features/host/aigen/hooks/useAiGenerationJob.test.tsx` passes without React `act(...)` warnings.

### P3: Live provider smoke remains unverified without keys

Evidence:

- Local validation skipped live Claude, OpenAI, and Gemini SDK smoke because provider API keys were not present.
- Adapter unit tests and API integration tests use fakes/stubs.

Impact:

- SDK request shape, provider-side schema enforcement, and real model availability remain operational risk until a keyed environment runs the smoke scripts.

Decision:

- Do not hardcode keys, example secrets, or token-shaped values in docs.
- Keep live smoke out of mandatory local checks unless keys are present.
- Release notes must list live provider smoke as skipped when keys are absent.

Acceptance criteria:

- `CHANGELOG.md` or the release validation note reports live smoke as skipped with the exact missing environment variables.
- A keyed environment can run `scripts/aigen-smoke-claude.sh`, `scripts/aigen-smoke-openai.sh`, and `scripts/aigen-smoke-gemini.sh`.

## Non-Goals

- Do not redesign the AI generation workflow or replace Redis job storage in this remediation.
- Do not add a frontend model-catalog endpoint.
- Do not add real member data, private domains, deployment state, local absolute paths, cloud resource identifiers, secrets, or token-shaped examples.
- Do not run live provider smoke tests without keys supplied by the execution environment.
- Do not ship a detekt baseline refresh that hides branch-local findings without first documenting why each remaining finding is outside this branch's ownership.

## Verification Matrix

Run these before claiming the remediation is complete:

```bash
git status --short --branch
git diff --check origin/main..HEAD
bash scripts/aigen-pii-check.sh
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
./server/gradlew -p server architectureTest
./server/gradlew -p server check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm design:check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Live SDK smoke is a conditional gate:

```bash
READMATES_AIGEN_ANTHROPIC_API_KEY=... scripts/aigen-smoke-claude.sh
READMATES_AIGEN_OPENAI_API_KEY=... scripts/aigen-smoke-openai.sh
READMATES_AIGEN_GEMINI_API_KEY=... scripts/aigen-smoke-gemini.sh
```

If keys are absent, report those three commands as skipped rather than passed.
