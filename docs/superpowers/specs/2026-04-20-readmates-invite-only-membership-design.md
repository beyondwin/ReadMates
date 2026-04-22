# ReadMates Invite-Only Membership Design

작성일: 2026-04-20
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates의 회원 가입, 초대, 멤버십 활성화 흐름을 dev/prod에서 같은 정책으로 정리하고, 호스트가 허락한 사람만 모임에 접근할 수 있게 만드는 구현 기준을 정의한다.

## 1. 배경

ReadMates는 이미 제품 문서와 화면 카피에서 `초대 기반 폐쇄형 독서모임`으로 정의되어 있다. 현재 코드도 그 방향의 기초는 갖고 있다.

- `users`, `memberships`, `invitations` 테이블이 있다.
- 앱 내부 API는 `ACTIVE` 멤버십이 있어야 접근할 수 있다.
- 호스트 API는 `HOST` 역할이 있어야 접근할 수 있다.
- `/invite/[token]` 화면과 `/api/invitations/{token}` preview 엔드포인트가 있다.

하지만 현재 초대 preview는 고정 샘플 응답이고, 초대 수락 컨트롤러는 없다. 특히 dev 환경의 `readmates.dev.google-oauth-auto-member-enabled=true`는 seed에 없는 Google 계정도 자동으로 데모 클럽 멤버로 만들 수 있어서, "호스트가 허락한 사람만 접근"이라는 제품 정책과 충돌한다.

이번 작업은 초대를 실제 권한 원장으로 만들고, Google 로그인은 신원 확인 수단으로만 사용하게 정리한다.

## 2. 확정된 제품 결정

- 호스트가 이메일을 입력해서 초대를 만든다.
- 앱은 초대 링크를 생성하고, 호스트가 링크를 복사해 카톡, 메일, DM 등으로 직접 전달한다.
- 앱에서 이메일 발송은 하지 않는다.
- 초대는 1회용이며 30일 뒤 만료된다.
- 초대 이메일과 Google verified email이 일치하면 즉시 `ACTIVE MEMBER`가 된다.
- 초대 수락 뒤 호스트의 추가 승인은 없다.
- 초대 수락 시 현재 열린 `OPEN` 세션이 있으면 새 멤버를 그 세션의 참가자로 자동 추가한다.

## 3. 목표

- 호스트가 멤버 초대를 생성, 확인, 취소할 수 있다.
- 초대받은 사용자가 초대 링크와 Google 로그인으로 멤버십을 활성화할 수 있다.
- 초대받지 않은 사용자는 Google 인증을 해도 앱 내부에 접근할 수 없다.
- dev 환경과 prod 환경의 권한 정책이 갈라지지 않는다.
- 현재 열린 세션이 있는 상태에서 새 멤버가 들어와도 바로 RSVP, 체크인, 질문 작성을 할 수 있다.

## 4. 비범위

- 앱에서 초대 이메일 발송
- 가입 신청과 호스트 승인 큐
- 초대 수락 후 추가 승인 단계
- 비밀번호 기반 회원 가입
- 멀티클럽 운영 UI
- 멤버 권한 세분화
- 멤버 삭제, 강퇴, 역할 변경 UI

## 5. 선택한 접근

초대장을 권한 원장으로 사용한다.

호스트가 이메일을 입력하면 `invitations`에 `PENDING` 초대가 생기고, 서버는 원문 토큰을 한 번만 반환한다. DB에는 원문 토큰을 저장하지 않고 `token_hash`만 저장한다. 초대받은 사람이 링크로 들어와 Google 로그인을 완료하면 서버가 토큰, 만료, 상태, 이메일 일치를 검증하고 그때 `users`와 `memberships`를 만든다.

이 접근을 선택한 이유:

- 현재 DB 구조와 가장 잘 맞는다.
- Google 로그인 전에는 `users.google_subject_id`를 알 수 없으므로 사용자를 미리 만들지 않아도 된다.
- 링크가 유출되어도 초대 이메일과 Google 이메일이 일치해야 하므로 접근 권한이 보호된다.
- 호스트가 허락한 이메일 목록만 멤버십으로 전환되므로 dev/prod 정책을 일관되게 유지할 수 있다.

버린 접근:

- 초대 생성 시 `INVITED` 멤버십을 미리 만드는 방식은 `users.google_subject_id not null` 구조와 맞지 않는다. 더미 subject를 넣거나 users 스키마를 느슨하게 만들어야 해서 도메인이 지저분해진다.
- 가입 신청 후 승인 방식은 공개 모집에는 맞지만, 현재 ReadMates의 폐쇄형 독서모임에는 운영 마찰이 크다.

## 6. 사용자 흐름

### 6.1 호스트 초대 생성

1. 호스트가 `/app/host/invitations`로 이동한다.
2. 이메일을 입력하고 초대를 생성한다.
3. 서버가 30일 만료 `PENDING` 초대를 만들고 원문 토큰을 반환한다.
4. 프론트는 `/invite/{token}` 링크를 보여준다.
5. 호스트는 링크를 복사해 직접 전달한다.

호스트 화면에는 초대 목록을 함께 보여준다.

- 대기
- 수락됨
- 만료됨
- 취소됨

원문 토큰은 저장하지 않으므로, 기존 초대 링크는 생성 직후에만 그대로 복사할 수 있다. 나중에 링크를 잃어버린 경우 호스트는 "새 링크 발급"을 누른다. 서버는 기존 `PENDING` 초대를 `REVOKED`로 바꾸고 새 초대를 만든다. 이 방식은 raw token 저장 없이 링크 재전달 UX를 제공한다.

### 6.2 초대 수락

1. 사용자가 `/invite/{token}` 링크를 연다.
2. 프론트가 preview API로 초대 상태를 읽는다.
3. 유효한 초대면 클럽명, 이메일 힌트, 만료일, Google 계속하기 버튼을 보여준다.
4. 사용자가 Google 로그인을 완료한다.
5. 로그인 뒤 다시 `/invite/{token}`으로 돌아온다.
6. 프론트가 `POST /api/invitations/{token}/accept`를 호출한다.
7. 서버가 초대 이메일과 인증 이메일을 비교한다.
8. 성공하면 멤버십을 활성화하고 `/app`으로 이동한다.

이메일이 다르면 멤버십을 만들지 않는다. 사용자는 초대받은 이메일의 Google 계정으로 다시 로그인해야 한다.

### 6.3 현재 열린 세션 자동 참가

초대 수락 시 같은 클럽에 `OPEN` 세션이 있으면 새 멤버를 `session_participants`에 추가한다.

- `rsvp_status = NO_RESPONSE`
- `attendance_status = UNKNOWN`

이미 참가자 row가 있으면 그대로 두거나 동일 값으로 갱신한다. 이렇게 하면 새 멤버가 들어오자마자 현재 세션 준비 화면을 사용할 수 있다.

## 7. 백엔드 API

### 7.1 `POST /api/host/invitations`

호스트 전용 초대 생성 API다.

요청:

```json
{
  "email": "new.member@example.com"
}
```

응답:

```json
{
  "invitationId": "uuid",
  "email": "new.member@example.com",
  "role": "MEMBER",
  "status": "PENDING",
  "expiresAt": "2026-05-20T12:00:00+09:00",
  "acceptedAt": null,
  "acceptUrl": "http://localhost:3000/invite/raw-token"
}
```

정책:

- 이메일은 trim 후 lowercase로 정규화한다.
- 1차 초대 role은 항상 `MEMBER`로 고정한다. 호스트 권한 초대와 역할 변경은 이번 범위에 포함하지 않는다.
- 이미 같은 클럽의 `ACTIVE` 멤버인 이메일이면 `409 Conflict`를 반환한다.
- 같은 이메일의 살아 있는 `PENDING` 초대가 있으면 기존 초대를 `REVOKED` 처리하고 새 토큰을 발급한다.
- 기존 raw token을 재사용하거나 DB에 저장하지 않는다.

### 7.2 `GET /api/host/invitations`

호스트 전용 초대 목록 API다.

응답 항목:

- `invitationId`
- `email`
- `role`
- `status`
- `effectiveStatus`
- `expiresAt`
- `acceptedAt`
- `createdAt`
- `canRevoke`
- `canReissue`

`effectiveStatus`는 `status = PENDING`이지만 `expires_at < now()`인 경우 `EXPIRED`로 계산해 반환한다. DB row를 조회 때마다 수정하지 않아도 된다.

### 7.3 `POST /api/host/invitations/{invitationId}/revoke`

호스트 전용 취소 API다.

정책:

- 같은 클럽의 초대만 취소할 수 있다.
- `PENDING`이고 아직 만료 전인 초대만 `REVOKED`로 바꾼다.
- 이미 수락, 만료, 취소된 초대는 상태를 바꾸지 않고 현재 상태를 반환한다.

### 7.4 `GET /api/invitations/{token}`

공개 preview API다.

응답:

```json
{
  "clubName": "읽는사이",
  "emailHint": "ne****@example.com",
  "status": "PENDING",
  "expiresAt": "2026-05-20T12:00:00+09:00",
  "canAccept": true
}
```

정책:

- 전체 이메일은 공개하지 않는다.
- 유효하지 않은 토큰은 `404 Not Found`를 반환한다.
- 만료된 초대는 `EXPIRED` preview를 반환한다.
- 취소된 초대는 `REVOKED` preview를 반환한다.
- 수락된 초대는 `ACCEPTED` preview를 반환한다.

### 7.5 `POST /api/invitations/{token}/accept`

인증된 사용자 전용 수락 API다. 요청 body는 받지 않는다.

성공 응답:

```json
{
  "authenticated": true,
  "membershipId": "uuid",
  "clubId": "uuid",
  "email": "new.member@example.com",
  "displayName": "New Member",
  "shortName": "New Member",
  "role": "MEMBER"
}
```

실패 코드:

- `401`: Google 또는 dev 세션 인증이 없음
- `403`: 인증 이메일과 초대 이메일 불일치
- `404`: 토큰 없음
- `409`: 이미 수락, 취소, 또는 만료된 초대

## 8. OAuth 연결

현재 프론트는 초대 화면에서 `/oauth2/authorization/google?inviteToken={token}`으로 이동할 수 있다. 이 값을 실제로 보존해야 초대 로그인 뒤 `/app`이 아니라 `/invite/{token}`으로 돌아올 수 있다.

백엔드 OAuth 시작 시점에 `inviteToken` query parameter를 HTTP session에 저장한다. OAuth 성공 핸들러는 session에 저장된 invite token이 있으면 `$READMATES_APP_BASE_URL/invite/{token}`으로 redirect한다. invite token이 없으면 기존처럼 `$READMATES_APP_BASE_URL/app`으로 redirect한다.

초대 수락 자체는 OAuth success handler가 직접 처리하지 않는다. 성공 핸들러는 초대 화면으로 돌려보내고, 프론트가 인증된 상태에서 `POST /api/invitations/{token}/accept`를 호출한다.

이 구조를 선택하는 이유:

- 초대 수락 실패를 프론트 화면에서 명확히 보여줄 수 있다.
- 이메일 불일치, 만료, 취소 같은 상태를 같은 `/invite/[token]` 페이지에서 처리할 수 있다.
- 기존 앱 진입 로직과 초대 수락 도메인 로직이 분리된다.

## 9. Dev/Prod 정책

prod에서는 초대 없이 멤버십을 자동 생성하는 경로가 없어야 한다.

dev에서도 같은 권한 원칙을 유지한다.

- `readmates.dev.google-oauth-auto-member-enabled` 기본값은 false로 바꾼다.
- seed 계정용 dev login은 유지한다.
- seed에 없는 Google 계정은 초대 수락을 거쳐야만 `ACTIVE` 멤버가 된다.
- 로컬에서 Google OAuth 설정 없이 초대 흐름을 테스트할 수 있도록 dev 전용 초대 수락 shortcut을 제공한다.

dev 전용 shortcut:

- `/invite/{token}`에서 `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`일 때만 보인다.
- 버튼 라벨은 `Dev: 초대 이메일로 수락`처럼 명확히 구분한다.
- 서버 endpoint는 `dev` profile과 `readmates.dev.login-enabled=true`에서만 등록한다.
- 이 endpoint도 반드시 유효한 `PENDING` 초대를 요구한다.
- 수락 로직은 prod accept와 같은 application service를 사용한다.
- 성공 시 초대 이메일로 Spring Security 세션을 만든다.

이 shortcut은 임의 가입 우회가 아니라, "유효한 초대가 있는 이메일만 활성화"하는 dev 편의 기능이다.

## 10. 데이터 모델과 마이그레이션

기존 `invitations` 테이블을 계속 사용한다.

현재 컬럼:

- `id`
- `club_id`
- `invited_by_membership_id`
- `invited_email`
- `role`
- `token_hash`
- `status`
- `expires_at`
- `accepted_at`
- `created_at`
- `updated_at`

추가 마이그레이션:

- `invitations.status` check constraint: `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`
- `invitations.role` check constraint: `MEMBER`, `HOST`
- `memberships.status` check constraint: `INVITED`, `ACTIVE`, `INACTIVE`
- `memberships.role` check constraint: `MEMBER`, `HOST`
- invitation lookup index: `(club_id, lower(invited_email))`
- invitation list index: `(club_id, created_at desc)`

`PENDING` 중복은 DB partial unique index로 강제하지 않는다. 만료 여부가 시간 의존적이라 DB constraint와 잘 맞지 않기 때문이다. 초대 생성 service가 같은 이메일의 살아 있는 `PENDING` 초대를 transaction 안에서 찾아 취소하고 새 초대를 만든다.

## 11. 토큰 정책

- 원문 토큰은 32 bytes 이상의 `SecureRandom` 값으로 만든다.
- URL-safe base64로 인코딩한다.
- DB에는 SHA-256 해시를 저장한다.
- preview와 accept 요청에서는 전달된 원문 토큰을 같은 방식으로 해시해 조회한다.
- 원문 토큰은 생성 응답에서만 반환한다.
- 토큰은 1회용이다. 수락 성공 시 초대 상태는 `ACCEPTED`가 된다.

## 12. 수락 트랜잭션

초대 수락은 하나의 transaction으로 처리한다.

1. token hash로 초대 row를 `for update` 조회한다.
2. `status = PENDING`인지 확인한다.
3. `expires_at >= now()`인지 확인한다.
4. 인증 이메일과 `invited_email`을 대소문자 무시 비교한다.
5. `users`를 email 기준으로 upsert한다.
6. `memberships`를 `(club_id, user_id)` 기준으로 upsert한다.
7. 기존 `INACTIVE` 멤버십이면 `ACTIVE`로 복구한다.
8. 기존 `ACTIVE` 멤버십이면 초대는 수락 처리하고 현재 멤버를 반환한다.
9. 초대를 `ACCEPTED`, `accepted_at = now()`로 갱신한다.
10. 현재 `OPEN` 세션이 있으면 `session_participants`를 upsert한다.
11. 활성 멤버 응답을 반환한다.

동시에 같은 토큰을 두 번 수락하면 `for update`와 상태 전환으로 한 요청만 성공한다.

## 13. 프론트 변경

### 13.1 호스트 초대 화면

새 route:

- `/app/host/invitations`

구성:

- 이메일 입력 폼
- 초대 생성 버튼
- 생성 직후 초대 링크 표시
- 링크 복사 버튼
- 초대 목록
- 취소 버튼
- 새 링크 발급 버튼

`/app/host` 대시보드에는 `멤버 초대` CTA를 추가한다.

호스트 화면에서는 운영자가 입력한 이메일이므로 전체 이메일을 보여준다. 공개 preview에서는 마스킹한다.

### 13.2 초대 수락 화면

기존 `/invite/[token]`을 실제 preview 기반 화면으로 바꾼다.

상태별 UI:

- `PENDING`: 클럽명, 이메일 힌트, 만료일, Google 계속하기 버튼
- `EXPIRED`: 호스트에게 새 초대를 요청하라는 안내
- `REVOKED`: 사용할 수 없는 초대 안내
- `ACCEPTED`: 이미 사용된 초대 안내와 로그인/앱 이동 버튼
- invalid token: 초대를 찾을 수 없음 안내
- email mismatch: 초대받은 이메일의 Google 계정으로 다시 로그인 안내

이미 인증된 사용자가 초대 페이지에 들어오면 Google 버튼 대신 `초대 수락` 버튼을 보여준다.

### 13.3 BFF와 fetch

기존 `/api/bff/**` 프록시를 유지한다.

- 호스트 초대 API는 BFF를 통해 호출한다.
- 초대 preview도 BFF를 통해 호출해 쿠키와 환경 차이를 줄인다.
- preview는 공개 API지만 BFF를 거쳐도 백엔드 보안 정책은 동일하다.

## 14. 보안 규칙

- 앱 내부 API는 `ACTIVE` 멤버십만 접근 가능하다.
- 호스트 API는 `ACTIVE HOST`만 접근 가능하다.
- `PENDING` 초대만으로는 앱 내부 API에 접근할 수 없다.
- accept API는 서버의 인증 이메일만 신뢰한다.
- 클라이언트가 전달한 email, role, membershipId는 받지 않는다.
- preview API는 전체 이메일을 노출하지 않는다.
- raw token은 DB에 저장하지 않는다.
- prod에서 dev login과 dev shortcut은 등록되지 않는다.
- 초대 취소와 새 링크 발급은 같은 클럽의 호스트만 할 수 있다.

## 15. 에러 처리

프론트는 백엔드 status와 error code를 사용자 문장으로 바꾼다.

- `INVITATION_NOT_FOUND`: 초대 링크를 찾을 수 없습니다.
- `INVITATION_EXPIRED`: 초대가 만료되었습니다. 호스트에게 새 초대를 요청해 주세요.
- `INVITATION_REVOKED`: 취소된 초대입니다.
- `INVITATION_ACCEPTED`: 이미 사용된 초대입니다.
- `INVITATION_EMAIL_MISMATCH`: 초대된 이메일과 로그인한 Google 이메일이 다릅니다.
- `MEMBER_ALREADY_ACTIVE`: 이미 활성 멤버입니다.

호스트 초대 생성 실패:

- 이메일 형식 오류는 inline validation으로 표시한다.
- 이미 활성 멤버인 이메일은 "이미 멤버입니다"로 표시한다.
- 서버 오류는 기존 앱의 일반 오류 패턴을 따른다.

## 16. 테스트 기준

백엔드 테스트:

- 호스트가 초대를 생성하면 `PENDING` row와 30일 만료 시간이 생긴다.
- 일반 멤버는 초대를 생성할 수 없다.
- 같은 이메일의 살아 있는 pending 초대를 다시 만들면 기존 초대가 취소되고 새 초대가 생긴다.
- preview는 유효한 초대의 마스킹 이메일과 상태를 반환한다.
- invalid token preview는 404를 반환한다.
- 초대 이메일과 인증 이메일이 일치하면 users, memberships, invitation이 갱신된다.
- 이메일 불일치면 멤버십이 생성되지 않는다.
- 만료, 취소, 이미 수락된 초대는 수락할 수 없다.
- 열린 세션이 있으면 수락 시 participant가 추가된다.
- 열린 세션이 없으면 수락은 성공하고 participant는 추가하지 않는다.
- dev Google auto-member는 초대 없이 멤버를 만들지 않는다.
- dev shortcut은 dev profile에서만 등록되고 유효한 초대를 요구한다.

프론트 테스트:

- 호스트 초대 화면이 이메일 입력, 생성, 링크 표시를 렌더링한다.
- 초대 목록이 상태별 액션을 올바르게 보여준다.
- invite page가 pending preview에서 Google 버튼을 보여준다.
- invite page가 expired/revoked/accepted/not found 상태를 보여준다.
- 인증된 초대 이메일 사용자는 accept 후 `/app`으로 이동한다.
- 이메일 불일치 응답은 앱 이동 없이 오류 상태로 남는다.

E2E 테스트:

- 호스트 dev login 후 초대 생성
- 생성된 링크로 이동
- dev shortcut으로 초대 수락
- 새 멤버가 `/app` 접근 가능
- 호스트가 만든 열린 세션에 새 멤버 participant가 자동 추가됨

## 17. 구현 순서

1. 초대 도메인 service와 repository를 만든다.
2. token 생성과 hash 유틸을 만든다.
3. 초대 관련 DB constraint와 index migration을 추가한다.
4. host invitation API를 구현한다.
5. public preview와 authenticated accept API를 구현한다.
6. OAuth invite token session 보존과 success redirect를 구현한다.
7. dev auto-member 정책을 초대 기반으로 정리한다.
8. dev-only 초대 수락 shortcut을 구현한다.
9. 프론트 host invitation 화면을 추가한다.
10. `/invite/[token]` 화면을 preview/accept 기반으로 바꾼다.
11. 대시보드 CTA와 테스트를 추가한다.
12. README의 invitation 상태와 dev OAuth 설명을 갱신한다.

## 18. 성공 기준

- 초대받지 않은 Google 계정은 dev/prod 모두에서 앱 내부 API에 접근할 수 없다.
- 호스트가 초대 링크를 만들고 직접 전달할 수 있다.
- 초대받은 이메일의 Google 계정은 30일 안에 링크를 수락해 바로 멤버가 된다.
- 수락된 멤버는 현재 열린 세션에도 자동으로 포함된다.
- dev 환경에서도 초대 없는 자동 멤버 생성이 사라진다.
- 기존 seed dev login과 호스트/멤버 데모 흐름은 유지된다.
