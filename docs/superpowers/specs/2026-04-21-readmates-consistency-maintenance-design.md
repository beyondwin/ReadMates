# ReadMates Consistency And Maintenance Design

작성일: 2026-04-21

## 1. 목적

ReadMates는 2026-04-21 현재 Cloudflare Pages + Vite React SPA + Spring Boot + MySQL 구조로 전환되어 있다. 최근 작업으로 Google-only 로그인, pending approval, session-level feedback document, 모바일/데스크톱 라우팅이 빠르게 정리되었지만, 코드와 문서 일부에는 이전 Next.js/Vercel/password/PostgreSQL 단계의 흔적이 남아 있다.

이 설계의 목적은 프로젝트 전체의 일관성 문제를 세 단계로 정리하는 것이다.

1. 즉시 검증 가능한 correctness/hygiene 문제를 먼저 고친다.
2. 화면 문구, 날짜, 상태, 레거시 기능 노출 방식을 제품 규칙으로 통일한다.
3. 큰 컴포넌트와 Repository를 나누어 후속 기능 작업의 변경 범위를 줄인다.

## 2. 현재 확인된 상태

프로젝트 스캔과 검증에서 다음을 확인했다.

- `pnpm --dir front test`는 33개 파일, 205개 테스트가 통과했다.
- `pnpm --dir front lint`는 에러 없이 Fast Refresh 경고 6개를 낸다.
- `pnpm --dir front build`는 성공하지만 번들 chunk size 경고가 있다.
- `pnpm --dir front exec tsc --noEmit`은 e2e 테스트의 `window.__readmatesPrintCalls` 캐스팅 4곳에서 실패한다.
- `./server/gradlew -p server test`는 up-to-date 상태로 성공했다.
- README와 Cloudflare 배포 문서는 현재 구조를 잘 설명하지만 `.env.example`에는 Vercel/Next.js 변수명이 남아 있다.
- `server/build.gradle.kts`와 `server/src/test/kotlin/com/readmates/support/PostgreSqlTestContainer.kt`에는 MySQL 전환 후에도 PostgreSQL 테스트 의존/도우미가 남아 있다.
- 날짜 표시는 `formatDateLabel`, `replaceAll("-", ".")`, raw ISO date, `slice(0, 10)` 방식이 화면마다 섞여 있다.
- `password_reset_tokens`, password reset route/API, `feedback_reports` 등 레거시 표면이 현재 Google-only/session feedback document 제품 모델과 섞여 있다.
- 큰 파일이 집중되어 있다: `SessionRepository.kt` 약 1606줄, `current-session.tsx` 약 1593줄, `host-session-editor.tsx` 약 1090줄, `member-home.tsx` 약 959줄, `ArchiveRepository.kt` 약 921줄.

## 3. 설계 원칙

- 현재 사용자 흐름을 바꾸지 않는 정리부터 시작한다.
- 삭제보다 먼저 역할을 명확히 한다. 운영 DB 호환을 위해 남겨야 하는 레거시 스키마는 코드/문서에서 그 이유를 드러낸다.
- 화면에 보이는 날짜, 상태, 권한 메시지는 공용 규칙을 따른다.
- 큰 파일 분해는 behavior-preserving으로 진행한다. 한 번에 기능 변경과 구조 변경을 섞지 않는다.
- 검증은 단계별로 실행한다. 1차는 전체 checks, 2차는 UI/문구 관련 unit test, 3차는 기존 regression 유지가 기준이다.

## 4. 선택한 접근

선택한 접근은 3트랙 단계형이다.

빠른 정리형만 선택하면 `tsc` 실패와 문서 drift는 줄일 수 있지만, 날짜/상태/레거시 UX가 계속 남는다. 반대로 아키텍처 우선형은 큰 파일을 빨리 나눌 수 있지만, 현재 타입/문서/레거시 정리가 끝나기 전에는 변경 면적이 커진다.

따라서 순서는 다음과 같다.

1. Correctness / Hygiene
2. Product / UX Consistency
3. Architecture / Maintainability

## 5. 1차: Correctness / Hygiene

### 5.1 TypeScript 검증 복구

`front/tests/e2e/google-auth-pending-approval.spec.ts`와 `front/tests/e2e/public-auth-member-host.spec.ts`의 `window.__readmatesPrintCalls` 접근을 TypeScript 5.8에서 통과하도록 정리한다.

정책:

- e2e 테스트 helper를 추가해 print spy 설치와 call count 조회를 한 곳으로 묶는다.
- helper 내부에서는 `Window & { __readmatesPrintCalls?: number }` 타입을 안전하게 다루고 테스트 본문에는 직접 캐스팅을 남기지 않는다.
- 동작은 유지한다. pending user의 print route는 `window.print`가 호출되지 않아야 하고, approved host/member print route는 호출되어야 한다.

### 5.2 문서와 환경 변수 정리

`.env.example`을 현재 런타임 구조에 맞춘다.

정책:

- "Next.js frontend and BFF" 표현을 "Cloudflare Pages SPA and Functions"로 바꾼다.
- `replace-with-vercel-url`, `NEXT_PUBLIC_APP_URL`은 제거한다.
- dev login을 계속 지원할 경우 `VITE_ENABLE_DEV_LOGIN`을 예시로 사용한다.
- README와 `docs/deploy/cloudflare-pages-spa.md`의 환경 변수 목록과 충돌하지 않게 맞춘다.

### 5.3 Vite env prefix 정책

현재 `front/vite.config.ts`는 `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`를 허용하고 `login-card.tsx`도 `NEXT_PUBLIC_ENABLE_DEV_LOGIN`을 본다.

정책:

- 새 표준은 `VITE_ENABLE_DEV_LOGIN`이다.
- 이전 로컬 환경과 테스트 문맥을 깨지 않기 위해 `NEXT_PUBLIC_ENABLE_DEV_LOGIN` 호환은 유지한다.
- 호환 유지 이유를 `login-card.tsx` 또는 README에 "legacy compatibility"로 명시한다.
- 새 문서와 예시는 모두 `VITE_ENABLE_DEV_LOGIN`만 사용한다.

### 5.4 Fast Refresh 경고 정리

lint warning 대상:

- `front/shared/ui/avatar-chip.tsx`
- `front/shared/ui/public-auth-action.tsx`
- `front/src/app/auth-context.tsx`
- `front/src/pages/readmates-page.tsx`

정책:

- React 컴포넌트 파일에서 helper export를 분리한다.
- 테스트 import 경로는 새 helper 파일로 갱신한다.
- 컴포넌트 behavior는 바꾸지 않는다.

### 5.5 PostgreSQL 테스트 잔재 정리

MySQL이 현재 source of truth이므로 다음을 정리한다.

- `server/build.gradle.kts`의 PostgreSQL test runtime/testcontainers 의존성
- `server/src/test/kotlin/com/readmates/support/PostgreSqlTestContainer.kt`

정책:

- active test가 import하지 않는지 먼저 확인한다.
- 과거 PostgreSQL migration 파일은 히스토리/참조로 남기되, 현행 테스트/런타임 의존성에서는 제거한다.
- 문서에는 현재 운영 DB가 MySQL임을 유지한다.

## 6. 2차: Product / UX Consistency

### 6.1 날짜 표시 규칙 통일

현재 날짜 표시는 화면별로 다르다.

- 공개/현재 세션 일부: `YYYY.MM.DD`
- 노트/일부 아카이브: raw `YYYY-MM-DD`
- 초대/업로드 날짜: `slice(0, 10)`
- 일부 페이지: local `Date`와 `toLocaleDateString`

정책:

- 앱의 일반 날짜 표시는 `YYYY.MM.DD`로 통일한다.
- 세션 번호와 함께 나오는 날짜는 `No.06 · 2026.04.15` 형식을 사용한다.
- timestamp에서 날짜만 보여줄 때는 새 공용 helper `formatDateOnlyLabel`을 사용한다.
- timestamp와 시각을 함께 보여줄 때는 `formatDeadlineLabel` 계열을 사용한다.
- `replaceAll("-", ".")`와 `slice(0, 10)`는 화면 컴포넌트에서 제거하고 shared display helper로 이동한다.

대상:

- `front/features/archive/components/archive-page.tsx`
- `front/features/archive/components/member-session-detail-page.tsx`
- `front/features/archive/components/my-page.tsx`
- `front/features/archive/components/notes-feed-page.tsx`
- `front/features/host/components/host-dashboard.tsx`
- `front/features/host/components/host-invitations.tsx`
- `front/features/auth/components/invite-acceptance-card.tsx`
- `front/src/pages/host-members.tsx`

### 6.2 Google-only 인증 UX 정리

운영 로그인은 Google-only이다. password login/reset/invitation acceptance는 gone 처리되었지만 일부 파일명과 route는 남아 있다.

정책:

- `/reset-password/:token`은 당분간 레거시 링크 안내 페이지로 유지한다.
- UI 문구는 "비밀번호 로그인은 종료되었습니다"보다 사용자의 다음 행동을 먼저 제시한다.
- password reset API는 `410 Gone`을 유지하되, 테스트는 "레거시 엔드포인트 차단" 의도를 명확히 한다.
- password 관련 파일명은 이번 정리 범위에서 유지한다. 의미 정리는 화면 문구, 테스트 이름, 코드 주석으로 처리한다.

### 6.3 Feedback legacy 표면 정리

현재 제품의 중심은 `session_feedback_documents`이다. `feedback_reports`는 legacy member-level HTML report schema로 남아 있다.

정책:

- DB 테이블은 삭제하지 않는다. 기존 migration과 deletion safety를 위해 유지한다.
- 사용자-facing 문구에서 "개인 피드백 리포트"가 현재 기능처럼 보이면 "레거시 개인 리포트" 또는 host-only deletion preview context로 좁힌다.
- host dashboard와 my page는 session-level feedback document 용어를 우선 사용한다.
- deletion preview count는 legacy row가 실제로 있으면 계속 보여주되, 일반 사용 흐름에 노출하지 않는다.

### 6.4 새 세션 기본 날짜 개선

`front/features/host/components/host-session-editor.tsx`의 `defaultSessionDate = "2026-05-20"`은 시간이 지나면 부정확해진다.

정책:

- 기본값은 "오늘 이후의 다음 정기 모임 후보"로 계산한다.
- 정기 모임 규칙은 별도 설정이 없으므로 우선 "다음 달 또는 이번 달의 3번째 수요일"을 후보로 삼는다.
- 현재 날짜가 후보 날짜 이후면 다음 달 후보를 사용한다.
- 규칙이 틀릴 가능성을 줄이기 위해 호스트는 date input에서 항상 수정 가능하다.
- 테스트는 fake timer로 2026-04-21, 2026-05-21 같은 경계 값을 검증한다.

### 6.5 디자인 토큰 source of truth

`front/shared/styles/tokens.css`, `front/shared/styles/mobile.css`, `front/src/styles/globals.css`, `design/` standalone 파일이 서로 가까운 복사본으로 존재한다.

정책:

- 런타임 앱의 source of truth는 `front/shared/styles/*`이다.
- `front/src/styles/globals.css`는 runtime alias와 layout glue만 둔다.
- `design/standalone`은 prototype artifact로 유지하되 runtime consistency 작업의 필수 대상에서 제외한다.
- 새 CSS 변수는 `tokens.css`에 먼저 정의하고 `globals.css`에서 alias가 필요한 경우만 추가한다.

## 7. 3차: Architecture / Maintainability

### 7.1 프론트 큰 컴포넌트 분해

대상과 분해 방향:

- `front/features/current-session/components/current-session.tsx`
  - state/useEffect/action orchestration
  - desktop layout sections
  - mobile layout sections
  - question editor
  - review/checkin/rsvp panels
- `front/features/host/components/host-session-editor.tsx`
  - form state and payload builder
  - schedule/date helpers
  - attendance editor
  - feedback document upload
  - deletion preview modal/section
- `front/features/member-home/components/member-home.tsx`
  - current session card
  - note feed preview
  - member stats and recent attendances
- `front/features/archive/components/notes-feed-page.tsx`
  - session filter
  - feed grouping/filtering
  - mobile/desktop render variants

정책:

- 먼저 pure helper와 leaf components를 분리한다.
- URL, API 호출, mutation behavior는 기존 파일에 남긴 뒤 마지막에 필요하면 hook으로 이동한다.
- 테스트는 기존 page/component tests를 유지하고, 새 pure helper는 focused unit test를 추가한다.

### 7.2 백엔드 Repository 분해

`SessionRepository.kt`는 host session command, current session query, member action command, deletion logic, row mapping을 모두 포함한다.

분해 방향:

- `CurrentSessionRepository`: current session detail, board, attendee query
- `HostSessionRepository`: create/update/find host session
- `SessionParticipationRepository`: RSVP, checkin, questions, reviews
- `HostSessionDeletionRepository`: deletion preview/count/delete
- shared mapper/helper: UUID/date/time conversion, short name fallback

`ArchiveRepository.kt`는 list/detail/my-records/notes feed 성격의 query가 섞여 있다.

분해 방향:

- archive session list/detail query
- my page/my records query
- notes feed/session filter query

정책:

- Controller public contract를 바꾸지 않는다.
- Spring bean 이름 충돌과 controller 변경을 줄이기 위해 기존 `SessionRepository`와 `ArchiveRepository` 이름은 thin facade로 유지한다.
- SQL 변경은 behavior-preserving으로 제한한다.

### 7.3 API 계약 관리

`front/shared/api/readmates.ts`는 Kotlin DTO와 수동 동기화된다.

정책:

- 당장 OpenAPI/codegen은 도입하지 않는다.
- 각 주요 endpoint별 response fixture를 unit test에서 공유하거나, DTO field drift를 잡는 contract smoke test를 추가한다.
- 프론트 타입 변경은 대응하는 백엔드 DTO/테스트와 같은 작업 단위에 묶는다.
- `readmatesFetch` 에러는 status만 담는 현재 방식에서 점진적으로 typed error body를 보존하는 방향으로 개선한다.

## 8. 데이터 흐름

현재 데이터 흐름은 유지한다.

1. Browser는 same-origin `/api/bff/**`로 요청한다.
2. Cloudflare Pages Function 또는 Vite proxy가 Spring `/api/**`로 전달한다.
3. Spring은 `X-Readmates-Bff-Secret`, Origin/Referer, session cookie, role/status를 검증한다.
4. MySQL이 auth/session/archive/feedback source of truth이다.
5. Frontend는 `front/shared/api/readmates.ts` 타입과 shared display helper로 화면을 렌더링한다.

이번 정리는 데이터 흐름을 바꾸지 않는다. 바꾸는 것은 검증, 표현, 모듈 경계다.

## 9. 오류 처리

1차에서는 오류 처리 동작을 바꾸지 않는다.

- `readmatesFetchResponse`는 401에서 `/login`으로 이동하는 현재 동작을 유지한다.
- 410 Gone password endpoints는 계속 410을 반환한다.
- pending approval user는 host/member mutation/feedback print routes에서 계속 차단된다.

2차 이후 개선 후보:

- `readmatesFetch`가 status와 server error body를 함께 담는 `ReadmatesApiError`를 던지게 한다.
- invitation/password legacy 안내 UI는 410 response 문구보다 사용자가 해야 할 행동을 먼저 보여준다.
- upload/feedback document errors는 file type, template parse, authorization 실패를 구분해 표시한다.

## 10. 테스트 계획

### 10.1 1차 필수 검증

다음 명령이 통과해야 한다.

```bash
pnpm --dir front exec tsc --noEmit
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server test
```

### 10.2 2차 필수 검증

- 날짜 표시 helper test를 추가/갱신한다.
- archive, notes, host invitation, invite acceptance, host dashboard tests에서 날짜 기대값을 통일한다.
- password legacy UI test는 Google-only next action을 검증한다.
- deletion preview test는 legacy feedback report count의 의도를 검증한다.

### 10.3 3차 필수 검증

- 분해 전후 existing unit tests가 모두 통과해야 한다.
- 큰 파일 분해는 한 파일군씩 진행하고, 각 단계마다 focused tests를 실행한다.
- Repository 분해는 backend tests를 기준으로 한다.
- e2e는 로컬 MySQL 준비가 필요한 통합 검증이므로 implementation plan에서 실행 시점과 환경 요건을 명시한다.

## 11. 완료 기준

1차 완료:

- TypeScript noEmit 검증 통과
- lint Fast Refresh 경고 6개 제거
- `.env.example`이 Cloudflare/Vite 기준으로 정리됨
- PostgreSQL 테스트 잔재 제거

2차 완료:

- 날짜/상태/legacy 문구가 같은 규칙을 따름
- Google-only 인증 UX와 legacy password route 정책이 명확함
- 새 세션 기본 날짜가 현재 날짜 기준으로 계산됨

3차 완료:

- 가장 큰 frontend/backend 파일들이 책임 단위로 나뉨
- 기존 public API와 user-facing behavior가 유지됨
- contract drift를 잡을 최소 테스트가 생김

## 12. 비범위

- Cloudflare Pages, OCI, Google OAuth production 설정 자체를 바꾸지 않는다.
- DB 테이블을 삭제하지 않는다.
- 새 제품 기능을 추가하지 않는다.
- CSS 시각 redesign을 하지 않는다. 필요한 것은 표현 규칙과 source of truth 정리다.
- OpenAPI/codegen 도입은 이번 범위에서 제외한다.

## 13. 구현 순서 제안

1. `tsc --noEmit` 실패와 `.env.example`을 고친다.
2. lint Fast Refresh 경고를 제거한다.
3. PostgreSQL 테스트 잔재를 제거한다.
4. 날짜 표시 helper와 화면별 날짜 사용을 통일한다.
5. Google-only/password legacy UX 문구와 route 정책을 정리한다.
6. feedback legacy 문구와 deletion preview 표현을 정리한다.
7. 새 세션 기본 날짜 계산을 도입한다.
8. 큰 frontend 컴포넌트를 leaf component/helper 중심으로 나눈다.
9. `SessionRepository.kt`와 `ArchiveRepository.kt`를 query/command 책임으로 나눈다.
10. 최소 API contract drift 테스트를 추가한다.

각 단계는 독립 커밋으로 쪼갤 수 있어야 한다.
