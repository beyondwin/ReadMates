# ReadMates Grounded Whole-Transcript AI Session Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a club host upload the supported discussion TXT export, reject any speaker who is not an active club member before creating a job or spending provider cost, generate all four session artifacts from one whole-transcript structured call, review source-grounded evidence, and commit a crash-recoverable draft into the existing session import path.

**Architecture:** Add a `GROUNDED_WHOLE_TRANSCRIPT` pipeline beside the existing `LEGACY` path. Parse and membership-validate the transcript synchronously at the HTTP/application boundary, render and budget the exact outbound request locally, then persist the normalized transcript and turns only in TTL-bound Redis. A worker makes one structured provider call, resolves model-supplied turn IDs into server-owned evidence excerpts, and allows one full-context section repair. The host reviews every section and commits through a Redis revision/lease plus one MySQL transaction that upserts missing participants, imports content, and writes a content-free receipt; the receipt reconciles the Redis/MySQL crash window.

**Tech Stack:** Kotlin 2 / Spring Boot 3, Spring TransactionTemplate, MySQL 8 / Flyway, Redis Lua CAS, Kafka, Jackson JSON Schema provider adapters for OpenAI/Claude/Gemini, React 19, TypeScript 5.8, TanStack Query, Vite 8, Vitest 4, Playwright, pnpm 10.33.0 through Corepack.

## Global Constraints

- Treat the approved design at `docs/superpowers/specs/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation-design.md` as the product source of truth; do not reopen approved decisions during implementation.
- Keep `LEGACY` as the default pipeline until the new mode has passed the complete verification matrix. Do not replace legacy provider generators in place.
- Accept only `.txt`, at most 1 MiB, UTF-8 with an optional BOM, with `speaker + MM:SS` turns and a maximum timestamp of 3 hours inclusive.
- Normalize speaker/member names with Unicode NFC plus trim, then compare case-sensitively. Reject generic labels, inactive members, members of another club, duplicate normalized active names, and every speaker absent from the active same-club membership set. Do not fuzzy-match, map aliases, or silently omit a speaker.
- Complete parse, member validation, model-capability validation, and input-budget validation before job creation, Redis writes, Kafka publication, provider calls, or cost reservation.
- Real names are the only accepted mode. Keep the request field temporarily for wire compatibility, but reject `ALIAS` with a typed 422 response.
- Generate summary, highlights, one-line reviews, and feedback document in one primary whole-transcript call. A validation failure may trigger one section-scoped repair, but the repair request still contains the entire transcript.
- Never expose an invalid draft. The model may return turn IDs only; the server resolves all evidence excerpts from the current source turns and owns evidence target IDs.
- Keep raw transcript, normalized turns, generated result, and evidence only in four TTL-bound Redis payload keys. Never put transcript content, evidence text, generated content, names, provider prompts, or private file metadata in Kafka, MySQL audit/receipt rows, logs, metrics, notifications, or operator APIs.
- Do not copy any locally inspected transcript name, content, file name, or absolute path into code, fixtures, docs, commits, logs, or final responses. Tests use public-safe synthetic members and discussions only.
- No live provider call against private transcripts is authorized by this plan. Live provider evaluation requires a separate explicit approval and must report aggregate metrics only.
- Use a 16,384-token application output reservation by default, configurable downward only. Fail closed with 503 when a selected model has no verified capability entry and with 422 when the rendered request cannot fit. Fallback candidates must be computed before queueing and each must fit the full request.
- Canonical configured model IDs are `gpt-5.4-mini`, `claude-sonnet-4-6`, and `gemini-3-flash-preview`. Keep pricing and capability metadata separate.
- Evidence excerpt expansion is allowed only for a turn already referenced by a current-revision evidence target. Return at most 240 Unicode code points by default and never add transcript search or download endpoints.
- Direct host edits do not increment the server revision; they mark the affected section as user-edited and disable AI evidence for each changed block/target. If a structural edit cannot be mapped safely, disable all evidence targets in that section. Regeneration increments revision and clears section confirmations/evidence selections.
- Commit requires `expectedRevision`, the complete section review map, and the result. The server compares the submitted result with the validated Redis snapshot and enforces `AI_GROUNDED_REVIEWED` for unchanged sections and `USER_EDITED_CONFIRMED` for edited sections.
- Use Redis CAS/lease plus a MySQL receipt for commit coordination. Do not hold a Spring database transaction open while calling Redis, and do not claim cross-store atomicity.
- Keep the existing session import transaction and post-commit cache invalidation behavior. The AI commit transaction adds participants before invoking the existing validated import delegate.
- Preserve public-repository safety. Do not add secrets, private hosts, real user data, token-shaped examples, local absolute paths, or deployment state.
- Use the repository-pinned package manager through `npx --yes corepack@0.35.0 pnpm` whenever frontend checks run.
- At implementation start, capture `IMPLEMENTATION_BASE=$(git rev-parse HEAD)` and use `git diff "$IMPLEMENTATION_BASE"...HEAD` for scoped review and release-readiness checks.
- Follow TDD for each behavior: add the narrow failing test, observe the expected failure, implement the smallest production change, rerun the narrow test, then run the listed regression gate.
- Commit after each task only when its narrow and regression checks pass. Do not stage unrelated user changes.

---

## File Structure

### Server domain and application

- Modify `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`: pipeline mode, parsed/validated turn, grounded result/evidence, revision, review, status, and typed error models.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/TranscriptParser.kt`: BOM-safe strict TXT export parser with stable turn IDs.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/LoadAiGenerationClubMembersPort.kt`: active same-club member lookup.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationClubMembersAdapter.kt`: normalized-name preflight data adapter.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/TranscriptMembershipValidator.kt`: exact speaker-to-active-member validator.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/ModelCapabilityCatalog.kt`: provider/model context and output limits.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCapabilityCatalog.kt`: fail-closed capability adapter.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/GroundedRequestRenderer.kt`: shared exact request renderer contract.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/DefaultGroundedRequestRenderer.kt`: prompt/schema/transcript byte renderer shared by budget and providers.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedInputBudgetGuard.kt`: conservative local whole-request budget guard and fallback eligibility filter.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/WholeTranscriptGroundedGenerator.kt`: primary and repair provider interface.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedGenerationValidator.kt`: structured output, authorship, cardinality, turn-reference, template, and PII validation.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedEvidenceProjector.kt`: server-owned target/excerpt projection.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`: synchronous preflight and mode dispatch.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`: grounded whole-call, failover, one repair, evidence save.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`: full-context grounded section regeneration and revision increment.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`: review enforcement, Redis lease, explicit MySQL transaction, receipt recovery, post-commit cleanup.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`: content-free `COMMIT_RETRY` recovery semantics.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`: grounded statuses and transitions.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`: model list, evidence expansion, revision-aware regenerate, and content-free commit contracts.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`: four payload keys, revision CAS, evidence lookup, commit lease, and cleanup metadata.

### Server provider adapters, web, persistence, and configuration

- Create `server/src/main/resources/aigen/grounded-session-generation-v2.schema.json`: provider structured-output schema containing text plus evidence turn IDs.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/GroundedGenerationSchemaResource.kt`: schema loader.
- Create grounded generator adapters under each of `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/openai`, `.../claude`, and `.../gemini` without replacing legacy classes.
- Modify all three provider API ports/clients: accept the configured max output token count and structured schema required by grounded generation.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`: Redis hash plus `:transcript`, `:turns`, `:result`, and `:evidence` payloads with shared 6-hour TTL and Lua CAS.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`: model list, preflight errors, evidence expansion, revision-aware regenerate/commit.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`: grounded status/result/evidence/review DTOs and content-free commit response.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`: safe typed 422/503 responses, including invalid speaker labels only.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationCommitPersistencePort.kt`: participant upsert and receipt persistence contract.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationCommitPersistenceAdapter.kt`: participant upsert/reactivation and content-free receipt implementation.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt`: stale `COMMITTING` reconciliation.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt`: bounded scheduled recovery trigger.
- Create `server/src/main/resources/db/mysql/migration/V37__grounded_ai_generation.sql`: receipt/audit metadata schema and canonical Gemini default migration.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAuditPort.kt` and `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepository.kt`: aggregate grounding/review metadata only.
- Modify `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`, `AiGenerationBeansConfig.kt`, `AiGenerationConfigValidator.kt`, and `server/src/main/resources/application.yml`: pipeline mode, capability table, repair/commit settings, canonical IDs, and 16,384 output reservation.

### Frontend and BFF

- Modify `front/features/host/aigen/api/aigen-contracts.ts`: grounded job/result/evidence/review/revision/error contracts.
- Modify `front/features/host/aigen/api/aigen-api.ts`: model list, typed start error, evidence expansion, revision-aware regeneration and commit.
- Modify `front/features/host/aigen/queries/aigen-job-queries.ts` and `front/features/host/aigen/hooks/useAiGenerationJob.ts`: grounded polling and cache keys.
- Modify `front/features/host/aigen/ui/TranscriptUploadForm.tsx`: `.txt` only, real-name mode, dynamic model list, and invalid-speaker correction flow.
- Remove `front/features/host/aigen/ui/aigen-model-options.ts` after all consumers use the server list.
- Create `front/features/host/aigen/model/aigen-review-state.ts`: pure section diff/review/evidence state machine.
- Create `front/features/host/aigen/ui/ReviewLedger.tsx`: desktop review navigation and confirmation controls.
- Create `front/features/host/aigen/ui/EvidencePanel.tsx`: desktop current-target evidence view.
- Create `front/features/host/aigen/ui/EvidenceDrawer.tsx`: mobile evidence drawer.
- Modify `front/features/host/aigen/ui/PreviewView.tsx` and section components: target selection, edits, regeneration, evidence disabled state, and commit gating.
- Modify `front/features/host/aigen/ui/AiGenerateTab.tsx`: grounded orchestration, review state, draft recovery warnings, and commit conflict flow.
- Modify `front/features/host/aigen/storage/aigen-draft-storage.ts`: job/revision/result/review map envelope.
- Modify `front/tests/unit/cloudflare-bff.test.ts`: multipart bytes/boundary regression plus typed error propagation.
- Modify public-safe AI E2E fixtures/specs under `front/tests/e2e/` for valid speaker exports, early nonmember rejection, evidence review, regeneration, mobile drawer, and commit recovery.

### Verification, operations, and documentation

- Add focused unit/integration tests beside every new server/frontend file and extend existing AI generation tests rather than creating a second test harness.
- Modify `scripts/aigen-pii-check.sh`: turns/evidence key scope, audit/receipt/Kafka/log content restrictions.
- Modify `scripts/aigen-smoke-openai.sh`, `scripts/aigen-smoke-claude.sh`, and `scripts/aigen-smoke-gemini.sh`: canonical model IDs and grounded public-safe request shape; keep live execution opt-in by environment key.
- Modify `.env.example`: documented public-safe pipeline/capability/commit recovery configuration only.
- Modify `docs/operations/runbooks/ai-session-generation.md`: rollout, recovery, failure, evidence/privacy, and operator procedures.
- Modify `docs/development/architecture.md`: preflight, TTL trust boundary, provider request, evidence, and commit protocol.
- Modify `CHANGELOG.md`: operator-visible behavior under Unreleased.

---

### Task 1: Add the rollout mode and verified model capability catalog

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/ModelCapabilityCatalog.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCapabilityCatalog.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/YamlModelCapabilityCatalogTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`

**Interfaces:**
- Produces `AiGenerationPipelineMode.LEGACY | GROUNDED_WHOLE_TRANSCRIPT`.
- Produces `ModelCapability(contextWindowTokens, maxOutputTokens, structuredOutputSupported)` independently of `ModelPricing`.
- Produces `GET /api/host/sessions/{sessionId}/ai-generate/models` returning only enabled, priced, capable models and the club default.
- Consumes canonical provider model IDs and a 16,384-token application output reservation.

- [x] **Step 1: Write failing capability and model-list tests**

Pin fail-closed behavior and exact public contract:

```kotlin
@Test
fun `unknown model has no inferred capability`() {
    assertThat(catalog.find(ModelId(Provider.OPENAI, "future-model"))).isNull()
}

@Test
fun `grounded model list excludes models without verified structured output capability`() {
    val response = controller.listModels(sessionId, principal)
    assertThat(response.models.map { it.id }).containsExactly(
        "gpt-5.4-mini",
        "claude-sonnet-4-6",
        "gemini-3-flash-preview",
    )
}
```

- [x] **Step 2: Run the focused tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*YamlModelCapabilityCatalogTest' --tests '*AiGenerationControllerTest'
```

Expected: FAIL because the capability port, pipeline mode, and model-list endpoint do not exist.

- [x] **Step 3: Add the domain and configuration contracts**

Use explicit types; do not infer context from pricing:

```kotlin
enum class AiGenerationPipelineMode { LEGACY, GROUNDED_WHOLE_TRANSCRIPT }

data class ModelCapability(
    val contextWindowTokens: Long,
    val maxOutputTokens: Long,
    val structuredOutputSupported: Boolean,
)

interface ModelCapabilityCatalog {
    fun find(model: ModelId): ModelCapability?
}
```

Add configuration equivalent to:

```yaml
readmates:
  aigen:
    pipeline-mode: ${READMATES_AIGEN_PIPELINE_MODE:LEGACY}
    grounded:
      reserved-output-tokens: 16384
      safety-margin-tokens: 8192
      capabilities:
        gpt-5.4-mini:
          context-window-tokens: 400000
          max-output-tokens: 128000
          structured-output-supported: true
        claude-sonnet-4-6:
          context-window-tokens: 1000000
          max-output-tokens: 64000
          structured-output-supported: true
        gemini-3-flash-preview:
          context-window-tokens: 1048576
          max-output-tokens: 65536
          structured-output-supported: true
```

These values and canonical IDs were verified on 2026-07-14 against the official [OpenAI GPT-5.4 mini model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Claude context-window documentation](https://platform.claude.com/docs/en/build-with-claude/context-windows), [Claude extended-thinking/output documentation](https://platform.claude.com/docs/en/build-with-claude/extended-thinking), and [Gemini 3 Flash Preview model page](https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview?hl=en). Reverify these primary sources and the actual provider SDK/API model surface during implementation and release review; capability drift must fail closed.

The config validator must reject non-positive limits, an application output reservation above 16,384 or above a model's maximum, capability entries without pricing, and grounded enabled/default models without capability entries.

- [x] **Step 4: Add the host model-list use case and endpoint**

Authorize against the requested session and return safe metadata only:

```kotlin
data class AvailableGenerationModel(
    val id: String,
    val provider: Provider,
    val isDefault: Boolean,
)

interface ListGenerationModelsUseCase {
    fun list(sessionId: UUID, clubId: UUID): List<AvailableGenerationModel>
}
```

Do not expose pricing, API keys, internal fallback order, or capability token counts to the browser.

- [x] **Step 5: Replace the stale Gemini identifier in configuration-level defaults**

Use `gemini-3-flash-preview` in `application.yml`, properties tests, and model-list tests. Database-stored defaults and smoke scripts are migrated in Task 10 and Task 14 so each change lands with its own regression coverage.

- [x] **Step 6: Rerun the focused tests and config regression gate**

```bash
./server/gradlew -p server unitTest --tests '*YamlModelCapabilityCatalogTest' --tests '*AiGenerationPropertiesTest' --tests '*AiGenerationConfigValidatorTest' --tests '*AiGenerationControllerTest'
```

Expected: PASS; the app still starts in `LEGACY` unless the environment explicitly selects the grounded mode.

- [x] **Step 7: Commit the capability slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/main/resources/application.yml server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): add grounded model capability catalog"
```

---

### Task 2: Parse the supported TXT export into stable transcript turns

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/TranscriptParser.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/TranscriptParserTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/AiGenerationException.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationControllerTest.kt`

**Interfaces:**
- Consumes strictly decoded UTF-8 text after the controller's `.txt` and 1 MiB byte checks.
- Produces `ParsedTranscript(normalizedTranscript, turns)` with `t000001`-style IDs.
- Rejects unsupported encoding, malformed/unknown preambles, empty turns, decreasing timestamps, missing speaker turns, and timestamps above 10,800 seconds.

- [x] **Step 1: Add public-safe parser fixtures and failing tests**

Keep fixture strings synthetic and embedded in tests:

```kotlin
private val exportedDiscussion = """
    7회차 독서모임
    2026. 7. 14. 오후 7:30 · 58분 12초
    가람, 나래

    가람 00:00
    첫 번째 공개 테스트 발언입니다.
    둘째 줄도 같은 발언입니다.

    나래 01:05
    두 번째 공개 테스트 발언입니다.
""".trimIndent()

@Test
fun `parses BOM export header and multiline turns with stable ids`() {
    val parsed = parser.parse("\uFEFF$exportedDiscussion")
    assertThat(parsed.turns.map { it.turnId }).containsExactly("t000001", "t000002")
    assertThat(parsed.turns[1].startSeconds).isEqualTo(65)
}
```

Add parameterized rejection cases for arbitrary preamble, `화자 1`, missing text, duplicate header without text, `03:00:00`, `180:01`, equal/decreasing timestamps, a title over 200 characters, and a participant line over 500 characters. Controller tests must cover case-insensitive `.txt` suffix acceptance, missing/other suffix rejection regardless of claimed MIME type, empty upload, exact 1 MiB acceptance, one-byte-over rejection, malformed UTF-8, BOM, and CRLF.

- [x] **Step 2: Run the parser test and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*TranscriptParserTest'
```

Expected: FAIL because `TranscriptParser` and parsed turn models do not exist.

- [x] **Step 3: Implement strict parsing and normalized text output**

Use a single anchored header regex and deterministic IDs:

```kotlin
private val TURN_HEADER = Regex("^(.+?)\\s+(\\d{1,3}):([0-5]\\d)\\s*$")
private val EXPORT_DATE_AND_DURATION = Regex(
    "^\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*(오전|오후)\\s*" +
        "\\d{1,2}:[0-5]\\d\\s*·\\s*\\d+분\\s*\\d+초$",
)
private const val MAX_TIMESTAMP_SECONDS = 10_800

data class ParsedTranscriptTurn(
    val turnId: String,
    val speakerName: String,
    val startSeconds: Int,
    val text: String,
)
```

Accept either no preamble or the bounded 2–3 line export header: title, strict date/time/duration line, and optional participant list. Strip one leading BOM, normalize CRLF/CR to LF, preserve paragraph line breaks inside a turn, reject control-only text, and require strictly increasing timestamps. Do not normalize speaker names inside the parser; membership validation owns NFC/trim semantics.

- [x] **Step 4: Map parser failures to safe typed errors**

Add `TRANSCRIPT_FORMAT_INVALID`, `TRANSCRIPT_EMPTY`, and `TRANSCRIPT_DURATION_EXCEEDED` to `ErrorCode` and the application exception hierarchy. Decode UTF-8 with a strict `CharsetDecoder` that reports malformed/unmappable bytes; map an invalid byte sequence to `TRANSCRIPT_FORMAT_INVALID` with a safe encoding reason. Errors may include a safe 1-based line number and reason enum but never the rejected transcript line.

- [x] **Step 5: Rerun parser and exception tests**

```bash
./server/gradlew -p server unitTest --tests '*TranscriptParserTest' --tests '*AiGenerationErrorHandlerTest'
```

Expected: PASS with no transcript text printed by assertion messages or exception serialization.

- [x] **Step 6: Commit the parser slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application server/src/test/kotlin/com/readmates/aigen/application
git commit -m "feat(aigen): parse supported transcript exports"
```

---

### Task 3: Reject nonmembers before any job-side effect

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/LoadAiGenerationClubMembersPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationClubMembersAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/TranscriptMembershipValidator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/TranscriptMembershipValidatorTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationClubMembersAdapterTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`

**Interfaces:**
- Consumes every unique parsed speaker and all `ACTIVE` members of the same club.
- Produces `ValidatedTranscriptTurn` with the matched membership identifier.
- Produces HTTP 422 with `code=TRANSCRIPT_SPEAKER_NOT_MEMBER` or `TRANSCRIPT_SPEAKER_AMBIGUOUS` and `invalidSpeakerLabels` only.
- Guarantees validation failure calls none of job store, queue, provider, or cost guard.

- [x] **Step 1: Write validator truth-table tests**

Cover the approved exact-match semantics:

```kotlin
@Test
fun `speaker set may be a subset of active club members`() { /* passes */ }

@Test
fun `NFC plus trim matches but comparison remains case sensitive`() { /* passes NFC; rejects case variant */ }

@Test
fun `rejects inactive other-club generic and absent speakers`() { /* typed labels */ }

@Test
fun `rejects duplicate active member names after normalization`() { /* ambiguity */ }
```

The adapter test must prove the SQL is scoped by `club_id` and active membership status and does not derive candidates from `session_participants`.

- [x] **Step 2: Write the no-side-effect orchestrator test**

```kotlin
@Test
fun `invalid speaker rejects before Redis Kafka provider or cost work`() {
    assertThatThrownBy { orchestrator.start(commandWithSpeaker("외부인")) }
        .isInstanceOf(AiGenerationException.InvalidTranscriptSpeakers::class.java)

    verify(exactly = 0) { jobStore.save(any()) }
    verify(exactly = 0) { queue.enqueue(any()) }
    verify(exactly = 0) { costGuard.reserve(any(), any(), any()) }
    verify(exactly = 0) { requestRenderer.render(any()) }
}
```

- [x] **Step 3: Run focused tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*TranscriptMembershipValidatorTest' --tests '*JdbcAiGenerationClubMembersAdapterTest' --tests '*AiGenerationOrchestratorTest'
```

Expected: FAIL because membership lookup/validation and the new exception do not exist.

- [x] **Step 4: Implement member lookup and exact normalized matching**

Use explicit active-member records:

```kotlin
data class ActiveClubMember(
    val membershipId: UUID,
    val displayName: String,
)

data class ValidatedTranscriptTurn(
    val turnId: String,
    val speakerName: String,
    val speakerMembershipId: UUID,
    val startSeconds: Int,
    val text: String,
)
```

Normalize with `Normalizer.normalize(value.trim(), Normalizer.Form.NFC)`. Reject empty normalized values and generic speaker patterns such as `화자`, `화자 1`, `speaker`, `speaker 1`, and `unknown` before lookup. Build the active-name multimap; any duplicate normalized key is an ambiguity error even when only one matching speaker occurs.

- [x] **Step 5: Wire parse and membership preflight before job creation**

For `GROUNDED_WHOLE_TRANSCRIPT`, order `start` exactly as:

```text
authorization/session metadata already obtained by controller
-> raw byte/type/encoding checks
-> parse
-> active same-club membership lookup and validation
-> model capability and full-request budget checks (Task 4)
-> existing cap/rate/idempotency checks
-> job record save
-> Kafka enqueue
```

Keep the legacy path behavior intact. Persist the validated speaker membership identity in the Redis turns payload, never in Kafka.

- [x] **Step 6: Add the typed safe 422 response**

```kotlin
data class AiGenerationProblemResponse(
    val code: ErrorCode,
    val detail: String,
    val invalidSpeakerLabels: List<String>? = null,
)
```

Return a stable correction message asking the host to fix the transcript and upload again. De-duplicate labels in first-seen order. Do not return candidate member names, IDs, status, club details, or transcript excerpts.

- [x] **Step 7: Rerun focused tests and controller regression tests**

```bash
./server/gradlew -p server unitTest --tests '*TranscriptMembershipValidatorTest' --tests '*JdbcAiGenerationClubMembersAdapterTest' --tests '*AiGenerationOrchestratorTest' --tests '*AiGenerationControllerTest' --tests '*AiGenerationErrorHandlerTest'
```

Expected: PASS, including the zero-side-effect verification.

- [x] **Step 8: Commit the membership preflight slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): reject transcript speakers outside active membership"
```

---

### Task 4: Define the grounded schema, exact request renderer, and local input budget guard

**Files:**
- Create: `server/src/main/resources/aigen/grounded-session-generation-v2.schema.json`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/GroundedGenerationSchemaResource.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/GroundedGenerationSchemaResourceTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/GroundedRequestRenderer.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/DefaultGroundedRequestRenderer.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/common/DefaultGroundedRequestRendererTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedInputBudgetGuard.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedInputBudgetGuardTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/AiGenerationException.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/DefaultSessionImportV1ValidatorTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/DefaultSessionImportV1Validator.kt`

**Interfaces:**
- Produces one provider-neutral grounded JSON schema for all four result sections and evidence turn IDs.
- Produces the exact rendered system/user/schema bytes consumed by both budget calculation and provider adapters.
- Produces an ordered, precomputed list of whole-request-compatible fallback models.
- Rejects unknown capabilities with 503 `MODEL_CAPABILITY_UNAVAILABLE` and oversized input with 422 `TRANSCRIPT_TOO_LONG_FOR_MODEL` before side effects.

- [x] **Step 1: Write the grounded schema contract test**

Assert required roots and cardinalities without provider-specific transformations:

```kotlin
@Test
fun `grounded schema requires all sections and evidence turn ids`() {
    val schema = objectMapper.readTree(resource.schema())
    assertThat(schema.path("required").map(JsonNode::asText)).containsExactlyInAnyOrder(
        "format", "sessionNumber", "bookTitle", "meetingDate",
        "summaryBlocks", "highlights", "oneLineReviews",
        "feedbackDocumentFileName", "feedbackSections",
    )
    assertThat(schema.at("/properties/highlights/maxItems").asInt()).isEqualTo(6)
}
```

The schema shape must correspond to:

```kotlin
data class GroundedGenerationDraft(
    val format: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val summaryBlocks: List<GroundedTextBlock>,
    val highlights: List<GroundedAuthoredText>,
    val oneLineReviews: List<GroundedAuthoredText>,
    val feedbackDocumentFileName: String,
    val feedbackSections: List<GroundedFeedbackSection>,
)

data class GroundedTextBlock(val text: String, val evidenceTurnIds: List<String>)
data class GroundedAuthoredText(
    val authorName: String,
    val text: String,
    val evidenceTurnIds: List<String>,
)
data class GroundedFeedbackSection(
    val heading: String,
    val markdown: String,
    val evidenceTurnIds: List<String>,
)
```

- [x] **Step 2: Write exact renderer and budget tests**

Pin the same rendered bytes on both call sites and the conservative fallback:

```kotlin
@Test
fun `budget uses the exact provider request rendered for generation`() {
    val rendered = renderer.render(request)
    val decision = guard.evaluate(request, selectedModel, fallbackModels)
    assertThat(decision.renderedRequest.sha256()).isEqualTo(rendered.sha256())
}

@Test
fun `unknown capability fails closed before queueing`() { /* 503 */ }

@Test
fun `oversized primary and every fallback fails before queueing`() { /* 422 */ }

@Test
fun `fallback list contains only models that fit the entire request`() { /* ordered subset */ }
```

- [x] **Step 3: Run the focused tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*GroundedGenerationSchemaResourceTest' --tests '*DefaultGroundedRequestRendererTest' --tests '*GroundedInputBudgetGuardTest'
```

Expected: FAIL because the schema, renderer, and guard do not exist.

- [x] **Step 4: Implement an injection-safe request renderer**

The renderer must include:

- session metadata and allowed real speaker names;
- stable turn IDs, timestamp, speaker, and text for every turn;
- output schema and the four artifact requirements;
- a clear boundary that transcript and host instructions are untrusted data, never executable instructions;
- requirements to return referenced turn IDs and never invent IDs or quote excerpts;
- the current full draft and requested section only for repair/regeneration mode.

Return a value object that can be passed unchanged to adapters:

```kotlin
data class RenderedGroundedRequest(
    val systemText: String,
    val userText: String,
    val schemaJson: String,
    val maxOutputTokens: Int,
)
```

Do not log this object or include it in exceptions.

- [x] **Step 5: Implement conservative local budgeting**

Without adding a tokenizer dependency, use the total UTF-8 byte count of the exact system text, user text, and provider-specific serialized schema directly as the conservative token upper bound (one byte budgeted as at most one token). Cover this named fallback with boundary tests and do not call any provider endpoint. Require:

```text
estimatedInputTokens + reservedOutputTokens + safetyMarginTokens <= model.contextWindowTokens
reservedOutputTokens <= model.maxOutputTokens
structuredOutputSupported == true
```

The result stores the selected model and the already-filtered eligible fallback IDs so the worker never discovers an incompatible fallback after dequeue. A valid primary may start with no eligible fallback; an availability failure then ends as `PROVIDER_UNAVAILABLE` without truncation or an incompatible call. Preserve the existing fallback depth of one.

- [x] **Step 6: Wire capability and budget checks into preflight**

Run after speaker validation but before `jobStore.save`. Map unknown capability to HTTP 503 and no-fit input to HTTP 422. Add orchestrator interaction assertions proving job store, cost, and queue are untouched for both failures.

- [x] **Step 7: Align the legacy import validator's highlight cardinality**

Change the existing validator from the divergent `3..10` check to the canonical `1..6` schema contract and update its tests. This prevents the grounded projector from producing a snapshot that one layer accepts and another rejects.

- [x] **Step 8: Run focused and orchestrator regression tests**

```bash
./server/gradlew -p server unitTest --tests '*GroundedGenerationSchemaResourceTest' --tests '*DefaultGroundedRequestRendererTest' --tests '*GroundedInputBudgetGuardTest' --tests '*DefaultSessionImportV1ValidatorTest' --tests '*AiGenerationOrchestratorTest'
```

Expected: PASS and no network access in any budget test.

- [x] **Step 9: Commit the request-contract slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/main/resources/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): guard grounded whole transcript requests"
```

---

### Task 5: Add whole-transcript grounded adapters for all enabled providers

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/WholeTranscriptGroundedGenerator.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiWholeTranscriptGroundedGenerator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiWholeTranscriptGroundedGeneratorTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/claude/ClaudeWholeTranscriptGroundedGenerator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/claude/ClaudeWholeTranscriptGroundedGeneratorTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiWholeTranscriptGroundedGenerator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiWholeTranscriptGroundedGeneratorTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClient.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/FakeOpenAiApi.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/claude/ClaudeApiPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/claude/ClaudeApiClient.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/claude/FakeClaudeApi.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClient.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/FakeGeminiApi.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiSchemaCompatAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt`

**Interfaces:**
- Consumes `RenderedGroundedRequest` unchanged from Task 4.
- Produces `GroundedGenerationOutput(draft, usage)` for primary calls and `GroundedSectionRepairOutput` for one section repair.
- Keeps legacy `SessionContentGenerator` and `SessionContentRegenerator` beans operational under `LEGACY`.
- Passes `maxOutputTokens=16_384` through every provider client instead of the existing hard-coded 4,096.

- [x] **Step 1: Define and test the provider-neutral grounded port**

```kotlin
interface WholeTranscriptGroundedGenerator {
    val provider: Provider

    fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput

    fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput
}
```

The repair output type must make it impossible to replace a different section accidentally.

- [x] **Step 2: Write one contract-equivalent adapter suite per provider**

For OpenAI, Claude, and Gemini assert:

- the exact renderer bytes reach the fake API;
- structured output/schema is enabled;
- `16_384` reaches the API request;
- the full transcript is present in primary and repair calls;
- primary JSON parses into all four sections;
- repair schema contains only the requested section but the user request still includes full context;
- transcript prompt-injection sentinels remain inside the data delimiter and host instructions cannot relax membership, evidence, schema, or PII invariants;
- provider rate limit, availability, malformed JSON, and I/O errors map to safe application errors;
- a raw provider failure containing a transcript snippet is removed by `LlmErrorMapper` before any wire/audit value;
- no prompt/transcript value is included in thrown messages.

- [x] **Step 3: Run all three new suites and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*WholeTranscriptGroundedGeneratorTest'
```

Expected: FAIL because the new port and adapters do not exist.

- [x] **Step 4: Extend API ports with explicit output limits**

Use a parameter object where provider signatures would otherwise diverge:

```kotlin
data class StructuredGenerationRequest(
    val model: String,
    val systemText: String,
    val userText: String,
    val schemaJson: String,
    val maxOutputTokens: Int,
)
```

Update legacy callers to pass their previous effective 4,096 behavior so legacy output does not silently change. Grounded callers pass 16,384.

- [x] **Step 5: Implement separate grounded adapters**

Deserialize with the shared Jackson configuration. Apply `GeminiSchemaCompatAdapter` to the grounded schema only at the Gemini boundary; do not change the source schema or the renderer's budgeted bytes after the budget check. If the compatibility transformation changes request size materially, expose the provider-specific serialized schema from the renderer before budgeting so the exact-byte invariant remains true.

- [x] **Step 6: Register provider maps by mode**

Wire `Map<Provider, WholeTranscriptGroundedGenerator>` separately from the existing legacy maps. Startup validation must fail when grounded mode enables a provider without a grounded generator bean.

- [x] **Step 7: Run provider and legacy regressions**

```bash
./server/gradlew -p server unitTest --tests '*WholeTranscriptGroundedGeneratorTest' --tests '*ContentGeneratorTest' --tests '*ContentRegeneratorTest' --tests '*GeminiSchemaCompatAdapterTest'
```

Expected: PASS for all grounded and legacy adapters; live-contract tests remain opt-in and are not run without provider keys.

- [x] **Step 8: Commit the provider adapter slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): add grounded whole transcript providers"
```

---

### Task 6: Validate grounded output and project server-owned evidence

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedGenerationValidator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedGenerationValidatorTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedEvidenceProjector.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedEvidenceProjectorTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`

**Interfaces:**
- Consumes a grounded provider draft plus current validated transcript turns and session metadata.
- Produces an existing `SessionImportV1Snapshot` plus `GroundedEvidenceBundle` only when every section is valid.
- Produces exactly one safe invalid-section classification for the worker's one repair opportunity.

- [x] **Step 1: Write validator truth-table tests**

Cover:

- exact session number/book/date/format;
- 1–6 highlights;
- exactly one one-line review per unique transcript speaker, no extras or duplicates;
- real author names only and exact normalized membership identity;
- nonempty evidence IDs on every summary paragraph, highlight, one-line review, and top-level feedback section;
- every evidence ID exists in current turns and, for authored items, references at least one turn by the same author;
- feedback marker/header/template construction;
- deterministic rejection of email, phone, and resident-registration-number patterns in generated text;
- multiple invalid sections produce a terminal validation failure rather than multiple repairs.

- [x] **Step 2: Write evidence projection boundary tests**

```kotlin
@Test
fun `projects target ids from revision section and ordinal`() {
    assertThat(bundle.targets.first().targetId).isEqualTo("r1:SUMMARY:0")
}

@Test
fun `excerpt is server sourced sanitized and limited by Unicode code points`() { /* max 240 */ }

@Test
fun `model supplied text cannot become an evidence excerpt`() { /* source turn wins */ }
```

Also test emoji/supplementary-plane truncation, control-character removal, duplicate evidence ID de-duplication, invalid turn IDs, and stable first-seen ordering.

- [x] **Step 3: Run validator/projector suites and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*GroundedGenerationValidatorTest' --tests '*GroundedEvidenceProjectorTest'
```

Expected: FAIL because validator/projector do not exist.

- [x] **Step 4: Implement validation as a pure service**

Return a sealed result rather than throwing during intermediate classification:

```kotlin
sealed interface GroundedValidationResult {
    data class Valid(
        val snapshot: SessionImportV1Snapshot,
        val evidence: GroundedEvidenceBundle,
    ) : GroundedValidationResult

    data class Repairable(
        val section: GenerationItem,
        val reasons: Set<GroundingFailureReason>,
    ) : GroundedValidationResult

    data class Invalid(
        val reasons: Set<GroundingFailureReason>,
    ) : GroundedValidationResult
}
```

Reason values are safe enums suitable for aggregate audit/metrics. Never carry generated text or names in reason messages.

Keep deterministic PII checks centralized and test boundary/nonmatch cases. Start with explicit patterns equivalent to email `(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b`, Korean phone `(?<!\\d)(?:01[016789]|0[2-6][1-5]?)[ -]?\\d{3,4}[ -]?\\d{4}(?!\\d)`, and resident-registration number `(?<!\\d)\\d{6}[ -]?[1-4]\\d{6}(?!\\d)`. Do not echo the matched value in errors.

- [x] **Step 5: Build final snapshot content on the server**

Join summary blocks with stable paragraph separators. Construct feedback markdown with the existing required marker/header and validated section headings rather than trusting a model-supplied complete document. Preserve the existing `SessionImportV1Snapshot` boundary for downstream commit compatibility.

- [x] **Step 6: Implement evidence targets and excerpts**

```kotlin
data class EvidenceTarget(
    val targetId: String,
    val section: GenerationItem,
    val ordinal: Int,
    val turnIds: List<String>,
)

data class EvidenceExcerpt(
    val turnId: String,
    val speakerName: String,
    val startSeconds: Int,
    val excerpt: String,
    val truncated: Boolean,
)
```

Use `offsetByCodePoints` or an equivalent code-point-safe helper. Default excerpts are 240 code points; longer expansion is handled by the API task and still resolves from the source turn.

- [x] **Step 7: Rerun the focused suites**

```bash
./server/gradlew -p server unitTest --tests '*GroundedGenerationValidatorTest' --tests '*GroundedEvidenceProjectorTest' --tests '*DefaultSessionImportV1ValidatorTest'
```

Expected: PASS and every failure report contains safe enums only.

- [x] **Step 8: Commit the grounding slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): validate drafts and project source evidence"
```

---

### Task 7: Persist turns, evidence, result, revision, and commit lease with Redis CAS

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationConditionalLoadingTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicyTest.kt`

**Interfaces:**
- Stores safe metadata in `aigen:job:{jobId}` and exactly four payloads in `:transcript`, `:turns`, `:result`, and `:evidence`.
- Produces revision-aware atomic save/regenerate/commit transitions.
- Adds nonterminal `COMMIT_RETRY` and a bounded commit lease.
- Cleans every payload on commit/cancel and all five job keys during stale-job deletion.

- [x] **Step 1: Write Redis key/TTL and conditional-loading tests**

Assert:

- all four payload keys receive the same six-hour TTL as the hash;
- `load` conditionally fetches result/evidence only for reviewable states and transcript/turns only for worker/regeneration/commit needs;
- grounded hash fields never contain transcript, turn text, result JSON, evidence excerpts, member names, prompt metadata, or host instructions;
- Kafka message remains `{jobId}` only;
- commit/cancel cleanup deletes all four payloads but leaves the safe terminal hash until expiry;
- stale deletion removes hash and all four payloads;
- absent/expired payloads map to `JOB_EXPIRED` without partial exposure.

- [x] **Step 2: Write revision CAS and lease race tests**

```kotlin
@Test
fun `grounded save changes RUNNING to SUCCEEDED and revision zero to one atomically`() { /* CAS */ }

@Test
fun `regeneration requires expected revision and increments it once`() { /* stale caller loses */ }

@Test
fun `only one commit caller acquires the same revision lease`() { /* one winner */ }

@Test
fun `expired commit lease can move to COMMIT_RETRY without deleting payloads`() { /* recoverable */ }
```

- [x] **Step 3: Run Redis tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*RedisAiGenerationJobStoreTest' --tests '*RedisAiGenerationConditionalLoadingTest' --tests '*AiGenerationJobTransitionPolicyTest'
```

Expected: FAIL because revision/evidence/turn keys and lease operations are absent.

- [x] **Step 4: Extend the job record with metadata-only grounded state**

Add fields equivalent to:

```kotlin
data class JobRecord(
    // existing fields
    val pipelineMode: AiGenerationPipelineMode,
    val revision: Long,
    val eligibleFallbackModels: List<ModelId>,
    val groundingStatus: GroundingStatus?,
    val cleanupPending: Boolean,
    val commitLeaseExpiresAt: Instant?,
)
```

`turns`, `result`, and `evidence` remain transient loaded properties or a separate payload aggregate; they must not serialize into the hash. Store a `GroundedSourceContext` envelope containing validated turns, prompt-required session metadata, and optional host instructions under the TTL-bound `:turns` payload, while the normalized raw file remains under `:transcript`. Avoid adding large nullable fields to every ops query if a purpose-specific `GroundedJobPayload` is clearer. Keep legacy hash deserialization compatible for active six-hour jobs, but do not write sensitive legacy `sessionMeta`/`instructions` fields for grounded jobs and remove those fields during terminal cleanup when present.

- [x] **Step 5: Add explicit atomic store operations**

Prefer request objects for multi-field CAS operations:

```kotlin
data class SaveGroundedResultCommand(
    val jobId: UUID,
    val expectedStatus: JobStatus,
    val expectedRevision: Long,
    val result: SessionImportV1Snapshot,
    val evidence: GroundedEvidenceBundle,
    val usage: TokenUsage,
    val cost: BigDecimal,
    val actualModel: ModelId,
)

sealed interface CommitLeaseResult {
    data class Acquired(val revision: Long) : CommitLeaseResult
    data class AlreadyCommitting(val leaseExpiresAt: Instant) : CommitLeaseResult
    data object RevisionConflict : CommitLeaseResult
    data object NotReady : CommitLeaseResult
}
```

Also expose CAS operations `markCommittedForCleanup(jobId, revision)`, `deleteTransientPayload(jobId)`, and `markCleanupComplete(jobId, revision)`. Implement Lua scripts that check status and revision, write payloads, increment revision, set TTLs, and update hash metadata atomically. Never use load-then-write for revision, lease, terminal status, or cleanup decisions.

- [x] **Step 6: Update transition policy and browser actions**

`COMMIT_RETRY` is nonterminal and permits poll, explicit safe retry, and scheduler recovery. It is not cancellable after a MySQL receipt may exist. `COMMITTING` permits poll only. Keep `FAILED`, `CANCELLED`, and `COMMITTED` terminal.

- [x] **Step 7: Rerun Redis and transition suites**

```bash
./server/gradlew -p server unitTest --tests '*RedisAiGenerationJobStoreTest' --tests '*RedisAiGenerationConditionalLoadingTest' --tests '*AiGenerationJobTransitionPolicyTest'
```

Expected: PASS, including race and TTL assertions against the real Redis test fixture.

- [x] **Step 8: Commit the Redis state-machine slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): persist grounded jobs with revision CAS"
```

---

### Task 8: Execute one whole-transcript call, one repair, and revision-aware regeneration

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/ProviderFallbackChain.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerFailoverTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`

**Interfaces:**
- Grounded start stores normalized transcript, validated turns, selected model, and precomputed eligible fallbacks before enqueue.
- Worker makes one primary full-context call; only one repair call is allowed when exactly one section is repairable.
- Availability/rate-limit failover may retry only the precomputed full-context-compatible model list and always sends the full transcript.
- Regeneration requires `expectedRevision`, regenerates one section using full transcript/current draft, and atomically increments revision.

- [x] **Step 1: Write the worker call-count and exposure tests**

```kotlin
@Test
fun `valid grounded draft uses one provider call and saves all sections with evidence`() { /* 1 */ }

@Test
fun `one repairable section gets one full-context repair and then succeeds`() { /* 2 */ }

@Test
fun `repair failure never exposes the invalid draft`() { /* FAILED, no result/evidence */ }

@Test
fun `two invalid sections fail without repair`() { /* only primary call */ }
```

Also pin cancellation races before call, after call, and before result CAS.

- [x] **Step 2: Write failover tests using precomputed candidates**

Prove an unavailable primary retries only an eligible candidate, preserves the exact rendered full transcript, attributes actual model/cost correctly, and fails safely without consulting newly enabled/unverified models after dequeue.

- [x] **Step 3: Write revision-aware regeneration tests**

Assert:

- matching revision regenerates exactly one section with the whole transcript and increments revision;
- stale revision returns conflict and makes no provider call;
- regenerated evidence replaces only the target section's evidence under the new revision;
- every section review confirmation is reset client-side by the returned revision contract;
- max-call cap and cost guard still apply.

- [x] **Step 4: Run worker/regeneration tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationWorkerTest' --tests '*AiGenerationWorkerFailoverTest' --tests '*AiGenerationRegenerationServiceTest' --tests '*AiGenerationOrchestratorTest'
```

Expected: FAIL because grounded dispatch and revision-aware operations are not wired.

- [x] **Step 5: Dispatch workers by persisted pipeline mode**

Keep the legacy algorithm in a named method/service and add a grounded branch. Do not infer mode from result shape or current environment after dequeue; use the mode persisted in the job.

Grounded worker sequence:

```text
PENDING --CAS--> RUNNING
load transcript + turns + exact rendered request metadata
increment call count
primary provider call
validate
if exactly one repairable section:
  increment call count
  full-context section repair
  replace only that section
  validate complete draft again
project result + evidence
RUNNING/revision 0 --CAS payload save--> SUCCEEDED/revision 1
```

If availability fallback produced the draft, run any validation repair on that same actual provider. Both availability attempts and repair attempts increment the existing atomic per-job call counter before calling; if the cap has no remaining slot, return `MAX_CALLS_EXCEEDED` without repair.

Add grounded stages `PREPARING_TRANSCRIPT`, `GENERATING_RECORD`, `VALIDATING_GROUNDING`, and `REPAIRING_RECORD`, then finish at the existing `READY`. Keep every legacy `JobStage` enum value deserializable until all six-hour Redis jobs created by the previous release have expired; the browser must render unknown future values as generic progress.

- [x] **Step 6: Preserve strict failure and privacy behavior**

Map invalid final output to `SCHEMA_INVALID` plus aggregate reason labels. Do not save partial provider output. Do not include draft text, turn IDs, speaker names, or provider response bodies in error/audit/metric fields.

- [x] **Step 7: Implement revision-aware regeneration**

Extend the input contract:

```kotlin
data class RegenerateItemCommand(
    val sessionId: UUID,
    val jobId: UUID,
    val item: GenerationItem,
    val expectedRevision: Long,
    val model: String?,
    val instructions: String?,
)

data class RegenerationResult(
    val revision: Long,
    val result: SessionImportV1Snapshot,
    val evidence: GroundedEvidenceBundle,
    val tokens: TokenUsage,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
)
```

Use the store CAS from Task 7. Return the full new result/evidence so the browser cannot merge incompatible revisions.

- [x] **Step 8: Rerun unit and consumer integration tests**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationWorkerTest' --tests '*AiGenerationWorkerFailoverTest' --tests '*AiGenerationRegenerationServiceTest' --tests '*AiGenerationOrchestratorTest'
./server/gradlew -p server integrationTest --tests '*AiGenerationJobConsumerIntegrationTest'
```

Expected: PASS; legacy worker/regeneration tests stay green under default `LEGACY`.

- [x] **Step 9: Commit the pipeline execution slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): run grounded generation with one repair"
```

---

### Task 9: Expose revisioned results, evidence expansion, review contracts, and typed errors

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`

**Interfaces:**
- Job response returns `revision`, result, evidence targets/excerpts, grounding status, and warnings only for a fully valid current revision.
- Evidence expansion endpoint resolves one already-referenced turn from Redis and never accepts free-form search.
- Regenerate/commit requests carry `expectedRevision`.
- Start errors preserve safe `invalidSpeakerLabels`; all other errors remain content-free.

- [ ] **Step 1: Write the status response contract tests**

Use the following browser-facing structure:

```kotlin
data class GroundedJobResultResponse(
    val revision: Long,
    val result: SessionImportV1SnapshotResponse,
    val evidence: List<EvidenceTargetResponse>,
    val groundingStatus: String,
    val sectionReviewStatuses: Map<GenerationItem, String>,
    val warnings: List<String>,
)
```

Assert result/evidence are absent in PENDING/RUNNING/FAILED and present together in SUCCEEDED. Grounded responses use `PENDING`, `VALID`, or `INVALID` grounding status and initialize all four server review statuses to `PENDING_REVIEW` for each new revision; the browser overlays its local review state but the server never trusts that overlay. A missing evidence payload for a grounded SUCCEEDED job is `JOB_EXPIRED`, not a partially reviewable success.

- [ ] **Step 2: Write evidence expansion authorization and scope tests**

Proposed endpoint:

```text
GET /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}/evidence/{turnId}?revision={revision}
```

Assert host/session ownership, current revision equality, SUCCEEDED state, and the turn ID's presence in at least one current evidence target. Reject arbitrary current turns, previous-revision turns, and unknown turns. Return a bounded expanded excerpt rather than the whole transcript.

- [ ] **Step 3: Write typed error status tests**

Pin:

- `TRANSCRIPT_SPEAKER_NOT_MEMBER`, `TRANSCRIPT_SPEAKER_AMBIGUOUS` -> 422 plus submitted labels;
- `TRANSCRIPT_FORMAT_INVALID`, `TRANSCRIPT_EMPTY`, `TRANSCRIPT_DURATION_EXCEEDED`, `TRANSCRIPT_TOO_LONG_FOR_MODEL`, `TRANSCRIPT_ALIAS_MODE_UNSUPPORTED` -> 422;
- `MODEL_CAPABILITY_UNAVAILABLE` -> 503;
- `STALE_GENERATION_REVISION`, `MEMBERSHIP_CHANGED` -> 409 with safe metadata only;
- `JOB_EXPIRED` -> 410;
- no response contains member candidates, provider bodies, transcript snippets, or internal exception text.

- [ ] **Step 4: Run controller/error tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationControllerTest' --tests '*AiGenerationErrorHandlerTest'
```

Expected: FAIL because grounded DTOs and evidence endpoint are incomplete.

- [ ] **Step 5: Add review and commit input models**

```kotlin
enum class SectionReviewStatus {
    AI_GROUNDED_REVIEWED,
    USER_EDITED_CONFIRMED,
}

data class CommitGenerationRequest(
    val expectedRevision: Long,
    val sectionReviews: Map<GenerationItem, SectionReviewStatus>,
    val result: SessionImportV1SnapshotResponse,
    val recordVisibility: SessionRecordVisibility,
)
```

Require exactly the four `GenerationItem` keys. Do not accept `PENDING`, missing, or unknown review values.

- [ ] **Step 6: Implement safe evidence expansion**

Use an application use case so the controller never reads Redis directly. Resolve and return the full sanitized text of that one referenced source turn; the 1 MiB upload limit is the outer response bound. Do not return neighboring turns or accept a caller-selected range/limit. Record only an aggregate counter if observability is needed.

- [ ] **Step 7: Remove alias acceptance**

Keep multipart `authorNameMode` optional/defaulted to `REAL` only if old clients require compatibility. An explicit `ALIAS` value returns `TRANSCRIPT_ALIAS_MODE_UNSUPPORTED` before parsing or side effects. Update controller and integration tests accordingly.

- [ ] **Step 8: Update public-safe API integration coverage**

Replace old unstructured test transcripts with synthetic supported exports. Add assertions for valid start, invalid-speaker early 422/no job, grounded successful poll response, expansion scope, stale revision, and real-name-only behavior.

- [ ] **Step 9: Run web and integration gates**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationControllerTest' --tests '*AiGenerationErrorHandlerTest'
./server/gradlew -p server integrationTest --tests '*AiGenerateApiIntegrationTest'
```

Expected: PASS with no private data in fixtures or test output.

- [ ] **Step 10: Commit the grounded HTTP contract slice**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): expose revisioned grounded review APIs"
```

---

### Task 10: Make commit participant-complete and crash-recoverable

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V37__grounded_ai_generation.sql`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationCommitPersistencePort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationCommitPersistenceAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationCommitPersistenceAdapterTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationPostCommitCleanupService.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationPostCommitCleanupServiceTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`

**Interfaces:**
- A valid transcript speaker who is an active club member but not a session participant is inserted/reactivated as `GOING`, `ATTENDED`, `ACTIVE` in the commit transaction.
- MySQL transaction performs participant upserts, existing `commitValidated`, and content-free receipt insert atomically.
- Redis lease precedes the MySQL transaction; Redis finalization/cleanup follows the committed transaction.
- Receipt `(job_id, revision)` makes repeated commit and crash recovery idempotent.

- [ ] **Step 1: Write the Flyway migration**

Create a content-free receipt table and additive audit columns:

```sql
CREATE TABLE ai_generation_commit_receipts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    job_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
    revision BIGINT NOT NULL,
    session_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
    club_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
    committed_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_aigen_commit_receipt_job_revision (job_id, revision),
    KEY idx_aigen_commit_receipt_committed_at (committed_at)
) ENGINE=InnoDB;
```

Add nullable/defaulted aggregate columns to `ai_generation_audit_log`: `pipeline_version`, `input_turn_count`, `speaker_count`, `grounding_status`, `grounding_warning_count`, `reviewed_section_count`, and `user_edited_section_count`. Do not add transcript/result/evidence/name columns.

Migrate stored `ai_generation_club_defaults.default_model = 'gemini-3-flash'` to `gemini-3-flash-preview` in the same migration.

- [ ] **Step 2: Write persistence adapter tests**

Assert:

- missing participant is inserted with `rsvp_status=GOING`, `attendance_status=ATTENDED`, and `participation_status=ACTIVE`;
- removed/inactive session participant for an active club member is reactivated to those values;
- existing active participant becomes attended without duplicate rows;
- another-club, inactive, or renamed membership cannot be upserted even if application input is forged;
- receipt contains identifiers/timestamp only and duplicate `(jobId, revision)` is idempotently detectable.

- [ ] **Step 3: Write commit review/diff tests**

Pin server-side enforcement:

- submitted result identical to Redis snapshot requires every section `AI_GROUNDED_REVIEWED`;
- edited section requires `USER_EDITED_CONFIRMED` while unchanged sections remain grounded-reviewed;
- falsely claiming grounded review for an edited section rejects;
- falsely claiming user edit for an unchanged section rejects;
- missing/extra section review rejects;
- `expectedRevision` mismatch rejects before lease/DB writes;
- grounded override validation uses the persisted validated transcript speaker allowlist rather than the legacy `SessionMeta.expectedAuthorNames` derived from current session participants;
- an active transcript speaker who was not yet a session participant passes grounded validation, while an edited author name outside the transcript speaker set rejects;
- participant upsert happens before `commitValidated` within the same DB transaction;
- a speaker membership that became inactive or whose current normalized display name no longer matches returns `MEMBERSHIP_CHANGED` before content writes;
- import or receipt failure rolls back participant changes and session content.

- [ ] **Step 4: Write crash-window recovery tests**

Cover these state transitions:

```text
Redis SUCCEEDED + no receipt -> acquire lease -> DB transaction -> receipt
receipt committed + Redis COMMITTING -> mark COMMITTED -> invalidate cache and clean payloads
no receipt + expired lease -> COMMIT_RETRY, payloads retained
receipt already exists + repeated commit -> content-free COMMITTED response, no re-import
cache invalidation or Redis payload deletion failure after receipt -> COMMITTED + cleanupPending=true, cleanup-only recovery converges
```

- [ ] **Step 5: Run persistence/commit/recovery tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationCommitServiceTest' --tests '*AiGenerationCommitRecoveryServiceTest' --tests '*AiGenerationPostCommitCleanupServiceTest' --tests '*AiGenerationOpsServiceTest'
./server/gradlew -p server integrationTest --tests '*JdbcAiGenerationCommitPersistenceAdapterTest'
```

Expected: FAIL because the port, receipt, transaction coordinator, and recovery service do not exist.

- [ ] **Step 6: Implement the explicit transaction boundary**

Branch commit validation by the job's persisted pipeline mode. `LEGACY` keeps `DefaultSessionImportV1Validator`; `GROUNDED_WHOLE_TRANSCRIPT` validates metadata, cardinalities, author names, and edited content against `GroundedSourceContext` before taking a lease. Inject `TransactionTemplate`; do not annotate the full cross-store method with `@Transactional`:

```kotlin
val lease = jobStore.acquireCommitLease(jobId, expectedRevision, now, leaseDuration)
val transactionResult = transactionTemplate.execute {
    val participantUpdatesCount =
        commitPersistence.upsertTranscriptSpeakersAsParticipants(validatedTurns)
    val importResult = commitDelegate.commitValidated(validatedInput)
    commitPersistence.insertReceipt(jobId, expectedRevision, sessionId, clubId, now)
    CommitTransactionResult(importResult, participantUpdatesCount)
} ?: error("transaction returned no result")

jobStore.markCommittedForCleanup(jobId, expectedRevision)
postCommitCleanup.cleanup(jobId, expectedRevision, clubId)
return CommitGenerationResult(
    sessionId = sessionId,
    status = JobStatus.COMMITTED,
    recovered = false,
    participantUpdatesCount = transactionResult.participantUpdatesCount,
)
```

Wrap only the MySQL block so a transaction failure atomically moves the still-current Redis lease to `COMMIT_RETRY` while retaining payloads. The existing session-import cache invalidation registration remains unchanged and fail-open. After the transaction, the AI cleanup service explicitly calls the idempotent shared cache eviction again, deletes all four Redis payloads, and clears `cleanupPending` only after both succeed. If either cleanup action fails, keep `COMMITTED`/`cleanupPending` recoverable from the receipt rather than re-running import.

- [ ] **Step 7: Return a content-free AI commit response**

Replace the AI endpoint's alias to the full session import response with:

```kotlin
data class CommitGenerationResult(
    val sessionId: UUID,
    val status: JobStatus,
    val recovered: Boolean,
    val participantUpdatesCount: Int?,
)
```

The response stays content-free while allowing an immediate host-facing completion summary that makes automatic participant registration visible. A receipt-based recovered response returns `participantUpdatesCount=null` and the UI uses a generic “참여자 상태를 포함해 저장됨” summary rather than inventing a count. Never add this count or participant names to the receipt.

- [ ] **Step 8: Add bounded scheduled and operator recovery**

The scheduler loads a limited set of stale `COMMITTING`/`COMMIT_RETRY` jobs plus `COMMITTED` hashes with `cleanupPending=true`, checks content-free receipts, and converges state. Receipt-backed jobs execute only status finalization and the idempotent cleanup service. It never loads or prints transcript/result/evidence. Adapt `AiGenerationOpsService.retryCommit` to trigger the same recovery service; do not merely change `COMMITTING` back to `SUCCEEDED`. Update ops audit status conversion/exhaustive `when` branches for `COMMIT_RETRY`. Controller/DTO tests must prove platform-admin list/detail/retry responses remain metadata-only and never expose payload keys, names, or content.

- [ ] **Step 9: Run commit and vertical integration gates**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationCommitServiceTest' --tests '*AiGenerationCommitRecoveryServiceTest' --tests '*AiGenerationPostCommitCleanupServiceTest' --tests '*AiGenerationOpsServiceTest' --tests '*AiGenerationOpsControllerTest' --tests '*JdbcAiGenerationOpsAuditRepositoryTest' --tests '*AiGenerationJobTransitionPolicyTest'
./server/gradlew -p server integrationTest --tests '*JdbcAiGenerationCommitPersistenceAdapterTest' --tests '*AiGenerateApiIntegrationTest'
```

Expected: PASS, including transaction rollback and post-commit recovery scenarios.

- [ ] **Step 10: Commit the crash-recoverable commit slice**

```bash
git add server/src/main/resources/db/mysql/migration/V37__grounded_ai_generation.sql server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): recover grounded session commits"
```

---

### Task 11: Update the browser API, upload flow, dynamic models, and typed preflight errors

**Files:**
- Modify: `front/features/host/aigen/api/aigen-contracts.ts`
- Modify: `front/features/host/aigen/api/aigen-api.ts`
- Modify: `front/features/host/aigen/api/aigen-api.test.ts`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.ts`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.ts`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`
- Modify: `front/features/host/aigen/ui/TranscriptUploadForm.tsx`
- Modify: `front/features/host/aigen/ui/TranscriptUploadForm.test.tsx`
- Remove: `front/features/host/aigen/ui/aigen-model-options.ts`
- Modify: `front/features/host/aigen/ui/GenerationProgressView.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`

**Interfaces:**
- Browser loads model choices from the authorized session model-list endpoint.
- Upload submits `.txt` plus optional model/instructions through the existing multipart BFF path and no longer sends `authorNameMode`.
- A dedicated AI API error preserves `code`, safe `detail`, invalid speaker labels, and current revision where applicable.
- Polling recognizes grounded `revision`, result/evidence, and `COMMIT_RETRY` without exposing partial drafts.

- [ ] **Step 1: Write TypeScript contract fixtures first**

Define discriminated types:

```ts
export type AiGenerationErrorCode =
  | "TRANSCRIPT_SPEAKER_NOT_MEMBER"
  | "TRANSCRIPT_SPEAKER_AMBIGUOUS"
  | "TRANSCRIPT_FORMAT_INVALID"
  | "TRANSCRIPT_EMPTY"
  | "TRANSCRIPT_DURATION_EXCEEDED"
  | "TRANSCRIPT_TOO_LONG_FOR_MODEL"
  | "TRANSCRIPT_ALIAS_MODE_UNSUPPORTED"
  | "MODEL_CAPABILITY_UNAVAILABLE"
  | "STALE_GENERATION_REVISION"
  | "MEMBERSHIP_CHANGED"
  | "JOB_EXPIRED"
  | string;

export interface AiGenerationProblem {
  code: AiGenerationErrorCode;
  detail: string;
  invalidSpeakerLabels?: string[];
  currentRevision?: number;
}
```

Add `revision`, evidence target/excerpt, review state, grounded warnings, content-free commit result, and dynamic model-list contracts. Keep nullable fields aligned with server status invariants.

- [ ] **Step 2: Write API client tests and verify typed failures**

Assert:

- model list uses the session-scoped URL;
- multipart contains the exact TXT blob, model, and instructions and omits `authorNameMode`;
- a 422 JSON response retains safe invalid speaker labels;
- non-JSON/untrusted failures become a generic safe detail;
- grounded polling parses revision/evidence only when complete;
- regeneration and commit serialize `expectedRevision`;
- evidence expansion path URL-encodes IDs and revision.

- [ ] **Step 3: Write BFF preservation regression tests**

Extend `front/tests/unit/cloudflare-bff.test.ts` to prove the current proxy:

- preserves multipart bytes and boundary;
- returns the upstream 422 status and JSON body with `invalidSpeakerLabels` unchanged;
- does not log/read/rewrite the transcript body;
- preserves existing authorization, request ID, BFF secret, and safe response headers.

No production BFF change is expected unless this test exposes an actual contract loss.

- [ ] **Step 4: Run frontend API/BFF tests and verify RED**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/aigen/api/aigen-api.test.ts tests/unit/cloudflare-bff.test.ts --reporter=dot
```

Expected: FAIL because the grounded contracts and model list are not implemented.

- [ ] **Step 5: Implement the AI-specific safe error class**

Do not broaden the generic `ReadmatesApiError` with feature-specific data unless other consumers genuinely need it:

```ts
export class AiGenerationApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: AiGenerationProblem,
  ) {
    super(problem.detail);
  }
}
```

Validate response shape before trusting it. Cap invalid label count and individual label length defensively in the client even though the server already bounds them.

- [ ] **Step 6: Replace hard-coded model options with the server list**

Fetch on tab entry after session authorization. Show a retryable model-list error without enabling submit. Use the returned default, preserve the host's current choice while still present, and stop calling the separate club-default query from `AiGenerateTab` because the session-scoped model response already carries the authorized default. Keep the club-default administration endpoint itself intact. Remove `aigen-model-options.ts` only after no imports remain.

- [ ] **Step 7: Make upload correction explicit**

The form accepts `.txt` only and communicates the supported `이름 MM:SS` shape. On invalid speakers, render a concise error panel:

```text
멤버로 확인되지 않은 화자가 있습니다: [safe labels]
텍스트의 화자 이름을 현재 활성 멤버 이름과 같게 수정한 뒤 다시 업로드해 주세요.
```

Do not suggest fuzzy candidates or expose the club roster. Keep the selected file local; do not auto-resubmit after correction.

- [ ] **Step 8: Update progress/recovery states**

Handle `COMMIT_RETRY` as a visible “커밋 확인 중” recoverable state with poll/retry guidance, not a generation failure. Keep invalid or partial result fields inaccessible. Existing recent-job recovery must use persisted revision and grounded status.

- [ ] **Step 9: Rerun frontend feature tests**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/aigen tests/unit/cloudflare-bff.test.ts --reporter=dot
```

Expected: PASS; no hard-coded Gemini ID or alias UI remains.

- [ ] **Step 10: Commit the browser upload/API slice**

```bash
git add front/features/host/aigen front/tests/unit/cloudflare-bff.test.ts
git commit -m "feat(aigen): add validated transcript upload flow"
```

---

### Task 12: Build the review ledger, evidence panel/drawer, edit semantics, and commit gate

**Files:**
- Create: `front/features/host/aigen/model/aigen-review-state.ts`
- Create: `front/features/host/aigen/model/aigen-review-state.test.ts`
- Create: `front/features/host/aigen/ui/ReviewLedger.tsx`
- Create: `front/features/host/aigen/ui/ReviewLedger.test.tsx`
- Create: `front/features/host/aigen/ui/EvidencePanel.tsx`
- Create: `front/features/host/aigen/ui/EvidencePanel.test.tsx`
- Create: `front/features/host/aigen/ui/EvidenceDrawer.tsx`
- Create: `front/features/host/aigen/ui/EvidenceDrawer.test.tsx`
- Modify: `front/features/host/aigen/ui/PreviewView.tsx`
- Modify: `front/features/host/aigen/ui/sections/SummarySection.tsx`
- Modify: `front/features/host/aigen/ui/sections/HighlightsSection.tsx`
- Modify: `front/features/host/aigen/ui/sections/OneLineReviewsSection.tsx`
- Modify: `front/features/host/aigen/ui/sections/FeedbackDocumentSection.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx`
- Modify: `front/features/host/aigen/storage/aigen-draft-storage.ts`
- Modify: `front/features/host/aigen/storage/aigen-draft-storage.test.tsx`
- Modify: `front/features/host/aigen/ui/RegenerateModal.tsx`
- Modify: `front/features/host/aigen/ui/RegenerateModal.test.tsx`

**Interfaces:**
- Desktop shows result editor + persistent review ledger + evidence side panel.
- Mobile shows result editor + evidence trigger/drawer without hiding commit/review state.
- Pure review state derives changed sections from immutable server snapshot versus current draft.
- Commit is enabled only when all four section review states satisfy the server contract for the current revision.

- [ ] **Step 1: Write the pure review state-machine tests**

Model the four sections explicitly:

```ts
export type ReviewSection =
  | "SUMMARY"
  | "HIGHLIGHTS"
  | "ONE_LINE_REVIEWS"
  | "FEEDBACK_DOCUMENT";

export type SectionReviewState =
  | "PENDING"
  | "AI_GROUNDED_REVIEWED"
  | "USER_EDITED_REVIEW_REQUIRED"
  | "USER_EDITED_CONFIRMED";
```

Tests must prove:

- every new revision starts all four sections `PENDING`;
- an unchanged section may become `AI_GROUNDED_REVIEWED`;
- first content edit makes the section `USER_EDITED_REVIEW_REQUIRED`, clears a changed target if selected, and adds that block's target ID to `invalidatedTargetIds`;
- edits to one highlight/one-line item preserve evidence access for unchanged sibling targets, while an ambiguous paragraph/feedback structure edit invalidates every target in that section;
- edited section requires explicit confirmation to become `USER_EDITED_CONFIRMED`;
- reverting byte-for-byte to the server snapshot returns to `PENDING`, not automatically reviewed;
- regeneration changes revision and resets every section, not just the regenerated one;
- section equality is based on canonical field structure, not rendered HTML or object identity;
- commit payload has exactly four server enum keys.

- [ ] **Step 2: Write ledger/evidence component tests**

Assert keyboard and screen-reader behavior along with visuals:

- ledger identifies current section, pending/reviewed/edited states, counts 0–4, and navigates to the section;
- evidence panel lists the selected target's server excerpts with speaker/timestamp and truncation affordance;
- review workspace explains that linked turns verify source identity but the host must judge whether they semantically support the AI sentence;
- expanded excerpt requests only the selected current-revision turn;
- edited blocks show “직접 수정됨 — AI 근거 비활성” and make only invalidated target controls unavailable;
- no evidence target shows a generic empty state rather than implying grounding;
- mobile drawer traps/restores focus, closes with Escape/backdrop, and labels its source target.

- [ ] **Step 3: Run state/component tests and verify RED**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/aigen/model/aigen-review-state.test.ts features/host/aigen/ui/ReviewLedger.test.tsx features/host/aigen/ui/EvidencePanel.test.tsx features/host/aigen/ui/EvidenceDrawer.test.tsx --reporter=dot
```

Expected: FAIL because the review model and components do not exist.

- [ ] **Step 4: Implement canonical section diffing**

Use field-level canonical values:

```ts
function sectionValue(
  result: SessionImportV1Snapshot,
  section: ReviewSection,
): unknown {
  switch (section) {
    case "SUMMARY": return result.summary;
    case "HIGHLIGHTS": return result.highlights;
    case "ONE_LINE_REVIEWS": return result.oneLineReviews;
    case "FEEDBACK_DOCUMENT": return {
      fileName: result.feedbackDocumentFileName,
      markdown: result.feedbackDocumentMarkdown,
    };
  }
}
```

Compare strings and ordered arrays structurally with normalized browser-owned values only; do not trim or case-normalize author names because the server contract is exact.

- [ ] **Step 5: Integrate target selection into each section**

Map summary evidence per paragraph, highlights/one-line reviews per row, and feedback evidence per top-level section. Keep `targetId` server-owned. Diff stable row/section ordinals against the immutable server snapshot to maintain `invalidatedTargetIds`. When a changed block is selected, close that selection and render the edited-state explanation; unchanged sibling evidence remains available. If paragraph count/order or feedback section parsing no longer maps deterministically, invalidate all targets in that section rather than attaching stale evidence.

- [ ] **Step 6: Implement responsive review layout**

Use existing design tokens and page primitives. At desktop widths, keep a bounded-width ledger and evidence panel alongside the editor without horizontal page scroll. At mobile widths, ledger remains in document flow and evidence opens in a bottom/side drawer. Do not introduce a new global design system or dependency.

- [ ] **Step 7: Extend draft storage safely**

Persist only browser-local review state:

```ts
interface AiGenerationDraftEnvelope {
  version: 2;
  jobId: string;
  revision: number;
  serverSnapshot: SessionImportV1Snapshot;
  draft: SessionImportV1Snapshot;
  sectionReviews: Record<ReviewSection, SectionReviewState>;
}
```

On storage quota/failure, keep the in-memory draft and show a nonblocking “이 브라우저에서 임시저장되지 않음” warning. On load, discard envelopes whose job/revision no longer matches the server. Never persist evidence excerpts or transcript turns in local storage.

- [ ] **Step 8: Enforce the commit gate and revision conflict flow**

Enable commit only when every unchanged section is grounded-reviewed and every changed section is user-edited-confirmed. Send current draft, four review enums, and current revision. On success, show the content-free participant update count when present; for receipt-based recovery show a generic completion summary that still makes participant attendance synchronization visible. On 409, refetch the job; do not automatically overwrite local edits. Present a safe choice to reload current server revision after warning that local review state must restart.

- [ ] **Step 9: Wire regeneration reset behavior**

Send `expectedRevision`. Replace the entire result/evidence response on success, set the returned revision, clear selected evidence, and reset all review states. A stale response or request cancellation must not merge into a newer local revision.

- [ ] **Step 10: Run the complete feature suite and frontend boundaries**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/aigen tests/unit/frontend-boundaries.test.ts --reporter=dot
```

Expected: PASS with review logic under `model/`, networking under `api/queries`, and UI free of direct fetch calls.

- [ ] **Step 11: Commit the grounded review UI slice**

```bash
git add front/features/host/aigen front/tests/unit/frontend-boundaries.test.ts
git commit -m "feat(aigen): add grounded host review workspace"
```

---

### Task 13: Prove the public-safe vertical slice with integration, BFF, and E2E coverage

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/support/AiGenerationTestModels.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateGroundedCommitIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `front/tests/e2e/aigen-test-fixtures.ts`
- Modify: `front/tests/e2e/aigen-full-flow.spec.ts`
- Modify: `front/tests/e2e/aigen-regenerate.spec.ts`
- Modify: `front/tests/e2e/aigen-expired-job.spec.ts`
- Modify: `front/tests/e2e/aigen-cancel.spec.ts`
- Modify: `front/tests/e2e/aigen-cost-cap.spec.ts`
- Modify: `front/tests/e2e/aigen-jsonupload-coexistence.spec.ts`
- Create: `front/tests/e2e/aigen-invalid-speaker.spec.ts`
- Create: `front/tests/e2e/aigen-evidence-review.spec.ts`
- Create: `front/tests/e2e/aigen-commit-recovery.spec.ts`
- Create: `front/tests/e2e/aigen-mobile-evidence.spec.ts`

**Interfaces:**
- Synthetic transcript exports exercise the same parser shape as the approved sample format without using private names/content/paths.
- E2E proves correction-before-job, grounded review, user edit confirmation, regeneration revision reset, participant upsert, and idempotent recovery.
- Legacy JSON upload remains unaffected.

- [ ] **Step 1: Replace all unstructured AI test transcripts**

Create one public-safe helper:

```ts
export function groundedTranscript(
  turns: Array<{ speaker: string; at: string; text: string }>,
): string {
  return [
    "공개 테스트 독서모임",
    "2026. 7. 14. 오후 7:30 · 42분 10초",
    [...new Set(turns.map((turn) => turn.speaker))].join(", "),
    "",
    ...turns.flatMap((turn) => [
      `${turn.speaker} ${turn.at}`,
      turn.text,
      "",
    ]),
  ].join("\n");
}
```

Use invented fixture names consistently with seeded active club members. Scan fixture output to ensure no locally inspected data appears.

- [ ] **Step 2: Add the server vertical integration scenario**

Exercise:

```text
host and two active members seeded
only one member initially in session_participants
valid two-speaker transcript start
grounded mock worker result/evidence
host commit with four reviewed sections
second speaker auto-added/reactivated as GOING/ATTENDED/ACTIVE
session import contents committed
receipt written without content
Redis payloads removed and hash COMMITTED
same commit repeated -> recovered/idempotent response
```

Add rollback coverage for a forced import/receipt failure.

- [ ] **Step 3: Add early invalid-speaker E2E**

Intercept or query server state to prove:

- upload with one unknown label returns the correction UI;
- browser does not begin status polling;
- no recent job appears for the session;
- correcting the file and explicitly resubmitting starts the job.

- [ ] **Step 4: Add grounded evidence/review E2E**

Prove all four section ledger entries, evidence selection, bounded expansion, unchanged review confirmation, one direct edit disabling its evidence, edited confirmation, and successful commit. Assert the final session editor displays the imported data and participant attendance state.

- [ ] **Step 5: Add regeneration/revision and recovery E2E**

Prove regeneration resets every review state and stale commit returns conflict without overwriting the new draft. Deactivate or rename a matched membership after generation and verify commit returns `MEMBERSHIP_CHANGED` without content writes; restore it and retry. Simulate a receipt-backed Redis finalization gap through the test-only backend fixture and verify the UI converges from `COMMIT_RETRY` to committed. Exercise the existing platform-admin retry surface and assert it exposes status/revision/cleanup metadata only.

- [ ] **Step 6: Add mobile evidence E2E**

At a supported mobile viewport, verify no horizontal overflow, evidence drawer open/close/focus behavior, editable result controls, ledger visibility, and commit gate.

- [ ] **Step 7: Run focused server integration and BFF tests**

```bash
./server/gradlew -p server unitTest --tests '*ServerArchitectureBoundaryTest'
./server/gradlew -p server integrationTest --tests '*AiGenerateApiIntegrationTest' --tests '*AiGenerateGroundedCommitIntegrationTest' --tests '*AiGenerationJobConsumerIntegrationTest'
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 8: Run the focused AI E2E matrix**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  tests/e2e/aigen-invalid-speaker.spec.ts \
  tests/e2e/aigen-evidence-review.spec.ts \
  tests/e2e/aigen-regenerate.spec.ts \
  tests/e2e/aigen-commit-recovery.spec.ts \
  tests/e2e/aigen-mobile-evidence.spec.ts
```

Expected: PASS on configured desktop and mobile projects. If the repo config names projects explicitly, use those existing project names rather than adding a duplicate browser matrix.

- [ ] **Step 9: Run the complete existing AI E2E group**

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/aigen-*.spec.ts
```

Expected: PASS, including JSON upload coexistence, cancel, expiration, and cost cap.

- [ ] **Step 10: Commit the vertical verification slice**

```bash
git add server/src/test/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt front/tests/e2e front/tests/unit/cloudflare-bff.test.ts
git commit -m "test(aigen): cover grounded transcript workflow"
```

---

### Task 14: Harden privacy/operations, document rollout, and run release gates

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepository.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepositoryTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `scripts/aigen-pii-check.sh`
- Modify: `scripts/aigen-smoke-openai.sh`
- Modify: `scripts/aigen-smoke-claude.sh`
- Modify: `scripts/aigen-smoke-gemini.sh`
- Modify: `.env.example`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Durable audit and metrics contain aggregate counts/status/revision only.
- PII guard recognizes the four Redis payload keys and blocks transcript/result/evidence fields outside their approved adapter.
- Runbook documents feature-mode rollout, failure recovery, provider capability drift, and private evaluation boundaries.
- Full server, frontend, E2E, PII, public-release, and release-readiness checks pass before switching the default mode.

- [ ] **Step 1: Write audit and metric regression tests**

Audit entries may add:

```kotlin
val pipelineVersion: String?
val inputTurnCount: Int?
val speakerCount: Int?
val groundingStatus: String?
val groundingWarningCount: Int?
val reviewedSectionCount: Int?
val userEditedSectionCount: Int?
```

Use defaults to minimize legacy call-site churn. Assert repository parameters and metrics never include transcript, turns, names, result, evidence, provider response, instructions, or review text. Metric tags remain enum allowlisted and low-cardinality.

- [ ] **Step 2: Extend the PII static guard and its self-test fixtures**

`scripts/aigen-pii-check.sh` must verify:

- raw payload key literals appear only in the Redis job-store adapter and its tests;
- `:turns` and `:evidence` receive TTL/delete treatment alongside `:transcript` and `:result`;
- grounded job hashes cannot persist `sessionMeta`, expected names, host instructions, or prompt/source envelopes, and terminal cleanup removes compatible legacy sensitive hash fields;
- Kafka message models cannot gain transcript/turn/result/evidence fields;
- Flyway/audit/receipt schemas contain no content/body/text/name/excerpt columns for AI generation;
- metrics tags stay on the safe label allowlist;
- logs/exceptions do not interpolate request, response, transcript, turn, evidence, draft, or instructions objects.

Avoid overbroad scans that flag unrelated domain text columns; scope each assertion to AI generation files/tables.

- [ ] **Step 3: Run focused audit and privacy checks**

```bash
./server/gradlew -p server unitTest --tests '*JdbcAiGenerationAuditRepositoryTest' --tests '*AiGenerationMetricsTest' --tests '*AiGenerationJobMessageSerializationTest'
bash scripts/aigen-pii-check.sh
```

Expected: PASS with named checks for all four payload types and content-free receipt/audit rules.

- [ ] **Step 4: Align operator smoke defaults without making live calls**

Update the Gemini default to `gemini-3-flash-preview`, keep OpenAI `gpt-5.4-mini` and Claude `claude-sonnet-4-6`, and make each script upload a public-safe supported TXT shape. Preserve environment-key gating. Validate syntax only in the normal gate; do not execute provider calls.

```bash
bash -n scripts/aigen-smoke-openai.sh scripts/aigen-smoke-claude.sh scripts/aigen-smoke-gemini.sh scripts/aigen-pii-check.sh
```

Expected: PASS.

- [ ] **Step 5: Document operator-visible behavior**

Update the runbook with:

- enabling `GROUNDED_WHOLE_TRANSCRIPT` per environment and rollback to `LEGACY`;
- active-member speaker rejection and why platform admins cannot bypass/edit content;
- supported TXT structure, 1 MiB/3-hour limits, correction workflow, and real-name-only rule;
- model capability verification and canonical IDs, with instructions to fail closed on drift;
- queue/call/repair behavior and 16,384 output reservation;
- Redis four-key TTL/cleanup and `COMMITTING`/`COMMIT_RETRY` receipt reconciliation;
- aggregate-only audits and forbidden content locations;
- provider outage, revision conflict, expired job, cleanup pending, and stale lease procedures;
- private transcript live-provider evaluation requiring separate explicit approval;
- no transcript search/download and evidence expansion boundaries.

Update architecture with the actual implemented data flow and trust boundaries. Add an Unreleased CHANGELOG entry describing host behavior, migration, model ID correction, and operations impact.

- [ ] **Step 6: Run focused lint/unit/build gates**

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
./scripts/server-ci-check.sh
bash scripts/aigen-pii-check.sh
```

Expected: all commands exit 0. Record exact commands and any environment fallback in the implementation handoff.

- [ ] **Step 7: Run full integration and E2E gates**

```bash
./server/gradlew -p server integrationTest
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

Expected: PASS. If Testcontainers or browser prerequisites are unavailable, report the exact skipped command/reason and do not enable grounded mode by default.

- [ ] **Step 8: Run docs/public safety and release-candidate gates**

```bash
git diff --check "$IMPLEMENTATION_BASE" -- .env.example CHANGELOG.md docs scripts server front
rg -n '/(Users|home)/|[Dd]ownloads/|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|api[_-]?key\s*[:=]|token\s*[:=]' \
  .env.example CHANGELOG.md docs scripts server front || true
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: diff check and release scripts exit 0. Review every regex hit as an allowlisted placeholder/documentation case; there must be no private path, value, fixture, or token-shaped secret.

- [ ] **Step 9: Review the complete branch against its base**

Follow `docs/development/release-readiness-review.md`, not only this plan:

```bash
git status --short --branch
git diff --stat "$IMPLEMENTATION_BASE"...HEAD
git diff --check "$IMPLEMENTATION_BASE"...HEAD
git log --oneline "$IMPLEMENTATION_BASE"..HEAD
```

Inspect CHANGELOG/Unreleased, migration reversibility/roll-forward safety, CI/deploy scripts, operator-visible errors, security-code hygiene, architecture-test baselines/exceptions, public-release candidate contents, and every config default. Passing tests alone is not release approval.

- [ ] **Step 10: Keep rollout fail-safe**

Do not change `LEGACY` to the production default in the same code path merely because tests pass. Enable `GROUNDED_WHOLE_TRANSCRIPT` first in a controlled environment with public-safe or separately approved evaluation data, observe aggregate error/latency/cost/recovery metrics, then make the environment rollout decision independently. The code default may change only through a separately reviewed release decision.

Before any evaluation uploads the seven private local files to a provider, pause and obtain a separate explicit approval that names the provider/retention environment. Keep input and any file-to-session mapping ignored and local. The only retained report fields may be per-file pass/fail, provider/model/pipeline version, token/cost/latency, valid evidence-reference ratio, manual unsupported-claim count, speaker-attribution error count, and host-review completion time. Do not retain file names, paths, actual labels, transcript excerpts, prompts, results, screenshots, or CI artifacts. If that approval is absent, record the gate as `SKIPPED_NOT_AUTHORIZED`, keep the rollout default `LEGACY`, and do not claim private quality validation passed.

- [ ] **Step 11: Commit the operational closeout**

```bash
git add .env.example CHANGELOG.md docs/development/architecture.md docs/operations/runbooks/ai-session-generation.md scripts server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "docs(aigen): operationalize grounded generation"
```

- [ ] **Step 12: Capture final evidence**

Record:

- implementation base and final HEAD;
- exact commands and pass/fail/skipped status;
- migration added;
- current pipeline default;
- whether any live-provider check was intentionally skipped;
- remaining rollout risks, especially provider capability drift and controlled-environment evidence;
- confirmation that private transcript content was neither persisted nor transmitted during implementation verification.

Do not push, deploy, enable an environment flag, or run private live-provider evaluations without separate user authorization.
