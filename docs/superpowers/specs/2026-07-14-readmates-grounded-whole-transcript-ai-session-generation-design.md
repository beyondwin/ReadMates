# ReadMates 근거 기반 전체 대본 AI 세션 기록 생성 설계

- 날짜: 2026-07-14
- 표면: host frontend, BFF contract regression, server `aigen`, session import, session participant persistence, operations
- 상태: 설계 승인됨, 구현 계획 대기

## 1. 배경

ReadMates에는 호스트가 TXT 대본을 업로드해 세션 요약, 하이라이트, 회원별 한줄평,
피드백 문서를 생성하고 검토한 뒤 기존 session-import 경로로 저장하는 AI workflow가 이미
있다. 현재 구현은 다음 기반을 제공한다.

- Claude/OpenAI/Gemini provider adapter와 server-side structured output.
- Redis job state와 transient transcript/result payload.
- Kafka metadata-only worker handoff.
- 비동기 progress, cancel, recent-job recovery, per-section regeneration.
- schema, 회원 작성자, 한줄평 중복, 피드백 문서 형식 검증.
- provider availability failover, 호출/비용 cap, audit, metrics, admin AI Ops.
- 호스트 수동 편집과 `SessionImportService.commitValidated`를 통한 최종 저장.

그러나 현재 업로드는 provider 호출 전에 TXT 화자명을 클럽 회원과 대조하지 않는다. 프롬프트는
대본에 없는 내용을 만들지 말라고 지시하지만 결과가 어느 발언에 근거했는지 API와 UI에서 확인할
수 없고, 형식 검증만으로 의미적 정확성을 보장할 수 없다. 현재 provider client의 출력 token
한도도 코드에 고정되어 있어 긴 대본에서 네 가지 결과와 근거를 함께 반환하는 계약으로 확장하기
어렵다.

실제 운영 형식의 private TXT 7개를 원문을 노출하거나 저장소에 복사하지 않고 구조만 집계했다.

- UTF-8 BOM이 있는 일관된 `화자명 + MM:SS` turn 형식.
- 약 85~123KB, 3.7만~5.3만 문자.
- 약 104~157분, 191~487개 발언, 2~8개 화자.
- 7개 중 4개가 2시간을 넘고, 일부 파일에 `참석자 N` 형태의 일반 라벨이 존재.
- 타임스탬프는 단조 증가하며 발언 단위 분리가 가능.

이 evidence는 원문 전체가 현재 대상 모델의 입력 예산 안에 충분히 들어갈 수 있고, 토론의 동의,
반론, 재언급 관계를 보존하려면 구간별 요약보다 전체 대본을 한 번에 처리하는 편이 적합하다는
결정을 뒷받침한다. 정확한 provider model ID, 입력 한도, 가격은 구현 시점에 공식 provider
문서와 실제 Models API로 다시 검증한다.

## 2. 목표

이 설계의 목표는 TXT 업로드 데모가 아니라 호스트가 실제 세션 기록 운영에 사용할 수 있는
fail-closed workflow다.

1. provider 호출 전에 모든 대본 화자가 해당 클럽의 활성 회원인지 정확히 검증한다.
2. 비회원, 일반 라벨, 중복 회원 이름, 잘못된 대본은 job, Redis, Kafka, 비용 side effect 없이
   거절한다.
3. 최대 3시간의 토론 대본을 분할 요약하지 않고 전체 맥락으로 한 번 생성한다.
4. 네 가지 최종 결과와 각 결과의 근거 `turnId`를 같은 structured output으로 받는다.
5. 서버는 근거 ID, 회원, schema, PII invariant를 결정적으로 검증한다.
6. 호스트는 검토 장부에서 결과와 근거 발언을 확인하고 수정한 뒤에만 저장한다.
7. 클럽 회원이 대본 화자이지만 회차 참여자로 등록되지 않았다면 최종 저장 트랜잭션에서 자동
   등록한다.
8. transcript와 evidence excerpt는 transient하게만 보관하고 commit/cancel 후 삭제한다.
9. public repository와 CI에는 실제 대본, 회원 이름, private 경로, provider credential을 넣지
   않는다.

## 3. 성공 기준

- 업로드된 모든 화자명이 클럽의 `ACTIVE` membership 하나에 정확히 대응한다.
- 회원 불일치 업로드에서는 provider adapter, Redis job create, Kafka publish, cost counter가 모두
  호출되지 않는다.
- 지원 범위의 전체 대본이 한 provider request에 그대로 전달되고, 임의 분할이나 중간 요약이
  없다.
- 네 가지 결과가 모두 생성되며 AI가 생성한 각 결과 block은 하나 이상의 유효한 evidence turn을
  가진다.
- LLM이 반환한 evidence excerpt를 신뢰하지 않고 서버가 검증된 `turnId`에서 excerpt를 구성한다.
- 네 섹션을 모두 확인하기 전에는 commit할 수 없다.
- commit은 필요한 session participant 등록과 네 가지 기록 교체를 한 트랜잭션으로 수행한다.
- private local quality eval에서 회원 작성자 오인 0건, 유효하지 않은 evidence reference 0건,
  호스트가 확인한 unsupported factual claim 0건을 충족한다.
- 실제 운영 사용성 목표는 3시간 이내 대본의 검토, 필요한 수정, 저장을 10분 안에 완료하는 것이다.
  이 시간은 자동 PR gate가 아니라 로컬 운영 평가 지표다.

## 4. 비목표

- 음성 파일 업로드, STT, diarization.
- 게스트 또는 비회원 화자 지원.
- AI가 비슷한 이름을 추측하거나 화자 identity를 자동 보정하는 기능.
- 전체 대본 chunking, map-reduce 요약, multi-agent, 복수 모델 consensus/judge.
- 자동 저장 또는 자동 공개.
- 회원 추천, 독서 챗봇, semantic search 등 별도 member-facing AI 제품.
- transcript 또는 evidence excerpt의 MySQL 영구 보관.
- 과거 세션 기록의 자동 일괄 재생성.
- provider key provisioning, production deploy, feature enable 자체.
- fine-tuning 또는 사용자별 장기 memory.

## 5. 확정된 제품 결정

| 항목 | 결정 |
|---|---|
| 주 사용자 | 클럽 호스트가 업로드, 검토, 저장. 플랫폼 관리자는 metadata-only 장애 지원 |
| 입력 | UTF-8/UTF-8 BOM `.txt`, `화자명 + MM:SS`, 최대 1MB와 최대 3시간을 모두 적용 |
| 회원 기준 | 대본의 모든 고유 화자명이 해당 클럽의 `memberships.status = ACTIVE` 회원이어야 함 |
| 집합 관계 | 대본 화자 집합은 활성 회원 집합의 부분집합. 말하지 않은 회원은 대본에 없어도 됨 |
| 이름 비교 | Unicode NFC 정규화와 앞뒤 공백 제거 후 case-sensitive exact match |
| 일반 라벨 | `참석자 N`, `화자 N`, `Speaker N` 등은 비회원과 동일하게 업로드 거절 |
| 중복 이름 | 활성 회원 두 명 이상이 같은 정규화 이름이면 업로드 거절. 자동 선택 금지 |
| alias | 새 UI에서 제거. server는 real-name pipeline만 허용 |
| 생성 방식 | 전체 대본 단일 primary LLM call. 자동 분할 없음 |
| 결과 | 요약, 하이라이트, 회원별 한줄평, 피드백 문서 전체 |
| 근거 | 결과 block마다 하나 이상의 `turnId`; server가 timestamp/speaker/excerpt를 resolve |
| 저장 정책 | 항상 검토용 초안. 네 섹션을 호스트가 확인한 뒤에만 저장 |
| 참여자 등록 | 유효한 클럽 회원 화자가 세션 참여자가 아니면 commit transaction에서 자동 등록 |
| retry | availability failover 또는 validation repair를 기존 job 호출 cap 안에서 최대 1회 |
| privacy | transcript, parsed turns, evidence excerpt, draft result는 Redis TTL payload만 허용 |

## 6. 아키텍처

`aigen`은 기존 workflow-side hexagonal boundary를 유지한다.

```text
Browser host editor
  |
  | multipart TXT + model + optional instructions
  v
Cloudflare Pages BFF
  |
  | multipart boundary preserved
  v
AiGenerationController
  |
  v
TranscriptPreflightService
  |-- host/session authorization
  |-- TranscriptParser -> TranscriptTurn[]
  |-- ActiveClubMemberDirectoryPort -> exact speaker membership validation
  |-- canonical request render + ModelCapabilityCatalog -> local input/output budget validation
  |-- failure: typed 422/503, no job/Redis/Kafka/provider/cost side effect
  |
  v
AiGenerationOrchestrator -> Redis job/transcript/turns -> Kafka metadata
  |
  v
AiGenerationWorker
  |
  v
WholeTranscriptGroundedGenerator
  |-- full TranscriptTurn[] once
  |-- four final sections + evidence turn IDs
  v
GroundingValidator
  |-- invalid: one section-scoped repair with full transcript context
  |-- valid: result + resolved evidence stored in Redis
  v
Host review ledger
  |-- inspect evidence, edit, regenerate, acknowledge four sections
  v
AiGenerationCommitService
  |-- revision CAS + active membership revalidation
  |-- idempotent session participant registration
  |-- SessionImportService.commitValidated
  v
MySQL final records + commit receipt
  |
  v
post-commit cache invalidation + transient payload deletion
```

`front/functions`의 catch-all BFF route는 이미 multipart를 보존한다. production BFF 코드는 변경하지
않는 것을 기본으로 하되, 새 요청과 typed error가 같은-origin proxy를 통과한다는 regression test를
추가한다.

## 7. 서버 구성요소

### 7.1 `TranscriptParser`

순수 parser다. provider, database, Redis, clock에 의존하지 않는다.

```kotlin
data class TranscriptTurn(
    val turnId: String,
    val speakerName: String,
    val speakerMembershipId: UUID,
    val startSeconds: Int,
    val text: String,
)
```

parser 단계에서는 membership ID가 없으므로 먼저 `ParsedTranscriptTurn`을 만들고, preflight가 exact
match를 완료한 뒤 `TranscriptTurn`으로 bind한다. `turnId`는 file 순서 기반의 stable identifier
(`t000001`, `t000002`, ...)이며 LLM이 새 ID를 만들 수 없다.

파싱 규칙:

- UTF-8 BOM, CRLF/LF, 줄 끝 공백을 정규화한다.
- speaker header의 timestamp는 누적 분을 허용한다. 예: 120분 이후 timestamp도 유효하다.
- timestamp는 단조 증가해야 한다.
- header 다음의 여러 non-empty line은 다음 header 전까지 같은 turn text로 합친다.
- 첫 speaker header 이전의 텍스트는 명시적으로 인식한 export metadata만 무시한다. 알 수 없는
  preamble은 `TRANSCRIPT_FORMAT_INVALID`다.
- speaker header가 없거나 turn text가 모두 비어 있으면 거절한다.
- 파일 크기와 최대 timestamp를 검사한다. 선택 모델 입력 예산 검사는 membership bind가 끝난 뒤
  preflight service에서 수행한다.

### 7.2 `TranscriptPreflightService`

application service로 다음 순서를 소유한다.

1. 현재 사용자가 해당 session의 host인지 확인한다.
2. parser로 turn과 고유 speaker set을 만든다.
3. `ActiveClubMemberDirectoryPort`로 현재 클럽의 활성 membership 이름을 읽는다.
4. 이름을 NFC + trim으로 정규화하고 exact map을 만든다.
5. generic label, unmatched name, ambiguous duplicate를 수집한다.
6. speaker validation이 성공하면 실제 system prompt, output schema, session metadata, ordered turns, host
   instructions를 포함한 canonical provider request를 render한다.
7. render한 request를 선택 모델의 local input budget guard로 검사한다.
8. budget이 맞을 때만 cap, idempotency, job create로 진행한다.

화자 오류 응답은 호스트가 제출한 unmatched label만 포함한다. 전체 회원 명단, 이메일,
membership ID, transcript excerpt는 반환하거나 로그에 기록하지 않는다.

### 7.3 `ActiveClubMemberDirectoryPort`

`aigen.application.port.out`에 두고 JDBC는 outbound persistence adapter가 소유한다.

- `memberships.club_id = current club`.
- `memberships.status = ACTIVE`.
- membership과 user의 display name, membership ID만 application model로 반환.
- session participant 여부와 attendance status는 preflight pass 조건이 아니다.

### 7.4 `ModelCapabilityCatalog`

기존 `ModelCatalog`의 allowlist/pricing 책임을 보존하면서 model capability를 명시한다.

- input token/context budget.
- max output token capability.
- application-level reserved output budget.
- structured output 지원 여부.
- provider와 canonical model ID.

네 결과와 evidence ID를 담기 위한 application default output budget은 16,384 tokens다. provider
capability보다 클 수 없으며 환경설정으로 낮출 수 있다. 구현 시 model alias와 capability를 공식
문서와 provider Models API로 재검증하고, 불일치하면 애플리케이션 시작 또는 generation 시작을
fail closed한다.

입력 예산 검사는 `ModelInputBudgetGuard`가 맡는다. generator adapter와 같은
`GroundedRequestRenderer`를 공유해 최종 요청 형태를 먼저 만들고, 해당 model/version에 고정된 local
tokenizer가 있으면 이를 사용한다. tokenizer가 없거나 실패하면 system/schema wrapper를 포함한 UTF-8
byte 수를 token 상한으로 사용하는 보수적 local fallback을 적용한다. 적합 조건은 다음과 같다.

```text
estimatedInputTokens + reservedOutputTokens + safetyMarginTokens <= modelContextTokens
```

capability 자체를 알 수 없으면 503 `MODEL_CAPABILITY_UNAVAILABLE`, 적합 조건을 만족하지 못하면 422
`TRANSCRIPT_TOO_LONG_FOR_MODEL`이다. 이 검사는 provider의 token-count API를 포함한 외부 network call을
하지 않으므로 실패 경로에서 generation provider 호출과 비용 side effect는 0회다.

primary model이 통과하면 configured fallback 후보도 각 provider renderer와 capability로 같은 검사를
수행해 `eligibleFallbacks`를 job metadata에 기록한다. full request와 reserved output을 수용하고 같은
structured output을 지원하는 후보만 fallback할 수 있다. primary는 통과했지만 eligible fallback이
없어도 job은 시작할 수 있으며, 이때 primary availability failure는 transcript를 자르거나 부적합
model로 보내지 않고 `PROVIDER_UNAVAILABLE`로 종료한다.

### 7.5 `WholeTranscriptGroundedGenerator`

신규 outbound port이며 Claude/OpenAI/Gemini adapter가 동일하게 구현한다.

```kotlin
interface WholeTranscriptGroundedGenerator {
    val provider: Provider
    fun generate(input: GroundedGenerationInput): GroundedGenerationOutput
}
```

입력:

- session metadata.
- 검증된 speaker name allowlist.
- 전체 ordered `TranscriptTurn` 목록.
- selected model.
- optional host instructions.

출력:

- 기존 `SessionImportV1Snapshot`과 같은 네 결과.
- 각 summary paragraph, highlight item, one-line review, feedback top-level section에 연결된 `turnId`
  목록.
- token usage.

provider structured output은 summary를 paragraph block 배열로, feedback document를 top-level section
배열로 받는다. highlights와 one-line reviews는 기존 item 배열을 사용한다. 서버는 각 revision에서
순서 기반 opaque target ID(`r<revision>:<section>:<ordinal>`)를 부여하고 검증 완료 후 기존
`SessionImportV1Snapshot` 문자열/배열 형태로 projection한다. target ID는 해당 revision 안에서만
안정적이며 section 재생성으로 server generation revision이 바뀌면 새로 발급한다. 직접 편집은
server revision을 만들지 않고 해당 target의 AI evidence 신뢰 상태와 section confirmation만 무효화한다.
LLM은 trusted target ID나 excerpt를 만들지 않고 각 output block과 source `turnId`의 관계만 반환한다.

provider adapter는 transcript를 임의로 잘라 보내지 않는다. provider timeout이나 rate-limit로
availability failover가 발생해도 fallback provider에 동일한 전체 turn 목록과 같은 schema를 전달한다.

### 7.6 prompt trust boundary

대본과 host instructions는 untrusted data다.

- system invariant가 transcript와 host instructions보다 우선한다.
- transcript를 명시적 data delimiter 안에 넣고 대본 내부의 명령문을 따르지 않도록 지시한다.
- host instructions는 문체와 길이를 조정할 수 있지만 회원 allowlist, schema, PII, evidence 요구를
  완화할 수 없다.
- 결과 작성자 이름은 allowlist 값만 허용한다.
- LLM은 excerpt text를 반환하지 않고 `turnId`만 반환한다.
- provider error message는 `LlmErrorMapper`를 통해 transcript-safe typed error로 변환한다.

### 7.7 `GroundingValidator`

결정적으로 검증할 수 있는 invariant만 소유한다.

- 모든 evidence `turnId`가 현재 transcript에 존재한다.
- highlight와 one-line review의 author가 active membership으로 bind되어 있다.
- author-specific result는 해당 author의 turn을 하나 이상 참조한다.
- summary, highlights, one-line reviews, feedback document가 기존 schema와 session metadata를 지킨다.
- duplicate one-line author, invalid feedback template, 금지된 PII pattern을 차단한다.
- evidence excerpt는 validator가 source turn에서 생성한다. 기본 excerpt는 최대 240 Unicode code
  point이며 잘림 여부를 표시하고, control character 제거와 response-safe escaping을 적용한다.

`turnId` 존재는 그 문장이 source turn에서 의미적으로 따라온다는 완전한 증명이 아니다. 이 설계는
별도 judge model을 추가하지 않으므로 semantic support는 evidence panel에서 호스트가 확인해야 한다.
이 한계를 숨기지 않고 모든 AI 결과를 draft로 유지한다.

### 7.8 `GroundedGenerationRepairService`

첫 structured output이 schema 또는 grounding invariant를 위반하면 다음 조건에서 한 번 보정한다.

- 전체 transcript와 검증된 speaker allowlist를 유지한다.
- 실패한 section과 validator issue만 수정 대상으로 전달한다.
- 정상 section을 다시 쓰지 않는다.
- 기존 per-job LLM call counter를 호출 전에 원자적으로 증가한다.
- 보정 후에도 실패하면 job을 `FAILED`로 종료하고 불완전 draft를 노출하지 않는다.

availability failover와 validation repair가 모두 필요할 때에도 기존 최대 호출 수를 초과할 수 없다.

### 7.9 `AiGenerationCommitService`

Redis job state와 MySQL은 하나의 transaction으로 묶을 수 없으므로 다음 순서의 idempotent commit
protocol을 사용한다.

1. Redis에서 job status와 expected revision을 CAS 검증하고 `COMMITTING` lease를 획득한다.
2. MySQL의 content-free commit receipt에 같은 `job_id + revision`이 있으면 DB write를 건너뛰고
   post-commit recovery로 이동한다.
3. 하나의 MySQL transaction에서 transcript speaker membership이 여전히 현재 club에서 `ACTIVE`인지
   다시 확인한다.
4. speaker membership에 session participant row가 없으면 생성하고, 기존 row가 `REMOVED`이면
   `ACTIVE`로 복구한다.
5. transcript에 실제 발언이 있으므로 `rsvp_status = GOING`, `attendance_status = ATTENDED`,
   `participation_status = ACTIVE`로 정렬한다.
6. `SessionImportService.commitValidated`로 네 결과를 저장한다.
7. 같은 MySQL transaction에서 unique `job_id + revision` commit receipt를 기록한다.

participant upsert, session-import write, receipt 중 하나라도 실패하면 MySQL transaction 전체를
rollback한다. Redis job은 safe `COMMIT_RETRY` 상태로 전환하고 기존 admin retry-commit 경로를
재사용한다.

MySQL commit이 성공한 뒤에는 job을 `COMMITTED`로 전환하고 public/notes cache invalidation과 Redis
transcript/turns/evidence/result 삭제를 post-commit cleanup으로 실행한다. 이 cleanup은 idempotent하며
재시도 가능해야 한다. cache invalidation 또는 payload 삭제가 실패해도 성공한 DB transaction을
rollback하거나 네 결과를 다시 쓰지 않는다. 대신 content-free terminal metadata에
`cleanupPending=true`를 남겨 background retry와 metadata-only admin recovery가 같은 cleanup operation만
재실행한다.

프로세스가 MySQL commit 이후 Redis 전환 전에 중단되면 expired `COMMITTING` lease recovery가 receipt를
확인한다. receipt가 있으면 DB write 없이 `COMMITTED`와 cleanup을 완료하고, receipt가 없으면
`COMMIT_RETRY`로 되돌린다. 따라서 receipt가 cross-store recovery의 durable source of truth이고 Redis
terminal metadata는 운영 편의를 위한 cache다.

## 8. 프런트엔드 설계

기존 `front/features/host/aigen/` 경계를 유지한다.

### 8.1 API와 queries

- `api/`가 multipart start, typed transcript errors, grounded result/evidence DTO를 소유한다.
- `queries/`가 start, adaptive polling, regenerate, draft revision, commit, cancel과 invalidation을
  소유한다.
- UI는 API client나 query client를 직접 import하지 않는다.

기존 `authorNameMode`는 UI에서 제거한다. 호환 기간 동안 server request field를 optional로 받을 수
있지만 `alias` 값은 `TRANSCRIPT_ALIAS_MODE_UNSUPPORTED`로 명시적으로 거절하고 real-name
pipeline만 실행한다. frontend가 field 전송을 중단한 뒤 후속 contract cleanup에서 제거할 수 있다.

### 8.2 업로드

`TranscriptUploadForm`은 다음만 보여준다.

- TXT 파일.
- model.
- optional instructions.
- 생성 버튼.

클라이언트는 extension과 1MB 크기를 빠르게 검사하지만 server preflight가 source of truth다. 오류
화면은 submitted unmatched labels와 수정 방법만 보여준다.

- 기존 회원이면 TXT 화자명을 회원 표시 이름과 정확히 맞춘다.
- 신규 참여자라면 먼저 클럽 회원으로 초대하고 `ACTIVE`가 된 뒤 재업로드한다.
- generic label은 실제 회원 이름으로 수정한다.

화자를 일부 무시하거나 UI에서 다른 회원으로 mapping하는 기능은 제공하지 않는다.

### 8.3 progress

표시 단계:

1. `PREPARING_TRANSCRIPT` — 파싱과 membership bind 완료.
2. `GENERATING_RECORD` — 전체 대본 단일 호출.
3. `VALIDATING_GROUNDING` — evidence/schema 검증.
4. `REPAIRING_RECORD` — 필요한 경우 실패 section 1회 보정.
5. `READY` — 검토 가능.

기존 cancel/recovery UX를 유지하며 `COMMITTING` 동안 polling을 계속한다.

### 8.4 검토 장부와 evidence panel

선택한 UI는 desktop에서 main review ledger + evidence side panel, mobile에서 evidence drawer다.

- 네 section을 한 화면에서 빠르게 훑는다.
- 각 AI-generated block은 `근거 있음` 또는 `경고` 상태를 보여주고, 네 section은 각각 `확인 완료`
  상태를 가진다.
- block을 선택하면 resolved timestamp, speaker name, excerpt를 보여준다.
- 근거 단위는 summary paragraph, highlight item, one-line review, feedback top-level section이다.
- 기본 excerpt가 잘렸으면 `발언 전체 보기`로 현재 revision에서 실제 참조된 단일 turn만 펼칠 수 있다.
- evidence panel은 현재 host session route에서만 접근 가능하며 transcript 전체 search/download 기능을
  제공하지 않는다.
- 호스트는 section별 직접 편집과 재생성을 사용할 수 있다.
- 직접 편집한 block은 AI evidence를 그대로 신뢰하지 않고 그 block의 evidence를 비활성화하며 해당
  section이 `USER_EDITED_REVIEW_REQUIRED`로 바뀐다.
- 네 section 모두 `AI_GROUNDED_REVIEWED` 또는 `USER_EDITED_CONFIRMED`가 되어야 commit button이
  활성화된다.

draft는 현재 localStorage recovery를 유지하되 job revision을 함께 저장한다. storage 접근 실패는
generation을 막지 않지만 새로고침 시 편집 복구가 안 될 수 있음을 짧게 알린다. server-side draft
autosave와 multi-device editing은 비목표다.

## 9. API 계약

### 9.1 start

기존 endpoint를 유지한다.

```text
POST /api/host/sessions/{sessionId}/ai-generate/jobs
Content-Type: multipart/form-data
```

성공:

```json
{
  "jobId": "<uuid>",
  "status": "PENDING",
  "expiresAt": "<iso-instant>"
}
```

요청 내용 검증 실패는 `422 application/problem+json`이며 job ID를 만들지 않는다.

```json
{
  "code": "TRANSCRIPT_SPEAKER_NOT_MEMBER",
  "detail": "대본의 화자명을 활성 회원 이름과 맞춘 뒤 다시 업로드하세요.",
  "invalidSpeakerLabels": ["참석자 1"]
}
```

`invalidSpeakerLabels`는 현재 요청에서 host가 제출한 label만 포함하며 로그/audit에 복사하지 않는다.

typed upload/preflight errors:

- `TRANSCRIPT_FORMAT_INVALID`.
- `TRANSCRIPT_EMPTY`.
- `TRANSCRIPT_DURATION_EXCEEDED`.
- `TRANSCRIPT_TOO_LONG_FOR_MODEL`.
- `TRANSCRIPT_SPEAKER_NOT_MEMBER`.
- `TRANSCRIPT_SPEAKER_AMBIGUOUS`.
- `TRANSCRIPT_ALIAS_MODE_UNSUPPORTED`.
- `MODEL_CAPABILITY_UNAVAILABLE` — HTTP 503.

### 9.2 job response

기존 response에 additive field를 추가한다.

```text
revision: number
groundingStatus: PENDING | VALID | INVALID
sectionReviewStatuses: Record<GenerationItem, ReviewStatus>
evidence: GroundedEvidenceRef[]
warnings: string[]
```

wire field는 구현 계획과 기존 frontend naming에 맞춰 `evidence`로 고정한다. 이 배열은 transcript
원문이 아니라 server가 검증된 `turnId`에서 만든 제한된 reference/excerpt이며, 전체 발언은 아래
revision-scoped 단건 endpoint에서만 확장한다.

server response의 section status는 새 generation revision마다 `PENDING_REVIEW`로 초기화된다. frontend는
현재 tab의 확인/편집 상태를 job revision과 함께 localStorage에 overlay하지만 server는 이 client
상태를 신뢰하지 않는다.

```text
GroundedEvidenceRef
  section
  targetId
  turnId
  startSeconds
  speakerName
  excerpt
```

`startSeconds`, `speakerName`, `excerpt`는 LLM output이 아니라 server가 source turn에서 resolve한다.
`targetId`는 현재 job revision 안에서만 유효하며 다른 revision의 target/evidence 조합은 409
`STALE_GENERATION_REVISION`으로 거절한다.

잘린 excerpt의 `발언 전체 보기`는 다음 host-authorized endpoint를 사용한다.

```text
GET /api/host/sessions/{sessionId}/ai-generate/jobs/{jobId}/evidence/{turnId}?revision=<revision>
```

서버는 `turnId`가 현재 validated revision의 evidence에 실제로 참조됐는지 확인하고 해당 단일 turn만
반환한다. 임의 turn 조회, transcript 전체 조회, search/download endpoint는 제공하지 않는다.

### 9.3 commit

```text
expectedRevision
sectionReviews: Record<GenerationItem, AI_GROUNDED_REVIEWED | USER_EDITED_CONFIRMED>
result: SessionImportV1
```

server는 map이 네 section을 모두 포함하는지, revision이 최신인지, membership이 유효한지 다시
검증한다. 또한 요청 result를 현재 validated job snapshot과 section별 canonical JSON으로 비교한다.
변경되지 않은 section은 `AI_GROUNDED_REVIEWED`, 직접 편집된 section은
`USER_EDITED_CONFIRMED`만 허용한다. 비교와 검증은 override result를 job store에 쓰기 전에 수행한다.
client acknowledgement는 semantic truth의 증명은 아니지만 host review action의 명시적 audit
boundary다.

## 10. job 상태와 retry

정상 경로:

```text
PENDING -> RUNNING -> SUCCEEDED -> COMMITTING -> COMMITTED
```

DB commit 실패 또는 receipt 없는 expired commit lease는 `COMMITTING -> COMMIT_RETRY`로 전환하고,
host/admin retry는 `COMMIT_RETRY -> COMMITTING`으로 진행한다. receipt가 있는 expired lease는 DB write
없이 `COMMITTED`로 복구한다. `COMMIT_RETRY`는 non-terminal status이며 result payload TTL을 유지한다.

`JobStage`는 전체 대본 pipeline에 맞게 additive 확장한다.

```text
QUEUED
PREPARING_TRANSCRIPT
GENERATING_RECORD
VALIDATING_GROUNDING
REPAIRING_RECORD
READY
```

구 stage 값은 active job TTL 호환을 위해 역직렬화 가능하게 유지하고 frontend가 unknown stage를
안전한 generic progress로 표시한다.

retry 정책:

- `PROVIDER_UNAVAILABLE`, `PROVIDER_RATE_LIMITED`: 기존 provider fallback chain 깊이 1.
- schema/grounding violation: 동일한 actual provider에서 section-scoped repair 1회.
- `MAX_CALLS_EXCEEDED`: provider 호출 없이 즉시 실패.
- fallback과 repair가 겹쳐 호출 cap이 남지 않으면 repair하지 않고 typed failure.
- invalid draft는 `SUCCEEDED`로 저장하지 않는다.

## 11. 저장과 privacy

### 11.1 Redis

기존 hash와 payload key 경계를 확장한다.

```text
aigen:job:<jobId>             metadata/status/revision/counters, TTL 6h
aigen:job:<jobId>:transcript  normalized raw transcript, TTL 6h
aigen:job:<jobId>:turns       parsed turn snapshot, TTL 6h
aigen:job:<jobId>:result      validated draft result, TTL 6h
aigen:job:<jobId>:evidence    resolved evidence map, TTL 6h
```

commit/cancel 성공 후 네 payload key를 삭제하고 terminal hash만 TTL까지 유지한다. pre-terminal
job에서 필요한 payload가 사라지면 `JOB_EXPIRED`로 fail closed하고 stale keys를 정리한다.
commit 후 삭제가 실패하면 terminal hash의 content-free `cleanupPending` 상태만 남기고 idempotent
cleanup을 재시도한다. 이 상태는 commit 실패를 뜻하지 않으며 DB write를 다시 실행하는 근거가 아니다.

### 11.2 Kafka

기존 metadata-only message를 유지한다. transcript, turns, speaker names, evidence, result를 넣지 않는다.

### 11.3 MySQL audit

새 migration은 content-free 운영 필드만 추가한다.

`ai_generation_commit_receipts`는 `job_id + revision` unique key, `session_id`, `club_id`,
`committed_at`만 저장한다. transcript, member name, generated result는 저장하지 않는다. receipt insert는
participant upsert와 session-import write와 같은 MySQL transaction 안에서 수행한다.

- `pipeline_version`.
- `input_turn_count`.
- `speaker_count`.
- `grounding_status`.
- `grounding_warning_count`.
- `reviewed_section_count`.
- `user_edited_section_count`.

transcript body, turn text, evidence excerpt, generated result JSON, invalid speaker labels는 audit에 저장하지
않는다. metric label도 provider/model/status/safe reason allowlist를 유지한다.

## 12. 오류와 복구

| 단계 | 오류 | 시스템 동작 | 호스트 행동 |
|---|---|---|---|
| 업로드 | 형식/빈 대본 | 422, no side effect | 지원 형식으로 수정 후 재업로드 |
| 업로드 | 비회원/generic label | 422, invalid submitted labels만 반환 | 회원 활성화 또는 TXT 이름 수정 |
| 업로드 | 중복 회원 표시 이름 | 422, 자동 선택 금지 | 회원 표시 이름을 고유하게 변경 |
| 업로드 | duration/model budget 초과 | 422, 자동 분할 금지 | 대본 정리 또는 지원 모델 선택 |
| 업로드 | model capability 확인 불가 | 503, no side effect | 운영자 설정 복구 후 재시도 |
| start | Redis/Kafka unavailable | 503, cost 없음 | 잠시 후 같은 파일 재시도 |
| generate | provider availability failure | 전체 대본으로 fallback 1회 | 자동 처리, 최종 실패 시 새 generation |
| validate | schema/grounding failure | 전체 맥락으로 실패 section 보정 1회 | 자동 처리 |
| revalidate | repair도 실패 | FAILED, invalid draft 미노출 | 모델/지시 변경 후 새 generation |
| review | local draft storage 실패 | generation 유지, recovery warning | 현재 tab에서 검토 계속 |
| commit | membership changed | 409 `MEMBERSHIP_CHANGED` | 회원 상태 복구 후 commit 재시도 |
| commit | stale revision | 409 `STALE_GENERATION_REVISION` | 최신 result reload |
| commit | DB transient failure | rollback, `COMMIT_RETRY` 유지 | host/admin retry-commit |
| post-commit | cache/Redis cleanup failure | COMMITTED 유지, cleanup만 재시도 | 저장 완료로 표시 |
| expiry | Redis TTL 종료 | `JOB_EXPIRED` | TXT 재업로드 |
| cancel | host cancellation | payload 즉시 삭제 | 필요 시 새 generation |

provider raw error, stack trace, transcript text, full member roster는 problem response에 넣지 않는다.

## 13. 테스트 전략

### 13.1 parser unit

public-safe synthetic fixture로 검증한다.

- UTF-8 BOM, LF/CRLF.
- 누적 분 timestamp와 3시간 경계.
- multiline turn, blank line, recognized metadata preamble.
- monotonicity violation, missing header, empty body.
- generic label pattern.
- stable `turnId`.
- maximum size와 duration.

### 13.2 membership/preflight integration

MySQL fixture와 fake side-effect ports를 사용한다.

- active same-club member pass.
- other-club, inactive, suspended, left, unknown member reject.
- duplicate normalized display name reject.
- reject path에서 job create, Redis, Kafka, provider, cost counter 호출 0회.
- valid club member가 session participant가 아니어도 preflight pass.
- canonical request에 system/schema/session/turns/instructions가 모두 포함되는지 검증.
- model별 local tokenizer와 UTF-8 byte upper-bound fallback 경계.
- reserved output과 safety margin을 포함한 input budget pass/reject.
- capability unavailable 503과 budget exceeded 422 모두 job/provider side effect 0회.
- primary와 fallback 후보별 renderer/budget 검사 및 부적합 fallback 제외.

### 13.3 provider contract

각 provider fake/adapter test가 다음을 검증한다.

- 전체 ordered transcript가 한 번 전달되고 잘리거나 재정렬되지 않는다.
- structured output schema가 summary paragraph, highlight item, one-line review, feedback top-level section마다
  evidence turn IDs를 요구한다.
- transcript prompt injection sentinel이 system invariant를 바꾸지 않는다.
- host instructions가 member/evidence/PII invariant를 완화하지 못한다.
- output token budget 설정 전달.
- availability fallback에도 같은 whole transcript contract 전달.
- raw provider failure에 transcript snippet이 포함돼도 wire error에서 제거.

### 13.4 grounding validator

- missing/nonexistent turn ID reject.
- author-specific evidence가 다른 speaker turn만 가리키면 reject.
- unbound member author reject.
- summary paragraph/highlight item/one-line review/feedback top-level section별 evidence requirement.
- revision-scoped target ID와 stale target reject.
- server-resolved excerpt의 240 Unicode code-point limit, escaping, truncation marker.
- current evidence가 참조한 단일 full turn만 조회 허용.
- duplicate one-line author, invalid feedback document, session metadata mismatch.

### 13.5 worker/state machine

- primary generation success.
- provider availability failover success/failure.
- validation repair success/failure.
- fallback + call-cap exhaustion.
- cancel race, save-result CAS, revision increment.
- partial payload expiry와 stale cleanup.
- commit/cancel payload deletion과 cleanup retry.
- COMMITTED cleanup failure가 DB commit retry로 전환되지 않음.
- expired COMMITTING lease의 receipt 있음/없음 recovery 분기.
- existing JobStage compatibility.

### 13.6 commit integration

MySQL/Flyway integration test로 검증한다.

- missing participant insert + four-record commit atomicity.
- removed participant reactivation.
- RSVP/attendance/participation values.
- membership deactivation between generation and commit.
- stale revision.
- downstream validation failure rollback.
- idempotent retry-commit.
- same `job_id + revision` receipt unique constraint와 crash-window recovery.
- post-commit cache/Redis cleanup failure 이후 DB write가 중복되지 않음.

### 13.7 frontend

- typed upload errors and reupload copy.
- no alias selector.
- progress stage mapping and unknown-stage fallback.
- four-section review ledger.
- evidence panel/drawer.
- truncated excerpt의 referenced single-turn expansion과 stale revision 처리.
- user edit invalidates AI-grounded review state.
- all section acknowledgements required.
- commit의 server-side section diff와 review-status 조합 검증.
- local draft/revision recovery.
- responsive Korean/English wrapping and keyboard/focus behavior.

### 13.8 E2E

- BFF multipart preservation and typed 422 propagation.
- non-member reject with no job polling.
- happy path upload -> progress -> evidence review -> commit.
- edit/regenerate/revision conflict.
- refresh recovery.
- membership change before commit.
- admin retry-commit metadata-only behavior.
- desktop/mobile screenshot evidence with public-safe synthetic content.

### 13.9 private local quality eval

실제 7개 TXT는 ignored local input으로만 사용한다. repo fixture, CI artifact, log, screenshot, report에
원문이나 실제 이름을 남기지 않는다. live provider로 전송하는 평가는 별도 명시적 승인과 적절한
provider retention 환경이 있을 때만 실행한다.

기록 가능한 결과는 aggregate뿐이다.

- file별 pass/fail.
- provider/model/pipeline version.
- token, cost, latency.
- valid evidence reference ratio.
- manual unsupported-claim count.
- speaker attribution error count.
- host review completion time.

## 14. 실행 검증 범위

구현 완료 후 최소한 다음을 실행한다. root package manager pin을 Corepack launcher로 사용하고, plain
`pnpm`이 일치하지 않으면 실제 fallback command를 기록한다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
bash scripts/aigen-pii-check.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

focused development lane은 parser/preflight/validator/worker/commit/frontend tests를 먼저 실행하지만
최종 PR-level evidence를 대체하지 않는다.

## 15. rollout과 운영

새 pipeline은 환경 설정 `readmates.aigen.pipeline-mode`로 제어한다.

- 초기 기본값: `LEGACY`.
- 신규 값: `GROUNDED_WHOLE_TRANSCRIPT`.
- mode가 grounded이면 validation failure를 legacy ungrounded generation으로 fallback하지 않는다.
- 기존 global kill switch와 enabled-provider allowlist가 더 높은 우선순위를 가진다.

순서:

1. mock provider + public-safe fixture로 전체 flow 검증.
2. private local eval은 별도 승인 후 실행.
3. staging에서 provider별 smoke와 retention/runbook 확인.
4. 제한된 운영 환경에서 grounded mode enable.
5. audit/metrics로 failure, latency, cost, repair rate를 관찰.
6. 품질 기준을 충족하면 grounded mode를 기본으로 바꾸고 legacy 제거는 별도 작업으로 결정.

운영 문서와 CHANGELOG는 다음을 반영한다.

- 새 pipeline mode와 rollback 절차.
- typed transcript errors.
- model capability/output budget 관리.
- grounding validation과 host-review 한계.
- Redis payload/key cleanup.
- private local eval은 CI나 public release artifact가 아니라는 경계.

## 16. 위험과 완화

### 긴 context의 recall 저하

model input 한도에 들어간다는 사실만으로 모든 발언을 균등하게 기억한다는 보장은 없다. 실제 private
eval에서 핵심 주제 누락과 후반부 편향을 검토한다. 자동 chunking을 추가하지 않고 품질 기준을
충족하지 못하면 model/prompt 변경을 먼저 평가한다.

### evidence ID가 semantic support를 보장하지 않음

validator는 존재와 speaker identity를 검증할 수 있지만 entailment를 완전히 판단할 수 없다. 근거
panel, mandatory review, private manual eval로 이 한계를 명시적으로 보완한다. judge model은 비용과
복잡도 때문에 비목표다.

### prompt injection

대본 안의 명령문이나 host instruction이 system invariant를 덮어쓰지 못하도록 delimiter와 instruction
precedence를 고정하고 provider contract test를 둔다.

### 출력 truncation과 비용 증가

4종 결과와 evidence ID는 기존 4,096-token ceiling을 초과할 수 있다. model capability catalog와
16,384 application budget을 도입하고 preflight cost/cap 및 provider token usage audit를 유지한다.

### provider capability drift

model ID, structured output, input/output limit, pricing은 변경될 수 있다. 구현과 release 전에 공식
provider surface를 재검증하고 frontend hardcoded model list를 server capability catalog와 정렬한다.

### 입력 token 추정 오차

provider tokenizer drift나 wrapper 변경은 입력 한도 계산을 어긋나게 할 수 있다. provider request
renderer를 budget guard와 공유하고 model/version별 tokenizer test를 고정한다. exact tokenizer를 쓸 수
없으면 UTF-8 byte upper bound로 fail closed하여 한도를 넘겨 전송하는 것보다 보수적 거절을 선택한다.

### 회원 이름 변경과 동시성

preflight 이후 membership/name이 바뀔 수 있다. commit 시 membership ID와 current active status를
재검증하고 revision CAS로 오래된 draft를 거절한다.

### 자동 session participant 등록

대본 화자는 active club member로 검증됐으므로 실제 발언을 attendance evidence로 취급한다. 자동 upsert
내용을 commit transaction test와 host-facing completion summary에 표시해 숨은 mutation이 되지 않게
한다.

### private data leakage

transcript, turns, excerpts, actual member labels는 Redis transient payload와 authorized host response에만
존재한다. PII check, Kafka reflection test, audit schema scan, problem-response tests, public-release scan을
모두 유지한다.

## 17. 승인 기준

설계 구현은 다음이 모두 충족될 때 완료다.

- 지원 TXT parser와 exact active-member preflight가 provider 호출 전에 동작한다.
- reject path가 side-effect free임을 test로 증명한다.
- canonical full request의 local input budget guard가 output reserve와 safety margin을 포함해 동작한다.
- 전체 transcript가 single primary generation call에 전달된다.
- 네 결과의 승인된 block 단위와 evidence turn IDs가 같은 structured output으로 생성된다.
- deterministic grounding validation과 한 번의 section repair가 동작한다.
- host review ledger와 desktop evidence panel/mobile drawer가 동작한다.
- user edits와 four-section acknowledgement가 commit을 안전하게 gate한다.
- session participant upsert와 session-import commit이 원자적이다.
- cross-store commit crash가 content-free receipt로 복구되고 DB write를 반복하지 않는다.
- transcript/evidence cleanup과 admin metadata-only boundary가 유지되며 cleanup retry가 DB write를
  반복하지 않는다.
- server/frontend/BFF/E2E/PII/public-release checks가 통과하거나 실행 불가 이유가 명시된다.
- private local eval은 원문을 artifact로 남기지 않고 승인된 운영 품질 기준을 충족한다.
