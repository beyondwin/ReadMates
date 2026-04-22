# ReadMates Product Design

작성일: 2026-04-19
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates를 `단일 클럽용 독서모임 워크스페이스`로 구현하기 위한 상세 기획 및 구현 기준을 정의한다. 이 문서는 프런트엔드, 백엔드, 데이터, 보안, 테스트, 반응형 모바일웹, 운영 기준을 하나의 기준서로 묶는다.

## 1. 문서 범위

이 문서는 아래 범위를 다룬다.

- 공개 홈, 공개 클럽, 공개 세션
- Google 로그인, 초대 수락, 초대 이메일 검증
- 멤버 홈, 이번 세션, 클럽 노트, 아카이브, 마이
- 호스트 운영 대시보드, 세션 생성/수정, 출석 확정, 공개 발행, HTML 피드백 리포트 업로드
- Next.js App Router 기반 프런트 구조
- Spring Boot Kotlin 기반 백엔드 구조
- PostgreSQL, Flyway, JDBC 기반 데이터 구현 기준
- 모바일웹 반응형 기준
- 예외 처리, 보안, 테스트, 운영 로그 기준

이 문서는 아래 범위를 다루지 않는다.

- 멀티클럽을 실제 운영하는 1차 기능
- 네이티브 모바일 앱
- 자동 요약, 자동 하이라이트 생성, AI 피드백 생성
- 채팅, 커뮤니티 피드 확장, 실시간 협업
- 대규모 분산 시스템, 메시지 브로커, Redis/S3 필수 도입

## 2. 확정된 의사결정

### 2.1 제품 방향

- ReadMates는 `단일 클럽 중심`으로 시작한다.
- 단, 모든 핵심 엔티티는 `clubId`를 가져서 향후 멀티클럽 확장이 가능해야 한다.
- 웹만 지원한다.
- 모바일은 `반응형 모바일웹`으로 지원한다.
- 앱은 지원하지 않는다.

### 2.2 운영 정책

- 멤버십은 `초대 기반 폐쇄형`이다.
- 게스트는 공개 페이지와 공개 기록만 열람할 수 있다.
- 운영 자동화는 `수동 운영 중심`이다.
- 호스트가 세션, 공개 요약, 하이라이트, 피드백 리포트를 직접 관리한다.

### 2.3 인증 정책

- 로그인은 `Google 로그인`만 지원한다.
- 초대 수락은 `초대된 이메일`과 `Google 계정 이메일`이 정확히 일치해야 한다.
- 일치하지 않으면 가입/활성화하지 않는다.

### 2.4 출시 범위

- 1차는 `시안 전체에 가까운 MVP`를 목표로 한다.
- 공개, 멤버, 호스트 화면 대부분을 1차 범위에 포함한다.

### 2.5 디자인 구현 정책

- 프런트의 디자인은 현재 저장소의 `design/` 폴더를 시각적 기준으로 삼는다.
- 구현 시 새로운 디자인 방향을 만들지 않는다.
- `design/src`, `design/src/mobile`, `design/styles`, `design/*.html`에 들어 있는 시안을 그대로 Next.js/React/TypeScript 구조로 옮긴다.
- 목적은 “디자인 재해석”이 아니라 “디자인 소스의 정확한 제품화”다.

### 2.6 구현 상태 메모: 2026-04-19

이 문서는 제품 목표와 구현 기준을 함께 담는다. 아래는 현재 코드와 대조한 런타임 상태다.

최신 구현 기준:

- 로컬 데모의 최신 데이터 기준은 `읽는사이` 단일 클럽, seed 1~6회차, 호스트가 생성하는 7회차다.
- 질문 우선순위는 최신 기준이 `1~5`다. `V2__session_core.sql`의 `1~3` 제약은 초기 스키마이고, `V4__allow_five_questions.sql`이 현재 제약을 `1~5`로 갱신한다.
- dev login, `/api/auth/me`, 현재 세션 조회, 7회차 생성, RSVP, 체크인, 질문 저장, 아카이브, 노트 피드, 마이 페이지 프로필/참석 수는 DB 기반이다.

부분 구현 또는 설계 샘플 상태:

- 공개 페이지는 현재 정적 프런트 페이지다. `/api/public/**` 백엔드 API는 아직 없다.
- 초대 preview는 고정 샘플 응답이고, 초대 수락 컨트롤러는 아직 없다.
- 현재 세션 조회는 세션 정보, 내 RSVP, 참가자 현황을 반환한다. 저장된 체크인과 질문을 다시 hydrate하는 응답은 아직 없다.
- 한줄평/장문 서평 저장 API는 validation 후 request echo만 한다.
- 호스트 대시보드 집계, 세션 수정, 출석 확정, 공개 발행은 아직 DB 업데이트가 아니라 샘플/echo 응답이다.
- 리포트 업로드는 로컬 파일 저장까지 구현되어 있다. `feedback_reports` 메타데이터 저장, 교체, 멤버별 권한 조회는 남아 있다.
- 일부 프런트 패널은 디자인 샘플 배열을 유지한다. 공개 쇼케이스, 멤버 홈 보조 콘텐츠, 아카이브의 리뷰/질문 탭, 마이 페이지 리포트/설정, 현재 세션 공동 보드, 호스트 편집 화면의 출석/리포트 보조 패널이 여기에 해당한다.

## 3. 제품 한 줄 정의

ReadMates는 `독서모임 운영 도구`가 아니라, `멤버가 다음 모임을 준비하고, 지난 생각을 다시 읽으러 돌아오는 조용한 워크스페이스`다.

## 4. 핵심 제품 원칙

### 4.1 멤버 우선

정보구조와 화면 우선순위는 호스트 운영 편의보다 멤버가 자주 들어오고 머무를 이유를 만드는 쪽으로 설계한다.

### 4.2 준비 중심

로그인 후 첫 화면의 목적은 `이번 세션 준비 완료`다. 홈과 이번 세션은 아래 행동을 가장 빠르게 끝낼 수 있어야 한다.

- RSVP 제출
- 읽기 체크인 작성
- 질문 작성
- 한줄평 또는 서평 작성

### 4.3 조용한 에디토리얼

전체 톤은 `종이, 여백, 메모, 발췌, 주석`의 감각을 유지한다.

- 마케팅 랜딩처럼 과장하지 않는다.
- 생산성 도구처럼 차갑게 만들지 않는다.
- 텍스트 위계와 읽기 흐름을 시각 중심보다 우선한다.

### 4.4 같은 제품, 다른 권한

- Guest는 입구다.
- Member는 중심 워크스페이스다.
- Host는 같은 워크스페이스에서 운영 권한만 확장된다.

호스트를 별도 백오피스 사용자처럼 분리하지 않는다.

## 5. 사용자 역할과 권한

### 5.1 Guest

목표:

- 클럽의 분위기와 수준을 이해한다.
- 공개된 기록을 보고 모임의 질을 체감한다.
- 로그인 또는 초대 수락으로 자연스럽게 이어진다.

가능:

- 공개 홈 보기
- 공개 클럽 보기
- 공개 세션 보기
- 공개 요약, 공개 하이라이트, 공개 한줄평 일부 보기

불가:

- 멤버 전용 질문 전체 보기
- 개인 피드백 리포트 보기
- 내부 노트/출석/체크인 전체 보기

### 5.2 Member

목표:

- 이번 세션 준비를 끝낸다.
- 다른 멤버의 기록을 읽는다.
- 자신의 기록을 축적하고 나중에 다시 찾는다.

가능:

- RSVP 수정
- 읽기 체크인 작성
- 질문 작성 및 수정
- 한줄평 작성
- 서평 작성
- 클럽 노트 열람
- 아카이브 열람
- 자신의 HTML 피드백 리포트 열람

### 5.3 Host

목표:

- 세션을 연다.
- 실제 참석을 확정한다.
- 공개 범위를 제어한다.
- 피드백 리포트를 안전하게 관리한다.

가능:

- 새 세션 생성 및 수정
- 초대 생성/재발송
- 참석 확정
- 공개 요약/공개 하이라이트/공개 한줄평 노출 제어
- HTML 피드백 리포트 업로드/교체

## 6. UX 계층과 정보 구조

제품은 아래 3개 계층으로 고정한다.

### 6.1 Public Showcase Layer

목적:

- 서비스 소개
- 공개 기록 노출
- 로그인/초대 수락 유도

구성:

- 공개 홈
- 공개 클럽
- 공개 세션
- 로그인
- 초대 수락

### 6.2 Member Workspace Layer

목적:

- 준비
- 읽기
- 기록 축적

구성:

- 홈
- 이번 세션
- 클럽 노트
- 아카이브
- 마이

### 6.3 Host Operations Layer

목적:

- 생성
- 확정
- 공개 제어
- 민감 자산 관리

구성:

- 운영 대시보드
- 세션 생성/수정
- 출석 확정
- 공개 발행
- 리포트 업로드

## 7. URL 구조

단일 클럽 제품이지만 내부 모델은 멀티클럽 확장을 대비한다. 1차 라우트는 단순한 public/app 구조를 사용한다.

### 7.1 공개 영역

- `/`
- `/about`
- `/sessions/[sessionId]`
- `/login`
- `/invite/[token]`

### 7.2 멤버 영역

- `/app`
- `/app/session/current`
- `/app/notes`
- `/app/archive`
- `/app/me`

### 7.3 호스트 영역

- `/app/host`
- `/app/host/sessions/new`
- `/app/host/sessions/[sessionId]/edit`
- `/app/host/sessions/[sessionId]/attendance`
- `/app/host/sessions/[sessionId]/publication`
- `/app/host/reports`

## 8. 디자인 소스 오브 트루스

프런트 구현은 아래 아티팩트를 기준으로 해야 한다.

- `design/src/pages-public.jsx`
- `design/src/pages-home.jsx`
- `design/src/pages-workspace.jsx`
- `design/src/pages-archive.jsx`
- `design/src/pages-host.jsx`
- `design/src/nav.jsx`
- `design/src/ui.jsx`
- `design/src/mobile/*.jsx`
- `design/styles/tokens.css`
- `design/styles/mobile.css`
- `design/읽는사이.html`
- `design/읽는사이 모바일.html`
- `design/읽는사이 모바일 (standalone).html`

### 8.1 구현 원칙

- 컴포넌트명, 섹션명, 레이아웃 비율, 여백, 타이포그래피 위계는 시안 기준을 최대한 그대로 유지한다.
- 색상과 토큰은 `design/styles/tokens.css`를 기준으로 이관한다.
- 모바일웹은 `design/src/mobile`과 모바일 HTML 시안을 기준으로 이관한다.
- 임의의 Tailwind 유틸리티 재설계보다, 명시적 컴포넌트와 CSS 변수 기반 스타일링을 우선한다.
- 디자이너 승인 없이 화면 구조를 단순화하거나 재배치하지 않는다.

### 8.2 이관 방식

- 시안 파일은 `reference-only`다.
- 실제 제품 코드는 Next.js 구조에 맞게 재구성한다.
- 비주얼은 같게 유지하되 상태 관리, 접근성, 서버 연동, 반응형 규칙은 제품 코드에서 재구현한다.

## 9. 프런트엔드 아키텍처

### 9.1 기술 기준

- Next.js App Router
- React 최신 안정 버전
- TypeScript
- Server Components 기본
- 상호작용 구간만 Client Components
- CSS 변수 + 모듈화된 스타일 구조

### 9.2 책임 분리

Next.js는 아래 두 가지 역할만 가진다.

1. SSR/RSC 렌더링
2. UI 친화적인 BFF 중계

비즈니스 규칙은 Next.js에 두지 않는다. 다음 규칙은 반드시 Spring Boot에서 최종 검증한다.

- 질문 최대 개수
- 초대 이메일 일치 여부
- 공개 가능 상태
- 리포트 접근 권한
- 세션 상태 전이

### 9.3 권장 디렉터리 구조

```text
front/
  app/
    (public)/
      page.tsx
      about/page.tsx
      sessions/[sessionId]/page.tsx
      login/page.tsx
      invite/[token]/page.tsx
    (app)/
      app/page.tsx
      app/session/current/page.tsx
      app/notes/page.tsx
      app/archive/page.tsx
      app/me/page.tsx
      app/host/page.tsx
      app/host/sessions/new/page.tsx
      app/host/sessions/[sessionId]/edit/page.tsx
      app/host/sessions/[sessionId]/attendance/page.tsx
      app/host/sessions/[sessionId]/publication/page.tsx
      app/host/reports/page.tsx
    api/
      bff/.../route.ts
    layout.tsx
    globals.css
  features/
    auth/
    public/
    home/
    current-session/
    club-notes/
    archive/
    my/
    host/
  shared/
    ui/
    lib/
    types/
    schemas/
    constants/
```

### 9.4 컴포넌트 구조 기준

- `page.tsx`는 얇게 유지한다.
- 섹션 단위 조합은 `features/*/components`로 이동한다.
- 데이터 패칭은 서버 쿼리 함수로 분리한다.
- 상태 변경은 form action 또는 route handler를 통해 BFF로 전달한다.
- 공통 UI는 `shared/ui`로 둔다.

### 9.5 상태 관리 기준

- 서버 상태는 SSR/RSC 기반으로 우선 처리한다.
- 전역 클라이언트 상태는 최소화한다.
- 로컬 입력 상태, 토글, 탭, 모달, 토스트만 클라이언트에서 관리한다.
- 낙관적 업데이트는 RSVP, 질문 저장, 체크인 저장처럼 UX 상 즉시성이 필요한 곳에만 사용한다.

## 10. 백엔드 아키텍처

### 10.1 기술 기준

- Spring Boot 4.x
- Kotlin 2.2.x
- Spring JDBC/JdbcTemplate for current DB-backed application paths
- PostgreSQL
- Spring Security OAuth2 Login
- Actuator + Micrometer Observation

### 10.2 기본 구조

브라우저는 Next.js와 통신한다.

- `Browser -> Next.js`
- `Next.js -> Spring Boot`
- `Spring Boot -> PostgreSQL`
- `Spring Boot -> Local Report Storage`

### 10.3 패키지 구조

```text
server/
  src/main/kotlin/com/readmates/
    auth/
    club/
    membership/
    invitation/
    session/
    note/
    archive/
    publication/
    report/
    shared/
```

각 기능 패키지는 내부적으로 아래 계층을 가진다.

- `api`
- `application`
- `domain`
- `infrastructure`

### 10.4 계층 책임

- `api`: Controller, request/response DTO, validation entry
- `application`: use case, transaction boundary, orchestration
- `domain`: entity, enum, policy, domain service, repository interface
- `infrastructure`: JDBC repository impl, external adapter, local file storage impl

### 10.5 확장성 기준

1차에서는 Redis와 S3를 도입하지 않는다.

대신 아래 포트 분리를 유지한다.

- `ReportStoragePort`
- `ClockPort`
- `IdentityProviderPort`
- `NotificationPort`

1차 구현체는 아래처럼 단순화한다.

- `LocalReportStorageAdapter`
- `SystemClockAdapter`
- `GoogleOidcAdapter`
- `NoopNotificationAdapter` 또는 간단한 이메일 어댑터

나중에 필요해지면 이 포트 뒤에 Redis, S3, 외부 알림 시스템을 붙인다.

## 11. 인증 및 세션 전략

### 11.1 로그인 흐름

1. 사용자가 `/login` 또는 `/invite/[token]`으로 진입한다.
2. Next.js가 로그인 UI를 렌더링한다.
3. Google 로그인 시작은 Spring Security OAuth2 흐름으로 위임한다.
4. Spring Boot가 Google OIDC에서 이메일을 수신한다.
5. 초대 수락 흐름이면 `invitedEmail == googleEmail`을 검사한다.
6. 일치하면 `User`와 `Membership`을 활성화한다.
7. 세션 쿠키를 발급한다.
8. 사용자는 `/app`으로 리다이렉트된다.

### 11.2 보안 기준

- 액세스 토큰을 브라우저 저장소에 저장하지 않는다.
- 세션은 `HttpOnly`, `Secure`, `SameSite=Lax` 이상을 사용한다.
- 호스트 API는 `role=HOST` 검증이 필수다.
- 멤버 API는 `membership.status=ACTIVE` 검증이 필수다.
- 초대 토큰은 해시 저장을 원칙으로 한다.

## 12. 도메인 모델

### 12.1 핵심 엔티티

#### Club

- 클럽 정체성
- 소개 문구
- 공개 정책 기본값
- 시작일
- cadence

#### User

- 전역 사용자
- Google subject id
- email
- display name
- status

#### Membership

- 특정 클럽에서의 사용자 상태
- `role: MEMBER | HOST`
- `status: INVITED | ACTIVE | INACTIVE`
- joinedAt

#### Invitation

- invitedEmail
- tokenHash
- expiresAt
- acceptedAt
- invitedByMembershipId
- status

#### Session

- 회차 번호
- 책 정보
- 일정/장소
- 질문 마감
- 공개 상태
- 운영 상태

#### SessionParticipant

- RSVP 상태
- 실제 참석 상태
- 참여 메타데이터

#### ReadingCheckin

- 세션 단위 읽기 진행률
- 메모
- 저장 시각

#### Question

- 우선순위
- 질문 본문
- draft thought
- 작성자
- 세션

#### OneLineReview

- 한줄평
- 공개 가능 여부

#### LongReview

- 서평 본문
- 개인 아카이브 자산

#### Highlight

- 공개 가능한 하이라이트 문장
- 수동 등록/편집

#### PublicSessionPublication

- 공개 요약
- 공개 여부
- 외부 노출 가능한 자산 목록

#### FeedbackReport

- 세션별 개인 HTML 피드백 리포트 메타데이터
- 저장 경로
- 버전
- 파일 크기
- 접근 권한

### 12.2 상태 전이

#### Invitation

- `PENDING -> ACCEPTED`
- `PENDING -> EXPIRED`
- `PENDING -> REVOKED`

#### Membership

- `INVITED -> ACTIVE`
- `ACTIVE -> INACTIVE`

#### Session

- `DRAFT -> OPEN -> CLOSED -> PUBLISHED`

#### RSVP

- `NO_RESPONSE | GOING | MAYBE | DECLINED`

#### Attendance

- `UNKNOWN | ATTENDED | ABSENT`

## 13. DB 스키마 초안

### 13.1 공통 규칙

- 모든 핵심 테이블은 `id`, `club_id`, `created_at`, `updated_at`를 가진다.
- 삭제는 hard delete보다 `status` 또는 `deleted_at`을 우선한다.
- 외래키는 명확히 유지한다.
- 조회 집계는 projection query를 허용한다.

### 13.2 테이블 목록

#### clubs

- id
- slug
- name
- tagline
- about
- cadence
- started_at
- visibility

#### users

- id
- google_subject_id
- email
- name
- profile_image_url
- status

#### memberships

- id
- club_id
- user_id
- role
- status
- joined_at

유니크:

- `(club_id, user_id)`

#### invitations

- id
- club_id
- invited_email
- token_hash
- status
- expires_at
- accepted_at
- invited_by_membership_id

#### sessions

- id
- club_id
- number
- title
- book_title
- book_subtitle
- book_author
- book_translator
- book_link
- session_date
- start_time
- end_time
- location_label
- meeting_url
- meeting_passcode
- question_deadline_at
- state
- visibility

유니크:

- `(club_id, number)`

#### session_participants

- id
- club_id
- session_id
- membership_id
- rsvp_status
- attendance_status
- responded_at
- attendance_confirmed_at

유니크:

- `(session_id, membership_id)`

#### reading_checkins

- id
- club_id
- session_id
- membership_id
- reading_progress
- note

유니크:

- `(session_id, membership_id)`

#### questions

- id
- club_id
- session_id
- membership_id
- priority
- text
- draft_thought
- status

제약:

- `priority`는 1~5를 허용한다.

유니크:

- `(session_id, membership_id, priority)`

#### one_line_reviews

- id
- club_id
- session_id
- membership_id
- text
- visibility

#### long_reviews

- id
- club_id
- session_id
- membership_id
- title
- body
- visibility

#### highlights

- id
- club_id
- session_id
- author_membership_id nullable
- text
- page nullable
- sort_order
- visibility

#### public_session_publications

- id
- club_id
- session_id
- public_summary
- is_public
- published_at
- published_by_membership_id

유니크:

- `(session_id)`

#### feedback_reports

- id
- club_id
- session_id
- membership_id
- version
- stored_path
- file_name
- content_type
- file_size
- uploaded_at
- uploaded_by_membership_id
- status

## 14. API 계약

REST를 기본으로 하되, 화면 조합에 필요한 집계 응답은 허용한다.

### 14.1 인증/초대

- `[구현됨] GET /api/auth/me`
- `[부분 구현] GET /api/invitations/{token}`: 고정 preview 응답만 반환한다.
- `[미구현] POST /api/invitations/accept`

### 14.2 공개 영역

- `[정적 프런트] /`, `/about`, `/sessions/session-13`
- `[미구현] GET /api/public/home`
- `[미구현] GET /api/public/club`
- `[미구현] GET /api/public/sessions`
- `[미구현] GET /api/public/sessions/{sessionId}`

### 14.3 멤버 홈/세션

- `[프런트 조합] GET /api/app/home`: 별도 백엔드 API 없이 프런트가 `/api/auth/me`와 `/api/sessions/current`를 조합한다.
- `[구현됨] GET /api/sessions/current`: 세션 정보, 내 RSVP, 참가자 현황을 반환한다. 저장된 체크인/질문 hydrate는 남아 있다.
- `[구현됨] PATCH /api/sessions/current/rsvp`
- `[구현됨] PUT /api/sessions/current/checkin`
- `[구현됨] POST /api/sessions/current/questions`: priority `1~5` 허용.
- `[미구현] PATCH /api/questions/{questionId}`
- `[스텁] POST /api/sessions/current/one-line-reviews`: validation 후 request echo.
- `[스텁] POST /api/sessions/current/reviews`: validation 후 request echo.

### 14.4 노트/아카이브

- `[구현됨] GET /api/notes/feed`
- `[구현됨] GET /api/archive/sessions`
- `[구현됨] GET /api/app/me`
- `[미구현] GET /api/archive/questions/me`
- `[미구현] GET /api/archive/reviews/me`
- `[스텁] GET /api/reports/me`: 샘플 리포트 목록.
- `[스텁] GET /api/reports/{reportId}/content`: 샘플 HTML과 CSP만 반환.

### 14.5 호스트 운영

- `[스텁] GET /api/host/dashboard`: 고정 집계값.
- `[미구현] POST /api/host/invitations`
- `[구현됨] POST /api/host/sessions`: 호스트 권한 확인, `max(number)+1`, `OPEN` 세션, 전체 활성 멤버 participant 생성.
- `[스텁] PATCH /api/host/sessions/{sessionId}`: validation 후 request echo.
- `[스텁] POST /api/host/sessions/{sessionId}/attendance`: validation 후 count echo.
- `[스텁] PUT /api/host/sessions/{sessionId}/publication`: validation 후 publish state echo.
- `[부분 구현] POST /api/host/reports`: HTML 파일 검증/로컬 저장. DB 메타데이터 저장은 남아 있다.
- `[미구현] PUT /api/host/reports/{reportId}/file`

## 15. 화면별 상세 명세

### 15.1 공개 홈

목적:

- ReadMates 소개
- 공개 기록 진입
- 로그인/초대 수락 유도

주요 섹션:

- 에디토리얼 히어로
- 다음 모임 카드
- 클럽 원칙 3개
- 공개 기록 미리보기
- 한 달 리듬 설명
- 로그인 CTA

### 15.2 공개 클럽

목적:

- 특정 클럽의 정체성 설명
- 운영 원칙 소개
- 공개 세션 목록 제공

주요 섹션:

- 클럽 소개
- 호스트 노트
- 운영 원칙
- 공개된 세션 목록

### 15.3 공개 세션

목적:

- 공개 요약, 공개 하이라이트, 공개 한줄평 제공
- 게스트에게 품질을 체감시키기

주요 섹션:

- 책/회차 정보
- 공개 요약
- 공개 하이라이트
- 공개 한줄평
- 로그인/초대 CTA

### 15.4 로그인 / 초대 수락

목적:

- Google 로그인 시작
- 초대 토큰과 이메일 검증

정책:

- 계정 생성 흐름을 노출하지 않는다.
- “초대 기반 운영” 문맥을 명확히 보여준다.
- 이메일 불일치 시 정확한 실패 이유를 보여준다.

### 15.5 멤버 홈

목적:

- 다음 세션 준비 상태를 한눈에 보여주기
- 바로 행동으로 이어지게 하기

주요 섹션:

- 인사 헤더
- Prep card
- Club pulse
- My recent
- Roster summary
- Next book hint
- Quick links

### 15.6 이번 세션

목적:

- 개인 준비와 공동 보드를 한 화면에서 제공

구조:

- Layer 01: 개인 준비
- Layer 02: 공동 보드

개인 준비 기능:

- RSVP
- Reading check-in
- Question 작성
- One line review
- Long review

공동 보드 기능:

- 질문 목록
- 읽기 흔적
- 하이라이트

### 15.7 클럽 노트

목적:

- 멤버들이 남긴 질문과 읽기 흔적을 내부 피드처럼 읽기

특징:

- 세션 중심보다 흐름 중심
- 작성보다 읽기 경험에 비중

### 15.8 아카이브

목적:

- 지난 세션과 내 기록을 회고

보기 탭:

- By session
- Reviews
- My questions
- 피드백 리포트

### 15.9 마이

목적:

- 계정
- 개인 리듬
- 알림 설정
- 리포트 바로가기

### 15.10 호스트 대시보드

목적:

- 지금 처리해야 할 운영 이슈를 한눈에 보기

구성:

- 미응답 RSVP
- 체크인 미작성
- 공개 대기 세션
- 리포트 등록 대기
- 운영 체크리스트
- 멤버 상태 요약
- Quick actions

### 15.11 세션 편집

목적:

- 책, 일정, 장소, 마감, 공개 설정을 수정

필수 필드:

- 제목
- 책 제목
- 저자/번역자
- 책 링크
- 모임 날짜
- 시작 시간
- 질문 마감
- 장소
- Zoom URL
- Zoom passcode
- 공개 범위

### 15.12 출석 확정

목적:

- 실제 참석 여부 확정
- RSVP와 실참석의 차이를 관리

### 15.13 공개 발행

목적:

- 공개 요약 입력
- 공개 하이라이트 편집
- 공개 한줄평 노출 제어

### 15.14 HTML 피드백 리포트 업로드

목적:

- 멤버별 HTML 리포트 업로드/교체

정책:

- 멤버별 리포트는 개별 자산이다.
- 호스트와 해당 멤버만 접근 가능하다.

## 16. HTML 리포트 처리 방식

### 16.1 저장 방식

- 1차는 서버 로컬 스토리지 또는 영속 볼륨을 사용한다.
- 파일 본문은 DB에 직접 넣지 않는다.
- DB에는 메타데이터와 저장 경로만 기록한다.

### 16.2 제공 방식

- HTML은 Spring Boot가 전용 엔드포인트에서 내려준다.
- 정적 퍼블릭 파일처럼 직접 노출하지 않는다.
- 접근 시 권한을 다시 검사한다.

### 16.3 보안 정책

- 앱 메인 DOM에 그대로 삽입하지 않는다.
- 문서 단위 응답으로 렌더링한다.
- 강한 CSP를 적용한다.
- 가능한 경우 스크립트 없는 HTML 형식을 우선한다.

## 17. 예외 처리와 사용자 피드백

표준 에러 응답 예시:

```json
{
  "code": "INVITATION_EMAIL_MISMATCH",
  "message": "초대된 이메일과 로그인한 Google 이메일이 일치하지 않습니다.",
  "traceId": "..."
}
```

표준 에러 코드:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `INVITATION_NOT_FOUND`
- `INVITATION_EXPIRED`
- `INVITATION_EMAIL_MISMATCH`
- `SESSION_NOT_OPEN`
- `QUESTION_LIMIT_EXCEEDED`
- `QUESTION_PRIORITY_CONFLICT`
- `REPORT_NOT_ACCESSIBLE`
- `VALIDATION_ERROR`
- `CONFLICT`

프런트 가이드:

- 복구 가능한 입력 오류는 인라인 메시지
- 저장 성공은 토스트
- 접근 권한 문제는 전용 empty/error state
- 인증 만료는 로그인 유도

## 18. 반응형 모바일웹 기준

### 18.1 원칙

- 같은 기능, 다른 밀도
- 모바일에서 기능 제거보다 순서 재배치
- 단일 열 중심
- 빠른 입력과 열람 우선

### 18.2 데스크톱

- 홈: 2열 이상 가능
- 세션: 개인 준비와 보조 패널 분리
- 호스트: 메인 패널 + 보조 패널 구조

### 18.3 모바일웹

- 상단 요약
- 본문 액션
- 보조 정보
- 피드/목록

모바일에서 절대 빠지면 안 되는 기능:

- RSVP
- 체크인
- 질문 작성
- 한줄평
- 리포트 열람
- 호스트 핵심 세션 편집

모바일 기준 시각 소스:

- `design/src/mobile/pages-home.jsx`
- `design/src/mobile/pages-session.jsx`
- `design/src/mobile/pages-public.jsx`
- `design/src/mobile/pages-archive-me.jsx`
- `design/src/mobile/pages-host.jsx`
- `design/styles/mobile.css`

## 19. 보안 기준

- Google OIDC 로그인
- 서버 세션 쿠키
- CSRF 대응
- role 기반 접근 제어
- membership 상태 기반 접근 제어
- 초대 토큰 해시 저장
- 리포트 접근 권한 재검사
- 공개 API는 발행된 데이터만 반환

## 20. 관측성과 운영 로그

1차에서도 아래 이벤트는 감사 로그 성격으로 남긴다.

- 로그인 성공/실패
- 초대 수락 성공/실패
- 세션 생성/수정
- 참석 확정
- 공개 발행
- 리포트 업로드/교체

모든 요청은 `traceId/requestId`를 남긴다.

## 21. 테스트 전략

### 21.1 도메인 단위 테스트

- 초대 이메일 일치 검증
- 질문 최대 개수 정책
- 질문 우선순위 중복 검증
- 세션 상태 전이
- 리포트 접근 권한

### 21.2 API 통합 테스트

- 인증 후 사용자 조회
- 초대 수락
- 현재 세션 조회
- 질문 저장/수정
- 공개 세션 조회
- 호스트 발행 흐름

### 21.3 프런트 테스트

- 핵심 폼 validation
- 주요 섹션 렌더링
- 인증 실패/권한 실패 상태
- 반응형 레이아웃 회귀

### 21.4 E2E 시나리오

- 게스트가 공개 세션을 보고 로그인으로 이동한다.
- 초대된 이메일로 Google 로그인하면 활성화된다.
- 다른 이메일로 로그인하면 실패한다.
- 멤버가 RSVP, 체크인, 질문을 저장한다.
- 호스트가 세션을 만들고 공개 발행한다.
- 멤버가 자신의 리포트를 열고, 다른 사람 리포트는 열지 못한다.

## 22. 구현 우선순위

아래 단계는 `출시 범위 축소`가 아니라 `구현 순서`를 의미한다. 전체 MVP 범위는 유지하되, 의존성이 큰 기능부터 순서대로 구현한다.

### Phase 1

- 인증/초대
- 공개 홈/클럽/세션
- 멤버 홈
- 현재 세션 기본 작성 기능
- 호스트 세션 생성/수정

### Phase 2

- 클럽 노트
- 아카이브
- 마이
- 호스트 대시보드 집계
- 공개 발행

### Phase 3

- HTML 리포트 관리 고도화
- 운영 로그 조회성 기능
- 알림 연결

## 23. 구현 품질 기준

- 페이지 파일은 얇게 유지한다.
- 프런트는 시안 재현을 우선한다.
- 비즈니스 규칙은 백엔드가 최종 보장한다.
- 조회와 쓰기 모델을 분리한다.
- 모바일웹에서 동일한 정보구조를 유지한다.
- 테스트 없는 핵심 정책은 완료로 간주하지 않는다.

## 24. 공식 참고 문서

- Next.js App Router: https://nextjs.org/docs/app
- Next.js Caching Guide: https://nextjs.org/docs/app/guides/caching
- React Server Components: https://react.dev/reference/rsc/server-components
- React `useEffectEvent`: https://react.dev/reference/react/useEffectEvent
- Spring Boot Kotlin Support: https://docs.spring.io/spring-boot/reference/features/kotlin.html
- Spring Boot Observability: https://docs.spring.io/spring-boot/reference/actuator/observability.html
- Spring Security OAuth2 Login: https://docs.enterprise.spring.io/spring-security/reference/servlet/oauth2/login/index.html
