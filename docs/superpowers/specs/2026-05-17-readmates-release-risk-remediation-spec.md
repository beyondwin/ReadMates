# ReadMates Release Risk Remediation Spec

## Scope

검토 기준은 현재 `main` branch의 `origin/main..HEAD` 전체 diff입니다. 직전 릴리스 이후 AI 세션 생성, 플랫폼 관리자 온보딩, 디자인 시스템, 운영 문서, CI/검증 표면이 함께 커졌고, 잔여 리스크 검토에서 release blocker와 high-risk 정합성 문제가 확인되었습니다.

이 문서는 수정 방향과 수용 기준을 고정합니다. 실제 작업 절차는 `docs/superpowers/plans/2026-05-17-readmates-release-risk-remediation-implementation-plan.md`를 따릅니다.

## Source Documents

- Release readiness checklist: `docs/development/release-readiness-review.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- AI generation runbook: `docs/operations/runbooks/ai-session-generation.md`
- Current AI generation design record: `docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md`

External OpenAI model ID source was checked against official OpenAI developer documentation on 2026-05-17. The API model aliases for the GPT-4.1 family are `gpt-4.1` and `gpt-4.1-mini`, not `openai-gpt-4-1` or `gpt-4-1`.

## Findings To Close

### Blocker: duplicate Flyway version `V30`

Evidence:

- `server/src/main/resources/db/mysql/migration/V30__create_ai_generation_audit_log.sql`
- `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`
- `server/src/main/resources/db/mysql/migration/V31__create_ai_generation_club_defaults.sql`

Observed failure:

```text
Found more than one migration with version 30
```

Impact:

- Spring application context cannot start when Flyway scans the production MySQL migration path.
- `MySqlFlywayMigrationTest` fails before schema assertions.
- Frontend E2E cannot start the backend web server.

Decision:

- Keep AI generation audit/default migrations as `V30` and `V31`.
- Rename platform admin onboarding migration to `V32__platform_admin_onboarding.sql`.
- Do not rewrite historical planning records just to rename a past task reference. Current code, migration files, architecture docs, CHANGELOG, and release notes must describe the actual state after the fix.

Acceptance criteria:

- No duplicate Flyway version exists in `server/src/main/resources/db/mysql/migration`.
- `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest` passes.
- `pnpm --dir front test:e2e` is no longer blocked by backend startup.

### High: OpenAI model IDs are inconsistent and not API-shaped

Evidence:

- `server/src/main/resources/application.yml` uses `openai-gpt-4-1` and `openai-gpt-4-1-mini`.
- `front/features/host/aigen/ui/aigen-model-options.ts` exposes `openai-gpt-4-1`.
- `YamlModelCatalog.providerFromName` maps `gpt-*` and `o*` to `OPENAI`, but not `openai-*`.
- `AiGenerateApiIntegrationTest` already works around the mismatch with `gpt-4-1` test-only pricing.

Impact:

- Enabling `OPENAI` in `readmates.aigen.enabled-providers` does not make the UI/default OpenAI model usable.
- A host or club default using the UI value can resolve to `AI_DISABLED`.
- Live OpenAI smoke is likely to fail even when a valid API key is present.

Decision:

- Use canonical OpenAI API model IDs everywhere: `gpt-4.1` and `gpt-4.1-mini`.
- Keep provider derivation prefix-based (`gpt-*` and `o*`) because `gpt-4.1` is covered by `gpt-`.
- Do not add `openai-*` as a second public ID shape. The UI value, server pricing key, tests, smoke scripts, and docs should all send the same model ID that the provider API accepts.

Acceptance criteria:

- No production source, active test, smoke script, or operator-facing doc still uses `openai-gpt-4-1`, `openai-gpt-4-1-mini`, `gpt-4-1`, or `gpt-4-1-mini` for OpenAI GPT-4.1 model IDs.
- `AiGenerationPropertiesTest` asserts `gpt-4.1` and `gpt-4.1-mini`.
- `AiGenerateApiIntegrationTest` provider matrix uses `gpt-4.1`.
- Frontend model dropdown and club default tests use `gpt-4.1`.
- Live OpenAI SDK smoke remains skipped unless `READMATES_AIGEN_OPENAI_API_KEY` is present, but the configured model ID is no longer the blocker.

### High: transcript storage policy and operator docs disagree

Evidence:

- `RedisAiGenerationJobStore` writes raw transcript text to `aigen:job:<jobId>:transcript` with the job TTL.
- `AiGenerationJobStore` and `AiGenerationJobQueue` KDocs describe this Redis handoff as intentional.
- `RedisAiGenerationJobStoreTest` and `AiGenerateApiIntegrationTest` assert the transcript key exists before commit and is deleted after commit.
- `docs/operations/runbooks/ai-session-generation.md` says audit log and Redis do not store transcript body.
- `scripts/aigen-pii-check.sh` says "we never persist raw transcripts" even though transient Redis persistence is part of the design.

Impact:

- Operator guidance is materially false.
- The PII scanner output can create false confidence because it passes while the code intentionally persists raw transcript text in Redis.
- Incident handling may accidentally treat Redis as safe metadata-only storage.

Decision:

- Keep the transient Redis transcript key. The async worker and regeneration path currently need Redis to rehydrate the transcript without putting it on Kafka.
- Make the security posture explicit: MySQL audit log, Kafka messages, metrics, and operator tickets must not contain transcript bodies; Redis contains a raw transcript body only under `aigen:job:<jobId>:transcript`, protected by TTL and deleted on commit/cancel.
- Update `scripts/aigen-pii-check.sh` so its comments, failure labels, and pass summary match the actual invariants. Add a Redis scope check that fails if the transcript key is used outside the known job-store boundary.

Acceptance criteria:

- Runbook tells operators not to copy Redis transcript bodies into tickets or chat.
- Architecture docs list `aigen:job:<jobId>:transcript` as a raw transcript key with TTL.
- PII script passes and reports the corrected invariant count.
- Existing Redis integration tests still prove TTL and delete behavior.

### Medium: release notes and validation record are stale

Evidence:

- `CHANGELOG.md` says full verification is green while current branch has a Flyway startup failure and E2E backend startup failure.
- `CHANGELOG.md` says integration baseline failures predate Phase 8, but the duplicate `V30` failure is branch-local and release-blocking.
- AI runbook kill switch section still describes the old 404 behavior even though `AiGenerationKillSwitchFilter` now returns 503 `AI_DISABLED`.

Impact:

- A releaser could ship based on a false validation record.
- Operators could diagnose the kill switch path incorrectly.

Decision:

- Update `CHANGELOG.md` only after rerunning the actual post-fix verification commands.
- Replace stale verification claims with exact commands and outcomes.
- Update runbook kill-switch behavior to 503 problem+json.

Acceptance criteria:

- `CHANGELOG.md` no longer claims failed or skipped checks passed.
- Remaining live SDK smoke gap is explicitly listed as skipped because provider API keys are absent.
- Runbook matches current kill switch behavior.

### Low: whitespace diff hygiene

Evidence:

- `git diff --check origin/main..HEAD` reported trailing whitespace in `docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md`.
- It also reported a blank line at EOF in `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`.

Decision:

- Remove the whitespace issues in the same remediation branch.

Acceptance criteria:

- `git diff --check origin/main..HEAD` passes.

## Non-Goals

- Do not implement a catalog endpoint for frontend model options in this remediation.
- Do not replace Redis transcript storage with object storage or encryption in this remediation.
- Do not rewrite old historical planning documents unless they are actively used as current release-facing documentation.
- Do not run live provider smoke tests without real provider API keys.

## Verification Matrix

Run these after implementation:

```bash
git diff --check origin/main..HEAD
bash scripts/aigen-pii-check.sh
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
./server/gradlew -p server architectureTest
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm design:check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Live SDK smoke remains a reported validation gap unless these are present in the execution environment:

```bash
READMATES_AIGEN_ANTHROPIC_API_KEY
READMATES_AIGEN_OPENAI_API_KEY
READMATES_AIGEN_GEMINI_API_KEY
```
