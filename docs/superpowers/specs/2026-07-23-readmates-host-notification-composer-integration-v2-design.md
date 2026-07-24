# ReadMates 호스트 알림 작성기 최신 main 통합 v2 설계

## 1. 배경과 문제

기존 `codex/cpe-1d9d77a47331471d` 작업은 호스트가 콘텐츠 저장과 알림 발송을 분리하고, 저장 완료 뒤 명시적인 작성기에서 수신자와 채널을 확인한 후 발송하도록 설계되었다. 해당 브랜치 자체의 테스트 근거는 유효하지만, 분기 이후 최신 `main`에는 세션 기록 draft, 불변 revision, apply, `SEND`/`SKIP` 결정 ledger를 포함하는 별도 워크플로가 추가되었다.

두 브랜치를 그대로 병합하면 다음 문제가 생긴다.

- 세션 기록 apply와 알림 발송의 책임 경계가 서로 다르다.
- JSON/AI 가져오기의 commit 시점이 최신 코드에서는 live apply가 아니라 draft 저장 시점이다.
- 기존 작업의 `V39` 마이그레이션 번호가 최신 `main`의 `V39`~`V41`과 충돌한다.
- 동일한 알림 기능을 수정한 파일이 다수 겹쳐 patch 단위 충돌 해소만으로는 의미 보존을 보장할 수 없다.

따라서 기존 브랜치를 통째로 병합하지 않고, 최신 `main`을 기준으로 독립 기능은 선택적으로 이식하고 워크플로 경계는 현재 아키텍처에 맞게 다시 구현한다.

## 2. 목표

- 콘텐츠 저장 또는 apply와 실제 알림 발송을 완전히 분리한다.
- 저장 성공 뒤 호스트가 수신자와 채널을 검토하고 명시적으로 확인한 경우에만 발송한다.
- 최신 세션 기록 draft/revision/history 및 idempotency 구조를 보존한다.
- 기존 manual notification options/preview/confirm 파이프라인을 확장해 호스트 작성 콘텐츠 알림의 발송 경로를 하나만 유지한다.
- 다음 책, 세션 기록/피드백, 선택 수신자, 클럽 리마인더 정책을 일관된 권한·수신자 규칙으로 제공한다.
- 기존 브랜치가 확보한 동작을 patch 동일성이 아니라 최신 코드에서의 행위 동일성으로 검증한다.

## 3. 비목표

- 기존 작업 브랜치 전체 merge 또는 전체 cherry-pick
- 최신 `V39`~`V41` 마이그레이션 수정
- 새로운 별도 outbox, 이메일 또는 예약 실행 파이프라인 도입
- JSON/AI draft 저장 직후 알림 작성기 표시
- 콘텐츠 저장 실패와 알림 작성기 실패를 하나의 트랜잭션으로 결합
- 운영 배포, 기존 공유 데이터베이스에 대한 선행 마이그레이션 적용

## 4. 소스 오브 트루스

우선순위는 다음과 같다.

1. 최신 `main`의 코드, 테스트, 마이그레이션, 설정
2. `docs/development/architecture.md`
3. 최신 세션 기록 revision/confirmation 설계
4. 기존 CPE 브랜치의 구현과 테스트

기존 브랜치는 기능 의도와 검증 사례의 참고 자료이며, 최신 워크플로를 덮어쓰는 기준이 아니다.

## 5. 절대 불변 조건

1. 콘텐츠 mutation은 알림 outbox, 이메일 또는 인앱 알림을 생성하지 않는다.
2. 호스트가 작성한 다음 책·피드백·세션 기록 알림은 manual confirm만 실제 발송을 일으킨다. 별도 opt-in 리마인더 scheduler는 이 규칙의 대상이 아니다.
3. 작성기 닫기, `Escape`, 취소, 이번에는 보내지 않기는 confirm API를 호출하지 않는다.
4. 최신 draft, immutable revision, history, apply idempotency 구조를 유지한다.
5. 기존 `V39`~`V41` 파일은 수정하지 않고 새 스키마는 `V42`에 추가한다.
6. 기존 manual options → preview → confirm 파이프라인을 재사용하며 두 번째 발송 파이프라인을 만들지 않는다.
7. 서버가 최종 권한, 활성 멤버십, 참석 상태, 수신 설정, 콘텐츠 revision을 다시 검증한다.
8. 같은 confirm 재시도는 중복 outbox 또는 중복 사용자 알림을 만들지 않는다.
9. 클럽·세션 범위를 벗어난 멤버와 비활성 멤버는 어떤 클라이언트 입력으로도 수신자가 될 수 없다.

## 6. 선택한 통합 전략

### 6.1 격리

최신 로컬 `main`에서 전용 worktree와 `codex/` 브랜치를 사용한다. 기존 CPE 브랜치와 worktree는 비교 및 회귀 테스트 근거로 보존한다.

### 6.2 이식 방식

- 충돌이 적고 최신 아키텍처와 독립적인 기능은 커밋 또는 파일 단위로 이식한다.
- API DTO, migration, session apply, route 상태처럼 최신 코드와 의미가 겹치는 부분은 테스트 의도를 가져와 재구현한다.
- 각 단계는 독립 커밋으로 남겨 실패 시 해당 단계만 되돌릴 수 있게 한다.
- 오래된 통합 문서와 현재 CHANGELOG를 통째로 덮지 않고, 최신 문맥에 맞는 변경만 다시 작성한다.

## 7. 목표 아키텍처

### 7.1 콘텐츠 mutation 경로

다음 책 저장과 세션 기록 apply는 콘텐츠만 변경한다. 이 트랜잭션에서 notification outbox를 생성하거나 manual confirm을 대신 수행하지 않는다.

최신 세션 기록 워크플로의 content preview, revision 검증, apply idempotency, 불변 history는 그대로 유지한다. content preview는 live/draft 차이와 현재 revision/hash를 읽기 전용으로 계산하고 notification preview 행을 만들지 않는다. 현재 notification preview/decision ledger에 결합된 apply idempotency는 `session_record_apply_receipts`라는 콘텐츠 소유 receipt로 분리한다. apply 요청은 클라이언트가 한 번 생성해 재사용하는 `applyRequestId`를 받고, 성공한 revision과 expected revision/hash를 receipt에 기록한다. 응답 유실 뒤 같은 요청을 재시도하면 draft가 이미 삭제됐더라도 receipt에서 동일 결과를 반환한다.

콘텐츠 mutation API에서는 `notificationDecision`, notification preview ID 또는 발송 payload를 받지 않는다. 구버전 요청이 `SEND`를 전달해도 호환 처리로 발송하지 않고 계약 불일치로 거절한다. 기존 `host_action_notification_previews`와 `host_action_notification_decisions`는 이미 기록된 history의 조회 호환성을 위해 보존하지만, 새 콘텐츠 apply는 여기에 합성 `SKIP` 또는 `SEND` 행을 만들지 않는다.

현재 `readmates.host-action-confirmation.required` 설정은 이번 통합 이후 어떤 값에서도 발송 여부를 제어하지 않는다. `HostSessionLifecycleService`의 legacy automatic next-book fallback과 `SEND` decision 경로를 모두 제거한다. 기존 rollout 호환성을 위해 이 설정이 제어하던 session-record staging/capability 노출은 이번 범위에서 유지하되, 설정 이름이 더 이상 알림 발송을 뜻하지 않는다는 점을 current architecture에 명시하고 별도 rename은 후속 호환성 변경으로 남긴다.

### 7.2 작성기 경로

콘텐츠 mutation이 성공하면 서버가 작성기에 필요한 opaque `contentRevision`과 event type을 제공한다. 허용 audience와 default는 options endpoint가 현재 권한·멤버십을 기준으로 계산한다. 프런트엔드는 이를 사용해 기존 manual notification API를 순서대로 호출한다.

1. options: 서버가 현재 가능한 audience, channel, 기본값, 선택 가능한 멤버를 반환한다.
2. preview: 서버가 선택 조건과 현재 revision으로 실제 수신자 집합과 메시지 미리보기를 계산한다.
3. confirm: 서버가 preview의 유효성·revision·권한을 재검증하고 outbox를 원자적으로 생성한다.

confirm만 발송 상태를 변경한다.

### 7.3 draft와 final apply

JSON/AI 가져오기의 commit은 최신 코드에서 draft를 생성하거나 갱신하는 단계다. 이 시점에는 작성기를 열지 않는다.

작성기는 호스트가 draft를 최종 live record에 apply한 뒤에만 열린다. revision을 갱신하는 후속 apply는 최신 제품 규칙에 맞는 CTA를 제공하되 자동으로 발송하지 않는다.

### 7.4 클럽 리마인더

클럽별 알림 정책이 없거나 새로 생성된 경우 기본값은 `OFF`다. 예약 실행은 `Asia/Seoul` 기준이며, 명시적으로 opt-in한 클럽만 대상으로 한다. 이 scheduler는 호스트 작성 콘텐츠의 manual confirm 경로와 분리된 자동 이벤트 생산자다. 기존 outbox/전달 파이프라인과 멤버별 채널 설정을 재사용한다.

## 8. API와 데이터 계약

### 8.1 manual notification

기존 manual options, preview, confirm endpoint를 유지한다. 호환 가능한 확장 필드는 다음과 같다.

- `contentRevision`: 서버가 발급한 불투명 revision 식별자
- `audience`: 기존 audience와 `SELECTED_MEMBERS`
- `selectedMemberIds`: `SELECTED_MEMBERS`일 때 한 명 이상
- `channel`: `IN_APP`, `EMAIL`, `BOTH`
- `eventType`: 다음 책, 첫 피드백 또는 세션 기록 갱신 등 서버가 허용한 유형

세션 기록 apply 계약은 notification 선택 대신 다음 값을 사용한다.

- `applyRequestId`: 재시도 시 동일하게 보내는 클라이언트 생성 UUID
- `expectedDraftRevision`, `expectedLiveRevision`: 최신 optimistic concurrency 경계
- `expectedDraftHash`: content preview에서 받은 hash로 preview한 내용과 apply할 draft가 같은지 검증

content preview는 영속 notification 상태를 만들지 않는다. apply 성공 응답은 적용된 revision과 manual composer를 열 수 있는 `contentRevision`/`eventType` context를 반환한다. `notificationDecision`과 `eventId`는 반환하지 않는다.

options 응답은 허용 audience, 기본 audience/channel, 선택 가능한 활성 멤버의 표시 정보, 현재 template revision을 포함한다. 다음 책의 기본 audience는 전체 활성 멤버, 피드백의 기본 audience는 참석 확정 멤버다. 기본 channel은 `BOTH`이며 실제 전달은 멤버별 수신 설정을 따른다.

preview는 10분 TTL을 유지하고 수신자 수, 마스킹된 표시 정보, 제목/본문 미리보기를 반환한다. 원문 이메일 주소나 민감한 멤버 정보는 노출하지 않는다.

confirm은 다음을 하나의 트랜잭션 경계에서 처리한다.

- host/club/session 권한 재검증
- 활성 멤버십과 audience 재계산
- preview 만료·stale revision 검증
- idempotency key 또는 기존 dispatch 식별자 확인
- manual dispatch 기록과 outbox 생성

만료 또는 stale preview는 발송하지 않고 새 preview 생성을 요구한다. 명시적인 resend는 별도의 사용자 행동과 별도의 idempotency key를 요구한다.

### 8.2 리마인더 정책

클럽 호스트 범위의 GET/PUT API를 제공한다. 서버는 `CurrentMember`와 클럽 역할을 기준으로 권한을 확인한다. 누락된 정책은 `OFF`로 직렬화하며 PUT 성공 전에는 프런트엔드가 낙관적 상태를 확정하지 않는다.

### 8.3 피드백 preview

호스트는 열린 세션에서도 발송 전 피드백 알림 preview를 준비할 수 있다. 실제 발송 대상은 현재 참석·활성 멤버십·채널 설정을 confirm 시점에 다시 계산한다.

## 9. 마이그레이션

새 운영 마이그레이션은 `server/src/main/resources/db/mysql/migration/V42__host_notification_composer.sql` 하나로 시작한다.

필요한 변경은 다음과 같다.

- `club_notification_policies` 생성
- `session_record_apply_receipts` 생성: `(club_id, session_id, apply_request_id)` unique, expected live/draft revision과 draft hash, 적용 revision, actor, 생성 시각 저장
- `notification_manual_dispatches`에 nullable `content_revision`과 조회 인덱스 추가
- manual audience 제약에 `SELECTED_MEMBERS` 추가
- 선택/제외/포함 멤버 ID는 preview selection hash와 outbox payload snapshot에 정규화된 순서로 포함하며, confirm 시 서버가 다시 계산한다.

마이그레이션은 기존 데이터에 대해 안전한 기본값을 사용하고 forward-only로 작성한다. 현재 `V39`~`V41`을 수정하거나 재번호화하지 않는다. 구현 중 현재 스키마가 동일 컬럼 또는 제약을 이미 제공하는 것으로 확인되면 중복 DDL을 추가하지 않고 `V42`의 범위를 줄인다.

## 10. 프런트엔드 사용자 흐름

### 10.1 다음 책

최초 다음 책 저장 성공 → 작성기 열기 → 기본 `ALL_ACTIVE_MEMBERS`/`BOTH` → preview → 명시적 confirm 또는 건너뛰기.

### 10.2 세션 기록과 피드백

JSON/AI commit → draft 저장만 수행 → 호스트 최종 apply → apply 성공 → 작성기 열기 → 기본 `CONFIRMED_ATTENDEES`/`BOTH` → preview → 명시적 confirm 또는 건너뛰기.

후속 revision apply도 자동 발송하지 않는다. 제품 문맥에 맞는 “업데이트 알림 보내기” CTA가 같은 작성기를 연다.

### 10.3 공통 작성기

- route가 API 호출과 상태 전이를 소유한다.
- UI 컴포넌트는 props/callback 기반으로 렌더링한다.
- loading, stale, expired, empty audience, partial channel exclusion, retry 상태를 명확히 표시한다.
- 닫기, 뒤로 가기, `Escape`, “이번에는 보내지 않기”는 콘텐츠 성공을 취소하지 않고 발송도 하지 않는다.
- 모바일에서 모든 핵심 조작이 가능하고 focus 이동, 키보드, screen reader label, 오류 연결을 제공한다.

운영 알림 화면은 동일한 작성기 모델과 표현 컴포넌트를 재사용하되 route 소유권과 권한 경계를 유지한다.

## 11. 오류와 복구

- 콘텐츠 mutation 성공 후 options/preview 호출이 실패해도 콘텐츠를 롤백하지 않는다.
- 작성기 준비 실패 시 재시도와 나중에 운영 화면에서 다시 열 수 있는 경로를 제공한다.
- stale revision은 현재 콘텐츠를 자동 발송하지 않고 새 options/preview를 요구한다.
- confirm 응답이 유실된 경우 동일 idempotency key 재시도로 결과를 조회하며 중복 생성하지 않는다.
- 정책 저장 실패 시 프런트엔드는 서버 확정값으로 되돌리고 오류를 표시한다.
- 예약 실행의 한 클럽 실패가 다른 opt-in 클럽 처리를 막지 않도록 실패 범위를 격리한다.

## 12. 보안과 개인정보

- 모든 endpoint는 `CurrentMember`와 서버 측 host/club/session 권한 검증을 사용한다.
- 클라이언트가 전달한 club, session, member ID만으로 권한이나 audience를 신뢰하지 않는다.
- 선택 가능한 멤버는 해당 클럽의 활성 멤버로 제한한다.
- 참석자 audience는 현재 서버 참석 상태에서 계산한다.
- preview에는 원문 이메일 주소, 토큰, 내부 delivery payload를 노출하지 않는다.
- 로그와 오류 응답에 메시지 본문, 개인 연락처, 민감한 식별자를 남기지 않는다.

## 13. 단계별 구현 순서

### Phase 0: 최신 기준 characterization

- 콘텐츠 mutation이 현재 어디서 outbox를 생성하는지 테스트로 고정한다.
- 최신 draft → apply → revision/history/idempotency 동작을 characterization test로 보존한다.
- 기존 notification decision 기반 replay를 content-owned apply receipt로 옮길 때 필요한 호환 사례를 고정한다.
- 기존 CPE 브랜치의 기능 테스트를 행위 단위 체크리스트로 변환한다.

### Phase 1: 독립 서버 기능과 `V42`

- 열린 세션의 호스트 feedback preview
- 클럽 리마인더 정책과 opt-in scheduler
- `V42` additive migration
- focused unit/integration test

### Phase 2: manual composer 서버 확장

- `SELECTED_MEMBERS`
- content revision, stale preview, resend, confirm idempotency
- options/default와 권한 검증
- confirm-only outbox invariant test

### Phase 3: 공통 프런트 작성기

- API contract와 pure model
- 공통 composer UI와 reducer/state machine
- 접근성, 모바일, 만료·오류·재시도 상태
- 운영 알림 화면 재사용

### Phase 4: 최신 워크플로 접합부 재구현

- 다음 책 저장 후 작성기 연결
- 세션 기록 final apply 후 작성기 연결
- JSON/AI draft commit에는 작성기가 열리지 않는 회귀 테스트
- 콘텐츠 apply에서 notification decision 제거 및 content-owned receipt로 replay 재구현
- 기존 host-action notification ledger는 historical read-only 호환으로 유지
- legacy automatic next-book fallback과 `SEND` decision 경로 제거
- 기존 rollout flag는 staging/capability에만 적용되고 발송을 제어하지 않는지 검증

### Phase 5: 문서와 release closeout

- CHANGELOG `Unreleased`
- 현재 architecture와 API 문서
- public-release 안전 검사
- 전체 회귀 및 E2E

각 phase는 focused test 통과 후 독립 커밋한다. 다음 phase는 이전 phase의 canonical gate가 실패한 상태에서 시작하지 않는다.

## 14. 기존 커밋 처리 지도

### 비교적 직접 이식 가능

- `a8faf51d`: 열린 세션 host preview
- `7e16c876`: club reminder policy
- `93fcdaf1`: opt-in reminder scheduler
- `650331db`, `f8067ae5`, `5ef5058d`, `a6b03871`: frontend contract/model/UI/state 중 최신 route 구조와 독립적인 부분

### 최신 계약에 맞춰 적응

- `ebac52d8`: explicit recipient composer server
- `2b5b17a3`: revision/stale/resend hardening
- `91554973`: 최종 review-risk 수정 중 현재 계약에 유효한 부분

### 동작만 참고해 재구현

- `eff480b5`: 자동 발송 제거와 명시적 dispatch
- `b22b0c0f`: 다음 책 composer integration
- `a7bd0935`: feedback composer integration
- `ad3eea7f`: 정책 UI와 현재 문서 반영

`378d6a9a`, `2117a2ba`는 역사적 설계·계획 참고 자료이며 그대로 실행하거나 현재 문서의 소스 오브 트루스로 취급하지 않는다.

## 15. 검증 계획

### 단계별 focused evidence

- server application/service/controller 단위 테스트
- Flyway 및 repository integration test
- frontend API/model/reducer/component/route 테스트
- 다음 책, JSON/AI draft, final apply, 건너뛰기, stale, retry, resend E2E
- 저장/apply만으로 outbox와 합성 `SKIP` decision이 생성되지 않는 DB assertion
- confirm 재시도로 중복 outbox가 생기지 않는 assertion
- apply 응답 유실 후 같은 `applyRequestId` 재시도가 동일 revision을 반환하는 assertion

### canonical gates

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
./scripts/pre-push-check.sh --full --release
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

최종 검증은 최신 HEAD에서 한 번 더 실행한다. 기존 CPE 브랜치와는 patch 동일성이 아니라 다음 행위 matrix를 비교한다.

- 자동 발송 없음
- 기본 audience/channel
- 선택 멤버 권한
- stale/expired/resend/idempotency
- 리마인더 opt-in
- 닫기/건너뛰기 무발송
- desktop/mobile 접근성

## 16. 중단 및 롤백 조건

다음 중 하나라도 발생하면 해당 phase를 중단하고 그 phase의 독립 커밋만 되돌린다. 파괴적 reset이나 기존 브랜치 삭제는 하지 않는다.

- 콘텐츠 저장/apply만으로 outbox 또는 사용자 알림 생성
- 콘텐츠 저장/apply가 합성 `SKIP`/`SEND` notification decision 생성
- 기존 `V39`~`V41` 수정 필요
- 최신 draft/revision/history/idempotency 회귀
- 테스트 삭제, assertion 완화 또는 architecture 예외 추가로만 통과
- 다른 클럽 또는 비활성 멤버가 audience에 포함
- confirm 재시도에서 중복 이벤트 생성
- public-release 또는 secret/private-data scan 실패
- JSON/AI draft commit 직후 작성기 또는 발송 발생

구현 브랜치는 검증 완료 전 merge, push, deploy하지 않는다.

## 17. 완료 조건

- 콘텐츠 mutation과 notification confirm이 코드·API·테스트에서 분리되어 있다.
- 호스트 작성 콘텐츠는 manual confirm 외 경로에서 outbox를 생성하지 않는다.
- 최신 session record revision 워크플로와 모든 기존 테스트가 유지된다.
- session record apply 재시도는 content-owned receipt로 동일 결과를 반환한다.
- `V42`가 최신 migration chain에 additive하게 적용된다.
- 다음 책과 final session apply가 같은 작성기를 사용한다.
- JSON/AI draft commit은 작성기를 열지 않는다.
- 선택 멤버, 기본 audience/channel, stale/expired/resend/idempotency가 서버와 프런트 테스트로 고정된다.
- 클럽 리마인더는 기본 OFF이고 opt-in 클럽만 실행된다.
- canonical gates와 public-release 검사가 최종 HEAD에서 통과한다.
- CHANGELOG와 current architecture 문서가 실제 구현과 일치한다.

## 18. 결정

최신 `main`에서 하이브리드 선택 이식을 수행한다. 독립 기능은 제한적으로 가져오고, 세션 기록 apply·알림 결정·migration·route 접합부는 최신 아키텍처 위에서 다시 구현한다. 기존 CPE 브랜치는 구현 근거와 회귀 비교 대상으로 보존한다.
