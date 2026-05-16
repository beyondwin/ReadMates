# In-App AI 세션 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — Use `superpowers:subagent-driven-development` (recommended for Phase 4·5·7 병렬 구간) 또는 `superpowers:executing-plans` 로 task-by-task 실행한다. Step은 checkbox(`- [ ]`) 로 추적한다.

**Spec:** [docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md](../specs/2026-05-16-readmates-in-app-ai-session-generation-design.md)

**Goal:** 호스트 세션 편집기 안에서 녹취록(.txt) 업로드 → in-app LLM 생성 → preview 검토 → 항목별 재생성/수동 편집 → commit 흐름을 만든다. Claude·OpenAI·Gemini 세 provider를 SOLID·hexagonal 아키텍처로 추상화한다. 기존 외부 JSON 업로드 흐름과 commit 종착점을 공유한다.

**Architecture:** 신규 feature 패키지 `com.readmates.aigen` 을 hexagonal 레이어(`adapter/in/{web,messaging}`, `adapter/out/{persistence,redis,messaging,llm/<provider>}`, `application/{model,port/in,port/out,service,security}`) 로 구성한다. Provider별 LLM 호출은 `adapter/out/llm/<provider>/` 안에서만 SDK에 의존한다. Commit은 기존 `com.readmates.sessionimport.application.port.in.SessionImportUseCases` 의 commit use case에 위임한다. Generation job은 Redis 6h TTL 저장 + Kafka topic `readmates.aigen.jobs.v1` 비동기 처리 + HTTP polling. 부분 재생성은 동기 HTTP. 60s 초과 시 기존 `notification_event_outbox` → Kafka relay → in-app 알림함 재사용.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate/MySQL/Flyway, Spring Kafka (Redpanda), Lettuce/Spring Data Redis, MockMvc + Testcontainers (MySQL/Redis/Kafka) 통합 테스트, React/Vite/TanStack Query, TypeScript, Vitest/Testing Library, Playwright E2E, 기존 ReadMates BFF client (`front/.../bff/`), Micrometer/Prometheus.

---

## Scope Check

이 plan은 spec Section 13(출시 계획)의 Phase 0 ~ 7 전체를 v1으로 다룬다. Phase는 순차·병렬 의존성을 갖는다.

- **순차 critical path:** Phase 0 → 1 → 2 → 3 → 6 (Claude만으로 end-to-end).
- **병렬 가능:** Phase 4 (OpenAI), Phase 5 (Gemini), Phase 7 (클럽 default UI) 는 각각 Phase 1 또는 Phase 2 종료 후 critical path와 동시 진행.
- **Phase 단위 PR + 배포 권장:** 각 Phase는 독립 PR + kill switch off 상태 배포로 점진적 도입한다.

LLM 출력 품질 자동 회귀(LLM-as-judge, golden transcripts) 는 v1 범위 외이며 이 plan에 포함하지 않는다.

---

## File Structure

### Server (`server/src/main/kotlin/com/readmates/aigen/`)

**Phase 0 — 도메인 계약:**

- Create: `application/model/AiGenerationModels.kt` — `GenerationInput`, `GenerationOutput`, `RegenerationInput`, `RegenerationOutput`, `ModelId`, `ModelPricing`, `TokenUsage`, `GenerationItem`, `JobStatus`, `JobStage`, `ErrorCode`, `Provider` enum.
- Create: `application/port/out/SessionContentGenerator.kt` — `interface SessionContentGenerator { fun generateFull(input: GenerationInput): GenerationOutput }`.
- Create: `application/port/out/SessionContentRegenerator.kt` — `interface SessionContentRegenerator { fun regenerateItem(input: RegenerationInput): RegenerationOutput }`.
- Create: `application/port/out/ModelCatalog.kt` — `interface ModelCatalog { fun allowlisted(): List<ModelId>; fun pricing(id: ModelId): ModelPricing; fun resolveAlias(alias: String): ModelId? }`.
- Create: `adapter/out/llm/common/ModelCatalogYamlAdapter.kt` — `@ConfigurationProperties("readmates.aigen")` 기반 구현.
- Create: `adapter/out/llm/common/SessionImportSchemaResource.kt` — `SessionImportV1` JSON Schema source-of-truth loader (`resources/aigen/session-import-v1.schema.json` 로드).
- Create: `resources/aigen/session-import-v1.schema.json` — 기존 `sessionimport` validator의 schema와 동등(요약/하이라이트/한줄평/피드백 문서 검증 룰을 schema로 표현).
- Create: `application/security/AiGenerationAuthorizationPolicy.kt` — 기존 `SessionAuthorizationPolicy` 와 club host 정책을 호출하는 wrapper. (재발명 금지, 위임만.)
- Modify (refactor only): `com/readmates/sessionimport/application/service/SessionImportService.kt` — commit 입력을 in-memory snapshot으로도 받을 수 있게 작은 helper(`commitFromValidatedSnapshot(...)`) 추가. behavior 변화 없음, 외부 테스트 그대로 통과.

**Phase 1 — Claude adapter + 인프라 기반:**

- Create: `server/src/main/resources/db/migration/V{next}__create_ai_generation_audit_log.sql`
- Create: `server/src/main/resources/db/migration/V{next+1}__create_ai_generation_club_defaults.sql`
- Create: `application/port/out/AiGenerationJobStore.kt`
- Create: `application/port/out/AiGenerationAuditRepository.kt`
- Create: `application/port/out/AiGenerationClubDefaultRepository.kt`
- Create: `application/port/out/GenerationCostGuard.kt`
- Create: `application/port/out/AiGenerationJobQueue.kt`
- Create: `adapter/out/redis/RedisAiGenerationJobStore.kt`
- Create: `adapter/out/redis/RedisGenerationCostCounters.kt` (implements `GenerationCostGuard`)
- Create: `adapter/out/persistence/JdbcAiGenerationAuditRepository.kt`
- Create: `adapter/out/persistence/JdbcAiGenerationClubDefaultRepository.kt`
- Create: `adapter/out/llm/claude/ClaudeApiClient.kt` (얇은 SDK wrapper)
- Create: `adapter/out/llm/claude/ClaudeContentGenerator.kt`
- Create: `adapter/out/llm/claude/ClaudeContentRegenerator.kt`
- Create: `adapter/out/llm/common/LlmPromptBuilder.kt`
- Create: `adapter/out/llm/common/LlmErrorMapper.kt`
- Create: `application/service/AiGenerationOrchestrator.kt` (start/get/cancel)
- Create: `application/service/AiGenerationRegenerationService.kt`
- Create: `application/service/AiGenerationCommitService.kt`
- Create: `config/AiGenerationProperties.kt` — `@ConfigurationProperties("readmates.aigen")`.
- Modify: `server/src/main/resources/application.yml` — `readmates.aigen.*` block (enabled, providers, pricing, caps, job).
- Modify: `server/src/main/resources/application-dev.yml` — dev-local defaults.
- Modify: `server/src/main/resources/application-test.yml` — `aigen.enabled=false` for legacy tests; `aigen.mock=true` profile for new tests.

**Phase 2 — Job orchestration + API (Claude only):**

- Create: `adapter/out/messaging/AiGenerationJobProducer.kt` (Kafka producer)
- Create: `adapter/in/messaging/AiGenerationJobConsumer.kt` (Kafka @KafkaListener)
- Create: `application/service/AiGenerationWorker.kt` (consumer가 호출하는 도메인 서비스)
- Create: `application/port/in/AiGenerationUseCases.kt`
- Create: `adapter/in/web/AiGenerationController.kt`
- Create: `adapter/in/web/AiGenerationWebDtos.kt`
- Create: `adapter/in/web/AiGenerationErrorHandler.kt`
- Create: `adapter/in/web/ClubAiDefaultsController.kt`
- Modify: `com/readmates/auth/infrastructure/security/SecurityConfig.kt` — 새 endpoint authorize 룰.

**Phase 3 — Frontend AI 모드 UI:**

- Create: `front/features/host/aigen/api/aigen-contracts.ts`
- Create: `front/features/host/aigen/api/aigen-api.ts`
- Create: `front/features/host/aigen/model/aigen-job-model.ts`
- Create: `front/features/host/aigen/model/aigen-draft-storage.ts`
- Create: `front/features/host/aigen/hooks/useAiGenerationJob.ts`
- Create: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Create: `front/features/host/aigen/ui/TranscriptUploadForm.tsx`
- Create: `front/features/host/aigen/ui/GenerationProgressView.tsx`
- Create: `front/features/host/aigen/ui/PreviewView.tsx` (외부 JSON 모드와 컴포넌트 공유 시 reuse)
- Create: `front/features/host/aigen/ui/RegenerateModal.tsx`
- Create: `front/features/host/aigen/ui/sections/SummarySection.tsx`
- Create: `front/features/host/aigen/ui/sections/HighlightsSection.tsx`
- Create: `front/features/host/aigen/ui/sections/OneLineReviewsSection.tsx`
- Create: `front/features/host/aigen/ui/sections/FeedbackDocumentSection.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx` — 모드 토글 추가.
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx` — 모드 토글 mobile 적응.
- Test files mirror UI files under `front/features/host/aigen/__tests__/`.

**BFF (Cloudflare Pages Functions):**

- Modify: `front/functions/api/bff/[[path]].ts` (또는 동등 catch-all) — `/api/host/sessions/*/ai-generate/*`, `/api/host/clubs/*/ai-defaults` 라우팅 추가. multipart 통과·SSE 미사용·일반 fetch passthrough 확인.

**Phase 4 — OpenAI adapter:**

- Create: `adapter/out/llm/openai/OpenAiApiClient.kt`
- Create: `adapter/out/llm/openai/OpenAiContentGenerator.kt`
- Create: `adapter/out/llm/openai/OpenAiContentRegenerator.kt`

**Phase 5 — Gemini adapter:**

- Create: `adapter/out/llm/gemini/GeminiApiClient.kt`
- Create: `adapter/out/llm/gemini/GeminiContentGenerator.kt`
- Create: `adapter/out/llm/gemini/GeminiContentRegenerator.kt`
- Create: `adapter/out/llm/gemini/GeminiSchemaCompatAdapter.kt` (Gemini 호환 schema 변환)

**Phase 6 — 운영 통합:**

- Create: `application/service/AiGenerationNotificationDispatcher.kt` — 60s 초과 시 `notification_event_outbox` 에 이벤트 발행 (event_type `AI_GENERATION_READY`).
- Modify: `notification` 도메인 — 새 event_type 처리 추가 (deep link 생성).
- Create: `docs/operations/runbooks/ai-session-generation.md`
- Create: `scripts/aigen-pii-check.sh`
- Create: `scripts/aigen-smoke-claude.sh`
- Create: `scripts/aigen-smoke-openai.sh`
- Create: `scripts/aigen-smoke-gemini.sh`
- Create: `ops/grafana/dashboards/aigen.json` (또는 기존 dashboard 디렉토리에 맞춤)
- Create: `ops/prometheus/alerts/aigen-rules.yml` (또는 기존 alert 디렉토리에 맞춤)

**Phase 7 — 클럽 default UI:**

- Create: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: `front/features/host/club/ui/<ClubSettingsPage>.tsx` — 새 sub-section 추가.
- Test: `front/features/host/club/__tests__/ClubAiDefaultsSection.test.tsx`

**Docs:**

- Modify: `README.md` — "AI-assisted 운영 콘텐츠" 문장 갱신.
- Modify: `docs/development/session-import-generator.md` — AI 모드/외부 JSON 모드 병존 안내.
- Modify: `docs/development/architecture.md` — AI generation 컴포넌트와 Kafka topic 다이어그램.
- Modify: `CHANGELOG.md` — Phase별 entry.

---

## Phase 0 — 도메인 계약 (Refactor + 인터페이스 정의)

**Goal:** AI 구현 없이 도메인 인터페이스·application config skeleton·기존 commit path 재사용 helper를 만들어둔다. 통과 게이트: 기존 JSON 업로드 flow E2E 그대로 통과(회귀 0).

**Files:** 위 "Phase 0" 섹션 참조.

### Task 0.1 — `AiGenerationModels.kt` 도메인 모델 작성

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`

- [ ] **Step 1: 도메인 모델 작성 (테스트 없음, 순수 데이터 클래스)**

```kotlin
package com.readmates.aigen.application.model

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class Provider { CLAUDE, OPENAI, GEMINI }

data class ModelId(val provider: Provider, val name: String) {
    override fun toString(): String = name
}

data class ModelPricing(
    val inputPerMTokenUsd: BigDecimal,
    val cachedInputPerMTokenUsd: BigDecimal,
    val outputPerMTokenUsd: BigDecimal,
)

data class TokenUsage(
    val inputTokens: Long,
    val cachedInputTokens: Long,
    val outputTokens: Long,
)

enum class GenerationItem { SUMMARY, HIGHLIGHTS, ONE_LINE_REVIEWS, FEEDBACK_DOCUMENT }

enum class JobStatus { PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED }

enum class JobStage {
    QUEUED, TRANSCRIPT_LOADED,
    GENERATING_SUMMARY, GENERATING_HIGHLIGHTS,
    GENERATING_ONE_LINE_REVIEWS, GENERATING_FEEDBACK_DOCUMENT,
    VALIDATING, READY,
}

enum class AuthorNameMode { REAL, ALIAS }

data class SessionMeta(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String?,
    val meetingDate: LocalDate,
    val expectedAuthorNames: List<String>,
    val authorNameMode: AuthorNameMode,
)

data class GenerationInput(
    val transcript: String,
    val sessionMeta: SessionMeta,
    val model: ModelId,
    val instructions: String?,
)

data class RegenerationInput(
    val transcript: String,
    val currentResult: SessionImportV1Snapshot,
    val item: GenerationItem,
    val sessionMeta: SessionMeta,
    val model: ModelId,
    val instructions: String?,
)

data class GenerationOutput(val result: SessionImportV1Snapshot, val usage: TokenUsage)
data class RegenerationOutput(val patchedItem: GenerationItem, val patchedValue: Any, val usage: TokenUsage)

/**
 * In-memory snapshot mirroring the readmates-session-import:v1 JSON.
 * Reuses the same shape as sessionimport.application.model.SessionImportCommand fields,
 * but lives in aigen for module independence. Conversion is in AiGenerationCommitService.
 */
data class SessionImportV1Snapshot(
    val format: String,                                    // "readmates-session-import:v1"
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val summary: String,
    val highlights: List<AuthoredText>,
    val oneLineReviews: List<AuthoredText>,
    val feedbackDocumentFileName: String,
    val feedbackDocumentMarkdown: String,
) {
    data class AuthoredText(val authorName: String, val text: String)
}

enum class ErrorCode {
    PROVIDER_UNAVAILABLE, PROVIDER_RATE_LIMITED,
    SCHEMA_INVALID, AUTHOR_NAME_MISMATCH,
    HIGHLIGHTS_OUT_OF_RANGE, ONE_LINE_REVIEWS_DUPLICATE, FEEDBACK_TEMPLATE_INVALID,
    HOST_DAILY_CAP_EXCEEDED, CLUB_MONTHLY_CAP_EXCEEDED, RATE_LIMITED,
    AI_DISABLED, JOB_EXPIRED, QUEUE_UNAVAILABLE,
    UNKNOWN,
}

data class GenerationError(val code: ErrorCode, val message: String)

data class JobView(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val status: JobStatus,
    val stage: JobStage?,
    val progressPct: Int,
    val model: ModelId,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage?,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
    val expiresAt: Instant,
)
```

- [ ] **Step 2: ./server/gradlew -p server compileKotlin 통과 확인**

### Task 0.2 — 외부 port 인터페이스 작성

**Files:** Create `SessionContentGenerator.kt`, `SessionContentRegenerator.kt`, `ModelCatalog.kt`.

- [ ] **Step 1: 인터페이스 3개 작성**

```kotlin
// application/port/out/SessionContentGenerator.kt
package com.readmates.aigen.application.port.out
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.Provider
interface SessionContentGenerator {
    val provider: Provider
    fun generateFull(input: GenerationInput): GenerationOutput
}

// application/port/out/SessionContentRegenerator.kt
package com.readmates.aigen.application.port.out
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.RegenerationOutput
import com.readmates.aigen.application.model.Provider
interface SessionContentRegenerator {
    val provider: Provider
    fun regenerateItem(input: RegenerationInput): RegenerationOutput
}

// application/port/out/ModelCatalog.kt
package com.readmates.aigen.application.port.out
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
interface ModelCatalog {
    fun allowlisted(): List<ModelId>
    fun pricing(id: ModelId): ModelPricing
    fun resolveAlias(alias: String): ModelId?
    fun isEnabled(id: ModelId): Boolean
}
```

- [ ] **Step 2: compileKotlin 통과**

### Task 0.3 — `application.yml` config skeleton

**Files:**
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`

- [ ] **Step 1: `AiGenerationProperties` 추가**

```kotlin
package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.math.BigDecimal
import java.time.Duration

@ConfigurationProperties("readmates.aigen")
data class AiGenerationProperties(
    val enabled: Boolean = false,
    val mock: Boolean = false,
    val enabledProviders: Set<String> = emptySet(),     // "CLAUDE","OPENAI","GEMINI"
    val fallbackDefaultModel: String = "claude-sonnet-4-6",
    val caps: Caps = Caps(),
    val job: Job = Job(),
    val pricing: Map<String, Pricing> = emptyMap(),
) {
    data class Caps(
        val hostDailyCalls: Int = 10,
        val clubMonthlyCostUsd: BigDecimal = BigDecimal("20.00"),
        val hostPerMinuteCalls: Int = 5,
        val softWarningRatio: BigDecimal = BigDecimal("0.80"),
    )
    data class Job(
        val redisTtl: Duration = Duration.ofHours(6),
        val notificationLatencyThreshold: Duration = Duration.ofSeconds(60),
        val maxLlmCallsPerJob: Int = 3,
    )
    data class Pricing(
        val inputPerMTokenUsd: BigDecimal,
        val cachedInputPerMTokenUsd: BigDecimal = BigDecimal.ZERO,
        val outputPerMTokenUsd: BigDecimal,
    )
}
```

- [ ] **Step 2: `@EnableConfigurationProperties(AiGenerationProperties::class)` 등록 (별도 `AiGenerationConfig` 작성)**
- [ ] **Step 3: `application.yml` 에 spec section 11.3 yaml block 추가 (initially `enabled: false`)**
- [ ] **Step 4: `application-dev.yml`, `application-test.yml` 에 fail-safe defaults**

### Task 0.4 — `SessionImportSchemaResource` + JSON Schema 파일

**Files:**
- Create: `server/src/main/resources/aigen/session-import-v1.schema.json`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/SessionImportSchemaResource.kt`

- [ ] **Step 1: schema 파일 작성 — 기존 `sessionimport` validator의 모든 규칙을 JSON Schema 로 표현**

핵심 항목: `format == "readmates-session-import:v1"`, `session.number` int ≥ 1, `session.bookTitle` non-empty, `session.meetingDate` ISO date, `publication.summary` non-empty, `highlights` min 1 max 6 items, `oneLineReviews` min 1 unique authorName, `feedbackDocument.fileName` regex `^[^/\\]+\.(md|txt)$`, `feedbackDocument.markdown` non-empty.

`authorName` 정확 매칭, 회차/책/날짜 매칭, feedback markdown 헤더 검증은 schema로 표현 불가 → validator 단계에서 수행.

- [ ] **Step 2: loader 작성 + unit test (`SessionImportSchemaResourceTest.kt`) — 리소스 로드되고 valid JSON 임을 확인**

### Task 0.5 — `sessionimport` 의 commit helper 추출 (회귀 0 refactor)

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`

- [ ] **Step 1: 기존 commit use case가 받는 `SessionImportCommand` 와 별도로, "이미 검증·매칭이 끝난 snapshot 으로부터 즉시 commit" 하는 helper 메서드 추가**

목적: AI generation 흐름이 자체 검증 후 같은 commit path를 호출할 수 있게 한다. 외부 JSON 흐름은 기존 진입점 유지.

```kotlin
interface SessionImportUseCases {
    fun preview(command: SessionImportCommand): SessionImportPreviewResult
    fun commit(command: SessionImportCommand): SessionImportCommitResult
    // ↓ 추가
    fun commitValidated(input: ValidatedSessionImportInput): SessionImportCommitResult
}

data class ValidatedSessionImportInput(
    val host: CurrentMember,
    val sessionId: UUID,
    val recordVisibility: SessionRecordVisibility,
    val command: SessionImportCommand,         // already-validated input
)
```

실제 구현은 기존 commit 의 트랜잭션 path 를 그대로 호출. behavior 동일.

- [ ] **Step 2: 기존 HostSessionImportControllerDbTest 전부 통과 확인 (`./server/gradlew -p server test --tests *SessionImport*`).**

### Phase 0 Exit Gate

- [ ] `./server/gradlew -p server clean test` 통과
- [ ] 기존 `sessionimport` E2E (front/e2e/) 회귀 없음
- [ ] `application.yml` 에 `readmates.aigen.enabled: false` 확인
- [ ] Phase 0 PR merge

---

## Phase 1 — Claude Adapter + 인프라 기반

**Goal:** Claude provider 1개와 cost guard, audit log, Redis job store, kill switch config 를 모두 갖춘다. Job orchestration·HTTP API 는 Phase 2 에서. Phase 1 종료 시점에는 단위/통합 테스트만 동작한다 (호스트 사용자는 아직 사용 불가).

### Task 1.1 — Flyway 마이그레이션 2개

**Files:**
- Create: `server/src/main/resources/db/migration/V{next}__create_ai_generation_audit_log.sql`
- Create: `server/src/main/resources/db/migration/V{next+1}__create_ai_generation_club_defaults.sql`

- [ ] **Step 1: spec 8.2.1, 8.2.2 의 DDL 그대로 작성**
- [ ] **Step 2: `db.migration` Flyway test (`FlywayMigrationTest`)에서 새 버전 적용 OK 확인**

### Task 1.2 — port + Redis adapter (job store, cost counters)

**Files:**
- Create: `application/port/out/AiGenerationJobStore.kt`
- Create: `application/port/out/GenerationCostGuard.kt`
- Create: `adapter/out/redis/RedisAiGenerationJobStore.kt`
- Create: `adapter/out/redis/RedisGenerationCostCounters.kt`

- [ ] **Step 1: port 인터페이스**

```kotlin
interface AiGenerationJobStore {
    fun save(job: JobRecord): Unit
    fun load(jobId: UUID): JobRecord?
    fun saveResult(jobId: UUID, result: SessionImportV1Snapshot, usage: TokenUsage, cost: BigDecimal): Unit
    fun patchItem(jobId: UUID, item: GenerationItem, value: Any, usage: TokenUsage, cost: BigDecimal): Unit
    fun updateStatus(jobId: UUID, status: JobStatus, stage: JobStage?, progressPct: Int, error: GenerationError?): Unit
    fun delete(jobId: UUID): Unit                       // commit/cancel
}

data class JobRecord(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val model: ModelId,
    val authorNameMode: AuthorNameMode,
    val instructions: String?,
    val transcript: String,                  // 본문은 별도 Redis key 에 저장됨
    val status: JobStatus,
    val stage: JobStage?,
    val progressPct: Int,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage,
    val costAccumulatedUsd: BigDecimal,
    val expiresAt: Instant,
)

interface GenerationCostGuard {
    fun checkBeforeCall(hostId: UUID, clubId: UUID): GuardDecision
    fun recordUsage(hostId: UUID, clubId: UUID, cost: BigDecimal): Unit
    fun clubMonthlyCost(clubId: UUID): BigDecimal
}

sealed class GuardDecision {
    object Allow : GuardDecision()
    data class Deny(val code: ErrorCode) : GuardDecision()
}
```

- [ ] **Step 2: Lettuce/Spring Data Redis 기반 구현. spec 8.1 Redis 키 스키마 사용. transcript 본문은 `aigen:job:{jobId}:transcript` 별도 키.**
- [ ] **Step 3: Testcontainers Redis 통합 테스트 — TTL 6h 설정·만료 동작, 동시 patch 원자성, `delete` 시 3 키 모두 삭제, 비활성 Redis 환경 시 503 graceful 발생용 헬스 인터페이스 작성.**

### Task 1.3 — `JdbcAiGenerationAuditRepository`, `JdbcAiGenerationClubDefaultRepository`

**Files:** Create both repositories + ports.

- [ ] **Step 1: port + JDBC 구현 + Testcontainers MySQL 통합 테스트**

audit 테스트는 PII invariant 포함: insert 후 `transcript_text` 같은 컬럼 부재 + `error_message` 길이 ≤ 512 + transcript sentinel 부재.

### Task 1.4 — `ModelCatalog` 구현 + 가격 회계

**Files:**
- Create: `adapter/out/llm/common/YamlModelCatalog.kt` (implements `ModelCatalog`)
- Create: `application/service/CostCalculator.kt`

- [ ] **Step 1: yaml `readmates.aigen.pricing` 으로부터 모델 목록·가격 빌드, `enabled-providers` filter 적용**
- [ ] **Step 2: `CostCalculator.estimate(usage, pricing)` — input·cached_input·output 분리 계산**
- [ ] **Step 3: 단위 테스트 — alias 해석, 비활성 provider 모델 제외, 가격 0 edge case**

### Task 1.5 — `LlmPromptBuilder` + `LlmErrorMapper`

**Files:**
- Create: `adapter/out/llm/common/LlmPromptBuilder.kt`
- Create: `adapter/out/llm/common/LlmErrorMapper.kt`

- [ ] **Step 1: `LlmPromptBuilder.buildFullSystemPrompt(meta, instructions)` 와 `buildRegenSystemPrompt(meta, item, instructions, currentSnapshot)` 작성**

System prompt는 spec 9.3 의 5개 hallucination 방지 룰을 포함하고, 출력 schema 를 강제하는 지시문을 포함한다. 참석자 이름 enum, 회차/책/날짜 고정값을 prompt에 명시적으로 박는다.

- [ ] **Step 2: `LlmErrorMapper.mapException(t: Throwable, provider): GenerationError` — provider 별 status code/예외 타입을 `ErrorCode` 로 매핑. **transcript 인자 reference 없음** (정적으로 검증).**
- [ ] **Step 3: PII invariant 단위 테스트 — sentinel transcript ("UNIQUE-SENTINEL-12345") 가 들어 있을 때 error.message 에 sentinel 부재.**

### Task 1.6 — `ClaudeApiClient` + `ClaudeContentGenerator/Regenerator`

**Files:**
- Create: `adapter/out/llm/claude/ClaudeApiClient.kt`
- Create: `adapter/out/llm/claude/ClaudeContentGenerator.kt`
- Create: `adapter/out/llm/claude/ClaudeContentRegenerator.kt`

- [ ] **Step 1: Anthropic SDK 좌표 확정 (context7 MCP로 최신 docs 조회). `build.gradle.kts` 에 추가. `READMATES_AIGEN_ANTHROPIC_API_KEY` env로 키 주입.**

> SDK 정확한 클래스 이름·메서드 시그니처는 SDK 버전에 따라 다를 수 있다. 이 plan은 의도만 명시하고, 구체 호출은 작업자가 최신 docs를 확인해 작성한다.

- [ ] **Step 2: `ClaudeContentGenerator.generateFull(input)` 구현**

흐름:
1. `LlmPromptBuilder.buildFullSystemPrompt(...)` → system messages.
2. user message에 transcript 블록을 `cache_control: { type: "ephemeral" }` 로 첨부.
3. tool 정의: 이름 `emit_session_import_v1`, `input_schema = SessionImportSchemaResource.schema()`.
4. Anthropic `messages.create(model = input.model.name, tools = [...], tool_choice = { type: "tool", name: "emit_session_import_v1" })`.
5. 응답 `tool_use` 블록 input을 `SessionImportV1Snapshot` 으로 파싱.
6. `usage` 에서 `input_tokens`, `cache_read_input_tokens`, `output_tokens` → `TokenUsage`.
7. 예외는 `LlmErrorMapper.mapException(...)` 으로 변환.

- [ ] **Step 3: `ClaudeContentRegenerator.regenerateItem(input)` 구현**

흐름:
1. system prompt에 "다음 항목만 다시 생성한다" 명시.
2. tool input_schema 를 해당 item 의 sub-schema 로 좁힘 (예: SUMMARY 라면 `{ summary: string }`).
3. user message에 transcript(cache_control) + currentResult JSON 첨부.
4. 응답 파싱 → `RegenerationOutput.patchedValue`.

- [ ] **Step 4: 단위 테스트 (SDK mock)**

스텁된 SDK가 정해진 tool_use payload 를 반환하도록 하고, generator가 `SessionImportV1Snapshot` 으로 정확히 파싱하는지, `cache_control` 이 transcript에 부착됐는지, retention 옵션 확인.

PII invariant 테스트: sentinel transcript 가 SDK error 응답에 들어 있을 때 wrapped error에 부재.

### Task 1.7 — `AiGenerationOrchestrator`, `RegenerationService`, `CommitService`, `Worker` (Phase 2 에서 wire-up 되기 전 도메인 서비스만)

**Files:**
- Create: `application/service/AiGenerationOrchestrator.kt`
- Create: `application/service/AiGenerationRegenerationService.kt`
- Create: `application/service/AiGenerationCommitService.kt`
- Create: `application/service/AiGenerationWorker.kt`

- [ ] **Step 1: Orchestrator — start(command), get(jobId), cancel(jobId). Kafka 발행은 `AiGenerationJobQueue` port 사용 (구현은 Phase 2). 시작 직전 cost guard 체크.**
- [ ] **Step 2: Worker.process(jobId) — load → ModelCatalog.isEnabled? → SessionContentGenerator.generateFull → SessionImportV1Validator (다음 task) → store result → audit.record → cost guard.recordUsage → 60s 초과 시 notification port 호출 (port만 호출, 실제 구현은 Phase 6).**
- [ ] **Step 3: RegenerationService — load snapshot, validator로 patched 항목 검증, patch, audit, cost.**
- [ ] **Step 4: CommitService — load Redis snapshot, optional client-supplied final snapshot로 overwrite, validator 통과 강제, sessionimport `commitValidated(...)` 위임, Redis DEL.**

provider별 generator/regenerator는 `Map<Provider, SessionContentGenerator>` 로 DI 주입. Spring config는 별도 `AiGenerationBeansConfig` 작성.

### Task 1.8 — `SessionImportV1Validator` (aigen 내부 사용 wrapper)

**Files:**
- Create: `application/service/SessionImportV1Validator.kt`

- [ ] **Step 1: schema validation + 추가 룰(이름 매칭, 회차/책/날짜 일치, feedback markdown 헤더) 결합**
- [ ] **Step 2: 결과는 ok / 위반 코드 enum. 위반 코드는 spec 9.2 의 `SCHEMA_INVALID`/`AUTHOR_NAME_MISMATCH`/`HIGHLIGHTS_OUT_OF_RANGE`/`ONE_LINE_REVIEWS_DUPLICATE`/`FEEDBACK_TEMPLATE_INVALID`.**
- [ ] **Step 3: 단위 테스트 — 각 위반 케이스별로 명시적 코드 반환.**

### Phase 1 Exit Gate

- [ ] `./server/gradlew -p server clean test` 통과 (Claude adapter 단위 테스트, Redis/JDBC 통합 테스트, validator 테스트 포함)
- [ ] `scripts/aigen-pii-check.sh` 통과 (Phase 6 에서 작성되지만 기본 grep 룰 일부를 Phase 1 시점에 작성하여 사용)
- [ ] Kill switch off (`readmates.aigen.enabled: false`) 상태 deploy
- [ ] Phase 1 PR merge

---

## Phase 2 — Job Orchestration + API (Claude End-to-End)

**Goal:** Kafka producer/consumer, 5개 `/ai-generate/*` endpoint, 클럽 default 2개 endpoint 를 추가한다. Claude로 호스트가 end-to-end 사용 가능 (frontend 없이 cURL 로 검증). Frontend는 Phase 3.

### Task 2.1 — Kafka topic + producer/consumer

**Files:**
- Create: `adapter/out/messaging/AiGenerationJobProducer.kt` (implements `AiGenerationJobQueue`)
- Create: `adapter/in/messaging/AiGenerationJobConsumer.kt`

- [ ] **Step 1: topic 이름 `readmates.aigen.jobs.v1`. partition key = `clubId`. payload = `{jobId, sessionId, clubId, hostUserId, model, kind}` — transcript 본문 없음.**
- [ ] **Step 2: Spring Kafka producer/listener 설정. consumer group = `readmates-aigen-worker`. ack는 처리 성공 후 (`AckMode.MANUAL`).**
- [ ] **Step 3: Testcontainers Redpanda 통합 테스트 — enqueue → 자동 consume → Worker.process 호출. consumer crash 후 재처리. payload에 transcript 부재 정적 검사.**

### Task 2.2 — HTTP DTO + Controller

**Files:**
- Create: `adapter/in/web/AiGenerationWebDtos.kt`
- Create: `adapter/in/web/AiGenerationController.kt`
- Create: `adapter/in/web/AiGenerationErrorHandler.kt`

- [ ] **Step 1: DTO**

```kotlin
data class StartGenerationRequest(
    val model: String?,
    val authorNameMode: String,   // "real" | "alias"
    val instructions: String?,
)
data class StartGenerationResponse(val jobId: UUID, val status: String, val expiresAt: String)

data class JobStatusResponse(
    val jobId: UUID, val status: String, val stage: String?, val progressPct: Int,
    val model: String, val result: SessionImportV1Json?, val error: GenerationErrorJson?,
    val tokens: TokenUsageJson?, val costEstimateUsd: String, val warnings: List<String>,
)

data class RegenerateRequest(val item: String, val model: String?, val instructions: String?)
data class RegenerateResponse(
    val item: String, val value: Any, val tokens: TokenUsageJson,
    val costEstimateUsd: String, val warnings: List<String>,
)

data class CommitRequest(val recordVisibility: String, val result: SessionImportV1Json?)
```

- [ ] **Step 2: Controller — multipart 처리 (`@RequestPart("transcript") MultipartFile`), 권한 체크는 `AiGenerationAuthorizationPolicy` 위임, kill switch off 시 즉시 503.**

```kotlin
@RestController
@RequestMapping("/api/host/sessions/{sessionId}/ai-generate")
class AiGenerationController(
    private val orchestrator: AiGenerationOrchestrator,
    private val regen: AiGenerationRegenerationService,
    private val commitSvc: AiGenerationCommitService,
    private val auth: AiGenerationAuthorizationPolicy,
    private val props: AiGenerationProperties,
) {
    @PostMapping("/jobs", consumes = [MULTIPART_FORM_DATA_VALUE])
    fun start(@PathVariable sessionId: UUID,
              @RequestPart("transcript") file: MultipartFile,
              @ModelAttribute body: StartGenerationRequest,
              currentMember: CurrentMember): ResponseEntity<*> { /* ... */ }

    @GetMapping("/jobs/{jobId}")
    fun status(@PathVariable sessionId: UUID, @PathVariable jobId: UUID, ...): ResponseEntity<*>

    @PostMapping("/jobs/{jobId}/regenerate")
    fun regenerate(@PathVariable sessionId: UUID, @PathVariable jobId: UUID,
                   @RequestBody body: RegenerateRequest, ...): ResponseEntity<*>

    @PostMapping("/jobs/{jobId}/commit")
    fun commit(@PathVariable sessionId: UUID, @PathVariable jobId: UUID,
               @RequestBody body: CommitRequest, ...): ResponseEntity<*>

    @DeleteMapping("/jobs/{jobId}")
    fun cancel(@PathVariable sessionId: UUID, @PathVariable jobId: UUID, ...): ResponseEntity<Void>
}
```

- [ ] **Step 3: `AiGenerationErrorHandler` — 각 `ErrorCode` → HTTP status 매핑. RFC7807 problem detail JSON.**

| ErrorCode | HTTP |
| --- | --- |
| `AI_DISABLED` | 503 |
| `JOB_EXPIRED` | 410 |
| `HOST_DAILY_CAP_EXCEEDED`, `CLUB_MONTHLY_CAP_EXCEEDED` | 400 |
| `RATE_LIMITED` | 429 |
| `QUEUE_UNAVAILABLE` | 503 |
| `PROVIDER_*` | 502 |
| `SCHEMA_INVALID`, `AUTHOR_NAME_MISMATCH`, ... | 422 |

### Task 2.3 — ClubAiDefaultsController

**Files:**
- Create: `adapter/in/web/ClubAiDefaultsController.kt`
- Create: `application/service/ClubAiDefaultsService.kt`

- [ ] **Step 1: GET/PUT `/api/host/clubs/{clubSlug}/ai-defaults`. ModelCatalog allowlist 검증.**
- [ ] **Step 2: 통합 테스트 — 권한 없는 호스트 403, 비활성 provider 모델 400.**

### Task 2.4 — SecurityConfig 변경

**Files:**
- Modify: `com/readmates/auth/infrastructure/security/SecurityConfig.kt`

- [ ] **Step 1: `/api/host/sessions/*/ai-generate/**` 와 `/api/host/clubs/*/ai-defaults` 를 host scope에 추가. BFF secret 헤더 요구 동일.**

### Task 2.5 — `AiGenerateApiIntegrationTest` (deterministic stub provider)

**Files:**
- Create: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/support/StubSessionContentGenerator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/support/StubSessionContentRegenerator.kt`

- [ ] **Step 1: `aigen.mock=true` profile 활성 시 stub generator/regenerator 가 빈으로 등록되도록 `AiGenerationBeansConfig` 분기.**
- [ ] **Step 2: full flow E2E (start → polling → commit) Mock 호출로 통과.**

### Phase 2 Exit Gate

- [ ] 통합 테스트 전부 통과
- [ ] Manual smoke: 운영자가 직접 cURL 로 (kill switch on 한 환경에서) 1 회차 transcript 로 Claude end-to-end 호출 성공
- [ ] Kill switch off 시 모든 endpoint 503 확인
- [ ] Phase 2 PR merge

---

## Phase 3 — Frontend AI 모드 UI

**Goal:** 호스트 세션 편집기에 AI 모드 탭과 모든 UI 컴포넌트를 추가한다. Spring `aigen.mock=true` profile 로 E2E.

### Task 3.1 — BFF route 추가

**Files:**
- Modify: `front/functions/api/bff/[[path]].ts` (또는 동등)

- [ ] **Step 1: `/api/host/sessions/*/ai-generate/*` 와 `/api/host/clubs/*/ai-defaults` 패스 통과 허용. multipart 통과 동작 확인 (Spring 까지 Content-Type/boundary 보존).**

### Task 3.2 — API 계약 + fetch wrapper

**Files:**
- Create: `front/features/host/aigen/api/aigen-contracts.ts`
- Create: `front/features/host/aigen/api/aigen-api.ts`

- [ ] **Step 1: TypeScript 타입(서버 DTO 와 1:1)**
- [ ] **Step 2: fetch wrapper — `startGeneration`, `getJob`, `regenerateItem`, `commit`, `cancel`, `getClubDefault`, `putClubDefault`. multipart는 `FormData` 사용.**

### Task 3.3 — polling hook

**Files:**
- Create: `front/features/host/aigen/hooks/useAiGenerationJob.ts`

- [ ] **Step 1: TanStack Query `useQuery` with adaptive `refetchInterval` (초 2초, 이후 3000~5000ms, status가 SUCCEEDED/FAILED/CANCELLED 면 false).**
- [ ] **Step 2: 단위 테스트 — polling 중지 조건, 네트워크 오류 시 재개.**

### Task 3.4 — UI 컴포넌트

**Files:** `front/features/host/aigen/ui/` 하위 컴포넌트 일체.

- [ ] **Step 1: `AiGenerateTab.tsx` 상태기 (IDLE/GENERATING/PREVIEW/ERROR/COMMITTED).**
- [ ] **Step 2: `TranscriptUploadForm.tsx` — 파일 선택, 모델 드롭다운(클럽 default 호출로 채움), instructions textarea, 예상 비용·남은 한도 표시, 생성 시작 버튼.**
- [ ] **Step 3: `GenerationProgressView.tsx` — 진행률 바·단계 텍스트·취소·30s/60s 안내.**
- [ ] **Step 4: `PreviewView.tsx` 와 4개 section 컴포넌트. 각 섹션은 textarea/list 표시 + ✨ 재생성 버튼.**
- [ ] **Step 5: `RegenerateModal.tsx` — instructions textarea + 모델 override 드롭다운 + 예상 비용. 확인 시 동기 API 호출, spinner overlay.**
- [ ] **Step 6: `aigen-draft-storage.ts` — `aigen-draft:{jobId}` 키로 PREVIEW 상태의 수동 편집을 localStorage 보관/복원. commit/cancel 시 정리.**

### Task 3.5 — 호스트 세션 편집기에 모드 토글 추가

**Files:**
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`

- [ ] **Step 1: `[ 외부 도구 JSON 업로드 ]` `[ AI 결과 가져오기 ]` 토글. URL query param 으로 모드 보존.**
- [ ] **Step 2: AI 모드 컨테이너에 `AiGenerateTab` 마운트.**

### Task 3.6 — Frontend 단위 테스트 + E2E

**Files:**
- Create: `front/features/host/aigen/__tests__/*.test.tsx`
- Create: `front/e2e/aigen-full-flow.spec.ts`
- Create: `front/e2e/aigen-regenerate.spec.ts`
- Create: `front/e2e/aigen-cancel.spec.ts`
- Create: `front/e2e/aigen-cost-cap.spec.ts`
- Create: `front/e2e/aigen-expired-job.spec.ts`
- Create: `front/e2e/aigen-jsonupload-coexistence.spec.ts`

- [ ] **Step 1: 단위 — `TranscriptUploadForm` size > 1MB 거부, `RegenerateModal` payload mapping, `useAiGenerationJob` polling 동작, draft 복원.**
- [ ] **Step 2: E2E — Spring `aigen.mock=true` profile 로 띄워서 deterministic stub 사용. 6개 시나리오 통과.**

### Phase 3 Exit Gate

- [ ] `pnpm --dir front lint` 통과
- [ ] `pnpm --dir front test` 통과
- [ ] `pnpm --dir front build` 통과
- [ ] `pnpm --dir front test:e2e` 통과
- [ ] 기존 호스트 편집기 E2E 회귀 없음
- [ ] Phase 3 PR merge (kill switch 여전히 off)

---

## Phase 4 — OpenAI Adapter

**Goal:** OpenAI provider 추가. Phase 1 의 패턴을 그대로 따른다.

### Task 4.1 — SDK 좌표 + key env

- [ ] **Step 1: `context7` MCP 로 OpenAI Java SDK 최신 좌표 확인. `build.gradle.kts` 의존성 추가. `READMATES_AIGEN_OPENAI_API_KEY` env.**
- [ ] **Step 2: `application.yml` `enabled-providers` 에 `OPENAI` 추가. `readmates.aigen.pricing` 의 OpenAI 단가 채움 (구현 시점 공식 단가).**

### Task 4.2 — `OpenAiApiClient`, `OpenAiContentGenerator`, `OpenAiContentRegenerator`

- [ ] **Step 1: Generator — `response_format = { type: "json_schema", json_schema: { name: ..., schema: SessionImportSchemaResource.schema(), strict: true } }`, `store: false` 강제, system + user message 동일 구조.**
- [ ] **Step 2: Regenerator — 부분 schema (요청 item subset)만 강제.**
- [ ] **Step 3: 단위 테스트 — schema 전달, store=false, error 매핑, PII invariant.**

### Task 4.3 — 통합 테스트에 OpenAI provider 추가

- [ ] **Step 1: `AiGenerateApiIntegrationTest` 에 provider 파라미터 매트릭스 추가 (OpenAI stub).**

### Task 4.4 — Manual smoke script

- [ ] **Step 1: `scripts/aigen-smoke-openai.sh` 작성. dev key 사용. 1 회차 transcript 로 end-to-end 호출 1회.**

### Phase 4 Exit Gate

- [ ] 모든 server 테스트 통과
- [ ] OpenAI smoke 1회 성공
- [ ] Phase 4 PR merge

---

## Phase 5 — Gemini Adapter

**Goal:** Gemini provider 추가. Schema 호환 변환 필요.

### Task 5.1 — SDK + key + pricing

- [ ] **Step 1: Google GenAI Java SDK 좌표 확인, env `READMATES_AIGEN_GEMINI_API_KEY`, yaml 단가.**

### Task 5.2 — `GeminiSchemaCompatAdapter`

- [ ] **Step 1: `SessionImportV1` JSON Schema → Gemini `responseSchema` 호환 변환 (지원되지 않는 키워드 제거, `additionalProperties`/`$ref` 처리).**
- [ ] **Step 2: 단위 테스트 — 변환 결과가 Gemini 가 받아들이는 subset 임을 검증 (정적).**

### Task 5.3 — Generator/Regenerator + retention 옵션

- [ ] **Step 1: `disablePromptLogging` 또는 동등 옵션 적용. tool/responseSchema 강제.**
- [ ] **Step 2: 단위 테스트.**

### Task 5.4 — Manual smoke

- [ ] **Step 1: `scripts/aigen-smoke-gemini.sh`.**

### Phase 5 Exit Gate

- [ ] 모든 서버 테스트 통과
- [ ] Gemini smoke 1회 성공
- [ ] Phase 5 PR merge

---

## Phase 6 — 운영 통합 (관찰성·알림·문서·CI)

**Goal:** Prometheus metric/alert, runbook, PII 회귀 shell, notification 60s 트리거.

### Task 6.1 — Micrometer metrics

**Files:**
- Modify: 각 service/adapter — Micrometer `MeterRegistry` 주입.

- [ ] **Step 1: spec 11.1 의 8개 metric 등록. label allowlist 코드 강제 (helper `aigenMeter(...)` 가 enum label 만 받음).**
- [ ] **Step 2: `MetricLabelsTest` — 허용 enum 외 label key 사용 시 컴파일·런타임 거부.**

### Task 6.2 — Prometheus alerts + Grafana dashboard

**Files:**
- Create: `ops/prometheus/alerts/aigen-rules.yml`
- Create: `ops/grafana/dashboards/aigen.json`

- [ ] **Step 1: spec 11.2 의 5개 alert rule. threshold 는 baseline 값 적용 + 운영 후 조정.**
- [ ] **Step 2: Dashboard — provider별 latency/cost, 클럽 top-N cost, 검증 실패 추세, queue lag.**

### Task 6.3 — 60s 초과 알림 트리거

**Files:**
- Create: `application/service/AiGenerationNotificationDispatcher.kt`
- Modify: `com/readmates/notification/...` — 새 event_type `AI_GENERATION_READY` 처리(template, deep link).

- [ ] **Step 1: Worker 가 latency > threshold 일 때 `notification_event_outbox` 에 row 생성. payload에는 jobId, sessionId, hostUserId 만 (transcript 본문 없음).**
- [ ] **Step 2: notification consumer가 in-app 알림 1건 생성. 이메일 발송 룰에서는 제외 (v1).**
- [ ] **Step 3: 통합 테스트 — Worker latency stub 으로 60s 초과 시 outbox row 1건 생성 확인.**

### Task 6.4 — PII 회귀 shell + smoke scripts

**Files:**
- Create: `scripts/aigen-pii-check.sh`
- Create: `scripts/aigen-smoke-claude.sh`, `aigen-smoke-openai.sh`, `aigen-smoke-gemini.sh`

- [ ] **Step 1: `aigen-pii-check.sh` — 다음 grep 검사 통과 시 exit 0**

```bash
# 1. audit log/Repository 코드에 transcript 본문 컬럼 부재
grep -RIn --include='*.kt' -E '(transcript_text|transcript_body|raw_transcript|raw_text)' server/src/main/ && fail

# 2. Kafka producer payload 에 transcript 변수 전달 부재
grep -RIn --include='*.kt' -E 'producer.send\(.*transcript' server/src/main/kotlin/com/readmates/aigen/ && fail

# 3. Metric label key allowlist 외 사용 부재
# (static analyzer 또는 grep-based heuristic; 정확한 룰은 implementation 단계에서 작성)
```

CI workflow (`.github/workflows/*.yml` 또는 동등)에서 매 PR 실행.

- [ ] **Step 2: smoke scripts — 운영자가 수동 실행. dev key 분리 사용. 1 회차 transcript 로 end-to-end 1회 호출 + audit log 1행 확인.**

### Task 6.5 — 운영 runbook + 문서 갱신

**Files:**
- Create: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/operations/runbooks/README.md` — 항목 추가
- Modify: `README.md` — "AI-assisted 운영 콘텐츠" 문장 갱신
- Modify: `docs/development/session-import-generator.md` — 모드 병존 안내
- Modify: `docs/development/architecture.md` — AI generation 컴포넌트 추가
- Modify: `CHANGELOG.md` — Phase별 entry

- [ ] **Step 1: runbook spec 11.4 의 8개 항목 작성.**
- [ ] **Step 2: README "AI-assisted 운영 콘텐츠" 갱신 — "ReadMates 호스트 도구는 in-app AI 생성과 외부 정리된 산출물 두 모드를 함께 제공한다" 같은 표현으로 사실 갱신.**

### Phase 6 Exit Gate

- [ ] CI `aigen-pii-check.sh` 통과
- [ ] Grafana dashboard 임포트 후 metric 표시 확인
- [ ] alert 규칙 dry-run 통과
- [ ] 동료 review 1회 완료
- [ ] Phase 6 PR merge

---

## Phase 7 — 클럽 default UI

**Goal:** 호스트가 클럽 설정에서 default 모델을 선택할 수 있는 UI.

### Task 7.1 — `ClubAiDefaultsSection.tsx`

**Files:**
- Create: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: 클럽 설정 페이지 — sub-section 마운트.

- [ ] **Step 1: GET 으로 현재 default 표시, 드롭다운 + 저장. 변경 즉시 동일 페이지의 PREVIEW 안내 ("새 generation 부터 적용").**
- [ ] **Step 2: 단위 테스트.**

### Phase 7 Exit Gate

- [ ] `pnpm --dir front test` 통과
- [ ] E2E: 호스트가 default 변경 후 새 generation 의 모델 표시가 바뀌는지 확인
- [ ] Phase 7 PR merge

---

## Cross-Phase Validation Commands

각 Phase PR 의 verification 섹션에 다음 검증 명령을 명시하고, 그 출력으로 PR 본문에 합격 여부를 적는다. README 의 검증 명령 패턴과 동일.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
./scripts/aigen-pii-check.sh
# 수동 (Phase 1+ 일 때만 실행, CI 미실행)
./scripts/aigen-smoke-claude.sh
./scripts/aigen-smoke-openai.sh
./scripts/aigen-smoke-gemini.sh
```

기존 검증 명령은 변경하지 않는다.

---

## Rollout 절차

1. 모든 Phase 코드를 `readmates.aigen.enabled: false` 상태로 배포.
2. 운영자가 단일 클럽에서 `enabled: true` + 클럽 default 모델 설정으로 dogfood (1주).
3. audit log·Prometheus 비용/실패율 일일 점검.
4. 문제 없으면 글로벌 on.
5. Provider 확장 (Phase 4/5) 도 동일 패턴: yaml `enabled-providers` 에서 추가 후 deploy.

---

## 주의 사항

- **SDK 좌표·메서드 시그니처는 implementation 시점에 `context7` MCP 와 `claude-api` 스킬로 최신 docs 확인 후 결정.** 이 plan은 구체 좌표를 박지 않는다.
- **모든 PR 은 kill switch off 상태로 merge** 가능해야 한다. 즉 새 코드가 prod 에 들어가도 endpoint가 503 으로 응답하도록 default config 를 유지한다.
- **commit path 의 trust boundary**: AI generation 의 commit 은 client-supplied snapshot 을 받지만, 항상 server-side validator를 다시 통과시키고 기존 `commitValidated(...)` use case 를 사용한다. validator 우회 path 를 만들지 않는다.
- **README PII 정책 변경 PR 은 Phase 6 PR 에 포함** — 코드 변경 없이 문구만 변경.
- **observability와 audit 가 항상 코드 path 안에 있어야 한다**. `GenerationDispatcher` 단일 진입점을 강제해서 `checkBeforeCall` / `recordUsage` / audit insert 가 모든 호출에서 1번씩 일어나는 invariant 를 유지한다.
- **클럽 enable/disable 같은 fine-grained policy 는 v2** — v1 dogfood 는 yaml flag 로 글로벌 on/off + 1 클럽 운영 환경에서만 수행.
