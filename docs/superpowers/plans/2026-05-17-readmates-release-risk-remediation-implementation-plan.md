# ReadMates Release Risk Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the release-blocking Flyway failure and the remaining AI generation release risks found in the `origin/main..HEAD` readiness review.

**Architecture:** Keep production migrations in the MySQL Flyway path, keep AI generation provider resolution inside the existing `ModelCatalog`/service boundary, and keep transcript bodies out of Kafka, MySQL audit rows, metrics, and operator tickets while documenting the intentional short-lived Redis transcript key. Treat CHANGELOG and runbooks as release-facing source of truth, not historical planning notes.

**Tech Stack:** Kotlin/Spring Boot, Flyway/MySQL, Redis, Kafka, React/Vite, TypeScript/Vitest, Playwright, Bash, public-release scanner scripts.

---

## Source Documents

- Risk spec: `docs/superpowers/specs/2026-05-17-readmates-release-risk-remediation-spec.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- AI generation runbook: `docs/operations/runbooks/ai-session-generation.md`

## File Map

### Flyway

- Rename: `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`
  - To: `server/src/main/resources/db/mysql/migration/V32__platform_admin_onboarding.sql`
- Keep: `server/src/main/resources/db/mysql/migration/V30__create_ai_generation_audit_log.sql`
- Keep: `server/src/main/resources/db/mysql/migration/V31__create_ai_generation_club_defaults.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

### OpenAI Model IDs

- Modify: `server/src/main/resources/application.yml`
- Modify: `front/features/host/aigen/ui/aigen-model-options.ts`
- Modify: `scripts/aigen-smoke-openai.sh`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `CHANGELOG.md`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCatalogTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentGeneratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentRegeneratorTest.kt`
- Modify: frontend tests containing the old model value:
  - `front/features/host/aigen/api/aigen-api.test.ts`
  - `front/features/host/aigen/ui/TranscriptUploadForm.test.tsx`
  - `front/features/host/aigen/ui/RegenerateModal.test.tsx`
  - `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`

### Transcript Storage Policy

- Modify: `scripts/aigen-pii-check.sh`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`

### Release Hygiene

- Modify: `CHANGELOG.md`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`

---

## Task 1: Resolve Duplicate Flyway Version

**Files:**
- Rename: `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [ ] **Step 1: Confirm the duplicate version guard is red**

Run:

```bash
ls server/src/main/resources/db/mysql/migration \
  | sed -E 's/__(.*)//' \
  | sort \
  | uniq -d
```

Expected before the fix:

```text
V30
```

- [ ] **Step 2: Rename the platform admin migration to the next free version**

Run:

```bash
git mv \
  server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql \
  server/src/main/resources/db/mysql/migration/V32__platform_admin_onboarding.sql
```

Rationale: `V30__create_ai_generation_audit_log.sql` and `V31__create_ai_generation_club_defaults.sql` are already described together as the AI generation schema pair. `V32__platform_admin_onboarding.sql` is independent of those tables and can run after them.

- [ ] **Step 3: Verify the migration versions are unique**

Run:

```bash
ls server/src/main/resources/db/mysql/migration \
  | sed -E 's/__(.*)//' \
  | sort \
  | uniq -d
```

Expected after the fix: no output.

Run:

```bash
ls -1 server/src/main/resources/db/mysql/migration | sort -V | tail -5
```

Expected suffix:

```text
V28__manual_notification_dispatch_hardening.sql
V29__correlation_request_id_columns.sql
V30__create_ai_generation_audit_log.sql
V31__create_ai_generation_club_defaults.sql
V32__platform_admin_onboarding.sql
```

- [ ] **Step 4: Run the targeted Flyway migration test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit this slice**

```bash
git add server/src/main/resources/db/mysql/migration
git commit -m "fix: make MySQL migration versions unique"
```

---

## Task 2: Normalize OpenAI Model IDs

**Files:**
- Modify: `server/src/main/resources/application.yml`
- Modify: `front/features/host/aigen/ui/aigen-model-options.ts`
- Modify: `scripts/aigen-smoke-openai.sh`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `CHANGELOG.md`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCatalogTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentGeneratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentRegeneratorTest.kt`
- Modify: frontend tests that assert `openai-gpt-4-1`

- [ ] **Step 1: Change the property-binding test first**

In `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`, replace the OpenAI assertions with:

```kotlin
val openai41 = pricing["gpt-4.1"]
assertNotNull(openai41, "gpt-4.1 pricing must be present in application.yml")
assertEquals(0, BigDecimal("2.00").compareTo(openai41!!.inputPerMTokenUsd))
assertEquals(0, BigDecimal("0.50").compareTo(openai41.cachedInputPerMTokenUsd))
assertEquals(0, BigDecimal("8.00").compareTo(openai41.outputPerMTokenUsd))

val openai41Mini = pricing["gpt-4.1-mini"]
assertNotNull(openai41Mini, "gpt-4.1-mini pricing must be present in application.yml")
assertEquals(0, BigDecimal("0.40").compareTo(openai41Mini!!.inputPerMTokenUsd))
assertEquals(0, BigDecimal("0.10").compareTo(openai41Mini.cachedInputPerMTokenUsd))
assertEquals(0, BigDecimal("1.60").compareTo(openai41Mini.outputPerMTokenUsd))
```

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.aigen.config.AiGenerationPropertiesTest
```

Expected before the production config change: failure because `application.yml` still contains `openai-gpt-4-1`.

- [ ] **Step 2: Pin dotted GPT IDs in the catalog test**

In `YamlModelCatalogTest`, update the OpenAI case in `enabledProviders case-insensitive matches Provider name`:

```kotlin
pricing = mapOf(
    "gpt-4.1" to pricing("2", "0.50", "8"),
    "o1" to pricing("15", "0", "60"),
),
```

And update the assertions:

```kotlin
assertTrue(allow.any { it == ModelId(Provider.OPENAI, "gpt-4.1") })
assertTrue(allow.any { it == ModelId(Provider.OPENAI, "o1") })
```

This test should already pass with the current `gpt-*` prefix logic. It documents that dotted OpenAI aliases are supported without an `openai-*` prefix.

- [ ] **Step 3: Change the production pricing keys**

In `server/src/main/resources/application.yml`, replace the OpenAI pricing block with:

```yaml
      # OpenAI public API pricing (gpt-4.1 family, per-million-token, USD).
      # Source: OpenAI model docs for gpt-4.1 and gpt-4.1-mini (verified 2026-05-17).
      gpt-4.1:
        input-per-m-token-usd: 2.00
        cached-input-per-m-token-usd: 0.50
        output-per-m-token-usd: 8.00
      gpt-4.1-mini:
        input-per-m-token-usd: 0.40
        cached-input-per-m-token-usd: 0.10
        output-per-m-token-usd: 1.60
```

- [ ] **Step 4: Change the frontend dropdown value**

In `front/features/host/aigen/ui/aigen-model-options.ts`, replace the OpenAI option:

```ts
{ value: "gpt-4.1", label: "OpenAI GPT-4.1" },
```

- [ ] **Step 5: Change the OpenAI smoke script default**

In `scripts/aigen-smoke-openai.sh`, set:

```bash
MODEL="${READMATES_SMOKE_OPENAI_MODEL:-gpt-4.1}"
```

- [ ] **Step 6: Change server tests and integration properties**

In `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`, replace the test properties:

```kotlin
"readmates.aigen.pricing.gpt-4.1.input-per-m-token-usd=2.00",
"readmates.aigen.pricing.gpt-4.1.cached-input-per-m-token-usd=0.50",
"readmates.aigen.pricing.gpt-4.1.output-per-m-token-usd=8.00",
```

Replace provider matrix values:

```kotlin
@ValueSource(strings = ["claude-sonnet-4-6", "gpt-4.1"])
```

Delete the obsolete comment that says production `openai-gpt-4-1` needs a separate prefix-routing change.

In `OpenAiContentGeneratorTest` and `OpenAiContentRegeneratorTest`, replace all `ModelId(Provider.OPENAI, "openai-gpt-4-1")` and expected fake API model assertions with `gpt-4.1`.

- [ ] **Step 7: Change frontend tests**

Run this to find every active frontend assertion that still uses the old value:

```bash
rg -n "openai-gpt-4-1|gpt-4-1" front/features front/tests
```

Replace active model values with `gpt-4.1`. Representative replacements:

```ts
defaultModel="gpt-4.1"
```

```ts
expect(select.value).toBe("gpt-4.1");
```

```ts
fireEvent.change(select, { target: { value: "gpt-4.1" } });
```

```ts
expect(parsed).toEqual({ defaultModel: "gpt-4.1" });
```

- [ ] **Step 8: Verify there are no active stale model IDs**

Update `docs/operations/runbooks/ai-session-generation.md` section 1 so the example and explanatory note use `gpt-4.1-mini`:

````markdown
1. `server/src/main/resources/application.yml`의 `readmates.aigen.pricing` map에 단가 항목을 추가합니다. 예 (`gpt-4.1-mini`):
   ```yaml
   readmates:
     aigen:
       enabled-providers: [CLAUDE, OPENAI, GEMINI]
       pricing:
         gpt-4.1-mini:
           input-per-m-token-usd: 0.40
           cached-input-per-m-token-usd: 0.10
           output-per-m-token-usd: 1.60
   ```
   - Provider 접두사 매칭은 `YamlModelCatalog.providerFromName` (`claude-*`, `gpt-*`/`o\d+`, `gemini-*`). OpenAI 모델 ID는 provider API가 받는 canonical alias (`gpt-4.1`, `gpt-4.1-mini`)를 그대로 사용합니다.
````

In `CHANGELOG.md`, update the Phase 4 OpenAI provider entry so it no longer says `openai-gpt-4-1` is a known follow-up. Keep the historical task context, but add a current correction sentence:

```markdown
Post-review correction: release-risk remediation normalized the OpenAI model IDs to canonical API aliases `gpt-4.1` and `gpt-4.1-mini` across `application.yml`, frontend options, tests, smoke scripts, and operator docs.
```

Then verify the active tree:

Run:

```bash
rg -n "openai-gpt-4-1|openai-gpt-4-1-mini|gpt-4-1|gpt-4-1-mini" \
  server/src/main \
  server/src/test \
  front/features \
  front/tests \
  scripts \
  docs/operations \
  docs/development \
  CHANGELOG.md
```

Expected after the fix: no active source/runbook/test hits. Historical `docs/superpowers/**` hits can remain unless the document is being updated as current release-facing documentation.

- [ ] **Step 9: Run targeted model tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.config.AiGenerationPropertiesTest \
  --tests com.readmates.aigen.adapter.out.llm.common.YamlModelCatalogTest \
  --tests com.readmates.aigen.adapter.out.llm.openai.OpenAiContentGeneratorTest \
  --tests com.readmates.aigen.adapter.out.llm.openai.OpenAiContentRegeneratorTest
```

Expected: `BUILD SUCCESSFUL`.

Run:

```bash
pnpm --dir front test -- \
  front/features/host/aigen/api/aigen-api.test.ts \
  front/features/host/aigen/ui/TranscriptUploadForm.test.tsx \
  front/features/host/aigen/ui/RegenerateModal.test.tsx \
  front/features/host/club/ui/ClubAiDefaultsSection.test.tsx
```

Expected: selected Vitest files pass.

- [ ] **Step 10: Commit this slice**

```bash
git add \
  server/src/main/resources/application.yml \
  server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCatalogTest.kt \
  server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentGeneratorTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiContentRegeneratorTest.kt \
  front/features/host/aigen/ui/aigen-model-options.ts \
  front/features/host/aigen/api/aigen-api.test.ts \
  front/features/host/aigen/ui/TranscriptUploadForm.test.tsx \
  front/features/host/aigen/ui/RegenerateModal.test.tsx \
  front/features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  scripts/aigen-smoke-openai.sh \
  docs/operations/runbooks/ai-session-generation.md \
  CHANGELOG.md
git commit -m "fix: use canonical OpenAI model ids"
```

---

## Task 3: Make Transcript Storage Policy Truthful and Guarded

**Files:**
- Modify: `scripts/aigen-pii-check.sh`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update PII script comments to match the real invariant**

In `scripts/aigen-pii-check.sh`, replace the invariant comment block with:

```bash
# Invariants enforced (spec §5.7, §11.1, current Redis handoff design):
#   1. Durable transcript-body-like column or property names MUST NOT exist in
#      server/src/main/ Kotlin sources.
#   2. Kafka producers MUST NOT send arguments named `transcript` (we forward
#      job-routing metadata only, not transcript bodies, on the job topic).
#   3. Micrometer .tag(...) keys in aigen production code MUST be one of the
#      §11.1 allowlist: provider, model, kind, status, reason, direction.
#   4. Flyway migrations MUST NOT introduce columns with transcript-body names.
#   5. The raw transcript Redis key is allowed only inside the job-store handoff
#      boundary and must remain TTL/delete covered by integration tests.
```

Rename the first function for clarity:

```bash
check1_durable_transcript_body_columns() {
```

And update the failure label inside it:

```bash
echo "FAIL [check1]: durable transcript-body column/property names in production Kotlin:" >&2
```

- [ ] **Step 2: Add a Redis transcript scope check**

Add this function after `check4_flyway_columns`:

```bash
check5_redis_transcript_scope() {
  local matches unexpected
  matches=$(grep -RIn --include='*.kt' -E \
    '(aigen:job:.*:transcript|transcriptKey)' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  unexpected=$(printf '%s\n' "$matches" | \
    grep -vE 'RedisAiGenerationJobStore\.kt|AiGenerationJobStore\.kt|AiGenerationJobQueue\.kt|AiGenerationJobMessage\.kt' || true)
  if [[ -n "$unexpected" ]]; then
    echo "FAIL [check5]: raw transcript Redis key used outside the job-store handoff boundary:" >&2
    echo "$unexpected" >&2
    return 1
  fi
  return 0
}
```

Update `main`:

```bash
check1_durable_transcript_body_columns || rc=1
check2_kafka_producer_transcript_arg || rc=1
check3_metric_tag_allowlist || rc=1
check4_flyway_columns || rc=1
check5_redis_transcript_scope || rc=1
if [[ "$rc" -eq 0 ]]; then
  echo "aigen-pii-check: PASS (5 invariants)"
else
  echo "aigen-pii-check: FAIL — see lines above (spec §11)" >&2
fi
```

- [ ] **Step 3: Run the PII script**

Run:

```bash
bash scripts/aigen-pii-check.sh
```

Expected:

```text
aigen-pii-check: PASS (5 invariants)
```

- [ ] **Step 4: Update architecture Redis key documentation**

In `docs/development/architecture.md`, replace the Redis key bullet list under "In-app AI 세션 생성 컴포넌트" with:

```markdown
- **Redis 키**:
  - `aigen:job:<jobId>` (Hash, TTL 6h) — job state, provider/model, item snapshot. Transcript 본문은 이 hash에 넣지 않습니다.
  - `aigen:job:<jobId>:transcript` (String, TTL 6h) — raw transcript body. Kafka/MySQL/metrics로 보내지 않고 worker/regeneration이 Redis에서만 rehydrate합니다. Commit/cancel 시 `aigen:job:<jobId>`/`:transcript`/`:result` 세 키를 함께 삭제합니다.
  - `aigen:job:<jobId>:result` (String, TTL 6h) — validated `SessionImportV1Snapshot` JSON.
  - `aigen:cost:club:<clubId>:<YYYY-MM>` (String, TTL 31d) — 월별 클럽 누적 비용 BigDecimal scale=4 USD.
  - `aigen:cost:host:<userId>:<YYYY-MM-DD>` (String, TTL 24h) — 호스트 일일 생성 횟수 카운터.
  - `aigen:cost:host:<userId>:<YYYY-MM>` (String, TTL 31d) — 호스트 월별 누적 비용 (감사 보조).
```

- [ ] **Step 5: Update runbook transcript incident handling**

In `docs/operations/runbooks/ai-session-generation.md`, replace section 6 step 1 with:

```markdown
1. 호스트에게 `jobId` 또는 `sessionId`, 생성 시각을 받습니다. **본문(transcript) 재요청은 호스트에게 직접** 합니다. MySQL audit log, Kafka message, metric에는 transcript 본문이 저장되지 않습니다. Redis에는 활성 job 동안 `aigen:job:<jobId>:transcript` raw transcript key가 최대 job TTL 동안 존재할 수 있으므로, 운영자는 이 값을 ticket/chat/log에 복사하지 않습니다.
```

Replace section 6 step 3 with:

```markdown
3. Redis에 같은 jobId의 결과 snapshot이 살아 있으면 (`aigen:job:<jobId>` 6h TTL) 운영자가 PREVIEW 상태 결과 metadata와 결과 JSON 존재 여부를 확인할 수 있습니다. Hash 조회는 transcript 본문을 반환하지 않습니다:
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning HGETALL "aigen:job:<jobId>"
   redis-cli -h <host> -a <password> --no-auth-warning TTL "aigen:job:<jobId>:transcript"
   redis-cli -h <host> -a <password> --no-auth-warning EXISTS "aigen:job:<jobId>:result"
   ```
```

- [ ] **Step 6: Update CHANGELOG PII wording**

In `CHANGELOG.md`, adjust the Phase 6 PII script description so it no longer says Redis has no raw transcript. Use this wording inside the existing Phase 6 bullet:

```markdown
`scripts/aigen-pii-check.sh`가 PR마다 durable transcript column/property 금지, Kafka transcript body 금지, metric tag allowlist, Flyway transcript-body column 금지, Redis transcript key 사용 범위 제한을 검증합니다. Redis `aigen:job:<jobId>:transcript`는 worker handoff를 위한 short-lived raw transcript key이며 TTL/delete integration test로 보호합니다.
```

- [ ] **Step 7: Run targeted docs/script checks**

Run:

```bash
bash scripts/aigen-pii-check.sh
git diff --check -- \
  scripts/aigen-pii-check.sh \
  docs/operations/runbooks/ai-session-generation.md \
  docs/development/architecture.md \
  CHANGELOG.md
```

Expected: PII script pass, diff check pass.

- [ ] **Step 8: Commit this slice**

```bash
git add \
  scripts/aigen-pii-check.sh \
  docs/operations/runbooks/ai-session-generation.md \
  docs/development/architecture.md \
  CHANGELOG.md
git commit -m "docs: clarify AI transcript storage boundary"
```

---

## Task 4: Repair Release Notes, Kill Switch Docs, and Whitespace

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`

- [ ] **Step 1: Fix kill switch runbook behavior**

In `docs/operations/runbooks/ai-session-generation.md`, replace the old 404 behavior in section 8 with:

```markdown
2. 효과:
   - `AiGenerationKillSwitchFilter`가 `/api/host/sessions/*/ai-generate/**`와 `/api/host/clubs/*/ai-defaults` 요청을 가로채 503 + RFC 7807 `application/problem+json` (`code: AI_DISABLED`)을 반환합니다. Controller bean은 `@ConditionalOnProperty`로 등록되지 않지만, 운영자는 404가 아니라 명시적인 disable 응답을 봅니다.
   - Frontend AI 모드 토글은 여전히 보이지만 generation/default-model 요청은 `AI_DISABLED` 응답을 받아 사용자 안전 오류 상태로 전환됩니다. 토글 자체를 숨기려면 frontend feature flag 변경이 별도로 필요합니다.
   - Kafka consumer (`AiGenerationJobConsumer`)도 같은 flag로 로드되지 않으므로 in-flight job은 다음 부팅에 재처리되지 않습니다. PR 메시지 본문은 transcript 없이 metadata만이라 손실 영향은 job 재시도/만료 처리 범위로 제한됩니다.
```

- [ ] **Step 2: Remove known whitespace failures**

Open `docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md` and remove trailing spaces from lines 3 and 4.

Open `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx` and ensure the file ends with exactly one newline after the final line.

Run:

```bash
git diff --check origin/main..HEAD
```

Expected: no output.

- [ ] **Step 3: Replace stale CHANGELOG verification claims after checks pass**

After Task 5 verification has run, update the Phase 9 verification bullet in `CHANGELOG.md` to exact post-fix results. Use this shape:

```markdown
- chore(release): post-risk-remediation verification passed — `git diff --check origin/main..HEAD`, `bash scripts/aigen-pii-check.sh`, backend `unitTest`, targeted Flyway + AI generation integration tests, `architectureTest`, frontend `lint`/`test`/`build`/`test:e2e`, `pnpm design:check`, and public-release candidate build/check all completed successfully. Live provider SDK smoke remains skipped without `READMATES_AIGEN_{ANTHROPIC,OPENAI,GEMINI}_API_KEY`.
```

Also remove or rewrite any Unreleased line that says current `integrationTest` failures predate this branch.

- [ ] **Step 4: Run docs diff check**

Run:

```bash
git diff --check -- \
  CHANGELOG.md \
  docs/operations/runbooks/ai-session-generation.md \
  docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md
```

Expected: no output.

- [ ] **Step 5: Commit this slice**

```bash
git add \
  CHANGELOG.md \
  docs/operations/runbooks/ai-session-generation.md \
  docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md \
  front/features/host/aigen/hooks/useAiGenerationJob.test.tsx
git commit -m "docs: refresh release readiness record"
```

---

## Task 5: Full Verification Pass

**Files:**
- No direct source edits unless a verification command exposes a concrete regression.

- [ ] **Step 1: Run backend unit tests**

Run:

```bash
./server/gradlew -p server unitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Run targeted integration tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: `BUILD SUCCESSFUL`.

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Run server architecture tests**

Run:

```bash
./server/gradlew -p server architectureTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: lint exits 0, Vitest exits 0, Vite build exits 0.

- [ ] **Step 5: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: Playwright exits 0. The previous backend startup failure should be gone because Flyway no longer has duplicate `V30`.

- [ ] **Step 6: Run design workspace check**

Run:

```bash
pnpm design:check
```

Expected: design system and design docs checks pass.

- [ ] **Step 7: Run public release candidate checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: release candidate builds and scanner passes.

- [ ] **Step 8: Run release diff hygiene checks**

Run:

```bash
git diff --check origin/main..HEAD
bash scripts/aigen-pii-check.sh
```

Expected: diff check has no output; PII script prints `aigen-pii-check: PASS (5 invariants)`.

- [ ] **Step 9: Record skipped live SDK validation**

Check whether live provider keys exist:

```bash
env | rg '^READMATES_AIGEN_(ANTHROPIC|OPENAI|GEMINI)_API_KEY='
```

Expected in this environment: no output. Record live SDK smoke as skipped in the final response and CHANGELOG because provider API keys are absent.

If keys are present, run:

```bash
scripts/aigen-smoke-claude.sh
scripts/aigen-smoke-openai.sh
scripts/aigen-smoke-gemini.sh
```

Expected with keys and a running target environment: each smoke script completes and polls to a terminal success state.

- [ ] **Step 10: Commit final verification note**

Only after the verification commands above have passed and `CHANGELOG.md` has been updated with actual outcomes:

```bash
git add CHANGELOG.md
git commit -m "chore: record release risk remediation verification"
```

---

## Final Review Checklist

- [ ] `server/src/main/resources/db/mysql/migration` has no duplicate version numbers.
- [ ] OpenAI model IDs are `gpt-4.1` and `gpt-4.1-mini` in active code/tests/docs.
- [ ] `scripts/aigen-pii-check.sh` describes the true Redis handoff design and passes.
- [ ] Runbook says kill switch returns 503 `AI_DISABLED`, not 404.
- [ ] `CHANGELOG.md` reflects actual checks run after the fix.
- [ ] `git diff --check origin/main..HEAD` passes.
- [ ] Live SDK smoke is either run with keys or explicitly reported as skipped.
