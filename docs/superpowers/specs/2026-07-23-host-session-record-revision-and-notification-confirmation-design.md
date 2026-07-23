# 호스트 과거 세션 기록 수정과 알림 확인 설계

작성일: 2026-07-23
상태: 사용자 승인 완료

## 1. 목적

호스트가 이전 회차를 쉽게 찾아 세션 기본 정보, 출석, 공개 요약, 하이라이트, 한줄평, 피드백 문서를 수정할 수 있게 한다. 기본 정보와 출석은 명시적인 섹션 저장 즉시 반영하고, 멤버 또는 공개 화면에 노출되는 기록 묶음은 서버 초안에서 검토한 뒤 최종 반영한다.

호스트 작업으로 기존 자동 알림이 발생할 수 있을 때는 발송 전에 대상과 채널 영향을 보여준다. 호스트가 `알림과 함께 반영` 또는 `알림 없이 반영`을 직접 선택하지 않으면 서버는 작업을 거절한다.

## 2. 현재 구조와 문제

현재 코드에는 다음 기반이 있다.

- `GET /api/host/sessions`는 `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED` 세션을 모두 cursor page로 반환한다.
- 호스트 대시보드는 이 목록 중 `DRAFT`만 예정 세션으로 렌더링한다. `CLOSED`와 `PUBLISHED` 회차로 들어갈 전용 진입점이 없다.
- `/app/host/sessions/:sessionId/edit` 편집기는 세션 상태와 관계없이 호스트 세션 상세를 로드할 수 있다.
- 기본 정보, 출석, 공개 요약, 공개 범위, AI/JSON 세션 기록 패키지 API는 이미 존재하지만, 공개 기록 전체를 수동으로 수정하고 서버 초안으로 보관하는 통합 편집 경험은 없다.
- `HostSessionLifecycleService.updateVisibility`는 `DRAFT` 세션을 `MEMBER` 또는 `PUBLIC`로 공개할 때 `NEXT_BOOK_PUBLISHED` 이벤트를 자동 생성한다.
- `SessionImportService`는 피드백 문서 버전이 저장될 때 `FEEDBACK_DOCUMENT_PUBLISHED` 이벤트를 자동 생성한다.
- 수동 알림에는 preview/confirm, 대상 수, 채널 수, 중복 발송 확인 구조가 이미 있지만 콘텐츠 변경과 함께 발생하는 자동 알림에는 호스트 확인 단계가 없다.

따라서 서버의 수정 능력보다 호스트의 탐색 가능성, 공개 기록 초안 경계, 복구 가능성, 알림 인지성이 부족하다.

## 3. 승인된 제품 결정

1. 수정 범위는 세션 기본 정보, 출석, 공개 요약, 공개 범위, 하이라이트, 한줄평, 피드백 문서 전체다.
2. 기본 정보와 출석은 섹션 저장 즉시 반영하고 변경 이력을 기록한다.
3. 공개 기록 묶음은 서버 초안으로 저장하고 최종 확인 후 한 번에 반영한다.
4. 공개 기록 묶음은 불변 revision을 보관하며 과거 revision을 새 초안으로 복원할 수 있다.
5. 기본 정보와 출석은 변경 이력만 제공하고 값 복원 기능은 제공하지 않는다.
6. 과거 세션 진입점은 대시보드의 처리 필요 요약과 `세션 기록` 전용 장부를 함께 제공한다.
7. 수정 알림은 기본 발송하지 않는다. 호스트가 최종 확인창에서 발송 여부를 명시적으로 선택한다.
8. 다음 책 공개와 세션 기록 반영처럼 호스트 작업이 자동 알림을 만들 수 있으면 SEND/SKIP 확인을 필수로 한다.
9. 예약 리마인더와 멤버의 서평 공개처럼 호스트 화면 밖에서 시작되는 알림은 이번 범위에서 변경하지 않는다.

## 4. 목표

- 호스트가 회차 번호, 책 제목, 세션 제목으로 과거 세션을 찾을 수 있다.
- 수정이 필요한 회차와 저장 중인 초안이 있는 회차를 한눈에 구분할 수 있다.
- 공개 중인 기록을 편집하는 동안 멤버 또는 공개 화면의 현재 기록이 바뀌지 않는다.
- 반영 직전에 변경 범위, 공개 영향, 복구 지점, 알림 대상과 채널을 확인할 수 있다.
- 콘텐츠 반영과 알림 결정이 하나의 트랜잭션에서 일관되게 기록된다.
- 과거 revision 복원도 즉시 덮어쓰기가 아니라 새 초안 검토를 거친다.
- 자동 API 호출이나 이전 프런트엔드가 호스트 확인 없이 알림을 생성하지 못한다.

## 5. 비목표

- 기본 정보와 출석 값의 자동 복원
- 실시간 공동 편집 또는 자동 병합
- 여러 회차 일괄 수정
- 예약 리마인더 승인 대기함
- 멤버가 공개한 서평 알림의 호스트 승인
- 플랫폼 관리자의 세션 콘텐츠 수정
- AI transcript, evidence, provider 응답의 장기 revision 저장
- 알림 발송 성공을 기다린 뒤 콘텐츠를 공개하는 동기식 배송

## 6. 정보 구조와 진입점

### 6.1 호스트 탐색

데스크톱 호스트 내비게이션의 기존 `세션 문서` 항목을 `세션 기록`으로 바꾸고 `/app/host/sessions` 장부로 연결한다. 새 메뉴를 추가하지 않는다.

모바일 호스트 하단의 기존 `기록` 탭은 멤버 아카이브가 아니라 `/app/host/sessions` 장부로 연결한다. 호스트가 멤버 아카이브를 열 때는 멤버 작업공간 전환 상태를 명시적으로 사용한다.

canonical route는 다음과 같다.

- `/app/host/sessions`
- `/clubs/:clubSlug/app/host/sessions`
- `/app/host/sessions/new`
- `/app/host/sessions/:sessionId/edit`
- `/clubs/:clubSlug/app/host/sessions/:sessionId/edit`

club-scoped route와 unscoped compatibility route는 현재 `AppRouteLayout`과 `clubSlug` context 정책을 유지한다.

### 6.2 대시보드

호스트 대시보드는 전체 과거 회차 목록을 중복 렌더링하지 않는다. 대신 다음 항목만 보여준다.

- 수정 필요 회차 수
- 공개 기록 미완성 수
- 저장된 초안 수
- 가장 최근의 처리 필요 회차 최대 3개
- `세션 기록 전체 보기` 링크

집계가 실패해도 현재 세션과 예정 세션 영역은 유지한다. 처리 필요 목록은 독립적인 unavailable state를 보여준다.

### 6.3 세션 기록 장부

장부는 자연스러운 회차 장부로서 기본적으로 `sessionNumber desc, sessionId desc` 순서로 표시한다. 다음 controls를 제공한다.

- 검색: 회차 번호, 책 제목, 세션 제목
- 필터: 전체, 수정 필요, 예정, 진행 중, 종료, 공개 완료
- cursor 기반 더 보기
- 새 세션 만들기

각 row 또는 mobile card는 다음 정보를 표시한다.

- 회차 번호, 책 제목, 세션 제목, 모임 날짜
- 세션 상태와 공개 범위
- 기록 상태: 미작성, 미완성, 초안 있음, 완료
- 마지막 수정 시각
- 주 action: `이어서 수정`, `초안 열기`, `보기·수정`

`수정 필요`는 공통 session closing/readiness policy를 재사용해 계산한다. 장부 전용 SQL에서 별도 규칙을 재정의하지 않는다. 초안 존재는 readiness와 별도 badge로 표시하며 `수정 필요` 필터에도 포함한다.

### 6.4 세션 편집기

기존 `/sessions/:sessionId/edit`를 유지하고 화면을 다음 네 섹션으로 정리한다.

1. 기본 정보
2. 출석
3. 공개 기록
4. 변경 이력

상단 상태 header에는 회차, 세션 상태, 공개 범위, 현재 live revision, 초안 저장 상태를 보여준다.

데스크톱은 기존 paper/document panel 스타일을 유지한다. 모바일은 네 섹션을 키보드 접근 가능한 가로 tab으로 제공하고, 저장되지 않은 공개 기록 초안이 있으면 하단 sticky bar에 `초안 저장됨 · 검토 후 반영` 상태와 `변경사항 검토` action을 표시한다.

## 7. 수정 경험

### 7.1 기본 정보와 출석

기본 정보와 출석은 현재처럼 별도 mutation으로 저장한다. 두 섹션을 저장하면 live 화면에 즉시 반영한다.

책 제목이나 모임 날짜처럼 세션 기록 snapshot validation에 참여하는 기본 정보가 활성 초안과 동시에 바뀌면 초안을 버리지 않는다. 대신 초안의 `baseLiveRevision`을 stale로 표시하고 다음 autosave/apply preview에서 새 기본 정보에 맞게 재검증하도록 요구한다. 호스트가 불일치를 해결하기 전에는 최종 apply를 허용하지 않는다.

서버는 다음 audit metadata를 남긴다.

- club id, session id
- actor membership id
- action type
- 변경된 field 이름
- 발생 시각
- request id

meeting URL, passcode, email, token, raw request body는 audit에 저장하지 않는다. 출석 이력은 membership id와 상태 전이만 저장하고 UI에서 현재 표시 이름을 resolve한다.

### 7.2 공개 기록 묶음

공개 기록 묶음은 다음 내용을 하나의 snapshot으로 다룬다.

- 공개 요약
- 공개 범위
- 하이라이트와 작성자 binding
- 한줄평과 작성자 binding
- 피드백 문서 파일 이름, title, Markdown 본문

편집기는 현재 live snapshot과 활성 초안을 함께 로드한다. 활성 초안이 없으면 호스트가 처음 수정할 때 현재 live snapshot을 기준으로 초안을 생성한다.

수동 편집, 외부 JSON 가져오기, AI 생성 결과는 모두 live 데이터를 직접 교체하지 않고 같은 서버 초안을 갱신한다.

- 외부 JSON: `preview` 후 `초안으로 가져오기`
- AI 생성: grounded review 완료 후 `초안으로 저장`
- 수동 편집: section patch autosave

AI transcript와 evidence는 기존 Redis/privacy 경계를 유지하고 MySQL 초안 또는 revision에 저장하지 않는다. 최종 검증된 기록 snapshot만 저장한다.

### 7.3 초안 상태

초안은 session당 하나의 공유 활성 초안을 둔다. 서로 다른 호스트의 동시 수정은 optimistic revision으로 감지한다.

- PATCH 요청은 `expectedDraftRevision`을 포함한다.
- 서버 값과 다르면 `409 SESSION_RECORD_DRAFT_STALE`을 반환한다.
- UI는 자동 덮어쓰기하지 않는다.
- 사용자의 화면 입력은 유지하고 최신 초안을 새로 불러오거나 입력을 복사할 수 있게 한다.
- 자동 병합은 제공하지 않는다.

초안 autosave 실패 시 화면 입력과 dirty state를 유지한다. 저장되지 않은 상태에서 route를 떠나면 이탈 경고를 표시한다.

## 8. 최종 반영과 알림 확인

### 8.1 공통 확인창

다음 host action은 실행 전 impact preview를 요청한다.

- `DRAFT` 세션을 처음 `MEMBER` 또는 `PUBLIC`로 공개
- 공개 기록 초안을 live revision으로 반영

확인창은 다음 정보를 보여준다.

- 세션과 action
- 변경된 section 요약
- 멤버 및 공개 화면 영향
- 생성될 복구 revision
- 알림 event type
- 최종 대상 수
- 앱 알림 예상 수
- 이메일 예상 수
- 설정 또는 이메일 누락으로 제외되는 수
- 최근 같은 성격의 발송이 있으면 중복 경고

알림 선택에는 기본값이 없다.

- `알림과 함께 반영`
- `알림 없이 반영`

호스트가 선택하기 전에는 최종 action button을 비활성화한다. 취소하면 콘텐츠, 공개 범위, 초안, 알림에 변화가 없다.

대상이 0명이면 SEND를 비활성화하고 이유를 표시한다. SKIP은 계속 선택할 수 있다.

### 8.2 알림 event 의미

- 다음 책 최초 공개: 기존 `NEXT_BOOK_PUBLISHED`
- 피드백 문서 최초 공개: 기존 `FEEDBACK_DOCUMENT_PUBLISHED`
- 이미 공개된 기록 묶음 수정: 새 `SESSION_RECORD_UPDATED`

`SESSION_RECORD_UPDATED`는 기존 피드백/세션 기록 알림 preference 묶음을 따른다. 새 멤버 설정 toggle을 추가하지 않는다.

같은 live revision에 대해서는 하나의 notification decision만 유효하다. SEND는 revision id를 dedupe key에 포함해 정확히 한 event를 생성한다. SKIP도 decision audit을 남긴다.

확인 후 생성된 event는 notification ledger에서 일반 scheduler 자동 이벤트와 구분할 수 있도록 `HOST_CONFIRMED` source를 사용한다. 기존 `AUTOMATIC`과 `MANUAL` 의미는 유지한다.

예약 `SESSION_REMINDER_DUE`, 멤버 `REVIEW_PUBLISHED`, 호스트 개인용 `AI_GENERATION_READY`는 이번 gate 대상이 아니다.

### 8.3 서버 fail-closed

알림 event가 발생할 수 있는 mutation은 다음 값을 조건부로 필수 요구한다.

- `previewId`
- `notificationDecision`: `SEND` 또는 `SKIP`
- expected draft/live revision

preview는 opaque id로 5분간 유효하며 club, session, actor, action type, request hash, draft revision, live revision에 binding한다.

서버는 apply 직전에 권한, preview expiry, request hash, draft/live revision, 대상 eligibility를 다시 검증한다. 확인 없이 호출하거나 preview가 바뀌었으면 event를 자동 생성하지 않고 typed error를 반환한다.

## 9. 서버 구조

### 9.1 Frontend feature 경계

기존 `front/features/host/` 안에서 route-first 경계를 유지한다.

- `api`: 장부, 초안, apply preview/apply, history contract
- `queries`: query key, autosave mutation, invalidation
- `model`: 장부 filter, readiness projection, diff display, editor state
- `route`: loader, URL search state, query seeding, UI prop 조립
- `ui`: 장부, editor section, 확인 dialog/sheet

UI는 API 또는 query module을 직접 import하지 않는다. club-scoped query key를 유지한다.

### 9.2 Server application 경계

새 동작은 다음 역할로 나눈다.

- `HostSessionLedgerQueryService`: 호스트 장부와 dashboard attention projection
- `SessionRecordDraftService`: 초안 생성, section autosave, optimistic revision
- `SessionRecordApplyService`: preview 검증, live snapshot 보관, record replacement, revision 생성, 초안 정리
- `HostActionNotificationGateService`: 알림 영향 preview, SEND/SKIP decision 검증과 기록
- `HostSessionHistoryQueryService`: record revision과 기본/출석 audit의 통합 read model

HTTP parsing은 `adapter.in.web`, orchestration과 권한은 application service, SQL과 JSON persistence는 outbound adapter에 둔다.

현재 `SessionImportService`의 검증과 normalized record replacement를 재사용하되 자동 알림 side effect는 제거한다. 다음 두 경계를 분리한다.

1. 검증된 snapshot을 초안으로 저장
2. 검증된 초안을 live record로 반영

알림 outbox 생성은 `SessionRecordApplyService`가 notification gate decision을 검증한 뒤 같은 transaction 안에서 호출한다.

AI commit receipt는 `초안 저장 완료`를 나타내도록 contract를 명확히 하고 live 공개 완료로 해석하지 않는다. AI job cleanup과 content-free receipt 원칙은 유지한다.

### 9.3 저장 모델

Flyway MySQL migration으로 다음 테이블을 추가한다.

#### `session_record_drafts`

- club id, session id
- base live revision
- draft revision
- canonical snapshot JSON
- updated by membership id
- created/updated timestamps

session당 활성 row 하나를 둔다.

#### `session_record_revisions`

- immutable revision id
- club id, session id
- monotonically increasing version
- canonical snapshot JSON과 checksum
- source: `BASELINE`, `MANUAL`, `JSON_IMPORT`, `AI_GENERATED`, `RESTORED`
- restored-from revision id
- applied by membership id
- applied timestamp

현재 normalized publication/highlight/one-line/feedback tables는 live read API의 source of truth로 유지한다. revision JSON은 history와 복원 source다.

처음 수정하는 기존 세션은 apply transaction에서 현재 live 데이터를 `BASELINE` revision으로 먼저 snapshot한다. 대규모 content backfill migration은 하지 않는다.

#### `host_session_change_audit`

- club id, session id
- actor membership id
- action type
- changed field names 또는 attendance status transition
- request id
- created timestamp

raw request, email, meeting credential, token은 저장하지 않는다.

#### `host_action_notification_previews`

- opaque preview id
- club/session/actor/action identity
- request hash와 draft/live revision
- content-free target/channel counts
- expiry와 consumed timestamp

#### `host_action_notification_decisions`

- club/session/actor/action identity
- live revision
- `SEND` 또는 `SKIP`
- event type
- content-free target/channel counts
- outbox event id
- created timestamp

preview와 decision에는 세션 기록 본문, 이메일 원문, display name, transcript, evidence를 저장하지 않는다.

## 10. API 계약

### 10.1 장부

```text
GET /api/host/sessions
  ?search=
  &state=
  &recordStatus=
  &limit=
  &cursor=
```

기존 page shape `{items, nextCursor}`를 유지하고 list item에 다음 additive field를 제공한다.

- `recordStatus`
- `needsAttention`
- `hasDraft`
- `liveRevision`
- `draftRevision`
- `lastModifiedAt`

cursor는 적용된 filter/search contract와 함께 검증한다. 잘못되거나 다른 query에 재사용된 cursor는 `400 INVALID_CURSOR`다.

### 10.2 record editor

```text
GET    /api/host/sessions/{sessionId}/record-editor
PATCH  /api/host/sessions/{sessionId}/record-draft
DELETE /api/host/sessions/{sessionId}/record-draft
POST   /api/host/sessions/{sessionId}/record-apply-preview
POST   /api/host/sessions/{sessionId}/record-apply
GET    /api/host/sessions/{sessionId}/history
POST   /api/host/sessions/{sessionId}/revisions/{revisionId}/restore-to-draft
```

`record-editor`는 live snapshot, live revision, 활성 draft, draft revision, validation summary를 반환한다. host 전용이며 member/public API contract는 바꾸지 않는다.

`record-draft` PATCH는 section patch와 `expectedDraftRevision`을 받는다. DELETE도 `expectedDraftRevision`을 요구하며 dirty draft 폐기 확인 후 사용한다.

`record-apply-preview`는 diff와 notification impact를 계산해 `previewId`와 expiry를 반환한다.

`record-apply`는 `previewId`, `expectedDraftRevision`, `expectedLiveRevision`, `notificationDecision`을 받는다.

### 10.3 다음 책 공개

```text
POST  /api/host/sessions/{sessionId}/visibility-preview
PATCH /api/host/sessions/{sessionId}/visibility
```

최초 멤버 공개로 `NEXT_BOOK_PUBLISHED`가 발생할 수 있으면 visibility PATCH는 preview와 SEND/SKIP을 요구한다. 알림이 발생하지 않는 visibility 조정은 기존 단순 mutation을 유지한다.

### 10.4 history

history는 cursor page이며 다음 typed item을 시간 역순으로 반환한다.

- `BASIC_INFO_UPDATED`
- `ATTENDANCE_UPDATED`
- `RECORD_REVISION_APPLIED`
- `RECORD_REVISION_RESTORED`
- `NOTIFICATION_SENT`
- `NOTIFICATION_SKIPPED`

응답은 host에게 필요한 제품 metadata만 제공한다. private body 비교는 record revision detail을 명시적으로 열 때만 반환한다.

## 11. 트랜잭션과 복원

### 11.1 record apply transaction

`SessionRecordApplyService`는 한 MySQL transaction에서 다음 순서를 지킨다.

1. active host와 club/session scope 재검증
2. session, live revision, active draft row lock
3. expected draft/live revision 검증
4. preview binding, expiry, 대상 영향 재검증
5. 기존 live snapshot baseline/revision 보관
6. draft snapshot 전체 validation
7. normalized live publication/highlight/one-line/feedback replacement
8. 새 immutable revision 생성
9. SEND/SKIP decision 기록
10. SEND면 notification outbox event 생성
11. 적용된 draft 삭제
12. commit 후 public/member/host query cache invalidation

outbox insert가 실패하면 콘텐츠와 revision도 롤백한다. 실제 Kafka/email/in-app 배송은 비동기이므로 transaction 이후 배송 실패가 콘텐츠를 되돌리지는 않는다. UI는 발송 장부 link와 상태를 제공한다.

### 11.2 restore

복원은 선택한 immutable revision을 live에 직접 쓰지 않는다.

1. history에서 revision 선택
2. `restore-to-draft`가 snapshot을 새 활성 초안으로 복사
3. 호스트가 수동 검토
4. 일반 apply preview와 SEND/SKIP 확인
5. 새 live revision으로 반영

과거 revision은 수정하지 않는다. 복원도 새 revision을 생성하고 `restoredFromRevisionId`를 남긴다.

revision의 작성자 identity는 membership id와 당시 표시 이름을 함께 보존한다. 복원된 기존 기록의 작성자는 해당 세션의 historical participant binding으로 검증하며, 현재 club membership이 비활성이라는 이유만으로 이미 검증된 과거 attribution을 지우지 않는다. 새로 추가하거나 바꾸는 작성자는 현재 허용된 session attendee 규칙을 따른다.

## 12. 오류 처리

### 12.1 목록

- 장부 로드 실패: 검색과 filter URL state를 유지하고 inline retry 제공
- 더 보기 실패: 기존 item을 유지하고 `더 불러오지 못했습니다` 표시
- dashboard attention 실패: 현재/예정 세션 영역과 격리

### 12.2 초안

- autosave 실패: local input과 dirty state 유지
- `409 SESSION_RECORD_DRAFT_STALE`: 자동 overwrite 금지, 최신 초안 refresh와 내 입력 copy 제공
- `409 SESSION_RECORD_LIVE_STALE`: apply 중단, 최신 live diff를 다시 확인
- `422 SESSION_RECORD_INVALID`: 초안 보존, issue를 해당 section/field에 연결

### 12.3 확인과 apply

- preview 만료: `409 NOTIFICATION_PREVIEW_EXPIRED`, 최신 영향으로 dialog 재오픈
- preview 변조/다른 actor: `403` 또는 `409`, 대상 metadata 미노출
- 선택 누락: `409 NOTIFICATION_CONFIRMATION_REQUIRED`
- 대상 변경: 새 대상 수를 보여주고 SEND/SKIP 재선택
- 중복 submit: consumed preview는 동일 stored result를 반환
- outbox insert 실패: 전체 apply rollback
- 비동기 delivery 실패: live revision 유지, notification ledger로 안내

API error는 기존 `{code, message, status}` public-safe shape를 유지한다.

## 13. 접근성·반응형·카피

- 확인 UI는 desktop dialog, mobile bottom sheet로 표현하되 동일한 semantic dialog contract를 사용한다.
- focus는 dialog 안에 가두고 닫을 때 trigger로 복원한다.
- ESC와 취소는 mutation 없이 닫는다.
- SEND/SKIP은 radio group이며 기본 선택이 없다.
- 상태는 색상 외 badge text와 설명을 함께 사용한다.
- Korean/English wrapping과 320px mobile width에서 action overflow를 확인한다.
- reduced motion을 존중한다.
- `자동 알림`처럼 사용자가 통제할 수 없는 표현 대신 `알림과 함께 반영`, `알림 없이 반영`처럼 결과를 직접 설명한다.
- 공개 기록 수정에는 `즉시 반영됩니다`와 복원 가능성을 함께 표시한다.

## 14. 보안과 공개 저장소 안전

- 모든 새 API는 현재 club의 active HOST role을 요구한다.
- session, draft, revision, preview, decision query는 club id를 항상 조건에 포함한다.
- browser가 보낸 trusted internal header를 사용하지 않고 기존 BFF club context를 따른다.
- member/public API에 draft, history, decision, private feedback body를 추가하지 않는다.
- notification preview는 count만 반환하며 raw email이나 대상 display name 목록을 반환하지 않는다.
- revision에는 최종 기록만 저장하고 AI transcript, evidence, prompt, provider raw response/error를 저장하지 않는다.
- audit와 docs/tests에는 실제 멤버 정보, private domain, secret, deployment state, token-shaped sample을 넣지 않는다.

## 15. 테스트 설계

### 15.1 Frontend

- 장부 검색, filter, cursor append, mutation 후 append buffer reset
- `needsAttention`, `hasDraft`, state badge mapping
- route loader와 club-scoped query key
- 초안 autosave success/failure/dirty state
- draft/live 409 충돌과 overwrite 금지
- apply dialog의 무기본값 SEND/SKIP radio
- 취소 시 mutation 없음
- preview 만료 후 최신 dialog 재오픈
- target 0일 때 SEND disabled
- desktop focus trap과 trigger focus restore
- mobile tab keyboard interaction, sticky draft bar, 320px wrapping
- navigation guard

### 15.2 Server

- host role과 club isolation
- 장부 search/filter/cursor contract
- readiness policy 재사용
- draft optimistic CAS
- immutable revision과 checksum
- lazy baseline 생성
- manual/JSON/AI snapshot이 같은 draft contract 사용
- apply 전체 validation
- apply transaction rollback
- SEND decision과 outbox event
- SKIP decision과 outbox 부재
- preview expiry, actor binding, request hash, revision binding
- consumed preview idempotency
- restore가 live가 아닌 새 draft를 생성
- restore apply가 새 revision 생성
- basic/attendance audit privacy allowlist
- old host-triggered auto path가 confirmation 없이 event를 생성하지 못함
- scheduler/member/AI system event 회귀

### 15.3 E2E

1. 호스트가 장부에서 과거 회차를 검색한다.
2. 기본 정보와 출석을 수정하고 즉시 반영 및 history를 확인한다.
3. 공개 기록을 수정하고 live member/public 화면이 아직 바뀌지 않았음을 확인한다.
4. SKIP으로 반영하고 새 live revision과 알림 부재를 확인한다.
5. 다른 수정은 SEND로 반영하고 notification ledger와 member deep link를 확인한다.
6. 과거 revision을 초안으로 복원한 뒤 다시 반영한다.
7. 다음 책 공개 dialog를 취소하면 공개 범위와 outbox가 바뀌지 않는다.
8. 다음 책을 알림 없이 공개한다.
9. 다른 세션은 알림과 함께 공개하고 정확히 한 event가 생기는지 확인한다.

### 15.4 완료 전 명령

구현 완료 시 최소 다음 검증을 실행한다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
pnpm --dir front test:e2e
```

개발 중에는 focused Vitest, server unit/integration, architecture test를 먼저 실행한다. 최종 결과에는 실제 실행한 명령만 기록한다.

## 16. 배포 전환

프런트엔드와 서버가 별도 배포될 수 있으므로 호스트 알림 확인을 두 단계로 전환한다.

1. 서버가 additive draft/preview/apply API와 capability를 제공한다. 기존 화면은 동작하지만 새 frontend가 capability를 감지할 수 있다.
2. 새 frontend가 장부와 confirmation flow를 사용하도록 배포된다.
3. 운영 확인 후 서버에서 host-triggered confirmation requirement를 활성화한다.
4. 최종 상태에서는 preview와 decision 없는 host-triggered notification mutation을 fail-closed한다.

capability가 활성화된 뒤 이전 frontend mutation은 `NOTIFICATION_CONFIRMATION_REQUIRED`를 받고 자동 발송하지 않는다. UI는 새로고침 안내를 표시한다.

release tag가 제품 버전의 source of truth다. 별도 `VERSION` 파일은 추가하지 않는다.

## 17. 성공 기준

- 호스트가 대시보드 또는 세션 기록 장부에서 모든 과거 회차에 접근할 수 있다.
- 기본 정보, 출석, 공개 요약, 공개 범위, 하이라이트, 한줄평, 피드백 문서를 수정할 수 있다.
- 공개 기록은 최종 apply 전까지 live member/public 화면을 바꾸지 않는다.
- 모든 applied record revision은 history에 남고 과거 revision을 새 초안으로 복원할 수 있다.
- 호스트 작업에서 발생하는 다음 책/피드백/기록 수정 알림은 SEND/SKIP 명시 선택 없이는 생성되지 않는다.
- 취소, 만료, 충돌, 검증 실패 시 콘텐츠와 알림이 부분 적용되지 않는다.
- 예약 리마인더, 멤버 서평, AI ready 알림의 기존 비호스트 자동 흐름은 유지된다.
- desktop/mobile 모두 접근 가능하고 public/member 권한 경계가 약화되지 않는다.
