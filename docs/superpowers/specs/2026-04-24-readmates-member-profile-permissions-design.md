# ReadMates Member Profile And Permission Management Design

작성일: 2026-04-24
상태: USER-APPROVED DESIGN SPEC
문서 목적: ReadMates의 멤버 표시 이름(`shortName`) 수정, 호스트 회원 관리, 페이지별 접근 권한을 현재 단일 클럽 구조에 맞게 정비하되, 나중의 멀티클럽 확장을 막지 않는 기준을 정의한다.

## 1. 배경

ReadMates는 초대 기반 독서모임이다. 현재 제품은 클럽 1개를 기준으로 동작하지만, 서버와 DB는 이미 `club_id`, `memberships`, `role`, `status`를 중심으로 권한을 판단한다. 기존 코드에는 다음 기반이 있다.

- `users.short_name` 컬럼이 있다.
- `/app/me`는 내 계정과 기록을 보여주지만 개인 설정은 읽기 전용이다.
- `/app/host/members`는 둘러보기 멤버, 활성 멤버, 정지됨, 탈퇴/비활성, 초대 탭을 갖고 있다.
- 호스트는 멤버를 정지, 복구, 탈퇴 처리하고 현재 열린 세션에 추가하거나 제외할 수 있다.
- `CurrentMember`에는 `clubId`, `membershipId`, `role`, `membershipStatus`가 있다.
- `LEFT` 멤버의 과거 기록은 일반 화면에서 `탈퇴한 멤버`로 익명화된다.

이번 정비는 사용자가 모임 안에서 보이는 짧은 이름을 직접 고칠 수 있게 하고, 호스트가 운영상 필요한 경우 같은 클럽 멤버의 짧은 이름을 정리할 수 있게 한다. 동시에 페이지별 접근 권한을 문서와 코드에서 같은 모델로 다루도록 만든다.

## 2. 확정된 제품 결정

- `shortName`은 사용자 본인과 같은 클럽의 활성 호스트가 수정할 수 있다.
- 현재 구현은 단일 클럽을 유지한다.
- 멀티클럽 전환 UI, 클럽 목록, 클럽 전환기는 이번 범위에 포함하지 않는다.
- 모든 앱 내부 권한 판단은 "현재 클럽의 membership" 기준으로 표현한다.
- `users.short_name`은 이번 구현에서 계속 사용한다.
- 나중에 사용자 1명이 여러 클럽에서 다른 별칭을 써야 하면 `membership_profiles` 같은 membership 단위 프로필로 분리한다.
- 페이지별 접근 권한은 프론트 route guard와 서버 API guard가 같은 상태 모델을 사용하게 정리한다.

## 3. 목표

- 사용자가 `/app/me`에서 본인 `shortName`을 수정할 수 있다.
- 호스트가 `/app/host/members`에서 같은 클럽 멤버의 `shortName`을 수정할 수 있다.
- `shortName` 입력값 검증과 오류 표시가 서버와 프론트에서 일관된다.
- 공개, 멤버, 호스트, 피드백 문서, 쓰기 API의 권한 경계를 표준화한다.
- `VIEWER`, `ACTIVE`, `SUSPENDED`, `LEFT`, `INACTIVE` 상태별 페이지 접근과 쓰기 제한을 명확히 한다.
- 모든 member/host API query와 mutation은 `CurrentMember.clubId`로 scope를 제한한다.
- 멀티클럽 확장 시 "현재 클럽 컨텍스트"만 교체하면 권한 모델이 이어질 수 있게 한다.

## 4. 비범위

- 클럽 전환 UI
- 여러 클럽 가입 목록 API
- 클럽별 호스트 권한 위임 UI
- role 세분화
- 프로필 이미지 업로드
- 이메일, Google subject, auth provider 변경
- 알림, 언어, 테마 설정 저장
- 상태 변경 사유 입력
- 멤버 운영 히스토리 또는 audit log 테이블
- `users.short_name`을 membership별 프로필 테이블로 분리하는 마이그레이션

## 5. 선택한 접근

기존 `users.short_name`을 유지하고, 본인 프로필 수정 API와 호스트 프로필 수정 API만 추가한다.

```text
PATCH /api/me/profile
PATCH /api/host/members/{membershipId}/profile
```

이 접근을 선택한 이유:

- 현재 화면과 API가 이미 `shortName`을 읽고 있다.
- 단일 클럽 단계에서는 `users.short_name`만으로 충분하다.
- 본인 수정과 호스트 수정의 권한 경계가 단순하다.
- `memberships.club_id`를 통해 같은 클럽 대상인지 검증할 수 있다.
- 멀티클럽이 실제로 필요해질 때 membership 단위 프로필로 옮기는 결정을 미룰 수 있다.

버린 접근:

- 사용자 본인만 수정하는 방식은 호스트가 이름 중복, 부적절한 이름, 초대/재가입 과정의 표시명 문제를 정리할 수 없다.
- 호스트만 수정하는 방식은 사용자가 자기 표시 이름을 직접 고칠 수 없어 불편하다.
- 지금부터 membership별 프로필 테이블을 만드는 방식은 멀티클럽 UI가 없는 현재 범위보다 앞서 나간다.

## 6. 상태와 권한 모델

ReadMates의 앱 내부 권한은 인증 여부, 현재 클럽 membership, role, status를 함께 본다.

| 상태/역할 | 의미 | 기본 권한 |
| --- | --- | --- |
| `ANONYMOUS` | 로그인하지 않은 사용자 | 공개 페이지, 로그인, 초대 preview |
| `VIEWER` | Google 로그인은 했지만 정식 멤버가 아닌 둘러보기 멤버 | 멤버 앱 읽기 일부, 쓰기 금지, 피드백 문서 금지 |
| `ACTIVE + MEMBER` | 정식 멤버 | 멤버 앱 읽기/쓰기, 참석 회차 피드백 문서 |
| `ACTIVE + HOST` | 활성 호스트 | 멤버 권한 + 호스트 앱 |
| `SUSPENDED` | 일시 정지된 멤버 | 기존 기록 읽기 중심, 쓰기 금지, 호스트 권한 없음 |
| `LEFT` | 탈퇴한 멤버 | 앱 내부 접근 금지, 과거 기록은 일반 화면에서 익명화 |
| `INACTIVE` | 거절 또는 관리상 비활성 | 앱 내부 접근 금지 |

서버 helper 기준:

- `canBrowseMemberContent`: `VIEWER`, `ACTIVE`, `SUSPENDED`
- `isActive`: `ACTIVE`
- `isHost`: `ACTIVE + HOST`
- 쓰기 API: `ACTIVE`가 기본 조건이고, 기능별로 현재 세션 참가, 마감, 참석 여부를 추가로 확인한다.
- 호스트 API: `ACTIVE + HOST`가 기본 조건이다.

## 7. 페이지별 접근 권한

프론트 route guard는 사용자에게 올바른 안내 화면을 보여주기 위한 1차 방어다. 최종 권한은 서버 API가 다시 검증한다.

| 페이지 또는 영역 | Anonymous | Viewer | Active Member | Active Host | Suspended | Left/Inactive |
| --- | --- | --- | --- | --- | --- | --- |
| `/`, `/about`, `/records`, `/sessions/:id` | 가능 | 가능 | 가능 | 가능 | 가능 | 가능 |
| `/login` | 가능 | 가능 | 가능 | 가능 | 가능 | 가능 |
| `/invite/:token` | 가능 | 가능 | 가능 | 가능 | 가능 | 제한 안내 |
| `/app` | 로그인 유도 | 읽기 제한 | 가능 | 가능 | 제한 읽기 | 차단 |
| `/app/session/current` | 로그인 유도 | 읽기만 | 읽기/쓰기 | 읽기/쓰기 | 읽기만 | 차단 |
| `/app/notes` | 로그인 유도 | 읽기 | 읽기 | 읽기 | 읽기 | 차단 |
| `/app/archive` | 로그인 유도 | 읽기 | 읽기 | 읽기 | 읽기 | 차단 |
| `/app/sessions/:sessionId` | 로그인 유도 | 읽기 | 읽기 | 읽기 | 읽기 | 차단 |
| `/app/feedback/:sessionId` | 로그인 유도 | 차단 | 참석 회차만 | 가능 | 차단 | 차단 |
| `/app/me` | 로그인 유도 | 가능 | 가능 | 가능 | 가능 | 차단 안내 |
| `/app/host/*` | 차단 | 차단 | 차단 | 가능 | 차단 | 차단 |

추가 정책:

- `VIEWER`와 `SUSPENDED`는 현재 세션, 노트, 아카이브에서 읽기 중심 화면을 볼 수 있지만 RSVP, 체크인, 질문, 한줄평, 장문 서평 저장은 할 수 없다.
- 피드백 문서는 기존 경계를 유지한다. 활성 호스트는 볼 수 있고, 활성 멤버는 본인이 참석한 회차만 볼 수 있다.
- `LEFT`와 `INACTIVE`가 앱 내부 route에 접근하면 앱 데이터를 보여주지 않고 차단 안내와 공개 소개/로그아웃 액션을 제공한다.

## 8. 프로필 수정 API

### 8.1 본인 프로필 수정

```text
PATCH /api/me/profile
```

요청:

```json
{
  "shortName": "현우"
}
```

응답:

```json
{
  "membershipId": "00000000-0000-0000-0000-000000000000",
  "displayName": "Kim Hyunwoo",
  "shortName": "현우",
  "profileImageUrl": "https://example.com/profile.png"
}
```

정책:

- 인증된 현재 멤버만 호출할 수 있다.
- `VIEWER`, `ACTIVE`, `SUSPENDED`는 수정할 수 있다.
- `LEFT`, `INACTIVE`는 수정할 수 없다.
- 이메일, Google subject, role, status, profile image는 이 API에서 바꾸지 않는다.
- 성공 후 `/api/auth/me`와 `/api/app/me`에서 새 `shortName`이 보이게 한다.

### 8.2 호스트가 멤버 프로필 수정

```text
PATCH /api/host/members/{membershipId}/profile
```

요청:

```json
{
  "shortName": "민지"
}
```

응답은 `HostMemberListItem`을 반환한다. 호스트 화면은 기존 row의 `shortName`, 상태, 현재 세션 액션 가능 여부를 한 번에 갱신할 수 있어야 한다.

정책:

- 호출자는 `ACTIVE + HOST`여야 한다.
- 대상 `membershipId`는 호출자의 `clubId` 안에 있어야 한다.
- 호스트는 같은 클럽의 `VIEWER`, `ACTIVE`, `SUSPENDED`, `LEFT`, `INACTIVE` 멤버의 `shortName`을 정리할 수 있다.
- 일반 화면에서 `LEFT` 멤버는 여전히 `탈퇴한 멤버`로 표시된다.
- 호스트 본인은 `/api/me/profile`로 수정하는 UX를 기본으로 한다.

## 9. `shortName` 검증 규칙

서버는 저장 전에 다음 규칙을 적용한다.

- trim 후 저장한다.
- 1자 이상, 20자 이하만 허용한다.
- 줄바꿈과 제어문자를 금지한다.
- 이메일 주소처럼 보이는 값은 금지한다.
- `http://`, `https://` 또는 도메인형 URL처럼 보이는 값은 금지한다.
- `탈퇴한 멤버`, `관리자`, `호스트`, `운영자` 같은 시스템성 이름은 금지한다.
- 같은 클럽 안에서 동일한 `shortName`은 충돌로 처리한다. 대상 본인의 현재 값과 같은 경우는 허용한다.

오류 응답은 프론트가 필드 아래에 보여줄 수 있게 명확한 code와 message를 반환한다.

예시:

```json
{
  "code": "SHORT_NAME_DUPLICATE",
  "message": "같은 클럽에서 이미 쓰고 있는 이름입니다."
}
```

## 10. 데이터와 표시 정책

이번 구현에서는 새 컬럼이 필요하지 않다.

- 저장 위치: `users.short_name`
- 본명 또는 Google 표시 이름: `users.name`
- 호스트 멤버 목록: `users.name`, `users.short_name`, `users.email`, `memberships.status`, `memberships.role` 표시
- 일반 멤버 화면: 최신 `users.short_name` 표시
- 탈퇴 멤버 일반 표시: `탈퇴한 멤버`가 `users.short_name`보다 우선

나중에 멀티클럽에서 클럽별 별칭이 필요해지면 아래처럼 분리한다.

```text
membership_profiles
  membership_id
  short_name
  created_at
  updated_at
```

그 전까지는 모든 API와 화면 설명에서 `shortName`을 "현재 클럽에서 보이는 짧은 이름"으로 다루되, 실제 저장소가 `users`에 있다는 구현 세부사항을 화면에 노출하지 않는다.

## 11. 프론트엔드 구조

### 11.1 `/app/me`

개인 설정의 "표시 이름" 항목을 읽기 전용에서 편집 가능으로 바꾼다.

- 현재 `displayName`, `email`, `shortName`을 보여준다.
- `shortName`만 입력 가능하다.
- 저장 중, 저장 성공, 검증 실패, 네트워크 실패 상태를 제공한다.
- 저장 성공 후 현재 route 데이터를 갱신한다.
- top nav나 mobile header가 auth context의 `shortName`을 쓰는 경우 auth state도 다시 불러온다.

### 11.2 `/app/host/members`

멤버 row에 `shortName` 편집 액션을 추가한다.

- row 안에서 바로 편집하거나 작은 dialog를 사용한다.
- 저장 성공 후 해당 row의 `shortName`을 갱신한다.
- 상태 변경 액션과 동시에 실행되지 않게 row pending state를 공유한다.
- 권한이 없거나 대상이 같은 클럽에 없으면 서버 오류를 그대로 보여주지 말고 "수정할 수 없는 멤버입니다"처럼 정리한다.

### 11.3 shared auth helper

프론트 권한 판단을 helper로 모은다.

- `canReadMemberContent(auth)`
- `canWriteMemberActivity(auth)`
- `canUseHostApp(auth)`
- `canEditOwnProfile(auth)`

피드백 문서 권한은 참석 여부가 필요하므로 서버 응답을 최종 기준으로 둔다.

## 12. 서버 구조

새 기능은 기존 `auth` slice 안에서 구현한다.

권장 경계:

```text
auth.adapter.in.web
  -> auth.application.port.in
  -> auth.application.service
  -> auth.application.port.out
  -> auth.adapter.out.persistence
```

구성:

- web DTO: `UpdateMemberProfileRequest`, `MemberProfileResponse`, `ProfileErrorResponse`
- inbound port: `UpdateOwnProfileUseCase`, `UpdateHostMemberProfileUseCase`
- application service: 입력 검증, 권한 확인, 같은 클럽 확인, 중복 확인
- outbound port: `MemberProfileStorePort`
- persistence adapter: `users.short_name` update와 same-club duplicate lookup

기존 전환된 서버 경계를 따라 controller가 `JdbcTemplate`이나 persistence adapter에 직접 의존하지 않게 한다.

## 13. 오류 처리

주요 오류:

| 상황 | HTTP | 코드 |
| --- | --- | --- |
| 비로그인 | `401` | `AUTHENTICATION_REQUIRED` |
| 호스트 권한 없음 | `403` | `HOST_ROLE_REQUIRED` |
| 앱 접근 불가 상태 | `403` | `MEMBERSHIP_NOT_ALLOWED` |
| 대상 멤버 없음 또는 다른 클럽 | `404` | `MEMBER_NOT_FOUND` |
| 빈 이름 | `400` | `SHORT_NAME_REQUIRED` |
| 너무 긴 이름 | `400` | `SHORT_NAME_TOO_LONG` |
| 금지 형식 | `400` | `SHORT_NAME_INVALID` |
| 시스템 예약어 | `400` | `SHORT_NAME_RESERVED` |
| 같은 클럽 중복 | `409` | `SHORT_NAME_DUPLICATE` |

프론트는 validation 오류를 필드 가까이에 표시하고, 권한 오류는 페이지 또는 dialog 수준 안내로 표시한다.

## 14. 테스트 계획

서버:

- 본인이 `shortName`을 수정할 수 있다.
- `VIEWER`, `ACTIVE`, `SUSPENDED`는 본인 프로필 수정이 가능하다.
- `LEFT`, `INACTIVE`는 본인 프로필 수정이 차단된다.
- 활성 호스트가 같은 클럽 멤버의 `shortName`을 수정할 수 있다.
- 호스트가 다른 클럽 membership을 수정할 수 없다.
- 비호스트가 host profile API를 호출하면 `403`이다.
- 빈 값, 너무 긴 값, 이메일/URL 형태, 예약어, 같은 클럽 중복이 거부된다.
- `LEFT` 멤버의 일반 기록 표시는 계속 `탈퇴한 멤버`다.

프론트:

- `/app/me`에서 `shortName` 수정 성공 후 표시가 갱신된다.
- `/app/me`에서 validation 오류가 필드 아래에 보인다.
- `/app/host/members`에서 호스트가 멤버 row의 `shortName`을 수정할 수 있다.
- 저장 중에는 같은 row의 상태 변경 액션과 중복 제출을 막는다.
- `VIEWER`와 `SUSPENDED`는 멤버 앱 읽기 route에 접근하지만 쓰기 버튼은 사용할 수 없다.
- `LEFT`와 `INACTIVE`는 앱 내부 route에서 차단 안내를 본다.
- `/app/host/*`는 `ACTIVE HOST`만 접근할 수 있다.

권장 확인 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
./server/gradlew -p server clean test
```

권한 guard나 BFF/auth 흐름을 바꾸는 구현이면 다음도 실행한다.

```bash
pnpm --dir front test:e2e
```

## 15. 후속 범위

- 상태 변경 사유 입력
- 멤버 운영 히스토리와 audit log
- 멤버 검색과 필터
- 클럽 전환 UI
- 사용자별 여러 클럽 membership 목록
- membership 단위 프로필 테이블
- 호스트 권한 위임과 마지막 호스트 이전 UX
- 프로필 이미지 숨김 또는 업로드 정책
