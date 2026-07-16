# Case Study 04 — PII-safe grounded AI session generation

> 호스트가 전체 대본을 업로드하면 서버가 먼저 화자를 같은 클럽의 활성 멤버와 정확히 연결하고, LLM 결과의 모든 항목을 원본 turn 근거와 묶습니다. 호스트는 네 섹션의 근거 또는 직접 편집을 확인한 뒤에만 저장할 수 있습니다. Transcript, parsed turns, result, evidence는 Redis에 6시간만 두고 Kafka와 MySQL에는 콘텐츠를 남기지 않으며, revision CAS와 content-free commit receipt로 crash window를 복구합니다.

## 문제

**호스트 운영 병목**

모임이 끝난 뒤 호스트는 대본에서 공개 요약, 하이라이트, 한줄평, 참석자용 피드백 문서를 다시 정리해야 합니다. 외부 JSON 가져오기는 안전한 fallback이지만 LLM 호출, 근거 확인, 결과 업로드가 앱 밖에서 분리되어 반복 작업이 큽니다.

**“형식이 맞는 결과”만으로는 부족함**

초기 in-app AI 흐름은 비동기 job, schema validation, provider adapter, cost cap을 제공했습니다. 하지만 실제 제품 수준에서는 다음 사각지대가 남았습니다.

- 대본 화자가 현재 클럽의 활성 멤버인지 provider 호출 전에 확정되지 않으면 잘못된 이름이 결과와 비용 기록에 들어갑니다.
- JSON schema가 맞아도 각 요약·하이라이트·한줄평·피드백이 어느 원문 발언에서 왔는지 검토할 수 없습니다.
- 브라우저 수동 편집, 재생성, 늦게 도착한 polling 응답이 섞이면 사용자가 보지 않은 revision을 저장할 수 있습니다.
- MySQL commit은 성공했지만 Redis 상태 갱신이나 payload 삭제가 실패하는 crash window에서 같은 내용을 두 번 쓸 수 있습니다.
- Provider SDK의 숨은 retry와 오래된 worker가 비용 cap과 call budget을 우회할 수 있습니다.

**제약**

- 공개 저장소에는 실제 transcript, 멤버 이름, provider key, 운영 host, private deployment state를 남기지 않습니다.
- 최종 저장은 기존 `readmates-session-import:v1` validation/commit 경계를 재사용합니다.
- OpenAI, Claude, Gemini가 서로 다른 API를 사용해도 같은 입력 bytes, schema, 근거 계약, call budget을 지켜야 합니다.
- Private transcript를 live provider로 보내는 품질 평가는 일반 CI나 smoke에 포함하지 않고 별도 승인을 요구합니다.

## 접근

| 대안 | 기각 이유 |
| --- | --- |
| Browser에서 provider API 직접 호출 | API key와 retention/cost 정책을 브라우저 경계에서 통제할 수 없습니다. |
| Spring controller에서 동기 호출 후 바로 저장 | timeout, 취소, 재시도, 진행률, revision 충돌과 crash recovery를 다룰 수 없습니다. |
| Kafka message에 전체 대본 포함 | broker, log, DLQ가 private content 저장소가 됩니다. |
| LLM이 낸 excerpt를 그대로 근거로 노출 | 모델이 원문에 없는 문장을 만들거나 너무 긴 private text를 반환할 수 있습니다. |
| MySQL에 draft와 evidence 저장 | 검토 전 private content가 durable store와 운영 조회면으로 퍼집니다. |

**선택: side-effect-free preflight + grounded generation + revisioned review + recoverable commit**

서버는 job을 만들기 전에 입력 형식, 시간 범위, 활성 멤버 이름, model capability와 request budget을 검증합니다. 통과한 전체 대본만 Redis TTL payload로 넘기고 Kafka에는 routing metadata만 발행합니다. Provider는 구조화된 draft와 turn ID를 반환하지만, 최종 evidence excerpt는 서버가 원본 turn에서 다시 만듭니다. 호스트가 현재 revision의 네 섹션을 모두 확인해야 commit할 수 있고, MySQL의 content-free receipt가 Redis와 DB 사이의 복구 기준이 됩니다.

## 구현

### 1. Provider 호출 전 preflight

지원 입력은 UTF-8 또는 UTF-8 BOM `.txt`이며 최대 1 MiB, 3시간입니다. 각 발언은 `화자명 MM:SS` header와 본문을 사용하고 timestamp는 단조 증가해야 합니다.

`GroundedTranscriptPreflightService`는 다음 순서로 실행됩니다.

1. 현재 사용자가 같은 클럽의 활성 호스트인지, 세션이 AI 생성 가능한 상태인지 확인합니다.
2. 대본을 turn으로 파싱하고 Unicode NFC + trim 후 case-sensitive exact match로 모든 고유 화자를 같은 클럽의 `ACTIVE` membership 하나에 연결합니다.
3. generic label, 비회원, 비활성/다른 클럽 회원, 정규화 후 중복 표시 이름을 거절합니다.
4. 실제 `GroundedRequestRenderer`가 만들 request와 16,384 output reserve, safety margin을 model capability와 비교합니다.

이 단계의 422/503 실패는 job ID, Redis, Kafka, provider, cost side effect를 만들지 않습니다. 임의 alias/fuzzy match나 대본 chunking으로 우회하지 않습니다.

### 2. Redis 4-payload와 Kafka metadata queue

```text
Browser host editor
  |
  | multipart TXT + server-provided model ID
  v
Transcript preflight
  |
  v
Redis aigen:job:<jobId>              content-free metadata, TTL 6h
Redis aigen:job:<jobId>:transcript   normalized transcript, TTL 6h
Redis aigen:job:<jobId>:turns        membership-bound turns, TTL 6h
  |
  `-> Kafka readmates.aigen.jobs.v1  routing metadata only
          |
          v
      AiGenerationWorker
          |
          v
Redis aigen:job:<jobId>:result       validated snapshot, TTL 6h
Redis aigen:job:<jobId>:evidence     revision-scoped evidence, TTL 6h
```

Kafka message는 `jobId`, `sessionId`, `clubId`, `hostUserId`, provider, model, job kind만 담습니다. Transcript, parsed turns, 이름, prompt/instructions, result, evidence/excerpt는 Kafka, notification payload, metric, log에 넣지 않습니다.

네 payload는 같은 6시간 TTL을 갖습니다. 필수 payload 하나가 먼저 만료하면 부분 결과를 노출하지 않고 `JOB_EXPIRED`로 실패합니다. Commit/cancel은 네 payload를 삭제하고 terminal hash만 TTL까지 남깁니다.

### 3. 전체 대본 structured generation과 서버 소유 근거

Grounded pipeline은 provider별 `WholeTranscriptGroundedGenerator`를 사용합니다. OpenAI, Claude, Gemini adapter는 같은 renderer의 system instruction, schema, ordered turns, explicit max output을 사용합니다.

- Primary generation은 전체 대본 1회 호출입니다.
- 정확히 한 section이 schema/grounding 검증에 실패할 때만 같은 provider로 전체 대본을 유지한 section repair 1회를 허용합니다.
- Availability fallback, repair, regeneration은 같은 atomic `llmCallCount`와 cost cap을 사용합니다.
- Pricing catalog과 capability catalog은 분리합니다. Capability가 확인되지 않은 모델은 grounded model endpoint에 노출하지 않습니다.

LLM은 각 authored item에 `evidenceTurnIds`를 반환하지만 excerpt는 직접 정하지 않습니다. `GroundedEvidenceProjector`가 현재 revision의 원본 turn에서 최대 240 Unicode code point를 만들어 반환합니다. 전체 발언 확장은 현재 evidence가 참조한 단일 turn에 대해서만 허용하며 transcript search/download endpoint는 없습니다.

### 4. Revision별 호스트 review workspace

프런트엔드는 `front/features/host/aigen/` 안에서 API, query, pure review model, UI를 분리합니다. 서버의 `/models` 응답이 모델 목록의 source of truth이며 browser에 provider model ID를 별도 hardcode하지 않습니다.

호스트는 네 섹션을 각각 검토합니다.

- 요약
- 하이라이트
- 한줄평
- 피드백 문서

AI 결과를 그대로 쓴 섹션은 `AI_GROUNDED_REVIEWED`, 직접 수정한 섹션은 `USER_EDITED_CONFIRMED`가 되어야 합니다. 항목을 수정하면 해당 근거와 review는 무효화됩니다. 재생성은 revision을 증가시키고 네 섹션 review를 모두 초기화합니다. Commit은 현재 `expectedRevision`, edited result, section review ledger가 함께 맞을 때만 열립니다.

브라우저 draft는 revision을 포함한 복구 envelope로 최대 6시간만 저장합니다. 예약된 삭제와 만료 후 재저장 차단을 적용하며 transcript, parsed turns, evidence/excerpt는 localStorage에 넣지 않습니다.

### 5. Recoverable commit

정상 상태 전이는 다음과 같습니다.

```text
PENDING -> RUNNING -> SUCCEEDED -> COMMITTING -> COMMITTED
                     |              |
                     |              +-- receipt 없음/lease 만료 -> COMMIT_RETRY
                     `-- regenerate -> revision 증가 + review 초기화

COMMIT_RETRY -> COMMITTING -> COMMITTED
COMMITTED + cleanupPending -> cleanup only retry
```

`AiGenerationCommitService`는 Redis revision CAS와 bounded `COMMITTING` lease를 잡고 한 MySQL transaction에서 활성 멤버를 재검증합니다. 그 안에서 participant upsert, `SessionImportService.commitValidated(...)`, unique `job_id + revision` receipt insert를 함께 수행합니다.

복구 scheduler는 receipt가 있으면 session content를 다시 쓰지 않고 `COMMITTED`로 수렴합니다. Receipt가 없으면 `COMMIT_RETRY`로 돌려 안전한 commit만 재시도합니다. DB commit 후 cache invalidation이나 Redis 삭제만 실패한 경우 `cleanupPending=true`를 남기고 cleanup만 반복합니다.

MySQL `ai_generation_commit_receipts`와 audit row에는 transcript, 이름, result, evidence/excerpt를 저장하지 않습니다. Pipeline, provider/model/status/revision과 turn/speaker/review/warning aggregate만 남깁니다.

### 6. 비용과 동시성 fail-closed

Redis Lua admission은 host 24시간/60초 counter, club monthly cost, 5분 owner-token provider admission lease를 원자적으로 확인합니다. Worker와 regeneration은 retry/repair를 포함한 각 실제 provider network call 직전에 같은 owner로 lease를 갱신합니다.

Owner가 없거나 바뀌면 provider를 호출하지 않습니다. OpenAI/Claude SDK 내부 retry는 끄고 provider HTTP timeout을 4분으로 제한해 5분 lease보다 짧게 유지합니다. Job save나 queue publish처럼 provider 호출 전 실패는 counter와 lease를 원자적으로 되돌립니다. Redis 응답이 불명확하면 비용을 낙관적으로 허용하지 않습니다.

### 7. 운영 rollout과 privacy 경계

`readmates.aigen.enabled` kill switch와 `enabled-providers` allowlist가 가장 먼저 적용됩니다. Pipeline 기본값은 `LEGACY`이며, 환경별 mock/E2E, provider capability/retention, rollback checklist가 끝난 뒤에만 `GROUNDED_WHOLE_TRANSCRIPT`로 바꿉니다. 장애 시 pipeline을 `LEGACY`로 되돌리며 보안·비용 사건은 kill switch까지 내립니다.

Platform admin은 job ID, status, revision, safe error, `cleanupPending` 같은 metadata만 봅니다. Transcript, 이름, result, evidence를 열거나 수정·commit하지 않습니다. Private transcript를 live provider에 보내는 평가는 별도 명시 승인 없이는 실행하지 않습니다.

## 검증

**서버 계약과 persistence**

- `TranscriptParserTest`, `TranscriptMembershipValidatorTest`, `GroundedInputBudgetGuardTest`가 side-effect-free preflight와 입력 경계를 고정합니다.
- `OpenAiSpringAiContractTest`, `AnthropicSpringAiContractTest`, `GoogleGenAiSpringAiContractTest`와 `SpringAiWholeTranscriptGroundedGeneratorTest`가 provider wire/schema/usage와 thin adapter 계약을 확인합니다.
- `RedisGroundedAiGenerationJobStoreTest`, `RedisProviderCallReservationAdapterTest`가 4-payload TTL, revision CAS, atomic call/cost reservation, crash recovery와 cleanup을 검증합니다.
- `AiGenerateGroundedCommitIntegrationTest`, `JdbcAiGenerationCommitPersistenceAdapterTest`, `AiGenerationCommitRecoveryServiceTest`가 receipt 기반 commit/recovery를 검증합니다.
- `FrontendZodSchemaContractTest`와 exported Zod fixtures가 server/frontend 직렬화 drift를 차단합니다.

**프런트엔드와 E2E**

- `aigen-review-state.test.ts`와 `PreviewView`/`EvidencePanel` tests가 review invalidation, revision reset, commit gate를 확인합니다.
- Playwright `aigen-evidence-review.spec.ts`, `aigen-mobile-evidence.spec.ts`, `aigen-invalid-speaker.spec.ts`, `aigen-commit-recovery.spec.ts`가 desktop/mobile 근거 검토, preflight denial, recovery를 확인합니다.
- BFF unit test가 과대 multipart body를 upstream buffering 전에 거절하는지 확인합니다.

**PII와 공개 릴리스**

`bash scripts/aigen-pii-check.sh`는 self-test fixture와 15개 invariant로 다음 경계를 검사합니다.

- 네 Redis payload의 adapter 소유권, TTL, terminal cleanup
- Grounded metadata hash의 content-free field 계약
- Kafka routing-metadata-only message와 trace-header allowlist
- Flyway/audit/receipt의 content-free schema
- Spring AI content observation 비활성화와 metric/span/baggage allowlist
- request/response/transcript/evidence/raw-provider-error logging 금지

공개 릴리스 후보는 `*.tsbuildinfo` 같은 로컬 incremental metadata도 제외하고 fixture로 재유입을 차단합니다.

## Trade-off와 한계

- **Redis가 transient private-content store가 됨:** Durable DB와 broker에서는 콘텐츠를 뺐지만 worker/review/recovery를 위해 네 payload를 최대 6시간 보관합니다. TTL, partial expiry, terminal cleanup, 운영자의 metadata-only 조회 규칙이 필요합니다.
- **비동기 workflow와 review state가 복잡함:** Controller, queue, worker, Redis CAS, revision, receipt, polling UI가 늘어납니다. 대신 timeout, 취소, stale response, 중복 commit, crash cleanup을 각각 검증할 수 있습니다.
- **정확한 멤버 이름을 요구함:** Alias와 fuzzy match를 지원하지 않아 호스트가 TXT를 고쳐 재업로드해야 할 수 있습니다. 잘못된 사람에게 private feedback이 연결되는 위험을 제품 편의보다 우선했습니다.
- **Provider retention은 코드만으로 보장할 수 없음:** Provider-side 데이터 사용과 보유 조건은 운영 provisioning과 별도 승인으로 확인해야 합니다.
- **긴 대본을 chunking하지 않음:** 현재는 전체 문맥과 일관된 근거를 우선해 model budget을 넘는 입력을 422로 거절합니다.

## 다음 개선 후보

- Public-safe 합성 대본 corpus를 늘려 provider별 schema/grounding drift를 live private data 없이 더 일찍 탐지합니다.
- Host review에서 revision 간 변경 원인을 더 명확히 보여 주되 evidence 원문을 브라우저 저장소나 운영 로그로 넓히지 않습니다.
- Model capability와 pricing 변경을 release checklist에서 자동 비교하되 외부 provider 공식 문서 확인은 사람 승인 단계로 유지합니다.

## 관련 문서

- Current architecture: [`docs/development/architecture.md`](../development/architecture.md#in-app-ai-세션-생성-컴포넌트)
- Host workflow and external JSON fallback: [`docs/development/session-import-generator.md`](../development/session-import-generator.md)
- Operations: [`docs/operations/runbooks/ai-session-generation.md`](../operations/runbooks/ai-session-generation.md)
- Release notes: [`CHANGELOG.md`](../../CHANGELOG.md#unreleased)
- Historical design record: [`docs/superpowers/specs/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation-design.md`](../superpowers/specs/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation-design.md)
