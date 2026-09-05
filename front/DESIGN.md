# ReadMates host·admin visual authority

이 문서는 현재 코드·테스트가 구현한 host/admin composition과 시각 권위 계층이다.
승인된 Admin `01`–`07`·Host `07`–`17` PNG가 page composition의 시각 권위다.
code-native UI는 편집·runtime source다. tracked CT snapshot은 보조 회귀 cache이며 snapshot 갱신만으로 합격하지 않는다.
token, shared CSS/component, fixture 변경은 영향 reference 증거를 무효화한다.
**실제 authenticated route가 18개 reference 전부의 최종 시각 권위다.** Component fixture와 tracked CT snapshot은 보조 회귀 근거일 뿐 최종 승인 receipt를 만들지 않는다. 전체 capture에 적용하던 broad font-raster 예외(0.10/0.15)는 제거했고 gate는 18/18 `maxDiffPixelRatio` 0.02 fail-closed다. mask는 없다.

현재 시각 권위 기록은 `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md`다. 승인 PNG는 수정하지 않았다. 2026-09-06 Jammy 재측정에서 strict pixel은 18/18 `not_passed_0.02`다. structurePass true 12 / false 6. 사람 30초 gate·VoiceOver/Safari·NVDA/Chrome·원격 CI는 `not measured`다. ADR-0053은 `Proposed`이며 픽셀 수락 완료가 아니다. Public, guest, member composition은 이 문서로 바꾸지 않는다.


구성 수렴 다음의 시각 충실도(빠진 아이콘·여백, geometry PASS를 시안 일치로 읽지 말 것, 출석 1행 유지, `origin/main` 미푸시)는 `docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md`가 다음 슬라이스 핸드오프다. 그 문서는 구현 계획이 아니다.

- ADR-0044: Superseded by ADR-0046 (단일 주 행동 계산 규칙은 운영실에 계승)
- ADR-0045: Accepted — host/admin 공유 paper/ink primitive
- ADR-0046: Superseded by ADR-0048
- ADR-0047: Superseded by ADR-0050
- ADR-0048: Accepted — lifecycle operating room과 host 4축 내비게이션의 현재 권위
- ADR-0049: Accepted — 독립 schedule-seen revision과 명시적 검토·발송 흐름의 현재 권위
- ADR-0050: Accepted — 오늘 할 일 중심 운영 데스크 + 클럽 관리·서비스 상태·처리 기록 4축
- ADR-0051: Accepted — 플랫폼 운영·내 클럽 two-level 전역 공간 전환
- ADR-0053: Proposed — 승인 PNG를 page composition 권위로, 실제 authenticated route를 최종 실행 권위로 사용. 18/18 composition·geometry·typography·first viewport·interaction 통과, strict pixel 18/18 `not_passed_0.02`(`docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md`). 사람 30초 gate `pending_external_human_evidence`, 보조기술 `not_measured`, 원격 CI `pending_remote_ci`가 남아 픽셀 수락 완료가 아니다.
- Token source: `design/system/src/styles/tokens.css`
- Viewport contract: `front/tests/e2e/support/visual-authority-contract.ts`
- Approved mockup manifest: `front/tests/e2e/support/approved-mockup-manifest.ts`

## Host primary chrome

호스트 1차 내비게이션은 네 영역이다: **운영실** · **일정과 모임** · **사람** · **기록**.
데스크톱 top nav와 모바일 tab bar는 같은 canonical 목적지(`HOST_ROUTE_HREFS.operatingRoom` / `.meetings` / `.people` / `.records`)와 순서를 쓴다.
데스크톱 헤더 유틸은 다섯 개다: `초대와 설정` · `멤버 시야` · 알림(종) · 아바타 · `새 모임`. 1차 영역을 늘리지 않는다.
운영실 헤더 액션은 `모임 정보` · `일정 편집`(마감실에서는 `기록 미리보기`) · `변경 이력` 세 개이며, `멤버 시야`를 운영실 액션으로 중복 노출하지 않는다.
현재 모임 **H1은 책 제목**이고, 모임 제목·회차는 kicker다.
`/members`와 `/operations`는 query·허용된 incoming fragment·검증된 same-club return state를 보존해 각각 `/people`과 운영실로 replace한다. `/invitations`는 query와 검증된 same-club return state를 보존하되 incoming fragment를 canonical `#invitations`로 교체해 `/settings#invitations`로 replace한다. `/records`는 canonical 기록 원장이고 `/sessions/:sessionId/edit`·`/closing`은 기존 deep link 문맥을 보존한다.

## Icon primitive

Host와 platform admin의 제품 셸·원장·작업함 아이콘은 `front/shared/ui/icon.tsx`의 `ReadmatesIcon`(24 viewBox, stroke 1.75, size 16/20/24, `data-icon`, `aria-hidden` 기본)과 채움 variant `ReadmatesIconBadge` 하나에서 나온다. ADR-0045 2026-09-05 update가 이 제약을 고정한다. CSS `mask-image`/`background-image`의 `data:image/svg+xml`로 아이콘을 그리지 않고, `.admin-shell:has(` route-scoped 셸 override로 크롬을 fork하지 않는다. `front/tests/unit/shell-chrome-guards.test.ts`가 두 규칙을 baseline 0으로 감시한다.


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
| `390px`(mobile) | 현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함의 단일 열이다. 네 영역 mobile tab bar와 `safe-area-inset-bottom` 공간을 보존하며 보이는 control은 최소 44px다. 예외: live compact 출석판 choice는 40px, undo bar는 36px다. mockup-16 closer를 탭 바 위에 두기 위한 named leftover이며 이 보드의 모든 390 control이 44px라고 주장하지 않는다. |
| `768–1199px` | 같은 semantic 순서를 유지하고 primary 뒤에 작업함을 쌓는다. 62/38 rail을 억지로 축소하지 않으며 768px부터 desktop chrome을 사용하되 bottom safe area는 침범하지 않는다. |
| `1200px+` | main 작업은 약 62%, 작업함 rail은 약 38%의 두 열이다. DOM/읽기 순서는 mobile과 동일하며 작업함만 오른쪽에 배치한다. |

390·767·768·1024·1199·1200·1440px와 320×350 200% zoom proxy에서 가로 overflow, 44px target(live compact 출석 choice 40px / undo 36px leftover), 순서, keyboard roving, visible focus와 reduced motion은 이 문서가 규정하는 계약이다. 보조 CT는 `host-shell.ct.tsx`와 `host-operating-room-responsive.ct.tsx`가 현재 composition geometry를 잠근다. Phase와 workbox tab은 방향키와 Home/End를 지원하고, focus/return state는 route/panel을 닫거나 Back/Forward할 때 원래 control로 돌아간다.

> **시각 권위와 보조 CT.** 승인 PNG는 수정하지 않는다. 보조 CT snapshot 중 Task 12b에서 갱신한 2장(`admin-shell-mobile-390.png`, `admin-shell-long-copy-320.png`)은 Phase 1 셸 크롬 회귀 기준이며 승인 PNG PASS가 아니다. 검토자: Task 12b session / controller ratified 2026-09-05. 실제 route pixel gate는 18/18 `not_passed_0.02`이며 ADR-0053은 `Proposed`다. Task 30 focused E2E trio와 browser smoke는 잔여 fail이 있어 통과 근거로 인용하지 않는다. 전체 목록은 `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md` 최종 게이트를 따른다.


`front/tests/e2e/support/visual-authority-contract.ts`의 검사는 visible main, bounded interactive accessible-name source, nested interactive, ARIA target, navigation/complementary landmark 이름만 확인하는 저장소 custom DOM/ARIA audit다. axe/axe-core 또는 전체 접근성 적합성으로 부르지 않는다. 현재 Chromium 자동화에서 helper-classified serious/critical finding은 없지만 VoiceOver/NVDA, Firefox/WebKit과 실제 기기 screen reader는 `not measured`다.

## Host ledgers, utilities and deep links

- `/sessions`는 일정과 모임, `/people`과 `/people/:membershipId`는 사람/개인 상태, `/records`는 기록 원장이다. `/settings`는 named invitation link와 club settings/co-host/history를 함께 둔다.
- `/notifications`와 `/sessions/:sessionId/schedule-review`는 preview/confirm/reconciliation이 필요한 알림 utility다. 닫기·Escape·backdrop·route navigation은 발송을 만들지 않는다.
- `/sessions/:sessionId`와 비현재 모임 deep link는 canonical detail을 유지한다. `/edit`, `/closing`, feedback-document와 기록 소유 return state는 일정/기록 영역 중 실제 작업 owner로 복귀한다.
- 한 source 실패는 성공한 sibling을 지우지 않는다. 403은 club-scoped host state를 폐기하고 safe route로 replace하며, 409는 입력을 보존하고, partial은 source별 retry, unknown은 receipt/history reconciliation을 제공한다.

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
Today lifecycle은 서버 `allowedActions`에 있는 `확인함`·`잠시 미룸`·`처리함`만 사용한다. 접근성 이름은 그 서버 의미이고, 알림 지연 케이스(`sourceType === "NOTIFICATION"`)만 시안 01 카피(`다시 보내기 검토`·`30분 뒤 다시 보기`·`자세히 보기`)를 시각 텍스트로 쓴다. 서버 의미가 없는 `무시`·`병합`이나 전송하지 않는 사유 입력을 만들지 않는다. Analytics CSV는 `EXPORT_ANALYTICS`, 알림 replay는 `REPLAY_NOTIFICATIONS`가 없으면 request를 시작하지 않는다.
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

Contract widths: 320, 390, 768, 900, 1024, 1440px. keyboard, visible focus, 44px target(live compact 출석 choice 40px / undo 36px leftover), reduced motion, long Korean/English wrapping은 automated helper로 검증한다. Chrome 실제 toolbar 200% zoom은 이번 actual-route 수렴에서 **`not_measured`**다. 자동화의 320×350 200% proxy는 실제 toolbar 확대 측정이 아니므로 DPR·CSS viewport·scroll/client width 확인으로 확대 해석하지 않는다. Manual screen-reader announcement order도 `not_measured`이며 어느 쪽도 검증 완료로 주장하지 않는다. 근거는 `docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md` §Step 4다.

Host lifecycle의 code-native source는 `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`, `front/features/host/ui/meeting-workspace/host-lifecycle-responsive.ct.tsx`, `front/features/host/ui/shell/host-shell.ct.tsx`이고, real-route continuity와 recovery widths는 `front/tests/e2e/host-lifecycle-route-continuity.spec.ts`, `front/tests/e2e/host-authority-loss.spec.ts`, `front/tests/e2e/host-workbox-stage4.spec.ts`가 맡는다. 다만 **이 목록 전체가 현재 계약을 잠근다고 읽지 않는다.** 2026-09-06 Task 30 게이트 상태는 다음과 같다.

| suite | 2026-09-06 상태 |
| --- | --- |
| `CI=true npx --yes corepack@0.35.0 pnpm --dir front lint` | exit 0 — 0 errors, 5 warnings |
| `… pnpm --dir front test` | exit 1 — 5 failed / 4868 passed (4873) |
| `… pnpm --dir front build` | exit 0 |
| `… vitest run tests/unit/frontend-boundaries.test.ts tests/unit/shell-chrome-guards.test.ts` | exit 0 — 2 files / 17 passed |
| `DOCKER_CONTEXT=colima-readmates-va CI=true … test:ct:docker` | exit 1 — 168 passed, 10 failed (Task 29 same HEAD) |
| `DOCKER_CONTEXT=colima-readmates-va CI=true … test:e2e:approved-routes:docker` | exit 1 — Playwright 18 failed, pixel 18/18 `not_passed_0.02` |
| focused E2E trio (`admin-today` · `host-lifecycle-operating-room` · `host-workbox-stage4`, chromium, retries 0) | exit 1 — 4 passed, 3 failed, 5 did not run |
| `host-authority-loss.spec.ts` | **미실행** — 통과로 읽지 않는다 |

따라서 semantic/geometry/DOM 계약을 현재 잠그는 것은 CT leftover 10 밖의 통과 파일뿐이다. 실패·미실행 suite는 통과 근거로 인용하지 않는다. 자세한 숫자는 `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md` 최종 게이트에 있다. 승인 PNG를 runtime 배경으로 쓰지 않으며 tracked snapshot은 보조 회귀 cache다.


Admin·Host 승인 PNG 비교는 `front/tests/e2e/support/approved-mockup-manifest.ts`와 실제 authenticated route를 candidate로 쓰는 `pnpm --dir front test:e2e:approved-routes:docker`가 담당한다. `pnpm --dir front test:ct:docker`는 보조 component 회귀 suite이며 승인 receipt를 만들지 않는다. token, shared CSS/component, fixture 변경은 `pnpm --dir front visual-authority:affected`가 계산한 영향 id의 기존 승인을 무효화하고 approved reference·candidate·overlay·diff·measurement report와 독립 검토가 다시 필요하다. 현재 결과는 `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md`를 따른다: strict pixel 18/18 `not_passed_0.02`, structurePass 12 true / 6 false. 2026-09-02·2026-09-04 보고서는 역사적 기록이다. ADR-0053은 `Proposed`다.


Admin tracked screenshots는 대표 상태의 보조 cache다. 1024px는 viewport contract와 browser smoke에 있고, Admin 시각 권위 PNG는 `design/mockups/2026-08-30-admin-operations-redesign/` `01`–`07`이다.

| Owner | File | Locks |
| --- | --- | --- |
| admin shell CT | `front/__screenshots__/features/platform-admin/route/admin-shell-layout.ct.tsx/` | Today·4축 내비·space menu 1440, mobile 390, long copy 320 |
| admin ledger CT | `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/` | Today 1440, clubs 900, service 768, records 390, detail 320, emergency 1440/390 |
| admin support CT | `front/__screenshots__/features/platform-admin/ui/admin-support-workbench.ct.tsx/` | selected support workbench |

VoiceOver/Safari와 NVDA/Chrome 수동 결과는 `docs/reports/host-admin-visual-authority-accessibility-evidence-template.md`에 따라 `not measured`다.
