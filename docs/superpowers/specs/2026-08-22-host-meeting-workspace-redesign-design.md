# ReadMates 호스트 모임 운영 경험 전면 재설계

작성일: 2026-08-22
상태: 최종 승인
대상 표면: authenticated app shell, member/host workspace 전환, host 모임 목록·생성·준비·출석·기록·공개·수정·복구, 관련 member/public 용어와 노출 투영, frontend/server 계약
ADR impact: new — `Proposed`: ADR-0018, ADR-0019, ADR-0020, ADR-0023, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0034, ADR-0035, ADR-0036, ADR-0037, ADR-0038; 현재 코드로 이미 성립해 `Accepted`: ADR-0021, ADR-0022

이 문서는 사용자와 단계별로 승인한 차기 제품 설계다. 현재 동작의 source of truth는 코드, 테스트, migration, script와 `docs/development/architecture.md`다. 구현 완료 전에는 이 문서를 현재 동작으로 읽지 않는다.

## 1. 앞선 설계와의 관계

이 문서는 다음 두 설계를 조사 근거로 사용하되, 충돌하는 제품·화면 결정은 대체한다.

- `2026-08-21-host-meeting-operating-ledger-design.md`
- `2026-08-21-host-session-focus-workspace-redesign-design.md`

유지하는 계약:

- 서버 lifecycle `DRAFT → OPEN → CLOSED → PUBLISHED`와 한 단계 역방향 전이
- `access_scope`와 `site_visibility`의 독립 축
- 기록 import/AI/직접 편집 결과가 draft에 들어간 뒤 preview/apply/publish를 거치는 경계
- 기록 revision을 live에 직접 덮어쓰지 않고 새 draft로 복구하는 방식
- 7일 휴지통, 변경 snapshot, restore preview/commit의 현재 서버 계약
- same-origin `/api/bff/**`, club-scoped authority, host fail-closed 경계

대체하는 결정:

- 글로벌 호스트 좌측 메뉴 또는 멤버와 다른 위치의 1차 내비게이션
- 큰 단일 Focus 카드 안에 현재 데이터와 모든 보조 작업을 중첩하는 구조
- 현재 행동 CTA 아래에 멤버 응답·알림 전체 목록을 먼저 렌더링하는 순서
- 긴 새 모임 폼을 기존 workspace의 좁은 side sheet에 넣는 구조
- `세션`, `모임`, `회차`, `RSVP`, 목적어 없는 `공개`가 역할별 화면에서 혼용되는 언어
- lifecycle 상태를 실제 완료 데이터와 무관한 진행 막대처럼 보여 주는 방식
- 오류 난 history/dispatch 데이터를 빈 배열로 바꾸어 `내역 없음`처럼 보이게 하는 방식

현재 `docs/development/architecture.md`는 특정 모임 화면에 단계 rail을 두지 않는다고 규정한다. 이 문서가 승인하는 목표는 공통 상단 셸을 유지하면서 **현재 모임 안의 로컬 작업 목차**를 두는 것이다. 구현 시 코드·테스트와 함께 active architecture를 갱신하기 전까지 현재 규정이 사실 기준이다.

## 2. 문제 정의

첨부 화면이 미완성처럼 보이는 원인은 색이나 폰트보다 정보 구조다.

- `WorkspaceFocusCard`는 children을 주 행동보다 먼저 렌더링한다.
- `HostSessionEditor`는 멤버 응답 목록과 알림 전체 목록을 focus children으로 넣는다.
- 결과적으로 지금 해야 할 행동은 fold 아래로 밀리고, RSVP가 단순 문장 목록으로 길게 이어지며, 알림 영역이 큰 중첩 카드가 된다.
- `멤버 응답 확인하기`는 이미 같은 화면에 있는 영역으로 focus만 옮겨 실질적인 다음 행동이 아니다.
- 알림의 disabled 상태는 `준비 필요`만 보이고 이유는 주로 접근성 이름에 숨어 있다.
- 새 모임 생성은 같은 workspace와 긴 sheet를 공유해 데스크톱에서도 충분한 폭과 검토 맥락을 얻지 못한다.
- record/history/dispatch query가 함께 활성화되고 일부 실패는 전체 editor error 또는 빈 배열 fallback으로 바뀐다.

관련 현재 구현:

- `front/features/host/ui/session-workspace/workspace-focus-card.tsx`
- `front/features/host/ui/host-session-editor.tsx`
- `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- `front/features/host/route/host-session-editor-route.tsx`
- `front/features/host/ui/session-workspace/host-session-workspace.tsx`
- `front/src/styles/globals.css`

내비게이션도 단순한 모양 문제가 아니다.

- 같은 사람은 같은 클럽에서 정식 멤버이면서 호스트다.
- 현재 데스크톱은 멤버·호스트 모두 `TopNav`를 쓰지만 route prefix에 따라 메뉴 집합과 brand home을 통째로 교체한다.
- 역할 전환은 이름 없는 교환 아이콘에 가깝고 상대 workspace의 홈으로만 간다.
- 모바일 공유 기록 route는 route state와 전역 `sessionStorage` 힌트로 member/host chrome을 추론한다. 같은 URL이 새 탭, 기존 탭, 데스크톱에서 다른 workspace처럼 보일 수 있다.
- 클럽 전환은 현재 resource ID, cursor, query, hash까지 다른 클럽에 가져갈 수 있다.

관련 현재 구현:

- `front/src/app/layouts/app-route-layout.tsx`
- `front/shared/ui/top-nav.tsx`
- `front/shared/ui/mobile-header.tsx`
- `front/shared/ui/mobile-tab-bar.tsx`
- `front/src/app/route-continuity.ts`

마지막으로 운영 안정성 사각지대가 있다.

- 기본 정보 update에는 expected revision이 없고 persistence update가 조건 없이 마지막 write를 반영한다.
- 출석 update도 expected revision 없이 제출된 participant 상태를 덮어쓴다.
- preview와 apply/publish 사이에 모임·기록·출석이 바뀌는 stale input을 일관되게 차단하는 전체 계약이 없다.
- 서버 commit 뒤 응답이 끊기면 create/apply/publish/trash/restore를 안전하게 재조정하는 공통 idempotency·receipt 계약이 부족하다.

관련 현재 구현:

- `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionWebDtos.kt`
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt`
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionAttendanceWriteOperations.kt`

## 3. 목표

1. 처음 보는 호스트가 `모임 목록 → 새 모임 → 준비 → 실제 출석 → 기록 반영 → 기록 공개 → 수정·복구`를 설명 없이 찾을 수 있다.
2. 첫 viewport가 현재 모임 상태, 확인할 일, blocker, 주 행동을 답한다.
3. 호스트가 멤버 공간으로 전환해도 브랜드·클럽·workspace 전환·계정의 위치가 움직이지 않는다.
4. 사용자 화면의 핵심 객체를 `모임`과 `기록`으로 통일한다.
5. 참석 응답과 실제 출석, 기록 반영과 기록 공개, 멤버 노출과 공개 사이트 게시를 분리한다.
6. 잘못된 행동을 되돌릴 수 있지만 이미 보낸 알림이나 확정된 history를 지운 것처럼 말하지 않는다.
7. 동시 편집, timeout, partial query failure, 권한 변경에서 입력과 데이터가 조용히 유실되거나 덮어써지지 않는다.
8. 데스크톱·태블릿·모바일이 기능적으로 완전하고 ReadMates의 차분한 editorial/ledger 정체성을 공유한다.

성공 기준:

- 호스트가 어떤 화면에서도 `세션`과 `회차`를 핵심 객체명으로 해석할 필요가 없다.
- 특정 모임 안의 주 행동은 한 개이며 결과와 blocker가 버튼 가까이에 있다.
- `loading`, `known empty`, `unavailable`, `stale cached`가 서로 다른 UI 상태다.
- 역할 전환 후 Back/Forward, 새 탭, 새로고침, viewport 변경에서도 workspace가 URL로 재현된다.
- create/apply/publish/restore 같은 영향 큰 mutation은 결과를 알 수 없는 상황에서 맹목적으로 중복 실행되지 않는다.
- 호스트·게스트/멤버·공개 사이트의 실제 결과가 실행 전 projection과 실행 후 receipt에 일치한다.

## 4. Non-goals

- 반복 모임 series entity와 `이번만/이후 모두` 변경
- `CANCELLED` lifecycle과 취소 archive·취소 알림
- 날짜 기반 lifecycle 자동 전환
- offline-first queue, background sync, PWA conflict resolution
- 세분화된 공동 호스트 승인·결재 체계
- 발송된 email/in-app 알림의 recall, unsend, 삭제
- `CLOSED/PUBLISHED` 모임의 휴지통 이동 허용
- 측정 전 attendee backend pagination/virtualization 도입
- public/member 전체 정보 구조를 host ledger처럼 바꾸는 일
- 호스트 화면만의 독자 palette, typography, dark theme
- platform admin의 cross-club 운영 기능을 host workspace로 옮기는 일

## 5. 제품 언어

### 5.1 기본 원칙

- 사용자 객체는 `모임`, 장기 자산은 `기록`이다.
- 내부 code, API, route, database의 `session`, enum, `sessionId`, `sessionNumber`는 호환을 위해 유지한다.
- `회차`는 primary noun으로 쓰지 않는다. 번호는 짧은 표면에서 `No.7`, 문장에서는 `7번째 모임`이다.
- `세션`은 로그인 세션처럼 실제 기술 세션을 설명할 때만 사용자에게 노출할 수 있다.
- 목적어 없는 `공개`를 쓰지 않는다.
- visible copy, aria-label, email/in-app template, error message, test selector를 함께 migration한다.

### 5.2 Canonical dictionary

| 내부/API 개념 | 사용자 화면 | 비고 |
| --- | --- | --- |
| `session` | 모임 | 공개 목록에서는 `모임 기록` 또는 `공개 기록` |
| `sessionNumber` | `No.7`, `7번째 모임` | parser·저장 문서 계약의 `N차`는 예외 |
| `DRAFT` | 모임 작성 중 | 멤버에게 노출 시 `예정 모임` |
| `OPEN` | 멤버와 준비 중 | 날짜 당일에는 권장 행동만 `실제 출석 확인`으로 변경 |
| `CLOSED` | 기록 정리 중 | `비공개`로 번역하지 않음 |
| `PUBLISHED` | 게스트·멤버 노트 게시 완료 | 공개 사이트 게시 여부는 별도 |
| `HOST_ONLY` | 호스트만 보기 | audience를 말함 |
| `GUEST_READABLE` | 게스트와 멤버에게 보이기 | `게스트 공개` 금지 |
| `PUBLIC_RECORD` | 공개 기록에 게시 | lifecycle과 분리 |
| `RSVP` | 참석 응답 / 참석 여부 | 값: 참석·미정·불참·미응답 |
| `attendanceStatus` | 실제 출석 | 값: 출석·불참·확인 전 |
| `record draft` | 기록 초안 | 모임의 `작성 중`과 분리 |
| `live/applied record` | 현재 기록 / 멤버에게 보이는 기록 | `live`, `applied` 비노출 |
| `revision` | 버전 | API 이름 유지 |
| `apply` | 기록에 반영 | 저장·공개와 분리 |
| `publish` | 게스트·멤버 노트에 기록 게시 | archive read 권한이나 `공개 기록에 게시`와 분리 |
| soft delete | 휴지통으로 이동 | `삭제`로 축약하지 않음 |
| restore from trash | 복원 | lifecycle 되돌리기와 분리 |
| reverse lifecycle | 되돌리기 | 실제 결과를 action명에 명시 |
| revision recovery | 이 버전으로 기록 초안 만들기 | live 직접 복원 금지 |

### 5.3 역할별 정당한 차이

- 공개 방문자: `공개 기록`, `모임 기록`, `No.N`
- 게스트·멤버: `이번 모임`, `예정 모임`, `참석 여부`, `지난 모임 기록`
- 호스트: `모임 작성 중`, `참석 응답`, `실제 출석`, `기록 초안`, `현재 기록`, `버전`, `되돌리기`, `복원`
- 기술 문서·API·진단: `session`, enum, revision, outbox, delivery를 정확한 계약어로 유지

기존 사용자 생성 제목, 이미 저장된 notification row, upload filename은 재작성하지 않는다. `readmates-session-import:v1`, `<!-- readmates-feedback:v1 -->`, `# 독서모임 N차 피드백`과 heading 순서는 parser 호환 계약으로 유지한다.

## 6. 브랜드 구조

ReadMates는 하나의 시각 언어와 역할별 composition grammar를 쓴다.

공유하는 것:

- brand mark와 `읽는사이`/ReadMates naming
- warm paper, ink hierarchy, ink-blue accent, semantic state color
- Pretendard 계열 typography와 mono folio/tabular metadata
- 4pt spacing, 작은 radius, border-first hierarchy, 절제한 shadow
- button, badge, field, cover, avatar, focus, empty, locked, document primitive
- 같은 모임의 cover, `No.`, 날짜, 제목, 상태 의미
- desktop/mobile completeness, AA contrast, reduced motion, wrapping

역할별 grammar:

| 역할 | 문법 | 밀도 |
| --- | --- | --- |
| Public | 문학 저널·공개 archive | 가장 낮음 |
| Guest | public/member 사이의 permission bridge | 낮음 |
| Member | 개인 독서 작업대 | 중간 |
| Host | club-scoped 운영 장부 | 높지만 차분함 |
| Platform admin | cross-club system command ledger | 가장 높음 |

Host와 platform admin은 `Operate` family를 공유하지만 sub-brand가 아니다. Host는 책과 모임이 중심이고, platform admin은 cross-club scope, queue, inspector, audit가 중심이다. Public/member 화면을 host folio 배치로 바꾸지 않는다.

선택한 시각 합성:

- `Meeting Folio`: 특정 모임의 identity와 문서 frame
- `Active Desk`: 운영 밀도, 우선순위, ledger row, action placement
- `Publication Desk`: 기록 정리·공개 단계에서만 사용하는 document/review 문법

이 이름은 구현 metaphor이지 장식 theme가 아니다. 가죽 표지, 종이 질감 이미지, 파일철 tab, 찢어진 종이, 과도한 sepia, 입체적인 desk object를 추가하지 않는다. 문서성은 typography, 여백, 얇은 divider, 정렬, metadata hierarchy로만 만든다. 큰 중첩 card, decorative gradient, glow, glassmorphism, generic SaaS KPI tile을 금지한다.

## 7. 내비게이션과 workspace 소유권

정보 구조는 다음 순서를 고정한다.

`계정 → 현재 클럽 → workspace(멤버/호스트) → 역할별 주 메뉴 → 현재 객체의 작업 목차`

### 7.1 글로벌 클럽 셸

역할이 바뀌어도 유지한다.

- ReadMates brand
- 현재 클럽과 클럽 전환
- 이름이 보이는 `멤버 공간 / 호스트 공간` 전환
- 개인 알림, 계정 설정, 로그아웃
- 권한·클럽 변경 feedback

작은 교환 아이콘만으로 workspace를 표현하지 않는다. 클럽 전환과 역할 전환을 한 dropdown에 합치지 않는다.

Platform admin은 club workspace hierarchy 밖의 별도 `플랫폼 운영` scope다. ReadMates brand와 account spine은 공유하지만 현재 클럽·멤버/호스트 workspace selector를 system navigation과 섞지 않는다. Desktop에서는 grouped left system navigation, tablet/mobile에서는 이름이 있는 `관리 메뉴` sheet를 쓴다. Platform admin이 특정 클럽의 member/host workspace로 들어갈 때만 해당 클럽의 일반 global shell로 전환한다.

### 7.2 역할별 주 메뉴

멤버와 호스트는 같은 breakpoint에서 primary navigation을 같은 위치와 interaction model로 쓴다. Wide/compact desktop과 tablet은 상단 horizontal navigation, mobile은 하단 4개 tab이다.

- 멤버: `오늘 / 노트 / 기록 / 내 공간`
- 호스트: `오늘 / 모임 / 멤버 / 기록`

Platform admin은 깊은 cross-club IA 때문에 공통 brand spine 아래 기존 좌측 system navigation을 유지할 수 있다. Club host의 왼쪽 영역과 같은 것으로 취급하지 않는다.

Host target route ownership:

| 주 메뉴 | canonical target | 소유 범위 |
| --- | --- | --- |
| 오늘 | `/clubs/:slug/app/host` | 여러 모임의 attention과 안전한 다음 행동 |
| 모임 | `/clubs/:slug/app/host/sessions` | 예정·진행 모임 목록, 새 모임 진입 |
| 멤버 | `/clubs/:slug/app/host/members` | club-scoped member 운영 |
| 기록 | `/clubs/:slug/app/host/records` | `CLOSED/PUBLISHED` 기록 목록과 정리·수정 진입 |

`/app/host/notifications`의 cross-meeting 알림 운영은 `오늘`에서 진입하는 이름 있는 보조 도구이며 다섯 번째 주 메뉴가 아니다. 특정 모임의 `알림`은 그 모임 안의 로컬 작업이다. 멤버의 `받은 알림`, host의 cross-meeting `알림 운영`, 특정 모임의 `알림`을 같은 destination이나 같은 label로 합치지 않는다.

### 7.3 현재 모임의 로컬 작업 목차

특정 모임 desktop 화면 안에서만 왼쪽에 둔다.

- 개요
- 참석 응답
- 실제 출석
- 모임 기록
- 알림
- 변경 내역

이 목차는 글로벌 host 메뉴가 아니며 lifecycle progress bar도 아니다. 순번, 연결선, 완료율, `3/6 완료`를 표시하지 않는다. 필요한 경우 `미응답 5`, `확인 필요`, `초안 있음`처럼 실제 저장 데이터로 계산한 상태 badge만 표시한다. 클릭하면 같은 모임의 해당 작업을 연다. Tablet은 horizontal unordered context strip을 기본으로 쓰고, 200% zoom·긴 label·container 폭 때문에 항목 전체를 읽을 수 없을 때 이름이 있는 `모임 작업 목차` disclosure button과 anchored non-modal popover `<nav>`로 대체한다. Mobile은 full-width `모임 작업 목차` button과 modal bottom sheet `<nav>`를 사용한다. 선택 시 sheet를 닫고 route heading으로 focus를 옮기며 dismiss 시 trigger로 focus를 복원한다.

### 7.4 역할 전환 계약

Workspace 선택기는 현재 클럽에서 실제로 접근 가능한 공간만 보여 준다. 멤버 권한과 호스트 권한을 모두 가진 사람에게는 두 공간을 항상 명시적으로 제공하고, 어느 공간에 있는지 control 자체에서 드러낸다. 권한이 없는 공간을 단순 disabled option으로 남겨 혼란을 만들지 않는다.

전환 target 우선순위:

1. 같은 모임·기록의 안전한 대응 화면이 있고 권한이 있으면 그 화면
2. 대상 club/workspace에서 마지막으로 본 안전한 route
3. 대상 workspace의 `오늘`

같은 객체의 안전한 대응 화면:

| Host에서 보는 모임 | Member target | 대응 여부 |
| --- | --- | --- |
| `DRAFT + HOST_ONLY` | 없음 | 마지막 안전 route 또는 멤버 `오늘` |
| `DRAFT + GUEST_READABLE` | 같은 모임의 예정 상세 | 가능 |
| `OPEN + HOST_ONLY` | 없음 | 마지막 안전 route 또는 멤버 `오늘` |
| `OPEN + GUEST_READABLE` | 같은 모임 상세 또는 현재 모임 | 가능 |
| `CLOSED + HOST_ONLY` | 없음 | 마지막 안전 route 또는 멤버 `기록` |
| `CLOSED + GUEST_READABLE` | 같은 모임 archive 상세 | 가능 |
| `PUBLISHED + GUEST_READABLE` | 같은 모임 notes/archive 상세 | 가능 |

Member에서 host로 전환할 때도 같은 `sessionId`가 현재 클럽에 속하고 host authority가 있을 때만 host 모임 route로 대응한다. 개인 노트 편집, 멤버 알림, 계정 설정처럼 host counterpart가 없는 route는 마지막 안전 host route 또는 host `오늘`로 간다.

보존 규칙:

- workspace는 URL로 결정한다. `sessionStorage`가 현재 chrome을 결정하지 않는다.
- 마지막 route memory는 이동 target 보조일 뿐 render authority가 아니다.
- 삭제 확인, one-time modal, 만료 초대, 권한이 사라진 path는 복원하지 않는다.
- 미저장 입력이 있으면 전환 전 이탈 확인을 제공한다.
- 명시적 역할 전환은 browser history에 남기고 Back으로 이전 workspace에 복귀한다.
- 권한 박탈은 `replace`로 안전한 멤버 route에 보내고 이유를 알린다.

### 7.5 클럽 전환 계약

다른 클럽에 source club의 entity ID, cursor, `sessionId` query, edit route를 복사하지 않는다.

- `오늘`, `노트 목록`, `기록 목록`, `내 공간`처럼 route-family allowlist로 안전하게 대응되는 위치만 유지
- 특정 모임·feedback·cursor·hash는 destination의 안전한 목록 또는 workspace home으로 내림
- destination host capability는 loader와 같은 authoritative predicate를 사용
- club switcher는 본문 필터가 아니라 글로벌 셸에 위치

## 8. 전체 수명주기

| 작업 단계 | 시작 상태 → 결과 상태 | 핵심 판단 | 주 행동 |
| --- | --- | --- | --- |
| 새 모임 | 없음 → `DRAFT` | 어떤 책·일시·노출로 안전하게 저장할 것인가 | 모임 초안 저장 |
| 참석 응답·질문 | `DRAFT → OPEN` | 누구에게 모임을 보이고 준비를 시작할 것인가 | 멤버와 준비 시작 |
| 실제 출석 | `OPEN → CLOSED` | 실제로 누가 참여했는가 | 모임 마치기 |
| 기록 초안 | `CLOSED` 유지 | 이 내용을 현재 기록으로 바꿔도 되는가 | 기록에 반영 |
| 노트 게시 | `CLOSED → PUBLISHED` | 이미 archive에서 읽을 수 있는 기록을 게스트·멤버 노트에 배치할 것인가 | 게스트·멤버 노트에 기록 게시 |
| 게시 후 수정 | `PUBLISHED` 유지 | 수정본으로 모든 reader 표면을 바꿔도 되는가 | 수정본 게시 |
| 수정·복구 | 상태별 | 무엇을 되살리고 무엇을 유지할 것인가 | 수정본 만들기 또는 명시적 복구 action |

날짜는 lifecycle을 바꾸지 않는다. 같은 `OPEN` 안에서 권장 행동만 준비 → 실제 출석 → 지연된 마감으로 바뀐다.

## 9. 모임 목록과 진입

### 9.1 0개

- 한 개의 `첫 모임 만들기` action
- 샘플 KPI, 빈 table, 여러 onboarding card를 동시에 보여 주지 않음

### 9.2 1개

- `DRAFT` 또는 `OPEN`이면 현재 work surface로 바로 연결
- `CLOSED/PUBLISHED`만 있으면 기록 상태와 다음 안전 행동을 보여 줌

### 9.3 여러 개

- 안정적인 date/state/attention 정렬
- 여러 attention item을 임의의 한 `current` card로 숨기지 않음
- 상태, 다음 행동, 노출 결과를 row에서 구분
- 검색·filter·trash를 보조 도구로 제공

`모임`은 server-owned `mode=meeting`으로 `DRAFT|OPEN`, `기록`은 `mode=record`로 `CLOSED|PUBLISHED` 한 cursor stream을 사용한다. Browser는 state별 cursor를 합치거나 cross-page reorder하지 않는다. Date/state/attention 정렬은 ADR-0038의 fixed `evaluatedAt`과 list epoch로 안정화한다. 페이지 사이 정렬 입력이 바뀌면 server는 partial page 대신 `LIST_CURSOR_STALE`를 반환하고 client는 canonical no-cursor URL로 replace한 뒤 목록 변경을 알리고 heading focus를 복구한다.

Host `오늘`은 업무 판단을 요약하지만 특정 모임 editor를 중첩 렌더링하지 않는다. `모임` 목록과 특정 모임 route의 ownership을 분리한다.

## 10. 새 모임 만들기

`/clubs/:slug/app/host/sessions/new`는 좁은 modal/sheet가 아닌 전용 route다.

Desktop:

- 왼쪽: 작성 목차 `책과 제목 / 일시와 장소 / 멤버에게 보이기 / 저장 전 확인`
- 가운데: 하나의 연속 form
- 오른쪽: required field, 저장 후 projection, schedule suggestion, 주 행동

Mobile:

- 같은 필드를 한 column으로 유지
- 작성 목차는 상단 step strip 또는 section summary
- sticky save action은 keyboard, bottom navigation, safe area를 가리지 않음

저장 경계:

- 첫 행동은 `모임 초안 저장`
- 저장 결과는 `DRAFT + HOST_ONLY + HIDDEN`을 기본으로 명시
- `멤버와 준비 시작`은 저장과 별도 확인 action
- 저장 자체는 notification을 만들지 않음

`멤버와 준비 시작`은 `DRAFT + HOST_ONLY`를 어중간한 `OPEN + HOST_ONLY`로 남기지 않는다. 확인한 participant snapshot과 함께 `OPEN + GUEST_READABLE + HIDDEN`을 한 transaction으로 만든다. 노출 동의가 없거나 다른 OPEN과 충돌하면 어느 일부도 반영하지 않는다. 호스트만 보는 사전 작업은 계속 `DRAFT`에서 수행한다.

현재 server required input인 title, book title, author, valid date를 field-level validation과 함께 유지한다. time은 current effective default를 사용할 수 있고 location/meeting info는 optional contract를 유지한다. UI가 임의로 더 강한 server invariant를 만들지 않는다.

Text limit은 frontend와 server가 같은 Unicode-aware 규칙을 쓴다. Title, book title, author, location label, meeting passcode는 최대 255 Unicode code point, URL field는 최대 1000자로 검증하며 max/max+1과 emoji·결합문자 fixture를 둔다. Server `400`에서도 해당 field 입력과 focus를 보존한다. DB 제한보다 늦게 generic persistence error가 나게 두지 않는다.

Schedule defaults:

- 지난 최대 10모임의 suggestion source와 이유를 표시
- untouched field에만 항목별 적용
- loading, error, no history를 구분
- 사용자가 비운 값을 다시 채우지 않음
- meeting URL/passcode는 response에 존재할 수 있지만 자동 적용하지 않고 명시적 선택을 요구
- default 실패가 create를 막지 않음
- 이 기능을 recurring series처럼 표현하지 않음

## 11. 멤버와 준비 중

첫 viewport:

- 모임 identity와 `멤버와 준비 중`
- `지금 확인할 일`
- 참석/미정/불참/미응답 합계
- 질문 수와 최근 응답
- 필요한 primary action
- 오른쪽 판단 rail의 실행 전 조건, 결과, 현재 노출 표면

멤버 ledger:

- 한 줄에 display name, 참석 응답, 질문 수, 최근 응답, contextual action
- `미응답`과 data unavailable을 구분
- 중복 display name은 avatar와 privacy-safe secondary identifier로 구분하되 email을 노출하지 않음
- 0/1/일반/50/500 fixture를 검증하고 측정 후 virtualization 여부를 판단
- 긴 목록은 검색, 응답 filter, sticky total, scroll/focus 보존 제공

참석 응답 분모는 현재 club member 수가 아니라 `OPEN` 시작 때 확정하고 이후 명시적으로 추가·제외한 active participant snapshot이다. OPEN 뒤 새로 가입한 멤버를 자동으로 분모에 넣지 않는다. 탈퇴·suspend·participant 제외는 과거 응답·실제 출석 audit를 지우지 않지만 active 응답 분모와 `SESSION_PARTICIPANTS` 기반 준비 알림에서는 제외한다. 이미 참여한 사람의 실제 출석 정정은 history를 남기는 host action으로 유지한다.

Notification audience source:

| audience | authoritative source | confirm freshness |
| --- | --- | --- |
| `SESSION_PARTICIPANTS` | 해당 모임 participant snapshot | `participantSetRevision` |
| `CONFIRMED_ATTENDEES` | 실제 출석 snapshot | 관련 attendance revision vector |
| `ALL_ACTIVE_MEMBERS` | confirm 시점의 current active membership | membership target snapshot/revision |
| `SELECTED_MEMBERS` | preview에서 명시 선택한 active membership ID snapshot | selection hash + membership target snapshot/revision |

Canonical preview는 audience별 source와 content revision을 고정하고 confirm 시점에 관련 revision, active authority, duplicate history를 모두 재검증한다.

알림:

- 전체 notification panel을 focus card 안에 중첩하지 않음
- `미응답 5명에게 알림 준비`처럼 대상과 목적을 말함
- preview에서 최종 대상·채널·skip·duplicate를 확인한 뒤 confirm
- 이미 있는 expiring preview ID, content revision, target snapshot, duplicate detection, explicit resend confirmation을 보존
- 발송 내역을 불러오지 못해도 canonical preview가 target과 duplicate를 재검증할 수 있으면 해당 경로는 유지
- history dependency를 알 수 없을 때 shortcut만 제한

## 12. 실제 출석과 모임 마치기

- 참석 응답은 참고 정보로만 표시
- write 대상은 실제 출석 `출석 / 불참 / 확인 전`
- 각 participant row가 저장·오류·충돌 상태를 독립적으로 표현
- 모임 마치기 전 실제 출석 미확인 수와 결과를 보여 줌
- 출석 미확인이 있더라도 server가 허용하면 warning과 명시적 확인으로 진행하고, server invariant라면 direct fix target을 제공
- `모임 마치기`는 member write가 닫히고 기록이 보존된다는 결과를 설명
- notification을 자동 발송하지 않음
- row 즉시 저장은 participant 한 명의 `PATCH`와 attendance revision을 사용. 여러 명 일괄 변경은 별도 bulk confirm이며 하나라도 stale이면 전체 rollback하고 충돌 row를 표시
- `확인 전`은 first-class `UNKNOWN` contract로 저장·복원할 수 있어야 하며 현재 `ATTENDED|ABSENT` 전용 write를 확장

## 13. 기록 정리와 반영

Publication Desk 문법은 이 단계에서만 쓴다.

중앙 document:

- `기록 초안 · vN`과 `현재 기록 · vN-1` switch
- 요약, 질문, 하이라이트, 한줄평, feedback document, 실제 출석 evidence
- local draft 저장 상태
- base live revision과 stale 여부

오른쪽 판단 rail:

- `반영 전 확인`
- 필수 validation과 optional warning 구분
- 반영 후 `호스트 / 게스트·멤버 / 공개 기록` projection
- `기록에 반영` 한 개의 primary action
- 알림이 자동 발송되지 않는다는 결과
- 다음 단계 `게스트·멤버 노트에 기록 게시`

기록 source:

- JSON import, AI generation, 직접 편집은 같은 record draft 경계로 들어감
- source 선택은 기록 작업 안의 보조 도구
- close/Escape/navigation은 apply를 만들지 않음
- apply는 draft/live/session 관련 expected revision을 검증하고 일부만 반영하지 않음

## 14. 기록 게시와 노출 투영

`PUBLISHED`와 `PUBLIC_RECORD`를 같은 뜻으로 쓰지 않는다.

| 모임 상태 | 호스트 | 게스트·멤버 | 공개 기록 |
| --- | --- | --- | --- |
| 모임 작성 중 | 편집 | `GUEST_READABLE`일 때 예정 화면 후보 | 게시 불가 |
| 멤버와 준비 중 | 편집 | `GUEST_READABLE`일 때 준비 화면 | 게시 불가 |
| 기록 정리 중 | 편집 | `GUEST_READABLE`일 때 archive의 모임·현재 기록 | notes·공개 사이트에는 게시 안 됨 |
| 게스트·멤버 노트 게시 완료 | 편집·수정 | `GUEST_READABLE`일 때 notes/archive | `PUBLIC_RECORD`일 때만 게시 |

Canonical transition copy:

| 내부 변경 | 사용자 action | 실행 결과 copy의 필수 내용 |
| --- | --- | --- |
| `DRAFT → OPEN` | 멤버와 준비 시작 | 게스트·멤버 노출 여부, 알림 자동 발송 없음 |
| `OPEN → DRAFT` | 모임 초안으로 되돌리기 | 멤버 참여 write 중단, 기존 응답·알림 history 유지 |
| `OPEN → CLOSED` | 모임 마치기 | 실제 출석 결과, member write 중단, 기록 정리 시작 |
| `CLOSED → OPEN` | 모임 다시 열기 | member write 재개, 다른 OPEN 충돌, 공개 기록 배치 해제 여부 |
| `CLOSED → PUBLISHED` | 게스트·멤버 노트에 기록 게시 | 이미 허용된 archive read는 유지, notes 배치 추가, 알림 자동 발송 없음 |
| `PUBLISHED → CLOSED` | 게스트·멤버 노트에서 기록 내리기 | notes에서 내려감, archive read/history와 발송 알림 유지 |
| `HIDDEN → PUBLIC_RECORD` | 공개 기록에 게시 | 공개 사이트 배치 의도. 실제 노출에는 `PUBLISHED`도 필요 |
| `PUBLIC_RECORD → HIDDEN` | 공개 기록에서 내리기 | 공개 사이트에서 내려가며 게스트·멤버 공개와는 별도 |

이 action 전에는 호스트·게스트/멤버·공개 기록 세 표면 projection을 보여 준다. 성공 receipt는 실제 결과를 같은 audience 명칭으로 다시 표시한다. `공개 완료`, `공개 취소`처럼 audience나 목적어가 없는 축약형은 badge 공간이 극도로 좁은 경우에도 쓰지 않는다.

Public cache:

- mutation transaction 뒤 exposure/publication generation을 바꾸고 cache invalidation을 수행
- DB와 origin projection은 mutation transaction에서 원자적으로 바뀐다. browser/CDN이 새 projection을 관찰하는 시점은 별도 convergence SLA로 관리한다.
- 일반 기록 수정과 visibility revoke의 browser/CDN 수렴 목표는 120초 이하이며 실제 cache header, CDN, browser 계층에서 검증한다. 공개 기록 게시 취소와 게스트·멤버 노트 게시 취소는 origin에서 즉시 deny하고 재검증된 response가 stale-while-revalidate로 이전 body를 다시 제공하지 않게 한다.
- 개인정보나 민감 정보 오게시용 긴급 takedown은 별도 platform-admin action으로 generation 회전, CDN purge, origin deny를 함께 수행한다. 관련 public response의 browser freshness를 `max-age=60` 이하로 낮춰 새 navigation/read가 60초 안에 deny를 관찰하도록 한다. Confirm을 활성화하기 전에 기존 `max-age=120 + stale-while-revalidate=600` browser cache lifetime 전체인 720초를 소진하고 pre-change response를 가진 browser에서 경계를 검증한다. CDN/BFF purge는 이 대기 증거를 대체하지 않는다.
- 이미 브라우저에 렌더링됐거나 사용자가 저장한 내용, disconnected offline copy는 원격 회수할 수 없다. 60초 SLA는 takedown commit 이후 새 navigation/read와 cache revalidation 경계이며 이 한계를 confirmation과 incident runbook에 명시한다.
- Immutable DB mutation receipt는 origin 결과, generation, actor, request identity, `convergenceId`를 원자적으로 기록한다. CDN purge attempt는 별도 append-only convergence ledger에 `PENDING|SUCCEEDED|FAILED`, provider attempt, observed time을 추가하고 current convergence projection은 그 ledger에서 계산한다. Mutation receipt 자체를 갱신하거나 같은 DB transaction에서 provider convergence가 끝났다고 표현하지 않는다.
- Operational idempotency/work row는 retention에 따라 제거할 수 있지만 immutable receipt/audit/convergence event는 삭제 가능한 session/publication content에 destructive FK를 두지 않고 redacted UUID snapshot을 보존한다. 기존 7일 hard delete는 계속 성공하고 immutable bytes는 authorized reconciliation/audit 경로에서만 조회한다.
- 긴급 takedown은 §17.5와 ADR-0037의 platform-admin 전용 preview/confirm·authorization·idempotency 계약을 통과해야 하며 host membership 기반 receipt를 재사용하지 않는다.
- purge provider 장애 시 UI 성공으로 끝내지 않고 `회수 진행 중/실패` 운영 상태와 fail-closed origin 결과를 표시한다.

## 15. 게시 후 수정과 버전

- 현재 확정 기록은 수정 중에도 member/public reader에게 유지
- `수정본 만들기`가 current record를 base로 새 record draft 생성
- draft는 host에게만 보임
- apply/publish 전 차이와 세 표면 projection 재검토
- 성공 후 이전 current version은 immutable history에 남음
- 과거 version action은 `이 버전으로 기록 초안 만들기`
- 과거 version을 live에 직접 덮어쓰지 않음

`PUBLISHED` 모임의 수정본은 `기록에 반영` 뒤 다시 lifecycle publish하는 두 단계가 아니다. `수정본 게시`가 record draft, current live record, session/exposure/publication snapshot을 한 번 더 확인하는 단일 최종 commit이다. 성공 전에는 기존 current record가 모든 reader 표면에 유지되고, 성공 transaction 뒤 DB/origin의 member/guest/public projection이 같은 새 live revision으로 전환된다. Reader browser/CDN은 §14의 120초 convergence SLA 안에서 새 revision을 관찰한다. Mutation receipt와 cache generation 변경은 commit 경계에, provider purge 결과는 별도 convergence ledger/projection에 기록한다.

## 16. 세 가지 회복 방식

| 방식 | 대상 | 결과 |
| --- | --- | --- |
| 되돌리기 | lifecycle | 한 단계 이전 상태. 기록·출석·알림 history 유지 |
| 복원 | trash의 DRAFT/OPEN 모임 | 7일 안에 원래 객체 회복. 다른 OPEN 충돌 시 trash에 유지 |
| 이 버전으로 기록 초안 만들기 | record revision | 현재 record를 바꾸지 않고 새 draft 생성 |

이미 보낸 notification은 되돌리기·복원·게스트·멤버 노트 게시 취소로 회수되지 않는다. 확인 copy와 history receipt가 이 사실을 말한다.

Trash tombstone:

- restore deadline과 남은 기간
- expired 시 `410` 상태, action 제거, 목록으로 복귀
- OPEN restore conflict 시 current OPEN 링크와 안전한 다음 행동
- silent downgrade 또는 implicit DRAFT restore 금지

## 17. 저장·동시 편집·중복 실행 계약

### 17.1 명시 저장

- 기본 정보와 여러 field form
- record draft
- publication 설정

Local input은 server 성공 전까지 보존한다. `409`와 현재 host authority가 유지된 recoverable failure에서는 남기지만, authority revoke·suspend·cross-club scope failure에서는 §22에 따라 즉시 폐기한다.

### 17.2 즉시 저장

- 단일 출석 상태
- 의미가 명확하고 reverse가 안전한 toggle

Definitive failure만 rollback한다. response loss처럼 결과가 불확실하면 `확인 중`으로 바꾸고 authoritative state를 refetch한다.

### 17.3 Optimistic concurrency — P0

- 같은 base의 공동 호스트 update 중 하나만 성공하고 다른 하나는 `409`
- conflict UI는 내 값, current server 값, actor/time의 privacy-safe summary와 `내 초안 유지 / 최신 내용 불러오기 / 차이 비교 후 다시 적용`을 제공
- stale 시 partial update/apply/publish 금지

Revision domain:

| revision | 증가시키는 변경 | 주 consumer |
| --- | --- | --- |
| `sessionRevision` | 기본 정보, lifecycle, trash/restore | 기본 저장, open/close/reverse, delete/restore |
| `exposureRevision` | app reader의 `accessScope`만 | 게스트·멤버 노출 설정, reader projection |
| `participantSetRevision` | participant 추가·제외·`participationStatus` 변경 | 응답 분모, `SESSION_PARTICIPANTS` target, close preview |
| `attendanceRevision` | 해당 participant의 실제 출석 | 단일 row 출석 저장 |
| `recordDraftRevision` | 기록 초안 수정 | apply/수정본 게시 |
| `liveRecordRevision` | current record 교체 | apply/수정본 게시/history |
| `publicationRevision` | public summary, `siteVisibility`, public-site placement input | publish/수정본 게시/공개 기록 게시·내리기 |

서버 preview는 action에 필요한 version vector와 projection snapshot ID를 함께 반환한다. 서로 독립인 participant의 출석 변경은 방해하지 않지만, RSVP 변경이 실제 출석 revision을 올리지는 않는다. Close는 `sessionRevision + participantSetRevision + attendance snapshot`을 검증한다. `CLOSED → PUBLISHED`는 `sessionRevision + liveRecordRevision + exposureRevision + publicationRevision`, `수정본 게시`는 `sessionRevision + recordDraftRevision + liveRecordRevision + exposureRevision + publicationRevision`을 검증한다.

노출 설정은 일반 form save가 아니다. `accessScope` 변경은 `expectedExposureRevision`, `siteVisibility` 변경은 `expectedPublicationRevision`을 검증한다. 한 command가 두 필드를 함께 바꾸면 두 revision을 모두 받아 session/publication dual-write를 한 conditional transaction으로 처리한다. `PUBLISHED`에서 공개 효과가 생기거나 사라지는 변경은 세 표면 projection 확인, receipt, idempotency, cache generation 변경을 같은 DB commit 경계에 포함하고 provider purge는 §14의 convergence 상태로 추적한다.

Close와 member write의 경합은 server transaction에서 직렬화한다. RSVP, check-in, 질문, 서평 write가 close보다 먼저 commit되면 CLOSED snapshot에 반드시 보존되고, close가 먼저 commit되면 뒤의 member write는 명시적인 lifecycle conflict로 거절된다. 성공 응답 뒤 데이터가 사라지거나 `CLOSED` 이후 ghost write가 생길 수 없다.

### 17.4 Idempotency와 reconciliation — P0

Create, basic save, single/bulk attendance, access/publication 설정, open/close/reverse, record apply/수정본 게시, trash/restore, notification confirm처럼 audit receipt나 외부 표면 변경을 만드는 host mutation은 idempotency key와 durable receipt 계약을 갖는다.

- key scope: `(clubId, actorMembershipId, operation, resourceId-or-create-slot, idempotencyKey)`
- Server가 DTO validation/default 적용 뒤 operation별 versioned canonical schema로 request identity를 만든다. Unicode는 NFC, object field는 schema order, collection order는 의미가 있는 경우 보존하고 set 의미만 정렬하며 null/omitted/default 의미를 schema version에 고정한다.
- Meeting URL/passcode를 포함할 수 있으므로 raw canonical payload나 평문 SHA digest를 저장·log·receipt에 넣지 않는다. Server secret-keyed HMAC comparison digest와 `canonicalSchemaVersion`, `digestKeyVersion`만 저장한다.
- 같은 key·같은 HMAC digest는 동일 receipt를 반환한다. 이전 digest key는 그 `digestKeyVersion`을 참조하는 idempotency row가 하나도 남지 않고 추가 24시간 rollout buffer가 지난 뒤에만 폐기한다. Reference count를 확인할 수 없거나 purge가 지연되면 key retirement를 fail closed하고 운영 alert를 낸다.
- 같은 key·다른 payload는 `409 IDEMPOTENCY_KEY_REUSED`
- receipt 조회 전 현재 club과 host authority를 다시 확인
- idempotency row는 최소 24시간 보존 후 bounded purge할 수 있지만 immutable change/audit receipt는 기존 retention을 유지
- notification preview/confirm의 content revision, target snapshot, duplicate/resend 계약은 더 약한 generic key로 대체하지 않음

응답이 끊기면:

1. generic `다시 시도`를 즉시 제공하지 않음
2. current state와 immutable receipt를 조회
3. commit 확인 시 성공 결과 표시
4. 미실행이 확인될 때만 같은 idempotency key로 재시도
5. notification resend는 별도 명시 확인을 다시 요구

어떤 lifecycle·노출·기록 action도 notification을 자동 발송하지 않는다. Create, open, close, apply, 수정본 게시, publish/unpublish, reopen/return-to-draft, access/publication 설정, trash/restore의 receipt는 `notificationDecision=NOT_SENT` 또는 별도 preview/confirm으로 만들어진 실제 dispatch를 명시한다.

### 17.5 Platform-admin 긴급 takedown — P0

긴급 takedown은 host mutation이 아니다. 별도 `EMERGENCY_PUBLIC_TAKEDOWN` capability를 active platform-admin OWNER/OPERATOR에만 매핑하고 application service가 `actor.can(...)`으로 검사한다. Capability가 있는 actor만 대상 club, session/publication identity, current generation을 고정한 preview를 만들고 non-blank reason을 확인한 뒤 실행한다. `SUPPORT`, inactive admin, capability가 제거된 OPERATOR actor, target mismatch는 fail closed한다.

- key scope: `(platformAdminUserId, operation=EMERGENCY_PUBLIC_TAKEDOWN, clubId, publicationId, idempotencyKey)`
- preview TTL, target generation, reason HMAC, request HMAC, actor role을 confirm에서 재검증
- origin deny/generation commit은 immutable admin mutation receipt를 한 번만 생성
- response loss는 receipt와 convergence ledger를 조회하며 같은 key replay는 purge command를 중복 생성하지 않음
- failed provider purge 재개는 같은 `convergenceId` 아래 append-only attempt를 추가하고 mutation receipt를 다시 만들지 않음
- immutable admin audit에는 actor ID/role, reason category와 redacted reason, target identity, origin result, convergence ID만 저장

## 18. Query와 partial failure

필요한 panel이 열릴 때 heavy query를 활성화한다.

- basic/attendance는 record query 실패와 독립
- record editor는 history/notification dispatch 실패와 독립
- history pagination failure는 현재 page와 다른 작업을 유지

표현할 상태:

| 상태 | 의미 | UX |
| --- | --- | --- |
| loading | 아직 결과 없음 | skeleton/status, 다른 작업 가능 |
| known empty | 조회 성공 + 0건 | 명시적 empty copy와 다음 행동 |
| unavailable | 조회 실패 | 해당 영역 retry, `없음` 금지 |
| stale cached | 이전 데이터 + 최신 실패/조회 중 | timestamp와 최신성이 필요한 action 제한 |

Action freshness:

| action | 반드시 fresh여야 하는 데이터 | stale/unavailable일 때 |
| --- | --- | --- |
| 멤버와 준비 시작 | session, exposure, participant set, 다른 OPEN 여부 | action 차단, 해당 영역 retry |
| 모임 마치기 | session, participant set, 실제 출석 snapshot | action 차단, 입력은 유지 |
| 게스트·멤버 노트에 기록 게시 | session, live record, exposure, publication | action 차단, current reader projection 유지 |
| 기록에 반영 / 수정본 게시 | record draft, live record, session, exposure, publication | action 차단, diff와 local draft 유지 |
| 공개 기록에 게시/내리기 | exposure/publication, lifecycle | action 차단, current reader projection 표시 |
| 휴지통 이동/복원 | lifecycle, durable-history eligibility, tombstone/open conflict | action 차단, authoritative preview 재조회 |
| 알림 confirm | preview TTL, content revision, target snapshot, duplicate history | 기존 preview 폐기 후 새 preview 요구 |

Route-level fatal error는 auth/scope/session identity처럼 workspace 자체를 안전하게 구성할 수 없는 경우로 한정한다.

## 19. URL·Back/Forward·deep link

- canonical member workspace: `/clubs/:slug/app/**`
- canonical host workspace: `/clubs/:slug/app/host/**`
- `/app/**` compatibility entry는 authoritative current club을 해석한 뒤 scoped canonical URL로 `replace`하는 진입점으로만 유지
- host current meeting: `/clubs/:slug/app/host/sessions/:sessionId`
- workspace render authority는 pathname과 authoritative loader auth

Global primary route mapping은 §7.2 표를 따른다. Target의 `/host/records`가 생기기 전 현재 `/host/sessions` 기반 record 목록은 compatibility source일 뿐 새 `모임`과 `기록` 메뉴가 같은 destination을 공유하지 않는다.

기존 query를 호환한다.

| 로컬 표시명 | query | route owner / 활성 판정 |
| --- | --- | --- |
| 개요 | 없음, `section=overview` | 계산된 지금 할 일. 개요 active |
| 개요의 모임 정보 편집 | `section=basic` | 개요 안의 edit panel. 개요 active |
| 참석 응답 | `section=responses` | response ledger. 참석 응답 active |
| 실제 출석 | `section=attendance` | attendance ledger. 실제 출석 active |
| 모임 기록 | `section=records` | record workspace. 모임 기록 active |
| 모임 기록의 JSON 보조 작업 | `section=records&source=json`, `records=json` | 모임 기록 active |
| 모임 기록의 AI 보조 작업 | `section=records&source=ai`, `aigen=1` | 모임 기록 active |
| 알림 | `section=notifications` | 현재 모임 notification workspace. 알림 active |
| 변경 내역 | `section=history` | immutable history. 변경 내역 active |
| invalid value | 해당 없음 | mutation 없이 안전한 개요 |

Target design에서는 이 query가 desktop local index와 tablet/mobile context navigation의 같은 semantic target을 연다. Panel/modal을 열고 닫을 때 Back/Forward와 trigger focus를 복원한다.

Shared member record route를 host chrome으로 암묵 추론하지 않는다. Host가 reader projection을 확인할 때는 명시적으로 member route를 열거나 host 안의 projection preview를 쓴다.

## 20. Responsive와 adaptive layout

Breakpoint는 user agent가 아니라 실제 content viewport를 기준으로 한다.

### Wide desktop — 1120px 이상

- 고정 상단 global spine + 역할별 horizontal primary nav
- meeting masthead
- 왼쪽 local context index
- 넓은 working ledger/document
- 좁은 judgment rail
- nested giant card 대신 open row, divider, aligned column

### Compact desktop — 1024–1119px

- global spine과 horizontal role nav 유지
- local context index는 폭을 줄이되 항목명을 숨기지 않음
- judgment rail은 working surface 아래의 summary/action region으로 이동
- 3열을 억지로 압축하지 않음

### Tablet — 768–1023px

- global spine과 horizontal role nav 유지
- local index는 상단 horizontal unordered context strip. 모든 이름을 표시할 수 없으면 `모임 작업 목차` disclosure button + anchored non-modal popover `<nav>`로 대체
- judgment rail은 working sheet 아래 summary/action region으로 이동
- cramped desktop rail을 유지하지 않음

### Mobile — 320–767px

- 공통 header, 현재 `호스트 · 모임` context, 이름이 보이는 workspace switch
- 같은 위치의 4개 bottom tab
- local context는 full-width `모임 작업 목차` button + modal bottom sheet `<nav>`
- current action을 identity와 summary 직후 배치
- table은 labeled record row로 변환
- sticky action은 keyboard, bottom nav, safe area, dialog를 가리지 않음

Mobile workspace switch는 icon-only나 가로 폭이 큰 segmented control이 아니다. 현재값이 보이는 44px 이상 `호스트 공간 ▾`/`멤버 공간 ▾` button이 authorized workspace bottom sheet를 연다. 359px 이하에서는 brand wordmark를 mark로 줄이고 club name을 ellipsis 처리해도 workspace 이름과 account action은 숨기지 않는다. 긴 club name의 전체값은 switcher accessible name과 sheet에서 확인할 수 있다.

필수 visual fixture:

- 320, 390, 768, 1024, 1440px
- 200% zoom
- 긴 Korean/English label과 long title
- 0/1/50/500 members
- 0/1/many questions, notifications, revisions

## 21. 접근성

- 한 페이지에 명확한 `h1`, 순서가 맞는 section heading
- global nav, role nav, context navigation의 accessible name 분리
- current workspace와 current task에 `aria-current` 또는 동등 semantic
- state는 text/icon/structure를 함께 사용하고 color-only 금지
- field error를 input과 programmatically 연결
- `status`는 저장·reconciliation, `alert`는 즉시 조치가 필요한 failure에 사용
- dialog/sheet focus trap, Escape, backdrop, trigger focus restore
- workspace 전환 뒤 document title을 갱신하고 새 workspace의 `h1`로 focus를 옮기며 `호스트 공간으로 전환했습니다`처럼 한 번만 status announcement
- 로컬 작업 목차는 `<nav>` 안의 link 집합이며 tablist/stepper keyboard model을 흉내 내지 않음
- 권한 박탈 redirect는 이유 alert에 먼저 focus하고 안전한 destination heading으로 이어지는 skip target 제공
- 두 sticky navigation과 context strip은 anchor target에 scroll padding을 제공해 200% zoom에서도 focused heading/control을 가리지 않음
- keyboard로 모든 흐름 완료
- minimum 44×44 touch target
- reduced motion에서 travel/animation 제거, status/focus movement 유지
- screen reader가 visible copy와 다른 legacy `세션/회차` aria-label을 읽지 않음

## 22. 권한·privacy·공개 저장소 안전

- host mutation은 current club의 active host authority를 매번 확인
- role revoked/suspended while open이면 다음 mutation fail closed
- `409 REVISION_CONFLICT`는 local draft를 보존한다. authority가 유지된 `NETWORK_RESPONSE_LOST`와 recoverable provider failure는 local draft를 격리 보존하고 authoritative receipt/state를 확인한다.
- `HOST_AUTHORITY_REVOKED`, `MEMBERSHIP_SUSPENDED`, `CROSS_CLUB_SCOPE`는 HTTP status와 무관하게 보안 purge를 실행한다. 이때 보존하는 것은 안전한 destination을 찾기 위한 route-family뿐이다. 기본 정보 입력, meeting URL/passcode, member ledger, record draft, history/receipt, notification preview를 포함한 host content는 memory, persisted client storage, query cache에서 즉시 폐기하고 다른 club로 replay하지 않음
- in-flight host query/mutation을 cancel하고 해당 club의 host query key, host-only return state, workspace memory를 제거한 뒤 member-safe route로 이동
- Back/Forward, 새 탭, offline cache, service worker가 폐기한 host content를 다시 보여 주지 않음
- membership read capability도 없으면 club selection 또는 public home
- generic error CTA가 금지된 host home을 다시 가리키지 않음
- receipt/reconciliation 조회도 새로운 host authority 검사를 먼저 통과해야 하며 권한이 없으면 mutation 결과의 민감 detail을 반환하지 않음

Public/guest DTO와 evidence artifact:

- email, membership ID, account name, exact private meeting info, passcode 제외
- history/preview/log의 meeting URL/passcode redaction 유지
- audit receipt에는 change ID, actor/time, lifecycle result, visibility result, notification decision/status, undo availability, redaction marker만 필요한 범위로 노출
- screenshot, HAR, fixture, error dump는 합성 club/member/book 데이터만 사용
- 실제 운영 domain, secret, token, local absolute path를 문서·test·artifact에 저장하지 않음

## 23. 성능과 규모

- list와 history는 현재 cursor contract 유지
- equal timestamp에서도 deterministic order와 immutable change ID 사용
- attendee 500 fixture로 payload/render 측정 전 backend pagination을 요구하지 않음
- dense row는 desktop에서 column alignment, mobile에서 labeled record
- lazy query와 targeted invalidation으로 panel을 열지 않았을 때 history/dispatch fetch를 피함
- mutation 뒤 host/member/guest/public query를 실제 exposure 영향에 따라 무효화

500-member acceptance budget은 production build, Chromium stable, 4× CPU throttle, 10 Mbps/40 ms network, cold route 진입 후 5회 median으로 측정한다.

| 항목 | 목표 |
| --- | --- |
| member ledger decoded JSON | 500 KB 이하 |
| ledger가 입력 가능한 상태 | route data 도착 뒤 1초 이하 |
| 검색/filter input response | 100 ms 이하 |
| 단일 row 저장 뒤 React commit | 100 ms 이하 |
| ledger 진입의 추가 JS heap | 25 MB 이하 |

Budget을 넘으면 먼저 row composition과 query projection을 줄이고, 그래도 넘을 때 virtualization 또는 backend pagination을 별도 결정한다. 측정 없이 `500 fixture가 보인다`만으로 통과하지 않는다.

## 24. 호환·migration 경계

바꾸지 않는 것:

- route namespace와 API resource name의 `session`
- enum `DRAFT/OPEN/CLOSED/PUBLISHED`
- `sessionId`, `sessionNumber`, revision/outbox/delivery 기술 필드
- `/archive`, `/sessions/:id`, `/app/host/sessions/**` compatibility
- legacy query `section`, `records=json`, `aigen=1`
- public canonical URL과 SEO metadata route
- 이미 저장된 notification text와 사용자 생성 title
- feedback/import parser marker와 `N차` heading
- V45 rolling-deploy compatibility column·dual-write 제거 범위

함께 migration하는 것:

- visible copy와 aria-label
- shared nav label, mobile header/tab label
- member/public/host formatter
- server error message가 browser에 노출되는 경로
- future email/in-app template
- label을 exact match하는 route state·test selector

과거 notification row를 rewrite하지 않는다. 새로운 template부터 canonical language를 쓴다.

### 24.1 Client contract rolling deploy

`X-Readmates-Client-Contract: v3`는 session endpoint만의 capability가 아니라 모든 mutating `/api/host/**`에 적용하는 전역 host-client generation이다. Session-management 계열은 expected revision, version vector, idempotency, receipt를 추가로 강제하고, 기존 member approval·invite·notification policy/dispatch·test mail 등 non-session host mutation은 기존 endpoint 의미를 유지한 채 v3 generation에서 회귀 없이 동작해야 한다. Browser capability는 secret diagnostics와 분리된 no-store `/api/bff/__internal/client-contract-status` exact schema로 확인한다.

배포 순서는 별도 승인된 backend/BFF v3 support R1 → 별도 승인된 A7+C1 safety/cache R2a(browser v2 유지) → 이전 720초 browser policy 소진과 cache-safety 증거 → v3 frontend/B7 후보 artifact → attested compatibility·non-session·authority manifests의 동일 candidate 검증 → 별도 승인된 R2b v3 Pages → named 24-hour residue-zero observation → 별도 승인된 legacy host write enforcement R3다. Repository code 승인이나 artifact 생성은 live authority를 대신하지 않는다. 실제 artifact/deployment digest와 run identity는 tracked Markdown에 기록하지 않고 protected CI가 생성·attest한 ignored artifact로만 gate에 전달한다.

| Browser | BFF | Backend | host write 결과 |
| --- | --- | --- | --- |
| v2 | v2 | v2 | 배포 전 현재 동작. 목표 완료 증거로 인정하지 않음 |
| v2 | v3 pass-through | v3 support, enforcement 전 | 짧은 호환 window. 전체 mutating `/api/host/**`의 v2 잔존 비율 관찰 |
| v2 | v3 pass-through | v3 enforcement 후 | read는 허용, mutation은 `428 CLIENT_UPDATE_REQUIRED`로 fail closed |
| v3 | v2-only | v2 또는 v3 | BFF capability preflight에서 write 차단. header를 downgrade하지 않음 |
| v3 | v3 pass-through | v2-only | 배포 순서상 노출 금지. backend capability preflight 실패 시 write 차단 |
| v3 | v3 pass-through | v3 | session mutation은 새 envelope, non-session host mutation은 기존 의미로 정상 처리 |

BFF는 browser contract header를 allowlist/normalize하고 구·새 backend 의미를 임의로 변환하지 않는다. Product-level 완료는 v3 enforcement와 구/새 browser × BFF × backend integration evidence가 모두 있을 때만 선언한다.

## 25. Frontend target boundary

Route-first ownership을 유지한다.

- `src/app`: global club shell, URL-derived workspace, role/club continuity
- `features/host/api`: expected revision, idempotency, receipt, projection contract
- `features/host/queries`: scoped keys, lazy panel query, mutation reconciliation, targeted invalidation
- `features/host/model`: lifecycle/date/action, terminology, context index, projection, route mapping의 pure model
- `features/host/route`: loader auth, URL state, query seeding, local draft, mutation orchestration
- `features/host/ui`: prop/callback driven shell, ledger, document, judgment rail, adaptive context navigation
- `shared`: 실제 반복되는 global shell, workspace switch, semantic primitive만 승격

현재 검증된 record editor/import/history component는 필요한 부분을 재사용한다. 거대한 `HostSessionEditor`에 모든 orchestration과 render branch를 추가하지 않는다.

## 26. Server target boundary

기존 clean architecture 방향을 유지한다.

- inbound adapter: expected revision/idempotency input validation, response mapping
- application service: host authorization, lifecycle, stale/conflict, idempotency orchestration
- outbound port/adapter: conditional update, receipt, immutable snapshot, query
- public/guest read side: canonical exposure query와 DTO allowlist

필요한 새/강화 계약:

- 기본 정보 optimistic concurrency
- participant-level attendance concurrency
- 모든 receipt-bearing host mutation의 actor/club/resource/payload-bound idempotency와 durable reconciliation receipt
- publish input snapshot validation
- exposure/publication conditional dual-write와 public cache generation/invalidation
- close 대 member write serialization barrier
- selective query failure를 지원하는 independent read contract
- public cache invalidation 또는 bounded staleness evidence

현재 notification preview의 강한 target/content/duplicate validation은 대체하지 않고 확장 기준으로 삼는다.

## 27. Acceptance matrix와 증거

선택하는 acceptance rows:

| Row | 이유 |
| --- | --- |
| Actor/authorization | member/host 전환, role revoked, cross-club scope |
| Club context | club switch와 entity ID 격리 |
| Session lifecycle | create/open/close/publish와 모든 reverse |
| Guest/public exposure | access scope/site visibility projection과 cache |
| Guest DTO privacy | member ledger, public record, evidence artifact |
| Cursor collection | host list, trash, history, notification 목록 |
| Persistence/migration | concurrency/idempotency/receipt 추가 시 |
| Async/cache/provider | notification duplicate, response loss, public cache |
| UI/runtime state | loading/empty/stale/error, responsive, accessibility |

### 27.1 Server evidence

- 동일 base basic update 두 개 중 하나 `409`, winner 보존
- same/different participant attendance concurrent update
- 실제 출석을 `확인 전`으로 복원하고 single-row/bulk rollback 의미 검증
- close와 RSVP/check-in/question/review write 경합에서 before-commit 보존 또는 after-close 명시 거절
- preview 뒤 다른 host edit 시 apply/publish atomic rejection
- response loss 뒤 create/retry가 session 한 개만 생성
- basic/attendance/exposure/lifecycle/apply/수정본 게시/trash/restore/notification confirm duplicate가 side effect와 audit receipt를 한 번만 생성
- 같은 idempotency key·다른 payload `409`, 권한 박탈 뒤 receipt detail fail closed
- PUBLISHED 수정본 게시 전 기존 revision 유지, commit 뒤 member/guest/public이 같은 새 live revision 사용
- access/site visibility 동시 변경 중 하나만 성공하고 public effect·cache receipt 일치
- lifecycle × access scope × site visibility projection matrix
- 일반 노트/공개 기록 게시 취소 120초, 긴급 takedown 60초 목표, 이전 `120+600=720`초 policy activation gate와 origin/CDN/browser fresh-stale boundary
- 일반 게시·내리기·수정본 게시와 긴급 takedown 모두에서 mutation receipt row·내용은 commit 뒤 불변이고, 같은 `convergenceId` 아래 `PENDING → FAILED → SUCCEEDED` provider attempt가 별도 append-only ledger에 추가되며 current convergence projection이 그 ledger에서만 계산되는 증거
- `EMERGENCY_PUBLIC_TAKEDOWN` capability가 있는 active platform admin OWNER/OPERATOR takedown preview/confirm, capability 없는 OPERATOR·`SUPPORT`·inactive·target mismatch 거절, response-loss idempotency, append-only convergence retry
- 만료된 session/publication hard delete 성공, operational row retention, redacted immutable receipt/audit/convergence bytes 보존
- host/admin idempotency의 versioned canonicalization, secret-keyed HMAC, key-rotation replay와 referenced-key retirement fail-closed
- meeting URL/passcode/raw canonical payload/admin reason/provider error 원문이 DB·log·receipt·DTO에 저장되지 않는 증거
- notification audience별 source/revision matrix와 stale confirm rejection
- trash OPEN restore conflict와 expiry `410`
- history/privacy redaction과 public DTO forbidden key
- v2/v3 browser × BFF × backend rolling-deploy matrix와 non-session host mutation 회귀

### 27.2 Frontend model/route evidence

- terminology mapping과 목적어 있는 public copy
- URL-derived workspace, role switch target priority
- club switch route-family allowlist
- Back/Forward, direct entry, new tab, reload, resize
- invalid section fallback without mutation
- loading/known empty/unavailable/stale cached
- `REVISION_CONFLICT`에서 local draft 보존
- authority가 유지된 `NETWORK_RESPONSE_LOST`에서 local draft 보존과 reconciliation
- `HOST_AUTHORITY_REVOKED`, `MEMBERSHIP_SUSPENDED`, `CROSS_CLUB_SCOPE`에서 local host content·cache 즉시 폐기
- selective record/history/dispatch failure가 basic/attendance를 막지 않음

### 27.3 UI/browser evidence

- lifecycle scenario: create → open → response → attendance → close → draft/apply/노트 게시 → correction/노트에서 내리기 → history/undo
- 별도 eligible-session scenario: record revision, notification decision/dispatch, member-created durable content가 없는 DRAFT/허용된 OPEN → trash → tombstone → restore/expiry/conflict. Basic·attendance change receipt와 operational idempotency row는 자체로 trash blocker가 아니며, immutable audit retention은 유지하고 bounded idempotency row는 별도 purge한다.
- member/guest/public projection after every forward/reverse transition
- 320/390/768/1024/1440, 200% zoom
- long Korean/English, 0/1/50/500 members
- keyboard-only full flow
- Chromium desktop, Firefox desktop, WebKit/iOS 계열 mobile 기본 흐름
- VoiceOver + Safari와 NVDA + Chrome 중 최소 하나는 전체 흐름, 다른 하나는 navigation/form/conflict 핵심 흐름
- reduced motion, focus restore, mobile keyboard, safe area
- shared dark theme이 구현 시점에 존재하면 light/dark 모두 같은 정보 hierarchy·contrast를 검증. 이 설계만을 위한 host-only dark theme은 만들지 않음

### 27.4 Canonical commands for implementation completion

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./scripts/server-ci-check.sh`
- `./server/gradlew -p server integrationTest`
- `pnpm --dir front test:e2e`
- public artifact가 추가되면 public-release candidate checks

구현은 승인된 workspace redesign, server safety, host-client v3, public-projection convergence 계획으로 분리해 수행했다. 현재 완료 판단은 이 historical spec의 예정 문구가 아니라 active architecture, ADR registry, release-readiness review와 각 계획의 evidence ledger를 따른다.

## 28. 출시 차단 조건

다음 중 하나라도 없으면 product-level 완료로 부르지 않는다.

- silent co-host overwrite 방지
- stale apply/publish atomic rejection
- exposure/publication conditional write와 stale public effect rejection
- close 대 member write serialization
- ambiguous retry reconciliation
- v3 enforcement의 browser × BFF × backend 혼합 배포와 non-session host mutation 회귀
- role revoke/suspend/cross-club scope에서 host local content·cache purge
- public revoke 120초·긴급 takedown 60초 convergence 경계와 실패 receipt
- 모든 public-effect mutation에서 immutable mutation receipt와 별도 append-only convergence ledger를 분리하고, 같은 `convergenceId` 아래 provider attempt를 추가하며 current projection을 ledger에서만 계산
- 긴급 takedown의 platform-admin authorization, preview/confirm, idempotency, append-only convergence audit
- versioned request canonicalization, secret-keyed HMAC, rotation replay, referenced-key retirement fail-closed
- meeting URL/passcode/raw canonical payload/admin reason/provider error 원문의 DB·log·receipt·DTO 비저장
- notification audience별 authoritative source와 confirm revision 재검증
- 실제 출석 `확인 전` correction과 bulk all-or-nothing
- unknown data를 empty로 표시하지 않는 selective failure UI
- host/member/guest/public projection evidence
- workspace URL authority와 club/resource isolation
- 320/390 mobile completion과 200% zoom
- keyboard/screen-reader evidence
- privacy-safe public repository artifact scan

## 29. 승인된 결정 요약

- 사용자 화면의 핵심 명칭은 `모임`, 번호는 `No.N`/`N번째 모임`이다.
- 하나의 ReadMates visual language와 역할별 composition grammar를 쓴다.
- 멤버와 호스트는 같은 global shell을 쓰고, 같은 breakpoint에서 역할 메뉴 위치를 통일한다. Desktop/tablet은 상단, mobile은 하단이다.
- host 왼쪽 영역은 현재 모임의 로컬 작업 목차다.
- 새 모임은 전용 route에서 먼저 안전한 초안으로 저장한다.
- 참석 응답과 실제 출석을 분리한다.
- 기록 초안, 현재 기록, `PUBLISHED`의 게스트·멤버 노트 게시, 공개 사이트 게시를 분리한다.
- 공개된 기록 수정은 새 draft에서 시작한다.
- 되돌리기, trash 복원, version-to-draft를 구분한다.
- 정상 화면과 같은 비중으로 conflict, timeout, partial failure, permission change를 설계한다.
- 작업량보다 운영 안정성과 검증 품질을 우선한다.
