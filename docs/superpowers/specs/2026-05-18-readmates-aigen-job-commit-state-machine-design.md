# ReadMates AI Generation Job/Commit State Machine Design

작성일: 2026-05-18
상태: APPROVED DESIGN SPEC

## 배경

ReadMates의 in-app AI 세션 생성은 이미 단순 LLM 호출이 아니다. 호스트가 transcript를 업로드하면 Spring API가 권한과 비용 한도를 확인하고, transcript는 Redis TTL key에만 보관하며, Kafka job metadata를 통해 worker가 provider adapter를 호출한다. 결과는 `readmates-session-import:v1` schema validator를 통과한 뒤 preview 상태가 되고, commit 시 기존 `SessionImportService.commitValidated(...)` 경계로 저장된다.

최근 보강으로 다음 위험은 이미 상당 부분 닫혔다.

- commit override가 자기 검증 기준을 바꾸지 못하도록 원본 `SessionMeta`를 trust boundary로 사용한다.
- regenerate 결과는 full snapshot으로 patch한 뒤 validator를 통과해야 Redis result를 갱신한다.
- queue publish 실패는 `QUEUE_UNAVAILABLE` audit과 `FAILED` 상태로 보상한다.
- stale transcript key는 hash/result key와 함께 정리한다.
- retry attempt마다 audit row를 남기고 provider availability retry와 schema retry의 prompt 강화 정책을 분리한다.

남은 개선 지점은 "AI 결과 품질"이 아니라 **비동기 job과 commit lifecycle을 더 명시적인 상태 기계로 만드는 것**이다. 현재 status는 `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`이고, commit은 성공 후 Redis job key를 삭제한다. 이 구조는 정상 흐름에는 충분하지만, worker/cancel/commit/regenerate 경합과 commit 완료 후 클라이언트 상태 표현을 서버 규칙으로 명확히 고정하지 못한다.

## 목표

- AI generation job의 상태 전이와 액션 가능 조건을 명시한다.
- worker, regenerate, commit, cancel이 같은 상태 전이 규칙을 사용하게 한다.
- Redis job store에 compare-and-set 성격의 atomic transition API를 둔다.
- commit 중복, cancel/worker 경합, regenerate/commit 경합을 서버에서 차단한다.
- commit 성공 후 transcript/result payload는 삭제하되, terminal job hash는 TTL 동안 남겨 `GET /jobs/{jobId}`가 `COMMITTED` 상태를 안전하게 반환할 수 있게 한다.
- 프론트 폴링과 상태 UI가 서버 상태를 그대로 해석하게 한다.
- transcript, provider raw error, private member data, secret, deployment state를 새 로그/문서/fixture에 넣지 않는다.

## 비목표

- Prompt 품질 개선, LLM 출력 문체 개선, LLM-as-judge 평가는 하지 않는다.
- 모델 catalog API 단일화는 이번 범위에 포함하지 않는다.
- platform admin 운영 콘솔, AI audit explorer, dead-letter UI는 후속 범위다.
- `SessionImportService.commitValidated(...)`의 내부 저장 모델은 재작성하지 않는다.
- 기존 AI provider adapter 구조를 교체하지 않는다.
- DB migration을 추가하지 않는 방향을 우선한다. Redis job status enum과 wire DTO 변경만으로 닫을 수 있어야 한다.

## 승인된 방향

`COMMITTING`과 `COMMITTED`를 job status에 추가한다. `EXPIRED`는 저장 상태로 추가하지 않고, Redis job이 없으면 현재처럼 410 `JOB_EXPIRED`로 표현한다.

Commit 흐름은 다음 상태 기계를 따른다.

```text
SUCCEEDED
  -> COMMITTING
      -> COMMITTED   commit 성공, transcript/result 삭제
      -> SUCCEEDED   commit 검증/저장 실패, 호스트 수정 후 재시도 가능
```

이 방향은 `COMMITTED` 없이 즉시 job key를 삭제하는 방식보다 클라이언트 표현이 안정적이고, `COMMITTING` 없이 commit delegate를 호출하는 방식보다 중복 commit 차단이 명확하다.

## 상태 전이 규칙

| 현재 상태 | 가능한 전이 | 허용 액션 |
| --- | --- | --- |
| `PENDING` | `RUNNING`, `FAILED`, `CANCELLED` | `get`, `cancel` |
| `RUNNING` | `SUCCEEDED`, `FAILED`, `CANCELLED` | `get`, `cancel` |
| `SUCCEEDED` | `SUCCEEDED`, `COMMITTING`, `CANCELLED` | `get`, `regenerate`, `commit`, `cancel` |
| `COMMITTING` | `COMMITTED`, `SUCCEEDED`, `FAILED` | `get` |
| `COMMITTED` | terminal | `get` |
| `FAILED` | terminal | `get` |
| `CANCELLED` | terminal | `get` |
| missing/expired | terminal | 410 `JOB_EXPIRED` |

### 액션 정책

- `regenerate`는 `SUCCEEDED`에서만 허용한다.
- `commit`은 `SUCCEEDED`에서만 시작한다. 검증 실패는 상태를 바꾸지 않는다.
- `cancel`은 `PENDING`, `RUNNING`, `SUCCEEDED`에서만 허용한다. `COMMITTING`, `COMMITTED`, `FAILED`, `CANCELLED`에서는 409 `ILLEGAL_GENERATION_STATE`를 반환한다.
- worker는 `PENDING -> RUNNING` 전이에 성공한 경우에만 provider를 호출한다.
- worker가 provider 결과를 저장하기 전에도 job이 여전히 `RUNNING`인지 확인한다. cancel이 먼저 이긴 경우 result를 저장하지 않는다.
- commit 성공 후 transcript/result key는 삭제한다. hash에는 status, identity, model, token/cost aggregate, safe terminal metadata만 TTL 동안 남긴다.

## 서버 설계

### 상태 전이 모델

`aigen.application`에 상태 전이 규칙을 모으는 pure policy를 둔다.

```text
AiGenerationJobTransitionPolicy
  canStartWorker(status)
  canCompleteWorker(status)
  canRegenerate(status)
  canBeginCommit(status)
  canCancel(status)
```

정책 위반은 기존 `AiGenerationException.IllegalGenerationState`로 표현한다. HTTP mapping은 현재 `AiGenerationErrorHandler`의 409 `ILLEGAL_GENERATION_STATE` 계약을 유지한다.

이 policy는 application service에서 상태별 분기 중복을 줄이고, 단위 테스트에서 상태 표를 직접 핀한다.

### JobStore port

`AiGenerationJobStore`에 atomic transition API를 추가한다.

```kotlin
fun transitionStatus(
    jobId: UUID,
    expected: Set<JobStatus>,
    next: JobStatus,
    stage: JobStage?,
    progressPct: Int,
    error: GenerationError?,
): Boolean

fun saveResultIfStatus(
    jobId: UUID,
    expected: JobStatus,
    result: SessionImportV1Snapshot,
    usage: TokenUsage,
    cost: BigDecimal,
): Boolean

fun deleteTransientPayload(jobId: UUID): Unit
```

`saveResult`와 `patchItem`의 기존 contract는 유지하되, worker/regenerate/commit 경합이 걸리는 경로는 `saveResultIfStatus` 또는 같은 compare-and-set wrapper를 사용한다.

### Redis adapter

`RedisAiGenerationJobStore`는 Lua script로 status 비교와 갱신을 한 번에 수행한다.

- `transitionStatus`: hash가 존재하고 현재 status가 expected set에 포함될 때만 `status`, `stage`, `progressPct`, `errorCode`, `errorMessage`를 갱신한다.
- `saveResultIfStatus`: 현재 status가 expected일 때만 result key를 갱신하고 token/cost를 누적한다.
- `deleteTransientPayload`: transcript/result key만 삭제한다. hash key는 남긴다.
- terminal hash TTL은 기존 job TTL 정책을 유지한다.

`load` 동작은 terminal 상태와 commit 진행 중 상태를 구분해야 한다.

- 활성 상태(`PENDING`, `RUNNING`, `SUCCEEDED`)인데 transcript key가 없으면 stale job으로 보고 전체 삭제 후 null을 반환한다.
- payload-optional 상태(`COMMITTING`, `COMMITTED`, `CANCELLED`, `FAILED`)는 transcript/result key가 없어도 hash만으로 `JobRecord` 또는 safe terminal view를 복원한다.
  - `COMMITTING`을 payload-optional에 포함시키는 이유: commit 성공 경로에서 `transition → deleteTransientPayload` 순서를 강제하더라도 `transcript`/`result` TTL은 hash와 별도로 만료될 수 있다. 또한 commit terminal 전이 직전에 `load()`로 poll이 들어오면 `result` key가 이미 삭제된 직후일 수 있다. `COMMITTING`을 활성 set에 두면 짧은 윈도우 동안 `JOB_EXPIRED` 410이 반환된다.
- `COMMITTED`는 result를 null로 반환한다. 클라이언트는 이미 commit 결과를 받았고, transcript/result를 다시 받을 필요가 없다.

현재 `load()`가 `expiresAt = now + redisTtl`로 재계산하는 동작은 혼동을 만든다. 이번 작업에서는 `expiresAt` hash field를 `save()` 시점에 hash에 함께 기록하고, `fromHash`에서는 이 값을 우선 읽는다. 기존 job hash에 값이 없으면 backward-compatible fallback으로 `now + redisTtl`을 사용할 수 있다.

## Service 흐름

### Worker

```text
load job
transition PENDING -> RUNNING
  false: return without provider call            # idempotent — Kafka 재배달 대응
provider generate + validation
cost = CostCalculator.estimate(...)
costGuard.recordUsage(cost)                       # CAS 이전에 비용 회계
saveResultIfStatus(RUNNING, snapshot)
  false: return without audit SUCCESS             # cancel 승 → result는 안 남김
transition RUNNING -> SUCCEEDED
  false: return without audit SUCCESS
audit SUCCESS
```

실패 경로도 `transitionStatus(expected = RUNNING or PENDING, next = FAILED, error = ...)`를 사용한다. cancel이 먼저 이긴 경우 worker는 terminal state를 덮지 않는다.

**비용 회계 정책**: provider 호출이 끝났다면 LLM 비용은 이미 발생했다. `saveResultIfStatus`가 cancel race로 false가 되더라도 `costGuard.recordUsage`는 그 전에 호출되어 club/host 누적 비용은 보존된다. 이 호출은 `RuntimeException`을 swallow하므로 카운터 outage가 status flip을 막지 않는다 (기존 invariant 유지).

**Audit/metric 정책**: cancel race로 `saveResultIfStatus` 또는 succeed transition이 실패하면 SUCCESS audit과 SUCCEEDED metric을 남기지 않는다. cancel/commit transition이 자체 audit을 남기므로 중복 audit을 피하기 위해서다. `failJob`의 transition이 race로 실패할 때도 동일하게 audit/metric을 생략한다. 이 정책은 spec 본문에 명시되어야 plan에서 일관되게 구현된다.

### Regenerate

```text
load job
require status == SUCCEEDED
provider regenerate
patch full snapshot
validate patched snapshot against original SessionMeta
saveResultIfStatus(SUCCEEDED)
  false: throw 409 ILLEGAL_GENERATION_STATE
audit SUCCESS
```

Provider 호출 뒤 commit/cancel이 먼저 완료되면 result patch는 실패하고 409로 끝난다. 이 경우 audit은 failed regenerate로 남기되, provider raw message나 transcript snippet은 기록하지 않는다.

### Commit

```text
load job
require status == SUCCEEDED                              # policy precheck
resolve snapshot from override or stored result
validate snapshot against original SessionMeta           # gate before transition
transition SUCCEEDED -> COMMITTING
  false: throw 409 ILLEGAL_GENERATION_STATE
if override != null:
  saveResultIfStatus(COMMITTING, override)               # override는 transition 뒤에만 기록
    false: transition COMMITTING -> SUCCEEDED            # cancel이 사이에 끼어든 경우
           throw 409 ILLEGAL_GENERATION_STATE
try commitDelegate.commitValidated(...)
  success:
    transition COMMITTING -> COMMITTED                   # 1) 먼저 terminal로 옮기고
    deleteTransientPayload(jobId)                        # 2) transient 삭제 (순서 중요)
    audit COMMIT SUCCESS
  InvalidSessionImportException:
    transition COMMITTING -> SUCCEEDED
    audit COMMIT FAILED with SCHEMA_INVALID
    throw masked SCHEMA_INVALID
  other Throwable:
    transition COMMITTING -> SUCCEEDED                   # 모든 실패에서 상태 복구 보장
    audit COMMIT FAILED with safe code (SCHEMA_INVALID 또는 UNKNOWN)
    rethrow original (server 5xx mapping은 기존 error handler에 위임)
```

검증 실패는 `COMMITTING` 전이에 들어가기 전에 처리한다. 따라서 호스트는 preview를 수정하고 다시 commit할 수 있다.

Override 저장은 반드시 `COMMITTING`으로 전이한 뒤에 `saveResultIfStatus(expected=COMMITTING)`로 기록한다. 검증과 transition 사이에 `cancel`이 끼어들면 override가 `CANCELLED` hash에 남아 PII 누설이 될 수 있기 때문이다.

Commit terminal 전이 순서는 `transition → deleteTransientPayload`이다. 반대 순서로 하면 `transcript`/`result` 키가 사라진 뒤 `transition`이 적용되기 전 짧은 윈도우 동안 `load()`가 "non-terminal + payload missing"으로 보고 stale 삭제할 수 있다. terminal로 전이한 뒤 삭제하면 `load()`는 `COMMITTED` hash만으로 안전하게 복원한다.

`commitDelegate.commitValidated(...)`가 `InvalidSessionImportException`을 던지면 현재처럼 `SCHEMA_INVALID`로 마스킹한다. 그 외 `RuntimeException`(예: DB transient error)이 던져져도 상태는 반드시 `SUCCEEDED`로 복구한 뒤 원본 예외를 다시 던진다. `try/catch (Throwable)` finally-style 보상 없이 `InvalidSessionImportException`만 잡으면 `COMMITTING`이 TTL이 끝날 때까지 영구 stuck 상태가 된다.

### Cancel

```text
load job
transition PENDING/RUNNING/SUCCEEDED -> CANCELLED
  false: throw 409 ILLEGAL_GENERATION_STATE
deleteTransientPayload(jobId)
audit CANCELLED
```

Cancel은 terminal hash를 남긴다. 따라서 프론트가 cancel 직후 polling 응답을 받아도 `CANCELLED`를 안정적으로 볼 수 있다.

## HTTP와 프론트엔드 계약

### Server DTO

`JobStatus`에 `COMMITTING`, `COMMITTED`를 추가한다. `JobStatusResponse.status`는 기존처럼 `Enum.name` string으로 내려간다.

`COMMITTED` job의 응답:

```json
{
  "status": "COMMITTED",
  "stage": null,
  "progressPct": 100,
  "result": null,
  "error": null
}
```

`COMMITTING` job의 응답:

```json
{
  "status": "COMMITTING",
  "stage": "READY",
  "progressPct": 100,
  "result": null,
  "error": null
}
```

`COMMITTING` 중 result를 계속 반환할지는 선택할 수 있지만, 권장안은 null이다. commit 중에는 편집 UI를 닫고 저장 중 상태를 보여주는 것이 더 명확하다.

### Error contract

- 이미 terminal인 job에 부적절한 action: 409 `ILLEGAL_GENERATION_STATE`
- missing/expired job: 410 `JOB_EXPIRED`
- session mismatch: 현재처럼 404 `JOB_NOT_FOUND`
- commit downstream validation failure: 422 `SCHEMA_INVALID`, public-safe detail

### Frontend

`front/features/host/aigen/api/aigen-contracts.ts`의 `AiGenerationStatus`에 `COMMITTING`, `COMMITTED`를 추가한다.

`useAiGenerationJob` terminal set은 다음을 포함한다.

```text
FAILED, CANCELLED, COMMITTED
```

`COMMITTING`은 terminal이 아니다. 단, commit endpoint가 성공 응답을 반환하면 `AiGenerateTab`은 기존처럼 local committed stage로 들어갈 수 있다. Polling으로 `COMMITTED`를 받은 경우에도 draft를 삭제하고 완료 상태를 보여준다.

UI 규칙:

- `SUCCEEDED`: preview, regenerate, commit 가능
- `COMMITTING`: 저장 중 상태, controls disabled
- `COMMITTED`: 완료 상태, draft 삭제, polling stop
- `FAILED`: 오류와 새 시도 안내
- `CANCELLED`: idle 또는 취소 완료 상태

## 데이터 안전

- Transcript body는 계속 Redis transcript key에만 있다.
- Kafka payload에는 transcript를 넣지 않는다.
- `COMMITTED`와 `CANCELLED` 전이 시 transcript/result key를 삭제한다.
- Audit log에는 transcript hash 또는 safe metadata만 허용한다. 이번 설계는 새 durable transcript field를 추가하지 않는다.
- Error detail은 기존 AI error handler 정책을 따른다. Provider raw message, transcript snippet, private member data, secret, deployment state는 응답과 로그에 넣지 않는다.

## 테스트 계획

### Server unit tests

- `AiGenerationJobTransitionPolicyTest`
  - 상태 표의 허용/거부 액션을 모두 핀한다.
- `AiGenerationWorkerTest`
  - `PENDING -> RUNNING` transition 실패 시 provider를 호출하지 않는다.
  - provider 성공 후 `saveResultIfStatus(RUNNING)` 실패 시 result를 저장하지 않는다.
  - cancel이 먼저 이긴 job을 worker가 `SUCCEEDED`로 덮지 않는다.
- `AiGenerationRegenerationServiceTest`
  - `SUCCEEDED` 외 상태에서 regenerate는 409.
  - provider 호출 뒤 commit/cancel이 먼저 이긴 경우 patch 실패와 failed audit.
- `AiGenerationCommitServiceTest`
  - `SUCCEEDED -> COMMITTING -> COMMITTED` happy path.
  - validator failure는 상태를 `SUCCEEDED`로 유지한다.
  - delegate failure는 `COMMITTING -> SUCCEEDED`로 복구하고 safe audit을 남긴다.
  - duplicate commit은 한 요청만 transition에 성공한다.
- `AiGenerationOrchestratorTest`
  - cancel은 allowed status에서만 성공하고 transient payload 삭제를 호출한다.

### Redis integration tests

- compare-and-set transition Lua script가 expected status에서만 성공한다.
- `saveResultIfStatus`는 status mismatch에서 result/tokens/cost를 갱신하지 않는다.
- `deleteTransientPayload`는 transcript/result만 삭제하고 hash TTL은 유지한다.
- `COMMITTED` hash는 transcript/result 없이 load 가능하다.
- non-terminal hash는 transcript가 없으면 stale로 삭제된다.
- stored `expiresAt`이 load 응답에서 보존된다.

### Frontend tests

- `AiGenerationStatus` contract에 `COMMITTING`, `COMMITTED`가 포함된다.
- `useAiGenerationJob`은 `COMMITTED`에서 polling을 멈춘다.
- `AiGenerateTab`은 `COMMITTING`에서 저장 중 UI를 보여주고 controls를 숨긴다.
- `COMMITTED` 응답을 받으면 draft를 삭제하고 완료 상태를 보여준다.
- terminal 상태에서는 regenerate/commit controls가 렌더링되지 않는다.

### Verification commands

구현 시 최소 검증:

```bash
./server/gradlew -p server unitTest --tests '*AiGeneration*'
./server/gradlew -p server integrationTest --tests '*RedisAiGenerationJobStoreTest'
pnpm --dir front test -- aigen
pnpm --dir front lint
pnpm --dir front build
```

release 후보에서는 전체 표면을 확인한다.

```bash
./server/gradlew -p server check
./server/gradlew -p server architectureTest
pnpm --dir front test
pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## 리스크와 완화

| 리스크 | 완화 |
| --- | --- |
| `COMMITTING`에서 delegate 실패 후 상태 복구가 누락될 수 있다. | commit service 단위 테스트로 `COMMITTING -> SUCCEEDED` 복구를 핀한다. |
| terminal hash를 남기면서 PII가 남을 수 있다. | `deleteTransientPayload`는 transcript/result를 삭제하고, hash에는 transcript/result JSON을 저장하지 않는 기존 invariant를 유지한다. |
| `load()`가 terminal/non-terminal을 다르게 처리하면서 backward compatibility가 깨질 수 있다. | status별 load 테스트와 fallback `expiresAt` 처리를 둔다. |
| 프론트 local `committed` stage와 server `COMMITTED`가 중복 의미를 가질 수 있다. | commit endpoint 성공과 polling `COMMITTED`를 둘 다 같은 완료 UI로 수렴시킨다. |
| 상태 전이 API가 기존 `saveResult`/`patchItem`과 중복될 수 있다. | 경합이 있는 경로부터 새 API를 사용하고, 기존 API는 테스트 fixture와 비경합 경로를 위해 남긴다. |

## 구현 순서 제안

1. `JobStatus`에 `COMMITTING`, `COMMITTED` 추가와 frontend contract update.
2. `AiGenerationJobTransitionPolicy`와 단위 테스트 추가.
3. `AiGenerationJobStore` transition/save-if-status/delete-transient port 추가.
4. Redis Lua scripts와 integration tests 추가.
5. worker/cancel/regenerate/commit service를 상태 전이 API로 전환.
6. frontend polling/preview/commit UI 상태 반영.
7. targeted server/frontend 검증 후 release-safety 스캔은 ship 단계에서 실행.

## 코드 검토 결과 발견된 추가 결함과 결정

소스 코드(`server/src/main/kotlin/com/readmates/aigen/**`, `front/features/host/aigen/**`)와 대조한 결과 위 본문에 반영된 추가 결정은 다음과 같다. 모두 plan에 대응 단계가 들어가야 한다.

| 발견 | 영향 | 결정 |
| --- | --- | --- |
| `AiGenerationCommitService`가 `InvalidSessionImportException`만 catch함. 다른 `RuntimeException`(DB transient, RemoteAccess 등) 발생 시 `COMMITTING`이 TTL까지 stuck. | 호스트가 commit을 다시 시도할 수 없고 cancel도 403/409. | delegate 호출은 `try/finally`-style로 감싸 모든 throw 경로에서 `COMMITTING -> SUCCEEDED` 복구를 보장한다. `InvalidSessionImportException`은 기존대로 `SCHEMA_INVALID`로 마스킹, 기타는 원본을 다시 던져 기존 error handler가 처리한다. |
| Commit override를 `transition SUCCEEDED -> COMMITTING` 전에 `saveResult`로 기록함. cancel race 시 host override가 `CANCELLED` hash에 누설. | PII가 cancel terminal hash에 남는다. | override 저장은 transition 뒤에 `saveResultIfStatus(expected = COMMITTING)`로만 한다. 실패 시 `COMMITTING -> SUCCEEDED` 복구 후 409. |
| `transition COMMITTING -> COMMITTED` 직전에 `deleteTransientPayload`를 호출하면 짧은 윈도우에서 `COMMITTING + transcript missing`이 발생해 `load()`가 stale로 판단. | poll이 일시적으로 410 `JOB_EXPIRED`를 보고 클라이언트가 비정상 상태로 떨어진다. | 두 가지 invariant를 모두 적용한다. (1) commit success 경로는 `transition → deleteTransientPayload` 순서. (2) `load()`의 payload-optional set에 `COMMITTING`을 포함시킨다. 어느 한쪽이 무너져도 다른 쪽이 윈도우를 닫는다. |
| `succeed()`에서 `saveResultIfStatus`가 race로 false면 `costGuard.recordUsage`도 건너뛰는 흐름이 자연스럽다. 그러나 provider 비용은 이미 발생. | club monthly cost 누락. | `costGuard.recordUsage`는 `saveResultIfStatus`보다 **먼저** 호출한다. 기존 invariant("cost-guard 카운터 outage는 status flip을 막지 않는다")를 유지한다. |
| spec은 `expiresAt`/`createdAt`을 hash field로 저장해 `load()` 응답이 안정적이 되도록 요구하지만, plan에는 hash write 단계가 없고 통합 테스트만 기대값을 검사. | 테스트가 실패하거나, 테스트가 통과하더라도 실제 `expiresAt`은 매 호출 재계산된다. | Plan Task 3에 `save()` 단계에서 `expiresAt`을 hash field로 쓰고 `fromHash`에서 우선 읽도록 하는 단계를 추가한다. 누락된 hash에는 `now + redisTtl` fallback을 둔다. |
| `requireWorkerStart` 정책 체크는 `transitionStatus(PENDING -> RUNNING)` 성공 직후 호출되면 항상 통과한다(`record.status`는 stale local copy로 여전히 PENDING). | 정책이 dead code처럼 보이고 테스트만 의미를 가진다. | 워커는 CAS만 사용한다. `requireWorkerStart`/`requireWorkerCompletion` 정책은 단위 테스트로 상태 표를 핀하기 위한 **순수 정책**으로만 둔다 (서비스 코드에서는 호출하지 않음). Plan Task 4의 redundant policy call은 제거한다. |
| Plan은 `delete(jobId)` 메서드를 그대로 둔다. 새 lifecycle에서는 cancel/commit이 더 이상 `delete()`를 호출하지 않으므로 외부 호출자는 `deleteStaleJob`(내부)뿐. | API surface 혼동. | `delete()`는 `internal`-tagged stale cleanup 전용으로 유지하고, 도큐멘트에 명시한다. 외부에서 호출하지 않도록 KDoc에 경고를 추가한다. |
| Plan Task 6 Step 6의 regenerate race-loss audit이 `ErrorCode.UNKNOWN`을 쓴다. | error code semantics 손상. UNKNOWN은 500 매핑이라 audit grep도 의미를 잃는다. | regenerate race-loss는 `JOB_EXPIRED`(state changed = job lifecycle 종료에 준함) 또는 새 `STATE_CHANGED` 코드를 사용한다. 추가 enum 도입을 피하기 위해 1차안은 `JOB_EXPIRED` audit + 409 throw로 통일한다. |
| Worker `failJob` transition이 cancel race로 false가 되면 plan은 audit/metric을 skip한다. | "fail이 묻혔다"가 docs로 설명되지 않으면 운영 단계에서 혼동. | "비용 회계 정책"과 같은 문단에서 명시한다(본문 Worker 흐름 참고). |
| 프론트 `AiGenerateTab`의 local `committed` stage와 server `COMMITTED`가 둘 다 같은 완료 UI로 수렴해야 함. 현재 `handleCommit`은 commit POST 성공 직후 `setStage({tag:"committed"})`로 polling을 끊는다(`useAiGenerationJob` enabled=false). 그 뒤 polling으로 `COMMITTED`를 보는 경로는 commit POST가 네트워크 오류였을 때만이다. | 두 경로의 일관성 검사가 누락되면 commit POST 실패 + 서버 COMMITTED 완료의 미세 시나리오에서 사용자가 stuck. | `useEffect`가 `stage.tag === "active" && jobStatus === "COMMITTED"`에서 동일하게 `setStage({tag:"committed"})`로 전환하고 `onCommitted()`을 한 번만 호출하도록 강제한다. plan에 test case가 이미 있으므로 본문 §"Frontend"의 UI 규칙을 변경 없이 유지한다. |

## 승인된 결정

- AI 품질 평가가 아니라 job/commit lifecycle 신뢰성을 개선한다.
- `COMMITTING`과 `COMMITTED`를 추가한다.
- `EXPIRED` status는 추가하지 않고 missing job을 410 `JOB_EXPIRED`로 유지한다.
- commit 성공 후 transcript/result는 삭제하되 terminal hash는 TTL 동안 유지한다.
- Redis 상태 전이는 compare-and-set 방식으로 구현한다.
- regenerate와 commit은 `SUCCEEDED` 상태에서만 허용한다.
- `COMMITTING` 이후 cancel은 허용하지 않는다.
