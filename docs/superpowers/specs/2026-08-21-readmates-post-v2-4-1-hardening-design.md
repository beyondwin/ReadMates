# ReadMates Post-v2.4.1 Host Operations Hardening Design

작성일: 2026-08-21
상태: APPROVED DESIGN SPEC
감사 기준: `v2.4.1` (`573778b7c241`) 이후 `09f4af2ea28b`까지
대상 표면: host 운영 UI, session lifecycle·삭제, session record 호환, notification 내구성, frontend route·error state, Flyway, observability

이 문서는 `v2.4.1` 이후 작업에 대한 다각도 감사를 바탕으로 승인된 후속 하드닝 설계다. 현재 동작의 source of truth는 코드, 테스트, 마이그레이션과 `docs/development/architecture.md`다. 이 문서는 구현 전 목표 계약을 정의하며 구현 완료를 주장하지 않는다.

## 1. 선행 설계와의 관계

이 문서는 `2026-08-21-host-meeting-operating-ledger-design.md`를 폐기하지 않는다. 그 설계의 운영 장부 방향을 유지하면서 실제 구현 뒤 발견된 데이터 무결성, 의미 전달, 호환성, 오류 처리, 정보 구조 결함을 교정한다.

충돌할 때는 다음 항목에 한해 이 문서가 우선한다.

- `GUEST_READABLE` 화면 문구와 실제 익명 게스트·viewer·member 접근 의미
- 일정 기본값의 온라인 모임 URL·비밀번호 적용 및 오류 fallback
- `DRAFT`·`OPEN` 삭제 blocker와 동시성 계약
- revision 0 레거시 `liveSnapshot`의 적용본·게시 자격
- `needsAttention` 집계·정렬·노출
- 호스트 홈과 운영 허브의 책임 분리
- 역방향 수명주기 전환의 사유와 영구 감사
- 구현·마이그레이션·배포 순서

특히 선행 설계의 "멤버에게 보이기", "schedule-defaults 실패는 모두 내장 기본값", "수명주기 감사 원장과 스키마 변경 없음"은 이 문서의 승인된 계약으로 대체한다.

## 2. 감사 결과 요약

### 2.1 우선 결함

1. 삭제 미리보기와 실제 삭제의 내구 이력 검사는 `session_record_revisions`와 `host_action_notification_decisions`만 본다. 수동 발송과 알림 outbox·delivery·멤버 알림이 빠져 있어 미리보기는 삭제 가능인데 실제 FK에서 실패하거나 session 없는 outbox가 남을 수 있다.
2. `GUEST_READABLE`은 익명 게스트와 로그인 viewer·member가 읽을 수 있는데 화면은 "멤버에게 보이기" 또는 "게스트 공개"처럼 서로 다른 의미를 전달한다.
3. 호스트 홈은 활성 모임으로 이동하거나 장부만 렌더링하면서도 대시보드, 알림 요약, 클럽 준비도 등 이동 뒤 버릴 데이터를 함께 읽는다. 반대로 기존 대시보드가 제공하던 AI 기본값·알림 상태·클럽 운영 신호로 가는 명확한 표면은 사라졌다.
4. 기존 데이터에 `liveSnapshot`과 공개 요약이 있어도 `liveRevision=0`이면 프런트가 적용본 없음으로 취급해 서버가 허용하는 게시를 막는다.

### 2.2 후속 결함

- 이전 온라인 모임 URL과 비밀번호가 기본값으로 조용히 다시 제출되며 사용자는 이를 검토하기 어렵다.
- 일정 기본값 query의 모든 오류를 내장 기본값으로 바꿔 인증·권한·서버 장애를 숨긴다.
- 서버 `needsAttention`에는 `PUBLISHED`도 포함되지만 프런트는 `CLOSED`만 남기고 3건으로 잘라 전체 규모를 감춘다.
- 게시 취소·재개방·초안 복귀는 애플리케이션 로그만 남고 행위자·사유의 영구 감사 기록이 없다.
- 공개 범위 변경 실패가 화면에서 사라지고 여러 행이 하나의 pending 상태를 공유한다.
- redirect가 query·hash를 보존하지 않는 경로가 있고, 이전 대시보드 UI와 loader가 죽은 코드·과수집으로 남았다.

## 3. 목표와 완료 기준

### 3.1 목표

- 삭제 미리보기와 실제 삭제가 동일한 fail-closed 정책을 사용하고 알림·기록 내구 이력을 잃지 않는다.
- 접근 범위의 실제 독자를 화면 문구와 테스트가 정확히 설명한다.
- 기존 revision 0 적용본은 백필 없이 유효한 기준선으로 게시·후속 편집에 참여한다.
- 홈, 모임 장부, 운영 허브가 각각 최소하고 명확한 책임을 가진다.
- 서버가 판단한 모든 주의 항목을 전체 건수·최우선 항목·페이지 목록으로 잃지 않고 보여 준다.
- 일정 기본값은 편의만 제공하며 사용자의 새 입력이나 온라인 접속 비밀을 묵시적으로 재사용하지 않는다.
- 수명주기 변경과 삭제가 행위자·이전/이후 상태·사유·요청 식별자를 갖는 영구 감사 증거를 남긴다.
- 오류가 성공이나 빈 데이터처럼 위장되지 않고 사용자가 해당 작업 범위에서 복구할 수 있다.

### 3.2 완료 기준

- 이 문서의 모든 P1/P2 항목이 코드와 자동화된 인수 테스트로 닫히거나 명시적인 잔여 위험으로 기록된다.
- 새 Flyway migration은 기존 데이터를 일괄 변환하지 않는 additive 구조이고 현재 운영 스키마에서 검증된다.
- 구·신 프런트와 서버가 섞이는 배포 구간에 파괴적 계약 변경이 없다.
- 공개 릴리스 검사에서 실제 데이터, 사설 주소, 암호, token-shaped 예시가 추가되지 않는다.

## 4. Non-goals

- `MEMBER_ONLY` 같은 세 번째 접근 범위 추가
- `HOST_ONLY`·`GUEST_READABLE` 또는 `HIDDEN`·`PUBLIC_RECORD` 상태 모델 재설계
- 기존 `liveSnapshot`을 revision 행으로 일괄 백필
- 알림 Kafka·email·in-app delivery 파이프라인 전면 교체
- 멤버·게스트 정보 구조 전면 재설계
- AI 생성 제공자·모델·비용 정책 변경
- 플랫폼 관리자 운영 화면 재설계
- 과거 `host_session_change_audit`의 기본 정보·출석 변경 기록을 새 테이블로 이관

## 5. 선택한 접근

선택한 접근은 **계약 우선 순차 강화**다. 한 설계 아래 무결성, 호환, UI, 운영 정보 구조, 정리 순으로 독립적인 수직 슬라이스를 구현한다.

검토한 대안:

1. **계약 우선 순차 강화 — 선택.** 데이터 손실 경계를 먼저 닫고 각 단계의 회귀 범위와 배포 호환성을 통제할 수 있다.
2. **최소 패치.** 현재 예외와 문구만 빠르게 고칠 수 있지만 감사, race, loader 과수집과 운영 신호 단절이 남는다.
3. **전면 도메인 재설계.** 장기적으로 하나의 모델을 만들 수 있지만 새 접근 상태·대규모 migration·대시보드 재작성으로 승인 범위를 벗어난다.

## 6. 전체 구조와 책임

```text
호스트 홈
├─ 현재 모임과 목록으로 canonical 모임 결정
└─ 처리 필요 전체 건수 + 최우선 1건

모임 운영 장부
├─ 선택한 모임의 단계와 주 작업
└─ 그 모임에 직접 영향을 주는 contextual alert

호스트 운영 허브
├─ 전체 처리 필요 목록
├─ AI 운영 기본값
├─ 클럽 준비도
└─ 알림 상태와 해결 화면 deep link

서버
├─ DeletionPolicy: preview/delete 공통 판정
├─ Lifecycle command + durable audit
├─ Host session attention read model
└─ revision 0 baseline compatibility
```

서버는 삭제 가능성, 상태 전환, 게시 자격, `needsAttention`의 최종 권위다. 프런트는 서버 결과를 상태 이름으로 다시 추정하거나 전역 fallback으로 덮지 않는다.

## 7. 삭제 무결성 계약

### 7.1 상태와 blocker

삭제 대상 상태는 기존처럼 `DRAFT`와 `OPEN`이다. 그 밖의 상태는 `SESSION_DELETION_NOT_ALLOWED`로 거절한다.

다음 중 하나라도 존재하면 삭제를 막는다.

| blocker code | 근거 |
| --- | --- |
| `RECORD_REVISION_EXISTS` | `session_record_revisions` |
| `NOTIFICATION_DECISION_EXISTS` | `host_action_notification_decisions` |
| `MANUAL_DISPATCH_EXISTS` | `notification_manual_dispatches` |
| `NOTIFICATION_EVENT_EXISTS` | `notification_event_outbox`의 session aggregate |
| `NOTIFICATION_DELIVERY_EXISTS` | 해당 event에 연결된 `notification_deliveries` |
| `MEMBER_NOTIFICATION_EXISTS` | 해당 event에 연결된 `member_notifications` |

blocker는 현재 상태와 무관한 generic payload 문자열 검색으로 찾지 않는다. `club_id`, `aggregate_type='SESSION'`, `aggregate_id=sessionId`와 FK 관계를 사용한다.

프리뷰·초안 등 아직 확정되지 않았고 외부 효과가 없는 임시 row는 삭제 트랜잭션에서 정리할 수 있다. session-owned 참석·질문·기록 row는 기존처럼 프리뷰 counts와 확인 대화상자에서 삭제 범위를 명시한다. 새 cleanup table을 추가할 때는 "임시 내부 상태"인지 "영구 증거 또는 외부 효과"인지 분류하는 테스트가 먼저 있어야 한다.

### 7.2 공통 정책과 응답

`deletionPreview`와 `delete`는 같은 application-level `DeletionPolicy`와 outbound query port를 사용한다. controller나 React가 blocker를 재구성하지 않는다.

프리뷰 응답은 기존 필드를 유지하면서 다음을 additive로 제공한다.

```json
{
  "canDelete": false,
  "blockers": [
    { "code": "MANUAL_DISPATCH_EXISTS", "count": 1 }
  ]
}
```

`count`는 사용자 확인에 필요한 범위에서만 제공한다. 메시지 본문, 수신자, URL 또는 비밀번호는 포함하지 않는다.

실제 삭제는 다음 순서를 따른다.

1. host와 club 권한을 확인한다.
2. 대상 session row를 `FOR UPDATE`로 잠근다.
3. 상태와 blocker를 같은 트랜잭션에서 다시 계산한다.
4. blocker가 있으면 아무 row도 지우지 않고 `409 Conflict`와 동일한 blocker 계약을 반환한다.
5. 삭제 감사 이벤트를 기록한다.
6. 허용된 session-owned row와 session을 삭제한다.

미리보기는 안내이고 실제 삭제 재검사가 최종 권위다. FK 예외나 중간 race를 `500`으로 내지 않고 재조회 가능한 경우 `409`로 정규화한다.

### 7.3 생성자와 삭제자의 잠금 규약

삭제 row lock만으로 FK가 없는 `notification_event_outbox` 생성 race를 막을 수 없다. 모든 session-scoped durable effect writer는 outbox·결정·revision을 삽입하기 전에 같은 session row lock 규약에 참여해야 한다.

- `SESSION` aggregate notification producer는 session 존재·club 소유를 잠금 조회한 뒤 enqueue한다.
- revision과 notification decision writer도 같은 parent lock 또는 FK가 제공하는 동등한 직렬화 근거를 갖는다.
- delete와 producer의 경합 테스트는 결과가 "effect가 먼저 생겨 삭제 409" 또는 "삭제가 먼저 끝나 effect 생성 실패" 중 하나임을 증명한다.
- session 없는 outbox 성공은 허용하지 않는다.

## 8. 수명주기 영구 감사

### 8.1 전환과 사유

다음 action을 모두 감사한다.

| action | 상태 변화 | 사유 |
| --- | --- | --- |
| `OPENED` | `DRAFT → OPEN` | 불필요 |
| `CLOSED` | `OPEN → CLOSED` | 불필요 |
| `PUBLISHED` | `CLOSED → PUBLISHED` | 불필요 |
| `REOPENED` | `CLOSED → OPEN` | 필수 |
| `UNPUBLISHED` | `PUBLISHED → CLOSED` | 필수 |
| `RETURNED_TO_DRAFT` | `OPEN → DRAFT` | 필수 |
| `DELETED` | `DRAFT/OPEN → deleted` | 시스템 코드 `EMPTY_SESSION_DELETED` |

사용자가 선택할 수 있는 reverse reason code는 `ACCIDENTAL_TRANSITION`, `MEETING_RESCHEDULED`, `CONTENT_CORRECTION`, `OPERATIONAL_RECOVERY`, `OTHER_OPERATIONAL_REASON`이다. 설명은 선택이며 앞뒤 공백 제거 뒤 최대 500자다. reason code는 메트릭 label로 사용할 수 있지만 설명은 로그·메트릭에 넣지 않는다.

역방향 API는 `{ reasonCode, reasonNote? }` body를 받는다. 최종 상태에서는 reason code가 없으면 `400`과 `LIFECYCLE_REASON_REQUIRED`를 반환한다. forward transition의 기존 body 없는 계약은 유지한다.

### 8.2 저장 구조

현재 최신 migration이 V48이므로 구현 시점에 다시 확인한 다음 번호, 현재 기준 `V49__host_session_lifecycle_audit.sql`을 추가한다.

새 `host_session_lifecycle_audit`의 논리 필드는 다음과 같다.

- `id`
- `club_id`, `session_id`
- `actor_membership_id`
- `action_type`
- `from_state`, `to_state`
- `reason_code`, `reason_note`
- `request_id`
- `created_at`

이 테이블은 session 또는 membership 삭제와 함께 사라지지 않는 append-only 증거다. 따라서 session·membership에 대한 cascade FK를 두지 않고 당시 식별자를 immutable snapshot으로 보존한다. club/session/time과 actor/time 조회 인덱스를 둔다. action/state 조합과 reverse reason 필수 조건은 DB check와 application validation을 함께 사용한다.

`DELETED`는 새 session 상태를 만들지 않는다. 이 action의 `from_state`는 `DRAFT` 또는 `OPEN`, `to_state`는 `null`이며 `reason_code=EMPTY_SESSION_DELETED`다.

기존 `host_session_change_audit`는 기본 정보·출석 변경 이력으로 유지한다. 모임 변경 기록 read model은 새 lifecycle audit을 기존 revision·notification·change audit과 시간순으로 합친다.

### 8.3 원자성과 멱등성

- 상태 변경과 감사 insert는 같은 `@Transactional` application service 안에서 성공하거나 함께 롤백한다.
- 이미 목표 상태인 idempotent 호출은 새 감사 row를 만들지 않는다.
- 실제 상태가 바뀐 호출만 한 개의 감사 row를 만든다.
- `request_id`는 `RequestIdFilter`의 MDC 값을 저장하고 없을 때도 안전한 내부 correlation ID를 생성한다.
- 삭제 감사는 session row를 삭제하기 전에 insert하며 감사 row는 삭제 cleanup 대상이 아니다.

### 8.4 혼합 배포 호환

새 서버가 먼저 배포되어도 구버전 프런트의 body 없는 reverse 요청이 즉시 깨지면 안 된다.

1. migration과 additive 서버 단계에서는 body를 optional로 받고 누락 시 UI에서 선택할 수 없는 `LEGACY_UNSPECIFIED`를 감사한다.
2. 새 프런트가 reason dialog와 body 전송을 배포한다.
3. legacy 누락 메트릭이 0임을 확인한 뒤 서버 enforcement를 켜고 `LEGACY_UNSPECIFIED` 수용 경로를 닫는다.

최종 완료 조건에는 3단계가 포함된다. compatibility 경로를 영구 정책으로 남기지 않는다.

## 9. revision 0 레거시 기준선

V39 이전 session에는 공개 요약과 live record 내용이 있지만 `session_record_revisions`가 없고 `liveRevision=0`일 수 있다. 이를 "적용본 없음"으로 취급하지 않는다.

정규화 규칙:

- 기존 `liveSnapshot`에 공개 요약 또는 적용된 record 내용이 있으면 `applied.exists=true`, `liveRevision=0`, source=`LEGACY_SNAPSHOT`인 유효 기준선이다.
- 게시 자격은 `liveRevision > 0`이 아니라 유효한 적용 snapshot과 비어 있지 않은 공개 요약으로 판단한다.
- overview와 `MeetingAfterPanel`은 `applied.exists`일 때 revision 숫자와 무관하게 같은 summary를 받는다.
- 최초 후속 save/apply는 `baseLiveRevision=0`에서 revision 1을 만든다.
- revision history는 새 revision 1부터 시작하며 가짜 revision 0 row를 만들지 않는다.
- DB backfill migration은 없다.

서버 read model이 이 의미를 정규화하고 프런트는 `liveRevision`을 다시 존재 판정으로 쓰지 않는다.

## 10. 접근 범위 의미와 카피

접근 상태는 기존 두 개를 유지한다.

| 값 | 앱에서 읽을 수 있는 독자 | 화면 문구 |
| --- | --- | --- |
| `HOST_ONLY` | host | `호스트만 보기` |
| `GUEST_READABLE` | 익명 게스트, viewer, member, host | `게스트와 멤버에게 보이기` |

`GUEST_READABLE`은 공개 사이트 게시와 다르다. 공개 사이트에는 기존처럼 `PUBLISHED + PUBLIC_RECORD`만 나간다. `site_visibility`와 호환 `visibility` dual-write 규칙은 유지한다.

`sessionExposureCopy`, 다음 책 목록, 새 모임 폼, 에디터, 확인 대화상자, 접근성 이름과 테스트 fixture에서 같은 문구와 의미를 사용한다. `게스트 공개`, `멤버에게 보이기`처럼 독자를 일부만 말하는 표현은 이 제어의 새 주 경로에서 제거한다.

접근 범위 mutation은 pessimistic UI다.

- 클릭한 session 행만 pending으로 만들고 다른 행은 계속 조작할 수 있다.
- 성공 응답 뒤 서버 값을 반영하고 관련 query를 invalidate한다.
- 실패하면 기존 값을 유지하고 해당 행에 `role="alert"` 오류와 재시도를 둔다.
- pending과 실패 뒤에도 키보드 초점은 해당 control 또는 오류의 재시도 버튼에 남는다.
- 알림 composer 같은 후속 작업은 scope 저장 성공 뒤에만 연다.

## 11. 일정 기본값과 온라인 모임 정보

### 11.1 자동 적용과 명시적 채택

다음 값은 제안으로 자동 적용한다.

- 시작·종료 시간
- 장소
- 질문 마감
- 접근 범위
- 기존 날짜 간격 정책이 계산한 다음 날짜

이전 온라인 모임 URL과 비밀번호는 자동 적용 또는 create request에 포함하지 않는다. 응답·view model에서 이를 `previousOnlineMeeting` 제안으로 분리하고 **「이전 온라인 모임 정보 사용」**을 눌러 review dialog에서 확인한 뒤에만 현재 폼에 채운다.

- 접힌 화면에는 비밀번호 원문을 표시하지 않는다.
- host가 명시적으로 채택한 뒤에도 create 전에는 수정·제거할 수 있다.
- 명시적 채택 여부는 폼 state로 추적하며 단순히 값이 존재한다는 이유로 request에 넣지 않는다.
- 로그, analytics, metric label, 오류 메시지에는 URL·비밀번호를 넣지 않는다.

wire contract를 additive하게 전환한다. 새 nested 제안을 추가하는 동안 기존 top-level 일정 필드는 구 프런트 호환을 위해 한 배포 구간 유지하지만 새 프런트는 이를 자동 값으로 읽지 않는다. 제거는 서버·프런트 adoption 뒤 별도 호환 검증을 거친다.

목표 응답 구조는 다음과 같다.

```json
{
  "automatic": {
    "startTime": "20:00",
    "endTime": "22:00",
    "locationLabel": "온라인",
    "suggestedDate": null,
    "questionDeadlineOffsetDays": 1,
    "accessScope": "HOST_ONLY"
  },
  "previousOnlineMeeting": {
    "meetingUrl": "https://meet.example.com/room",
    "meetingPasscode": "<meeting-passcode>"
  },
  "hints": []
}
```

2단계 서버는 기존 top-level 일정 필드도 deprecated 형태로 함께 반환한다. 3단계 새 프런트는 nested 구조만 사용한다. 5단계 adoption 확인 뒤 deprecated 필드를 제거하는 것이 이 설계의 최종 계약이다.

### 11.2 touched-field 보호

query가 늦게 끝나도 사용자가 수정한 필드를 덮지 않는다.

- 폼은 각 필드의 `touchedByUser`를 추적한다.
- 최초 성공 응답은 untouched 필드에만 적용한다.
- 재시도 성공도 같은 규칙을 따른다.
- 명시적 온라인 정보 채택은 URL·비밀번호에 대한 사용자 action으로 기록한다.
- 모임 하나 더 폼과 전체 새 모임 폼이 같은 pure resolver를 사용한다.

### 11.3 오류 분류

- endpoint가 없는 구버전 서버의 `404`만 `BUILTIN_SCHEDULE_DEFAULTS`로 조용히 대체한다.
- `401/403/5xx`와 transport 오류는 만들기를 막지 않지만 「기본 일정을 불러오지 못해 기본값을 사용합니다」 경고와 재시도를 보여 준다.
- 오류 상태에서도 builtin 시간·장소로 폼은 사용할 수 있다.
- Query의 모든 `isError`를 builtin으로 바꾸는 현재 catch-all 분기는 제거한다.

## 12. 주의 항목과 호스트 정보 구조

### 12.1 전체 건수와 정렬

기존 host session list의 `summary.needsAttentionCount`와 cursor page를 활용한다. 새 endpoint를 만들 필요는 없다.

- 홈은 `needsAttention=true&limit=1`로 최우선 1건과 전체 `needsAttentionCount`를 얻는다.
- 운영 허브는 같은 filter를 cursor로 끝까지 탐색할 수 있다.
- 프런트는 `CLOSED`만 남기는 재필터링을 하지 않는다. 서버 policy가 `PUBLISHED`를 주의 대상으로 판단하면 그대로 보여 준다.
- attention 정렬은 긴급도, 기한 또는 상태 발생 시각, session 식별자의 deterministic tie-break 순이다.
- 전체 count가 1보다 크면 「모두 보기」로 운영 허브에 연결한다.

우선순위 규칙은 pure server policy로 테스트하고 cursor fingerprint에 ordering version을 포함하거나 계약 변경 시 기존 cursor를 명확히 무효화한다.

### 12.2 화면 책임

호스트 홈:

- current session과 제한된 session 목록으로 canonical 모임을 고른다.
- 주의 전체 건수와 최우선 1건만 보여 준다.
- 활성 모임이 있으면 그 장부로 이동한다.
- 대시보드, 알림, 클럽 준비도 데이터를 가져오지 않는다.

모임 장부:

- 현재 보고 있는 session과 직접 관련된 alert만 보여 준다.
- 문제 설명, 다음 action과 deep link를 한 묶음으로 제공한다.
- club 전체의 알림·AI 운영 문제를 끼워 넣지 않는다.

호스트 운영 허브:

- 기존 host route 체계 아래 relative `operations` child를 scoped·unscoped variant 모두에 추가한다.
- 전체 attention 목록, AI 기본값, 클럽 준비도, 알림 상태를 각각 독립 카드로 제공한다.
- 알림 발송 상세는 기존 notifications route, 멤버 조치는 members route, 모임 문제는 해당 장부로 deep link한다.
- 새 generic SaaS dashboard를 만들지 않고 운영 장부의 차분한 시각 언어를 유지한다.

### 12.3 독립 실패 경계

운영 허브 route는 host auth를 먼저 보장한다. 각 카드 query는 독립 query key와 상태를 가지며 prefetch를 하더라도 `Promise.allSettled` 또는 동등한 경계를 사용한다.

- 한 카드 실패가 route error boundary 전체를 열지 않는다.
- 실패한 카드만 오류·재시도 상태를 보여 준다.
- 정상 카드의 stale data는 명확한 갱신 상태와 함께 계속 사용할 수 있다.
- 화면 이탈 시 아직 필요하지 않은 요청은 취소한다.

## 13. loader, redirect와 죽은 코드

`hostDashboardLoaderFactory`는 현재 6개 source를 한 번에 읽는다. 새 홈 loader는 host auth, current session, 제한 목록, attention limit 1만 다룬다. canonical 모임 결정은 loader에서 끝내 이동 뒤 버릴 query를 시작하지 않는다.

redirect helper는 가능한 경우 원래 `search`와 `hash`를 보존한다. canonical destination이 자체 section query를 요구하면 정의된 key만 병합하고 중복 또는 알 수 없는 내부 state는 버리지 않는다. scoped club 경로와 unscoped 경로를 같은 helper와 contract test로 검증한다.

기존 `HostDashboard` UI는 운영 허브로 실제 사용 기능을 옮긴 뒤에만 제거한다.

- AI 기본값, 알림 요약, 클럽 준비도에 도달 가능한 새 링크와 테스트가 먼저 있어야 한다.
- 더 이상 import되지 않는 dashboard helper, mobile variant, dead props와 loader field를 제거한다.
- server `HostDashboardController`가 운영 허브 query source로 쓰이면 유지한다. 소비자가 없어진 API만 별도 사용처 scan 뒤 제거한다.

## 14. 오류와 사용자 복구

서버 오류 분류:

| status | 의미 | 프런트 동작 |
| --- | --- | --- |
| `400` | 잘못된 전환, 사유 누락·형식 오류 | 해당 dialog에 수정 안내 |
| `401/403` | 인증·권한 문제 | 권한 오류를 빈 데이터로 바꾸지 않음 |
| `404` | resource 없음 | schedule-defaults 구버전 호환에서만 builtin fallback |
| `409` | 삭제 blocker, 상태·revision·동시성 충돌 | 최신 상태 재조회와 blocker/action 표시 |
| `5xx` | 서버·의존 시스템 장애 | 해당 카드·행·폼에서 재시도 |

읽기 요청만 bounded automatic retry를 허용한다. lifecycle, 삭제, 접근 범위처럼 상태를 바꾸는 요청은 사용자가 최신 상태를 확인한 뒤 명시적으로 재시도한다.

접근성 규칙:

- pending은 `role="status"` 또는 의미가 같은 live region으로 알린다.
- 실패는 작업 범위 안의 `role="alert"`로 제공한다.
- dialog 오류 뒤 focus를 닫기 버튼으로 날리지 않는다.
- 상태는 색만으로 표현하지 않고 텍스트와 아이콘을 함께 쓴다.
- 모바일에서도 오류와 재시도 control이 해당 행 바로 다음에 온다.

## 15. 보안, 관측성과 비용 경계

### 15.1 보안과 개인정보

- 모든 host endpoint는 기존 BFF secret, session cookie, active membership과 host role 경계를 유지한다.
- 이전 온라인 모임 정보는 권한 확인 뒤에만 반환한다.
- 감사 reason note는 제어 문자를 거부하고 길이를 제한한다.
- 로그·감사·메트릭에 meeting passcode, notification body, recipient address를 기록하지 않는다.
- 공개·게스트 read model은 `GUEST_READABLE`과 `PUBLIC_RECORD`를 혼동하지 않는다.

### 15.2 구조화 로그와 메트릭

구조화 로그는 `requestId`, action, outcome과 필요한 내부 식별자를 기록하되 사용자 콘텐츠는 기록하지 않는다.

낮은 카디널리티 메트릭:

- `session_deletion_blocked_total{blocker}`
- `session_lifecycle_transition_total{action,outcome}`
- `session_lifecycle_legacy_reason_total`
- `host_schedule_defaults_total{outcome}`
- `host_operations_card_load_total{card,outcome}`
- `host_operations_card_load_duration`
- `host_attention_result_size` histogram 또는 summary

club ID, session ID, membership ID, reason note는 label로 쓰지 않는다. 온라인 비밀번호의 존재 여부도 metric label로 만들지 않는다.

AI provider 호출·비용 정책은 이번 범위 밖이다. 다만 session 삭제 cleanup이 AI 작업의 독립 운영·비용 감사 증거까지 제거하지 않는지 테이블별로 확인한다. 삭제 가능한 임시 draft와 provider/job 감사 기록을 같은 것으로 취급하지 않는다.

## 16. 주요 데이터 흐름

### 16.1 삭제

```text
UI preview
  → controller
  → lifecycle application service
  → DeletionPolicy + blocker port
  → canDelete/blockers/counts

UI confirm
  → lock session
  → policy 재평가
  → lifecycle audit DELETED
  → 허용 row + session delete
  → after-commit cache invalidation
```

### 16.2 역방향 전환

```text
reason dialog
  → reverse command(reasonCode, reasonNote)
  → host/state/reason 검증
  → state update + lifecycle audit in one transaction
  → after-commit cache invalidation
  → detail/history/attention query invalidation
```

### 16.3 일정 기본값

```text
host-only defaults query
  → typed outcome(200 / legacy 404 / visible error)
  → untouched automatic fields만 merge
  → previousOnlineMeeting은 보관만 함
  → explicit review/confirm
  → URL/passcode를 current form에 채움
  → create request
```

### 16.4 호스트 홈과 운영 허브

```text
home loader
  → auth + current + list + attention(limit 1)
  → canonical meeting redirect 또는 empty ledger

operations route
  → auth
  → independent attention / AI defaults / readiness / notification queries
  → card-local success/error/retry
```

## 17. migration과 배포

### 17.1 migration

- 구현 직전 최신 번호를 다시 확인하고 현재 기준 V49를 사용한다.
- lifecycle audit table과 필요한 check/index만 추가한다.
- `liveSnapshot` 또는 revision backfill은 없다.
- migration은 기존 V39·V45·V48을 수정하지 않는 forward-only 파일이다.
- `MySqlFlywayMigrationTest`에서 clean migrate와 기존 주요 fixture 상태를 검증한다.

### 17.2 순차 배포

1. additive migration 배포
2. 구 프런트와 호환되는 서버 계약 배포: blocker fields, revision 0 normalization, optional reverse reason compatibility, additive schedule defaults shape
3. 새 프런트 배포: reason dialog, 명시적 온라인 정보 채택, 오류 상태, attention·운영 허브
4. legacy reverse 요청이 0인지 확인하고 reason enforcement 활성화
5. 호환 top-level schedule fields와 dead dashboard 사용처를 확인한 뒤 계획된 cleanup 수행

애플리케이션 rollback 시 additive table은 남아 있어도 구버전 코드 실행을 막지 않는다. enforcement는 프런트 adoption 확인 전 켜지 않는다.

## 18. 테스트와 인수 증거

### 18.1 서버 unit·contract

- blocker 여섯 종류별 preview와 delete 일치
- blocker 복수 존재 시 안정적인 code·count와 민감 데이터 비노출
- `DRAFT`, `OPEN` 허용 및 다른 상태 거절
- preview 뒤 durable effect가 생기는 race에서 delete `409`
- delete와 outbox producer 경합에서 orphan 없음
- FK/DataIntegrityViolation이 generic 500이 아닌 conflict 계약으로 매핑
- forward·reverse 전환별 정확히 한 감사 row
- unchanged·실패 transition은 감사 row 없음
- reverse reason 누락·잘못된 code·긴 note 거절
- 상태 update 또는 audit insert 실패 시 전체 rollback
- 삭제 뒤 lifecycle audit 보존
- request ID 저장과 민감 데이터 비저장
- revision 0 snapshot의 `applied.exists=true`, 게시 가능, 최초 apply revision 1
- `GUEST_READABLE` 익명 게스트·viewer·member·host 접근과 public-site 비노출
- attention에 `CLOSED`와 `PUBLISHED` 포함, 전체 count, deterministic ordering, cursor
- schedule defaults가 club을 넘지 않고 자동 값과 previous online info를 구분

### 18.2 프런트 model·route·UI

- `GUEST_READABLE` 문구가 승인 문구로 통일됨
- 접근 범위 mutation이 행 단위 pending·성공 후 반영·실패 유지·재시도를 제공
- schedule 404와 401/403/5xx를 구분
- 늦은 응답과 재시도가 touched field를 덮지 않음
- 명시적 채택 전 URL·비밀번호가 create request에 없음
- revision 0 적용본 summary가 publish panel에 전달됨
- 홈이 attention count와 최우선 1건을 보여 주며 상태 재필터링 없음
- operations 카드 하나의 실패가 다른 카드를 막지 않음
- active meeting redirect 전에 불필요한 dashboard query를 시작하지 않음
- scoped·unscoped redirect가 search·hash를 보존
- reverse reason dialog의 validation, focus와 mobile layout

### 18.3 integration·E2E

- manual dispatch, event outbox, delivery, member notification fixture 각각의 삭제 거절
- revision 0 레거시 fixture 게시와 후속 revision 1
- 게시 취소·재개방·초안 복귀 reason과 history 노출
- 이전 온라인 정보 검토·채택·제거 후 create
- attention 4건 이상과 `PUBLISHED` 항목을 홈 1건·운영 허브 전체로 확인
- 접근 범위 실패 응답에서 UI rollback이 아니라 기존 서버 값 유지
- 익명 게스트, viewer, member, host의 접근·공개 사이트 경계

### 18.4 검증 명령

구현 중에는 각 slice의 focused test를 먼저 실행하고 최종적으로 다음을 실행한다.

```bash
python3 scripts/agent-preflight.py --intent change --paths '<comma-separated-changed-paths>'
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:coverage
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

실행하지 못한 검사는 통과로 간주하지 않고 명령과 이유, 잔여 위험을 기록한다.

## 19. 구현 슬라이스

한 spec을 다음 순서로 실행한다. 각 slice는 실패 테스트에서 시작하고 구 계약을 깨지 않는 상태로 끝낸다.

1. **계약 테스트와 error taxonomy** — 삭제 blocker, reverse reason, revision 0, schedule error, attention 정렬을 실패 테스트로 고정
2. **서버 무결성과 감사** — migration, lifecycle audit, 공통 DeletionPolicy, producer lock, HTTP conflict mapping
3. **레거시 record 호환** — revision 0 read model·publish·first apply
4. **폼과 mutation 회복성** — 접근 카피, 행 단위 scope mutation, schedule explicit adoption, touched-field merge
5. **attention과 운영 허브** — 홈 요약, contextual alert, operations route와 독립 query
6. **loader·redirect·죽은 코드 정리** — minimal home loader, query/hash 보존, 기능 이관 뒤 dashboard cleanup
7. **전체 회귀와 release readiness** — acceptance matrix, E2E, public release, CHANGELOG/Unreleased와 잔여 위험 검토

## 20. 예상 구현 표면

구체적인 파일 단위 작업은 승인 뒤 writing plan에서 다시 확인한다. 현재 source 기준 주요 표면은 다음과 같다.

서버:

- `session/application/service/HostSessionLifecycleService.kt`
- `session/adapter/out/persistence/HostSessionDeletionQueries.kt`
- `session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt`
- `session/adapter/out/persistence/HostSessionQueries.kt`
- `session/adapter/in/web/HostSessionController.kt`
- notification의 session aggregate outbox·manual dispatch writer
- session record read/apply service와 web DTO
- `server/src/main/resources/db/mysql/migration/V49__*.sql`

프런트:

- `features/host/route/host-dashboard-data.ts`
- `features/host/route/host-dashboard-route.tsx`
- `features/host/route/host-meeting-ledger-route.tsx`
- `features/host/model/host-schedule-defaults-model.ts`
- `features/host/model/session-exposure-model.ts`
- `features/host/queries/host-session-queries.ts`
- meeting ledger, upcoming book, exposure control, lifecycle dialog UI
- `src/app/routes/host.tsx`와 scoped route 구성

관련 source·test 이름은 구현 직전 `project-map`, vertical slice checklist, package-local `AGENTS.md`와 `scripts/agent-preflight.py`로 재분류한다.

## 21. 잔여 위험과 명시적 후속

- generalized outbox는 session FK를 직접 갖지 않는다. producer lock protocol을 누락한 writer가 없는지 전체 enqueue 사용처 scan이 필요하다.
- lifecycle audit의 FK를 의도적으로 두지 않는 결정은 증거 보존을 위한 것이다. club 폐기·보존 기간 정책이 생기면 별도 retention 설계가 필요하다.
- 혼합 배포 compatibility를 닫지 않으면 `LEGACY_UNSPECIFIED`가 영구 우회로가 된다. enforcement 활성화가 출시 완료 조건이다.
- schedule top-level 일정 호환 필드를 제거하는 시점은 실제 클라이언트 adoption 증거가 필요하다.
- operations hub가 기존 dashboard API를 계속 쓰면 API 자체는 죽은 코드가 아니다. 프런트 소비자와 server endpoint를 별도로 판정한다.
- attention urgency 정의가 제품 기한 정보보다 약하면 단순 상태·수정 시각 정렬이 될 수 있다. writing plan에서 현재 read model이 가진 시간 근거를 확인하고 테스트 가능한 규칙으로 고정한다.

이 잔여 위험은 구현 범위를 줄이기 위한 면책이 아니다. 각 항목은 writing plan의 조사 또는 acceptance task로 추적한다.
