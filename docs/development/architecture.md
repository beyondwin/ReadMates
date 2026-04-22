# 아키텍처

ReadMates는 소규모 정기 독서모임의 공개 소개, 멤버 세션 준비, 호스트 운영, 공개 기록, 참석자 전용 피드백 문서를 하나의 서비스 흐름으로 묶습니다.

## 제품 표면

| 표면 | 주요 route | 사용자 | 역할 |
| --- | --- | --- | --- |
| 공개 사이트 | `/`, `/about`, `/records`, `/sessions/:sessionId`, `/login`, `/invite/:token` | 게스트, 로그인 사용자 | 모임 소개, 공개 기록, 공개 세션 상세, Google OAuth 시작, 초대 수락 진입 |
| 멤버 앱 | `/app`, `/app/session/current`, `/app/notes`, `/app/archive`, `/app/sessions/:sessionId`, `/app/feedback/:sessionId`, `/app/me` | 둘러보기 멤버, 정식 멤버, 호스트 | 현재 세션 확인, RSVP, 읽은 분량, 질문, 한줄평, 장문 서평, 아카이브, 참석 회차 피드백 문서 |
| 호스트 앱 | `/app/host`, `/app/host/members`, `/app/host/invitations`, `/app/host/sessions/new`, `/app/host/sessions/:sessionId/edit` | 호스트 | 세션 생성/수정, 참석 확정, 공개 기록 발행, 초대 관리, 멤버 상태 관리, 피드백 문서 업로드 |

## 프런트엔드 route-first 경계

프런트엔드는 React Router route를 중심으로 `src/app -> src/pages -> features -> shared` 방향을 목표 경계로 유지합니다. `src/app`은 router, layout, guard, provider wiring을 담당하고, `src/pages`는 route compatibility shell로서 feature route module을 re-export하거나 얇게 위임합니다.

현재 `shared/ui`에는 명시적인 legacy 예외가 남아 있습니다. `mobile-header`는 `src/app/router-link`와 `src/app/route-continuity`를 import하고, `mobile-tab-bar`, `public-auth-action`, `public-footer`, `top-nav`는 `src/app/router-link`를 import합니다. 이 예외는 router-link와 route-continuity primitive를 `src/app` 밖으로 이동하거나 app/page composition에서 주입하도록 바꾼 뒤에만 boundary test 예외에서 제거합니다.

Feature는 가능한 범위에서 `api`, `model`, `route`, `ui`로 나눕니다.

- `features/<name>/api`는 해당 feature의 BFF endpoint 호출과 request/response contract만 담당합니다.
- `features/<name>/model`은 React, React Router, API client를 import하지 않는 순수 화면 모델 계산만 둡니다.
- `features/<name>/route`는 loader/action, route error/loading state, API/model 호출, UI props 조립을 담당합니다.
- `features/<name>/ui`는 props와 callback으로만 렌더링하며 `fetch`, `shared/api`, feature API, route module을 직접 import하지 않습니다.

`shared/api/readmates` compatibility module은 제거되었고, feature route/page는 feature-owned API contract 또는 `shared/api` primitive를 사용해야 합니다. `features/*/components`는 `ui`로 이동하지 않은 legacy presentation surface에만 남길 수 있습니다. `ui` directory가 있는 feature에서는 외부 source가 `features/<name>/components`를 public surface처럼 import하지 않습니다.

## 요청 흐름

```text
Browser
  |
  | same-origin SPA, /api/bff/**, /oauth2/**, /login/oauth2/**
  v
Cloudflare Pages
  |-- Vite SPA static assets
  |-- Pages Functions BFF and OAuth proxy
        |-- /api/bff/** -> Spring /api/**
        |-- /oauth2/authorization/** -> Spring OAuth start
        |-- /login/oauth2/code/** -> Spring OAuth callback
  |
  | X-Readmates-Bff-Secret, forwarded cookies
  v
Spring Boot API
  |-- Spring Security
  |-- membership, role, session authorization
  |-- feedback document parser
  |-- Flyway migrations
  v
MySQL
```

Production에서 browser-facing origin은 Cloudflare Pages입니다. 브라우저는 직접 Spring API origin을 신뢰하지 않고, 같은 origin의 `/api/bff/**`로 요청합니다. Pages Functions는 upstream Spring `/api/**`로 전달하면서 `X-Readmates-Bff-Secret`을 붙이고 cookie를 전달합니다.

로컬 Vite dev server는 `front/vite.config.ts`의 proxy로 같은 구조를 흉내 냅니다. Cloudflare Pages Functions 코드는 production/preview 배포에서 실행되고, 로컬 개발에서는 Vite proxy가 `/api/bff/**`, `/oauth2/authorization/**`, `/login/oauth2/code/**`를 backend로 넘깁니다.

## 서버 내부 구조

Backend는 단일 Spring Boot 모듈을 유지하면서 feature package 안에서 점진적으로 클린 아키텍처 경계를 나눕니다. 새로 전환된 세션/노트 쓰기 흐름은 아래 방향을 따릅니다.

```text
adapter.in.web
  -> application.port.in
  -> application.service
  -> application.port.out
  -> adapter.out.persistence
```

현재 전환된 범위는 current member 해석, 현재 세션 조회, 멤버 세션 쓰기, 호스트 세션 쓰기입니다.

| 영역 | 현재 패키지 | 역할 |
| --- | --- | --- |
| Web adapter | `session.adapter.in.web`, `note.adapter.in.web` | HTTP request validation, `CurrentMember` 주입, use case 호출, response mapping |
| Auth web adapter | `auth.adapter.in.security` | Spring Security `Authentication`을 `CurrentMember`로 해석하는 argument resolver 등록 |
| Inbound port | `session.application.port.in`, `auth.application.port.in` | controller가 의존하는 use case contract |
| Application service | `session.application.service`, `auth.application.service` | command/query orchestration과 권한 확인 |
| Outbound port | `session.application.port.out`, `auth.application.port.out` | application service가 persistence 세부사항 없이 호출하는 contract |
| Persistence adapter | `session.adapter.out.persistence`, `auth.adapter.out.persistence` | legacy JDBC repository를 임시로 감싸는 bridge |

전환된 controller는 legacy repository, `JdbcTemplate`, persistence adapter를 직접 주입받지 않습니다. 인증된 사용자는 controller method에서 `CurrentMember`로 받으며, resolver가 `ResolveCurrentMemberUseCase`를 통해 멤버 정보를 조회합니다.

아직 모든 서버 기능이 이 구조로 옮겨진 것은 아닙니다. `archive`, `feedback`, `publication`, 일부 `auth` controller와 legacy JDBC repository는 단계적으로 남아 있습니다. 새 기능이나 전환된 slice에서는 기존 repository를 controller에 다시 주입하지 않고, 필요한 경우 outbound port와 adapter를 먼저 둡니다.

아키텍처 경계는 `SessionCleanArchitectureBoundaryTest`에서 일부 강제합니다. 이 테스트는 전환된 session/note web adapter가 legacy repository, `JdbcTemplate`, outbound adapter에 직접 의존하지 않는지 확인합니다.

## 인증과 세션

운영 로그인은 Google OAuth입니다.

1. 브라우저가 `/oauth2/authorization/google`로 이동합니다.
2. Pages Functions가 Spring `/oauth2/authorization/google`로 proxy합니다.
3. Spring Security가 Google OAuth flow를 시작합니다.
4. callback은 Pages origin의 `/login/oauth2/code/google`로 돌아옵니다.
5. Pages Functions가 callback을 Spring으로 proxy합니다.
6. Spring이 Google 사용자 정보를 확인하고 membership 상태를 반영합니다.
7. 성공하면 Spring이 `readmates_session` cookie를 발급하고 app origin으로 redirect합니다.

`readmates_session` cookie는 `HttpOnly`, `SameSite=Lax`, production `Secure` posture를 사용합니다. 서버는 raw token을 저장하지 않고 hash를 `auth_sessions`에 저장합니다. API 요청마다 session cookie에서 현재 사용자를 복원하고, membership/role 상태를 기준으로 route와 API 접근을 제한합니다.

Password login과 password reset endpoint는 현재 운영 경로가 아니며 `410 Gone`을 반환합니다. Dev-login은 `dev` profile의 fixture flow입니다. production auth로 취급하지 않습니다.

## BFF 보안 경계

Spring은 `/api/**` 요청에서 `X-Readmates-Bff-Secret`을 검사할 수 있습니다. `READMATES_BFF_SECRET`이 설정되어 있으면 요청 header 값이 일치해야 합니다.

Mutating method인 `POST`, `PUT`, `PATCH`, `DELETE`는 `Origin` 또는 `Referer`가 `READMATES_ALLOWED_ORIGINS` 또는 `READMATES_APP_BASE_URL`에서 파생된 허용 origin에 포함되어야 합니다.

`READMATES_BFF_SECRET`은 Cloudflare Pages Functions와 Spring runtime 설정에만 둡니다. `VITE_` 또는 `NEXT_PUBLIC_` 접두사로 만들어 브라우저 bundle에 노출하지 않습니다.

## 멤버십과 역할 모델

ReadMates의 사용자 상태는 membership status와 role을 함께 봅니다.

| 상태/역할 | 의미 |
| --- | --- |
| `VIEWER` | Google 로그인은 했지만 정식 초대를 수락하지 않은 둘러보기 멤버입니다. 읽기 가능한 일부 멤버 화면은 볼 수 있지만 현재 세션 쓰기, 피드백 문서 열람, 호스트 도구는 제한됩니다. |
| `ACTIVE` + `MEMBER` | 정식 멤버입니다. 현재 세션 참여, RSVP, 체크인, 질문, 한줄평, 장문 서평, 본인이 참석한 회차의 피드백 문서 열람이 가능합니다. |
| `ACTIVE` + `HOST` | 호스트입니다. 정식 멤버 권한에 운영 권한이 추가됩니다. |
| `SUSPENDED` | 제한된 멤버 상태입니다. route guard와 API authorization에서 쓰기/운영 권한을 제한합니다. |
| `LEFT`, `INACTIVE` | 떠났거나 비활성화된 계정 상태입니다. 멤버 앱과 쓰기 기능에서 제외됩니다. |
| `INVITED` | 초대 발급 또는 수락 전후의 중간 상태로 사용됩니다. |

현재 세션 참여 여부는 `session_participants`와 `SessionParticipationStatus`로 관리합니다. 호스트는 정식 멤버를 현재 세션에 추가하거나 제거할 수 있고, 참석 확정 후 피드백 문서 열람 경계에 영향을 줍니다.

## 공개 기록과 비공개 기록 경계

Public route/API에는 명시적으로 공개된 데이터만 나갑니다.

- 공개 사이트는 `/api/public/club`, `/api/public/sessions/{sessionId}` 같은 public API를 사용합니다.
- 공개 기록에는 발행된 세션, 공개 가능한 하이라이트, 한줄평, 책/회차 정보만 포함합니다.
- 현재 세션의 RSVP, 읽은 분량, private notes, meeting data, 피드백 문서 본문은 public API로 노출하지 않습니다.
- 멤버 앱의 `/api/archive/**`, `/api/notes/**`, `/api/sessions/current/**`는 인증과 membership 상태를 확인합니다.
- 호스트 API인 `/api/host/**`는 active host role이 필요합니다.

이 경계는 포트폴리오 공개에도 중요합니다. 문서와 예시는 실제 멤버 데이터나 private club domain을 사용하지 않고, API origin은 `https://api.example.com` 같은 placeholder를 사용합니다.

## 피드백 문서 흐름

피드백 문서는 모임 후 운영 산출물을 저장하고 읽기 좋게 제공하기 위한 기능입니다.

```text
External operating workflow
  |
  | Markdown or text feedback document
  v
Host upload
  |
  | POST /api/host/sessions/{sessionId}/feedback-document
  v
Spring validation and parser
  |
  | UTF-8, .md/.txt, size, filename, structured sections
  v
MySQL session_feedback_documents
  |
  | GET /api/sessions/{sessionId}/feedback-document
  v
Readable response for host or attended full member
```

호스트는 `.md` 또는 `.txt` 피드백 문서를 업로드합니다. 서버는 파일명, 크기, UTF-8 텍스트 여부를 검증하고 `FeedbackDocumentParser`로 문서를 typed response 형태로 파싱합니다. 저장은 원문 텍스트와 metadata를 versioned document로 남깁니다.

열람 경계는 다음과 같습니다.

- 호스트는 같은 club의 세션 피드백 문서 상태와 본문을 관리할 수 있습니다.
- 정식 멤버는 본인이 `ATTENDED` 상태인 회차의 피드백 문서만 읽을 수 있습니다.
- 둘러보기 멤버는 피드백 문서를 읽을 수 없습니다.
- 문서가 없거나 권한이 없으면 UI는 locked 또는 unavailable state를 보여야 합니다.

## AI-assisted 콘텐츠 운영

ReadMates 서버와 프론트엔드에는 현재 AI API 호출 경로가 없습니다. 서버와 프론트엔드는 AI API client나 in-app generation path를 갖고 있지 않습니다.

AI-assisted라고 설명하는 부분은 앱 외부 운영 워크플로우입니다. 독서모임 대화에서 나온 피드백, 하이라이트, 한줄평 재료를 외부에서 정리하고, ReadMates는 그 결과물을 세션 기록과 피드백 문서로 저장, 파싱, 권한 검증, 공개합니다.

역할 분담은 다음과 같습니다.

| 단계 | 책임 |
| --- | --- |
| 외부 운영 워크플로우 | 피드백, 하이라이트, 한줄평 재료를 정리하고 Markdown 피드백 문서나 공개 기록 데이터를 준비합니다. |
| ReadMates backend | 문서를 저장하고, 파싱하고, membership/attendance/host 권한을 검증합니다. |
| ReadMates frontend | 공개 기록, 멤버 기록, 피드백 문서를 역할과 상태에 맞게 보여줍니다. |
| Public route/API | 공개로 발행된 기록만 노출합니다. |

따라서 문서에서는 ReadMates가 앱 안에서 AI 콘텐츠를 만들어낸다고 쓰지 않습니다. 정확한 표현은 "외부 워크플로우가 피드백, 하이라이트, 한줄평 자료를 정리하고, ReadMates가 저장, 파싱, 권한 검증, 공개한다"입니다.
