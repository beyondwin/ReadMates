# ReadMates host·admin visual authority

이 문서는 현재 코드·테스트·tracked screenshot이 구현한 host/admin 시각 권위다.
승인 설계나 미구현 목표를 적지 않는다. Public, guest, member composition은 이 문서로 바꾸지 않는다.

- ADR-0044: Superseded by ADR-0046 (단일 주 행동 계산 규칙은 운영실에 계승)
- ADR-0045: Accepted — 공유 paper/ink; host composition은 ADR-0048, admin composition은 ADR-0047
- ADR-0046: Superseded by ADR-0048
- ADR-0047: Accepted — admin case desk + 운영 서사 + 오늘·클럽·파이프라인·원장 4축 내비
- ADR-0048: Proposed — lifecycle operating room 구현과 active 문서는 정렬됐으며 Stage 5 전체 gate 전까지 상태 유지
- ADR-0049: Proposed — schedule-seen vertical slice 구현과 active 문서는 정렬됐으며 Stage 5 전체 gate 전까지 상태 유지
- Token source: `design/system/src/styles/tokens.css`
- Viewport contract: `front/tests/e2e/support/visual-authority-contract.ts`

## Host primary chrome

호스트 1차 내비게이션은 네 영역이다: **운영실** · **일정과 모임** · **사람** · **기록**.
데스크톱 top nav와 모바일 tab bar는 같은 canonical 목적지(`HOST_ROUTE_HREFS.operatingRoom` / `.meetings` / `.people` / `.records`)와 순서를 쓴다. `초대와 설정`, `멤버 시야`, 알림, 계정, `새 모임`은 utility/action이며 1차 영역을 늘리지 않는다.
호환 경로는 query/hash와 검증된 same-club return state를 보존해 replace한다: `/members`→`/people`, `/invitations`→`/settings#invitations`, `/operations`→운영실. `/records`는 canonical 기록 원장이고 `/sessions/:sessionId/edit`·`/closing`은 기존 deep link 문맥을 보존한다.

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

## Host lifecycle operating room

적용 범위는 `/app/host`와 `/clubs/:slug/app/host`다. `HostDashboardRoute`가 URL-authoritative club context, 서버가 고른 현재 모임, phase query, recovery, preparation source와 workbox query를 조립하고 `HostOperatingRoomPage`는 다음 semantic 순서를 유지한다.

1. `group "현재 모임"` — 모임 identity, lifecycle, 일정·변경 내역·멤버 시야 utility
2. `navigation "모임 운영 단계"` — `준비실` · `현장` · `마감실`
3. `region "다음에 할 일"` — 상태와 이유, 화면 전체에서 접근 가능한 primary action 하나
4. `region "준비 현황"` — 일정 확인·응답·출석·기록 source를 독립 row로 표시
5. `aside "클럽 작업함"` — `지금` · `보류` · `완료`, source별 partial/retry와 receipt

Lifecycle·audience·public placement를 한 stepper로 합치지 않는다. 다음 행동은 source가 pending/stale/unavailable이면 성공으로 추정하지 않고, conflict는 최신 값과 보존한 의도를 비교한 뒤 명시적으로 재시도하며 unknown outcome은 같은 mutation을 다시 보내지 않고 state/history로 reconciliation한다.

### Responsive composition

| 폭 | composition |
| --- | --- |
| `390px`(mobile) | 현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함의 단일 열이다. 네 영역 mobile tab bar와 `safe-area-inset-bottom` 공간을 보존하며 모든 보이는 control은 최소 44px다. |
| `768–1199px` | 같은 semantic 순서를 유지하고 primary 뒤에 작업함을 쌓는다. 68/32 rail을 억지로 축소하지 않으며 768px부터 desktop chrome을 사용하되 bottom safe area는 침범하지 않는다. |
| `1200px+` | main 작업은 약 68%, 작업함 rail은 약 32%의 두 열이다. DOM/읽기 순서는 mobile과 동일하며 작업함만 오른쪽에 배치한다. |

390·767·768·1024·1199·1200·1440px와 320×350 200% zoom proxy는 `host-operating-room-responsive.ct.tsx`와 `host-shell.ct.tsx`가 가로 overflow, 44px target, 순서, keyboard roving, visible focus와 reduced motion을 잠근다. Phase와 workbox tab은 방향키와 Home/End를 지원하고, focus/return state는 route/panel을 닫거나 Back/Forward할 때 원래 control로 돌아간다.

`front/tests/e2e/support/visual-authority-contract.ts`의 검사는 visible main, bounded interactive accessible-name source, nested interactive, ARIA target, navigation/complementary landmark 이름만 확인하는 저장소 custom DOM/ARIA audit다. axe/axe-core 또는 전체 접근성 적합성으로 부르지 않는다. 현재 Chromium 자동화에서 helper-classified serious/critical finding은 없지만 VoiceOver/NVDA, Firefox/WebKit과 실제 기기 screen reader는 `not measured`다.

## Host ledgers, utilities and deep links

- `/sessions`는 일정과 모임, `/people`과 `/people/:membershipId`는 사람/개인 상태, `/records`는 기록 원장이다. `/settings`는 named invitation link와 club settings/co-host/history를 함께 둔다.
- `/notifications`와 `/sessions/:sessionId/schedule-review`는 preview/confirm/reconciliation이 필요한 알림 utility다. 닫기·Escape·backdrop·route navigation은 발송을 만들지 않는다.
- `/sessions/:sessionId`와 비현재 모임 deep link는 canonical detail을 유지한다. `/edit`, `/closing`, feedback-document와 기록 소유 return state는 일정/기록 영역 중 실제 작업 owner로 복귀한다.
- 한 source 실패는 성공한 sibling을 지우지 않는다. 403은 club-scoped host state를 폐기하고 safe route로 replace하며, 409는 입력을 보존하고, partial은 source별 retry, unknown은 receipt/history reconciliation을 제공한다.

## Editorial Operations Ledger

`/admin/**` page-level 권위는 Editorial Operations Ledger다. ADR-0047의 케이스 데스크·운영 서사·4축 내비를 현재 구현으로 둔다. ADR-0039의 exact capability catalog와 signal→case→docket→command→receipt 운영 문법은 유지한다.
라벨은 `admin-copy.ts` 사전 사용.

Ready routes: `/admin/today`, `/admin/clubs`, `/admin/clubs/:clubId`, `/admin/health`, `/admin/notifications`, `/admin/ai-ops`, `/admin/public-takedown`, `/admin/support`, `/admin/audit`, `/admin/analytics`. URL 경로는 바꾸지 않는다.

1차 내비는 오늘 · 클럽 · 파이프라인 · 원장의 네 축이다. 파이프라인은 배달 원장·AI 작업·서비스 건강, 원장은 운영 기입·접근 원장·분석 부록이다. 긴급 공개 회수는 그룹 밖 비상 레인으로 사이드 하단에 고정한다. 오늘 항목 옆에는 알람 요약의 `attention.count`를 0보다 클 때만 mono 숫자로 둔다.

페이지 타입은 세 종이다.

- 데스크형: `/admin/today` — 좌 큐 + 우 증거 도켓, 도켓 내 이전/다음 순회, 확인·보류·무시(사유 필수)·해결
- 원장형: 클럽 목록·배달·AI 작업·운영 기입·접근 원장 — 필터/표/도켓
- 서사형: 서비스 건강 — 한 문장 서사, 정상은 숫자 숨김, 이탈만 펼침

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

Admin shell(`AdminShellLayout`)은 navigation, capability query, onboarding, authority-loss purge만 소유한다.
Domain data, filter, selection, command, receipt reconciliation을 선행 로드하는 mega-store가 아니다.

Desktop Today는 queue + persistent inspector다. Mobile(`max-width: 768px`)은 queue → record → review → 결과의 전체 화면이며 좁아진 두 열을 압축하지 않는다.
Back은 `returnTo`/`focusId`/`scrollTop`으로 복원한다.

일반 command 권한은 서버 exact capability다. `OWNER`/`OPERATOR`/`SUPPORT` 이름으로 새 권한을 만들지 않는다.
Today lifecycle은 서버 `allowedActions`만 사용한다. Analytics CSV는 `EXPORT_ANALYTICS`, 알림 replay는 `REPLAY_NOTIFICATIONS`가 없으면 request를 시작하지 않는다.
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

## Responsive and accessibility evidence index

Host lifecycle의 code-native source는 `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`, `front/features/host/ui/meeting-workspace/host-lifecycle-responsive.ct.tsx`, `front/features/host/ui/shell/host-shell.ct.tsx`다. Real-route continuity와 recovery widths는 `front/tests/e2e/host-lifecycle-route-continuity.spec.ts`, `front/tests/e2e/host-authority-loss.spec.ts`, `front/tests/e2e/host-workbox-stage4.spec.ts`가 맡는다. 이 semantic/geometry/DOM evidence는 승인 PNG나 과거 screenshot baseline을 runtime proof로 사용하지 않으며, Stage 5에서 lifecycle raster baseline을 새로 잠그지 않았다.

Admin의 기존 tracked screenshot은 `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/`에 남아 있고 host lifecycle 권위와 섞지 않는다. 수동 VoiceOver/Safari와 NVDA/Chrome 결과는 `docs/reports/host-admin-visual-authority-accessibility-evidence-template.md` 기준 `not measured`다.
