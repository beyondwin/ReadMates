# ReadMates 수동 알림 발송 스펙 갭 완료 설계

작성일: 2026-05-13
상태: READY FOR IMPLEMENTATION
기준 커밋: `272e6a5 feat: add manual notification dispatch`
대상 표면: notification server slice, 호스트 알림 운영, 세션 편집, 멤버 알림함, E2E 검증

## 1. 배경

`272e6a5`는 수동 알림 발송의 핵심 경로를 구현했다. 서버는 `notification_manual_dispatch_previews`, `notification_manual_dispatches`를 추가했고, 호스트는 `/api/host/notifications/manual/options`, `/preview`, `/manual`로 세 가지 템플릿을 미리보고 발송할 수 있다. 발송 이벤트는 기존 `notification_event_outbox`와 delivery planning 경로를 탄다. 프런트엔드는 `/app/host/notifications`에 수동 발송 작업대를 추가했고, 세션 편집 화면에서 알림 발송 화면으로 이동하는 빠른 링크를 제공한다.

하지만 원 설계 문서의 모든 문장이 닫힌 상태는 아니다. 남은 차이는 운영 감사 UI, 큰 클럽용 대상 검색/페이지네이션, 세션 편집의 이미 발송 상태, 모바일 작업 흐름, 멤버 알림 row 상호작용, cross-club membership validation, 그리고 통합 E2E 깊이다. 이 문서는 남은 스펙 갭을 별도 후속 범위로 고정한다.

## 2. 목표

- 호스트 알림 운영 페이지에서 최근 수동 발송 기록을 별도 섹션으로 보여준다.
- 기존 이벤트 장부에서도 자동/수동 source와 수동 발송 감사 metadata를 확인할 수 있게 한다.
- 수동 발송 대상 멤버 목록에 이름/이메일 검색과 cursor pagination을 제공한다.
- 세션 편집 화면에서 템플릿별 이미 발송 여부를 badge로 보여주고, 재발송은 알림 발송 화면으로 안내한다.
- `SESSION_REMINDER_DUE` 작업대에서 세션 날짜와 오늘 기준 차이를 표시한다.
- 포함/제외 membership id가 현재 club의 active membership이 아니면 서버가 `403 MEMBERSHIP_NOT_ALLOWED`로 거절한다.
- 멤버 알림함 row 전체를 이동 대상처럼 동작하게 하되, 별도 읽음 버튼의 조작성을 유지한다.
- 모바일에서 수동 발송 작업대를 단계형 section으로 정리하고 멤버 선택은 full-width panel로 분리한다.
- preview -> confirm -> member inbox, email opt-out skip, duplicate resend를 통합/E2E 수준에서 검증한다.

## 3. 비목표

- 예약 발송, 예약 취소, 자동 발송 규칙 관리.
- 호스트가 제목/본문을 직접 쓰는 기능.
- `REVIEW_PUBLISHED` 수동 발송 추가.
- SMS, Kakao, web push, digest mode, quiet hours.
- 이미 성공한 개별 delivery를 강제로 다시 보내는 기능.
- 기존 notification pipeline 구조 변경 또는 Kafka 대체.
- 실제 이메일 원문, 원문 수신자 이메일, feedback document body를 호스트 UI나 문서에 노출하는 것.

## 4. 남은 스펙 갭

| Gap | 현재 상태 | 완료 조건 |
| --- | --- | --- |
| G1 최근 수동 발송 UI | preview 중복 경고 안에서만 최근 발송 일부를 볼 수 있다. | `/app/host/notifications`가 최근 수동 발송 row를 별도 섹션으로 보여준다. |
| G2 운영 장부 source/audit | manual audit row는 DB에 있지만 이벤트 장부 응답과 UI에 source/requestedChannels/audience/resend가 없다. | 이벤트 장부 row가 자동/수동 source, 요청자, 대상 그룹, 요청 채널, 대상 수, 재발송 여부를 표시한다. |
| G3 대상 검색/페이지네이션 | options API는 cursor를 받지만 UI가 검색/더 보기를 쓰지 않는다. 서버 검색 query도 없다. | 멤버 선택 목록에서 검색, 더 보기, 검색 초기화가 동작한다. |
| G4 세션 편집 이미 발송 badge | 세션 편집은 가능/불가능 링크만 보여준다. | 템플릿별 마지막 발송 시각과 이미 발송 badge를 보여준다. |
| G5 리마인더 날짜 안내 | 리마인더 템플릿이 세션 날짜와 오늘 차이를 보여주지 않는다. | 작업대가 "D-n", "오늘", "지난 날짜" 같은 짧은 날짜 hint를 표시한다. |
| G6 strict membership validation | 포함 id는 active membership만 반영되고, out-of-scope id가 조용히 무시될 수 있다. 제외 id도 base group 밖이면 명시 오류가 아니다. | 포함/제외 id가 현재 club active membership이 아니면 preview/confirm 모두 `MEMBERSHIP_NOT_ALLOWED`를 반환한다. |
| G7 멤버 알림 row 전체 링크 | 제목 link만 이동 대상이고 article 전체가 link처럼 동작하지 않는다. | row 본문 영역 전체가 open notification handler를 호출하고, 읽음 버튼 클릭은 이동을 일으키지 않는다. |
| G8 모바일 단계형 UI | 현재는 responsive wrapping 중심이다. | 모바일에서 템플릿/세션/대상/채널/멤버 선택이 단계형 section으로 읽힌다. |
| G9 통합 E2E 깊이 | smoke는 작업대 렌더링만 확인한다. | confirm 후 member inbox 생성, email preference skip, duplicate resend guard를 자동 검증한다. |

## 5. API 설계

### 5.1 수동 발송 options 확장

`GET /api/host/notifications/manual/options?sessionId={sessionId}&search={query}&limit={limit}&cursor={cursor}`

기존 response에 `session`과 `recentDispatches`를 추가한다. `sessionId`가 없으면 `session`은 `null`이고 `recentDispatches`는 최근 전체 수동 발송 기준으로 반환한다.

```json
{
  "session": {
    "sessionId": "<session-id>",
    "sessionNumber": 8,
    "bookTitle": "Example Book",
    "date": "2026-05-20",
    "state": "OPEN",
    "visibility": "MEMBER",
    "feedbackDocumentUploaded": true
  },
  "templates": [],
  "members": {
    "items": [],
    "nextCursor": null
  },
  "recentDispatches": [
    {
      "manualDispatchId": "<manual-dispatch-id>",
      "eventId": "<event-id>",
      "source": "MANUAL",
      "eventType": "SESSION_REMINDER_DUE",
      "sessionId": "<session-id>",
      "sessionNumber": 8,
      "bookTitle": "Example Book",
      "requestedChannels": "BOTH",
      "audience": "ALL_ACTIVE_MEMBERS",
      "resend": false,
      "requestedBy": "h***@example.com",
      "targetCount": 17,
      "expectedInAppCount": 17,
      "expectedEmailCount": 14,
      "eventStatus": "PUBLISHED",
      "createdAt": "2026-05-13T10:10:00Z"
    }
  ]
}
```

`search`는 display name, account name, email을 대상으로 club scope 안에서만 처리한다. 응답에는 기존처럼 masked email만 들어간다. 검색어는 로그, metric label, audit metadata에 저장하지 않는다.

### 5.2 수동 발송 목록 조회

`GET /api/host/notifications/manual/dispatches?sessionId={sessionId}&eventType={eventType}&limit={limit}&cursor={cursor}`

호스트 알림 운영 페이지와 세션 편집 loader가 공유한다. `sessionId`와 `eventType`은 선택 필터다. response는 `recentDispatches` 항목과 같은 row를 `PagedResponse`로 감싼다.

```json
{
  "items": [
    {
      "manualDispatchId": "<manual-dispatch-id>",
      "eventId": "<event-id>",
      "source": "MANUAL",
      "eventType": "NEXT_BOOK_PUBLISHED",
      "sessionId": "<session-id>",
      "sessionNumber": 8,
      "bookTitle": "Example Book",
      "requestedChannels": "BOTH",
      "audience": "ALL_ACTIVE_MEMBERS",
      "resend": true,
      "requestedBy": "h***@example.com",
      "targetCount": 18,
      "expectedInAppCount": 18,
      "expectedEmailCount": 15,
      "eventStatus": "PENDING",
      "createdAt": "2026-05-13T10:10:00Z"
    }
  ],
  "nextCursor": null
}
```

### 5.3 이벤트 장부 확장

`GET /api/host/notifications/events`의 item에 아래 optional fields를 추가한다.

```json
{
  "id": "<event-id>",
  "eventType": "SESSION_REMINDER_DUE",
  "status": "PUBLISHED",
  "attemptCount": 1,
  "source": "MANUAL",
  "manualDispatch": {
    "manualDispatchId": "<manual-dispatch-id>",
    "requestedChannels": "BOTH",
    "audience": "ALL_ACTIVE_MEMBERS",
    "resend": false,
    "requestedBy": "h***@example.com",
    "targetCount": 17,
    "expectedInAppCount": 17,
    "expectedEmailCount": 14
  },
  "createdAt": "2026-05-13T10:10:00Z",
  "updatedAt": "2026-05-13T10:10:00Z"
}
```

자동 이벤트는 `source: "AUTOMATIC"`과 `manualDispatch: null`을 반환한다. 기존 클라이언트가 새 필드를 무시할 수 있도록 additive contract로만 변경한다.

### 5.4 오류 계약

서버는 기존 public-safe 오류 shape를 유지한다.

| Code | Status | 상황 |
| --- | --- | --- |
| `MEMBERSHIP_NOT_ALLOWED` | 403 | 포함/제외 id가 현재 club active membership이 아님 |
| `MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE` | 409 | 세션 상태, 공개 범위, feedback document 조건 불충족 |
| `MANUAL_NOTIFICATION_AUDIENCE_EMPTY` | 422 | 최종 대상이 없음 |
| `DUPLICATE_NOTIFICATION_DISPATCH` | 409 | 재발송 확인 없는 중복 confirm |
| `MANUAL_NOTIFICATION_PREVIEW_EXPIRED` | 409 | preview 만료 또는 selection hash 불일치 |

`MEMBERSHIP_NOT_ALLOWED`는 preview와 confirm 모두에서 같은 selection에 대해 같은 결과를 내야 한다. 클라이언트가 보낸 id 목록 중 어느 id가 문제인지 response에 노출하지 않는다.

## 6. 서버 동작

### 6.1 Manual dispatch query model

서버 application model에 `ManualNotificationSessionSummary`, `ManualNotificationDispatchListItem`, `ManualNotificationDispatchList`를 추가한다. 기존 `ManualNotificationRecentDispatch`는 dispatch list item을 재사용하거나 같은 필드로 확장한다. Host UI에 필요한 값은 `notification_manual_dispatches`, `notification_event_outbox`, `sessions`, `memberships`, `users` join으로 계산한다.

### 6.2 Search cursor

멤버 목록 cursor는 `displayName`만으로는 동명이인에서 불안정하다. 새 cursor는 아래 값을 포함한다.

```json
{
  "displayName": "김리더",
  "membershipId": "<membership-id>"
}
```

정렬은 `display_name asc, memberships.id asc`다. cursor predicate는 `display_name > cursor.displayName or (display_name = cursor.displayName and memberships.id > cursor.membershipId)`로 둔다.

### 6.3 Strict membership validation

`previewTargets` 또는 그 앞 단계에서 included/excluded 전체 id를 검증한다.

- 빈 목록은 통과한다.
- 중복 id는 set으로 정규화하되, count는 정규화된 id 기준으로 계산한다.
- 모든 id는 `memberships.club_id = host.club_id`이고 `memberships.status = 'ACTIVE'`여야 한다.
- 이 조건을 만족하지 않는 id가 하나라도 있으면 `MEMBERSHIP_NOT_ALLOWED`를 던진다.
- excluded id가 base group에 속하지 않는 것은 허용한다. 단, current club active membership이어야 한다. 이렇게 해야 호스트가 대상 그룹을 바꾸는 도중 선택 상태를 유지할 수 있다.
- included id는 current club active membership이면 허용한다. template-specific eligibility는 최종 target 계산과 delivery planning에서 다시 적용한다.

## 7. 호스트 UI 설계

### 7.1 최근 수동 발송

`/app/host/notifications`의 수동 발송 작업대 아래, 운영 장부 위에 "최근 수동 발송" section을 둔다. 각 row는 아래 정보를 표시한다.

- 템플릿 label
- 세션 회차와 책 제목
- 요청 채널: 앱, 이메일, 앱+이메일
- 대상 그룹과 최종 대상 수
- 예상 앱/이메일 수
- 요청자 masked email
- 이벤트 상태 badge
- 재발송 badge
- 생성 시각

row는 반복 item이므로 얕은 bordered row를 사용한다. page section을 card 안의 card로 중첩하지 않는다.

### 7.2 이벤트 장부 source 표시

기존 `NotificationEventLedger`는 이벤트명과 상태만 보여준다. 확장 후에는 title 옆에 `자동` 또는 `수동` badge를 붙이고, 수동 이벤트는 두 번째 줄에 `앱+이메일 · 전체 활성 멤버 · 17명 · 요청 h***@example.com`처럼 요약한다. 자동 이벤트는 기존 정보 밀도를 유지한다.

### 7.3 멤버 선택 검색과 더 보기

수동 발송 작업대의 멤버 선택 section은 다음 controls를 가진다.

- 검색 input: placeholder는 `이름 또는 이메일 검색`.
- 검색 초기화 버튼: 검색어가 있을 때만 보인다.
- 더 보기 버튼: `members.nextCursor`가 있을 때만 보인다.
- 검색 중/추가 로딩 중 상태: 버튼 disabled와 짧은 status text.

검색어 변경은 즉시 API 호출하지 않고 submit 또는 300ms debounce 중 하나를 사용한다. 첫 구현은 form submit을 선택한다. 이유는 운영 화면에서 예측 가능한 요청 타이밍이 더 중요하고, 검색어를 로그에 남기지 않는 정책을 단순하게 유지할 수 있기 때문이다.

### 7.4 모바일 단계형 작업대

모바일 viewport에서는 작업대를 아래 section 순서로 보여준다.

1. 템플릿
2. 세션
3. 대상 그룹
4. 채널
5. 멤버 조정
6. 미리보기와 발송 확인

각 section은 `h3`와 controls를 가진 문서 흐름이다. 접기/펼치기 상태는 첫 구현에서 필수는 아니다. 멤버 조정은 작업대 안의 nested card가 아니라 full-width panel처럼 보이게 구분선과 배경만 사용한다. 버튼은 한 줄에 들어가지 않으면 자연스럽게 줄바꿈한다.

## 8. 세션 편집 UI 설계

세션 편집 loader는 session detail과 수동 발송 목록을 함께 가져온다.

```ts
type HostSessionEditorRouteData = {
  session: HostSessionDetailResponse;
  notificationDispatches: ManualNotificationDispatchListResponse;
};
```

`HostSessionNotificationActions`는 템플릿별 마지막 dispatch를 받아 아래 상태를 표시한다.

- 발송된 적이 없으면 기존 빠른 발송 link.
- 발송된 적이 있으면 `이미 발송됨` badge와 마지막 발송 시각.
- 재발송 link text는 `재발송 검토`로 둔다.
- disabled template은 기존 disabled reason을 유지한다.

세션 편집 화면에서 confirm은 하지 않는다. 모든 재발송은 `/app/host/notifications?sessionId=...&eventType=...`에서 preview와 duplicate warning을 거친다.

## 9. 멤버 알림함 UI 설계

멤버 알림 row는 article 전체가 open affordance로 읽혀야 한다. 구현은 다음 조건을 만족한다.

- 제목뿐 아니라 본문 영역 click도 같은 `href`로 이동한다.
- unread row에서 open action은 먼저 `onOpenNotification(id, href)`를 호출한다.
- read row는 일반 navigation으로 동작한다.
- 별도 `읽음` 버튼은 `event.stopPropagation()` 또는 별도 button 영역으로 row open과 충돌하지 않는다.
- keyboard 사용자는 제목 link와 읽음 button에 각각 focus할 수 있다.
- invalid deep link는 기존 `notificationHref`와 `scopedAppLinkTarget` fallback을 유지한다.

## 10. 테스트 전략

서버:

- options API가 `search`와 stable cursor를 적용한다.
- dispatch list API가 masked requester, source, requested channels, audience, resend, expected counts를 반환한다.
- host event ledger API가 자동/수동 source를 additive field로 반환한다.
- out-of-club, inactive, unknown membership id가 포함/제외에 들어오면 preview/confirm 모두 `403 MEMBERSHIP_NOT_ALLOWED`를 반환한다.
- 세션 context response가 session date를 반환한다.

프런트엔드:

- host notifications page가 최근 수동 발송 section과 event source badge를 렌더링한다.
- 멤버 검색 submit이 options API를 다시 호출하고 더 보기가 목록을 append한다.
- 세션 편집 화면이 이미 발송 badge와 재발송 link를 보여준다.
- member notification row 본문 click과 읽음 버튼 click이 서로 다른 action을 일으킨다.
- 모바일 viewport에서 작업대 controls가 overflow 없이 단계 순서로 보인다.

통합/E2E:

- 호스트가 수동 리마인더를 preview/confirm한 뒤 대상 멤버 알림함에서 같은 알림을 본다.
- 이메일 opt-out 멤버는 `BOTH` 요청에서도 email delivery가 `SKIPPED` 또는 expected email count 제외로 처리된다.
- 같은 세션/템플릿을 다시 preview하면 duplicate warning이 보이고, confirm은 재발송 확인 전에는 막힌다.

## 11. 릴리스 관점

이 후속 범위는 이미 추가된 DB table과 핵심 수동 발송 경로 위에 additive API/UI를 얹는다. 추가 migration은 필요하지 않다. 단, 이벤트 장부 API response shape가 additive로 확장되므로 frontend contract와 server DTO test를 함께 갱신해야 한다.

운영 위험은 실제 이메일 side effect보다 감사/표시 누락에 가깝다. confirm은 이미 outbox 생성까지만 보장하고 SMTP 실패는 delivery ledger에서 다룬다. 후속 구현은 호스트가 누가, 언제, 어떤 채널로, 몇 명에게 요청했는지를 화면에서 확인할 수 있게 만들어 release readiness를 높인다.

## 12. 승인 기준

- `/app/host/notifications`에서 수동 발송 작업대, 최근 수동 발송, 운영 장부가 순서대로 보인다.
- 최근 수동 발송과 이벤트 장부는 수동/자동 source, 요청자, 요청 채널, 대상 그룹, target count, resend 여부를 감사 가능한 수준으로 보여준다.
- 큰 클럽에서도 멤버 검색과 더 보기로 대상 제외/추가를 계속 조정할 수 있다.
- 세션 편집 화면에서 이미 보낸 템플릿은 badge로 구분되고, 재발송은 알림 발송 화면에서만 진행된다.
- out-of-scope membership id는 조용히 무시되지 않고 public-safe 403으로 거절된다.
- 멤버 알림 row는 전체 본문 영역이 이동 affordance로 동작하고 읽음 버튼과 충돌하지 않는다.
- desktop/mobile viewport에서 텍스트 overflow, 버튼 overlap, card nesting이 없다.
- 서버, 프런트 unit, build, E2E 검증이 통과한다.
