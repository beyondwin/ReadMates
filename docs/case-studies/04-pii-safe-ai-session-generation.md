# Case Study 04 — PII-safe in-app AI session generation

> 호스트가 녹취록을 업로드하면 LLM이 공개 요약, 하이라이트, 한줄평, 피드백 문서를 생성하지만, transcript 본문은 Kafka/MySQL/metric으로 보내지 않는 운영 경계를 만들었습니다. `readmates.aigen.enabled` kill switch, provider allowlist, Redis TTL job state, Kafka worker, MySQL audit/cost ledger, `readmates-session-import:v1` schema validator를 조합해 "AI 생성"을 제품 기능이 아니라 운영 가능한 비동기 workflow로 다뤘습니다.

## 문제

**호스트 운영 병목**

독서모임 회차가 끝난 뒤 호스트는 녹취록에서 공개 요약, 하이라이트, 한줄평, 참석자용 피드백 문서를 다시 정리해야 합니다. 기존 JSON 가져오기 흐름은 안전하지만, LLM 호출과 검토가 앱 밖에서 일어나므로 결과를 다시 업로드하고 검증하는 절차가 길었습니다.

**AI 기능의 운영 위험**

세션 녹취록은 공개 기록보다 민감합니다. AI 생성 기능을 단순 동기 HTTP 호출로 붙이면 다음 문제가 생깁니다.

- Provider 장애나 rate limit이 호스트 편집기 요청 timeout으로 드러납니다.
- transcript 본문이 Kafka payload, audit log, metric tag, exception message에 섞일 수 있습니다.
- 모델이 schema를 어기거나 참석자 이름을 만들면 기존 세션 기록 commit 경계가 오염됩니다.
- 비용 cap, provider disable, 전체 kill switch 없이 운영자가 장애를 좁혀 끌 방법이 없습니다.

**제약**

- 공개 저장소 — 실제 transcript, provider key, 운영 host, private deployment state를 문서와 fixture에 남기지 않습니다.
- 기존 session import contract — 최종 저장은 `readmates-session-import:v1`과 같은 검증/commit 경로를 재사용해야 합니다.
- 멀티 provider — Claude, OpenAI, Gemini를 같은 제품 흐름에 붙이되 provider별 실패를 공통 오류 계약으로 변환해야 합니다.

## 접근

| 대안 | 기각 이유 |
|------|----------|
| Host editor에서 provider API 직접 호출 | API key가 브라우저 번들 또는 client runtime으로 새고, provider별 CORS/retention/cost 정책을 앱이 통제할 수 없습니다. |
| Spring controller에서 동기 LLM 호출 후 바로 commit | 긴 요청 timeout, 재시도/취소/진행률 부재, provider 장애가 편집기 UX 전체를 막습니다. |
| Kafka payload에 transcript 포함 | worker 재처리는 쉬워지지만 broker, log, DLQ가 PII 저장소가 됩니다. |
| LLM 결과를 바로 session table에 저장 | schema/author/feedback template 실패가 partial write로 남을 수 있습니다. |

**선택: Redis handoff + Kafka metadata queue + validated commit**

transcript는 Redis TTL key에만 두고, Kafka에는 job routing metadata만 보냅니다. Worker는 Redis에서 transcript를 rehydrate해 provider adapter를 호출하고, 결과는 `SessionImportV1Validator`를 통과한 `SessionImportV1Snapshot`으로만 preview 상태가 됩니다. 호스트가 commit하면 `AiGenerationCommitService`가 다시 검증한 뒤 기존 `SessionImportService.commitValidated(...)`로 넘깁니다.

## 구현

### 비동기 job 경계

```text
Browser host editor
  |
  | POST /api/host/sessions/{id}/ai-generate/jobs
  v
AiGenerationController
  |
  v
AiGenerationOrchestrator
  |-- Redis aigen:job:<jobId>              (state, TTL 6h)
  |-- Redis aigen:job:<jobId>:transcript   (raw transcript, TTL 6h)
  |-- Kafka readmates.aigen.jobs.v1        (metadata only)
  v
AiGenerationWorker
  |
  | provider adapter + schema validation
  v
Redis aigen:job:<jobId>:result             (validated snapshot, TTL 6h)
```

`AiGenerationController`는 multipart 업로드를 받고 transcript 크기를 1 MB로 제한합니다. `AiGenerationOrchestrator`는 모델 resolve, provider allowlist, host/club cap pre-check를 통과한 뒤 Redis job record를 만들고 Kafka에 `jobId`, `sessionId`, `clubId`, `hostUserId`, provider, model, kind만 발행합니다.

Kafka topic 이름은 `readmates.aigen.jobs.v1`이고 partition key는 club id입니다. transcript 본문은 topic payload에 포함되지 않습니다. 이 invariant는 `scripts/aigen-pii-check.sh`가 production Kotlin, Flyway migration, Kafka producer, Micrometer tag, Redis transcript key 사용 범위를 스캔해 회귀를 막습니다.

Job status는 `PENDING -> RUNNING -> SUCCEEDED -> COMMITTING -> COMMITTED`를 정상 commit 경로로 사용합니다. `FAILED`와 `CANCELLED`는 terminal 상태이고, Redis `transitionStatus`/`saveResultIfStatus` Lua CAS가 worker completion, regenerate, commit, cancel 경합을 막습니다. Commit/cancel 이후에는 raw transcript와 result payload를 삭제하지만 `aigen:job:<jobId>` hash는 TTL까지 남겨 frontend가 `COMMITTED`/`CANCELLED` 최종 상태를 확인할 수 있습니다. Per-job `llmCallCount`도 같은 hash에서 원자 증가하므로 retry와 regeneration을 합쳐 hard cap을 넘으면 provider 호출 없이 `MAX_CALLS_EXCEEDED`로 중단됩니다.

### provider adapter와 오류 마스킹

Provider 구현은 `SessionContentGenerator`와 `SessionContentRegenerator` outbound port 뒤에 숨겼습니다.

- `adapter.out.llm.claude.ClaudeContentGenerator/Regenerator`
- `adapter.out.llm.openai.OpenAiContentGenerator/Regenerator`
- `adapter.out.llm.gemini.GeminiContentGenerator/Regenerator`

세 adapter는 `LlmPromptBuilder`와 `SessionImportSchemaResource`를 공유하고, provider 예외는 `LlmErrorMapper`를 거쳐 `PROVIDER_UNAVAILABLE`, `PROVIDER_RATE_LIMITED`, `SCHEMA_INVALID` 같은 내부 enum으로 변환됩니다. 사용자와 HTTP 응답에는 transcript snippet이나 provider raw exception message를 내보내지 않습니다.

`AiGenerationErrorHandler`는 AI 생성 controller에 한정된 RFC 7807 응답을 만듭니다. catch-all은 `detail="internal error"`로 마스킹하고, downstream session import validation exception도 issue count와 code만 로그에 남깁니다.

### schema validator가 commit trust boundary

LLM 출력은 바로 저장되지 않습니다. Worker는 먼저 `readmates-session-import:v1` snapshot을 만들고 `SessionImportV1Validator`로 검증합니다.

- session number, book title, meeting date가 원본 session metadata와 맞아야 합니다.
- author name은 해당 회차 참석자 allowlist와 맞아야 합니다.
- highlights 개수, one-line review 중복, feedback document template을 확인합니다.

호스트가 preview에서 수동 수정한 override를 commit하더라도 `AiGenerationCommitService`가 Redis에 저장하기 전에 다시 validator를 실행합니다. 검증이 통과한 경우에만 기존 `SessionImportService.commitValidated(...)`가 공개 요약, 하이라이트, 한줄평, 피드백 문서를 한 트랜잭션 경계에서 교체합니다.

### 운영 kill switch와 cost cap

AI 생성은 기본 off입니다.

- `readmates.aigen.enabled=false`이면 `AiGenerationKillSwitchFilter`가 `/api/host/sessions/*/ai-generate/**`와 `/api/host/clubs/*/ai-defaults`를 503 + `AI_DISABLED` problem JSON으로 응답합니다.
- `readmates.aigen.enabled-providers`에서 provider를 제거하면 catalog 단계에서 해당 provider 모델이 사라집니다.
- Redis cost key는 club monthly cap과 host daily cap을 관리합니다.
- MySQL `ai_generation_audit_log`는 provider, model, status, token usage, cost estimate, latency, error code를 보관하지만 transcript 본문 컬럼은 없습니다.

운영자는 runbook에서 provider key 회전, 모델 allowlist 변경, cap 임시 조정, schema 실패 spike, 전체 kill switch를 같은 절차로 다룹니다.

### frontend preview와 재생성

프런트엔드는 `front/features/host/aigen/`에 격리했습니다.

- `api/` — BFF 호출과 DTO contract
- `hooks/useAiGenerationJob.ts` — TanStack Query v5 adaptive polling
- `ui/` — transcript upload, progress, preview, section별 regenerate modal, committed/saving state
- `storage/aigen-draft-storage.ts` — preview 수동 수정 draft를 `aigen-draft:{jobId}` localStorage key에 보관

호스트 세션 편집기는 `세션 기록 완성` 패널에서 `AI로 생성`과 `외부 JSON 가져오기` 모드를 함께 보여주며, `?aigen=1` query로 AI 모드 진입을 보존합니다. 두 모드는 최종 commit 경로를 공유하므로 저장 후 데이터 모델이 갈라지지 않습니다.

## 검증

**단위/통합 테스트**

- `AiGenerateApiIntegrationTest` — HTTP → Kafka/Testcontainers → worker → Redis → commit lifecycle.
- Provider adapter tests — Claude/OpenAI/Gemini generator와 regenerator의 schema/tool 호출, 오류 마스킹, model 전달.
- `RedisAiGenerationJobStoreTest`, `RedisGenerationCostCountersTest` — TTL, stale transcript cleanup, atomic status/result transition, terminal payload cleanup, cost counter.
- `AiGenerationErrorHandlerTest` 계열 — typed RFC 7807 denial과 unknown error scrub.

**프런트 테스트**

- `front/features/host/aigen/**` unit tests — job polling, draft storage, upload/preview/committed transition.
- Playwright `aigen-*.spec.ts` — full flow, cancel, regenerate, expired job, cost cap, JSON upload coexistence.

**PII invariant**

`bash scripts/aigen-pii-check.sh`는 다음을 확인합니다.

- durable transcript body column/property name 금지
- Kafka producer가 transcript 인자를 보내지 않음
- Micrometer tag key allowlist 유지
- Flyway migration에 transcript body column 없음
- raw transcript Redis key 사용이 job-store handoff boundary 안에만 있음

## Trade-off와 한계

- **Redis가 transient PII store가 됨**: transcript 본문을 durable store와 broker에서 뺐지만, worker 재처리를 위해 Redis TTL key에는 잠깐 보관합니다. 따라서 TTL/delete 테스트와 운영자 runbook이 중요합니다.
- **비동기 workflow 복잡도**: 동기 호출보다 controller, queue, worker, Redis store, polling UI가 늘어납니다. 대신 timeout, retry, cancel, progress, cap, audit를 분리해 운영할 수 있습니다.
- **provider retention은 코드만으로 보장 불가**: Gemini paid-tier 같은 provider-side 정책은 운영 provisioning 절차로 검증해야 합니다. 코드는 best-effort signal을 보내지만 계약을 대체하지 않습니다.
- **모델 catalog 변경 비용**: provider 모델을 바꾸려면 server pricing map, frontend option, smoke script를 함께 맞춰야 합니다. 현재는 runbook으로 절차화했고, 장기적으로 catalog API 단일화를 고려할 수 있습니다.

## 다시 한다면

- **catalog endpoint 단일화**: frontend 기본 모델 상수와 server pricing catalog를 하나의 API로 합치면 모델 교체 시 수정 지점이 줄어듭니다.
- **provider health 자동 fallback**: 지금은 provider 장애를 운영자가 allowlist 변경으로 좁힙니다. provider error burst가 일정 시간 지속되면 catalog에서 자동 제외하는 회로 차단기를 둘 수 있습니다.
- **preview diff 강화**: AI preview에서 session import commit 전후의 변경 diff를 더 명확히 보여주면 호스트 검토 비용을 줄일 수 있습니다.

## 관련

- Architecture: [`docs/development/architecture.md`](../development/architecture.md#in-app-ai-세션-생성-컴포넌트)
- Runbook: [`docs/operations/runbooks/ai-session-generation.md`](../operations/runbooks/ai-session-generation.md)
- Session import contract: [`docs/development/session-import-generator.md`](../development/session-import-generator.md)
- Spec: [`docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md`](../superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md)
