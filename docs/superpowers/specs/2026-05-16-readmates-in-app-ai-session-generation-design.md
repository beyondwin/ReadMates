# ReadMates In-App AI 세션 생성 설계

작성일: 2026-05-16
상태: APPROVED DESIGN SPEC
문서 목적: 호스트 세션 편집기에 LLM 기반 회차 기록(요약·하이라이트·한줄평·피드백 문서) 생성·재생성·검토·커밋 흐름을 in-app으로 도입한다. 기존 외부 도구 JSON 업로드 흐름과 병존한다.

## 1. 배경

현재 ReadMates는 회차당 요약, 하이라이트, 한줄평, 피드백 문서를 다음 절차로 운영한다.

1. 호스트가 모임 녹취록(.txt)을 로컬에서 외부 LLM 도구로 정리한다.
2. 정리 결과를 `readmates-session-import:v1` JSON 형식으로 만든다.
3. 호스트 세션 편집기의 "AI 결과 JSON 가져오기"에서 파일을 업로드한다.
4. 서버는 `POST /api/host/sessions/{id}/session-import/preview`와 `/commit`으로 검증·저장한다.

README는 이 흐름을 명시한다.

> 현재 ReadMates 앱, 서버, 프론트엔드는 AI API를 직접 호출하지 않습니다. 즉, 제품 기능은 in-app AI generation이 아니라 외부에서 정리된 콘텐츠를 안전하게 운영하고 노출하는 흐름입니다.

호스트는 회차마다 동일한 외부 도구 작업을 반복한다. 회차 7개 누적 시점에 누적 작업 시간과 도구 컨텍스트 전환 비용이 의미 있게 커진 상태다. 새 설계는 외부 도구 없이 호스트 편집기 안에서 녹취록을 업로드해 LLM 결과를 만들고 검토·저장할 수 있게 한다. 외부 JSON 업로드 경로는 보존한다.

## 2. 목표

- 호스트 세션 편집기에서 녹취록 파일을 업로드하면 in-app에서 LLM이 `readmates-session-import:v1` JSON을 생성한다.
- 호스트는 항목 단위(요약, 하이라이트 전체, 한줄평 전체, 피드백 문서)로 결과를 재생성할 수 있다. 자유 자연어 instruction과 모델 override를 지원한다.
- Claude, OpenAI, Gemini 세 provider를 추상화로 지원한다. 클럽 단위 default 모델과 호스트 per-generation override를 제공한다.
- LLM 호출은 Spring 서버 내부에서만 발생하고, Cloudflare Pages BFF는 인증·secret 부착만 수행한다.
- 녹취록 본문은 Redis에 6시간 TTL로만 저장하고, 어떤 영구 저장소(MySQL, Kafka payload, audit log, 로그, Prometheus, OCI Object Storage)에도 들어가지 않는다.
- 모든 LLM 호출은 PII가 제거된 audit log row 1건을 남긴다. 모델, provider, 토큰, 추정 비용, 호스트, 세션, 결과 상태가 포함된다.
- 비용·사용 한도를 강제한다. 호스트당 일 10 호출, 클럽당 월 $20, 호스트당 분당 5 호출.
- 60초 이상 걸리는 풀 생성은 기존 outbox/Kafka/in-app 알림 파이프라인을 재사용해 호스트가 화면을 떠나도 완성 시 알림함으로 복귀할 수 있다.
- 외부 JSON 업로드 흐름과 commit 종착점을 공유한다. 두 흐름 모두 같은 검증자와 트랜잭션 writer를 사용한다.
- 운영자가 글로벌·provider별 kill switch를 보유한다. yaml 변경 + 재배포로 즉시 비활성화 가능하다.

## 3. 비목표

- Element-level 재생성(하이라이트 1건만, 한 사람의 한줄평만)은 v1 범위가 아니다.
- LLM 결과의 자동 발행(호스트 검토 없는 commit)은 만들지 않는다.
- 멤버가 자기 한줄평을 AI로 생성하거나, 게스트가 외부에서 AI 호출을 트리거하는 기능은 만들지 않는다.
- 오디오 파일을 업로드해 ASR(음성 인식)을 수행하지 않는다. 호스트는 외부에서 텍스트 녹취록을 준비한다.
- 다국어 번역, 외국어 모임 지원은 만들지 않는다. 한국어 운영을 가정한다.
- LLM 출력 품질에 대한 자동 회귀(예: LLM-as-judge, golden transcript score)는 v1에 만들지 않는다.
- 동적 config(재배포 없이 cap/kill switch 즉시 변경)는 v1에 만들지 않는다.
- 클럽별 enable/disable, 호스트별 모델 prefer 같은 fine-grained policy는 v1에 만들지 않는다. v1은 글로벌 + provider별 enable만 제공한다.
- 호스트 본인 AI 생성 audit history 조회 UI는 v1 범위가 아니다. 운영자만 Prometheus dashboard로 조회한다.
- 이메일 알림은 발송하지 않는다. v1은 in-app 알림함만 사용한다.
- Provider 장애 시 자동 fallback은 만들지 않는다. v1은 호스트 수동 재시도다.

## 4. 횡단 제약

이 설계는 ReadMates의 기존 구조와 SOLID 원칙을 모든 신규 모듈에 적용한다.

### 4.1 기존 구조 준수

- **Hexagonal 레이어 유지** — 신규 코드는 기존 `server/src/main/kotlin/com/readmates/<feature>/{adapter/in,adapter/out,application/{model,port/in,port/out,service}}` 패턴을 그대로 따른다.
- **인증/권한 재사용** — 호스트 권한 검증은 기존 `CurrentMember`, `SessionAuthorizationPolicy`, club membership 정책을 재사용한다. 새 권한 클래스를 만들지 않는다.
- **검증·저장 path 재사용** — 기존 `SessionImportService` 의 검증과 트랜잭션 writer를 두 흐름이 공유한다. AI generation의 commit은 새 검증 코드를 만들지 않고 기존 `SessionImportUseCases` 로 흘려보낸다.
- **Outbox/Kafka 동형** — 60초 알림 트리거와 generation job은 기존 `notification_event_outbox` + Kafka relay/consumer 패턴과 같은 모양으로 구성한다.
- **Redis 사용 규약 일치** — 기존 rate limit/cache의 key naming, TTL 관리, optional 활성 방식을 따른다. Redis가 비활성이면 AI generation 자체가 503으로 비활성된다.
- **Flyway versioned migration** — 새 audit log 테이블과 클럽 default 테이블은 새 마이그레이션 파일로만 추가한다. 기존 마이그레이션은 수정하지 않는다.
- **공개 저장소 규약** — secret, 실제 멤버 데이터, OCI OCID, 로컬 경로, raw API key는 코드·문서·fixture에 포함하지 않는다. 환경 변수와 placeholder로만 표현한다.

### 4.2 SOLID 적용 지점

| 원칙 | 적용 |
| --- | --- |
| SRP | `TranscriptIntakeService`, `AiGenerationOrchestrator`, `LlmContentGenerator`, `LlmContentRegenerator`, `GenerationAuditRecorder`, `GenerationCostGuard`, `ModelCatalog` 가 각각 한 책임만 진다. |
| OCP | 새 provider 추가는 `SessionContentGenerator`/`SessionContentRegenerator` 구현 등록 + `ModelCatalog` yaml 항목 추가만으로 가능하다. 기존 코드 수정 없이 확장된다. |
| LSP | 세 provider 구현은 동일 인터페이스 계약(반환 JSON 형식, 오류 타입, 토큰 회계)을 만족한다. 호출자는 구체 구현을 알 필요 없다. |
| ISP | "풀 생성"과 "항목 재생성"은 다른 인터페이스로 분리한다(`SessionContentGenerator.generateFull` / `SessionContentRegenerator.regenerateItem`). 클라이언트는 필요 없는 메서드에 의존하지 않는다. |
| DIP | 도메인/application 레이어는 SDK에 직접 의존하지 않고 위 인터페이스에만 의존한다. 구현은 `adapter/out/llm/<provider>/` 에 격리되고 Spring DI로 주입된다. |

## 5. 핵심 결정

### 5.1 입력 모달리티

- **녹취록은 텍스트 파일 업로드(.txt, UTF-8, ≤ 1 MB)** 한다. 호스트 환경에서 회차당 약 85–120 KB 분량(약 100분, 20K–40K 토큰)이다.
- 회차 번호, 책 제목, 모임 날짜, 참석자 표시 이름, 실명/alias 모드는 **세션 컨텍스트에서 자동 주입**한다. 호스트가 따로 입력하지 않는다.
- 호스트는 옵션으로 자유 자연어 instruction(≤ 2 KB)을 첨부할 수 있다.

### 5.2 호스트 UX 흐름

C 모델: **Preview → 부분 재생성 → Commit**.

```
IDLE → GENERATING → PREVIEW → COMMITTED
                 ↘ FAILED      ↘ CANCELLED
PREVIEW ↺ 항목 재생성(자연어 hint + 모델 override)
```

- 풀 생성은 비동기(Kafka job + polling). 부분 재생성은 동기(HTTP 응답 대기).
- PREVIEW 단계에서 호스트는 textarea로 결과를 수동 편집할 수 있다.
- 60초 이상 걸리면 in-app 알림함에 "결과 준비됨" 알림을 생성한다. 이메일은 발송하지 않는다.

### 5.3 부분 재생성 단위

| 단위 | 대상 필드 | 예상 지연 |
| --- | --- | --- |
| 요약 | `publication.summary` | 약 5초 |
| 하이라이트 전체 | `highlights[]` | 약 10초 |
| 한줄평 전체 | `oneLineReviews[]` | 약 10초 |
| 피드백 문서 | `feedbackDocument.markdown` | 약 30–60초 |

각 재생성은 (옵션) 자연어 instruction과 모델 override를 받는다. Element-level 재생성은 v1 범위 외다.

### 5.4 Multi-provider 추상화

- v1 지원 provider: Claude(Anthropic), OpenAI, Gemini(Google GenAI).
- 모델 식별은 `provider:name` 쌍. allowlist는 `application.yml` 의 `ModelCatalog` 로 운영자가 통제한다.
- 클럽 단위 default 모델 + 호스트 per-generation override(granularity D)를 지원한다.
- Prompt caching은 v1에서 Claude만 최적화한다(`cache_control: ephemeral`). OpenAI는 자동 caching 의존, Gemini는 explicit cache 미적용(baseline).
- 모든 provider는 동일한 `SessionImportV1` JSON schema를 출력해야 한다. Claude는 tool input_schema, OpenAI는 `response_format.json_schema`, Gemini는 `responseSchema` 로 강제하며 schema source-of-truth 1개를 공유한다.

### 5.5 API key 보관

플랫폼 단일 키 전략. provider별로 환경 변수 1개씩 보관한다(예: `READMATES_AIGEN_ANTHROPIC_API_KEY`, `READMATES_AIGEN_OPENAI_API_KEY`, `READMATES_AIGEN_GEMINI_API_KEY`). 클럽 단위·호스트 BYO 키는 v1 범위 외다.

### 5.6 타이밍 모델

- 풀 생성: HTTP `POST /ai-generate/jobs` 가 즉시 `jobId` 반환 → Kafka enqueue → worker 처리 → Redis 결과 갱신 → 클라이언트 polling `GET /jobs/{jobId}` (2초·이후 3–5초 간격).
- 부분 재생성: 동기 HTTP. 5–20초 대기 후 직접 응답.
- 60초 초과: outbox → kafka → notification consumer 경로로 in-app 알림 1건 생성. deep link로 PREVIEW 복귀.

### 5.7 PII 정책

- 녹취록 본문은 **Redis 외 어느 영구 저장소에도 들어가지 않는다**. Kafka payload, audit log, error message, Prometheus label, 로그 어디에도 본문이 들어가지 않는다.
- 동일 입력 재처리 식별 용도로 `transcript_sha256`(salt 없는 단방향 hash)만 audit log에 저장한다.
- provider SDK 호출 시 retention 최소 옵션을 강제한다. OpenAI `store: false`, Gemini `disablePromptLogging` 또는 동등 옵션, Anthropic 기본(server-side trace 없음).
- Redis 키 TTL: **6시간**. Commit/Cancel/Failed 시 즉시 DEL. TTL 만료 후 호스트가 돌아오면 재업로드를 요구한다.

### 5.8 한도와 비용

| 한도 | 값 | 강제 위치 |
| --- | --- | --- |
| 호스트 일일 generate 호출(full + regen 합산) | 10 | `GenerationCostGuard` (Redis sliding 24h counter) |
| 클럽 월 cost cap | $20 USD | `GenerationCostGuard` (Redis sliding 31d counter) |
| 호스트 분당 호출 | 5 | 기존 Redis rate limiter |
| Soft warning 임계 | 클럽 월 cost 80%($16) | 응답 JSON `warnings: ["CLUB_BUDGET_80PCT"]` + UI 노란 배지 |

비용 계산은 provider별 input/cached_input/output 토큰 단가와 사용량의 곱이다. 단가는 `application.yml` 의 `readmates.aigen.pricing` 에서 운영자가 관리한다.

## 6. 아키텍처

### 6.1 전체 흐름

```
Host browser
  │ multipart 업로드: transcript .txt + model? + instructions?
  ▼
Cloudflare Pages BFF  (X-Readmates-Bff-Secret 부착, 본문 그대로 전달, LLM 직접 호출 없음)
  ▼
Spring Boot API  (com.readmates.aigen.*)
  │ ① 권한 검증(host + active club)
  │ ② Rate limit + cost cap 사전 체크
  │ ③ Transcript → Redis 저장(TTL 6h, jobId 키)
  │ ④ Generation job → Kafka topic (payload에 본문 없음)
  │ ⑤ 즉시 jobId 반환
  ▼
AI Generation Worker (Spring Kafka consumer)
  │ ⑥ 모델 라우팅(클럽 default ← override ← allowlist 검증)
  │ ⑦ Provider adapter 호출(LLM)
  │ ⑧ SessionImportV1Validator 검증
  │ ⑨ Redis 결과 갱신, audit log insert, cost 누적
  │ ⑩ latency > 60s → notification_event_outbox 이벤트 생성
  ▼
Host UI (polling)
  │ GET /jobs/{jobId} → PREVIEW
  │ POST /jobs/{jobId}/regenerate → 동기 LLM 호출, snapshot patch
  │ POST /jobs/{jobId}/commit → SessionImportService 재사용
  ▼
MySQL: 회차 기록 정상 저장
Redis: jobId 키 3개 즉시 DEL
```

### 6.2 패키지 구조

신규 feature 패키지: `com.readmates.aigen`. 기존 `sessionimport` 와 분리하되, commit 시 `sessionimport` 의 use case에 위임한다.

```
server/src/main/kotlin/com/readmates/aigen/
  adapter/in/web/
    AiGenerationController.kt
    AiGenerationWebDtos.kt
    AiGenerationErrorHandler.kt
    ClubAiDefaultsController.kt
  adapter/in/messaging/
    AiGenerationJobConsumer.kt
  adapter/out/messaging/
    AiGenerationJobProducer.kt
  adapter/out/persistence/
    JdbcAiGenerationAuditRepository.kt
    JdbcAiGenerationClubDefaultRepository.kt
  adapter/out/redis/
    RedisAiGenerationJobStore.kt
    RedisGenerationCostCounters.kt
  adapter/out/llm/
    claude/
      ClaudeContentGenerator.kt
      ClaudeContentRegenerator.kt
      ClaudeApiClient.kt
    openai/
      OpenAiContentGenerator.kt
      OpenAiContentRegenerator.kt
      OpenAiApiClient.kt
    gemini/
      GeminiContentGenerator.kt
      GeminiContentRegenerator.kt
      GeminiApiClient.kt
    common/
      SessionImportSchemaResource.kt
      LlmPromptBuilder.kt
      LlmErrorMapper.kt
  application/model/
    AiGenerationModels.kt        # GenerationInput/Output, RegenerationInput/Output, ModelId, TokenUsage, etc.
  application/port/in/
    AiGenerationUseCases.kt      # StartGenerationUseCase, GetJobUseCase, RegenerateUseCase, CommitUseCase, CancelUseCase, GetClubDefaultUseCase, SetClubDefaultUseCase
  application/port/out/
    SessionContentGenerator.kt   # provider 추상화
    SessionContentRegenerator.kt
    AiGenerationJobStore.kt
    AiGenerationAuditRepository.kt
    AiGenerationClubDefaultRepository.kt
    ModelCatalog.kt
    GenerationCostGuard.kt
    AiGenerationJobQueue.kt
  application/service/
    AiGenerationOrchestrator.kt  # start/get/cancel
    AiGenerationWorker.kt        # consumer가 호출하는 도메인 서비스
    AiGenerationRegenerationService.kt
    AiGenerationCommitService.kt # SessionImportUseCases에 위임
    ClubAiDefaultsService.kt
  application/security/
    AiGenerationAuthorizationPolicy.kt
```

`adapter/out/llm/` 만 SDK에 의존한다. 도메인·application·다른 adapter는 SDK import 0건이다.

### 6.3 모듈 간 데이터 흐름

1. `AiGenerationController` 는 multipart 요청을 `StartGenerationCommand`(domain model)로 변환.
2. `AiGenerationOrchestrator` 가 권한·cap 체크 후 `AiGenerationJobStore.save(jobId, transcript, meta)`, `AiGenerationJobQueue.enqueue(jobId)` 호출.
3. `AiGenerationJobConsumer` 는 Kafka 메시지에서 `jobId` 만 받아 `AiGenerationWorker.process(jobId)` 호출.
4. `AiGenerationWorker` 는 `AiGenerationJobStore.load(jobId)` → `ModelCatalog.resolve(...)` → `SessionContentGenerator.generateFull(...)` → `SessionImportV1Validator.validate(...)` → `AiGenerationJobStore.saveResult(jobId, ...)` → `AiGenerationAuditRepository.record(...)`.
5. `AiGenerationCommitService.commit(jobId, recordVisibility)` 는 Redis snapshot을 로드해 기존 `SessionImportUseCases.commit(...)` 으로 위임. 성공 시 Redis 3 키 DEL.

## 7. API 표면

모든 신규 endpoint는 `/api/host/sessions/{sessionId}/ai-generate/*` 와 `/api/host/clubs/{clubSlug}/ai-defaults` 하위에 있다. 모두 active host of club 권한이 필요하다.

### 7.1 Full generation 시작

```
POST /api/host/sessions/{sessionId}/ai-generate/jobs
Content-Type: multipart/form-data

fields:
  transcript        file (.txt, ≤ 1 MB)
  model             string?       e.g. "claude-sonnet-4-6", "openai-gpt-4-1", "gemini-2-5-pro"
  authorNameMode    "real" | "alias"
  instructions      string?       (≤ 2 KB)

response 202 Accepted:
{
  "jobId": "uuid",
  "status": "PENDING",
  "expiresAt": "<utc>"
}
```

### 7.2 Job status / 결과 조회 (polling)

```
GET /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}

response 200:
{
  "jobId": "uuid",
  "status": "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED",
  "stage": "queued" | "transcript_loaded" | "generating_summary" | "generating_highlights" | "generating_one_line_reviews" | "generating_feedback_document" | "validating" | "ready",
  "progressPct": 0..100,
  "model": "claude-sonnet-4-6",
  "result": SessionImportV1 | null,
  "error": { "code": string, "message": string } | null,
  "tokens": { "input": int, "cachedInput": int, "output": int },
  "costEstimateUsd": "0.12",
  "warnings": [ "CLUB_BUDGET_80PCT", ... ]
}
```

폴링 권장 간격: 처음 2초, 이후 3–5초.

### 7.3 부분 재생성 (synchronous)

```
POST /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}/regenerate
Content-Type: application/json

{
  "item":         "summary" | "highlights" | "oneLineReviews" | "feedbackDocument",
  "model":        string?,
  "instructions": string?
}

response 200:
{
  "item": "summary",
  "value": { "summary": "..." },          // 변경된 부분만
  "tokens": { "input": int, "cachedInput": int, "output": int },
  "costEstimateUsd": "0.01",
  "warnings": [ ... ]
}
```

서버는 Redis snapshot의 해당 필드만 patch한다. 다른 필드는 그대로 유지된다.

### 7.4 Commit

```
POST /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}/commit
Content-Type: application/json

{
  "recordVisibility": "MEMBER" | "PUBLIC"
}

response 200: 기존 SessionImportCommitResult 와 동일
```

서버 처리:
1. 호스트가 PREVIEW에서 수동 편집한 경우, 클라이언트가 보낸 최종 snapshot으로 Redis snapshot을 덮어쓴 다음 진행한다(별도 PATCH endpoint 없이 commit body가 snapshot을 함께 보낸다 — `body.result?`).
2. `SessionImportV1Validator` 로 다시 검증한다.
3. 기존 `SessionImportUseCases.commit(...)` 으로 위임한다.
4. 성공 시 Redis 3 키(`aigen:job:{jobId}`, `aigen:job:{jobId}:transcript`, `aigen:job:{jobId}:result`) DEL.

### 7.5 Cancel

```
DELETE /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}
response 204
```

Redis 3 키 DEL + audit log `CANCEL` row.

### 7.6 클럽 default 모델

```
GET  /api/host/clubs/{clubSlug}/ai-defaults
  response: { "defaultModel": "claude-sonnet-4-6" | null }

PUT  /api/host/clubs/{clubSlug}/ai-defaults
  body: { "defaultModel": "claude-sonnet-4-6" }
  response 200
```

권한: 해당 클럽 host. 모델 값은 platform allowlist 안에서만 허용된다.

### 7.7 기존 endpoint 변경 없음

`POST /api/host/sessions/{sessionId}/session-import/preview` 와 `/commit` 은 변경하지 않는다. 외부 도구 JSON 업로드 흐름은 그대로 유효하다.

## 8. 데이터 모델

### 8.1 Redis 키 스키마

| Key | Type | Value | TTL | 비고 |
| --- | --- | --- | --- | --- |
| `aigen:job:{jobId}` | Hash | sessionId, clubId, hostUserId, model, status, stage, progressPct, expectedAuthorNames, authorNameMode, instructions, error, costEstimateUsd, warnings, createdAt | 6h | transcript 본문 미포함 |
| `aigen:job:{jobId}:transcript` | String | transcript raw text | 6h | 분리 저장으로 결과 조회 직렬화 경로의 실수 누출 방지 |
| `aigen:job:{jobId}:result` | String | SessionImportV1 JSON 직렬화 | 6h | 부분 재생성 시 patch 갱신 |
| `aigen:host:{hostId}:daily` | Counter | 일 누계 | 24h sliding | cap 10 |
| `aigen:club:{clubId}:monthly_cost_usd` | String(decimal) | 월 누적 비용 | 31d sliding | cap $20 |
| `aigen:host:{hostId}:rate` | Counter | 분당 호출 | 60s | rate 5/min |

Commit/Cancel/Failed 시 3개 job 키를 즉시 DEL한다. 실패 시 TTL이 보장한다.

### 8.2 MySQL 테이블

#### 8.2.1 `ai_generation_audit_log`

```sql
CREATE TABLE ai_generation_audit_log (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id                CHAR(36)     NOT NULL,
  session_id            CHAR(36)     NOT NULL,
  club_id               CHAR(36)     NOT NULL,
  host_user_id          CHAR(36)     NOT NULL,
  kind                  VARCHAR(32)  NOT NULL,    -- FULL | REGENERATE | COMMIT | CANCEL
  item                  VARCHAR(32)  NULL,        -- regenerate: SUMMARY|HIGHLIGHTS|ONE_LINE_REVIEWS|FEEDBACK_DOCUMENT
  provider              VARCHAR(16)  NOT NULL,    -- CLAUDE|OPENAI|GEMINI
  model                 VARCHAR(64)  NOT NULL,
  transcript_sha256     CHAR(64)     NULL,
  input_tokens          INT          NOT NULL DEFAULT 0,
  cached_input_tokens   INT          NOT NULL DEFAULT 0,
  output_tokens         INT          NOT NULL DEFAULT 0,
  cost_estimate_usd     DECIMAL(8,4) NOT NULL DEFAULT 0,
  status                VARCHAR(16)  NOT NULL,    -- SUCCESS|FAILED|CANCELLED
  error_code            VARCHAR(64)  NULL,
  error_message         VARCHAR(512) NULL,        -- masked, 본문 발췌 금지
  latency_ms            INT          NOT NULL DEFAULT 0,
  created_at            DATETIME(6)  NOT NULL,
  INDEX idx_aigen_audit_session (session_id, created_at),
  INDEX idx_aigen_audit_club    (club_id,    created_at),
  INDEX idx_aigen_audit_host    (host_user_id, created_at)
);
```

#### 8.2.2 `ai_generation_club_defaults`

```sql
CREATE TABLE ai_generation_club_defaults (
  club_id        CHAR(36)    NOT NULL PRIMARY KEY,
  default_model  VARCHAR(64) NOT NULL,
  updated_at     DATETIME(6) NOT NULL,
  updated_by     CHAR(36)    NOT NULL,
  CONSTRAINT fk_aigen_default_club FOREIGN KEY (club_id) REFERENCES clubs(id)
);
```

행이 없으면 fallback은 `application.yml` 의 `readmates.aigen.fallback-default-model` 이다.

#### 8.2.3 기존 테이블 변경

`session_record`, `session_publication`, `highlights`, `one_line_reviews`, `session_feedback_documents` 는 변경하지 않는다. Commit은 기존 `SessionImportService` 가 동일 트랜잭션 path로 쓴다.

### 8.3 PII 규약 (코드 리뷰 invariant)

| 규약 | 적용 |
| --- | --- |
| Transcript 본문은 Redis 외 어디에도 영구 저장 금지 | `TranscriptIntakeService` 만 본문을 다루고, Repository 형 코드 없음 |
| Kafka payload에 transcript 본문 금지 | producer message는 `{jobId, sessionId, model, kind}` 만 |
| Audit log/error message/log line에 transcript 발췌 금지 | adapter의 error wrap 단계에서 transcript 인자 mask, unit test로 검증 |
| LLM provider 호출에 retention 최소 옵션 | Anthropic 기본, OpenAI `store: false`, Gemini `disablePromptLogging` |
| Prometheus metric label은 고정 enum | `provider`, `model`, `kind`, `status`, `reason`, `direction` 만 허용 |
| `error_message` 는 masked enum-like | provider raw 메시지 그대로 저장 금지 |
| `transcript_sha256` 는 salt 없는 단방향 hash | 입력 식별·디버깅 용도, PII 위험 낮음 |

## 9. 검증과 실패 모드

### 9.1 다단계 검증

| 시점 | 검증자 | 실패 시 |
| --- | --- | --- |
| ① Transcript 입력 | `TranscriptIntakeValidator` (파일 size, UTF-8, 화자명 패턴 ≥ 1) | HTTP 400 |
| ② LLM 결과 | 기존 `SessionImportV1Validator` (JSON schema, authorName 매칭, 개수, 템플릿) | job FAILED, adapter 자동 재시도 1회 가능 |
| ③ Commit | 동일 validator + 기존 commit 트랜잭션 | 트랜잭션 롤백, Redis snapshot 보존 |

### 9.2 실패 모드 카탈로그

| 실패 | 감지 | error_code | 자동 회복 | 호스트 액션 |
| --- | --- | --- | --- | --- |
| Provider 5xx/timeout | adapter | `PROVIDER_UNAVAILABLE` | 1회 backoff 1s | 다시 시도 |
| Provider 429 | adapter | `PROVIDER_RATE_LIMITED` | 1회 backoff 5s | 잠시 후 |
| JSON 파싱·schema 위반 | validator | `SCHEMA_INVALID` | 1회 강화 instruction 재시도 | 다른 모델 |
| authorName 불일치 | validator | `AUTHOR_NAME_MISMATCH` | 1회 강화 instruction 재시도 | instruction 보강 또는 모델 변경 |
| highlights 개수 위반 | validator | `HIGHLIGHTS_OUT_OF_RANGE` | 1회 재시도 | 모델 변경 |
| 한줄평 작성자 중복 | validator | `ONE_LINE_REVIEWS_DUPLICATE` | 1회 재시도 | 모델 변경 |
| feedback markdown 템플릿 위반 | validator | `FEEDBACK_TEMPLATE_INVALID` | 1회 재시도 | 모델 변경 또는 instruction |
| Host 일 cap | guard | `HOST_DAILY_CAP_EXCEEDED` | 없음 | 다음 날 |
| 클럽 월 cap | guard | `CLUB_MONTHLY_CAP_EXCEEDED` | 없음 | 운영자 |
| Rate limit | guard | `RATE_LIMITED` | 없음 | 카운트다운 후 |
| Redis 비활성 | intake | `AI_DISABLED` | 없음 | 운영자 |
| Job 만료 | intake | `JOB_EXPIRED` | 없음 | 재업로드 |
| Kafka 발행 실패 | producer | `QUEUE_UNAVAILABLE` | 1회 재시도 | 운영자 |

총 LLM 호출 ≤ 3회/job 으로 상한. 각 호출은 audit log row 별도.

### 9.3 Hallucination 방지

system prompt 고정 문구:

1. 녹취록에 없는 사실·평가·배경을 만들지 말 것.
2. 참석자 이름은 정확히 다음 목록에서만 선택할 것.
3. 공개 요약·하이라이트에 이메일·연락처·주소·사적 관계·의료·재정 정보 포함 금지.
4. 회차 번호·책 제목·날짜는 다음 값을 그대로 사용할 것.
5. Feedback markdown은 `<!-- readmates-feedback:v1 -->` 로 시작하고 `# 독서모임 N차 피드백` 헤더를 포함할 것.

기계 검증 가능 항목(이름 매칭, 헤더, 개수)은 validator가 enforce한다. PII 필터링은 호스트 검토에 의존하며 PREVIEW UI에 안내문이 항상 표시된다.

### 9.4 부분 재생성 일관성

- Adapter는 요청 item에 대응하는 schema 부분만 응답하도록 prompt와 schema를 좁힌다.
- Server는 응답을 Redis snapshot의 해당 필드에만 patch한다.
- 같은 jobId에 대한 동시 regen 요청은 server-side lock으로 순차 처리한다.

## 10. UI/UX

기존 호스트 세션 편집기 상단에 모드 토글 추가: `[ 외부 도구 JSON 업로드 ]` `[ AI 결과 가져오기 ]`. 외부 JSON 모드는 기존 화면 그대로다. AI 모드의 화면 모듈은 다음과 같다.

| 화면 상태 | 주요 컴포넌트 |
| --- | --- |
| IDLE | `TranscriptUploadForm` — read-only 세션 메타, 파일 선택, 모델 드롭다운(클럽 default 표시), 자유 instructions textarea, 예상 비용·남은 한도, 생성 시작 버튼 |
| GENERATING | `GenerationProgressView` — 진행률 바·단계 텍스트·경과 시간·취소 버튼·30s 안내·60s 알림 안내 |
| PREVIEW | `PreviewView` (외부 JSON 모드와 시각 동일) → `SummarySection`, `HighlightsSection`, `OneLineReviewsSection`, `FeedbackDocumentSection`. 각 섹션 헤더에 ✨ 재생성 액션, `RegenerateModal` |
| ERROR | 실패 메시지 + "다시 시도" 또는 모델 변경 안내 |
| COMMITTED | 기존 호스트 편집기 메인 화면으로 복귀 |

frontend 파일은 `front/features/host/aigen/` 하위에 둔다. PREVIEW 이하 결과 표시 UI는 외부 JSON 모드와 컴포넌트를 공유한다.

수동 편집은 클라이언트 state만 변경하고, commit 시점에 server에 최종 snapshot을 전달해 Redis snapshot을 덮어쓴 다음 validator를 통과시킨다. 미저장 편집은 `localStorage` 의 `aigen-draft:{jobId}` 키에 임시 보관한다.

별도 클럽 설정 sub-tab에 `클럽 default 모델` 항목을 추가한다(`/api/host/clubs/{clubSlug}/ai-defaults`).

## 11. 운영과 관찰성

### 11.1 Prometheus metrics (Micrometer)

라벨은 `provider`, `model`, `kind`, `status`, `reason`, `direction` enum에 한정한다. transcript, hostId, sessionId 라벨은 금지한다.

- `readmates_aigen_jobs_total` (counter)
- `readmates_aigen_jobs_completed_total{status,provider,model,kind}` (counter)
- `readmates_aigen_latency_seconds{provider,model,kind}` (histogram)
- `readmates_aigen_tokens_total{provider,model,direction}` (counter, direction = input|cached_input|output)
- `readmates_aigen_cost_usd_total{provider,model}` (counter)
- `readmates_aigen_validation_failures_total{reason}` (counter)
- `readmates_aigen_cap_denials_total{reason}` (counter)
- `readmates_aigen_queue_depth` (gauge, consumer lag)

### 11.2 알림 규칙

| Alert | 조건 | 심각도 |
| --- | --- | --- |
| `AiGenProviderErrorBurst` | error_code ~= `PROVIDER_*` 비율 10m 임계 초과 | warn |
| `AiGenSchemaFailureSpike` | `SCHEMA_INVALID` 비율 > 20% 1h | warn |
| `AiGenBudgetExhaustion` | 특정 club_id 월 cost ≥ $20 | info |
| `AiGenQueueLagHigh` | consumer lag > 50 5m | warn |
| `AiGenRedisDown` | Redis ping 실패 + 503 비율 상승 | critical |

### 11.3 Kill switch

```yaml
readmates:
  aigen:
    enabled: true
    enabled-providers: [ CLAUDE, OPENAI, GEMINI ]
    fallback-default-model: claude-sonnet-4-6
    caps:
      hostDailyCalls: 10
      clubMonthlyCostUsd: 20.00
      hostPerMinuteCalls: 5
      softWarningRatio: 0.80
    job:
      redisTtl: 6h
      notificationLatencyThreshold: 60s
      maxLlmCallsPerJob: 3
    pricing:
      claude-sonnet-4-6:    { inputPerMTokenUsd: 3.00, cachedInputPerMTokenUsd: 0.30, outputPerMTokenUsd: 15.00 }
      claude-opus-4-7:      { inputPerMTokenUsd: 15.0, cachedInputPerMTokenUsd: 1.50, outputPerMTokenUsd: 75.00 }
      openai-gpt-4-1:       { inputPerMTokenUsd: ...,   outputPerMTokenUsd: ... }
      openai-gpt-4-1-mini:  { inputPerMTokenUsd: ...,   outputPerMTokenUsd: ... }
      gemini-2-5-pro:       { inputPerMTokenUsd: ...,   outputPerMTokenUsd: ... }
      gemini-2-5-flash:     { inputPerMTokenUsd: ...,   outputPerMTokenUsd: ... }
```

비활성화 동작: `enabled: false` → 모든 `/ai-generate/*` 503 + UI 모드 탭 숨김. `enabled-providers` 에서 제거된 provider → catalog 응답에서 빠지고, 클럽 default가 그 provider면 자동 fallback. 즉시 변경 수단은 yaml + 재배포(v1).

### 11.4 Runbook

신규 파일 `docs/operations/runbooks/ai-session-generation.md` 작성. 항목:

1. 새 모델 allowlist 추가/제거 (yaml + deploy + smoke)
2. 클럽 cost cap 임시 상향 (Redis 키 수동 reset)
3. 호스트 일일 cap 임시 해제 (감사 흔적 남기는 절차)
4. provider key 회전 (env 회전 + 재시작 + smoke)
5. Schema 실패 spike 발생 시 조사 (audit 쿼리)
6. 호스트의 결과 의심 보고 대응 (audit + sessionId, 본문은 호스트에게 재요청)
7. provider 장애 시 임시 fallback (catalog에서 제거 후 deploy)
8. 전체 disable kill switch

## 12. 테스트 전략

### 12.1 단위 테스트 (server)

- 도메인/application: `GenerationCostGuard`, `ModelCatalog`, `AiGenerationOrchestrator`, `AiGenerationRegenerationService`, `AiGenerationCommitService`.
- Provider adapter(mock SDK): `Claude/OpenAi/Gemini` generator/regenerator 각각 — schema/tool 구성, retention 옵션, 토큰 매핑, error mapping, PII invariant(transcript sentinel이 error 메시지에 등장 안 함).

### 12.2 통합 테스트 (Testcontainers MySQL/Redpanda/Redis)

- `AiGenerateApiIntegrationTest` — 권한, BFF secret, full flow with deterministic stub provider.
- `RedisLifecycleIntegrationTest` — TTL, commit/cancel/failed DEL, 만료 410, Redis 비활성 503.
- `AuditLogIntegrationTest` — 모든 호출에 1행, transcript 본문 부재, sha256 매칭, masked error.
- `CostCapIntegrationTest` — 경계 (9·10·11), $19.99·$20.00, soft warning 80%.
- `KafkaWorkerIntegrationTest` — enqueue → consume → 결과 저장, consumer crash 재처리, payload에 transcript 없음.

### 12.3 Provider 실제 호출

CI에서 실행하지 않는다. `scripts/aigen-smoke-{claude,openai,gemini}.sh` 로 운영자가 수동 실행한다. 운영 키와 분리된 dev/eval key를 사용한다.

### 12.4 Frontend 테스트 (Vitest + Testing Library)

- `useAiGenerationJob` polling, `TranscriptUploadForm` 입력 검증, `GenerationProgressView` 표시, `PreviewView` 섹션·재생성 트리거, `RegenerateModal`, localStorage draft 복원.

### 12.5 E2E (Playwright)

Spring을 `aigen.mock=true` profile로 띄워 deterministic stub provider 사용. `aigen-full-flow`, `aigen-regenerate`, `aigen-cancel`, `aigen-cost-cap`, `aigen-expired-job`, `aigen-jsonupload-coexistence`.

### 12.6 보안·PII 회귀 (CI)

`scripts/aigen-pii-check.sh` — column 정의 grep, Kafka producer 인자 정적 검사, metric label allowlist 검사.

### 12.7 LLM 품질 회귀

v1 범위 외. v2 검토 항목.

## 13. 출시 계획

### 13.1 Phase 분할

| Phase | 내용 |
| --- | --- |
| 0 | 도메인 계약: `SessionContentGenerator`/`Regenerator` 인터페이스, `ModelId`/`ModelCatalog`/pricing yaml, 기존 `SessionImportUseCases` 의 commit path를 AI 흐름에서도 재사용 가능하게 유지(필요 시 가벼운 refactor). |
| 1 | Claude adapter + Redis 스키마 + audit Flyway + `GenerationCostGuard` + `AiGenerationOrchestrator` + kill switch config. |
| 2 | Kafka topic + producer/consumer + 5개 `/ai-generate/*` endpoint + 클럽 default 2개 endpoint. Claude로 end-to-end 동작. |
| 3 | Frontend AI 모드 탭, 컴포넌트 일체, BFF route, E2E (mock provider). |
| 4 | OpenAI adapter + 단위/통합 테스트. |
| 5 | Gemini adapter + 단위/통합 테스트. |
| 6 | 60s 알림 트리거, Prometheus dashboard, alert 규칙, runbook, PII shell script, smoke scripts. |
| 7 | 클럽 default UI sub-tab. |

v1 출시는 Phase 0 ~ 7 전체를 포함한다. Critical path(Claude만으로 end-to-end 동작이 가능한 최소 묶음)는 0 → 1 → 2 → 3 → 6 이며, Phase 4(OpenAI)와 5(Gemini)는 Phase 1 완료 후 critical path와 병렬로 진행한다. Phase 7(클럽 default UI)도 Phase 2 이후 병렬 가능하다. 운영 사정으로 v1을 더 빠르게 닫아야 할 경우에 한해 Phase 4/5/7 을 v1.1/v1.2 로 분리할 수 있으나, 기본 계획은 동시 출시다.

### 13.2 Rollout

1. 전체 코드를 kill switch off 상태로 배포.
2. 운영자가 단일 클럽에서 dogfood (1주).
3. audit·비용·실패율 관찰 후 global on.
4. Provider 확장(Phase 4/5)도 같은 패턴: kill switch off로 배포 → provider별 on.

### 13.3 문서 영향

- `README.md` 의 "AI-assisted 운영 콘텐츠" 문장 갱신(앱이 AI API를 직접 호출하지 않는다는 단정 수정).
- `docs/development/session-import-generator.md` 에 AI 모드와 외부 JSON 모드 병존 안내 추가.
- `docs/development/architecture.md` 에 AI generation 컴포넌트와 Kafka topic 추가.
- `docs/operations/runbooks/ai-session-generation.md` 신규.
- `CHANGELOG.md` 에 Phase별 entry.

각 문서 변경은 해당 Phase PR에 동봉한다.

## 14. 의존성과 위험

### 14.1 외부 의존성

- Anthropic Java SDK (또는 Kotlin wrapper)
- OpenAI Java SDK
- Google GenAI Java SDK

각 SDK 정확한 좌표·버전은 구현 단계에서 `claude-api` 스킬과 `context7` MCP 로 최신 docs를 확인한 뒤 결정한다. 이 spec은 구체 좌표를 박지 않는다.

### 14.2 위험

| 위험 | 완화 |
| --- | --- |
| Provider 모델·SDK 변경으로 schema 강제가 깨짐 | adapter별 통합 테스트 + manual smoke + kill switch |
| 비용 폭주 | 다층 cap(호스트/클럽/rate) + Prometheus alert + soft warning UI |
| Transcript 본문 유출 | Redis 외 영구 저장 금지를 코드/테스트/CI shell 로 강제 |
| LLM 출력 품질 저하 | 호스트 검토 commit gate + 수동 편집 허용 + 자동 재시도 1회 |
| Redis 장애 | AI generation 503 graceful, 기존 외부 JSON 흐름은 영향 없음 |
| Kafka 장애 | producer 재시도 + Redis 키 cleanup, 호스트에게 운영자 문의 안내 |
| README 신뢰 모델 변경 | README 문구 명시적 갱신, 변경 PR에 동봉 |

## 15. 합의된 결정 요약

| 영역 | 결정 |
| --- | --- |
| 입력 | 텍스트 녹취록 파일 업로드(.txt, ≤ 1MB), 세션 메타는 자동 주입 |
| UX | Preview + per-item 재생성 + 자연어 instruction + 모델 override + 수동 편집 |
| Provider | Claude/OpenAI/Gemini abstraction, v1 동시 출시(Claude만 prompt caching 최적화) |
| 모델 선택 granularity | 클럽 default + 호스트 per-generation override |
| API key | 플랫폼 단일 키 (provider별 env var) |
| 타이밍 | 풀 생성 polling + 60s 초과 시 in-app 알림함 |
| 저장 | Redis 6h TTL, transcript 영구 저장 0, audit log만 MySQL |
| 재생성 단위 | 요약 / 하이라이트 전체 / 한줄평 전체 / 피드백 문서 + instruction + 모델 override |
| Endpoint | 신설 `/ai-generate/*`, 기존 `/session-import/*` 보존, commit은 기존 service에 위임 |
| 한도 | 호스트 일 10, 클럽 월 $20, 호스트 분당 5, soft warning 80% |
| 검증 | 3단계(입력·LLM 결과·commit), 1회 자동 재시도, 총 호출 ≤ 3 |
| 테스트 | 단위·통합·E2E(mock)·PII 회귀(CI), 실제 provider 호출은 수동 smoke |
| 출시 | 8 phase, Claude critical path, kill switch off 배포 후 dogfood |

## 부록 — Phase 8 Risk Resolution (2026-05-17)

플랜의 Phase 0–7가 모두 끝난 직후 실행한 risk-resolution 라운드의 결과입니다. 본문 §1–§15의 설계 의도를 그대로 유지하면서, 본문 작성 시점에 SDK 라이브 호출이 `NotImplementedError`로 deferred 되어 있던 항목과 task_1_7 리뷰에서 보고된 outstanding 11건을 닫았습니다.

| Sub-task | 결과 | Commits | 비고 |
|---|---|---|---|
| task_8_1 — Claude SDK 라이브 와이어 | COMPLETE | `8baecd9f` | `com.anthropic:anthropic-java`의 `messages.create(...)` + `Tool` `input_schema` + `ToolChoiceTool` + `TextBlockParam.cacheControl` 실호출 완료. |
| task_8_2 — OpenAI SDK 라이브 와이어 | COMPLETE | `4f6e493d` | `com.openai:openai-java`의 `chat().completions().create(...)` 실호출 + `strict: true` + `store: false` 정합. |
| task_8_3 — Gemini SDK 라이브 와이어 | COMPLETE | `49f7cb90`, `3c1afc02` | `com.google.genai:google-genai`의 `client.models.generateContent(...)` + `responseSchema` 실호출. Gemini 데이터 보관 정책은 SDK 옵션이 아닌 운영자 측 paid-tier project 프로비저닝으로 enforcement (runbook §9에 절차 명시; `x-goog-data-policy` 헤더는 best-effort signal). |
| task_8_4 — task_1_7 outstanding 11건 해소 | COMPLETE (WARN) | `bd800b24`, `fde3caa6`, `275b0130`, `58095a7e` | #1–#3은 task_2_5 (`600ab00e`)에서 이미 닫혔고 본 task에서 재검증; #4–#11 8건을 본 task에서 closure. 비차단 잔여 2건은 `.orchestrator/state.json:task_8_4.review_notes` 기록. |
| task_8_5 — 전체 검증 스위트 | COMPLETE (WARN) | (검증 전용, 코드 변경 없음) | `compileKotlin`/`compileTestKotlin`/`unitTest` (539) / `architectureTest` / 프론트 `pnpm test` (830) 전부 GREEN. `ktlintCheck` (605→447, ‑158) · `detekt` (51→46, ‑5) · `integrationTest` (Testcontainers + ObjectMapper bean autoconfig issue) 는 Phase 8 진입 직전 (`f4da2d14`) 에 이미 존재하던 baseline 실패로, 본 플랜의 회귀 아님 (PRE-Phase8 baseline 대비 모든 지표가 개선되었음을 confirm). |
| task_8_6 — CHANGELOG + spec close-out | COMPLETE | (본 commit) | CHANGELOG `Risk resolution (Phase 8)` 서브섹션에 모든 sub-task 와 commit SHA를 기재하고, 본 부록을 추가. |

본문에 “라이브 SDK 와이어는 후속 단계에서 채운다”고 적힌 task_1_6 / task_4_2 / task_5_3 deferred 항목은 위 task_8_1 / task_8_2 / task_8_3 에 의해 Phase 8에서 종결되었습니다 — 해당 본문 단락의 결정 자체는 변경되지 않으며, 단지 실행 완료 시점이 본 부록으로 확정됩니다.
