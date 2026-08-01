# ReadMates 게스트 둘러보기 설계

작성일: 2026-08-02
상태: DESIGN APPROVED — WRITTEN SPEC AWAITING USER REVIEW
대상 표면: frontend, public API, member app routing, BFF cache policy, server authorization, MySQL/Flyway, responsive UX
Canonical guest route: `/clubs/:slug/app/**`

## 1. 배경

ReadMates에는 현재 세 개의 서로 다른 이용 표면이 있다.

- 공개 사이트 `/clubs/:slug/**`: 로그인 없이 볼 수 있지만 `PUBLISHED + PUBLIC` 공개 기록만 제공한다.
- 멤버 앱 `/clubs/:slug/app/**`: Google 인증과 클럽 membership을 요구한다.
- 호스트 앱 `/clubs/:slug/app/host/**`: 같은 클럽의 활성 호스트만 접근한다.

현재 Google로 처음 들어온 사용자는 인증된 `VIEWER`, 즉 제품 문구상 `둘러보기 멤버`가 된다. 이번 기능의 게스트는 이 역할과 다르다. 게스트는 회원가입, Google 로그인, 사용자 계정, membership row가 전혀 없는 익명 방문자다.

사용자는 게스트가 기존 둘러보기 멤버처럼 클럽 앱의 구조와 실제 운영 기록을 충분히 둘러보되, 정식 멤버에게만 허용되는 피드백 문서와 쓰기 기능은 메뉴에서 존재를 알 수 있는 잠금 상태로 남기기를 원한다. 또한 다가오는 세션은 게스트 앱에서 보여야 하지만 공개 홈·클럽 소개·공개 기록에는 자동으로 나오면 안 된다.

현재 구현을 점검한 결과 다음 구조적 위험이 확인됐다.

- DB는 `DRAFT + PUBLIC`을 금지하지만 아키텍처 문서와 일부 조회 설명은 이를 허용한다고 적혀 있다.
- `PUBLIC` 하나가 게스트 앱 접근과 공개 홈페이지 게시라는 서로 다른 의미를 동시에 가진다.
- 기존 멤버 DTO에는 `membershipId`, `accountName`, 정확한 장소, 접속 링크, 비밀번호, 개인화된 `my*` 필드가 함께 들어 있다.
- BFF public cache key는 URL 기반이므로 로그인 쿠키에 따라 public 응답이 달라지면 다른 사용자에게 캐시가 섞일 수 있다.
- 공통 API client는 401을 받으면 로그인 페이지로 이동하므로 익명 게스트 조회에 그대로 사용할 수 없다.
- 피드백 직접 URL, 호스트 직접 URL, 다른 클럽의 session ID, 로그인 만료와 같은 우회 경로를 별도로 막지 않으면 메뉴 잠금만으로는 충분하지 않다.

이번 설계는 이 문제를 화면 조건문으로 덧붙이지 않고, 상태·접근·게시를 분리한 도메인 모델과 게스트 전용 안전 read projection으로 해결한다.

## 2. 목표

- 누구나 계정 없이 공개 클럽의 앱을 `게스트`로 둘러볼 수 있다.
- 로그인 페이지, 공개 홈, 클럽 소개, 공개 기록에서 `둘러보기` 진입점을 제공한다.
- 게스트는 홈, 현재·예정 세션, 클럽 노트, 아카이브와 세션 상세를 실제 데이터로 본다.
- 피드백, 알림, 설정, 개인 기록, 쓰기 기능은 숨기지 않고 잠금 또는 기능 미리보기로 설명한다.
- 게스트가 `멤버로 시작`을 선택하면 안전한 Google OAuth return path를 통해 같은 클럽·같은 화면으로 돌아온다.
- 세션 lifecycle, 게스트 접근, 공개 홈페이지 게시를 서로 다른 정책으로 관리한다.
- 게스트 응답에는 승인된 필드만 들어가며, 멤버 DTO를 재사용하지 않는다.
- 직접 URL, 교차 클럽, 비공개 클럽, 로그인 만료, 캐시, rate limit까지 fail closed로 동작한다.
- 모바일과 데스크톱에서 같은 정보 구조와 권한 의미를 유지한다.

## 3. 비목표

- 익명 사용자의 글쓰기, RSVP 변경, 체크인, 질문·서평 작성.
- 게스트 계정, 임시 계정, anonymous membership 또는 익명 세션 쿠키 생성.
- 기존 `VIEWER` membership 역할 제거.
- 피드백 문서의 공개 범위 변경.
- 호스트 운영 화면을 게스트에게 미리 보여주는 기능.
- 공개 홈·클럽 소개에 다가오는 세션을 추가하는 작업.
- 검색엔진에 게스트 앱 콘텐츠를 색인하는 작업.
- 정확한 장소를 자동으로 광역 위치로 변환하거나 접속 URL에서 온라인 여부를 추론하는 기능.
- 기존 공개 사이트의 전체 정보 구조 재설계.
- 레거시 공개 글의 일괄 재분류. 운영상 기존 글은 모두 외부 공개 상태이므로 별도 변환하지 않는다.

## 4. 용어와 사용자 상태

| 개념 | 내부 의미 | 사용자 문구 |
| --- | --- | --- |
| `GUEST` | 비로그인, 계정 없음, membership 없음 | `게스트` |
| `VIEWER` | Google 인증됨, 해당 클럽의 둘러보기 membership | `둘러보기 멤버` |
| `MEMBER` | 활성 정식 멤버 | `정식 멤버` |
| `HOST` | 활성 클럽 호스트 | `호스트` |

진입과 전환 문구는 다음으로 고정한다.

- 익명 진입 버튼: `둘러보기`
- Google OAuth 진입 버튼: `멤버로 시작`
- 게스트 상태 배지: `게스트`
- 게스트 종료 행동: `공개 홈으로 나가기`
- 인증된 사용자 종료 행동: `로그아웃`

`게스트`를 `VIEWER` 권한으로 승격하거나 익명 사용자를 `둘러보기 멤버`라고 부르지 않는다.

## 5. 검토한 접근

### A. 익명 사용자에게 기존 `ROLE_VIEWER` 부여

기존 멤버 API와 화면을 거의 그대로 재사용할 수 있다.

거절 이유:

- Spring Security role이 실제 인증·membership과 분리되어 권한 의미가 무너진다.
- 개인화 필드, 피드백 metadata와 내부 식별자가 익명 응답에 섞일 위험이 크다.
- 감사, 알림, 쓰기 권한에서 익명과 인증된 viewer를 계속 예외 처리해야 한다.

### B. 기존 멤버 API를 호출하고 프런트에서 민감 필드 숨김

화면 변경량은 작다.

거절 이유:

- 화면에서 보이지 않아도 브라우저 network response에는 민감 데이터가 남는다.
- 새 필드가 멤버 DTO에 추가될 때 자동으로 게스트에게 전달된다.
- public cache가 인증별 응답을 섞을 수 있다.
- 직접 URL과 비-UI 클라이언트 요청을 보호하지 못한다.

### C. 게스트 전용 public read projection과 기존 UI 공유 — 선택

게스트는 별도 public endpoint와 안전 DTO를 사용한다. 인증된 viewer/member/host는 기존 API를 사용한다. 렌더링 컴포넌트와 navigation shell만 audience-aware view model을 통해 공유한다.

선택 이유:

- 인증 경계를 약화하지 않는다.
- SQL, DTO, cache header와 frontend client까지 익명 경계를 독립적으로 검증할 수 있다.
- 새 필드는 명시적으로 allowlist에 추가하지 않으면 게스트에게 공개되지 않는다.
- 메뉴와 레이아웃을 공유해 게스트가 실제 앱 구조를 충분히 경험할 수 있다.

## 6. 핵심 공개 모델

기존 하나의 `visibility` 의미를 다음 세 축으로 분리한다.

### 6.1 세션 lifecycle

`DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED`는 운영 진행 상태만 나타낸다.

### 6.2 앱 접근 범위

세션이 클럽 앱에서 누구에게 읽히는지 나타낸다.

```text
HOST_ONLY
GUEST_READABLE
```

- `HOST_ONLY`: 호스트 운영 화면에서만 읽을 수 있다.
- `GUEST_READABLE`: 게스트, viewer, member, host가 클럽 앱 read surface에서 읽을 수 있다.

인증된 멤버가 볼 수 있는 기록과 익명 게스트가 볼 수 있는 기록을 별도 `MEMBER` 값으로 유지하지 않는다. 이 기능의 승인된 제품 정책은 피드백을 제외한 클럽 앱 기록을 게스트가 볼 수 있게 하는 것이므로, 앱 read audience는 host-only와 guest-readable 두 값이면 충분하다.

### 6.3 공개 사이트 게시

공개 홈·소개·공개 기록은 별도 `PUBLIC_RECORD` 게시 의도로 결정한다.

- 공개 사이트에는 `PUBLISHED`이면서 `PUBLIC_RECORD`로 게시된 세션만 나온다.
- `DRAFT`, `OPEN`, `CLOSED`는 게스트 앱에서 읽을 수 있어도 공개 사이트에는 나오지 않는다.
- 호스트는 `CLOSED` 발행 준비 단계에서 `PUBLIC_RECORD`를 미리 선택할 수 있지만, 실제 공개는 `PUBLISHED` 전환 후에만 시작된다.
- 게스트 앱은 익명 접근이 가능하지만 검색·마케팅 surface가 아니다.

### 6.4 상태별 노출 행렬

| lifecycle | 호스트 운영 | 게스트 앱 | 공개 홈·소개·공개 기록 |
| --- | --- | --- | --- |
| `DRAFT` | 항상 표시 | `GUEST_READABLE`이면 예정 세션으로 표시 | 표시하지 않음 |
| `OPEN` | 항상 표시 | `GUEST_READABLE`이면 현재 세션으로 표시 | 표시하지 않음 |
| `CLOSED` | 항상 표시 | `GUEST_READABLE`이면 아카이브에 표시 | 표시하지 않음 |
| `PUBLISHED` | 항상 표시 | `GUEST_READABLE`이면 노트·아카이브에 표시 | `PUBLIC_RECORD`일 때만 표시 |

새 세션은 기존 운영 안전성을 유지해 `HOST_ONLY`로 생성한다. 호스트가 책·일정 정보를 확인한 뒤 `게스트 공개`로 전환한다. “신규 데이터 공개”는 작성 중인 불완전한 host draft까지 자동 공개한다는 뜻이 아니라, 게스트 공개로 전환된 새 세션의 승인 필드를 공개한다는 뜻이다.

## 7. 저장 모델과 migration

### 7.1 Canonical fields

도메인의 canonical source of truth는 다음 두 필드다.

```text
sessions.access_scope = HOST_ONLY | GUEST_READABLE
public_session_publications.site_visibility = HIDDEN | PUBLIC_RECORD
```

`sessions.state`는 lifecycle source of truth로 유지한다.

### 7.2 Backfill

Flyway migration은 현재 값을 다음처럼 backfill한다.

| 기존 값 | `sessions.access_scope` |
| --- | --- |
| `HOST_ONLY` | `HOST_ONLY` |
| `MEMBER` | `GUEST_READABLE` |
| `PUBLIC` | `GUEST_READABLE` |

| 기존 publication 값 | `site_visibility` |
| --- | --- |
| 세션이 `CLOSED`/`PUBLISHED`, 기존 `MEMBER`/`PUBLIC`이고 publication `visibility = PUBLIC` 또는 호환 `is_public = true` | `PUBLIC_RECORD` |
| 그 외 | `HIDDEN` |

운영상 기존 글은 모두 외부 공개 상태이므로 콘텐츠 visibility를 일괄 변경하지 않는다. migration 전후에 값별 count만 검증하고 실제 글·사용자 데이터는 출력하거나 문서화하지 않는다.

### 7.3 Compatibility window

backend-first 배포와 이전 frontend 호환을 위해 첫 릴리스에서는 기존 `sessions.visibility`, `public_session_publications.visibility`, `is_public` 컬럼과 기존 API 필드를 유지한다.

- 새 read path는 canonical fields만 읽는다.
- 모든 host write path는 canonical fields와 compatibility fields를 같은 transaction에서 갱신한다.
- compatibility mapping은 하나의 persistence helper에만 둔다.
- DB migration test와 service test가 두 표현의 동등성을 검증한다.
- compatibility 컬럼은 이번 범위에서 제거하지 않는다. 제거 전에는 읽기 source of truth로 되돌리지 않는다.

Compatibility write mapping은 다음으로 고정한다.

| canonical state | 기존 compatibility 값 |
| --- | --- |
| `HOST_ONLY + HIDDEN` | `sessions.visibility = HOST_ONLY`, publication `visibility = MEMBER`, `is_public = false` |
| `GUEST_READABLE + HIDDEN` | `sessions.visibility = MEMBER`, publication `visibility = MEMBER`, `is_public = false` |
| `GUEST_READABLE + PUBLIC_RECORD` | `sessions.visibility = PUBLIC`, publication `visibility = PUBLIC`, `is_public = true` |

publication row가 아직 없으면 publication compatibility 값도 쓰지 않는다. `HOST_ONLY + PUBLIC_RECORD`는 mapping 대상이 아니라 거절 대상이다.

이 전략은 rolling deploy 중 이전 frontend를 깨뜨리지 않으면서 새 도메인 의미를 분리한다.

### 7.4 Invariants

- `access_scope`는 `HOST_ONLY`, `GUEST_READABLE`만 허용한다.
- `PUBLIC_RECORD`는 `CLOSED` 또는 `PUBLISHED`에서만 저장한다. `CLOSED`에서는 발행 의도일 뿐이고 실제 공개 효력이 없다.
- `DRAFT + GUEST_READABLE`은 유효하다.
- `HOST_ONLY + PUBLIC_RECORD` write는 application service가 거절하고, backfill은 이 조합을 `HIDDEN`으로 정규화한다.
- 공개 사이트 query는 `site_visibility = PUBLIC_RECORD`와 `state = PUBLISHED`를 모두 요구한다.
- 게스트 query는 `access_scope = GUEST_READABLE`을 요구한다.

기존 `sessions_draft_visibility_check`와 문서의 충돌은 새 invariant로 교체하고 architecture 문서를 함께 갱신한다.

## 8. 서버 경계

### 8.1 인증 경계

- `/api/public/clubs/{clubSlug}/browse/**`는 GET만 `permitAll`이다.
- 기존 `/api/sessions/**`, `/api/archive/**`, `/api/notes/**`, `/api/app/**`, `/api/feedback-documents/**`, `/api/host/**` 권한은 약화하지 않는다.
- 익명 authentication에 `ROLE_VIEWER`를 부여하지 않는다.
- mutation은 기존 `MEMBER`/`HOST` 권한을 유지한다.
- 게스트와 `VIEWER`는 피드백 본문을 읽지 못한다. 피드백은 활성 `MEMBER`/`HOST`이면서 기존 세션 참여·문서 가용성 규칙을 만족할 때만 읽는다.

### 8.2 게스트 endpoint

```text
GET /api/public/clubs/{clubSlug}/browse
GET /api/public/clubs/{clubSlug}/browse/sessions/current
GET /api/public/clubs/{clubSlug}/browse/sessions/upcoming?limit=&cursor=
GET /api/public/clubs/{clubSlug}/browse/notes?limit=&cursor=
GET /api/public/clubs/{clubSlug}/browse/archive?limit=&cursor=
GET /api/public/clubs/{clubSlug}/browse/archive/{sessionId}
```

첫 endpoint는 앱 shell에 필요한 클럽 이름, 로고/공개 이미지, 게스트 navigation capability만 반환한다. 나머지는 기존 화면 단위로 독립 loading/error/pagination이 가능하게 분리한다.

`clubSlug` path parameter가 public lookup의 source of truth다. 게스트 API client는 member app client가 자동으로 추가하는 `clubSlug` query/header context를 사용하지 않는다. 같은 요청에 상충하는 club context가 들어오면 fail closed한다.

### 8.3 공개 클럽 조건

모든 게스트 endpoint는 다음 조건을 만족하는 클럽만 반환한다.

```text
clubs.status = ACTIVE
clubs.public_visibility = PUBLIC
```

비공개·비활성·존재하지 않는 클럽은 모두 404로 통일한다. 다른 클럽의 `sessionId`도 404로 처리해 존재 여부를 노출하지 않는다.

### 8.4 안전 projection

게스트 adapter는 기존 member payload를 불러온 뒤 지우지 않는다.

1. SQL에서 허용된 컬럼만 select한다.
2. guest application result와 guest web DTO를 별도로 둔다.
3. controller response에 명시적 cache header를 설정한다.
4. contract test가 금지된 key가 JSON 어디에도 없는지 재귀적으로 검사한다.

새 필드는 guest DTO와 allowlist query에 명시적으로 추가해야만 공개된다.

## 9. 게스트 데이터 계약

### 9.1 포함 가능 필드

- 공개 resource 식별에 필요한 `sessionId`.
- 회차, 제목, 책 제목, 저자, 책 링크와 공개 이미지.
- 날짜, 시작·종료 시각, 질문 마감 시각.
- 공개 요약과 공개 하이라이트.
- 참석자의 표시 이름, 공개 아바타 key, RSVP 상태, 실제 참석 상태.
- 작성자 표시 이름이 붙은 질문, 질문 본문, `draftThought`.
- 승인된 공개 범위의 한줄평과 장문 서평.
- 세션 lifecycle과 게스트 화면 표시에 필요한 UI capability.

세션 resource ID는 공개 상세 route를 위해 허용하지만 사람을 식별하는 persistent ID는 허용하지 않는다.

### 9.2 절대 제외 필드

- `membershipId`, user ID, account ID 등 내부 사람 식별자.
- `accountName`, email, OAuth subject, membership 상태와 내부 role.
- 정확한 `locationLabel`.
- `meetingUrl`, `meetingPasscode`와 기타 접속 credential.
- `myRsvpStatus`, `myCheckin`, `myQuestions`, `myOneLineReview`, `myLongReview` 등 개인화된 `my*` 필드.
- 피드백 문서 본문, 제목, 파일명, 존재 여부, 업로드 시각, 버전, readable 상태.
- 호스트 audit, notification recipient, AI generation metadata.

현재 `locationLabel`은 자유 문자열이라 `온라인/오프라인`만 안전하게 분리할 수 없다. 게스트 v1은 위치 필드를 전부 생략한다. 이후 필요하면 명시적인 `meetingMode` enum을 별도 설계하고, 문자열이나 URL을 추론해 표시하지 않는다.

### 9.3 참석자 rendering key

게스트 응답에는 stable membership key를 제공하지 않는다. 프런트는 응답 순서와 표시용 compound value를 response-local React key로 사용한다. 같은 사람을 여러 세션에서 추적할 수 있는 hash나 opaque ID를 새로 만들지 않는다.

### 9.4 콘텐츠 visibility

- 운영상 기존 글은 모두 외부 공개 상태이므로 현재 `PUBLIC` 콘텐츠는 게스트에게 표시한다.
- 신규 글은 작성 UI에서 `게스트 공개`를 기본값으로 사용하고 저장 전에 공개 범위를 명확히 알린다.
- 예외적인 기존 `PRIVATE`, `SESSION` 값이 발견되면 자동 공개하지 않는다.
- 질문과 `draftThought`는 승인된 정책에 따라 게스트에게 표시한다.
- 피드백 문서는 콘텐츠와 metadata 모두 정식 멤버 전용이다.

## 10. 프런트엔드 architecture

### 10.1 Audience-aware app loader

`/clubs/:slug/app/**` loader는 로그인 강제 redirect부터 하지 않는다. 먼저 `/api/auth/me?clubSlug=...`의 permit-all 결과와 public club availability를 조합해 다음 audience를 결정한다.

```text
GUEST
VIEWER
MEMBER
HOST
```

- 비로그인 + 공개 활성 클럽: `GUEST`.
- 로그인 + 대상 클럽 membership 없음: 사용자가 명시적으로 `멤버로 시작`을 선택하기 전까지 대상 클럽에서는 `GUEST`.
- 인증된 viewer/member/host: 기존 membership audience.
- 비공개·비활성 클럽: 게스트 진입 불가. 기존 membership 접근은 기존 인증 lane에서 판단한다.
- suspended, left, inactive membership은 member 권한을 회복하지 않으며, 공개 클럽이라면 guest projection만 볼 수 있다.

### 10.2 API client 분리

게스트 read client는 기존 `readmatesFetchResponse`의 401 로그인 redirect 동작을 사용하지 않는다.

- guest endpoint의 401/403/404/429/5xx는 해당 route error state에서 처리한다.
- guest client는 member app의 자동 `clubSlug` query injection을 끈다.
- member mutation 중 401은 기존 session-expired 흐름을 유지한다.
- React Query key에는 `clubSlug`, `audience`, resource key를 모두 포함한다.
- guest와 member cache를 같은 query key로 공유하지 않는다.

### 10.3 Shared view model

동일 UI 컴포넌트는 서버 payload를 직접 구분하지 않고 공통 read-only view model을 받는다.

```text
Member response ─┐
                 ├─> Session/Note/Archive view model ─> shared UI
Guest response  ─┘
```

mutation callback, personal state와 sensitive link는 member adapter에서만 채운다. guest adapter는 read data와 capability만 채운다. 컴포넌트 내부에 role 문자열 비교를 흩뿌리지 않는다.

### 10.4 중앙 navigation capability

메뉴별 상태는 `OPEN`, `PREVIEW`, `LOCKED`, `DENY` 중 하나다. 등록되지 않은 새 메뉴는 기본 `LOCKED`다.

| 메뉴/route | 게스트 상태 | 행동 |
| --- | --- | --- |
| 홈 | `OPEN` | 실제 현재·예정·최근 기록 표시 |
| `session/current` | `OPEN` | 공개 현재 세션 표시, 쓰기 disabled |
| `notes` | `OPEN` | 공개 가능한 실제 노트 표시 |
| `archive` | `OPEN` | 게스트 공개 기록 표시 |
| `sessions/:sessionId` | `OPEN` | safe detail 표시 |
| `me` | `PREVIEW` | 가짜 개인정보 없이 기능 설명 |
| `me/records` | `PREVIEW` | 개인 기록이 생기는 방식을 설명 |
| `me/settings` | `LOCKED` | 계정이 필요한 기능 안내 |
| `notifications/**` | `LOCKED` | 계정·멤버십 필요 안내 |
| `feedback/:sessionId` | `LOCKED` | feedback API를 호출하지 않고 잠금 안내 |
| `feedback/:sessionId/print` | `LOCKED` | print payload 요청 없이 잠금 안내 |
| `host/**` | `DENY` | scoped guest home으로 이동, host API 호출 금지 |

잠금 메뉴를 숨기지 않는다. 클릭 시 무엇을 할 수 있는지와 정식 멤버가 되어야 하는 이유를 설명한다.

## 11. 진입·전환 UX

### 11.1 진입점

다음 표면에 `둘러보기`와 `멤버로 시작`을 함께 둔다.

- 로그인 페이지.
- 공개 홈 hero 또는 primary action 영역.
- 클럽 소개.
- 공개 기록 목록·상세의 자연스러운 전환 지점.

`둘러보기`가 익명 진입의 primary action이다. `멤버로 시작`은 Google 계정이 필요하다는 보조 설명을 가진다.

### 11.2 데스크톱

- app header에 `게스트` 배지를 표시한다.
- account 영역에는 `멤버로 시작`을 노출한다.
- 메뉴 구조는 member app과 동일하게 유지하되 capability에 따라 잠금 표시한다.
- `공개 홈으로 나가기`는 session API를 호출하지 않는다.

### 11.3 모바일

- header 또는 compact account row에 `게스트` 상태를 표시한다.
- 기존 bottom navigation 구조를 유지한다.
- content를 가리는 상시 sticky OAuth CTA는 사용하지 않는다.
- 내 공간 preview와 잠금 bottom sheet에서 `멤버로 시작`을 제공한다.
- 잠금 안내, 닫기, 뒤로가기의 터치 영역은 최소 44px이다.

### 11.4 OAuth 전환

- 현재 route의 same-origin relative path만 `returnTo`로 전달한다.
- existing signed return-state allowlist와 control-character/backslash 차단을 유지한다.
- OAuth 성공 후 같은 club-scoped 화면으로 복귀한다.
- 공개 활성 클럽에서 `멤버로 시작`을 명시적으로 선택한 경우에만 signed target club context로 해당 클럽의 `VIEWER` membership을 생성한다.
- 다른 클럽의 기존 membership은 target club 권한으로 사용하지 않고, target 이외 클럽에 membership을 만들지 않는다.
- target club에 suspended, left, inactive membership이 있으면 새 `VIEWER`로 덮어쓰지 않고 기존 복구·승인 절차를 유지한다.
- Google 인증만으로 피드백 접근이 보장되지 않는다. 잠금 안내는 `Google로 시작한 뒤 호스트의 정식 멤버 승인이 필요합니다.`라고 명확히 설명한다.

### 11.5 로그인 만료

- read-only member 화면에서 세션이 만료되고 클럽이 공개 상태라면 재로그인과 게스트로 계속 보기 선택을 제공한다.
- 작성 중 mutation 화면은 자동으로 guest lane으로 바꾸지 않는다.
- 작성 중 입력을 메모리에 보존하고 재로그인 안내를 우선한다.
- 계정이 필요한 화면에서 guest로 계속 보기를 고르면 scoped guest home으로 이동한다.

## 12. 공개 사이트와 SEO 경계

- 공개 홈·소개·공개 기록은 기존처럼 `PUBLISHED + PUBLIC_RECORD`만 보여준다.
- 다가오는 `DRAFT`, 현재 `OPEN`, 정리 중 `CLOSED`는 공개 사이트에 추가하지 않는다.
- `/clubs/:slug/app/**`는 audience와 무관하게 `noindex`다.
- `noindex`를 보안 장치로 취급하지 않는다. 실제 보호는 safe DTO와 authorization/query 조건이 담당한다.
- invite token과 OAuth state는 canonical URL이나 analytics payload에 포함하지 않는다.

## 13. Cache, rate limit, abuse 방어

### 13.1 Cache

첫 릴리스의 게스트 browse endpoint는 모두 다음 header를 사용한다.

```text
Cache-Control: no-store
```

공개 마케팅 endpoint의 기존 cache 정책은 유지한다. 게스트 browse를 관찰한 뒤 immutable에 가까운 `PUBLISHED` archive만 별도 TTL로 최적화할 수 있지만 이번 범위에서는 캐시하지 않는다.

추후 캐시를 허용하더라도 다음 invariant를 지킨다.

- public response는 Cookie/Authorization 유무에 따라 달라지지 않는다.
- `Vary: Cookie`에 의존해 민감 응답을 public cache에 넣지 않는다.
- cache key에는 club slug와 전체 paging/filter query가 포함된다.
- visibility 변경과 record update 이후 관련 cache를 무효화한다.

### 13.2 Rate limit과 query budget

- guest browse GET은 trusted BFF client IP hash와 club slug 기준으로 분당 120회 제한한다.
- cursor 목록은 기본 20개, 최대 50개다.
- current/detail query 수는 fixture 크기와 무관한 고정 budget을 가진다.
- attendee, question, review collection에 response 상한을 두고 pagination 또는 명시적 truncation metadata를 사용한다.
- rate-limit key, metric label과 log에 raw IP, display name, session token, member ID를 넣지 않는다.
- 429는 `Retry-After`와 게스트 화면의 재시도 안내로 처리한다.

## 14. Error handling

| 상황 | 결과 |
| --- | --- |
| 공개 클럽이 아님 | 게스트 404 |
| 다른 클럽 session ID | 404 |
| guest-readable이 아닌 세션 | 404 |
| 피드백 직접 URL | 민감 API 요청 없는 잠금 화면 |
| 호스트 직접 URL | scoped guest home으로 이동, host API 요청 없음 |
| guest API 401/403 | 로그인 강제 이동 없이 route 오류로 처리 |
| guest API 429 | `Retry-After` 기반 재시도 안내 |
| 일부 홈 widget 실패 | 성공한 widget 유지, 실패한 영역만 재시도 |
| OAuth returnTo 불일치 | 안전한 scoped app root로 fallback |
| member session 만료 중 작성 | 입력 보존, 명시적 재로그인 |

권한 실패를 빈 데이터처럼 위장하지 않는다. 빈 목록과 접근 불가를 서로 다른 UI 상태로 표현한다.

## 15. 접근성

- 잠금 상태는 자물쇠 아이콘만으로 표현하지 않고 텍스트를 함께 제공한다.
- modal/bottom sheet는 focus trap, Escape, backdrop close, focus return을 지원한다.
- 잠금 메뉴도 keyboard로 도달할 수 있고 Enter/Space로 안내를 연다.
- 상태 배지와 RSVP/attendance는 색상 외 텍스트를 포함한다.
- CTA와 navigation touch target은 최소 44×44px이다.
- member conversion 후 동일 route로 돌아와 focus가 예측 가능한 heading으로 이동한다.
- screen reader용 메뉴 명칭은 `피드백, 정식 멤버 전용`처럼 상태를 포함한다.

## 16. 관찰성과 개인정보

- guest endpoint latency, 4xx/5xx, 429, payload size와 query count를 측정한다.
- metric label은 endpoint template, status class, club의 비식별 stable key만 사용한다.
- 표시 이름, 질문, 서평, `draftThought`, RSVP/attendance 값을 log나 error metadata에 넣지 않는다.
- frontend observability event에는 route template, audience, error code만 넣는다.
- 피드백 route 잠금에서 session feedback 존재 여부를 조회하거나 기록하지 않는다.
- 실제 데이터 표본을 docs, test fixture, screenshot filename, commit message에 복사하지 않는다.

## 17. Rollout과 rollback

### 17.1 배포 순서

1. Expand migration: canonical fields와 constraint를 추가하고 기존 값을 backfill한다.
2. Backend: guest endpoints, safe projection, new policy와 compatibility writes를 배포한다.
3. Backend health/contract evidence를 확인한다.
4. Frontend: audience-aware loader, entry CTA, guest UI와 locked routes를 배포한다.
5. 브라우저에서 desktop/mobile guest, viewer, member, host matrix를 확인한다.
6. 첫 릴리스에서는 compatibility field를 유지하고, 제거는 별도 승인·migration을 요구하는 후속 작업으로 남긴다.

backend가 준비되기 전에는 frontend guest entry를 배포하지 않는다.

### 17.2 Rollback

- frontend rollback은 기존 로그인 강제 member app으로 돌아가며 backend guest GET은 사용되지 않는다.
- backend rollback을 위해 compatibility fields를 첫 릴리스에서 제거하지 않는다.
- backfill은 기존 visibility 값을 파괴하지 않는다.
- guest endpoints는 read-only이므로 rollback 시 사용자 작성 데이터 손실이 없다.

## 18. 테스트 전략

### 18.1 Server actor matrix

각 endpoint를 다음 조합으로 검증한다.

- actor: anonymous, viewer, member, host.
- club: active+public, active+private, inactive, other club.
- session: DRAFT, OPEN, CLOSED, PUBLISHED.
- access: HOST_ONLY, GUEST_READABLE.
- public site: HIDDEN, PUBLIC_RECORD.
- content: PUBLIC, SESSION, PRIVATE.

중요 assertion:

- anonymous은 public active club의 GUEST_READABLE만 읽는다.
- viewer/member/host의 기존 write 권한은 변하지 않는다.
- 다른 클럽 ID와 host-only ID는 404다.
- PUBLIC_RECORD는 PUBLISHED에서만 public marketing API에 나온다.
- DRAFT+GUEST_READABLE은 upcoming guest API에 나오지만 marketing API에는 나오지 않는다.

### 18.2 Negative DTO contract

게스트 JSON 전체 key를 재귀 순회해 다음 key가 없음을 검증한다.

```text
membershipId
accountName
email
locationLabel
meetingUrl
meetingPasscode
myRsvpStatus
myCheckin
myQuestions
myOneLineReview
myLongReview
feedbackDocument
```

피드백 제목·존재 여부도 별도 값 assertion으로 확인한다.

### 18.3 Migration과 compatibility

- 기존 HOST_ONLY/MEMBER/PUBLIC backfill mapping.
- DRAFT+GUEST_READABLE 유효성.
- DRAFT/OPEN+PUBLIC_RECORD write 거절.
- CLOSED+PUBLIC_RECORD 저장은 허용하지만 공개 marketing API에는 나오지 않음.
- HOST_ONLY+PUBLIC_RECORD write 거절과 backfill HIDDEN 정규화.
- canonical/compatibility dual-write 동등성.
- Flyway latest와 upgrade-before-latest fixture.
- 운영 데이터 검증은 값별 count만 출력하고 실제 콘텐츠를 출력하지 않는다.

### 18.4 BFF와 client

- Cookie가 있는 요청과 없는 요청의 guest response가 동일하다.
- `Cache-Control: no-store` response는 `caches.default`에 저장되지 않는다.
- guest client의 401이 `/login` redirect를 만들지 않는다.
- member client의 기존 401 redirect 회귀가 없다.
- guest client는 implicit `clubSlug` query를 붙이지 않는다.
- query key가 club과 audience를 격리한다.

### 18.5 Route와 UX

- login/public home/about/records에 두 진입 CTA가 있다.
- 게스트는 모든 일반 멤버 navigation을 볼 수 있다. 역할 전용 host/admin navigation은 노출하지 않는다.
- OPEN/PREVIEW/LOCKED/DENY가 중앙 capability와 일치한다.
- 피드백·print 직접 URL에서 feedback fetch가 0회다.
- host 직접 URL에서 host fetch가 0회다.
- OAuth returnTo가 같은 scoped route로 돌아온다.
- target club membership이 없는 로그인 사용자는 `멤버로 시작`을 명시적으로 선택하기 전에는 권한을 자동 획득하지 않는다.
- signed target club context의 명시적 전환만 해당 클럽 `VIEWER`를 만들고 다른 클럽에는 영향을 주지 않는다.
- 로그인 만료 중 작성 데이터가 사라지지 않는다.
- 320px, 390px 모바일과 대표 desktop viewport에서 navigation, lock sheet, CTA가 겹치지 않는다.
- keyboard, focus, screen reader label을 확인한다.

### 18.6 회귀 검증

구현 계획은 최소 다음 명령을 포함한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

브라우저 증거는 guest/member 경계를 desktop과 mobile에서 각각 남긴다. 실제 OAuth, 이메일, AI provider와 같은 billable/user-impacting smoke는 별도 승인 없이 실행하지 않는다.

## 19. 문서 동기화

구현과 함께 최소 다음 문서를 현재 동작에 맞춘다.

- `docs/development/architecture.md`: public site, guest app, viewer/member/host 표면과 3축 공개 모델.
- `docs/development/project-map.md`: guest route, public read adapter와 frontend audience boundary.
- `docs/development/acceptance-matrix.md`: anonymous actor, DTO negative assertions, BFF cache identity invariant.
- 관련 API/운영 문서: host 공개 설정 문구와 rollout compatibility.
- `CHANGELOG.md`의 Unreleased: 익명 guest browsing과 권한/공개 모델 변경.

`멤버 공개`, `외부 공개`, `PUBLIC`을 게스트 앱 접근 의미로 사용하는 오래된 설명은 함께 제거하거나 compatibility 표현임을 명시한다.

## 20. 완료 기준

- 계정 없이 `둘러보기`로 공개 클럽 앱에 진입할 수 있다.
- 게스트가 실제 현재·예정 세션, 노트, 아카이브와 상세를 읽을 수 있다.
- 공개 홈에는 기존처럼 PUBLISHED+PUBLIC_RECORD만 나온다.
- 피드백과 개인·알림·설정·host 기능은 보이지만 안전하게 잠겨 있다.
- 승인된 표시 이름, RSVP, 참석 상태, 질문, `draftThought`, 공개 서평만 guest response에 있다.
- 내부 사람 ID, 계정명, 정확한 장소, 접속 정보, 개인화 필드, 피드백 metadata가 guest response에 없다.
- guest API가 인증 쿠키, 다른 club context와 public cache에 의해 변하지 않는다.
- direct URL과 세션 만료가 권한 우회나 데이터 손실을 만들지 않는다.
- 모바일과 데스크톱에서 guest 상태, 메뉴 잠금, member conversion이 자연스럽다.
- DB, architecture docs와 실제 query가 같은 3축 공개 규칙을 사용한다.
- actor/access/content matrix와 negative contract tests가 통과한다.

## 21. 승인된 결정 요약

- 익명 상태 명칭은 `게스트`다.
- 익명 진입은 `둘러보기`, OAuth 전환은 `멤버로 시작`이다.
- 게스트는 existing viewer와 다른 무계정 상태다.
- 메뉴는 숨기지 않고 잠금 또는 preview로 보여준다.
- 현재·예정 세션, 클럽 노트, 아카이브는 게스트에게 실제 데이터로 제공한다.
- 참석자 표시 이름, RSVP, 실제 참석 상태, 작성자 이름, 질문과 `draftThought`, 공개 서평은 게스트에게 표시한다.
- 정확한 장소, 접속 링크·비밀번호, 내부 사람 ID, 계정명, 개인화 필드와 피드백 전체는 제외한다.
- 공개 홈페이지와 게스트 앱은 별도 surface다.
- 세션 lifecycle, guest access, public record publication을 분리한다.
- 운영상 기존 글은 모두 외부 공개이므로 레거시 콘텐츠 변환은 하지 않는다.
- 예외적인 PRIVATE/SESSION 값은 자동 공개하지 않는 안전장치를 유지한다.
- guest UI는 desktop/mobile 모두 지원하고, OAuth 후 안전한 동일 route 복귀를 제공한다.
