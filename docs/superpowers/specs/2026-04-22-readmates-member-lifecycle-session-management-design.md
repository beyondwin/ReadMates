# ReadMates Member Lifecycle and Session Management Design

작성일: 2026-04-22
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates에서 세션 진행 중 멤버가 초대, 추가, 탈퇴, 정지될 때의 권한, 기록 보존, 현재 세션 반영, 호스트 관리 UX를 정의한다.

## 1. 배경

ReadMates는 초대 기반 독서모임이며 현재 코드와 문서는 이미 다음 구조를 갖고 있다.

- 초대는 `invitations`에서 관리한다.
- 클럽 안의 사람 상태는 `memberships.status`와 `memberships.role`에서 관리한다.
- 특정 세션의 참가 대상, RSVP, 출석은 `session_participants`에서 관리한다.
- 새 세션 생성 시 `ACTIVE` 멤버를 `session_participants`에 자동 추가한다.
- 초대 수락 또는 승인 시 현재 열린 `OPEN` 세션에 새 멤버를 자동 추가하는 흐름이 있다.
- 마이페이지에는 탈퇴 UI 문구가 있지만 아직 실제 API는 없다.
- `PENDING_APPROVAL`, 초대 수락, 호스트 승인, 출석 편집은 구현되어 있으나 정지, 탈퇴, 현재 세션 제외, 기록 익명화 정책은 없다.

이번 설계는 멤버십 변경과 세션 참가 변경을 분리해 운영 실수를 줄이고, 이미 남긴 독서 기록을 보존하면서도 개인정보 노출을 제어하는 기준을 세운다.

## 2. 확정된 제품 결정

- 세션 중 멤버 추가, 정지, 탈퇴가 발생하면 호스트가 `이번 세션에도 반영` 또는 `다음 세션부터 반영`을 선택할 수 있다.
- 초대 생성 시 현재 `OPEN` 세션이 있으면 `수락하면 이번 세션에도 추가` 옵션을 제공한다.
- 초대 수락 뒤 현재 세션 자동 추가 조건을 만족하지 못하면 호스트 대시보드에서 추가 여부를 확인하게 한다.
- 정지는 쓰기 제한형이다. 정지 멤버는 로그인과 기존 기록 열람은 가능하지만 RSVP, 체크인, 질문, 한줄평, 서평 저장은 할 수 없다.
- 탈퇴는 기록 보존과 이름 익명화를 원칙으로 한다. 과거 질문, 체크인, 서평, 참석 기록은 남기되 일반 멤버와 공개 화면에는 `탈퇴한 멤버`로 표시한다.
- 호스트는 운영 화면에서 탈퇴 멤버의 실제 이름, 이메일, 상태를 볼 수 있다.
- 위험한 상태 변경은 서버에서 멱등성과 보호 규칙을 보장한다.

## 3. 목표

- 클럽 멤버십 상태와 현재 세션 참가 상태를 명확히 분리한다.
- 호스트가 새 멤버를 현재 세션에 바로 포함할지, 다음 세션부터 포함할지 선택할 수 있다.
- 정지 멤버의 기존 기록 접근은 유지하되 새 활동 저장은 서버에서 차단한다.
- 탈퇴 멤버의 과거 기록은 삭제하지 않고 일반 화면에서 익명화한다.
- 현재 세션 참가자 명단과 카운트가 상태 변경 뒤에도 예측 가능하게 유지된다.
- 마지막 활성 호스트를 실수로 정지, 탈퇴, 비활성 처리하지 못하게 한다.
- 기존 초대, 승인, 세션 편집 흐름을 최대한 재사용한다.

## 4. 비범위

- 멤버 데이터 내보내기 또는 완전 삭제 요청 처리
- 여러 클럽을 운영하는 멀티클럽 관리 UI
- 세분화된 권한 체계
- 정지 기간 예약과 자동 복구
- 상태 변경 이메일 발송
- 공개 모집형 가입 신청 UX 재설계
- 호스트 권한 위임과 역할 변경 UI

## 5. 선택한 접근

멤버십 상태는 장기 권한을 관리하고, 세션 참가 상태는 특정 회차의 참가 대상 여부를 관리한다.

`memberships.status`는 그 사람이 클럽에서 어떤 상태인지 나타낸다. `session_participants`는 특정 세션에 그 사람이 참가 대상인지, RSVP와 출석이 무엇인지 나타낸다. 따라서 정지나 탈퇴가 발생해도 과거 질문, 체크인, 리뷰, 출석 row를 삭제하지 않는다. 현재 세션에서 제외해야 할 때도 participant row를 삭제하지 않고 `REMOVED` 상태로 표시한다.

이 접근을 선택한 이유:

- 이미 코드가 `memberships`와 `session_participants`를 분리해 사용한다.
- 기록 보존과 현재 세션 명단 조정이 충돌하지 않는다.
- 세션 중 변경을 자동으로 강제하지 않고 호스트가 운영 맥락을 반영할 수 있다.
- 탈퇴 익명화와 호스트 운영 조회를 화면별로 다르게 적용하기 쉽다.

버린 접근:

- 모든 변경을 즉시 현재 세션에 반영하는 방식은 단순하지만, 이미 질문 제출이나 출석 확정이 진행 중인 세션에서 명단이 갑자기 바뀔 수 있다.
- 모든 변경을 다음 세션부터만 반영하는 방식은 안정적이지만, 새 멤버를 바로 참여시켜야 하는 실제 운영 상황에 맞지 않는다.
- `session_participants` row를 삭제하는 방식은 이미 연결된 질문, 체크인, 리뷰, 피드백 접근 판단과 충돌할 수 있다.

## 6. 상태 모델

### 6.1 Membership 상태

`memberships.status`는 다음 의미로 사용한다.

| 상태 | 의미 | 권한 |
|---|---|---|
| `PENDING_APPROVAL` | Google 로그인 완료, 호스트 승인 전 | 승인 대기 화면 중심, 쓰기 불가 |
| `ACTIVE` | 정상 멤버 | 읽기, 쓰기, 세션 참여 가능 |
| `SUSPENDED` | 일시 정지된 멤버 | 내부 읽기 가능, 새 활동 저장 불가 |
| `LEFT` | 탈퇴한 멤버 | 내부 활동 권한 없음, 과거 기록은 일반 화면에서 익명화 |
| `INACTIVE` | 승인 거절 또는 관리상 비활성 | 내부 활동 권한 없음 |

`INVITED`는 기존 호환 상태로 남길 수 있지만, 현재 초대 흐름의 source of truth는 `invitations`다. 새 구현은 `INVITED` 멤버십을 만들지 않는다.

### 6.2 Session participant 상태

`session_participants`에는 세션 참가 대상 여부를 나타내는 상태를 추가한다.

```text
participation_status: ACTIVE | REMOVED
```

- `ACTIVE`: 현재 세션의 참가 대상이다. RSVP, 출석, 체크인, 질문 카운트에 포함한다.
- `REMOVED`: 해당 세션에서 제외되었다. row와 과거 작성 데이터는 보존하지만 기본 명단과 운영 카운트에서는 제외한다.

기존 `rsvp_status`와 `attendance_status`는 유지한다.

```text
rsvp_status: NO_RESPONSE | GOING | MAYBE | DECLINED
attendance_status: UNKNOWN | ATTENDED | ABSENT
```

## 7. 사용자 흐름

### 7.1 초대와 새 멤버 추가

1. 호스트가 이름과 이메일로 초대를 만든다.
2. 현재 `OPEN` 세션이 있으면 초대 폼에 `수락하면 이번 세션에도 추가` 옵션을 보여준다.
3. 질문 마감 전이면 기본값은 켜짐이다.
4. 질문 마감 후 또는 세션 당일 이후라면 기본값은 꺼짐이고 다음 세션부터 참여를 권장한다.
5. 초대에는 `apply_to_current_session` 의도를 저장한다.
6. 사용자가 초대를 수락하면 멤버십은 `ACTIVE`가 된다.
7. 수락 시점에 `apply_to_current_session=true`, 현재 `OPEN` 세션 존재, 질문 마감 전, 세션 날짜가 지나지 않음 조건을 모두 만족하면 `session_participants`에 `ACTIVE` row를 만든다.
8. 위 조건 중 하나라도 만족하지 못하면 자동 추가하지 않고 호스트 대시보드에 확인 알림을 띄운다.

대시보드 알림 예시:

```text
새 멤버 1명이 현재 세션에 아직 없습니다.
[이번 세션에 추가] [다음 세션부터]
```

### 7.2 정지

1. 호스트가 멤버 row에서 `정지`를 선택한다.
2. 확인 모달에서 `이번 세션부터 바로 정지` 또는 `다음 세션부터 정지`를 선택한다.
3. 서버는 `memberships.status = SUSPENDED`로 변경한다.
4. `이번 세션부터 바로 정지`면 현재 세션 쓰기 API가 즉시 막힌다.
5. 세션 참가 row는 삭제하지 않는다.
6. 호스트 화면에는 정지 배지를 표시하고, 필요하면 출석을 `ABSENT`로 바꿀 수 있다.
7. 정지 멤버가 로그인하면 홈과 아카이브 같은 읽기 화면은 볼 수 있지만 새 활동 저장 버튼은 비활성화된다.

정지 안내 예시:

```text
멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.
```

### 7.3 탈퇴

1. 멤버가 마이페이지에서 탈퇴하거나, 호스트가 운영상 탈퇴 처리한다.
2. 서버는 `memberships.status = LEFT`로 변경한다.
3. 과거 기록은 삭제하지 않는다.
4. 일반 멤버, 공개 페이지, 노트 피드에서는 작성자명을 `탈퇴한 멤버`로 표시한다.
5. 호스트 화면에서는 운영 목적상 실제 이름, 이메일, 상태를 볼 수 있다.
6. 현재 `OPEN` 세션이 있으면 `이번 세션에서 제외` 또는 `다음 세션부터 제외`를 선택한다.
7. 본인 탈퇴는 기본적으로 `이번 세션부터 즉시 제외`로 처리한다.
8. 탈퇴 뒤 내부 앱 접근은 막는다. 재가입은 새 초대 또는 호스트 재활성화로 처리한다.

### 7.4 복구

- `SUSPENDED -> ACTIVE` 복구는 호스트가 멤버 관리 화면에서 할 수 있다.
- `LEFT -> ACTIVE` 복구는 첫 구현의 기본 UI에서 직접 제공하지 않는다.
- `LEFT` 멤버의 재가입은 새 초대 수락으로 처리한다. 이때 기존 membership row를 `ACTIVE`로 되살려 과거 기록 소유권을 유지한다.
- 복구해도 기존 membership row를 유지하면 과거 기록 소유권이 이어진다.
- 복구 후 현재 `OPEN` 세션에 넣을지는 호스트가 별도로 선택한다.

## 8. 호스트 UX

`/app/host/members`를 멤버 관리 허브로 확장한다.

| 탭 | 목적 |
|---|---|
| `활성 멤버` | 활동 중인 멤버 목록, 정지, 탈퇴 처리, 현재 세션 추가/제외 |
| `승인 대기` | Google 로그인 후 승인 대기 중인 사람 승인/거절 |
| `정지됨` | 정지 멤버 확인, 복구 |
| `탈퇴/비활성` | 탈퇴, 거절, 비활성 기록 확인 |
| `초대` | 초대 생성, 대기, 수락, 취소, 만료 초대 관리 |

활성 멤버 row는 멤버십 상태와 현재 세션 참여 여부를 함께 보여준다.

```text
안멤버1
member1@example.com · ACTIVE · 이번 세션 참여 중
[정지] [이번 세션 제외]
```

정지 확인 모달:

```text
안멤버1님을 정지할까요?

정지하면 기존 기록은 유지되고, 새 RSVP/질문/체크인/리뷰 작성은 막힙니다.

( ) 이번 세션부터 바로 정지
( ) 다음 세션부터 정지

[취소] [정지]
```

탈퇴 처리 확인 모달:

```text
안멤버1님을 탈퇴 처리할까요?

과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.

( ) 이번 세션에서 제외
( ) 다음 세션부터 제외

[취소] [탈퇴 처리]
```

세션 편집 화면의 출석 섹션은 다음처럼 동작한다.

- 기본 목록은 `participation_status = ACTIVE` 참가자만 표시한다.
- `REMOVED` 참가자는 접힌 `제외된 참가자` 영역에서 확인한다.
- 이미 질문, 체크인, 리뷰를 남긴 사람이 제외되어도 기록은 지우지 않는다.
- 호스트는 필요하면 `이번 세션에 복구`할 수 있다.

## 9. 백엔드 API

### 9.1 호스트 멤버 목록

```text
GET /api/host/members
```

응답 항목:

- `membershipId`
- `userId`
- `email`
- `displayName`
- `shortName`
- `profileImageUrl`
- `role`
- `status`
- `joinedAt`
- `createdAt`
- `currentSessionParticipationStatus`
- `canSuspend`
- `canRestore`
- `canDeactivate`
- `canAddToCurrentSession`
- `canRemoveFromCurrentSession`

### 9.2 멤버 상태 변경

```text
POST /api/host/members/{membershipId}/suspend
POST /api/host/members/{membershipId}/restore
POST /api/host/members/{membershipId}/deactivate
```

요청:

```json
{
  "currentSessionPolicy": "APPLY_NOW"
}
```

또는:

```json
{
  "currentSessionPolicy": "NEXT_SESSION"
}
```

`deactivate`는 호스트가 멤버를 `LEFT`로 탈퇴 처리할 때 사용한다. 승인 거절처럼 `INACTIVE`로 남기는 흐름은 기존 `reject` API를 유지한다. 응답은 갱신된 멤버 row와 현재 세션 반영 결과를 반환한다.

### 9.3 현재 세션 참가 조정

```text
POST /api/host/members/{membershipId}/current-session/add
POST /api/host/members/{membershipId}/current-session/remove
```

정책:

- `add`는 현재 `OPEN` 세션에 `session_participants` row가 없으면 `NO_RESPONSE / UNKNOWN / ACTIVE`로 추가한다.
- 이미 `ACTIVE`면 멱등 성공이다.
- 기존 row가 `REMOVED`면 `ACTIVE`로 복구한다.
- `remove`는 row를 삭제하지 않고 `participation_status = REMOVED`로 바꾼다.
- 이미 `REMOVED`면 멱등 성공이다.
- `SUSPENDED`, `LEFT`, `INACTIVE` 멤버를 현재 세션에 추가하려 하면 `409 Conflict`다.

### 9.4 본인 탈퇴

```text
POST /api/me/membership/leave
```

요청:

```json
{
  "currentSessionPolicy": "APPLY_NOW"
}
```

본인 탈퇴의 기본값은 `APPLY_NOW`다. 탈퇴 후 현재 auth session은 만료시키거나 다음 `/api/auth/me`에서 비활성 상태로 처리해 내부 앱 접근을 막는다.

### 9.5 초대 생성 확장

기존:

```text
POST /api/host/invitations
```

요청에 현재 세션 반영 의도를 추가한다.

```json
{
  "email": "new.member@example.com",
  "name": "새멤버",
  "applyToCurrentSession": true
}
```

`applyToCurrentSession`은 현재 `OPEN` 세션이 없으면 무시해도 된다. 서버 응답에는 저장된 값을 반환한다.

## 10. 데이터 변경

### 10.1 memberships

`memberships.status` check constraint에 다음 값을 추가한다.

```text
SUSPENDED
LEFT
```

최종 허용 상태:

```text
INVITED
PENDING_APPROVAL
ACTIVE
SUSPENDED
LEFT
INACTIVE
```

### 10.2 session_participants

컬럼 추가:

```text
participation_status varchar(20) not null default 'ACTIVE'
```

check constraint:

```text
participation_status in ('ACTIVE', 'REMOVED')
```

기존 row는 모두 `ACTIVE`로 마이그레이션한다.

### 10.3 invitations

컬럼 추가:

```text
apply_to_current_session boolean not null default true
```

기존 초대는 운영 의도 보존 데이터가 없으므로 기본값 `true`로 둔다. 서버는 수락 시점에 현재 `OPEN` 세션 존재, 질문 마감 전, 세션 날짜가 지나지 않음 조건을 모두 만족할 때만 자동 추가한다.

## 11. 권한과 서버 정책

쓰기 API는 서버에서 공통으로 차단한다.

- `ACTIVE`만 RSVP, 체크인, 질문, 한줄평, 서평 저장 가능
- `SUSPENDED`, `LEFT`, `INACTIVE`, `PENDING_APPROVAL`은 쓰기 API `403`
- `participation_status = REMOVED`인 멤버는 현재 세션 쓰기 API `403`
- 호스트 API는 `ACTIVE HOST`만 가능
- 읽기 API는 `ACTIVE`와 `SUSPENDED`를 허용한다.
- `LEFT`는 내부 앱 읽기도 막는다.
- 공개 API는 인증 상태와 무관하게 탈퇴 멤버 이름을 노출하지 않는다.

보호 규칙:

- 마지막 `ACTIVE HOST`는 정지, 탈퇴, 비활성화할 수 없다.
- 호스트가 자기 자신을 정지, 탈퇴, 비활성화하는 것은 기본 차단한다.
- `PENDING_APPROVAL -> ACTIVE`는 기존 승인 flow만 사용한다.
- `PENDING_APPROVAL -> INACTIVE`는 기존 거절 flow만 사용한다.
- 상태 변경은 같은 클럽 안의 membership에만 적용한다.

## 12. 익명화 정책

- `LEFT` 멤버의 과거 기록은 삭제하지 않는다.
- 일반 멤버 화면에서는 작성자명을 항상 `탈퇴한 멤버`로 표시한다.
- 공개 페이지와 노트 피드도 `LEFT` 멤버 이름을 노출하지 않는다.
- 같은 사람이 여러 기록을 남겼어도 기본 표시는 모두 `탈퇴한 멤버`다.
- `탈퇴한 멤버 1`, `탈퇴한 멤버 2`처럼 구분하지 않는다.
- 호스트 화면에서는 운영 목적상 실제 이름, 이메일, 상태를 볼 수 있다.
- 본인이 탈퇴한 뒤 내부 앱 접근은 막으므로 본인 과거 기록 조회는 이번 범위에 포함하지 않는다.

익명화는 쿼리 계층에서 적용한다. 질문, 체크인, 한줄평, 하이라이트, 피드백 접근 판단처럼 작성자 정보를 조인하는 곳은 `memberships.status = 'LEFT'`일 때 일반 응답의 `authorName`과 `authorShortName`을 `탈퇴한 멤버`로 치환한다.

## 13. 카운트 정책

- 현재 세션 참석 대상 수는 `participation_status = ACTIVE` 참가자만 계산한다.
- RSVP 미응답, 체크인 미작성, 질문 제출률도 `ACTIVE` 참가자만 계산한다.
- `REMOVED` 참가자는 현재 운영 카운트에서 제외한다.
- 과거 아카이브의 총 참여자 수는 당시 `ACTIVE` 참가자를 기준으로 계산한다.
- 이미 참석 확정된 뒤 탈퇴한 멤버의 과거 참석 기록은 보존하지만 일반 멤버에게는 익명화한다.
- 피드백 문서 접근은 기존처럼 참석 여부를 기준으로 하되, `LEFT`는 내부 접근이 없으므로 열람할 수 없다.
- `SUSPENDED`는 과거 참석 피드백 문서 열람을 허용한다.

## 14. 에러 처리

- `currentSessionPolicy = APPLY_NOW`인데 현재 `OPEN` 세션이 없으면 멤버 상태 변경은 성공하고 세션 반영 결과는 `NOT_APPLICABLE`로 반환한다.
- 현재 세션 추가/제외는 멱등 API다.
- 존재하지 않거나 다른 클럽의 membership은 `404`를 반환한다.
- 상태상 허용되지 않는 전환은 `409`를 반환한다.
- 마지막 활성 호스트 보호 규칙 위반은 `409`를 반환한다.
- 권한 없는 사용자는 `403`을 반환한다.
- 현재 세션에서 제외된 멤버가 쓰기 API를 호출하면 `403`을 반환한다.
- 정지 멤버가 쓰기 API를 호출하면 `403`을 반환한다.

## 15. 테스트 기준

### 15.1 백엔드

- 초대 생성 시 `applyToCurrentSession=true/false`가 저장된다.
- 초대 수락 시 옵션과 현재 `OPEN` 세션 상태에 따라 `session_participants`가 생성되거나 보류된다.
- 호스트가 현재 세션에 멤버를 추가할 수 있다.
- 호스트가 현재 세션에서 멤버를 제외하면 row 삭제 없이 `participation_status = REMOVED`가 된다.
- 제외된 멤버는 현재 세션 쓰기 API가 `403`을 반환한다.
- 정지 멤버는 읽기 API는 성공하고 쓰기 API는 `403`을 반환한다.
- 탈퇴 멤버는 내부 앱 권한이 사라진다.
- 탈퇴 멤버의 과거 질문, 체크인, 리뷰, 노트 피드 작성자명이 일반 응답에서 `탈퇴한 멤버`로 표시된다.
- 호스트 멤버 관리 응답은 실제 이름과 상태를 반환한다.
- 마지막 활성 호스트는 정지, 탈퇴, 비활성화할 수 없다.
- 새 세션 생성 시 `ACTIVE` 멤버만 자동 참가자로 들어간다.

### 15.2 프론트엔드

- 멤버 관리 허브가 활성, 승인 대기, 정지됨, 탈퇴/비활성, 초대 탭을 보여준다.
- 초대 폼은 현재 `OPEN` 세션이 있을 때 `수락하면 이번 세션에도 추가` 옵션을 보여준다.
- 정지 확인 모달은 현재 세션 반영 정책을 선택하게 한다.
- 탈퇴 처리 모달은 기록 보존과 익명화 정책을 명확히 보여준다.
- 정지 멤버로 로그인하면 쓰기 버튼이 비활성화되고 상태 안내가 보인다.
- 세션 편집 출석 섹션은 제외된 참가자를 기본 목록에서 숨기고 접힌 영역에서 보여준다.
- 호스트 대시보드는 현재 세션에 아직 없는 새 활성 멤버를 알림으로 보여준다.

### 15.3 E2E

- 호스트가 초대를 만들고, 새 멤버가 수락하면 옵션에 따라 현재 세션에 들어가거나 보류된다.
- 호스트가 보류된 새 멤버를 현재 세션에 추가하면 멤버가 RSVP와 질문 작성을 할 수 있다.
- 호스트가 멤버를 정지하면 해당 멤버는 기존 아카이브를 볼 수 있지만 현재 세션 질문 저장은 실패한다.
- 멤버가 탈퇴하면 일반 멤버 화면에서 과거 작성자명이 익명화된다.
- 호스트는 탈퇴 멤버를 운영 화면에서 실제 이름으로 확인한다.

## 16. 구현 순서 제안

1. DB migration: `memberships.status` 확장, `session_participants.participation_status`, `invitations.apply_to_current_session` 추가
2. 백엔드 권한 모델: `MembershipStatus` 확장, 활성/정지/탈퇴별 읽기와 쓰기 정책 분리
3. 세션 참가 조정 repository/API 추가
4. 초대 생성/수락 흐름에 `applyToCurrentSession` 반영
5. 호스트 멤버 목록과 상태 변경 API 추가
6. 일반 조회 쿼리에 `LEFT` 작성자 익명화 적용
7. 호스트 멤버 관리 허브 UI 구현
8. 정지/탈퇴/현재 세션 추가/제외 프론트 UX 구현
9. 백엔드, 프론트, E2E 테스트 추가

## 17. 최종 설계 요약

ReadMates의 멤버 라이프사이클은 장기 권한과 세션 참가를 분리한다. 멤버십 상태는 `ACTIVE`, `SUSPENDED`, `LEFT`, `INACTIVE`, `PENDING_APPROVAL`로 권한을 결정하고, 특정 세션 참가 여부는 `session_participants.participation_status`로 결정한다. 새 멤버 초대, 정지, 탈퇴는 현재 세션에 즉시 반영할지 다음 세션부터 반영할지 호스트가 선택한다. 정지는 읽기 가능/쓰기 제한이고, 탈퇴는 기록 보존/일반 화면 익명화다. 호스트는 운영 화면에서 실제 상태를 확인하고 필요한 현재 세션 조정을 수행한다.
