# ReadMates host·admin visual authority

이 문서는 현재 코드·테스트·tracked screenshot이 구현한 host/admin 시각 권위다.
승인 설계나 미구현 목표를 적지 않는다. Public, guest, member composition은 이 문서로 바꾸지 않는다.

- ADR-0044: 호스트 현재 모임 Focus Deck
- ADR-0045: host Focus Deck + admin Editorial Operations Ledger
- Token source: `design/system/src/styles/tokens.css`
- Viewport contract: `front/tests/e2e/support/visual-authority-contract.ts`

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

## Host Focus Deck

적용 범위는 특정 모임 canonical 경로뿐이다.

`/clubs/:slug/app/host/sessions/:sessionId` (등록 host의 `/app/host/sessions/:sessionId`)

`HostMeetingWorkspaceRoute`가 auth, base detail, URL, panel query, mutation, receipt, authority-loss purge를 소유한다.
`HostMeetingWorkspace`는 `HostSessionWorkspace`를 page-level Focus Deck으로 조립한다. DOM 순서:

1. meeting header — 회차, 제목, 날짜·장소, 상태 문구
2. `region "지금 할 일"` — 한 개의 primary CTA와 이유
3. `region "진행 목록"` — identity, 응답, 출석, 기록, 공개 사실(3~5개)
4. `navigation "관련 작업"` — 정보·응답·출석·기록·알림·변경 내역 deep link
5. undo/recovery — 최근 변경, 충돌, public convergence
6. info/attendance/records/history/notification panel 또는 sheet

Page-level local task navigation과 judgment complementary rail은 primary composition이 아니다.
`MeetingMasthead`와 `rm-meeting-folio__*` 클래스 이름은 남은 leftover이며 화면 권위가 아니다.

Home, list, new, members, notifications는 같은 token과 state grammar를 쓰되 Focus Deck 레이아웃을 복제하지 않는다.
지운 모임 URL은 Focus Deck이 아니라 `WorkspaceTrashTombstone`이다.

### Status and primary action

상태 문구는 `모임 작성 중` / `멤버와 준비 중` / `기록 정리 중` / `공개 완료`다.
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
한 panel 실패가 Focus Deck 전체를 막지 않는다. 모바일 sticky primary는 safe-area를 반영하고 본문 CTA와 중복 announce하지 않는다.

## Editorial Operations Ledger

`/admin/**` page-level 권위는 Editorial Operations Ledger다. ADR-0039의 오늘·클럽·서비스·검토 Service Spine과 exact capability catalog는 유지한다.

Ready routes: `/admin/today`, `/admin/clubs`, `/admin/clubs/:clubId`, `/admin/health`, `/admin/notifications`, `/admin/ai-ops`, `/admin/public-takedown`, `/admin/support`, `/admin/audit`, `/admin/analytics`.

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

## Responsive and accessibility matrix

Contract widths: 320, 390, 768, 900, 1024, 1440px. 200% zoom, keyboard, visible focus, 44px target, reduced motion, long Korean wrapping은 automated helper로 검증한다.

Tracked screenshots는 대표 상태만 잠근다. 1024px는 viewport contract와 browser smoke에 있고 PNG baseline은 없다.

| Owner | File | Locks |
| --- | --- | --- |
| host CT | `front/__screenshots__/features/host/ui/meeting-workspace/host-focus-deck.ct.tsx/` | `focus-deck-draft-1440.png`, `focus-deck-open-900.png`, `focus-deck-closed-768.png`, `focus-deck-published-390.png`, `focus-deck-readiness-pending-320.png` |
| admin CT | `front/__screenshots__/features/platform-admin/ui/admin-editorial-ledger.ct.tsx/` | `editorial-ledger-today-1440.png`, `editorial-ledger-clubs-900.png`, `editorial-ledger-service-768.png`, `editorial-ledger-review-390.png`, `editorial-ledger-case-detail-320.png` |

Chromium, Firefox, mobile WebKit smoke는 host Focus Deck과 admin Today/Clubs/Service/Review 대표 흐름이다.
VoiceOver/Safari와 NVDA/Chrome 수동 결과는 `docs/reports/host-admin-visual-authority-accessibility-evidence-template.md`에 따라 `not measured`다.

이 시각 권위 작업은 server API·schema·auth 계약을 바꾸지 않는다.
