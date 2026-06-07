# AI 생성 — Multi-LLM Provider 가용성 Failover 설계

- 날짜: 2026-06-07
- 표면: server (`server/src/main/kotlin/com/readmates/aigen`)
- 상태: 설계 승인됨, 구현 계획 대기

## 1. 배경 & 목표

`aigen` 모듈은 이미 Claude/OpenAI/Gemini 멀티 LLM 어댑터와 비동기 워커 파이프라인을
갖춘 프로덕션급 구조다. 워커는 `Map<Provider, SessionContentGenerator>`로 provider를
라우팅하고, 가용성 실패에 대해 **같은 provider 1회 재시도**, 콘텐츠 검증 실패에 대해
**instruction 강화 1회 재시도**를 수행하며, job당 LLM 호출 `≤ 3회`(스펙 §9.2) 하드캡을
강제한다.

현재의 약점: provider 가용성 실패 시 **다른 provider로의 failover가 없다**. 1차 provider가
`PROVIDER_UNAVAILABLE`이면 같은 provider를 1초/5초 뒤 다시 부르고, 그것도 실패하면 job이
그냥 실패한다.

**목표**: 호출 예산(`≤ 3회`)을 늘리지 않으면서, 가용성 실패 시 기존 단일 재시도를
**체인상 다음 provider로 전환**해 회복력을 높인다. 비용/audit/metrics는 실제로 결과를 만든
모델 기준으로 정확히 기록한다.

**비목표 (YAGNI)**:
- Spring AI 프레임워크로의 마이그레이션 (현행 헥사고날 포트-어댑터 유지).
- Chaining / Parallelization / Multi-Agent / DAG / Tool 패턴 (호출·비용 배수 증가, 캡과 충돌).
- 콘텐츠 검증 실패에 대한 failover (모델을 바꿔도 같은 스키마 위반이 반복될 수 있음).
- 클럽별 failover 체인 설정 (현행 클럽 기본값도 단일 모델 수준 — 과임).
- `actualModel`의 API/프런트 노출 (후속 PR로 분리; 본 스펙은 server 단일 표면).

## 2. 설계 결정 (확정)

| 항목 | 결정 |
|---|---|
| Failover 트리거 | **가용성 실패만**: `PROVIDER_UNAVAILABLE`, `PROVIDER_RATE_LIMITED` |
| 대상 선택 | **전역 고정 체인** (`properties.fallbackChain`, 모델 alias 순서) |
| 호출 예산 결합 | **기존 단일 재시도를 다음 provider로 전환** (총 호출 수 불변, failover 깊이 = 1) |
| 모델 표현 | **requested vs actual 분리**: `actualModel`을 JobRecord + audit + cost + metrics에 반영 |
| 노출 범위 | **server 내부만** (회계 정확성). API/프런트 노출은 후속 PR |

## 3. 컴포넌트 & 설정

### 3.1 `ProviderFallbackChain` (신규)

포트가 아니라 `ModelCatalog` + `AiGenerationProperties`를 받는 순수 로직 클래스(주입형 빈).
단일 책임:

```kotlin
fun nextAfter(failed: ModelId): ModelId?
```

`properties.fallbackChain`(모델 alias 순서 리스트)을 순회하며 첫 번째로 아래를 모두 만족하는
`ModelId`를 반환한다. 없으면 `null`.

1. `failed`와 **다른 provider**.
2. `ModelCatalog.isEnabled(candidate)` == true.
3. 해당 provider의 generator가 존재(`generators[candidate.provider] != null`).

generator 가용성 판정을 위해 기존 `Map<Provider, SessionContentGenerator>` 빈을 주입받는다.
순수 함수이므로 체인 우선순위 규칙을 단위 테스트로 격리 검증한다.

### 3.2 설정 (`AiGenerationProperties`)

```kotlin
val fallbackChain: List<String> = emptyList()   // 모델 alias 순서
```

- **빈 리스트 = 기능 off** → 기존 동작(같은 provider 재시도) 그대로. 하위호환·점진 롤아웃.
- 기존 `enabledProviders` / `ModelCatalog` allowlist와 교차: 체인에 있어도 allowlist에 없으면
  후보에서 제외.

### 3.3 빈 구성 (`AiGenerationBeansConfig`)

- 기존 `sessionContentGeneratorsByProvider` 빈을 `ProviderFallbackChain`에 재사용.

## 4. 데이터 모델 & 영속화

### 4.1 모델 계층

- `JobRecord`에 `actualModel: ModelId? = null` 추가. `null` = failover 없음(actual == requested).
  nullable 기본값이라 기존 레코드/직렬화 하위호환.
- `JobView`에 `actualModel: ModelId? = null` 추가. (응답 DTO 매핑에는 본 PR에서 미반영 →
  API 계약 불변.)

### 4.2 Redis 직렬화 (`RedisAiGenerationJobStore`)

- `toHash`: `actualModel`이 있으면 `actualModelProvider` / `actualModelName` 두 필드 기록
  (없으면 생략).
- `fromHash`: 두 필드가 모두 있을 때만 `ModelId` 복원, 없으면 `null` → 기존 6h TTL 레코드 안전.
- failover 성공 시 `actualModel`을 **결과 저장과 같은 원자적 쓰기**(`saveResultIfStatus` 경로)에
  동반 기록해 별도 키 쓰기로 인한 정합성 틈을 없앤다. 이를 위해 `saveResultIfStatus` 시그니처에
  `actualModel: ModelId?`를 추가하고 Lua 스크립트에서 두 hash 필드를 함께 set 한다
  (actual == requested면 기록 생략).

## 5. 제어 흐름 (`AiGenerationWorker`)

핵심: "실제로 결과를 만든 `(generator, ModelId)`"를 한 단위로 추적해 성공 경로까지 스레딩한다.

### 5.1 신규 홀더 (워커 내부)

```kotlin
private data class GenerationAttempt(
    val output: GenerationOutput,
    val actualModel: ModelId,                 // 결과를 만든 실제 모델
    val generator: SessionContentGenerator,   // 후속 검증 재시도가 같은 provider에 머물도록
)
```

### 5.2 `callGeneratorWithRetry` — 재시도 분기에서 실패 코드로 갈림

1. 1차 시도(call 1): `input.model = record.model`(A).
2. 성공 → `GenerationAttempt(output, A, primaryGenerator)`.
3. 실패 시 코드 분기:
   - **가용성 코드**(`PROVIDER_UNAVAILABLE` / `PROVIDER_RATE_LIMITED`):
     - `auditRetryAttempt(record, firstFailure)` — record.model(A) 기준 기록 (A가 실제 실패).
     - `sleeper.sleep(backoff)` (기존 1s / 5s 전략 유지).
     - `fallbackChain.nextAfter(record.model)` 조회.
       - 후보 B 있음 → 재시도(call 2)를 **B의 generator + `baseInput.copy(model = B)`**로,
         strengthen 없음. `actualModel = B`.
       - 후보 없음 → **오늘과 동일하게 같은 provider A 재시도**(input 불변). `actualModel = A`.
   - **콘텐츠 코드**(`SCHEMA_INVALID`, `AUTHOR_NAME_MISMATCH`, `HIGHLIGHTS_OUT_OF_RANGE`,
     `ONE_LINE_REVIEWS_DUPLICATE`, `FEEDBACK_TEMPLATE_INVALID`): 오늘과 동일 — 같은 provider A,
     instruction 강화. `actualModel = A`. **failover 안 함.**
4. **failover 깊이 = 1**. B마저 가용성 실패하면 3번째 provider로 이어가지 않는다(승인된 예산
   결정: 단일 재시도만 전환). → 호출 `≤ 3` 캡 불변.

### 5.3 검증 재시도 (`retryAfterValidationFailure`)

`attempt.generator` / `attempt.actualModel`을 받아, failover로 바뀐 B에 **머물러** strengthen
재시도를 수행한다. record.model(A)로 되돌아가지 않는다.

### 5.4 회계 정확성 (`succeed`) — actualModel 기준으로 교체

| 항목 | 기존 | 변경 |
|---|---|---|
| pricing | `pricing(record.model)` | `pricing(attempt.actualModel)` |
| audit 성공행 | `record.model.provider/name` | `actualModel.provider/name` |
| metrics | `record.model` | `actualModel` |
| 결과 영속화 | `saveResultIfStatus(...)` | 같은 원자 쓰기에 `actualModel` 동반 |

`Outcome.Success`에 `actualModel: ModelId`를 추가하고, `process`가 이를 `succeed(...)`로
넘긴다. cost guard 사전 점검(`orchestrator.start`)은 모델 무관(host/club 기준)이라 변경 없음.

### 5.5 audit 추적 정합성

1차 실패행은 A(`auditRetryAttempt`가 record.model=A 기록 — A가 실제로 실패했으니 정확),
성공행은 B. → "A 가용성 실패 → B 성공"이 호출별 행으로 그대로 남는다. 이것이 의도한 감사
추적이다.

## 6. 엣지 케이스

1. **체인 미설정**(빈 리스트) → failover 없음, 오늘 동작 그대로 (회귀 보호).
2. **후보 disabled / generator 없음** → `nextAfter`가 스킵; 전부 부적격이면 같은 provider 재시도.
3. **체인에 A 자신 포함** → 다른 provider 조건으로 스킵.
4. **B도 가용성 실패** → depth 1이라 종료, job `FAILED`(B의 코드), audit엔 A 실패 + B 실패 2행.
5. **콘텐츠 코드** → 체인이 설정돼 있어도 failover 안 함, 같은 provider strengthen.
6. **취소 레이스** → `saveResultIfStatus` / `transitionStatus`의 기존 RUNNING CAS 그대로.
   actualModel은 이 원자 쓰기에만 실려 정합성 유지.
7. **캡 소진** → `callGeneratorRaw`가 호출 전 `MAX_CALLS_EXCEEDED` 단락 → failover도 캡 초과 불가.
8. **구 Redis 레코드**(actualModel 필드 없음) → `fromHash`가 null → actual==requested로 안전 해석.

## 7. 설정 검증 (`AiGenerationConfigValidator`)

기동 시 `fallbackChain` 각 alias가 catalog로 해석되는지 점검한다. 환경별 allowlist 차이를
고려해 **하드 실패 대신 경고 로그**(미해석 항목은 런타임에 `nextAfter`에서 자연히 스킵됨).
최소 범위 유지.

## 8. 테스트 전략

- `ProviderFallbackChainTest`(순수 단위): 순서, 같은-provider 스킵, disabled 스킵,
  generator-없음 스킵, 소진 시 null, 빈 체인.
- `AiGenerationWorker`(기존 fake 하네스):
  - 가용성 실패 + 체인 → B 재시도 성공 시 cost/audit/metrics/actualModel 모두 B.
  - 가용성 실패 + 체인 → B도 실패 → job FAILED, audit 2행(A 실패, B 실패).
  - 가용성 실패 + 빈 체인 → 같은 provider 재시도 (회귀: 오늘 동작).
  - 콘텐츠 실패(`SCHEMA_INVALID`) + 체인 설정 → 같은 provider strengthen, failover 안 함.
  - failover 후 검증 위반 → B에서 strengthen 재시도.
  - 캡 소진 → `MAX_CALLS_EXCEEDED`, failover 호출 안 함.
- `RedisAiGenerationJobStore`: actualModel 왕복(있음/없음), 구 레코드 → null.

## 9. 실행할 체크 (server 단일 표면)

- `./server/gradlew -p server clean test`.
- 프런트 노출을 후속 분리했으므로 front 변경 없음 → 교차 표면 아님.
- 릴리스 관점: CHANGELOG `Unreleased`에 "Multi-LLM provider 가용성 failover" 항목 추가,
  audit/비용이 actual 모델 기준임을 운영 노트로 명시.

## 10. 공개 저장소 안전

실제 회원 데이터/시크릿/사설 도메인/토큰형 예시를 도입하지 않는다. `fallbackChain` 예시는
모델 alias(예: `claude-...`, `gpt-...-mini`, `gemini-...`)만 사용한다.
