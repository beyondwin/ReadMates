# ReadMates 수동 알림 발송 정확성 하드닝 스펙

작성일: 2026-05-14
상태: READY FOR IMPLEMENTATION
기준 범위: `7406fe3..HEAD` 수동 알림 발송 후속 리뷰
대상 표면: notification server slice, 수동 알림 delivery planning, 호스트 알림 운영 UI, 세션 편집 알림 진입점, 관련 테스트

## 1. 배경

수동 알림 발송은 호스트가 세션과 템플릿을 선택하고 preview를 확인한 뒤 기존 `notification_event_outbox` 기반 알림 파이프라인으로 이벤트를 넣는 구조다. 2026-05-13과 2026-05-14 작업으로 수동 발송 작업대, 최근 발송 장부, 멤버 검색, 세션 선택, 세션 편집 badge, E2E smoke가 추가되었다.

후속 리뷰에서 운영 정확성 관점의 결함 후보가 세 가지 남았다.

- Confirm 시점의 대상자 수와 실제 delivery planning 대상자가 다를 수 있다. 현재 outbox payload는 audience와 포함/제외 id만 저장하고, consumer는 delivery planning 시점에 DB에서 그룹 대상자를 다시 계산한다.
- 같은 preview를 여러 번 confirm할 수 있다. `previewId`에는 consumed 상태가 없고, outbox dedupe key는 매 confirm마다 새로 생성되는 manual dispatch id를 포함한다.
- 수동 템플릿 활성 조건이 자동 알림 delivery predicate와 다르다. 특히 다음 책 공개와 피드백 문서 등록 조건이 자동 경로보다 느슨하다.

이 스펙은 새 기능 확장이 아니라 이미 구현된 수동 알림의 release hardening이다. 목표는 호스트가 preview와 confirm에서 본 결과가 실제 발송 계획과 일치하도록 만들고, accidental double submit이나 느슨한 상태 조건으로 잘못된 이벤트가 생기지 않게 하는 것이다.

## 2. 목표

- Confirm 시점에 최종 수동 알림 대상자를 고정한다.
- Delivery planner는 수동 이벤트의 frozen recipient snapshot을 우선 사용하고, 새 멤버나 뒤늦은 참석/선호도 변경으로 recipient set을 다시 확장하지 않는다.
- Preview는 한 번만 소비된다. 같은 preview를 재확인해도 새 outbox event나 manual dispatch audit row가 중복 생성되지 않는다.
- Confirm은 idempotent하게 동작한다. 네트워크 재시도나 버튼 더블클릭은 기존 confirm 결과를 반환하거나 preview expired 계열 오류로 안전하게 닫히며, 두 번째 발송을 만들지 않는다.
- 수동 템플릿 활성 조건을 자동 알림 delivery predicate와 맞춘다.
- 호스트 UI의 템플릿 가능/불가능 상태도 서버 조건과 같은 기준을 사용한다.
- 기존 API 응답에서 target membership id, 원문 이메일, 개인 알림 본문, feedback document body를 노출하지 않는다.
- 기존 `notification_event_outbox`, Kafka relay/consumer, delivery retry, member inbox 경로는 유지한다.

## 3. 비목표

- 예약 발송, 예약 취소, 자동 규칙 관리.
- 호스트가 제목/본문을 직접 쓰는 기능.
- 이미 생성된 delivery row를 강제로 다시 보내는 기능.
- 수동 발송별 개별 recipient 감사 UI.
- 멤버에게 수동/자동 구분을 노출하는 것.
- 기존 자동 알림의 발행 조건 자체를 바꾸는 것.
- 기존 historical `docs/superpowers` 문서를 source of truth로 승격하는 것.

## 4. 핵심 결정

### 4.1 Frozen recipient snapshot은 event payload에 저장한다

수동 발송의 source of truth는 계속 `notification_event_outbox.payload_json`이다. Confirm 시점에 계산한 recipient snapshot을 `NotificationManualDispatchPayload`에 저장한다.

```json
{
  "manualDispatch": {
    "id": "<manual-dispatch-id>",
    "source": "MANUAL",
    "requestedByMembershipId": "<host-membership-id>",
    "requestedChannels": "BOTH",
    "audience": "ALL_ACTIVE_MEMBERS",
    "excludedMembershipIds": [],
    "includedMembershipIds": [],
    "targetMembershipIds": ["<membership-id>"],
    "inAppMembershipIds": ["<membership-id>"],
    "emailMembershipIds": ["<membership-id>"],
    "resend": false,
    "sendMode": "NOW"
  }
}
```

`targetMembershipIds`는 confirm 시점의 최종 대상자다. `inAppMembershipIds`와 `emailMembershipIds`는 confirm 시점의 채널별 eligible 대상자다. 요청 채널이 `EMAIL`이면 `inAppMembershipIds`는 빈 목록이고, 요청 채널이 `IN_APP`이면 `emailMembershipIds`는 빈 목록이다. 요청 채널이 `BOTH`이면 `inAppMembershipIds`는 최종 대상자 전체, `emailMembershipIds`는 이메일 preference와 이메일 주소 조건을 통과한 대상자다.

호스트 API 응답에는 지금처럼 count만 반환한다. membership id 목록은 internal payload와 server-side planning에만 사용한다.

### 4.2 Snapshot은 recipient set을 확장하지 않는다

Delivery planning에서 manual payload에 snapshot 목록이 있으면 audience를 다시 계산하지 않는다.

- 새로 가입한 active member는 snapshot에 없으므로 받지 않는다.
- confirm 이후 참석 상태가 바뀐 member도 snapshot에 없으면 받지 않고, snapshot에 있으면 대상자로 유지한다.
- confirm 이후 이메일 preference가 바뀌어도 `emailMembershipIds` snapshot을 기준으로 이메일 delivery eligibility를 판단한다.
- confirm 이후 membership row가 더 이상 current club active membership이 아니거나 user email이 비어 있으면 delivery planner는 이메일 row를 `SKIPPED`로 만들 수 있다. 단, 이 safety shrink는 대상 확장이 아니며 새 recipient를 추가하지 않는다.

기존 snapshot 없는 manual payload가 남아 있다면 legacy fallback으로 현재 로직을 사용할 수 있다. 새 confirm 경로는 항상 snapshot을 채운다.

### 4.3 Preview 소비와 outbox 생성은 하나의 DB transaction이다

`notification_manual_dispatch_previews`에 소비 상태를 추가한다.

- `consumed_at`
- `consumed_event_id`

Confirm은 preview row를 lock한 뒤 selection hash, host, club, expiry를 확인하고 아직 소비되지 않은 경우에만 outbox event와 manual dispatch audit row를 만든다. 성공하면 preview row에 `consumed_at`과 `consumed_event_id`를 기록한다.

이미 소비된 preview가 같은 host/club/selection으로 다시 confirm되면 새 event를 만들지 않는다. 서버는 `consumed_event_id`로 기존 manual dispatch를 찾아 같은 `ManualNotificationConfirmResult` shape를 반환한다. 기존 결과를 찾을 수 없으면 preview expired 오류로 닫는다.

### 4.4 Outbox dedupe key는 previewId 기반으로 고정한다

수동 confirm에서 생성하는 `notification_event_outbox.dedupe_key`는 새 random dispatch id가 아니라 preview id를 포함한다.

```text
manual:<eventType>:<sessionId>:preview:<previewId>
```

`notification_event_outbox`의 기존 unique key가 마지막 방어선이다. Transaction lock이 정상 동작하지 않는 상황에서도 같은 preview에서 두 개의 outbox event가 생기지 않아야 한다.

### 4.5 수동 템플릿 조건은 자동 delivery predicate와 맞춘다

수동 options, preview, confirm, 세션 편집 UI는 아래 조건을 동일하게 적용한다.

| 템플릿 | 이벤트 타입 | 활성 조건 | 비활성 메시지 |
| --- | --- | --- | --- |
| 다음 책 공개 | `NEXT_BOOK_PUBLISHED` | `session.state == DRAFT`이고 `visibility in (MEMBER, PUBLIC)` | `멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다.` |
| 모임 전날 리마인더 | `SESSION_REMINDER_DUE` | `session.state in (DRAFT, OPEN)` | `예정 또는 열린 세션만 리마인더를 보낼 수 있습니다.` |
| 피드백 문서 등록 | `FEEDBACK_DOCUMENT_PUBLISHED` | `session.state in (CLOSED, PUBLISHED)`이고 feedback document가 존재 | `닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.` |

이 기준은 자동 delivery planning의 `sessionViewerRecipients`와 `feedbackRecipients` 조건에 맞춘다. 자동 이벤트 발행 시점이나 기존 outbox row의 처리 정책은 이 스펙에서 바꾸지 않는다.

## 5. 데이터 모델

### 5.1 Migration

새 migration은 `server/src/main/resources/db/mysql/migration/V28__manual_notification_dispatch_hardening.sql`에 둔다.

```sql
alter table notification_manual_dispatch_previews
  add column consumed_at datetime(6),
  add column consumed_event_id char(36);

alter table notification_manual_dispatch_previews
  add key notification_manual_dispatch_previews_consumed_event_idx (consumed_event_id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_event_fk
    foreign key (consumed_event_id, club_id) references notification_event_outbox(id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_check
    check (
      (consumed_at is null and consumed_event_id is null)
      or (consumed_at is not null and consumed_event_id is not null)
    );

alter table notification_manual_dispatches
  add column preview_id char(36) after event_id,
  add unique key notification_manual_dispatches_preview_uk (preview_id),
  add constraint notification_manual_dispatches_preview_fk
    foreign key (preview_id) references notification_manual_dispatch_previews(id);
```

`preview_id`는 새 confirm 경로에서 채운다. 기존 row가 있다면 `null`을 허용하므로 migration은 backwards compatible이다.

### 5.2 Application model

`NotificationManualDispatchPayload`에 아래 필드를 추가한다.

- `targetMembershipIds: List<UUID> = emptyList()`
- `inAppMembershipIds: List<UUID> = emptyList()`
- `emailMembershipIds: List<UUID> = emptyList()`

`ManualNotificationTargetSnapshot`은 count와 함께 frozen id 목록을 들고 다닌다.

- `targetMembershipIds`
- `inAppMembershipIds`
- `emailMembershipIds`

Count는 항상 목록에서 파생 가능한 값이어야 한다. 테스트에서는 `finalTargetCount == targetMembershipIds.size`, `inAppEligibleCount == inAppMembershipIds.size`, `emailEligibleCount == emailMembershipIds.size`를 검증한다.

### 5.3 Persistence port

Preview 소비와 manual dispatch insert는 분리된 persistence 호출 두 개로 두지 않는다. Port는 하나의 transactional operation으로 preview lock, idempotency 확인, outbox insert, manual dispatch insert, preview consumed update를 처리한다.

필요한 반환 모델:

- 새로 생성됨: manual dispatch id, event id, createdAt, target summary
- 이미 소비됨: 기존 manual dispatch id, event id, createdAt, target summary
- preview 사용 불가: application service가 `MANUAL_NOTIFICATION_PREVIEW_EXPIRED`로 매핑할 수 있는 실패

## 6. 서버 동작

### 6.1 Preview

Preview는 기존처럼 실제 이벤트를 만들지 않는다. 단, `previewTargets`가 count만이 아니라 frozen recipient id 목록까지 계산한다.

Preview response에는 id 목록을 포함하지 않는다.

```json
{
  "audience": {
    "finalTargetCount": 17
  },
  "channels": {
    "inAppEligibleCount": 17,
    "emailEligibleCount": 14
  }
}
```

### 6.2 Confirm

Confirm 흐름은 아래 순서를 따른다.

1. Host 권한 확인.
2. Selection의 템플릿, audience, 세션 상태, visibility, feedback document 조건 검증.
3. Included/excluded membership id가 current club active membership인지 검증.
4. Frozen target snapshot 계산.
5. 대상자가 비어 있으면 `MANUAL_NOTIFICATION_AUDIENCE_EMPTY`.
6. Duplicate manual dispatch가 있고 `resendConfirmed=false`면 `DUPLICATE_NOTIFICATION_DISPATCH`.
7. Transaction 안에서 preview row lock.
8. Preview expiry와 selection hash 검증.
9. 이미 소비된 preview면 기존 confirm 결과 반환.
10. 소비되지 않았으면 outbox/manual audit row 생성, preview consumed 상태 기록.

Preview를 먼저 소비하고 나서 duplicate 검사를 하는 순서는 금지한다. 재발송 확인 없는 confirm이 preview를 태워버리면 호스트가 같은 preview로 resend confirmation을 다시 보낼 수 없기 때문이다.

### 6.3 Delivery planning

Manual payload에 `targetMembershipIds`, `inAppMembershipIds`, `emailMembershipIds` 중 하나라도 존재하면 frozen snapshot path를 사용한다.

- `manualRecipients`는 audience를 재계산하지 않는다.
- `DeliveryRecipient`는 target snapshot 안의 membership id만 만든다.
- `deliveryRowsForRecipient`는 requested channel뿐 아니라 frozen in-app/email membership id set을 함께 본다.
- 이메일 preference column은 frozen snapshot path에서 다시 평가하지 않는다.
- Snapshot 없는 legacy manual payload만 기존 `manualBaseMembershipIds` fallback을 사용한다.

자동 이벤트 path는 기존 조건을 유지한다.

## 7. 프런트엔드 동작

### 7.1 세션 편집 알림 진입점

`HostSessionNotificationActions`는 서버와 같은 조건을 사용한다.

- 다음 책 공개: `state === "DRAFT" && (visibility === "MEMBER" || visibility === "PUBLIC")`
- 리마인더: `state === "DRAFT" || state === "OPEN"`
- 피드백 문서: `(state === "CLOSED" || state === "PUBLISHED") && feedbackDocumentUploaded`

Disabled copy는 서버 메시지와 동일한 의미를 유지한다.

### 7.2 호스트 알림 작업대

작업대는 server options의 `template.enabled`를 최종 진실로 사용한다. 클라이언트는 preview/confirm request를 임의로 활성화하지 않는다.

Confirm 버튼은 pending 상태에서 중복 클릭이 어렵도록 disabled 처리한다. 그래도 네트워크 재시도는 서버 idempotency에 의존한다.

### 7.3 API contract

외부 API request/response shape는 변경하지 않는다. Frozen id 목록은 response에 추가하지 않는다. Existing frontend contract update는 템플릿 조건과 테스트 fixture 조정만 필요하다.

## 8. 오류 계약

기존 public-safe 오류 shape를 유지한다.

| Code | Status | 상황 |
| --- | --- | --- |
| `MANUAL_NOTIFICATION_PREVIEW_EXPIRED` | 409 | preview 없음, 만료, hash mismatch, consumed 결과를 찾을 수 없음 |
| `DUPLICATE_NOTIFICATION_DISPATCH` | 409 | 같은 club/session/template 발송이 있고 재발송 확인이 없음 |
| `MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE` | 409 | 템플릿 상태 조건 불충족 |
| `MANUAL_NOTIFICATION_AUDIENCE_EMPTY` | 422 | frozen target이 비어 있음 |
| `MEMBERSHIP_NOT_ALLOWED` | 403 | included/excluded id가 current club active membership이 아님 |

오류 body에는 raw SQL, stack trace, 원문 이메일, membership id 상세 목록을 넣지 않는다.

## 9. 테스트 기준

### 9.1 Server unit

- Options는 DRAFT+MEMBER에서 다음 책 공개를 enabled로 반환한다.
- Options는 OPEN 다음 책 공개를 disabled로 반환한다.
- Options는 CLOSED/PUBLISHED + feedback document에서 피드백 문서를 enabled로 반환한다.
- Confirm payload에는 frozen target id 목록이 들어간다.
- 같은 preview를 두 번 confirm해도 port insert는 한 번만 호출되거나 두 번째는 기존 결과로 매핑된다.

### 9.2 Server persistence

- Migration이 preview consumed 상태와 manual dispatch preview id를 저장한다.
- Concurrent confirm 또는 sequential double confirm은 outbox/manual dispatch row를 하나만 만든다.
- Outbox dedupe key는 preview id 기반이다.
- Frozen snapshot은 confirm 이후 새로 가입한 active member를 delivery planning 대상에 포함하지 않는다.
- Frozen email snapshot은 confirm 이후 email preference 변경으로 이메일 대상이 확장되지 않는다.
- Legacy manual payload는 기존 fallback으로 처리된다.

### 9.3 Frontend unit

- 세션 편집 알림 액션의 enabled/disabled 조건이 서버 스펙과 일치한다.
- 작업대는 disabled template을 선택/preview하지 못한다.
- Confirm pending 중 버튼은 disabled 상태를 유지한다.

### 9.4 E2E

- 호스트가 preview 후 confirm하면 member inbox가 생성된다.
- 같은 preview를 재시도해도 member inbox와 event outbox가 중복 생성되지 않는다.
- 다음 책 공개는 DRAFT+MEMBER/PUBLIC 세션에서만 가능하다.
- 피드백 문서 등록은 CLOSED/PUBLISHED + feedback document 조건에서만 가능하다.

## 10. 운영과 릴리즈 고려사항

- Migration은 nullable column 추가와 nullable unique key 추가이므로 기존 데이터에 즉시 값을 요구하지 않는다.
- 새 payload field는 default empty list로 decode되어야 한다.
- Consumer 배포 전에 producer가 snapshot field를 넣어도 old consumer는 unknown JSON field를 무시하거나 model decode에 실패하지 않아야 한다. Jackson Kotlin 설정이 unknown field에 민감하지 않은지 테스트로 확인한다.
- Consumer 배포 후 producer가 아직 snapshot 없는 payload를 만들 수 있는 rolling window에서는 legacy fallback이 동작해야 한다.
- Public repo 문서에는 실제 member id, 원문 이메일, 운영 domain, secret을 넣지 않는다.
