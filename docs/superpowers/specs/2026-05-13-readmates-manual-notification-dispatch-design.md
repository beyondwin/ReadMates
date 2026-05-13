# ReadMates 수동 알림 발송과 알림 UI 재설계

작성일: 2026-05-13
상태: DRAFT DESIGN SPEC
대상 표면: 호스트 알림 운영, 세션 편집, 멤버 알림함, notification server slice

## 1. 배경

ReadMates의 알림 시스템은 현재 도메인 이벤트를 `notification_event_outbox`에 기록하고, Kafka relay/consumer가 `notification_deliveries`와 `member_notifications`를 만드는 구조다. 이메일 발송은 `notification_deliveries`의 `EMAIL` row를 기준으로 재시도 가능하게 처리하고, 인앱 알림은 `member_notifications`가 멤버 알림함의 source of truth다.

현재 자동 이벤트와 운영 장부는 존재하지만 호스트가 실제 운영 중 필요한 시점에 특정 세션 알림을 직접 보낼 수 있는 작업 흐름이 없다. 특히 다음 책 공개, 모임 전날 리마인더, 피드백 문서 등록 알림은 자동 이벤트 또는 장부 상태로만 드러나고, 호스트가 채널과 대상을 확인한 뒤 수동 발송하는 메뉴가 없다. `/app/host/notifications`는 Kafka 이벤트와 배송 장부 중심이라 "지금 새 알림을 보낸다"는 목적이 첫 화면에서 보이지 않는다. `/app/notifications` 멤버 알림함도 읽음/안읽음과 이동 목적지는 제공하지만 알림 종류와 행동 우선순위가 충분히 분명하지 않다.

이번 설계는 수동 발송을 기존 notification pipeline 안에 넣고, 호스트와 멤버 알림 화면을 ReadMates의 조용하고 운영적인 톤에 맞게 재정렬한다.

## 2. 목표

- 호스트가 수동으로 알림을 발송할 수 있는 작업대를 `/app/host/notifications` 첫 화면에 제공한다.
- 세션 편집 화면에서 해당 회차에 맞는 빠른 발송 진입점을 제공한다.
- 1차 수동 템플릿은 `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED` 세 가지로 제한한다.
- 호스트가 요청 채널을 `IN_APP`, `EMAIL`, `BOTH` 중 매번 선택할 수 있게 한다. 기본값은 `BOTH`다.
- 이메일은 호스트가 선택해도 멤버의 이메일 알림 preference와 이벤트별 preference를 통과한 대상에게만 발송한다.
- 대상 선택은 "기본 그룹 선택 후 개별 제외/추가" 방식으로 제공한다.
- 발송 전 preview에서 예상 앱 알림 수, 예상 이메일 수, preference로 제외되는 이메일 수, 대상 breakdown, 최근 동일 세션/템플릿 발송 기록을 보여준다.
- 같은 club/session/template에 이미 보낸 기록이 있으면 기본 차단하고, 호스트가 재발송을 명시 확인한 경우에만 새 수동 발송 이벤트를 만든다.
- 멤버 알림함은 자동/수동 여부를 노출하지 않고 같은 제품 알림으로 보여준다.
- 호스트 장부에는 수동/자동 source, 요청자, 요청 채널, 대상 그룹, 재발송 여부를 감사 가능한 수준으로 남긴다.
- 데스크톱과 모바일에서 외곽선이 겹쳐 보이지 않도록 카드 중첩을 줄이고, 화면 구조를 full-width section과 얕은 panel 중심으로 재설계한다.
- 1차 구현은 즉시 발송만 지원하되, request model과 outbox metadata는 나중에 예약 발송과 자동 규칙 관리로 확장 가능하게 둔다.

## 3. 비목표

- 예약 발송 UI, 예약 취소, 자동 발송 규칙 관리.
- 호스트가 제목이나 본문을 직접 작성하는 기능.
- `REVIEW_PUBLISHED` 수동 발송.
- SMS, Kakao, web push, Slack, digest mode, quiet hours.
- 이미 성공한 개별 delivery를 강제로 재발송하는 기능.
- 원문 이메일, 원문 알림 본문, private feedback 문서 내용의 호스트 API 노출.
- 멤버에게 "호스트가 수동으로 보낸 알림"이라는 별도 표시를 보여주는 것.

## 4. 핵심 결정

### 4.1 기존 이벤트 파이프라인을 확장한다

수동 발송은 별도 메일 발송기가 아니라 `notification_event_outbox`에 기록되는 도메인 이벤트다. 자동 이벤트와 같은 Kafka relay/consumer, delivery planning, email delivery engine, member inbox path를 사용한다. 이 결정으로 이메일 preference, retry, `SKIPPED` 처리, host delivery ledger, in-app inbox가 한 경로에서 유지된다.

### 4.2 수동 발송은 preview와 confirm을 분리한다

호스트 UI는 발송 전 반드시 preview API를 호출한다. preview는 실제 이벤트를 만들지 않고 대상과 채널 결과를 계산한다. confirm API는 preview에서 계산한 조건을 다시 서버에서 검증한 뒤 outbox event를 기록한다. 클라이언트가 보낸 대상 수나 email eligibility count는 신뢰하지 않는다.

### 4.3 수동/자동 구분은 host 운영 표면에만 노출한다

멤버는 같은 템플릿 제목과 본문을 받는다. `source=MANUAL` 여부, 요청자, 요청 채널, 대상 그룹은 host 장부와 server audit metadata에만 남긴다.

### 4.4 중복은 기본 차단, 재발송은 명시 기록한다

같은 club/session/template 조합에 이미 발송 기록이 있으면 confirm은 기본적으로 거절한다. preview는 이전 발송 시각, source, 요청 채널, 대상 요약을 보여준다. 호스트가 재발송 확인을 켜면 새 `manualDispatchId`와 `resend=true` metadata를 가진 별도 event를 생성한다.

## 5. 수동 발송 템플릿

| 템플릿 | 이벤트 타입 | 필수 세션 상태 | 기본 대상 그룹 | 기본 요청 채널 | 멤버 알림 deep link |
| --- | --- | --- | --- | --- | --- |
| 다음 책 공개 | `NEXT_BOOK_PUBLISHED` | `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED` 중 멤버에게 보이는 세션 | 전체 활성 멤버 | `BOTH` | 해당 세션 또는 현재 세션 화면 |
| 모임 전날 리마인더 | `SESSION_REMINDER_DUE` | `DRAFT` 또는 `OPEN`이며 날짜가 존재하는 세션 | 전체 활성 멤버 | `BOTH` | 해당 세션 또는 현재 세션 화면 |
| 피드백 문서 등록 | `FEEDBACK_DOCUMENT_PUBLISHED` | 피드백 문서가 업로드된 세션 | 해당 세션 참석 확정자 | `BOTH` | 해당 피드백 문서 |

`NEXT_BOOK_PUBLISHED`는 세션 공개 범위가 `MEMBER` 또는 `PUBLIC`일 때만 발송 가능하다. `SESSION_REMINDER_DUE`는 호스트가 수동 발송하는 경우 실제 날짜가 반드시 내일일 필요는 없지만, UI는 "모임 전날 리마인더" 템플릿이라는 의미를 유지하기 위해 세션 날짜와 현재 날짜 차이를 함께 보여준다. `FEEDBACK_DOCUMENT_PUBLISHED`는 피드백 문서가 없는 세션에서는 발송할 수 없다.

## 6. 대상 선택

### 6.1 그룹

서버는 템플릿별 기본 대상 그룹과 선택 가능한 그룹을 반환한다.

| 그룹 | 의미 | 사용 템플릿 |
| --- | --- | --- |
| `ALL_ACTIVE_MEMBERS` | 현재 club의 활성 멤버와 호스트 | 다음 책 공개, 모임 전날 리마인더 |
| `SESSION_PARTICIPANTS` | 해당 세션 참가자 | 세 템플릿 모두 |
| `CONFIRMED_ATTENDEES` | 해당 세션 참석 확정자 | 피드백 문서 등록 |

호스트는 기본 그룹을 유지하거나 다른 허용 그룹으로 바꿀 수 있다. 그룹을 고른 뒤 멤버 목록에서 특정 멤버를 제외하거나 추가할 수 있다. 최종 대상은 `baseGroup - excludedMembershipIds + includedMembershipIds`로 계산하되, 서버가 club scope, active membership, session eligibility를 다시 검증한다.

### 6.2 멤버 표시 정보

멤버 선택 목록은 아래 정보만 보여준다.

- 표시 이름
- 마스킹 이메일
- membership status와 role badge
- 세션 참가/참석 상태 badge
- 이메일 eligibility badge: `이메일 가능`, `이메일 설정 꺼짐`, `이메일 없음`
- 앱 알림 eligibility badge

호스트 API는 원문 이메일을 반환하지 않는다. 검색은 이름과 이메일을 대상으로 할 수 있지만 response는 마스킹 이메일만 반환한다. 검색어는 club scope 안에서만 처리하고 로그나 metric label에 남기지 않는다.

## 7. 채널 정책

수동 발송 request의 `requestedChannels`는 `IN_APP`, `EMAIL`, `BOTH` 중 하나다.

- `IN_APP`: eligible target에 `member_notifications`와 `IN_APP` delivery를 만든다.
- `EMAIL`: 이메일 preference를 통과한 target에만 `EMAIL` delivery를 만든다. preference off 또는 email 없음은 `SKIPPED`로 기록하거나 preview 제외 카운트에 반영한다.
- `BOTH`: `IN_APP`과 `EMAIL`을 모두 계획하되, 이메일은 preference를 따른다.

현재 제품에는 인앱 알림 opt-out이 없으므로 인앱 알림은 active membership과 템플릿별 대상 자격을 통과하면 생성한다. 이메일은 기존 `NotificationPreferences`의 `emailEnabled`와 event-specific preference를 함께 통과해야 한다.

## 8. API 설계

모든 endpoint는 현재 club의 active host만 사용할 수 있다. Cross-club session, membership, previous dispatch id는 존재 여부를 노출하지 않고 not-found 또는 permission-denied로 처리한다.

### 8.1 수동 발송 capability 조회

`GET /api/host/notifications/manual/options?sessionId={sessionId}`

응답:

```json
{
  "templates": [
    {
      "eventType": "SESSION_REMINDER_DUE",
      "label": "모임 전날 리마인더",
      "enabled": true,
      "disabledReason": null,
      "defaultAudience": "ALL_ACTIVE_MEMBERS",
      "allowedAudiences": ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
      "defaultChannels": "BOTH"
    }
  ],
  "members": {
    "items": [
      {
        "membershipId": "<membership-id>",
        "displayName": "김리더",
        "maskedEmail": "h***@example.com",
        "role": "HOST",
        "membershipStatus": "ACTIVE",
        "sessionParticipationStatus": "ACTIVE",
        "attendanceStatus": "GOING",
        "emailEligibility": "ELIGIBLE",
        "inAppEligibility": "ELIGIBLE"
      }
    ],
    "nextCursor": null
  }
}
```

`sessionId`가 없으면 세션 편집 context 없이 전체 작업대에서 쓸 수 있는 템플릿과 최근 세션 선택 정보를 반환한다. 큰 클럽에서도 동작하도록 멤버 목록은 cursor pagination을 사용한다.

### 8.2 Preview

`POST /api/host/notifications/manual/preview`

요청:

```json
{
  "sessionId": "<session-id>",
  "eventType": "SESSION_REMINDER_DUE",
  "audience": "ALL_ACTIVE_MEMBERS",
  "requestedChannels": "BOTH",
  "excludedMembershipIds": ["<excluded-membership-id>"],
  "includedMembershipIds": [],
  "sendMode": "NOW"
}
```

응답:

```json
{
  "previewId": "<preview-id>",
  "expiresAt": "2026-05-13T10:15:00Z",
  "template": {
    "eventType": "SESSION_REMINDER_DUE",
    "label": "모임 전날 리마인더",
    "subject": "모임 전날 리마인더",
    "bodyPreview": "내일 모임 준비를 확인해 주세요."
  },
  "audience": {
    "baseGroup": "ALL_ACTIVE_MEMBERS",
    "baseCount": 18,
    "excludedCount": 1,
    "includedCount": 0,
    "finalTargetCount": 17
  },
  "channels": {
    "requested": "BOTH",
    "inAppEligibleCount": 17,
    "emailEligibleCount": 14,
    "emailSkippedByPreferenceCount": 2,
    "emailMissingCount": 1
  },
  "duplicates": {
    "requiresResendConfirmation": true,
    "recentDispatches": [
      {
        "manualDispatchId": "<previous-manual-dispatch-id>",
        "source": "MANUAL",
        "requestedChannels": "BOTH",
        "createdAt": "2026-05-12T09:00:00Z",
        "requestedBy": "h***@example.com",
        "targetCount": 18
      }
    ]
  },
  "warnings": [
    {
      "code": "EMAIL_PREFERENCE_SKIPS",
      "message": "이메일 알림 설정 때문에 2명에게는 이메일이 가지 않습니다."
    }
  ]
}
```

`previewId`는 client convenience reference이며 confirm에서 참고할 수 있다. 서버는 confirm 시 request body를 다시 검증하므로 `previewId`만으로 발송하지 않는다.

### 8.3 Confirm

`POST /api/host/notifications/manual`

요청은 preview 요청과 같은 selection field를 포함하고, 추가로 아래 값을 가진다.

```json
{
  "previewId": "<preview-id>",
  "resendConfirmed": true
}
```

응답:

```json
{
  "manualDispatchId": "<manual-dispatch-id>",
  "eventId": "<event-id>",
  "status": "PENDING",
  "createdAt": "2026-05-13T10:10:00Z",
  "summary": {
    "targetCount": 17,
    "requestedChannels": "BOTH",
    "expectedInAppCount": 17,
    "expectedEmailCount": 14
  }
}
```

같은 club/session/template 발송 기록이 있고 `resendConfirmed=false`이면 `409 DUPLICATE_NOTIFICATION_DISPATCH`를 반환한다. UI는 preview의 중복 경고를 유지한 채 재발송 확인 체크를 요구한다.

## 9. 서버 데이터 모델

### 9.1 Outbox metadata 확장

기존 `notification_event_outbox.payload_json` 또는 metadata JSON에 아래 public-safe 값을 추가한다.

```json
{
  "manualDispatch": {
    "id": "<manual-dispatch-id>",
    "source": "MANUAL",
    "requestedByMembershipId": "<host-membership-id>",
    "requestedChannels": "BOTH",
    "audience": "ALL_ACTIVE_MEMBERS",
    "excludedMembershipIds": ["<excluded-membership-id>"],
    "includedMembershipIds": [],
    "resend": true,
    "sendMode": "NOW"
  }
}
```

이 metadata에는 원문 이메일, 표시 이름, 알림 본문, feedback document body, credential-like value를 넣지 않는다. `requestedByMembershipId`는 host 장부에서 요청자를 마스킹 이메일 또는 표시 이름으로 매핑할 때만 사용한다.

수동 발송 조회와 중복 검사를 명확히 하기 위해 별도 `notification_manual_dispatches` table을 추가한다.

| Column | 설명 |
| --- | --- |
| `id` | manual dispatch id |
| `club_id` | club scope |
| `event_id` | `notification_event_outbox.id` |
| `session_id` | 대상 세션 |
| `event_type` | 수동 발송 템플릿 |
| `requested_by_membership_id` | 요청 host membership |
| `requested_channels` | `IN_APP`, `EMAIL`, `BOTH` |
| `audience` | base target group |
| `excluded_count` | 제외 멤버 수 |
| `included_count` | 추가 멤버 수 |
| `target_count` | confirm 시 최종 target 수 |
| `resend` | 재발송 여부 |
| `send_mode` | v1은 `NOW` |
| `scheduled_at` | v1은 null, 예약 발송 확장용 |
| `created_at` | 생성 시각 |

개별 제외/추가 멤버 id는 outbox payload에 남기되, 장기 검색이 필요하면 `notification_manual_dispatch_members` table로 분리할 수 있다. 1차 설계는 감사와 중복 판단에 필요한 aggregate count와 outbox payload를 함께 사용한다.

### 9.2 Dedupe key

수동 발송 event dedupe key는 자동 이벤트와 충돌하지 않게 아래 형식을 사용한다.

```text
manual:{eventType}:{sessionId}:{manualDispatchId}
```

중복 차단은 dedupe key가 아니라 `notification_manual_dispatches`와 기존 event outbox 조회로 판단한다. 재발송은 새 `manualDispatchId`를 갖기 때문에 delivery dedupe도 새 event 기준으로 분리된다.

## 10. Delivery planning

Kafka consumer가 `manualDispatch` metadata가 있는 이벤트를 받으면 자동 이벤트의 기본 recipient resolver 대신 manual target resolver를 사용한다.

1. event club scope와 session id를 검증한다.
2. `audience` base group으로 candidate membership id를 계산한다.
3. `excludedMembershipIds`를 제거한다.
4. `includedMembershipIds`를 추가하되, club scope와 active status, template-specific eligibility를 다시 검증한다.
5. `requestedChannels`에 따라 `IN_APP`과 `EMAIL` delivery 계획을 만든다.
6. 이메일은 기존 preference와 event-specific preference를 적용한다.
7. preference off, email 없음, 권한 없음은 host ledger에 설명 가능한 `SKIPPED` delivery 또는 skip count로 남긴다.

자동 이벤트는 기존 resolver를 계속 사용한다. 템플릿 렌더링은 기존 `NotificationEmailTemplates` helper를 확장해 자동/수동 공통 copy를 반환한다.

## 11. 호스트 UI 설계

### 11.1 `/app/host/notifications`

페이지 첫 영역은 "새 알림 발송" 작업대다. 기존 이벤트/배송 장부는 보조 영역으로 내려간다.

데스크톱 구조:

1. 페이지 헤더: "알림 발송", 작은 설명, `대기/실패 처리` 보조 버튼.
2. 새 알림 발송 작업대: 템플릿, 세션, 대상 그룹, 채널, 제외/추가 멤버, preview 버튼.
3. Preview panel: 대상 breakdown, 채널 breakdown, 중복 경고, 발송 확인 버튼.
4. 최근 수동 발송: manual dispatch rows, source, template, session, target count, status.
5. 운영 장부: 이벤트/배송 탭, 실패/대기 처리, dead 복구, 테스트 메일.

모바일 구조:

1. 헤더 아래 단일 column으로 작업대를 먼저 보여준다.
2. 템플릿/세션/대상/채널은 stepper처럼 접히는 section으로 구성한다.
3. 멤버 제외/추가는 별도 bottom-sheet나 full-width panel로 열고, 긴 목록은 검색과 pagination을 사용한다.
4. Preview 확인 화면은 sticky footer 없이 문서 흐름 안에 둔다. 버튼은 충분한 높이와 명확한 disabled state를 가진다.
5. 장부 탭은 작업대 아래에 배치한다.

외곽선 겹침을 줄이기 위해 `surface` 안에 또 다른 `surface`를 중첩하지 않는다. 작업대는 하나의 `rm-document-panel` 또는 full-width band로 두고, 내부 선택지는 구분선과 여백으로 나눈다. 반복 row만 얕은 bordered row를 사용한다.

### 11.2 세션 편집 화면

세션 편집 화면에는 "알림 발송" compact section을 추가한다.

- 세션 상태에 따라 가능한 템플릿만 보여준다.
- 각 버튼은 `/app/host/notifications?sessionId=...&eventType=...`로 이동하거나 inline quick preview를 연다.
- 피드백 문서가 없으면 피드백 알림 버튼은 disabled이고 이유를 보여준다.
- 이미 보낸 템플릿은 "이미 발송됨" badge와 "재발송은 알림 발송 화면에서 확인" link를 보여준다.

세션 편집 화면에서 바로 confirm까지 처리하지 않는다. 첫 구현은 host notification 작업대로 이동해 preview/confirm을 완료한다. 이렇게 하면 중복 경고, 대상 조정, 채널 선택을 한 화면에서 일관되게 처리할 수 있다.

## 12. 멤버 알림함 UI 설계

멤버 알림함은 기능을 크게 늘리지 않고 읽기 경험을 정리한다.

- 헤더는 unread count와 "모두 읽음"만 유지한다.
- 알림 row는 종류 label, unread marker, 생성 시각, 제목, 짧은 본문, 이동 affordance를 명확히 한다.
- `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`, `REVIEW_PUBLISHED` label을 Korean product copy로 통일한다.
- unread row는 배경과 좌측 marker로 구분하고, 색상만으로 상태를 표현하지 않는다.
- 각 row 전체가 link target이 되되, 별도 "읽음" 버튼은 모바일에서도 누르기 쉽게 유지한다.
- 자동/수동 여부는 표시하지 않는다.
- deep link가 invalid하면 안전하게 알림함에 머문다.

## 13. 오류 처리

서버는 기존 public-safe API error contract를 따른다.

| Code | Status | 상황 |
| --- | --- | --- |
| `HOST_ROLE_REQUIRED` | 403 | host가 아닌 사용자의 접근 |
| `MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE` | 409 | 세션 상태나 문서 상태상 템플릿 발송 불가 |
| `MANUAL_NOTIFICATION_AUDIENCE_EMPTY` | 422 | 최종 대상이 없음 |
| `DUPLICATE_NOTIFICATION_DISPATCH` | 409 | 이미 발송된 세션/템플릿을 재발송 확인 없이 confirm |
| `MANUAL_NOTIFICATION_PREVIEW_EXPIRED` | 409 | preview id가 만료됐거나 selection이 바뀜 |
| `MEMBERSHIP_NOT_ALLOWED` | 403 | 포함/제외 멤버가 club scope 또는 eligibility를 통과하지 못함 |

UI는 오류를 한국어로 짧게 보여준다. SMTP 실패는 confirm 실패가 아니라 delivery ledger의 실패 상태로 남는다. Confirm은 outbox event 생성 성공을 기준으로 성공 응답을 반환한다.

## 14. 보안과 개인정보

- 모든 수동 발송 endpoint는 active host와 current club context를 확인한다.
- 클라이언트가 보낸 `membershipId`, `sessionId`, `previewId`, `manualDispatchId`는 모두 club scope 안에서 다시 검증한다.
- 응답은 원문 이메일을 반환하지 않고 마스킹 이메일만 반환한다.
- outbox payload와 manual dispatch table에는 raw email, display name, credential-like value, feedback document body를 저장하지 않는다.
- 검색어, 이메일, display name은 로그와 metric label에 넣지 않는다.
- 호스트가 본문을 직접 작성할 수 없으므로 ReadMates가 범용 메일 발송 도구가 되지 않는다.
- public docs와 fixtures는 `example.com` 주소와 명시적 placeholder identifier만 사용한다.

## 15. 접근성과 반응형

- 모든 단계형 control은 keyboard와 screen reader에서 순서가 자연스러워야 한다.
- 템플릿/대상/채널 선택은 button group 또는 radio group semantics를 사용한다.
- Preview warning과 confirm error는 `role="alert"` 또는 `role="status"`를 적절히 사용한다.
- 모바일에서 긴 한국어 label이 버튼 밖으로 넘치지 않도록 button width, wrapping, line-height를 고정한다.
- desktop은 2-column layout을 사용할 수 있지만, 작업대와 상태 panel이 서로 독립된 section으로 보이게 간격과 구분선을 조정한다.
- 색상만으로 email skipped, duplicate warning, unread state를 표현하지 않는다.

## 16. 테스트 전략

서버:

- Host manual options API가 템플릿 availability와 기본 대상 그룹을 반환한다.
- Preview가 대상 그룹, 제외/추가 멤버, email preference skip count를 정확히 계산한다.
- Confirm이 active host만 허용하고 cross-club session/member를 거절한다.
- Confirm이 중복 발송을 기본 차단하고 `resendConfirmed=true`일 때 새 manual dispatch event를 만든다.
- Kafka dispatch가 manual metadata를 사용해 요청 채널별 delivery를 만든다.
- 이메일 preference off 멤버는 호스트가 `EMAIL` 또는 `BOTH`를 요청해도 이메일 delivery가 발송되지 않는다.
- 피드백 문서 없는 세션은 `FEEDBACK_DOCUMENT_PUBLISHED` 수동 발송을 거절한다.
- Response와 logs에 raw email, credential-like value, private body가 노출되지 않는다.

프런트엔드:

- Host notifications route가 작업대를 첫 화면에 렌더링한다.
- 템플릿/세션/대상/채널 선택 후 preview summary와 중복 경고를 보여준다.
- 재발송 확인 없이는 confirm 버튼이 disabled 또는 서버 오류를 명확히 표시한다.
- 멤버 제외/추가 목록이 마스킹 이메일과 eligibility badge만 보여준다.
- 세션 편집 화면의 빠른 발송 link가 가능한 템플릿만 활성화한다.
- 멤버 알림함 row가 unread, label, deep link, 읽음 처리 affordance를 명확히 렌더링한다.
- 데스크톱과 모바일 viewport에서 외곽선 중첩, 텍스트 overflow, 버튼 overlap이 없는지 확인한다.

통합/E2E:

- 호스트가 수동 리마인더를 preview하고 confirm하면 대상 멤버의 인앱 알림함에 알림이 생긴다.
- 이메일 preference off 멤버는 앱 알림만 받고 이메일 delivery는 skip된다.
- 같은 세션/템플릿을 두 번째 발송할 때 중복 경고와 재발송 확인이 필요하다.

검증 명령:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

## 17. 릴리스와 운영 관점

1차 릴리스는 feature flag 없이 host-only 기능으로 배포할 수 있다. 단, SMTP가 disabled이거나 Kafka consumer가 멈춘 환경에서는 confirm은 성공하더라도 delivery ledger에 pending/failed가 남을 수 있으므로 host page 상단 상태가 이를 보여줘야 한다.

수동 발송은 실제 이메일을 만들 수 있는 운영 행동이므로 confirm copy는 대상 수와 이메일 예상 수를 분명하게 보여준다. `notification_manual_dispatches`는 나중에 운영자가 "누가 어떤 세션 알림을 언제 보냈는지" 추적하는 기준이 된다.

예약 발송 확장은 아래 필드를 그대로 활용한다.

- `sendMode`: `NOW`에서 `SCHEDULED` 추가
- `scheduledAt`: 예약 시각
- `status`: manual dispatch lifecycle이 필요하면 `PENDING`, `SCHEDULED`, `CANCELLED`, `ENQUEUED`로 확장
- 자동 규칙은 별도 club-level notification rule table에서 manual preview/confirm과 같은 recipient resolver를 재사용한다.

## 18. 승인 기준

- 호스트가 `/app/host/notifications`에서 세 가지 템플릿 중 하나를 골라 대상과 채널을 확인하고 즉시 발송할 수 있다.
- 세션 편집 화면에서 현재 세션의 알림 발송 작업대로 빠르게 이동할 수 있다.
- 이메일 opt-out 멤버에게는 호스트가 이메일을 선택해도 이메일이 발송되지 않는다.
- 중복 발송은 기본 차단되고 재발송은 명시 확인과 별도 감사 기록이 필요하다.
- 멤버 알림함은 자동/수동 구분 없이 같은 제품 알림으로 읽히며, 읽음/안읽음과 이동 목적지가 명확하다.
- 호스트 알림 화면은 데스크톱과 모바일에서 외곽선 중첩이나 텍스트 overflow 없이 ReadMates의 차분한 운영 ledger 톤을 유지한다.
