# ReadMates host·admin visual authority

이 문서는 현재 코드·테스트·tracked screenshot이 구현한 host/admin 시각 권위다.
승인 설계나 미구현 목표를 적지 않는다. Public, guest, member composition은 이 문서로 바꾸지 않는다.

- ADR-0044: Superseded by ADR-0046 (주 행동 계산 규칙은 다이어리형에 계승)
- ADR-0045: Accepted — host/admin 공유 paper/ink primitive
- ADR-0046: Superseded by ADR-0048
- ADR-0048: Proposed — 현재 host lifecycle operating-room 결정의 acceptance는 별도 closeout 대상
- ADR-0047: Superseded by ADR-0050
- ADR-0050: Accepted — 오늘 할 일 중심 운영 데스크 + 클럽 관리·서비스 상태·처리 기록 4축
- ADR-0051: Accepted — 플랫폼 운영·내 클럽 two-level 전역 공간 전환
- Token source: `design/system/src/styles/tokens.css`
- Viewport contract: `front/tests/e2e/support/visual-authority-contract.ts`

## Host primary chrome

호스트 1차 내비게이션은 3탭이다: **오늘** · **모임** · **멤버**.
데스크톱 top nav와 모바일 tab bar가 같은 목적지(`HOST_ROUTE_HREFS.today` / `.meetings` / `.members`)를 쓴다.
알림 발송(`/app/host/notifications`)은 1차 탭이 아니라 오늘에서 진입하는 화면이다(모바일에서 오늘 탭 current에 포함할 수 있다).
구 경로 replace redirect: `/records`→`/sessions`, `/operations`→오늘(`/host`), `/invitations`→`/members`.

## Shared tokens

Host와 platform admin은 같은 paper/ink primitive를 쓴다. Role-only palette나 dark NOC theme는 없다.

| Token | 역할 |
| --- | --- |
| `--paper-50` … `--paper-300`, `--bg`, `--bg-sub` | warm paper surface |
| `--ink-900` … `--ink-200`, `--text`, `--text-2` | ink hierarchy |
| `--accent`, `--accent-hover`, `--accent-soft` | restrained navy/ink-blue action |
| `--danger`, `--warn`/`--stale`, `--ok`/`--success` | semantic state; color만으로 상태를 구분하지 않음 |
| `--space-*`, `--type-size-*`, `--type-leading-body` | editorial spacing and wrapping |
| `--focus-ring`, `--focus-ring-soft` | visible focus |
| `--motion-fast`, `--motion-page`, `--motion-reveal` | default motion 120ms / 190ms / 280ms |

공통 규칙:

- 최소 44px target, `overflow-wrap: anywhere`, 장문 한국어를 자른 KPI card grid가 아니다.
- glassmorphism, glow, decorative leather/file-folder skeuomorphism을 쓰지 않는다.
- 데이터 사실은 badge보다 문장·표·definition list를 우선한다.
- `prefers-reduced-motion: reduce`는 animation/transition duration을 `0.001ms`로 강제한다. visual-authority helper `expectReducedMotion`의 20ms lingering cap은 reduced-motion 환경에서만 적용한다.

## Host Today triage

적용 범위는 host home(오늘)이다. 페이지 타입은 오늘형(트리아지)이다.

`/app/host` (등록 host) · `/clubs/:slug/app/host`

`HostDashboardRoute`가 auth, club context, attention·operations·notification query, `buildHostTodayView` composition을 소유한다.
`HostTodayPage`는 오늘형 page shell이다. DOM 순서:

1. page header — eyebrow `호스트 · 오늘`, h1 `오늘`, headline lede
2. `region "처리할 일"` — resolve queue(기본 상한 7, **전체 보기**는 같은 페이지에서 나머지 항목을 펼침) 또는 zero-as-data 한 줄(`오늘 처리할 일이 없습니다 · 마지막 확인 HH:MM`)
3. hero — 다음 모임 / 모임 당일(`오늘 모임` + primary `출석 확인 열기` → `section=attendance`) / empty(`첫 모임 만들기`)
4. `aside "참고"` — 다가오는 일정, 클럽 상태 definition list, `운영 기록 전체 보기` quiet link → `/sessions` (desktop rail; mobile below)

오늘형은 KPI 타일·균등 카드 그리드가 아니다. 다이어리형 레이아웃을 복제하지 않는다.
Lifecycle 상태 문구는 `hostMeetingLifecycleLabel`만 쓴다: `작성 중` / `준비 중` / `기록 정리 중` / `게시됨`.

오늘형 CT 스크린샷 잠금 대상은 아직 없다(홈 CT 부재).

## Host list pages (목록형)

적용 범위는 호스트 1차 탭 중 모임 목록과 멤버 원장이다. 페이지 타입은 목록형이다. 오늘형 큐나 다이어리 스프레드를 복제하지 않는다.

### Meeting TOC

`/app/host/sessions` · `/clubs/:slug/app/host/sessions`

`HostMeetingListRoute`가 upcoming·past query와 cursor pagination을 소유한다.
`HostMeetingList`는 목록형 page shell이다. DOM 순서:

1. page header — eyebrow `호스트 · 예정과 기록`, h1 `모임`, lede
2. `region "다가오는 모임"` — TOC rows 또는 section-scoped error+retry
3. `region "지난 모임"` — TOC rows 또는 section-scoped error+retry
4. quiet `휴지통`

Row grammar: folio ordinal · title · optional attention text · lifecycle chip · dotted leader · mono summary.
Upcoming summary는 `MM-DD 예정일`. Past summary는 `MM-DD`만 두고 lifecycle은 chip이 담당한다.
Lifecycle chip은 desktop·mobile 모두 보인다. 다가오는 목록 fetch 실패가 지난 모임 구간을 가리지 않는다.

`max-width: 640px`에서 행은 `핵심 사실 1줄 + 상태 + 시각` 그리드로 재구성되고 title이 행 전체 tap target이다. 가로 스크롤 표가 아니다.

목록형 CT 스크린샷 잠금 대상은 아직 없다.

### Members ledger

`/app/host/members` · `/clubs/:slug/app/host/members`

`HostMembersRoute`가 member·invitation loader와 mutation을 소유한다.
멤버 화면 DOM 순서:

1. page header — eyebrow `운영 · 멤버 관리`, h1 `멤버 관리`
2. summary counts
3. pending viewer zone(있을 때만)
4. roster table
5. invitation ledger

Roster row grammar: 이름(핵심 사실) · 상태 · 함께한 기간(시각) · 이번 모임 · 관리.
Invitation row grammar: 이름(핵심 사실) · 이메일 · 상태 · 만료·수락(시각) · 액션.

`max-width: 640px`에서 두 표 모두 CSS로 `핵심 사실 1줄 + 상태 + 시각` 리스트로 재구성한다. 가로 스크롤 표 금지. 레이아웃은 `member-ledger.css`가 소유한다.

## Host Meeting Diary

적용 범위는 특정 모임 canonical 경로뿐이다. 페이지 타입은 다이어리형이다(ADR-0044 Focus Deck 주 행동 계산을 스프레드로 재조립; ADR-0046 Accepted).

`/clubs/:slug/app/host/sessions/:sessionId` (등록 host의 `/app/host/sessions/:sessionId`)

`HostMeetingWorkspaceRoute`가 auth, base detail, URL, panel query, mutation, receipt, closing-status, authority-loss purge를 소유한다.
`HostMeetingWorkspace`는 `HostSessionWorkspace`를 `.rm-meeting-diary` 스프레드로 조립한다. DOM 순서:

1. optional `navigation "이전·다음 모임"` — 인접 모임 pager
2. left page — 모임 identity(`WorkspaceHeader`), `멤버 시야로 보기`, `group "공개 상태"`, `navigation "모임의 걸음"`(6단계 세로 타임라인)
3. `region "지금 할 일"` — 한 개의 primary CTA와 이유(ADR-0044 계산 규칙 유지)
4. step content — 기본 `region "진행 목록"`; CLOSED 기록 단계에서는 embedded `region "장부 마감 체크리스트"`(`SessionClosingBoard` `embedded`)
5. `navigation "관련 작업"` — 정보·응답·출석·기록·알림·변경 내역 deep link
6. undo/recovery — 최근 변경, 충돌, public convergence
7. info/attendance/records/history/notification panel 또는 sheet

타임라인 단계명(§4.2 고정): `모임 만들기` → `멤버와 준비` → `응답 모으는 중` → `모임 당일(출석)` → `기록 정리` → `기록 게시`.
Page-level local task navigation과 judgment complementary rail은 primary composition이 아니다.
`/closing`은 다이어리 기록 정리 단계(`section=records`)로 착지한다.

List, new, members, notifications는 같은 token과 state grammar를 쓰되 다이어리·오늘형 레이아웃을 복제하지 않는다.
지운 모임 URL은 다이어리가 아니라 `WorkspaceTrashTombstone`이다.

### Status and primary action

상태 문구는 `작성 중` / `준비 중` / `기록 정리 중` / `게시됨`이다(`hostMeetingLifecycleLabel`).
Lifecycle·audience·public placement를 하나의 stepper로 합치지 않는다.

| Lifecycle | 계산된 주 행동 |
| --- | --- |
| `DRAFT` | `멤버와 준비 시작` |
| `OPEN` before meeting day | `멤버 응답 확인하기` |
| `OPEN` with unknown attendance | 실제 출석 확인 |
| `OPEN` otherwise | `모임 마치기` |
| `CLOSED` record pending / stale / unavailable | `다음 할 일 확인 중` (disabled, fail closed) |
| `CLOSED` no draft | `정리본 올리기` |
| `CLOSED` draft needs review | `반영 전 확인` 또는 `기록에 반영` |
| `CLOSED` applied record ready | `게스트·멤버 노트에 기록 게시` |
| `PUBLISHED` | `공개 기록 보기` |

Record-dependent action은 기존 record editor query를 readiness union으로 읽는다.
`pending`/`stale`/`unavailable`을 `false`로 추정하지 않는다. Publication·overwrite는 ready가 아니면 잠근다.

`section` query는 panel deep link다. Back/Forward와 Escape는 연 컨트롤로 focus를 되돌린다.
한 panel 실패가 다이어리 스프레드 전체를 막지 않는다. 모바일 sticky primary는 safe-area를 반영하고 본문 CTA와 중복 announce하지 않는다.

## Editorial Operations Ledger

`/admin/**` page-level 권위는 Editorial Operations Ledger다. ADR-0050의 오늘 할 일 중심 운영 데스크와 ADR-0039의 exact capability catalog, `signal → case → docket → command → receipt` 문법을 함께 유지한다. 라벨은 `admin-copy.ts`와 `admin-status-language.ts` 사전을 사용한다.

Ready routes: `/admin/today`, `/admin/clubs`, `/admin/clubs/:clubId`, `/admin/health`, `/admin/notifications`, `/admin/ai-ops`, `/admin/public-takedown`, `/admin/support`, `/admin/audit`, `/admin/analytics`. URL 경로는 바꾸지 않는다.

1차 내비는 `오늘 할 일` · `클럽 관리` · `서비스 상태` · `처리 기록` 네 축이다. Support는 클럽 관리, notifications/AI/health는 서비스 상태, audit/analytics는 처리 기록의 active state를 사용한다. 긴급 공개 회수는 그룹 밖 비상 레인으로 사이드 하단에 고정한다. 오늘 항목 옆에는 알람 요약의 `attention.count`를 0보다 클 때만 mono 숫자로 둔다.

화면은 같은 evidence/action/result 문법을 사용하되 업무별 composition을 복제하지 않는다.

- 오늘 할 일: observed content width가 960px 이상이면 `minmax(340px, 38fr) minmax(560px, 62fr)`의 persistent queue/docket, 그 아래면 URL의 `case`·`mode=detail`이 소유하는 목록/상세 흐름이다. Docket은 `무슨 일인가 → 왜 중요한가 → 확인한 근거 → 다음 행동 → 최근 처리 기록` 순서다.
- 클럽 관리: 이름·번역 상태·필요 행동·최근 신호를 먼저 읽고 raw slug/ID/domain은 기술 상세에 둔다. 상세와 support는 기본 정보·상태·영향·행동·기록 순서를 공유하고 club 내부 독서 content를 복제하지 않는다.
- 서비스 상태: 정상은 한 문장으로 조용히 요약하고 stale/partial/unavailable source만 이유·관측 시각·영향·다음 행동을 펼친다. 알림과 AI detail은 실제 failure cluster/run attempt를 안전 행동보다 먼저 보여 준다.
- 처리 기록: audit row는 `시각 · 누가 · 대상에 무엇을 함 · 결과`로 읽고, analytics는 정의·availability·값 순서의 `분석 부록`이다.
- 비상 레인: compact 화면은 desktop handoff를 primary로 제안하지만 direct workflow의 capability와 safe-command를 제거하거나 viewport를 authorization에 쓰지 않는다.

운영 문법: `signal → prioritized case → evidence docket → guarded command → 등급에 맞는 history/receipt/convergence`.
모든 화면에 case/command/receipt를 꾸며내지 않는다. 해당 domain에 선택 대상·command·receipt가 있을 때만 조합한다.

| Primitive | 역할 |
| --- | --- |
| `AdminPageContext` | 제목, 설명, freshness, scope, authority |
| `AdminWorkViewBar` | saved view, 검색, filter, pending-new |
| `AdminEvidenceLedger` | 정렬된 row와 empty/partial |
| `AdminStatePanel` | loading / empty / partial / stale / unavailable / forbidden |
| `AdminCaseDocket` | 선택 대상 evidence·history·관련 링크 |
| `AdminSafeActionDock` | L1/L2/L3, allowed/denied, pending/stale/conflict/unknown-outcome |
| `AdminReceiptTimeline` | L2 receipt, L3 receipt+convergence |
| route search / `AdminRouteReturnState` | URL query, returnTo, focusId, scrollTop |

`AdminShellController`는 navigation composition, capability query, alarm, account action과 platform authority loss를 소유한다. Onboarding mutation과 dirty/pending 전환은 `/admin/clubs?onboarding=1`의 `AdminOnboardingController`가 소유한다. Shell은 domain data, filter, selection, command, receipt reconciliation을 선행 로드하는 mega-store가 아니다.

Today layout은 viewport breakpoint가 아니라 `ResizeObserver`로 측정한 content width가 결정한다. 측정 전과 960px 미만에서는 flow로 fail safe하고, 좁아진 두 열을 압축하지 않는다.
Back은 `returnTo`/`focusId`/`scrollTop`으로 복원한다.

일반 command 권한은 서버 exact capability다. `OWNER`/`OPERATOR`/`SUPPORT` 이름으로 새 권한을 만들지 않는다.
Today lifecycle은 서버 `allowedActions`에 있는 `확인함`·`잠시 미룸`·`처리함`만 사용한다. 서버 의미가 없는 `무시`·`병합`이나 전송하지 않는 사유 입력을 만들지 않는다. Analytics CSV는 `EXPORT_ANALYTICS`, 알림 replay는 `REPLAY_NOTIFICATIONS`가 없으면 request를 시작하지 않는다.
401/403은 platform-admin state와 pending preview를 폐기한다.

L1은 capability·concurrency·source 재검증·atomic history, L2는 preview/confirm/receipt, L3는 receipt/convergence/resume다.
모든 action에 preview를 강제하지 않는다.

## State and error grammar

Host panel과 admin route는 다음을 명시적으로 다룬다.

| 상태 | 표시 | 행동 |
| --- | --- | --- |
| loading | 대상 이름과 status | 중복 submit 금지 |
| empty | 비어 있는 이유 | capability/`allowedActions`가 허용한 안전 행동만 |
| stale | 관측 시각과 이유 | 최신성이 필요한 mutation 잠금, retry |
| partial | 성공/실패 source | source별 retry, 성공 sibling 보존 |
| forbidden/403 | 잃은 권한 | mutation 금지, 민감 state 폐기 |
| conflict/409 | 최신 값과 의도 차이 | refresh 후 재확인 |
| unknown outcome | 요청 식별자와 receipt/history 조회 | blind retry 금지 |
| unavailable | 실패 범위 | 성공한 형제 상태 보존 |

완료 근거는 toast가 아니다. L1은 domain state/history, L2는 receipt, L3는 receipt와 convergence다.
Live region은 의미 있는 전이에만 쓰고 polling마다 반복하지 않는다.

## Responsive and accessibility matrix

Contract widths: 320, 390, 768, 900, 1024, 1440px. keyboard, visible focus, 44px target, reduced motion, long Korean/English wrapping은 automated helper로 검증한다. Chrome 실제 200% toolbar zoom은 DPR 2→4, CSS viewport 1728→864, document/body scroll width와 client width 일치, 보이는 focus target 높이로 확인했다. Manual screen-reader announcement order는 아직 `not measured`이며 검증 완료로 주장하지 않는다.

Tracked screenshots는 대표 상태만 잠근다. 1024px는 viewport contract와 browser smoke에 있고 PNG baseline은 없다.

| Owner | File | Locks |
| --- | --- | --- |
| host diary CT | `front/__screenshots__/features/host/ui/meeting-workspace/host-focus-deck.ct.tsx/` | `diary-draft-1440.png`, `diary-open-900.png`, `diary-closed-768.png`, `diary-published-390.png`, `diary-readiness-pending-320.png` (1024는 매트릭스만, PNG 없음) |
| host closing CT | `front/__screenshots__/features/host/ui/session-closing-board.ct.tsx/` | `host-closing-embedded-blocked-1440.png`, `host-closing-embedded-published-900.png`, `host-closing-embedded-blocked-768.png`, `host-closing-embedded-published-390.png`, `host-closing-embedded-blocked-320.png` (1024는 매트릭스만) |
| host today CT | _(없음 — 오늘형 baseline 미잠금)_ | — |
| admin shell CT | `front/__screenshots__/features/platform-admin/route/admin-shell-layout.ct.tsx/` | Today·4축 내비·space menu 1440, mobile 390, long copy 320 |
| admin ledger CT | `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/` | Today 1440, clubs 900, service 768, records 390, detail 320, emergency 1440/390 |
| admin support CT | `front/__screenshots__/features/platform-admin/ui/admin-support-workbench.ct.tsx/` | selected support workbench |

Chromium, Firefox, mobile WebKit smoke는 host 다이어리 스프레드와 admin Today/Clubs/Service/Review 대표 흐름이다.
VoiceOver/Safari와 NVDA/Chrome 수동 결과는 `docs/reports/host-admin-visual-authority-accessibility-evidence-template.md`에 따라 `not measured`다.

이 시각 권위 작업은 server API·schema·auth 계약을 바꾸지 않는다.
