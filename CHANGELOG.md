# CHANGELOG

ReadMates는 Git tag와 GitHub Releases를 함께 사용합니다. 이 파일은 저장소 안에 남는 릴리즈 기록이고, GitHub Releases는 태그별 공개 릴리즈 노트로 사용합니다.

버전 규칙과 릴리즈 절차는 [docs/development/release-management.md](docs/development/release-management.md)를 기준으로 합니다.

## Unreleased

### Highlights

- 다음 릴리즈 후보 변경을 이 섹션에 기록합니다.

### Added
- **In-app AI 세션 생성 (Phase 0 scaffolding)**: 호스트 세션 편집기 안 LLM 기반 회차 기록 생성 흐름의 도메인 계약을 준비했습니다. 신규 `com.readmates.aigen` feature 패키지를 도입하고 `AiGenerationModels.kt` (GenerationInput/Output, ModelId/ModelPricing, TokenUsage, GenerationItem/JobStatus/JobStage, ErrorCode 14개, JobView), `SessionContentGenerator`/`SessionContentRegenerator`/`ModelCatalog` outbound port 인터페이스, `AiGenerationProperties` `@ConfigurationProperties("readmates.aigen")` + application.yml `readmates.aigen.*` 블록 (kill switch off 기본, caps/job/pricing 포함), `session-import-v1.schema.json` JSON Schema와 `SessionImportSchemaResource` classpath 로더를 추가했습니다. `SessionImportService`에 `commitValidated(ValidatedSessionImportInput)` 진입점을 추가해 AI 생성 흐름이 기존 commit transactional path를 재사용할 수 있도록 했습니다 — 외부 JSON 업로드 흐름의 `commit(SessionImportCommand)` 동작은 변하지 않았습니다. Flyway V30/V31 마이그레이션으로 `ai_generation_audit_log` (job/session/club/host_user 인덱스 + provider/model/status/token/cost 컬럼)와 `ai_generation_club_defaults` (`clubs(id)` FK) 테이블을 추가했습니다. 아직 호스트 엔드포인트와 LLM provider adapter는 없습니다 (Phase 1-7 후속). 자세한 spec은 [docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md](docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md), plan은 [docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md](docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md).
- **In-app AI 세션 생성 — Phase 1 backend services (tasks 1.1-1.5, 1.7-1.8)**: Phase 1은 호스트 엔드포인트 wiring (Phase 2) 직전까지의 도메인·인프라 레이어를 완성했습니다. (a) Flyway V30/V31 마이그레이션은 task 1.1에서 추가. (b) Redis adapter (`RedisAiGenerationJobStore`, `RedisGenerationCostCounters`) — Lua-atomic patch/3-key delete, 6h job TTL, 24h daily counter, 31d monthly cost counter, `@ConditionalOnProperty(readmates.redis.enabled+aigen.enabled=true)` (task 1.2). (c) JDBC repos (`JdbcAiGenerationAuditRepository`, `JdbcAiGenerationClubDefaultRepository`) — `error_message` ≤512 자 truncation, transcript 본문 컬럼 부재 검증, `clubs(id)` FK enforcement (task 1.3). (d) `YamlModelCatalog` (provider 접두사 매핑 + `enabled-providers` 필터; 빈 set은 kill switch) + 순수 `CostCalculator.estimate` (BigDecimal scale=4 HALF_UP, `cost_estimate_usd DECIMAL(8,4)` 매칭) (task 1.4). (e) `LlmPromptBuilder` (spec §9.3 5개 hallucination 룰 + `emit_session_import_v1` tool 지시문 + 회차/책/날짜/참석자 enum 하드베이크) + `LlmErrorMapper` (transcript 인자 없는 시그니처; 항상 고정 enum-like 문구 반환, `t.message` 누출 금지) (task 1.5). (f) 도메인 서비스 4종 `AiGenerationOrchestrator`/`AiGenerationRegenerationService`/`AiGenerationCommitService`/`AiGenerationWorker` + 새 outbound ports `AiGenerationJobQueue`/`AiGenerationLatencyNotification` + `SessionImportV1Validator` 인터페이스 + `Sleeper` indirection + `AiGenerationBeansConfig` (provider→generator 맵 와이어링) (task 1.7). (g) `DefaultSessionImportV1Validator` — 5가지 위반 코드 (SCHEMA_INVALID, AUTHOR_NAME_MISMATCH, HIGHLIGHTS_OUT_OF_RANGE, ONE_LINE_REVIEWS_DUPLICATE, FEEDBACK_TEMPLATE_INVALID) 첫-매치-반환 (task 1.8). Phase 1 단위/통합 테스트 90+ 모두 통과 (Testcontainers Redis/MySQL 포함). Phase 2 (Kafka topic + HTTP controller + integration test)와 LLM provider adapter 라이브 wiring은 후속 단계. Phase 1 task_1_7에서 발견된 spec/quality 11건은 `.orchestrator/state.json:task_1_7.warnings`에 기록되어 Phase 2 통합 테스트 시점에 수정 예정 (regen 출력 재검증 누락, commit override가 validation 이전에 Redis 덮어쓰기, worker buildSessionMeta degenerate 등).
- **In-app AI 세션 생성 — Phase 2 E2E integration test + LLM 스텁 + 신뢰 경계 정합 (task 2.5)**: `aigen-mock` 프로파일(`readmates.aigen.mock=true`) 아래에서 결정적 stub LLM 어댑터와 JDBC 기반 host authorization policy로 전체 HTTP→Kafka→worker→Redis→commit 라이프사이클을 검증하는 `AiGenerateApiIntegrationTest`를 추가했습니다(MySQL+Redis+Kafka Testcontainers, host fixture 시드). `StubSessionContentGenerator`/`StubSessionContentRegenerator`(test source set, `@ConditionalOnProperty(readmates.aigen.enabled+mock=true)`)는 `DefaultSessionImportV1Validator`와 `FeedbackDocumentParser` 양쪽을 통과하는 결정적 snapshot/patch를 생성합니다. 동일한 mock 가드를 `ClaudeContentGenerator`/`ClaudeContentRegenerator`에 `@ConditionalOnProperty(mock=false, matchIfMissing=true)`로 적용해 실 어댑터와 stub이 충돌 없이 공존합니다. `AiGenerationAuthorizationPolicy`의 NotImplementedError stub은 `DefaultAiGenerationAuthorizationPolicy`로 교체되어 `sessions`/`memberships`/`users`/`session_participants` 테이블을 조회해 host membership을 검증하고 `users.name`(=`SessionImportService.matchRecord`의 displayName 매칭 키)을 `expectedAuthorNames`에 채웁니다. task_1_7에서 보고된 신뢰 경계 3건도 함께 수정합니다: (i) `JobRecord`에 신규 `sessionMeta` 필드와 Redis hash JSON 직렬화를 추가하고 `AiGenerationWorker.buildSessionMeta`가 host가 전달한 SessionMeta를 그대로 사용하도록 변경(이전: `sessionNumber=0, bookTitle=""`라는 degenerate meta로 validator 가짜-통과). (ii) `AiGenerationRegenerationService`에 `SessionImportV1Validator` 의존성을 추가하고 LLM 응답을 full snapshot으로 patch한 뒤 validator를 통과한 경우에만 Redis `patchItem`을 호출(이전: validator 호출 없이 raw per-item value 저장 + Redis adapter contract 불일치 동시 해결). (iii) `AiGenerationCommitService.commit`이 override snapshot을 validator로 검증한 다음에만 Redis에 `saveResult`로 덮어쓰도록 순서 교환(이전: validate 이전에 저장해 실패 시 Redis가 invalid snapshot으로 오염). `RedisAiGenerationJobStore.toHash/fromHash`가 `sessionMeta` JSON 필드를 처리하도록 직렬화를 확장했고, `FakeJobStore.patchItem`은 production Redis adapter와 동일하게 full snapshot만 받도록 contract를 맞췄습니다. Phase 6에서 채울 `AiGenerationLatencyNotification` 어댑터 자리에는 `NoopAiGenerationLatencyNotification`(mock 프로파일 전용)을 두어 통합 테스트에서 Worker autowire가 성공하도록 했습니다. `AiGenerationKafkaConfig`에 `@EnableKafka`를 명시했고, `AiGenerationErrorHandler`는 `InvalidSessionImportException.issues`를 server 로그에 남기되 wire response의 `detail`은 종전대로 마스킹합니다(PII 보호). controller-level kill-switch(503) 케이스는 `@ConditionalOnProperty`로 controller bean 자체가 등록되지 않는 패턴이라 이미 `AiGenerationControllerTest`에서 검증되며, 별도 통합 컨텍스트 없이 재현 가치가 없어 통합 테스트에서는 의도적으로 제외했습니다.
- **In-app AI 세션 생성 — Phase 2 Kafka producer/consumer (task 2.1)**: `AiGenerationJobQueue` outbound port를 Kafka로 구현했습니다. `com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducer` 가 `readmates.aigen.jobs.v1` 토픽으로 partition key=clubId, payload=`AiGenerationJobMessage{jobId, sessionId, clubId, hostUserId, provider, model, kind}`를 발행하고 (transcript 본문 미포함 — 데이터 클래스 구조가 PII 보호 invariant 이고, 단위 + 통합 테스트가 reflection으로 이를 핀합니다), `com.readmates.aigen.adapter.in.messaging.AiGenerationJobConsumer`가 `aiGenerationKafkaListenerContainerFactory`(manual ack mode)로 메시지를 수신해 `AiGenerationWorker.process(jobId)` 호출 후 `Acknowledgment.acknowledge()` 합니다 — 워커 실패시 ack 하지 않고 컨테이너가 재배달합니다. 새 `AiGenerationKafkaConfig`(`@ConditionalOnProperty(readmates.aigen.enabled+readmates.aigen.kafka.enabled=true)`)와 `AiGenerationKafkaProperties`(`bootstrap-servers`, `topic-jobs`, `consumer-group`, `send-timeout`) 구성을 분리했고, 직렬화는 notification module과 동일하게 Jackson 3 (`JacksonMapperUtils.enhancedJsonMapper()` + `JacksonJsonSerializer/Deserializer`)로 통일합니다. application.yml `readmates.aigen.kafka.{enabled, bootstrap-servers, topic-jobs, consumer-group}` 블록과 4개 환경변수(`READMATES_AIGEN_KAFKA_*`)를 추가했습니다. **Breaking port signature change**: `AiGenerationJobQueue.publish` 시그니처에 `clubId, hostUserId`가 추가되어 spec §8.1 payload 요구사항을 충족합니다 — `AiGenerationOrchestrator` 호출 사이트와 테스트 `FakeJobQueue.Published` 데이터 클래스를 함께 업데이트했습니다. Testcontainers Kafka 통합 테스트(`AiGenerationJobConsumerIntegrationTest`)가 publish → consume → mock `AiGenerationWorker.process(jobId)` 호출을 verify합니다.
- **In-app AI 세션 생성 — Phase 7 호스트 클럽 기본 모델 설정 UI (task 7.1)**: 호스트 대시보드에서 클럽별 기본 AI 모델을 선택·저장하는 `ClubAiDefaultsSection` 컴포넌트(`front/features/host/club/ui/ClubAiDefaultsSection.tsx`)를 추가했습니다. TanStack Query v5 `useQuery`(`getClubAiDefault(clubSlug)`)로 현재 기본 모델을 읽고, `AIGEN_MODEL_OPTIONS` allowlist(Phase 3의 임시 하드코딩 목록과 동일 source)로 채운 드롭다운에서 모델을 고른 뒤 `useMutation`(`putClubAiDefault`)으로 저장합니다. 저장 성공 시 동일 query key를 invalidate해 UI를 새로 가져오고, 변경된 값이 즉시가 아니라 "새 generation부터 적용"된다는 안내 문구를 노출해 진행 중인 generation job과의 의미 차이를 명시합니다(spec §10 host 측 UX 요구). 저장 버튼은 현재 선택이 서버 값과 동일하거나 mutation in-flight일 때 비활성화되고, 실패 시 에러 메시지를 출력합니다. `front/features/host/route/host-dashboard-route.tsx`는 `useParams<{ clubSlug: string }>()`로 라우트 파라미터를 읽어 `clubSlug`가 존재할 때만 섹션을 conditional render합니다(클럽 미선택 상태에서 mount 회피). Vitest + Testing Library 6개 단위 테스트(`ClubAiDefaultsSection.test.tsx`)가 query render, 변경 전 save 비활성화, mutation 호출 인자, 성공 안내 노출, in-flight 비활성화, 에러 표시를 `QueryClientProvider` wrapper와 함께 검증합니다(typescript clean, lint clean, frontend 830 테스트 통과). 서버 측 `PUT /api/host/clubs/{clubSlug}/ai-defaults` 컨트롤러는 Phase 2에서 이미 구현되어 있어 추가 backend 변경 없이 wire됩니다. 자세한 spec은 [docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md](docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md) §10, plan task 7.1은 [docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md](docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md) 참고.
- **In-app AI 세션 생성 — Phase 6 운영 통합 (tasks 6.1–6.5)**: AI 생성 흐름의 메트릭, 알림, PII 회귀, 운영 runbook을 한꺼번에 묶었습니다. (a) task 6.1: `com.readmates.aigen.observability.AiGenerationMetrics`가 spec §11.1 8개 meter (`readmates_aigen_jobs_started_total`, `readmates_aigen_jobs_completed_total{status}`, `readmates_aigen_validation_failures_total{reason}`, `readmates_aigen_cost_usd_total`, `readmates_aigen_latency_seconds`, `readmates_aigen_regenerations_total{item}`, `readmates_aigen_queue_depth`, `readmates_aigen_retry_total`)를 노출하며, `MetricLabel` 안전 enum allowlist로 `club_id`/`user_id`/transcript 본문이 metric tag에 누출되는 것을 코드 레벨에서 차단합니다. `queue_depth`는 Kafka consumer lag wiring 전까지 placeholder gauge (0L). (b) task 6.2: `ops/prometheus/alerts/aigen-rules.yml`에 5개 alert (`AiGenProviderErrorBurst` warn, `AiGenSchemaFailureSpike` warn, `AiGenBudgetExhaustion` info, `AiGenQueueLagHigh` warn, `AiGenRedisDown` critical)와 `ops/grafana/dashboards/aigen.json`에 8개 panel (throughput, latency P50/P95, completion by status, retry rate, queue depth, cost, validation failures, regenerations per item)을 추가했습니다. `club_id`가 metric label이 아니므로 per-club $20/월 cap drill-down은 alert가 아니라 `ai_generation_audit_log` SQL로 수행하며, runbook에 해당 쿼리를 명시합니다. (c) task 6.3: `AiGenerationNotificationDispatcher`가 worker latency 60s 임계 초과 시 `recordAiGenerationReady`를 호출해 기존 `notification_event_outbox` 파이프라인을 그대로 재사용해 in-app 알림만 발송합니다 (이메일 발송 없음 — feedback document와 동등한 "결과 준비됨" 신호). 알림 deep link는 호스트 세션 편집기의 AI 모드로 복귀합니다. (d) task 6.4: `scripts/aigen-pii-check.sh`가 PR마다 4개 invariant (Kafka payload에 transcript 미포함, Redis key에 raw transcript 미포함, audit-log row에 transcript 본문 컬럼 없음, metric label allowlist 위반 없음)를 검증해 회귀를 차단하고, `scripts/aigen-smoke-claude.sh`는 라이브 API key 환경에서 manual smoke를 실행합니다. CI workflow가 PR마다 PII 스크립트를 호출합니다. (e) task 6.5: `docs/operations/runbooks/ai-session-generation.md`가 spec §11.4 8개 운영 항목 (모델 allowlist, 클럽/호스트 cap 임시 해제, provider key 회전, schema 실패 spike 조사, 호스트 결과 의심 보고 대응, provider 장애 임시 fallback, 전체 disable kill switch)과 5개 alert anchor (`#provider-error-burst`, `#schema-failure-spike`, `#budget-exhaustion`, `#queue-lag-high`, `#redis-down`), `#pii-regression` 진단 anchor를 한 문서로 묶었습니다. 같은 phase에서 README "AI-assisted 운영 콘텐츠" 섹션, [docs/development/architecture.md](docs/development/architecture.md) "In-app AI 세션 생성 컴포넌트" 섹션, [docs/development/session-import-generator.md](docs/development/session-import-generator.md) 모드 병존 안내를 동기화해 외부 JSON 업로드와 in-app AI 생성 두 모드가 같은 commit 경로(`SessionImportService.commitValidated`)로 흐른다는 사실을 단일 source of truth로 정렬합니다. Kill switch `readmates.aigen.enabled=false`는 여전히 기본값이고, `enabled-providers`도 운영자가 API key 프로비저닝 후 명시적으로 enable한 환경에서만 동작합니다.
- **In-app AI 세션 생성 — Phase 5 Gemini provider adapter (tasks 5.1–5.4)**: Google GenAI Java SDK `com.google.genai:google-genai:1.53.0`을 `server/build.gradle.kts`에 추가하고 `application.yml`에 `gemini-2-5-pro`($1.25/$0.31/$10 per Mtok) 및 `gemini-2-5-flash`($0.30/$0.075/$2.50) 단가 항목과 `READMATES_AIGEN_GEMINI_API_KEY` 환경변수 주석을 추가했습니다 (task 5.1; `AiGenerationPropertiesTest`에 두 pricing 키 assertion 추가). `GeminiSchemaCompatAdapter` (task 5.2)는 `SessionImportSchemaResource.schema()`의 JSON Schema(Draft 2020-12)를 Gemini `responseSchema`가 받는 OpenAPI 3.0 subset으로 변환합니다 — `$schema`/`$id`/`$ref`/`$defs`/`definitions` 및 `additionalProperties` 제거, `const` → 단일-요소 `enum` 변환, `format` 어휘를 Gemini 인식 집합(`date`, `date-time`, `int32`, `int64`, `float`, `double`, `byte`, `enum`)으로 필터링하며 deep-copy 기반으로 순수(pure)·idempotent함을 10개 단위 테스트로 핀합니다. `com.readmates.aigen.adapter.out.llm.gemini` 패키지에 Claude/OpenAI adapter 패턴을 미러링한 `GeminiApiPort`(`callResponseSchema`), `GeminiApiClient` (`@ConditionalOnProperty(aigen.enabled=true + mock=false)`; 실 SDK `Client.models.generateContent(...)` 호출은 task 1.6 / 4.2와 동일하게 `NotImplementedError`로 deferred — task 5.4 smoke가 라이브 통합을 검증), `GeminiContentGenerator`/`GeminiContentRegenerator` (provider=GEMINI, `LlmPromptBuilder`로 동일한 system + USER_PRELUDE 빌드, `GeminiSchemaCompatAdapter.convert(...)`로 변환된 schema만을 `responseSchema`로 port에 전달, spec §5.7 `disablePromptLogging` 또는 동등 옵션 retention contract를 port + client KDoc에 명시)를 추가했습니다 (task 5.3). `FakeGeminiApi`로 16개 단위 테스트(generator 9 + regenerator 7 — happy path, 4-item regen별 narrowed schema, error/IO/rate-limit mapping, USER_PRELUDE byte 동일성, PII 마스킹, schema compat invariants — `$schema`/`additionalProperties`/`const` 부재 검증)가 모두 통과합니다. `AiGenerationBeansConfig.generatorsByProvider`의 `associateBy { it.provider }` 패턴 덕분에 별도 등록 코드 없이 자동 wire됩니다. `scripts/aigen-smoke-gemini.sh` (task 5.4)는 `aigen-smoke-openai.sh`를 미러링한 operator-runbook 스크립트로 transcript size 검증 + multipart POST + polling을 수행하며 헤더 주석에 라이브 SDK wiring이 아직 deferred이라는 caveat을 명시합니다 (`gemini-2-5-pro` 기본). Phase 5는 Claude + OpenAI와 동일한 단위 테스트 parity로 Gemini adapter를 닫으며, 라이브 SDK wiring과 통합 테스트 매트릭스 확장은 라이브 API key가 프로비저닝되는 시점에 후속(v1 헤드리스 실행 범위 밖)으로 처리합니다. 자세한 spec은 [docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md](docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md), plan은 [docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md](docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md).
- **In-app AI 세션 생성 — Phase 4 OpenAI provider adapter (tasks 4.1–4.4)**: OpenAI Java SDK `com.openai:openai-java:4.32.0`을 `server/build.gradle.kts`에 추가하고 `application.yml`에 `openai-gpt-4-1` ($2/$0.5/$8 per Mtok) 및 `openai-gpt-4-1-mini` ($0.4/$0.1/$1.6) 단가 항목과 3개 provider API key env-var 주석을 추가했습니다. `com.readmates.aigen.adapter.out.llm.openai` 패키지에 Claude adapter 패턴을 미러링한 `OpenAiApiPort` (KDoc에 `strict: true` + `store: false` contract 명시), `OpenAiApiClient` (`READMATES_AIGEN_OPENAI_API_KEY` 환경변수 + `@ConditionalOnProperty(aigen.enabled=true + mock=false)`; 실 SDK `chat().completions().create(...)` 호출은 Claude pattern과 동일하게 `NotImplementedError`로 deferred), `OpenAiContentGenerator` (provider=OPENAI, `LlmPromptBuilder`로 동일한 system + USER_PRELUDE 빌드, schema name `session_import_v1`), `OpenAiContentRegenerator` (4개 GenerationItem 별 narrowed schema)를 추가했고, `FakeOpenAiApi`로 18개 단위 테스트 (happy path, 4-item regen별 schema narrowing, error/IO/rate-limit mapping, USER_PRELUDE byte 동일성, PII invariant, token usage 전달) 모두 통과합니다. `AiGenerateApiIntegrationTest`는 Stub 페이로드 빌더를 `internal object`로 추출해 `StubOpenAiSessionContentGenerator`/`StubOpenAiSessionContentRegenerator` (`@Component @ConditionalOnProperty(enabled+mock=true)`, `provider=OPENAI`)를 추가하고 6개 케이스 (CLAUDE × 3 + OPENAI × 3)로 확장했습니다 — `AiGenerationBeansConfig.generatorsByProvider`의 `associateBy { it.provider }` 패턴 덕분에 자동으로 wire됩니다. `scripts/aigen-smoke-openai.sh` operator-runbook 스크립트는 transcript size 검증 + multipart POST + polling을 수행하며 라이브 API key가 환경에 있을 때 manual 실행합니다 (헤드리스 빌드에서는 직접 실행 waive). **Known follow-up (task_4_3 발견)**: `YamlModelCatalog.providerFromName`은 `claude-*`/`gpt-*`/`gemini-*`/`o\d+` 접두사만 매칭하고 `openai-` 접두사는 처리하지 않아 `application.yml`의 `openai-gpt-4-1` 가격 키는 현재 inert합니다. spec doc §7.1 예제는 `"openai-gpt-4-1"` 모델 id를 사용하므로 Phase 5/6에서 (a) `providerFromName`에 `openai-` 룰 추가 또는 (b) yml/frontend/spec에서 `gpt-4-1`로 통일 중 하나로 정합화 필요. 통합 테스트는 임시로 `gpt-4-1`을 사용해 우회합니다.
- **In-app AI 세션 생성 — Phase 3 frontend AI 모드 (tasks 3.1–3.6)**: 호스트 세션 편집기 안에서 LLM 기반 세션 회차 기록 생성 UI를 추가했습니다. (a) Cloudflare Pages BFF (`front/functions/api/bff/[[path]].ts`)의 catch-all 라우트가 `/api/host/sessions/*/ai-generate/*`와 `/api/host/clubs/*/ai-defaults`를 그대로 forward하고 multipart Content-Type/boundary를 보존함을 회귀 테스트로 핀했습니다 (`front/tests/unit/cloudflare-bff.test.ts`에 4개 케이스 추가). (b) `front/features/host/aigen/api/aigen-contracts.ts` + `aigen-api.ts`에 서버 DTO와 1:1로 일치하는 TypeScript 타입과 7개 fetch wrapper (`startGeneration`, `getJob`, `regenerateItem`, `commitGeneration`, `cancelGeneration`, `getClubAiDefault`, `putClubAiDefault`)를 정의했습니다 — multipart는 `transcript` file + `body` JSON Blob 두 part로 보내 deployed 컨트롤러(`AiGenerationController` `@RequestPart("transcript")` + `@RequestPart("body")`)와 정합하며, enum 문자열은 UPPERCASE(서버 `enum.name` 직렬화에 매칭). 알려진 서버 정의 불일치 — `parseGenerationItem`의 `value.uppercase()`가 SNAKE_CASE enum과 매칭되지 않는 이슈 — 는 `RegenerateModal`에서 camelCase → UPPER_SNAKE 변환으로 회피했습니다 (후속 서버 수정 필요). (c) `front/features/host/aigen/hooks/useAiGenerationJob.ts`는 TanStack Query v5 `useQuery` 위에 adaptive `refetchInterval` (2000 ms → 4000 ms, 터미널 status `SUCCEEDED|FAILED|CANCELLED` 시 `false`)을 얹은 폴링 훅과 `aiGenerationJobKeys` factory를 제공합니다. (d) `front/features/host/aigen/ui/` 하위 컴포넌트 일체: `AiGenerateTab` 상태기(IDLE/GENERATING/PREVIEW/ERROR/COMMITTED), `TranscriptUploadForm`(.txt ≤ 1 MB 검증, 모델 드롭다운, instructions), `GenerationProgressView`(진행률·단계·30s/60s 안내·취소), `PreviewView` + 4개 section (`Summary`/`Highlights`/`OneLineReviews`/`FeedbackDocument`) 각 ✨ 재생성 버튼, `RegenerateModal`, `aigen-model-options.ts`(임시 하드코딩된 3-모델 allowlist, 추후 catalog endpoint로 교체). (e) `front/features/host/aigen/storage/aigen-draft-storage.ts`는 `aigen-draft:{jobId}` 키로 PREVIEW 수동 편집을 localStorage에 저장/복원/삭제하며 private-mode/quota 실패에 try/catch로 graceful. (f) `front/features/host/ui/host-session-editor.tsx`에 `[ 외부 도구 JSON 업로드 ]` / `[ AI 결과 가져오기 ]` 모드 토글을 추가하고 `?aigen=1` URL query로 모드를 보존하며 AI 모드일 때 `SessionImportPanel` 자리에 `AiGenerateTab`을 마운트합니다 — `clubSlug`는 라우트 파라미터에서 plumbing, mobile 섹션 `report.panelIds`에 `host-editor-panel-aigen`을 추가해 모바일 네비게이션을 유지합니다. (g) Phase 3 testing 레이어: 47개 단위 테스트(상태기 전이, 1MB 거부, payload mapping, 폴링 stop 조건, draft 복원)와 `aigen-coverage.test.tsx` 통합 인덱스, 6개 E2E 시나리오 spec (`front/tests/e2e/aigen-{full-flow,regenerate,cancel,cost-cap,expired-job,jsonupload-coexistence}.spec.ts`) — 모두 `page.route()` 네트워크 stub로 작성되어 Spring `aigen.mock=true` 프로파일과 무관하게 구조 검증이 가능합니다. E2E 라이브 실행은 후속 단계에서 Spring `aigen.mock` profile + DB 프로비저닝과 함께 enable됩니다. 코드 변경은 frontend 전용 (`front/features/host/aigen/**`, `front/tests/e2e/aigen-*.spec.ts`, `front/features/host/ui/host-session-editor.tsx`, `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`, `front/features/host/route/host-session-editor-route.tsx`, `front/tests/unit/{cloudflare-bff,host-session-editor}.test.tsx`) — 서버 측은 변경 없음. Kill switch는 여전히 `aigen.enabled=false` 기본값이며 토글을 켜고 생성 시도 시 서버는 503으로 응답하는 동작이 의도된 상태입니다.
- **In-app AI 세션 생성 — Claude provider adapter (Phase 1, task 1.6)**: `com.readmates.aigen.adapter.out.llm.claude` 패키지에 `ClaudeApiPort` outbound port + `ClaudeApiClient` (`com.anthropic:anthropic-java:2.27.0` 기반, `READMATES_AIGEN_ANTHROPIC_API_KEY` 환경변수에서 API key를 읽음, `aigen.enabled=true` 일 때만 로드), `ClaudeContentGenerator` (`SessionImportSchemaResource.schema()`를 tool `input_schema`로 강제하고 tool_use 응답을 `SessionImportV1Snapshot`으로 파싱), `ClaudeContentRegenerator` (요청 `GenerationItem`에 해당하는 sub-schema 만으로 좁힌 tool을 호출해 `RegenerationOutput.patchedValue`를 반환)를 추가했습니다. 모든 provider 예외는 `LlmErrorMapper` → 신규 `LlmGenerationException` 으로 감싸 transcript snippet이 사용자에게 노출되지 않도록 마스킹합니다 (PII 보호). 단위 테스트는 SDK 호출을 모킹한 `FakeClaudeApi`로 17개 케이스(happy path, cache_control 전파, schema 직렬화, model 전달, 4개 GenerationItem별 narrowed schema 파싱, IOException/rate-limit sentinel masking 등)를 검증합니다. 실제 SDK `messages.create(...)` wiring (`Tool` input_schema, `ToolChoiceTool`, `TextBlockParam.cacheControl`)은 통합 테스트가 들어오는 후속 task에서 채워지며, 현재 `ClaudeApiClient.callTool` 본체는 `NotImplementedError`로 표시되어 있습니다.
- **Observability backbone (Phase 0)**: BFF → Spring → Kafka producer → consumer → SMTP 경로에 동일한 `X-Readmates-Request-Id`를 전파하고, Logback을 JSON 인코더로 전환했습니다. `notification_event_outbox`, `notification_manual_dispatch_previews`, `notification_manual_dispatches`에 `request_id VARCHAR(64) NULL` 컬럼이 추가됐습니다(Flyway V29). SLO 카탈로그(`server/src/main/resources/slo/slos.yaml`)를 startup에서 schema 검증으로 로드하고, Grafana dashboard 2종을 `ops/grafana/dashboards/`에 코드로 보유합니다. 운영 조회 절차는 `docs/operations/runbooks/correlation-id-lookup.md` 참고.

### Changed
- perf: consolidate `publicStats` SELECTs into a single round-trip and replace correlated EXISTS subqueries in `publicSessions` with pre-aggregated joins (server/publication).
- perf: replace Redis `KEYS` with SCAN-based iteration in read-cache invalidation (server/shared/redis).
- build: 빌드/테스트 속도 최적화 1차 셋. (a) 기본 `:test` task 비활성화로 CI backend 중복 테스트 제거 — `:unitTest`/`:architectureTest`/`:integrationTest`가 태그별로 정확히 1회 실행. (b) `server/gradle.properties`에 build cache·daemon·JVM heap(`-Xmx4g`) 설정. (c) `:unitTest` `maxParallelForks=availableProcessors()/2`(env `READMATES_TEST_FORKS` override) + JUnit5 클래스 단위 병렬. (d) Testcontainers `withReuse(true)` 표기(로컬 옵트인). (e) `.github/workflows/ci.yml`의 중복 `architectureTest` step 제거. Before/after 측정 수치는 휴먼 측정 패스에서 채워 [spec §7](docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md#7-효과-합산-표-구현-후-채움)에 기록.

### Post-deploy verification (v1.9 perf follow-up)
- Local docker MySQL EXPLAIN 검증 완료 (2026-05-15): rewritten `publicStats`/`publicSessions`에 대해 `sessions`는 PRIMARY `eq_ref`, `session_participants`는 `session_participants_club_session_status_member_idx` covering index lookup, `one_line_reviews`는 unique `session_id` `eq_ref`로 핵심 path에 full scan 없음. 운영(OCI MySQL HeatWave) row 수 기준 재확인은 [docs/reports/2026-05-15-v19-perf-explain-verification.md](docs/reports/2026-05-15-v19-perf-explain-verification.md)의 운영 DB 재현 절차로 별도 실행.

## v1.9.0 - 2026-05-15

### Highlights

v1.8.3 이후 누적된 변경은 호스트 알림 운영을 "상태 조회/재처리"에서 "세션별 수동 발송 계획, 미리보기, 확정, 감사"까지 확장하고, 호스트 세션 편집기에 외부에서 정리한 세션 기록 JSON 가져오기를 더하며, 테스트/빌드 runtime을 빠른 피드백 lane과 release baseline으로 분리하는 데 초점을 둡니다. DB migration V27, V28이 포함됩니다.

### Added

- **호스트 수동 알림 발송 워크벤치**: `/app/host/notifications`에서 세션을 선택하고 `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED` 템플릿을 고른 뒤 대상 그룹(`ALL_ACTIVE_MEMBERS`, `SESSION_PARTICIPANTS`, `CONFIRMED_ATTENDEES`), 채널(`IN_APP`, `EMAIL`, `BOTH`), 멤버별 포함/제외를 조합해 알림을 발송할 수 있습니다.
- **수동 발송 preview/confirm 계약**: `GET /api/host/notifications/manual/options`, `POST /api/host/notifications/manual/preview`, `POST /api/host/notifications/manual`, `GET /api/host/notifications/manual/dispatches`를 추가했습니다. Preview는 대상 수, in-app/email 예상 건수, 이메일 선호도 skip, 이메일 누락, 중복 발송 여부를 반환합니다.
- **수동 발송 감사 원장**: `notification_manual_dispatch_previews`, `notification_manual_dispatches` 테이블을 추가했습니다. Confirm은 preview selection hash와 10분 TTL을 확인하고, 같은 preview로 중복 confirm해도 기존 dispatch 결과를 반환하도록 hardened path를 둡니다.
- **수동 발송 E2E 커버리지**: Playwright `manual-notifications.spec.ts`가 세션 선택, preview/confirm, 중복 재발송 확인, 피드백 문서 알림 조건, in-app 수신 확인을 검증합니다.
- **Backend test fast lanes**: Gradle `unitTest`, `integrationTest`, `architectureTest` task를 추가하고, Gradle test JVM을 Java 21 toolchain으로 고정했습니다.
- **프런트 Vitest v8 coverage gate**: `@vitest/coverage-v8`를 dev dep으로 추가하고 `pnpm --dir front test:coverage`(= `vitest run --coverage`) 스크립트를 도입했습니다. Coverage thresholds는 현재 baseline에서 -2pp 정수 floor로 고정(lines/statements 87, functions 83, branches 84)했고, CI front job은 `pnpm test:coverage`로 전환되어 `front-coverage` 아티팩트를 always upload(14일 보존)합니다. 기존 실패시 `frontend-reports` 업로드는 유지합니다.
- **서버 ktlint baseline gate**: `org.jlleitschuh.gradle.ktlint` 12.1.1 Gradle plugin과 ktlint tool 1.7.1(Kotlin 2.2 호환을 위해 spec의 1.3.1에서 상향)을 도입했습니다. 기존 위반은 `server/config/ktlint/baseline.xml`(336 lines)로 grandfather 처리하고 신규 위반만 차단합니다. 1회성 auto-format으로 server/src 하위 329 파일이 line wrap, trailing comma, parameter newline, package decl 포맷을 baseline 기준으로 정렬됐습니다. `./gradlew check`에 wiring되어 PR 회귀를 막습니다.
- **서버 detekt baseline gate**: `io.gitlab.arturbosch.detekt` 1.23.7과 default `server/config/detekt/detekt.yml`(785 lines), `server/config/detekt/baseline.xml`(540 lines)을 도입했습니다. detekt 1.23.x가 호스트 JDK 25에서 동작하도록 `server/gradle/gradle-daemon-jvm.properties`에 `toolchainVersion=21` daemon JVM pin을 추가하고, detekt classpath는 Kotlin 2.0.10으로 고정합니다(`Detekt*` task는 `jvmTarget=21`). 기존 위반은 baseline grandfather, `check`에 wiring되어 신규 위반을 차단합니다.
- **서버 JaCoCo line coverage gate**: `jacoco` 플러그인(toolVersion 0.8.12)을 적용해 `unitTest` task에 `JacocoTaskExtension`을 붙여 `build/jacoco/unitTest.exec`를 생성하고, `jacocoTestReport`는 `Application`/`dto`/`config` 클래스 디렉터리를 제외합니다. `jacocoTestCoverageVerification`은 LINE `COVEREDRATIO` minimum 0.23(현재 측정치 0.2504 − 2pp baseline)으로 고정했고, `check`가 verification에 의존합니다.
- **CI 서버 quality gate 통합**: backend job의 기존 `Test` step을 `./gradlew check`(ktlint + detekt + tests + JaCoCo verify) 단일 호출로 교체하고, `architectureTest` step을 별도 실행합니다. detekt/jacoco/ktlint report 아티팩트는 `if: always()`로 항상 업로드하고, 기존 실패시 `backend-reports`(tests/test-results) 업로드는 유지합니다.
- **서버 CQRS read/write 패키지 분리 컨벤션 + ArchUnit 강제**: `note`/`publication`/`archive` 의 read-side application service에 `@ReadOnlyApplicationService` 마커(`com.readmates.shared.architecture`)를 부착하고, `ServerArchitectureBoundaryTest` 에 두 ArchUnit 규칙을 추가했습니다 — `read-only application services must not depend on mutation ports`(`*SavePort`/`*UpdatePort`/`*DeletePort`/`*WriterPort`/`*StorePort`/`*WritePort` suffix 의 `*.port.out.*` 의존 차단) 와 `read-only application services must not be Transactional`. `archive/application/service/MemberArchiveReviewService` 는 write-side(write port 의존 + `@Transactional`)이므로 marker 미부착. `feedback` 은 mixed(upload mutation + 조회)로 분류되어 marker 미부착, 향후 분리 후보. 컨벤션 전체는 `docs/development/architecture.md` 의 "CQRS Read vs Write Package Split" 섹션 참고.
- **세션 기록 JSON 가져오기**: 호스트 세션 편집기에서 `readmates-session-import:v1` JSON을 preview한 뒤 저장할 수 있습니다. 저장은 해당 회차의 공개 요약, 하이라이트, 한줄평, 피드백 문서를 한 번에 교체하고, `HOST_ONLY` 공개 범위나 세션 metadata/참석자 매칭 오류는 저장 전에 막습니다.

### Changed

- **알림 event ledger metadata 확장**: host event/delivery 목록에서 `source=AUTOMATIC|MANUAL`과 manual dispatch metadata를 구분합니다. Host-facing 응답은 요청자 표시명, 대상 수, 예상 채널별 건수, 재발송 여부만 노출하고 raw email body는 계속 노출하지 않습니다.
- **프런트 테스트 runtime 분리**: Vitest config를 Node project와 `jsdom` project로 나눠 순수 model/contract 테스트가 DOM 환경을 불필요하게 띄우지 않도록 했습니다.
- **프런트 빌드 타겟 ES2022**: `front/tsconfig.json`의 `compilerOptions.target`을 `ES2017` → `ES2022`로 올렸습니다. Vite 8 + 모던 브라우저 대상이므로 `Object.hasOwn`, `Error.cause`, top-level `await`, private class fields의 불필요한 downlevel을 제거합니다. `lib`는 그대로 유지하여 타입 표면 변화는 없습니다.
- **Playwright worker opt-in**: 기본 worker는 seeded DB 공유 때문에 1로 유지하고, `PLAYWRIGHT_WORKERS` 환경 변수로만 병렬 실행을 실험할 수 있게 했습니다.
- **E2E DB reset 통합**: E2E helper가 generated session, invited member, Google login, manual notification artifact cleanup을 한 번의 SQL batch로 묶을 수 있게 했습니다.
- **서버 Docker image layer 최적화**: `server/Dockerfile`과 `server/Dockerfile.release`가 Spring Boot layertools로 dependency/application layer를 분리하고 `JarLauncher` entrypoint를 사용합니다.
- **서버 Docker build 메모리 제한**: local Dockerfile builder 단계에서 Gradle max worker와 JVM 메모리 옵션을 명시해 작은 빌드 환경의 OOM 가능성을 낮췄습니다.
- **`.env.example` 관심사별 재그룹화**: 9개 번호 섹션(Spring 서버, Auth & BFF, Frontend / Cloudflare Pages, Local MySQL, Redis, Kafka & 알림, SMTP, OCI Compose stack, Legacy / rollback)으로 정리하고 인라인 주석을 추가했습니다. 키 이름·기본값·placeholder 포맷 변경 없음, 중복 표기되던 `READMATES_BFF_SECRET(S)` 라인은 Auth & BFF 섹션으로 통합했습니다.
- **프런트 테스트 co-location 컨벤션**: 신규 테스트는 대상 소스 옆 `*.test.ts(x)`로 두는 컨벤션을 `front/AGENTS.md`에 명시했습니다. Vitest config `include` 글롭을 `src/**/*.test.{ts,tsx}`, `features/**/*.test.{ts,tsx}`, `shared/**/*.test.{ts,tsx}`로 확장하고 기존 `tests/unit/**` 패턴과 node/jsdom project 분리는 그대로 유지합니다. 기존 테스트는 server testcontainer fixture 호환성을 위해 이동하지 않습니다.
- **프런트 server state를 TanStack Query v5로 이관 시작**: 앱 루트(`front/src/main.tsx`)에 단일 `QueryClient`를 `QueryClientProvider`로 주입하고, 라우터(`front/src/app/router.tsx`)는 `createReadmatesRouter()`에서 `{router, queryClient}`를 반환하도록 바뀌어 loader와 컴포넌트가 같은 cache를 공유합니다. 첫 reference migration은 호스트 초대 목록(`/app/host/invitations`)으로, list query는 `host-invitation-queries.ts`의 `queryOptions`를 통해 `useQuery`로 읽고, create/revoke는 `useMutation` + targeted invalidation으로 처리하며, loader는 `setQueryData`로 SSR 친화적 hand-off를 수행합니다. 마이그레이션 진행 상황과 다음 단계는 [docs/development/server-state-migration.md](docs/development/server-state-migration.md)에 정리합니다.
- **프런트 router.tsx variant별 모듈 분리**: 단일 파일에 모여 있던 route 정의를 variant별 모듈로 분리했습니다. `front/src/app/router.tsx`는 24-line composition root로 축소되어 `createReadmatesRouter()`에서 `QueryClient`를 생성하고 sub-route 모듈을 조합하는 역할만 합니다. 실제 route 정의는 `front/src/app/routes/{public,auth,member,host}.tsx`로 옮겨져 각각 `publicRoutes()`, `authRoutes()`, `memberRoutes()`, `hostRoutes(queryClient)`로 export됩니다. URL 라우팅 매트릭스, guard(RequireAuth/RequireHost/RequireMemberApp/RequirePlatformAdmin), `errorElement`, `lazy()` 경계는 그대로 유지됩니다.

### Deployment Notes

- **DB migration**: V27(`notification_manual_dispatch_previews`, `notification_manual_dispatches`), V28(preview consumed 상태와 preview-dispatch 1:1 제약) 적용 필요.
- **새 환경 변수**: 없음.
- **배포 순서**: 서버 먼저 배포해 새 API와 migration을 적용한 뒤 프론트엔드를 배포합니다. 구버전 프론트는 새 수동 발송 API를 호출하지 않으므로 서버 선배포가 안전합니다.
- **운영 확인**: 배포 후 호스트 알림 운영 페이지에서 수동 발송 preview가 대상 수와 경고를 반환하는지, confirm 후 event ledger에 `source=MANUAL` row가 생기는지, Kafka/SMTP가 꺼진 환경이면 `notification_event_outbox`에 `PENDING` row가 남는지 확인합니다.

### Verification

- `pnpm --dir front lint` — exit 0. 로컬 ignored/generated `front/coverage` report의 unused eslint-disable warning 1건이 출력됐지만 error는 없었습니다.
- `pnpm --dir front test` — 60 files / 761 tests passed.
- `pnpm --dir front build` — exit 0.
- `pnpm --dir front test:e2e` — 28 tests passed.
- `./server/gradlew -p server clean test` — BUILD SUCCESSFUL.
- `pnpm --dir front zod:export-fixtures && git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/` — fixture diff 없음.
- `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` — passed, gitleaks found no leaks.
- `git diff --check -- CHANGELOG.md README.md docs/deploy/README.md docs/deploy/release-publish-runbook.md docs/development/release-management.md` — 출력 없음.
- 변경 문서 대상 공개 안전 스캔(`rg` 정규식) — 실제 secret, private host, 로컬 절대 경로 없음. 일반 path와 placeholder만 확인됨.

## v1.8.3 - 2026-05-13

### Highlights

ReadMates v1.8.3은 v1.8.2 서버 이미지 Trivy 스캔에서 남은 Netty DNS codec 취약점 한 건을 해소하는 패치 릴리스입니다. DB migration 없음. 사용자 기능 변경 없음.

### Fixed

- **서버 이미지 Trivy 스캔 Netty 잔여 항목 복구**: `io.netty:netty-codec-dns`를 4.2.13.Final로 고정해 CVE-2026-42579가 포함된 4.2.12.Final 런타임 jar가 이미지에 들어가지 않도록 했습니다.

### Deployment Notes

- **DB migration**: 없음.
- **배포 순서**: v1.8.3 태그 이미지의 Trivy 스캔과 release tag promotion이 성공한 뒤 OCI compose stack에 반영하고, 같은 태그의 Cloudflare Pages 프론트엔드 배포 상태를 확인합니다.
- **v1.8.2 주의**: v1.8.2 main CI와 프론트엔드 배포는 통과했지만, 서버 이미지 promotion은 Netty DNS codec 스캔 실패로 완료되지 않았습니다. 운영 서버에는 v1.8.3 이미지를 사용하세요.

### Verification

- `./server/gradlew -p server dependencyInsight --dependency netty-codec-dns --configuration runtimeClasspath` — Netty DNS codec 4.2.13.Final 확인.
- `./server/gradlew -p server clean test bootJar` — BUILD SUCCESSFUL.
- `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` — passed, gitleaks found no leaks.
- v1.8.2 `Deploy Server Image` workflow의 Trivy 로그에서 CVE-2026-42579 단일 HIGH 실패 원인 확인 후 반영.

## v1.8.2 - 2026-05-13

### Highlights

ReadMates v1.8.2는 GitHub Actions의 ShellCheck 0.9.0 기준에서 v1.8.1 main CI Scripts 잡이 실패한 문제를 해소하는 패치 릴리스입니다. DB migration 없음. 사용자 기능 변경 없음.

### Fixed

- **Scripts CI ShellCheck 0.9.0 호환성 복구**: public release fixture 검증 스크립트의 `cat | sort` 파이프를 직접 `sort "$file"` 호출로 바꿔 CI ShellCheck 경고를 제거했습니다.

### Deployment Notes

- **DB migration**: 없음.
- **배포 순서**: v1.8.2 태그 이미지의 서버 스캔/promotion이 성공한 뒤 OCI compose stack에 반영하고, 같은 태그의 Cloudflare Pages 프론트엔드 배포 상태를 확인합니다.

### Verification

- `shellcheck scripts/*.sh deploy/oci/*.sh` — exit 0.
- `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` — passed, gitleaks found no leaks.
- `./server/gradlew -p server clean test bootJar` — v1.8.1 서버 의존성 패치 후 BUILD SUCCESSFUL.
- GitHub Actions main CI에서 v1.8.1 Scripts 잡이 ShellCheck 0.9.0 SC2002로 실패한 로그 확인 후 반영.

## v1.8.1 - 2026-05-13

### Highlights

ReadMates v1.8.1은 v1.8.0 태그의 서버 이미지가 Trivy 취약점 스캔에서 중단된 문제를 해소하는 패치 릴리스입니다. DB migration 없음. 사용자 기능 변경 없음. 서버 런타임 의존성, 스크립트 CI 호환성, 공개 release fixture 안전성만 정리했습니다.

### Fixed

- **서버 이미지 Trivy 스캔 복구**: Spring Boot를 4.0.6으로 올리고, Trivy가 지적한 Spring Security, Jackson 3, Tomcat, lz4 계열 취약 런타임 의존성이 고정/교체되도록 빌드 설정을 조정했습니다. 확인된 런타임 클래스패스는 Spring Boot 4.0.6, Spring Security web 7.0.5, Jackson 3.1.2, Tomcat 11.0.21, `at.yawk.lz4:lz4-java` 1.10.1입니다.
- **Scripts CI ShellCheck 복구**: 새 ShellCheck CI가 의도적인 SSH client-side expansion과 fixture literal을 실패로 처리하지 않도록 명시하고, `mkdir -p -m` 사용을 정리했습니다.
- **공개 release fixture 안전성 보강**: public release fixture 검증 스크립트가 정적 secret-shaped literal을 저장소에 남기지 않도록 테스트 값을 런타임에 조립합니다.

### Deployment Notes

- **DB migration**: 없음.
- **배포 순서**: 서버 이미지 스캔이 통과한 v1.8.1 태그 이미지를 먼저 OCI compose stack에 반영한 뒤, 같은 태그의 Cloudflare Pages 프론트엔드 배포 상태를 확인합니다.
- **v1.8.0 주의**: v1.8.0 GitHub Release와 프론트엔드 tag deploy는 생성됐지만, 서버 이미지 promotion은 Trivy 스캔 실패로 완료되지 않았습니다. 운영 서버에는 v1.8.1 이미지를 사용하세요.

### Verification

- `./server/gradlew -p server clean test bootJar` — BUILD SUCCESSFUL.
- `./server/gradlew -p server dependencyInsight --dependency org.springframework.boot:spring-boot --configuration runtimeClasspath` — Spring Boot 4.0.6 확인.
- `./server/gradlew -p server dependencyInsight --dependency spring-security-web --configuration runtimeClasspath` — Spring Security web 7.0.5 확인.
- `./server/gradlew -p server dependencyInsight --dependency jackson-core --configuration runtimeClasspath` — Jackson 3.1.2 확인.
- `./server/gradlew -p server dependencyInsight --dependency lz4-java --configuration runtimeClasspath` — `at.yawk.lz4:lz4-java` 1.10.1 확인.
- `./server/gradlew -p server dependencyInsight --dependency tomcat-embed-core --configuration runtimeClasspath` — Tomcat 11.0.21 확인.
- `for f in scripts/*.sh deploy/oci/*.sh; do bash -n "$f"; done && shellcheck scripts/*.sh deploy/oci/*.sh` — exit 0.
- `./scripts/build-public-release-candidate.sh` — public release candidate built at `.tmp/public-release-candidate`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` — passed, gitleaks found no leaks.
- `git diff --check` — 출력 없음.

## v1.8.0 - 2026-05-13

### Highlights

ReadMates v1.8.0은 v1.7.0 이후 누적된 운영자/사용자 가시 변경을 한 묶음으로 정리합니다. 핵심은 (1) OCI compose 배포가 attempt-stage ledger와 이미지 verification, post-deploy watch를 자동으로 실행하도록 굳어진 운영 워크플로 채택, (2) read-only 진단/수집 스크립트와 새 운영 런북 셋, (3) 셸 스크립트 syntax/shellcheck·공개 release 안전·release 이미지 Trivy 스캔을 묶은 CI 강화, (4) 공개 저장소에 프론트 테스트 산출물이 흘러 들어가지 않도록 빌더 manifest를 좁히는 위생 강화, (5) BFF 시크릿 감사 적재량을 평상시 0에 수렴시키는 audit-mode 도입과 rate-limit 필터의 다중 시크릿 신뢰 정렬, (6) 플랫폼 관리자 영속 어댑터의 Web/HTTP 의존 제거로 인한 아키텍처 경계 정리입니다. DB migration 없음.

### Fixed

- **공개 release 안전 — 프론트 테스트 산출물 누출 차단**: 공개 release 후보 빌더가 `front/test-results`, `front/playwright-report`, `front/coverage`, `front/.nyc_output` 디렉토리를 후보 tree에서 제외합니다. 같은 회귀를 막기 위한 fixture를 함께 추가했습니다.
- **rate-limit 필터의 BFF 시크릿 신뢰 정렬**: `RateLimitFilter`가 BFF 인증과 동일한 다중 시크릿 설정(`READMATES_BFF_SECRETS` + 단일 `READMATES_BFF_SECRET` fallback)을 신뢰하도록 맞췄습니다. rotation 중인 환경에서 정상 BFF 트래픽이 rate-limit 단에서 떨어질 가능성을 닫았습니다.
- **플랫폼 관리자 영속 어댑터의 Web/HTTP 의존 제거**: `JdbcPlatformAdminAdapter`가 더 이상 `HttpStatus`/`ResponseStatusException`을 던지지 않습니다. HTTP 매핑은 `PlatformAdminErrorHandler`로 이동했고, 영속 어댑터는 도메인 예외만 던집니다.
- **BFF 시크릿 감사 executor graceful shutdown (DEF-001)**: `BffSecretAuditExecutorConfig`가 `setWaitForTasksToCompleteOnShutdown=true` + `awaitTerminationSeconds=5`를 적용해 컨테이너 종료 시 큐에 남은 audit 태스크 손실을 줄입니다. 폐기 발생 시 `bff.audit.shutdown.dropped` counter가 증가합니다.
- **`READMATES_IP_HASH_BASE_SECRET` 운영 프로파일 필수화 (DEF-002)**: `ClientIpHashing` salt base secret이 운영 프로파일(`spring.profiles.active`가 비어 있거나 production 포함)에서 비어 있으면 startup이 명시적 메시지와 함께 실패합니다. local/test 등 비운영 프로파일도 기본값은 실패이며, `readmates.security.ip-hash.allow-empty-secret=true`를 명시한 경우에만 빈 값을 허용하고 WARN을 남깁니다.
- **member-app 라우트 가드의 clubSlug 우회 제거 (DEF-003)**: `RequireMemberApp` / `RequireHost`가 club slug 유무와 무관하게 `canUseMemberApp` / `canUseHostApp`을 항상 확인합니다. INACTIVE/non-member 사용자가 다른 club slug URL로 우회 진입하던 가능성을 닫았습니다.
- **AuthContext 401 처리 분리 + 리다이렉트 쿨오프 (DEF-004)**: 401 응답을 `session_expired`(만료된 세션)과 미인증으로 분리하고, 새 `AuthState` variant + `ReadMatesSessionExpiredError`를 도입했습니다. 1500ms cool-off로 redirect loop 가능성을 차단합니다.
- **알림 발송 UNKNOWN 상태 재시도 (DEF-005)**: `NotificationDispatchService`가 SMTP 결과가 `UNKNOWN`인 경우를 dead-letter가 아닌 retryable로 처리합니다. 새 counter `notification.dispatch.unknown_status`로 발생 빈도를 추적합니다.

### Documented

- **v1.7 이후 문서/코드 정합성 동기화**: README/docs 허브, 배포·운영·public-release 문서, ADR, case study를 현재 구현에 맞췄습니다. 주요 정정 범위는 BFF audit-mode 기본값(`rotation-only`), `SecretComparator` 기반 시크릿 비교, `/api/bff/__internal/secret-status`, `ClubContextSource` 기반 host fallback 처리, notification UNKNOWN 재시도, public release manifest와 frontend 산출물 제외 규칙입니다.
- **Notification outbox dedupeKey 정책 (LOGIC-001)**: dedupeKey 생성 규약과 멱등성 보장 범위를 `ADR-0015`로 명시했습니다. `NotificationEventService`의 관련 메서드 KDoc도 보강했습니다.
- **`MemberAuthoritiesFilter` null-context 분기 의도 (LOGIC-004)**: club context가 null인 경로의 의도된 동작과 fallback 의미를 KDoc + 테스트로 고정했습니다.

### Added

- **신규 메트릭 `bff.audit.shutdown.dropped`, `notification.dispatch.unknown_status`**: BFF audit executor 종료 시 폐기된 태스크 수와 UNKNOWN 상태로 재시도 분기에 진입한 이메일 발송 횟수를 각각 추적합니다.
- **BFF 진단 라우트 `GET /api/bff/__internal/secret-status`**: configured secret count, rotation stage(`stable`/`staging`), primary secret의 SHA-256 첫 6자 fingerprint만 반환합니다 — raw secret 값은 노출하지 않습니다.
- **ADR-0014/0015/0016**: BFF secret rotation lifecycle(`ADR-0014`), notification outbox dedupe policy(`ADR-0015`), deploy ledger event schema(`ADR-0016`)를 추가했습니다.
- **OCI compose 배포 attempt ledger**: `deploy/oci/05-deploy-compose-stack.sh`가 시도/스테이지/결과를 ledger 행으로 기록합니다. 각 행의 필드 의미는 `docs/operations/runbooks/deploy-attempts.md`에 정리되어 있습니다.
- **이미지 verification + post-deploy watch 자동 실행**: 배포 스크립트가 게시된 server image와 실제 실행 중 image의 mismatch를 검출해 ledger에 기록하고, 배포 직후 post-deploy watch 스크립트(`deploy/oci/watch-compose-post-deploy.sh`)를 자동으로 실행합니다. 환경 제약으로 watch가 생략된 경우에도 그 사실이 ledger에 남습니다.
- **운영 진단 스크립트**: read-only compose 진단 수집기(`deploy/oci/readmates-collect.sh`), 해당 수집기를 호스트에 설치하는 installer(`deploy/oci/install-readmates-collector.sh`), 강화된 post-deploy watch 스크립트(`deploy/oci/watch-compose-post-deploy.sh`)를 추가했습니다.
- **운영 런북 셋**: `docs/operations/runbooks/deploy-attempts.md`, `docs/operations/runbooks/post-deploy-watch.md`, `docs/operations/runbooks/read-only-diagnostics.md`와 인덱스 페이지를 추가했습니다. 공개 release 후보 manifest가 이 운영 런북을 포함하도록 함께 갱신했습니다.
- **CI 강화 잡**: 모든 셸 스크립트에 대한 `bash -n` syntax 검증과 `shellcheck` 잡, 공개 release 안전 검사 잡, release 이미지 Trivy 스캔 잡을 추가했습니다.
- **BFF 시크릿 감사 audit-mode**: `BffSecretFilter`가 `readmates.security.bff.audit-mode` 설정을 따르도록 변경됐고, 기본값은 `rotation-only`입니다. 감사 기록은 bounded `ThreadPoolTaskExecutor`로 비동기 처리됩니다.

### Changed

- 아키텍처 경계: `JdbcMemberApprovalStoreAdapter` Spring HTTP/Web 미사용 import 제거 및 baseline exception 1건 축소.
- 아키텍처 경계: `JdbcMemberLifecycleStoreAdapter` Spring HTTP/Web 미사용 import 제거 및 baseline exception 1건 축소.
- 아키텍처 경계: `JdbcMemberProfileStoreAdapter` Spring HTTP/Web 미사용 import 제거 및 baseline exception 1건 축소.
- 아키텍처 경계: `JdbcPendingApprovalStoreAdapter` Spring HTTP/Web 미사용 import 제거 및 baseline exception 1건 축소.
- 아키텍처 경계: `JdbcFeedbackDocumentStoreAdapter` Spring HTTP/Web 미사용 import 제거 및 baseline exception 1건 축소. baseline 셋이 모두 비어 있음.
- **공개 release 후보 manifest 정리**: 운영 런북을 포함하도록 manifest를 넓히는 한편, 프론트 테스트 산출물 같은 비공개 후보 디렉토리는 명시적으로 좁혔습니다.
- **BFF 시크릿 감사 기본 동작**: `bff_secret_rotation_audit` 테이블에 매 성공 요청을 적재하던 기존 동작 대신, 기본 모드 `rotation-only`에서는 rotation 확인용 비-primary alias(`secondary`, `index_N`)가 사용된 요청만 기록합니다. 모든 요청을 적재하던 기존 행동은 `audit-mode=all`로 명시 설정해야 활성화됩니다.
- **배포 ledger 필드 문서화**: deploy attempt 모델과 ledger 필드 정의를 운영 런북과 공개 문서에서 일치시켰습니다.
- **시크릿 비교 유틸리티 통합 (STRUCT-001)**: BFF 인증과 rate-limit 필터의 alias 매칭에 흩어져 있던 timing-uniform 시크릿 비교 로직을 공통 `SecretComparator`로 묶었습니다. `MessageDigest.isEqual` + 모든 후보를 끝까지 비교하는 방식은 그대로이며, 의미 변경은 없습니다. OAuth HMAC 검증 경로는 도메인이 달라 기존 구현을 유지합니다.
- **멤버 lifecycle 상태 전이 명시화 (LOGIC-002)**: 멤버 lifecycle 상태 전이를 `MemberLifecycleStatus` enum과 허용 전이 매트릭스로 명시했습니다. `JdbcMemberLifecycleStoreAdapter`가 UPDATE 전에 현재 상태를 조회해 허용되지 않은 전이를 `IllegalMemberStateTransitionException`으로 차단하며, 동시성 race는 기존 SQL `WHERE` 절이 계속 보호합니다.
- **권한 합성 로직의 application 계층 분리 (STRUCT-002)**: 권한 합성 로직을 `MemberAuthoritiesFilter`(infrastructure)에서 `AuthoritySynthesisService`(application)로 분리했습니다. filter는 transport 어댑터 역할만 수행하며 `ROLE_` 리터럴이 0개입니다. application 계층은 Spring Security `GrantedAuthority`나 web 어댑터 타입에 의존하지 않는 framework-neutral 시그니처(`Set<String>`, `ClubContextInput`)를 사용해 ArchUnit boundary를 준수합니다.
- **BFF 시크릿 rotation lifecycle 정착 (STRUCT-003)**: `front/functions/_shared/proxy.ts`에 `getConfiguredBffSecrets`, `getRotationStage`, `secretFingerprint` helper를 추가했습니다(ADR-0014 구현). 진단 라우트와 ADR 항목은 `### Added` 참고.
- **배포 ledger NDJSON 스키마 (LOGIC-005)**: `05-deploy-compose-stack.sh`/`watch-compose-post-deploy.sh`의 `remote_ledger_append`가 기존 한 줄 포맷과 NDJSON `{ts, stage, event, status, detail:{...}}`를 동시에 기록합니다(기본 `READMATES_LEDGER_FORMAT=both`, `json`/`legacy`로 단일 포맷 선택 가능). watch 스크립트는 `trap watch_on_error ERR`로 예기치 못한 실패 경로에서도 ledger 이벤트를 보장하며, `01-vm-setup.sh`가 `jq`를 함께 설치합니다. 운영 런북에 jq 쿼리 예시와 env var 의미를 보강했습니다. 스키마 규약은 `ADR-0016` 참고.
- **공개 release candidate 빌더 deny-list 우선 모델 (STRUCT-004)**: `scripts/build-public-release-candidate.sh`를 deny-list 우선 모델로 정리하고, top-level 구성을 고정하는 `scripts/fixtures/public-release-candidate-coverage.txt` fixture와 `scripts/verify-public-release-fixtures.sh`의 top-level diff 검사를 추가했습니다. `.claude/`, `.cursor/`, `.windsurf/`, `.orchestrator/`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.impeccable.md`, `*.local.md`, `CHANGELOG.md`(의도적으로 internal) 등 내부 자료를 deny-list에 명시했습니다.
- 아키텍처 경계: persistence 어댑터 Web/HTTP 의존성 5건 정리 완료, `ServerArchitectureBoundaryTest` baseline exception 리스트 0건.

### Deployment Notes

- **DB migration**: 없음.
- **신규 환경 변수**: `READMATES_LEDGER_FORMAT` (기본 `both` — NDJSON + legacy 두 라인 동시 기록, `json`/`legacy`로 단일 포맷 선택 가능), `BFF_SECRET_ROTATION_STAGE` (기본 `stable` — BFF 시크릿 rotation 단계 명시). 기존 `READMATES_IP_HASH_BASE_SECRET`은 운영 프로파일에서 필수(비어 있으면 startup 실패).
- **새 환경 변수/설정 후보**: `readmates.security.bff.audit-mode` (기본 `rotation-only`, 명시값 `all`로 모든 요청 감사 적재 복원 가능).
- **운영 프로파일 startup 변화 (DEF-002)**: `READMATES_IP_HASH_BASE_SECRET`가 비어 있으면 운영 프로파일에서 startup이 실패합니다. 배포 전 `/etc/readmates/readmates.env`에 값이 설정돼 있는지 확인하세요(`openssl rand -base64 32`로 생성, 1Password에 저장). 자세한 운영 절차는 [`docs/deploy/oci-backend.md`](docs/deploy/oci-backend.md#ip-hash-base-secret) 참고.
- **새 메트릭**: `bff.audit.shutdown.dropped` (BFF audit executor 종료 시 폐기된 태스크 — graceful shutdown 시 0이 정상), `notification.dispatch.unknown_status` (UNKNOWN 상태로 재시도 분기에 진입한 이메일 발송 횟수).
- 운영 가시성: BFF 시크릿 감사(audit-mode 기본 `rotation-only`)는 rotation 확인용 비-primary alias 사용만 기록합니다. 평상시 `bff_secret_rotation_audit` 적재량은 0에 수렴하므로 기존 알람 임계값을 점검하세요.
- **후속 권장**: 30일 이상 행을 정리하는 retention job 예시는 `docs/deploy/oci-backend.md`를 참고하세요.
- **배포 순서**: 서버 먼저, 그다음 프론트엔드. OCI compose stack 배포는 `Deploy Server Image` workflow가 scan-candidate digest를 Trivy로 검사하고 같은 digest를 release tag로 promote한 후 `./deploy/oci/05-deploy-compose-stack.sh`로 실행합니다. 이번부터는 attempt ledger 행과 이미지 verification 결과, post-deploy watch 실행 여부를 함께 확인하세요.
- **CI 동작 변화**: PR/main push에서 셸 스크립트 syntax/shellcheck, 공개 release 안전 검사, release 이미지 Trivy 스캔이 새 실패 신호로 등장할 수 있습니다.

### Verification

- `pnpm --dir front lint` — exit 0.
- `pnpm --dir front test` — 56 files / 729 tests passed.
- `pnpm --dir front build` — exit 0.
- `pnpm --dir front test:e2e` — 22 tests passed.
- `./server/gradlew -p server clean test` — BUILD SUCCESSFUL.
- `./scripts/build-public-release-candidate.sh` — public release candidate built at `.tmp/public-release-candidate`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` — passed, gitleaks found no leaks.
- `git diff --check` — 출력 없음.
- 공개 시크릿/호스트/개인 경로 스캔(`rg` 정규식) — 정책 문구, placeholder, loopback 예시만 확인됨.

## v1.7.0 - 2026-05-11

### Highlights

2026-05-11 production incident(current-session refresh 빈 화면)의 한 줄 fix와 server-side 후속 안전망(ADR-0013)을 함께 묶고, 그간의 portfolio polish — Architecture Decision Records 백필(0001~0010, 0013), Engineering Highlights와 case study deep-dive 3건, observability runbook(메트릭/대시보드/알람/SLO), incident post-mortem 실천(템플릿 + 1차 incident)을 한 릴리즈로 정착시킵니다. 사용자에게 보이는 변화는 (1) 빈 화면 incident 재발 차단, (2) `/api/auth/me`의 잘못된 club slug 명시 시 새 404 `CLUB_NOT_FOUND` 응답입니다. DB migration 없음.

### Fixed

- **2026-05-11 production incident — current-session refresh blank screen**: `clubSlug`가 route refresh event에서 누락되어 일부 라우트의 refresh path에서 빈 화면이 발생하던 회귀를 수정합니다. `front/features/current-session/route/current-session-route.tsx`가 `useParams()`의 값을 refresh handler에 명시적으로 forward하도록 조정했습니다. (post-mortem: `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`)
- **AuthMeController: slug 명시 누락 vs host fallback unknown 분리** (ADR-0013): BFF는 모든 요청에 `X-Readmates-Club-Host`를 첨부하지만 server가 host lookup miss를 supplied-with-no-context로 처리해 degraded `authenticatedUser` 응답을 내던 잠복 경로를 닫았습니다. 이제 `RequestedClubContext.source`로 분기:
  - `SLUG` 명시 + `club_domains`에 미등록 → 404 `CLUB_NOT_FOUND` (real client bug 명시).
  - `HOST_FALLBACK` + 미등록 host → unscoped 응답 (dev에서 host 헤더가 strip되어 동작하던 unscoped 경로와 일치).
  - "club 존재 + 사용자 미가입" 케이스는 기존 degraded UX 보존 (의도된 동작).

### Added

- **Architecture Decision Records 셋**: `docs/development/adr/`에 backfill 10개(`0001`~`0010`)와 신규 `0013-bff-host-header-policy.md`를 함께 정착. 인덱스(`README.md`), 작성 규약, 템플릿, 상태 라벨, 후보 ADR 목록을 포함합니다. ADR-0011(jOOQ migration)과 0012(Redis adoption)는 follow-up 후보로 등록.
- **Engineering Highlights + Case studies**: README 최상단에 **Engineering Highlights** 섹션을 추가해 운영 중 풀어낸 비자명한 문제 3건을 case study deep-dive로 연결합니다. `docs/case-studies/`에 BFF 보안과 secret rotation, notification outbox pipeline, multi-club domain platform 3건의 deep-dive를 추가 — 각 case는 문제 → 접근 → 구현 → 검증 → trade-off → 다시 한다면 흐름을 따르며, case 03은 2026-05-11 incident의 root cause와 영구 수정 서사를 담습니다.
- **Observability runbook** (`docs/operations/observability/`): 진입 README, 19개 custom 메트릭 카탈로그(근원 코드 인용), 22개 권장 dashboard panel(PromQL), 11개 alertmanager rule candidate, 3개 SLO 정의(API availability, read latency, notification delivery latency). `docs/operations/README.md` 진입점도 함께. 코드 변경 없음 — 현재 배포된 메트릭과 권장 구성만 정리.
- **Incident post-mortem 실천** (`docs/operations/postmortems/`): 디렉토리, 템플릿, severity 정의(SEV1~SEV4), 첫 incident(2026-05-11 current-session refresh club context degradation, SEV2)를 함께 등록. Post-mortem follow-up 갱신 이력 섹션으로 후속 변경 추적을 영구 보존합니다.
- **서버 코드**: `com.readmates.club.adapter.in.web.ClubContextSource` enum(SLUG / HOST_FALLBACK / NONE)과 `RequestedClubContext.source` 필드. 현재 `AuthMeController`만 분기에 사용; 다른 컨슈머(`CurrentMemberArgumentResolver`, `MemberAuthoritiesFilter`, `SessionCookieAuthenticationFilter`)는 후속 audit 대상으로 ADR-0013 후속 섹션에 명시.
- **테스트**: `ResolveClubContextRequestExtensionTest` (6 시나리오 — slug/host/neither/both × hit/miss)와 `AuthMeControllerTest`의 HOST_FALLBACK 시나리오 2건.

### Changed

- 2026-05-11 post-mortem의 Action items 표가 라운드 후속 평가 결과를 반영합니다 — #3 Closed (`READMATES_ROUTE_REFRESH_EVENT` grep audit 단일 사용처 확인), #2 Closed (ADR-0013 머지), #1 Deferred (parity test 시급성 재평가).
- 공개 저장소 위생 기준을 정리해 `.orchestrator/**`와 `.claude/settings.json`을 Git 추적 대상에서 제거하고, `.gitignore`에 `.claude/`와 `.orchestrator/`를 명시했습니다.
- `docs/improvements.md`의 workstation 절대경로를 repo-relative path로 바꾸고, release/public-safety 문서에 GitHub Release 누락 복구와 ignored 파일 제외 검증 기준을 보강했습니다.

### Deployment Notes

- **DB migration**: 없음. Flyway 버전 변경 없음.
- **배포 순서**: 서버 먼저(auth contract에 새 404 응답 경로 추가). 프론트는 새 응답을 만들지 않으므로 영향 없음 — 단 안전을 위해 server → frontend 순서를 권장합니다. release tag push가 `deploy-server.yml`(GHCR image publish)과 `deploy-front.yml`(Cloudflare Pages production deploy) workflow를 함께 시작합니다. OCI compose stack 배포는 `Deploy Server Image` workflow가 GHCR에 같은 tag image를 게시한 후 `./deploy/oci/05-deploy-compose-stack.sh`로 수동 실행합니다.
- **새 환경 변수**: 없음.
- **운영 smoke check 기대값**:

```text
GET /api/bff/api/auth/me                      (anonymous)              -> 200 (authenticated:false)
GET /api/bff/api/auth/me                      (logged-in, valid slug)  -> 200 (currentMembership present)
GET /api/bff/api/auth/me                      (logged-in, unknown slug) -> 404 {"code":"CLUB_NOT_FOUND"}   # 신규
GET /api/bff/api/auth/me                      (logged-in, no headers)   -> 200 (unscoped)
GET /api/bff/api/public/club                  (anonymous)              -> 200
GET /api/bff/api/sessions/upcoming            (anonymous)              -> 401
```

- **Production manual repro**: `https://readmates.pages.dev/clubs/reading-sai/app/session/current` 접근 → 멤버 로그인 → reading progress 조정 + 저장 → 빈 화면 미재발 확인.

### Verification

- `./server/gradlew -p server clean test` — BUILD SUCCESSFUL (707+ tests passing, no regression).
- `pnpm --dir front lint` — exit 0
- `pnpm --dir front test` — 706 passing / 53 files
- `pnpm --dir front build` — exit 0
- `./scripts/public-release-check.sh` — passed (gitleaks + 7 targeted content rules clean)
- `./scripts/verify-public-release-fixtures.sh` — passed
- **Skipped**: `pnpm --dir front test:e2e` — 이번 릴리즈 준비 환경에 e2e용 MySQL(:3306) + Spring + Vite dev 서버 오케스트레이션이 활성화되어 있지 않아 실행하지 못했습니다. 잔여 리스크: 새 404 응답이 프론트엔드에서 어떻게 표시되는지 e2e로 검증하지 못함. 단 (1) 현재 client 코드는 의도적으로 잘못된 slug를 보내지 않으며 grep audit으로 0건 확인, (2) Zod schema fixture는 변경 없음, (3) 서버 단위 + 통합 테스트가 새 분기를 cover합니다. 배포 후 위 production manual repro로 보완 권장.

## v1.6.0 - 2026-05-09

### Highlights

보안 강화, BFF secret 무중단 rotation, 성능 개선, 아키텍처 정리를 포함한 대규모 업데이트입니다. DB migration 3개(V24 legacy password rename, V25 drop, V26 BFF rotation audit)가 포함되며, 신규 환경 변수 `READMATES_IP_HASH_BASE_SECRET`가 추가됩니다.

### Security

- BFF secret 무중단 rotation 지원: `READMATES_BFF_SECRETS` 환경 변수에 쉼표로 구분된 여러 시크릿을 설정할 수 있습니다. 기존 `READMATES_BFF_SECRET`은 fallback으로 계속 동작합니다. 매칭은 timing-safe 방식으로 모든 후보를 끝까지 비교합니다.
- BFF rotation 감사 로그: 인증 성공 요청마다 사용된 secret alias("primary"/"secondary"/"index_N")를 `bff_secret_rotation_audit` 테이블에 비동기로 기록합니다. rotation 중 old-secret 트래픽이 0으로 떨어진 시점을 SQL로 확인할 수 있습니다. (V26 migration)
- `ClientIpHashing.kt`를 추가해 `RateLimitFilter`의 IP 해시 salt를 ISO 주차 기준으로 자동 rotate합니다. base secret은 `READMATES_IP_HASH_BASE_SECRET` 환경 변수로 주입하며, 미설정 시 빈 문자열 fallback을 사용하고 startup 시 WARN을 출력합니다. (TASK-V2-028)
- Spring Security role hierarchy를 `ROLE_PLATFORM_ADMIN > ROLE_MEMBER`, `ROLE_HOST > ROLE_MEMBER`로 정리했습니다. (TASK-V2-005)
- Set-Cookie `Domain` 속성 stripping fix를 적용해 cross-origin cookie 노출을 방지합니다. (TASK-V2-004)
- Support access grants: platform admin이 활성 `HOST_SUPPORT_READ` grant를 가지면 `CheckSupportAccessGrantUseCase`가 합성 HOST membership을 부여합니다. `MemberAuthoritiesFilter`, `CurrentMemberArgumentResolver`, `ClubContextResolver.kt`가 갱신됐습니다. (TASK-V2-024)
- Sessions invariant enforcement: 세션 상태 전이 불변식을 서버에서 검증합니다. (TASK-V2-003)

### Performance

- `CachedNotificationBacklogProvider.kt`를 추가해 notification backlog gauge를 1분 주기 scheduled refresh로 캐싱합니다. `ReadmatesOperationalMetrics`가 캐시된 snapshot을 사용합니다. (TASK-V2-001)
- 공개 endpoint에 `Cache-Control` 헤더를 추가하고 BFF cache를 연동했습니다. (TASK-V2-002)
- 프런트엔드 route lazy loading을 적용해 초기 번들 크기를 줄였습니다. (TASK-V2-019)
- archive detail batching으로 상세 페이지 API 호출 수를 줄였습니다. (TASK-V2-020)
- `HostSessionEditor`에 `useReducer` + `memo`를 적용해 불필요한 re-render를 제거했습니다. (TASK-V2-021)
- Dynamic CORS origins 지원을 추가했습니다. (TASK-V2-016)

### Removed

- Legacy password column dropped from `users` table (Flyway V24+V25 deployed together).
- `POST /api/auth/password-reset/{token}` and `POST /api/host/members/{id}/password-reset` endpoints removed (previously returned 410 GONE; now 404).

### Deployment Notes

**서버 배포 순서**

1. `/etc/readmates/readmates.env`에 신규 환경 변수 추가:
   ```
   READMATES_IP_HASH_BASE_SECRET=<openssl rand -base64 32으로 생성>
   ```
2. GHCR image `ghcr.io/<owner>/readmates-server:v1.6.0` pull 후 compose stack 재시작.
3. Flyway V24, V25, V26 migration 자동 적용 확인.
4. `/internal/health` 및 BFF smoke 확인.

**Flyway migration**

| 버전 | 내용 |
| --- | --- |
| V24 | `users.password_hash` → `legacy_password_hash` rename |
| V25 | `legacy_password_hash`, `legacy_password_set_at` drop |
| V26 | `bff_secret_rotation_audit` 테이블 생성 (감사 로그) |

**프론트엔드**

v1.6.0 tag push로 GitHub Actions `deploy-front.yml`이 Cloudflare Pages 배포를 자동 실행합니다. `zod`가 devDependency로 추가됐으므로 빌드 시 `pnpm install`이 정상 실행돼야 합니다.

### Verification

- 서버 테스트: 707개 통과 (baseline 696 + 11)
- 프론트 테스트: 705개 통과 (baseline 697 + 8)
- TypeScript 오류: 36개 (pre-existing, 신규 없음)

## v1.5.2 - 2026-05-06

### Fixed

- `Deploy Server Image` workflow의 Docker action pin을 Node.js 24 기반 release로 갱신해 GitHub Actions Node.js 20 deprecation warning을 제거했습니다.

## v1.5.1 - 2026-05-06

### Highlights

ReadMates v1.5.1은 v1.5.0 배포 중 확인된 server image release workflow 문제를 고친 patch release입니다. 애플리케이션 런타임 동작은 v1.5.0과 같고, GHCR server image를 OCI A1 VM에서 바로 실행할 수 있는 ARM64 image로 tag 기준 재현 가능하게 게시합니다.

### Fixed

- `Deploy Server Image` workflow의 `docker/login-action` pin을 실제 `v3.6.0` commit으로 고쳐 GHCR server image 게시가 tag/manual dispatch에서 시작되도록 했습니다.
- GHCR server image를 OCI A1 VM과 맞는 `linux/arm64` platform으로 게시하도록 QEMU/Buildx 설정을 추가했습니다.
- Release image workflow는 native runner에서 `bootJar`를 만든 뒤 별도 runtime Dockerfile로 ARM64 image를 조립해 Gradle build가 QEMU emulation에 묶이지 않게 했습니다.

## v1.5.0 - 2026-05-06

### Highlights

ReadMates v1.5.0은 서버, Cloudflare Pages Functions, 프런트엔드가 같은 public-safe API 오류 계약을 사용하도록 맞춘 릴리즈입니다. 사용자는 403/404/409/410/5xx 상황에서 내부 예외나 인프라 세부사항 대신 route context에 맞는 안전한 오류 화면을 보게 됩니다.

운영 측면에서는 GHCR server image 게시 workflow와 OCI compose image tag 배포 기준을 정리했고, 기본 Playwright E2E 실행이 오래된 로컬 Flyway schema history에 막히지 않도록 현재 migration fingerprint 기반 schema를 사용합니다.

### Added

- 서버 이미지를 GitHub Container Registry에 게시하는 `Deploy Server Image` workflow를 추가했습니다. Release tag push와 수동 `image_tag` 입력 모두 같은 Docker tag 검증 경로를 사용합니다.
- 공개 archive/public visibility regression coverage와 BFF header/club slug regression coverage를 추가했습니다.
- 알림 이메일 delivery를 dispatch path와 pending worker path가 공유하는 `NotificationDeliveryEngine`으로 분리하고 retry/dead 전환, redacted error 저장, metrics/logging을 한 곳에서 처리합니다.
- HostDashboard, MyPage, HostSessionEditor, HostMembers UI를 route/API 호출 없는 작은 presentation module로 분리했습니다.
- Spring API 오류 응답을 public-safe `{ code, message, status }` JSON body로 통일하는 shared `ApiErrorResponse`와 feature별 error handler coverage를 추가했습니다.
- Cloudflare Pages Functions BFF 자체 400/403/404 거절도 같은 오류 body shape를 반환하도록 shared error helper를 추가했습니다.
- React Router root/member/host/public/auth route error boundary와 unmatched route용 `NotFoundRoute`를 추가했습니다.
- Playwright E2E 기본 database 이름을 현재 운영 migration과 dev seed SQL fingerprint 기반으로 정하는 regression coverage를 추가했습니다.

### Changed

- 운영 Flyway source of truth를 `server/src/main/resources/db/mysql/migration`으로 고정하고, 사용하지 않는 `server/src/main/resources/db/migration` tree를 제거했습니다.
- 서버 application layer가 Spring Security/Web/JDBC 세부사항에 직접 의존하지 않도록 경계를 강화하고, persistence adapter는 필요한 `JdbcTemplate`을 직접 주입받아 wiring 오류를 빠르게 드러내도록 정리했습니다.
- Cloudflare Pages Functions와 Vite proxy가 같은 club slug validation helper를 사용하게 했고, auth API helper는 raw `401`을 유지해야 하는 preview/logout 흐름과 일반 BFF fetch 흐름을 분리했습니다.
- OCI compose release deploy는 GHCR image tag를 VM에서 pull하고, 로컬 non-GHCR tag는 build/save/load 전환 검증 경로로 남깁니다.
- Vite frontend source에서 불필요한 `"use client"` directive를 제거하고 agent guide에 재도입 금지 기준을 추가했습니다.
- 공개 릴리즈 후보 builder가 server image workflow도 후보 tree에 포함하도록 manifest를 갱신했습니다.
- 프런트엔드 `shared/api` parser가 non-OK 응답을 `ReadmatesApiError`로 변환하고, empty 또는 malformed response body는 HTTP status 기준 fallback code/message로 안전하게 처리합니다.
- Route error UI는 HTTP status와 public/member/host/auth context를 기준으로 안내 문구와 복귀 버튼을 선택하되, 공개 세션 없음이나 피드백 문서 unavailable 같은 feature-specific 상태는 각 feature가 계속 소유합니다.

### Fixed

- Redis Testcontainers가 `localhost`를 반환할 때 Redis URL host를 `127.0.0.1`로 정규화해, 로컬 IPv6 `localhost`의 다른 서비스와 mapped port가 겹치는 테스트 flake를 줄였습니다.
- 로그는 BFF secret rejection, notification relay/delivery, session lifecycle의 운영 이벤트를 남기되 raw secret, token, recipient 원문 같은 민감 값을 기록하지 않도록 보강했습니다.
- 기본 `pnpm --dir front test:e2e`가 오래된 로컬 `readmates_e2e` schema의 Flyway checksum mismatch에 막히던 리스크를 제거했습니다. 명시적 `READMATES_E2E_DB_NAME` override는 그대로 유지됩니다.

### Deployment Notes

이 변경 묶음은 새 운영 DB schema migration을 추가하지 않습니다. 사용하지 않는 legacy `server/src/main/resources/db/migration` tree를 제거했지만 운영 Flyway 경로는 `server/src/main/resources/db/mysql/migration`입니다.

서버 API, Cloudflare Pages Functions, 프런트엔드 route/API parser가 함께 바뀌므로 서버와 프런트엔드를 같은 `v1.5.0` tag 기준으로 배포합니다. 먼저 `Deploy Server Image` workflow로 `ghcr.io/<owner>/<repo>/readmates-server:v1.5.0` 이미지를 게시하고, OCI compose backend는 그 image tag를 pull해 배포합니다. 이후 같은 tag의 Cloudflare Pages frontend/Functions 배포가 완료됐는지 확인합니다.

배포 후에는 Spring `/internal/health`, Pages `/api/bff/api/auth/me`, OAuth start redirect, public club API, 그리고 public 404 route error 화면을 smoke합니다. 비정상 응답 body는 stack trace, SQL detail, upstream host, secret, token 원문, 내부 exception class name을 포함하지 않는 `{ code, message, status }` shape여야 합니다.

### Verification

- `pnpm --dir front lint`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test` - 50 files, 660 tests passed
- `pnpm --dir front build`
- `pnpm --dir front test:e2e` - 22 tests passed
- `git diff --check -- docs/development/architecture.md`
- `git diff --check -- docs/development/test-guide.md docs/superpowers/plans/2026-05-06-readmates-error-boundary-contract-implementation-plan.md front/playwright.config.ts front/tests/e2e/readmates-e2e-config.ts front/tests/e2e/readmates-e2e-db.ts front/tests/unit/playwright-e2e-config.test.ts`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.4.2 - 2026-05-05

### Added

- 대형 HostDashboard, MyPage, HostSessionEditor 컴포넌트 분리를 위한 후속 계획서 3개를 추가했습니다. 각 계획서는 characterization test, 명시적 검증 명령, rollback 기준을 포함합니다.
- 프런트엔드 route continuity/auth guard unit coverage를 확장해 route state parsing, storage, `returnTo` 보존 흐름을 더 구체적으로 검증합니다.

### Changed

- Notification email delivery retry delay를 `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES`로 설정할 수 있게 했습니다.
- 로컬 `compose.yml`의 MySQL database/user/password/port 기본값을 root `.env`로 override할 수 있게 했고, `.env.example`과 local setup 문서에 public-safe sample을 추가했습니다.
- Host route state 타입을 shared helper로 정리해 host dashboard/session editor link state 중복을 줄였습니다.

### Fixed

- Profile PATCH API가 무세션 요청을 Spring Security 단계에서 빈 `401`로 차단하면서, 인증된 사용자의 membership/status/role 판단은 기존 service boundary에서 유지되도록 했습니다.
- OAuth return-state signing secret이 비어 있으면 production runtime이 fallback 없이 실패하도록 보강했습니다.
- Notification DLT recoverer가 원본 Kafka partition을 명시해 partition 검증을 건너뛰지 않도록 했습니다.
- 초대 email 길이를 persistence 전에 검증해 DB 길이 제한 초과가 structured invitation error로 반환되도록 했습니다.

### Deployment Notes

이 릴리즈는 서버 인증/알림 코드, 프론트엔드 route state helper, 로컬 Compose 설정, 문서와 테스트 계획을 함께 포함합니다. DB migration은 없고, 운영 DB가 `v1.4.1` 기준 Flyway 상태라면 추가 schema migration 없이 앱을 시작할 수 있습니다.

운영 서버에는 `readmates-server:v1.4.2` image를 배포해야 합니다. `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES`는 email delivery retry 간격을 조정하는 선택 설정이며, 값을 지정하지 않으면 기본 `5,15,60,240`분을 사용합니다.

권장 순서는 서버 backend image를 `v1.4.2`로 먼저 배포하고 `/internal/health`, BFF auth smoke, OAuth start smoke를 확인한 뒤, `v1.4.2` tag push로 Cloudflare Pages frontend와 Pages Functions 배포를 시작하는 방식입니다. Profile PATCH 무세션 요청은 빈 `401`로 차단되는 것이 정상 기대값입니다.

### Verification

- `./server/gradlew -p server clean test`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `READMATES_E2E_DB_NAME=readmates_e2e_v142_permission_check pnpm --dir front test:e2e` - 로컬 MySQL 3306에서 22 tests passed
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- `git diff --check -- CHANGELOG.md docs/deploy/oci-backend.md docs/development/local-setup.md docs/development/test-guide.md .env.example compose.yml`

## v1.4.1 - 2026-04-30

### Highlights

ReadMates v1.4.1은 알림 이메일의 브랜드 표기와 문구를 클럽 중심으로 다듬는 patch release입니다. 테스트 preview는 샘플 클럽명 `읽는사이`로 렌더링하고, 실제 이벤트 메일은 DB의 `clubs.name`을 사용합니다.

### Added

- 알림 이메일 샘플 5종을 한 화면에서 확인할 수 있는 테스트 전용 HTML preview report를 추가했습니다.

### Changed

- 알림 이메일 상단 브랜드, plain text 첫 줄, 테스트 메일 제목/본문, footer가 `ReadMates` 고정값 대신 클럽명을 사용합니다.
- 일반 알림 이메일의 닫는 문구를 `다음 모임과 읽기 흐름에 맞춰 소식을 전합니다.`로 변경했습니다.
- 모임 리마인더, 피드백 문서, 새 서평 알림 summary를 제품명보다 클럽 맥락이 드러나는 자연스러운 안내 문구로 정리했습니다.
- 다음 책 공개 CTA를 `ReadMates에서 회차 확인하기`에서 `회차 확인하기`로 줄였습니다.

### Fixed

- 실제 알림 이벤트 메일 렌더링 경로가 `clubs.name`을 함께 로드하도록 보강해, 클럽별 이메일 copy가 올바른 이름으로 렌더링됩니다.

### Deployment Notes

이 릴리즈는 서버 알림 템플릿 코드와 테스트 전용 preview report만 변경합니다. DB migration은 없고, Cloudflare Pages frontend code 변경도 없습니다.

운영 이메일 copy를 반영하려면 서버 backend image를 `readmates-server:v1.4.1`로 재배포해야 합니다. `v1.4.1` tag push는 Cloudflare Pages workflow를 실행하지만, 서버 컨테이너 교체를 대신하지 않습니다.

### Verification

- `./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEmailTemplatesTest' --tests 'com.readmates.notification.application.model.NotificationEmailTemplatePreviewTest'`
- `./server/gradlew -p server test --tests 'com.readmates.notification.*'`
- `./server/gradlew -p server clean test`
- `./server/gradlew -p server bootJar`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- `git diff --check`

## v1.4.0 - 2026-04-30

### Highlights

ReadMates v1.4.0은 운영 배포 경로를 OCI Docker Compose stack 기준으로 정리하고, 멤버가 받는 이메일 알림을 plain text fallback이 있는 HTML 템플릿으로 개선한 릴리즈입니다. 로그인 필요 화면에서 로그인 후 원래 앱 경로로 돌아오는 흐름도 safe `returnTo` 기준으로 정리했습니다.

### Added

- OCI backend Docker Compose stack 전환 보고서를 추가해 Caddy/Spring/Redis/Redpanda cutover, BFF secret 불일치 원인, 검증 명령, 후속 운영 과제를 공개-safe placeholder 기준으로 기록했습니다.
- 알림 이메일 subject/plain/HTML copy를 함께 렌더링하는 서버 템플릿 helper와 SMTP MIME 발송 경로를 추가했습니다.
- Docker 기반 OCI compose backend runtime과 versioned server image 배포 절차를 추가했습니다.
- 제품 릴리즈 버전 source of truth, server/frontend 공통 tag 기준, OCI server image tag 기준을 정리한 [버저닝 문서](docs/development/versioning.md)를 추가했습니다.

### Changed

- 현재 운영 runbook과 README 링크를 v1.3.0 이후 기준에 맞춰 Cloudflare Pages + OCI Compose stack 중심으로 정리했습니다. Legacy Spring Boot JAR 배포는 compose cutover 검증과 rollback 경로로만 문서화합니다.
- 로그인 guard, loader, API 401, dev-login, OAuth 시작 흐름이 안전한 relative `returnTo`만 보존하도록 정리했습니다.
- 호스트 테스트 메일은 redesigned template path를 사용하고, 실제 알림 이메일은 HTML body와 plain text fallback을 함께 발송합니다.
- Cloudflare Pages Functions의 BFF/OAuth proxy helper가 upstream origin, trusted forwarding header, internal response header stripping을 일관되게 처리하도록 정리했습니다.
- 릴리즈 배포 시 서버 image tag를 제품 tag와 맞춰 `readmates-server:vMAJOR.MINOR.PATCH`로 지정하는 기준을 문서화했습니다.

### Fixed

- Cloudflare Pages Functions는 `READMATES_API_BASE_URL`의 query string/fragment를 upstream origin으로 전달하지 않고, BFF secret source를 dedicated `READMATES_BFF_SECRET` 하나로 고정합니다.
- Compose Caddy와 legacy rollback Caddy 문서 기준을 request URI와 `Authorization`, `Cookie`, `X-Readmates-Bff-Secret` request header 미기록으로 맞췄습니다.
- 호스트 알림 상세 API가 raw plain/HTML 이메일 본문을 노출하지 않도록 문서화된 privacy boundary를 맞췄습니다.
- Kafka notification publisher adapter autowiring 경계를 정리해 Kafka flag가 꺼진 환경에서 불필요한 publisher bean 요구를 피합니다.

### Deployment Notes

이 릴리즈는 서버 코드, Cloudflare Pages Functions, 프론트엔드 route/auth 흐름, OCI backend compose 배포 스크립트를 함께 포함합니다. 권장 순서는 서버 compose stack을 `READMATES_SERVER_IMAGE=readmates-server:v1.4.0`으로 먼저 배포한 뒤 `v1.4.0` tag push로 Cloudflare Pages frontend와 Pages Functions를 배포하는 방식입니다.

`v1.3.0` 이후 새 Flyway migration 파일은 없습니다. 운영 DB는 기존 `V22 / note_count_query_indexes`까지 성공한 상태면 추가 schema migration 없이 앱을 시작할 수 있습니다. 그래도 서버 배포 전에는 기존 운영 백업 기준을 따르고, 배포 후 `/internal/health`, Cloudflare BFF auth smoke, OAuth start smoke를 확인합니다.

Frontend production 배포는 `v1.4.0` tag push가 `.github/workflows/deploy-front.yml`을 실행하면서 시작됩니다. `main` push만으로는 Cloudflare Pages production 배포가 시작되지 않습니다.

권장 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
READMATES_SERVER_IMAGE=readmates-server:v1.4.0 VM_PUBLIC_IP='<vm-public-ip>' CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
git tag -a v1.4.0 -m "ReadMates v1.4.0"
git push origin main
git push origin v1.4.0
```

운영 smoke:

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test` - 49 files, 636 tests passed
- `pnpm --dir front build`
- `READMATES_E2E_DB_NAME=readmates_e2e_codex_shortname5 pnpm --dir front test:e2e` - 22 tests passed
- `./server/gradlew -p server clean test`
- `./server/gradlew -p server bootJar`
- `git diff --check -- <changed-docs>`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.3.0 - 2026-04-30

### Highlights

ReadMates v1.3.0은 단일 독서모임 앱을 멀티 클럽 운영 플랫폼으로 확장하고, 알림 운영과 읽기 성능을 운영 가능한 수준으로 끌어올린 릴리즈입니다. 멤버는 인앱/이메일 알림을 관리할 수 있고, 호스트는 알림 ledger와 테스트 메일을 확인할 수 있으며, 운영자는 클럽 도메인과 플랫폼 관리자 흐름을 다룰 수 있습니다.

### Added

- Redis 기반 session/rate-limit/public/notes read cache foundation을 추가했습니다. 기본값은 꺼져 있으며, 운영에서 `READMATES_REDIS_ENABLED`와 세부 cache flag를 켤 때만 Redis가 필수입니다.
- MySQL event outbox와 Kafka relay/consumer 기반 알림 pipeline을 추가했습니다.
- 멤버 인앱 알림함과 알림 읽음 처리 API를 추가했습니다.
- 멤버 My Page에서 이메일 알림 전체 설정과 이벤트별 수신 설정을 저장할 수 있게 했습니다.
- 호스트 알림 운영 페이지(`/app/host/notifications`)를 추가해 outbox 목록, 상세, 개별 retry, `DEAD` 복구, 고정 템플릿 테스트 메일, 테스트 메일 audit을 확인할 수 있게 했습니다.
- 발행된 회차에 공개 장문 서평이 처음 저장되면 opt-in 멤버에게 `REVIEW_PUBLISHED` 알림을 생성합니다.
- 플랫폼 관리자 shell과 클럽 도메인 provisioning 상태 확인 UI/API를 추가했습니다.
- 클럽 slug와 registered host를 기준으로 public/app route를 scope하는 멀티 클럽 URL 구조를 추가했습니다.
- 커서 pagination primitive와 host/member archive, notes, feedback, notification 목록 pagination을 추가했습니다.
- MySQL query budget, Flyway migration, Redis, Kafka, 멀티 클럽 user-flow regression test를 추가했습니다.
- 운영 metrics, Object Storage 백업 스크립트, production integration smoke 스크립트를 추가했습니다.
- 단일 VM 저사용량 운영을 위한 Redis/Redpanda 보조 인프라 compose 예시(`deploy/oci/compose.infra.yml`)를 추가했습니다.
- MySQL Flyway migration `V16__notification_outbox.sql`부터 `V22__note_count_query_indexes.sql`까지 추가했습니다.

### Changed

- 로그인 후 클럽이 하나면 해당 클럽 앱으로, 여러 개면 클럽 선택 화면으로 진입하도록 app entry 흐름을 바꿨습니다.
- OAuth 시작/콜백 proxy가 club path와 registered host return target을 보존하도록 정리했습니다.
- 기존 `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED` 알림 생성은 멤버의 전역/이벤트별 알림 선호도를 반영합니다.
- 호스트 알림 API 응답은 recipient email을 masked 값으로 반환하고, detail metadata는 allowlist된 제품 metadata만 노출합니다.
- Archive, public, notes, host dashboard persistence query를 feature-local query class로 분리하고 hot path index를 추가했습니다.
- 서버 web adapter는 application exception을 feature별 error handler로 mapping하도록 정리했습니다.
- 프론트엔드 host UI와 route action/data 경계를 feature `route`/`ui` 구조로 정리했습니다.
- 공개 canonical URL, Pages Functions BFF header forwarding, OAuth proxy helper를 멀티 클럽 운영 기준에 맞게 정리했습니다.

### Fixed

- host pagination cursor가 route 전환 뒤 stale state로 남을 수 있는 문제를 수정했습니다.
- 빈 notes deep link와 archive paging consumer가 이전 API shape를 가정하던 문제를 수정했습니다.
- notification retry, delivery metrics, event payload persistence, Kafka publisher/consumer retry, DLQ wiring을 안정화했습니다.
- notification privacy field와 test mail error가 raw recipient 정보를 노출할 수 있는 경계를 막았습니다.
- mobile host/member notification tab과 responsive navigation regression을 수정했습니다.
- frontend router warning과 Playwright color env warning을 제거했습니다.

### Deployment Notes

이 릴리즈는 서버 API, DB migration, Pages Functions, 프론트엔드 route가 함께 바뀝니다. 프론트엔드만 먼저 배포하면 새 UI가 이전 서버에 멀티 클럽, 알림, pagination API를 호출하면서 `404` 또는 `405`를 볼 수 있습니다. 권장 순서는 서버 선배포 후 release tag push로 Cloudflare Pages 프론트엔드를 배포하는 방식입니다.

운영 DB는 Spring Boot 시작 시 Flyway가 MySQL migration `V22 / note_count_query_indexes`까지 적용해야 합니다. `V16`부터 `V22`까지는 새 알림/도메인/감사용 테이블과 여러 index를 만들므로 서버 배포 전에 운영 DB 백업 또는 snapshot을 만들고, 배포 직후 `flyway_schema_history`에서 `success=1`인 최신 migration이 `22 / note_count_query_indexes`인지 확인합니다. 큰 테이블이 있는 운영 DB에서는 index 생성 시간이 애플리케이션 시작 시간을 늘릴 수 있습니다.

운영 환경 변수 확인이 필요합니다.

- 기본 배포에서는 `READMATES_NOTIFICATIONS_ENABLED=false`, `READMATES_KAFKA_ENABLED=false`, `READMATES_REDIS_ENABLED=false`, cache/rate-limit/session-cache flag도 false로 둘 수 있습니다.
- 알림 발송을 켜려면 Kafka bootstrap/topic/DLQ/consumer group, SMTP host/user/password/sender, notification worker/attempt 값을 VM env에 넣은 뒤 켭니다.
- Redis cache나 rate limit을 켜려면 `READMATES_REDIS_URL`과 관련 enable flag를 같이 설정합니다. Redis를 켜고 endpoint가 죽어 있으면 health check와 runtime path가 실패할 수 있습니다.
- 멀티 클럽 도메인을 운영하려면 Cloudflare Pages custom domain 연결, Google OAuth callback, `READMATES_AUTH_BASE_URL`, `READMATES_ALLOWED_ORIGINS`, `VITE_PUBLIC_PRIMARY_DOMAIN`을 같은 rollout로 맞춥니다.
- management/metrics endpoint는 `READMATES_MANAGEMENT_ADDRESS=127.0.0.1`, `READMATES_MANAGEMENT_PORT=8081`로 VM loopback에만 바인딩합니다.

권장 순서:

1. 서버와 프론트엔드 검증을 실행합니다.
2. 운영 DB 백업 또는 snapshot을 만듭니다.
3. 운영 VM의 `/etc/readmates/readmates.env`에 새 optional env 값을 확인하거나 추가합니다.
4. Spring Boot JAR를 빌드하고 운영 VM에 먼저 배포합니다.
5. 서버 로그에서 Flyway가 `v22`까지 성공했고 애플리케이션이 정상 기동했는지 확인합니다.
6. `v1.3.0` tag를 push해 Cloudflare Pages 프론트엔드와 Pages Functions 배포를 시작합니다.
7. 공개 club route, OAuth start, 멤버 앱 entry, 클럽 선택, 호스트 알림 페이지, 멤버 알림함, platform admin guard를 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

운영 DB 확인 예시:

```sql
select version, description, success, installed_on
from flyway_schema_history
order by installed_rank desc
limit 10;
```

운영 smoke 예시:

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test` - 48 files, 622 tests passed
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e` - 22 tests passed
- `./server/gradlew -p server bootJar`
- `git diff --check -- CHANGELOG.md .env.example docs/deploy/oci-backend.md deploy/oci/compose.infra.yml docs/superpowers/plans/2026-04-30-readmates-architecture-refactor-detailed-implementation-plan.md`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.2.0 - 2026-04-25

### Highlights

ReadMates v1.2.0은 호스트의 세션 기록 발행 lifecycle을 명시적으로 분리한 릴리즈입니다. 호스트는 진행 중인 세션을 닫은 뒤 기록을 저장하고, 준비가 끝난 기록만 멤버/공개 표면에 발행할 수 있습니다. 멤버 홈, 아카이브, 노트, 공개 페이지는 `PUBLISHED` 상태와 공개 범위에 맞춰 기록을 더 일관되게 보여줍니다.

### Added

- 호스트 세션을 `OPEN`에서 `CLOSED`로 전환하는 API와 서버 검증을 추가했습니다.
- 닫힌 세션 기록을 `PUBLISHED`로 발행하는 API와 서버 검증을 추가했습니다.
- 호스트 세션 편집 화면에 닫기, 저장, 발행 흐름을 연결했습니다.
- 공개 릴리스 tag push로 Cloudflare Pages 프론트엔드 배포를 시작하는 workflow를 추가했습니다.
- 닫힌 기록과 발행된 기록이 아카이브/노트/공개 표면에서 다르게 보이는 regression test를 추가했습니다.

### Changed

- 공개 API는 `public_session_publications.visibility=PUBLIC`뿐 아니라 세션 상태가 `PUBLISHED`인 기록만 반환하도록 강화했습니다.
- 멤버 아카이브와 세션 상세의 기록 badge가 공개 범위가 아니라 lifecycle 상태를 기준으로 표시되도록 정리했습니다.
- 호스트 세션 편집 화면에서 host-only 기록은 외부 발행 action을 막고 저장 전환만 허용하도록 정리했습니다.
- 현재/예정/기록 세션 identity, 모바일 action label, 노트 필터, 아카이브 header copy를 더 짧고 일관되게 다듬었습니다.
- 공개 홈, 공개 클럽, 로그인 진입 copy를 초대 기반 독서모임 톤에 맞춰 조정했습니다.

### Fixed

- `CLOSED` 상태의 공개 범위 기록이 발행 전 공개 상세나 노트 표면에 보일 수 있는 경계를 막았습니다.
- 호스트 발행 action 뒤 화면이 이전 publication snapshot을 계속 들고 있을 수 있는 문제를 수정했습니다.
- 아카이브 상세에서 멤버 공개 기록을 이미 발행된 기록처럼 표시할 수 있는 badge 기준을 수정했습니다.
- 모바일 host/member 화면의 중복 예정 세션 label과 불필요하게 긴 action label을 정리했습니다.
- 공개 릴리스 후보 빌더가 로컬 플랫폼 상태 디렉터리를 후보에 복사한 뒤 자체 검증에서 실패할 수 있는 문제를 수정했습니다.

### Deployment Notes

이 릴리즈는 서버 API와 프론트엔드가 함께 바뀝니다. 프론트엔드만 먼저 배포하면 새 화면이 이전 서버에 `close`/`publish` 요청을 보내면서 `404` 또는 `405`를 볼 수 있습니다.

`v1.1.0` 이후 새 Flyway migration 파일은 추가하지 않았습니다. 다만 운영 DB가 아직 `V14__session_record_visibility.sql`, `V15__session_visibility.sql`을 적용하지 않은 상태라면 서버 재시작 중 Flyway가 `v15`까지 올려야 합니다. 서버 배포 전에 운영 DB 백업 또는 snapshot을 만들고, 서버 시작 로그 또는 `flyway_schema_history`에서 최신 성공 migration이 `15 / session_visibility`인지 확인합니다.

권장 순서:

1. 서버와 프론트엔드 검증을 실행합니다.
2. 운영 DB 백업 또는 snapshot을 만듭니다.
3. Spring Boot JAR를 빌드하고 운영 VM에 먼저 배포합니다.
4. 서버 로그에서 Flyway가 성공했고 애플리케이션이 정상 기동했는지 확인합니다.
5. `v1.2.0` tag를 push해 Cloudflare Pages 프론트엔드 배포를 시작합니다.
6. 공개, 멤버, 호스트 route와 세션 닫기/발행 흐름을 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

운영 DB 확인 예시:

```sql
select version, description, success, installed_on
from flyway_schema_history
order by installed_rank;
```

### Verification

- `./server/gradlew -p server clean test`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.1.0 - 2026-04-25

### Highlights

ReadMates v1.1.0은 세션 공개 범위와 예정 세션 운영 흐름을 추가한 릴리즈입니다. 호스트는 미래 모임을 미리 준비하고, 기록을 호스트 전용, 멤버 공개, 외부 공개로 나눠 관리할 수 있습니다. 멤버와 둘러보기 멤버는 공개 범위가 허용된 예정 세션만 볼 수 있습니다.

### Added

- 세션 기록 공개 범위(`HOST_ONLY`, `MEMBER`, `PUBLIC`)를 저장하는 서버/DB 흐름을 추가했습니다.
- 호스트가 세션 기록 공개 범위를 저장하고 수정할 수 있는 API와 화면 모델을 추가했습니다.
- 예정 세션(`DRAFT`)을 만들고 수정하고 현재 세션으로 시작하는 호스트 흐름을 추가했습니다.
- 멤버 홈에서 멤버 공개 또는 외부 공개 예정 세션을 볼 수 있게 했습니다.
- `/api/sessions/upcoming`, `/api/host/sessions` 계열 API contract와 테스트를 추가했습니다.
- MySQL migration `V14__session_record_visibility.sql`, `V15__session_visibility.sql`을 추가했습니다.

### Changed

- 공개 기록 노출 기준을 단순한 세션 상태가 아니라 `public_session_publications.visibility=PUBLIC` 기준으로 정리했습니다.
- 아카이브와 노트 조회에서 호스트 전용 기록이 멤버/공개 표면으로 새지 않도록 정리했습니다.
- 호스트 세션 편집 화면의 섹션 문구와 기본값을 정리했습니다.
- 공개 홈, 공개 세션, 소개, 로그인 CTA 문구를 초대 기반 독서모임 톤에 맞게 다듬었습니다.
- 공개 기록 페이지의 모바일 레이아웃과 문구를 조정했습니다.
- README와 개발/배포 문서가 세션 공개 범위와 예정 세션 운영 방식을 설명하도록 갱신했습니다.

### Fixed

- draft 또는 host-only 기록이 멤버/공개 조회에 섞일 수 있는 경계를 수정했습니다.
- dev seed의 공개 기록 visibility가 실제 공개 API 정책과 맞도록 수정했습니다.
- 호스트 예정 세션 화면의 상단 구분선과 stale test copy를 정리했습니다.
- 떠난 멤버 로그인 오류와 표시 이름 노출 관련 UX를 보완했습니다.

### Deployment Notes

이 릴리즈는 서버 API와 DB migration을 포함합니다. 프론트엔드만 배포하면 새 화면이 이전 서버 API를 호출하면서 `404` 또는 `405`를 볼 수 있습니다.

권장 순서:

1. 서버 테스트를 실행합니다.
2. Spring Boot JAR를 빌드하고 운영 VM에 배포합니다.
3. 서버 로그에서 Flyway가 `v15`까지 적용됐는지 확인합니다.
4. Cloudflare Pages frontend와 Pages Functions를 배포합니다.
5. 공개, 멤버, 호스트 route를 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

비로그인 smoke에서 새 API가 `404` 또는 `405`를 반환하면 frontend/backend version skew를 의심합니다. 정상적인 비로그인 보호 응답은 `401` 또는 변경 요청의 경우 `403`일 수 있습니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- fresh E2E DB 기준 `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.0.0 - 2026-04-25

### Highlights

ReadMates v1.0.0은 초대 기반 독서모임 앱의 첫 공개 기준선입니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, Google OAuth 로그인, Cloudflare Pages BFF, Spring Boot API, MySQL/Flyway persistence, 공개 릴리즈 안전 검사를 포함합니다.

### Core Features

- 공개 홈, 클럽 소개, 공개 기록, 공개 세션 상세 화면을 제공합니다.
- Google OAuth와 서버 측 `readmates_session` cookie 기반 로그인을 사용합니다.
- Cloudflare Pages Functions가 같은 origin BFF로 `/api/bff/**`, OAuth 시작, OAuth callback을 Spring으로 전달합니다.
- 게스트, 둘러보기 멤버, 정식 멤버, 호스트 권한 경계를 제공합니다.
- 멤버 앱에서 현재 세션, RSVP, 읽은 분량, 질문, 한줄평, 장문 서평, 아카이브, 노트, 본인 표시 이름을 다룹니다.
- 호스트 앱에서 멤버 관리, 초대 관리, 현재 세션 운영, 참석 확정, 기록 발행, 피드백 문서 업로드를 다룹니다.
- 피드백 문서는 호스트 또는 참석한 정식 멤버에게만 노출합니다.
- Spring Boot API는 MySQL과 Flyway migration을 사용합니다.
- Playwright E2E와 public release candidate scanner를 포함합니다.

### Deployment Notes

v1.0.0은 운영 구조의 기준선입니다.

- Frontend SPA와 Pages Functions는 Cloudflare Pages에서 실행합니다.
- Spring Boot API는 HTTPS reverse proxy 뒤의 VM에서 실행합니다.
- MySQL schema는 Spring 시작 시 Flyway가 적용합니다.
- 운영 secret은 Git에 넣지 않고 Cloudflare, VM runtime env, provider console, ignored local files에만 둡니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
