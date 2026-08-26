# ReadMates 호스트·플랫폼 관리자 시각 권위와 통합 설계

- 상태: Approved design, implementation not started
- 승인일: 2026-08-26
- 범위: `front/`의 host 전 표면과 `/admin/**`, 관련 테스트·시각 기준선·디자인 문서
- 기준 브랜치: `main` at `f2fab4e1`

ADR impact: supersede — ADR-0020, ADR-0027를 ADR-0044, ADR-0045로 대체하고 ADR-0039, ADR-0040, ADR-0043을 준수한다.

- ADR-0044: host Focus Deck primary-action composition
- ADR-0045: host/admin role composition을 Focus Deck/Editorial Operations Ledger로 고정

## 1. 결정 요약

호스트와 플랫폼 관리자는 같은 ReadMates의 warm paper, ink hierarchy, restrained navy accent,
semantic state, typography, spacing, focus primitive를 공유한다. 그러나 두 역할의 작업 방식은 같지
않으므로 페이지 구성은 다음 두 권위로 분리한다.

- **호스트:** 최초 승인 시안의 **Focus Deck**을 시각·정보 구조의 권위로 삼는다. 현재 구현의
  `Meeting Folio` 상단 local task navigation과 우측 judgment rail은 주된 화면 구성이 아니다.
  한 화면에는 한 개의 `지금 할 일`과 짧은 진행 목록이 우선하고, 정보·참석·기록·변경 내역은
  필요할 때 여는 panel/sheet로 이동한다.
- **플랫폼 관리자:** 기존 관리자 시안을 그대로 복원하지 않고, 현재 제품·권한 계약과 외부 운영
  도구 연구를 결합한 **Editorial Operations Ledger**를 새 권위로 삼는다. 네 primary area인 오늘,
  클럽, 서비스, 검토는 유지하고, 모든 화면의 page/state/evidence 문법을 통일한다. Case, command,
  receipt, convergence는 해당 domain route와 command 안전 등급에 실제로 존재할 때만 조합한다.

오래된 관리자 redesign 브랜치는 통째로 merge/cherry-pick하지 않는다. 현재 `main`에서 새 통합
브랜치와 worktree를 만들고, 순수 model·테스트 의도만 선택적으로 다시 구현한다.

## 2. 문제와 성공 기준

### 2.1 현재 문제

호스트 화면은 기능과 안전 계약이 크게 강화됐지만 승인된 원 시안에서 멀어졌다. 현재
`HostMeetingWorkspace`는 masthead, local navigation, main panel, judgment rail을 주된 구성으로
조립한다(`front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx:106`). 기능은 유지해야
하지만 사용자가 승인한 시각 권위는 `지금 할 일` 중심 Focus Deck이다.

플랫폼 관리자는 Service Spine과 safe-command 계약을 갖췄지만, `/admin/**` 전체가 같은 판단 흐름,
상태 문법, 모바일 완결성을 제공하지 않는다. 특히 현재 코드에는 다음 구현 결함이 남아 있다.

- 분석 CSV export가 `EXPORT_ANALYTICS` projection을 직접 확인하지 않는다
  (`front/features/platform-admin/route/admin-analytics-route.tsx:15`).
- 알림 replay 가용성을 capability가 아닌 role에서 추론한다
  (`front/features/platform-admin/route/admin-notifications-route.tsx:42`).
- 클럽 목록에서 상세로 이동한 뒤 filter·page·scroll·focus를 완전히 복원하는 route state 계약이 없다.
- audit 선택 항목과 여러 cross-screen handoff가 URL로 재현되지 않는다.
- Today 밖의 표면은 loading, empty, stale, partial, forbidden, conflict, unknown-outcome 문법이 고르지 않다.
- 지원 사유 copy 중 일부는 ADR-0043의 review-time-only 최소 evidence 계약보다 오래 보관되는 메모처럼
  읽힐 수 있다.

### 2.2 성공 기준

1. 호스트가 `/app/host`에서 모임을 열면 첫 viewport에서 지금 해야 할 한 가지와 다음 진행 상태를
   식별할 수 있다.
2. DRAFT, OPEN, CLOSED, PUBLISHED 모든 상태에서 같은 Focus Deck 구성을 유지하되 주 행동과 recovery만
   상태에 맞게 바뀐다.
3. 플랫폼 관리자가 `/admin/today` 첫 viewport에서 가장 중요한 case와 freshness를 식별하고, 근거와
   권한을 확인한 뒤 command 안전 등급에 맞는 결과까지 추적한다.
4. `/admin/**`의 모든 화면이 같은 page context, view state, evidence 문법을 쓰고, action/result 영역은
   해당 domain에 있을 때 같은 안전 등급 표현을 쓴다.
5. 320px 모바일에서도 host와 admin의 핵심 작업이 데스크톱으로 되돌아가지 않고 끝난다.
6. URL deep link, Back/Forward, filter, selection, scroll, focus가 새로고침 후에도 가능한 범위에서
   재현된다.
7. 기존 revision/CAS, idempotency receipt, authority-loss purge, capability projection, safe-command,
   audit, public convergence 계약을 약화시키지 않는다.
8. 현재 `main`의 기능과 오래된 redesign 브랜치의 가치 있는 의도가 중복·회귀 없이 하나의 최신
   통합 브랜치에 수렴한다.

## 3. 시각 권위

### 3.1 공통 ReadMates 문법

두 역할은 다음 primitive를 공유한다.

- warm paper background와 ink/ink-muted 계층
- restrained navy/ink-blue primary accent
- danger, warning, success, stale의 semantic color
- 장문 한국어를 견디는 editorial typography와 line-height
- line, rule, margin을 중심으로 한 정보 구획
- 최소 44px interaction target, 명시적 focus ring, reduced motion
- 데이터 사실은 badge보다 문장·표·definition list를 우선
- glassmorphism, glow, dark NOC, KPI card grid, decorative leather/file-folder skeuomorphism 금지

구체 token과 role composition example은 구현 단계에서 `front/DESIGN.md`에 canonical하게 기록한다.
이 문서는 active UI를 설명하는 파일이므로 코드와 기준선이 함께 완성되기 전에는 생성·승격하지 않는다.

### 3.2 호스트 권위: Focus Deck

승인된 원 시안의 내구 source는
`docs/superpowers/specs/2026-08-21-host-session-focus-workspace-redesign-design.md:65`의 A안
`집중 작업 카드`와 같은 문서의 상태·URL·responsive 계약이다. 이번 승인 과정에서 시각 artifact와
현재 runtime을 다시 비교했고, 다음 canonical 구성을 재확인했다.

1. **Meeting header** — 책/모임 identity, 날짜, 상태, 필수 context만 짧게 표시한다.
2. **지금 할 일** — 화면에서 가장 강한 한 개의 primary action과 필요한 이유를 담는다.
3. **진행 목록** — 현재 모임의 중요한 3~5개 사실을 완료율이 아닌 실제 상태 문장으로 보여준다.
4. **관련 작업** — 주 행동을 방해하지 않는 secondary links/actions다.
5. **Undo/recovery** — 최근 변경, 되돌리기, 충돌, 미확인 결과를 주 행동 가까이 제공한다.
6. **Info/attendance/records/history panels** — route/deep link를 보존하는 sheet 또는 panel이다.

현재 `Meeting Folio`의 page-level local nav와 우측 judgment rail은 제거한다. 단, 그 안에 있던 정보와
상태를 버리지 않고 위 여섯 영역으로 재배치한다. desktop에서만 보이는 기능을 만들지 않는다. 모바일은
safe-area를 반영한 sticky primary action을 쓰되 본문 마지막 행동과 중복 announce하지 않는다.

#### 상태별 주 행동

| 상태 | 주 행동 예시 | 반드시 함께 보일 사실 |
| --- | --- | --- |
| DRAFT | 모임 열기 또는 기본 정보 완성 | 미완성 항목, 대상 audience, 다음 모임일 |
| OPEN | 참석 응답 확인 또는 실제 출석 준비 | 응답 분모, 미응답, 모임일까지 남은 시간 |
| meeting-day | 실제 출석 확인 | UNKNOWN/참석/불참 구분, 수정 가능성 |
| overdue OPEN | 모임 마감 | 미완료 출석·기록과 마감 영향 |
| CLOSED without record | 기록 작성 | 공개 범위와 아직 공개되지 않았다는 사실 |
| CLOSED draft record | 기록 검토/게시 | draft revision, audience, publication readiness |
| PUBLISHED | 공개 상태 확인 또는 새 revision 시작 | public convergence, 마지막 receipt, 되돌리기 |
| trash | 복원 또는 7일 보존 상태 확인 | 삭제 시각, 만료, 복원 충돌 |

Lifecycle, app audience, public placement는 서로 독립이며 하나의 progress stepper로 합치지 않는다.
참석 응답과 실제 출석도 서로 다른 사실로 유지한다.

#### 주 행동 readiness 권위

Primary action이 record draft, applied revision, validation, publication readiness에 의존하면 해당 사실을
알기 전까지 `false`로 추정하지 않는다. 이번 frontend 프로그램은 server contract를 새로 설계하지 않고,
기존 record editor query를 lifecycle-aware prerequisite로 먼저 읽는다.

- CLOSED와 record readiness가 필요한 상태에서는 prerequisite가 ready일 때만 실제 primary action을 계산한다.
- pending 동안 `다음 할 일 확인 중`을 표시하고 관련 mutation을 disabled 처리한다.
- stale/unavailable이면 마지막 관측 시각과 retry를 보여 주고 publication·overwrite 계열 action은 fail closed한다.
- record panel의 UI와 무거운 history는 계속 lazy-load하며, readiness prerequisite 실패가 meeting identity와
  안전한 unrelated navigation까지 지우지는 않는다.
- 향후 base detail에 minimal readiness summary를 추가하는 최적화는 별도 server contract 결정이다.

### 3.3 플랫폼 관리자 권위: Editorial Operations Ledger

관리자 화면은 운영 통제실처럼 어둡고 과장된 dashboard가 아니라, 근거를 읽고 판단을 기록하는 편집
장부다. desktop 기본 구성은 priority ledger와 persistent evidence docket의 2열 구조다.

- 왼쪽: saved work view, 검색·필터, source freshness, case rows, pending-new 표시
- 오른쪽: 선택 case의 identity, severity/state, evidence, history, 권한, next action
- 아래/오른쪽 action dock: command 안전 등급에 맞는 guard와 실행 상태

모바일은 queue → record → review → 결과 확인의 route 기반 전체 화면 흐름이다. Back은 이전 filter,
selection, scroll, focus로 복원한다. desktop의 좁아진 두 열을 그대로 압축하지 않는다.

`Daily Dispatch` 개념은 별도 dashboard가 아니라 `오늘의 브리핑` saved view로만 쓴다.
`Convergence Timeline`은 L3 command를 시작한 뒤 action/receipt 영역에만 나타난다. L1은 capability,
concurrency guard, source 재검증, atomic history를 사용하고, L2만 durable preview/confirm/receipt를,
L3만 convergence ledger와 같은 receipt 기반 resume를 추가한다. 모든 action에 무거운 preview나 존재하지
않는 receipt를 꾸며내지 않는다.

#### 외부 연구에서 채택한 원리

승인 전 연구는 제품 이름을 복제하기 위한 것이 아니라 공식 문서로 확인한 제품 패턴을 비교하기 위한
것이었다.

- [Linear Triage](https://linear.app/docs/triage): 들어온 신호를 팀이 검토·분류하는 별도 inbox 문법
- [Linear Peek](https://linear.app/docs/peek): keyboard 환경에서 list context를 유지한 빠른 detail inspection
- [PagerDuty Incidents](https://support.pagerduty.com/main/docs/incidents): acknowledge·resolve와 incident 상태 전이
- [Stripe dispute response](https://docs.stripe.com/disputes/responding): 제출 범위·근거·최종성을 확인하고 제출 후 outcome을 추적하는 흐름
- [GitHub Projects saved views](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/managing-your-views): 반복 작업을 보존하는 named/saved view
- [GitHub audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization): actor/action/time qualifier로 구조화된 filter가 가능한 변경 기록
- [Sentry issue details](https://sentry.io/changelog/new-issue-details-ui-now-available/): evidence hierarchy와 progressive disclosure
- [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback): 실행 전 대상을 확인하고 실행 후 상태·되돌리기를 확인하는 흐름
- [WCAG 2.2 Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data): 해당하는 중요 제출에서 reversal, input check, confirmation 중 적어도 하나를 제공하는 원칙

채택한 전체 운영 모델은 `signal → prioritized case → evidence docket → guarded command → command
등급에 맞는 history/receipt/convergence`다. Evidence hierarchy, saved view, inspection, review·recovery는 외부
제품 패턴에서 참고했고, immutable receipt와 L1/L2/L3 안전 등급은 ReadMates ADR-0040의 내부 계약이다.

## 4. 정보 구조와 화면 계약

### 4.1 호스트 표면

다음 경로는 같은 editorial 운영 장부 톤을 사용한다. Focus Deck composition은 meeting detail에만 적용하고,
home/list/form은 각 route의 정보 구조를 유지한다.

- `/clubs/:slug/app/host`와 등록 host의 `/app/host`
- `/clubs/:slug/app/host/sessions`
- `/clubs/:slug/app/host/sessions/new`
- `/clubs/:slug/app/host/sessions/:sessionId`
- 같은 모임의 info, attendance, records, history deep link/panel
- host member, record, notification 목록

Home은 다음 모임과 지금 할 일을, list는 회차 간 탐색과 상태를, detail은 한 모임의 주 행동을 소유한다.
New route는 단일 입력 흐름이지만 AI draft나 자동 제출을 강제하지 않는다. 모든 생성/수정 결과는 사용자가
고칠 수 있고 명시적으로 승인한다.

### 4.2 관리자 primary area

ADR-0039의 Service Spine IA를 그대로 보존한다.

| Area | 시작 경로 | 핵심 질문 |
| --- | --- | --- |
| 오늘 | `/admin/today` | 지금 무엇을 먼저 판단하고 처리해야 하는가? |
| 클럽 | `/admin/clubs` | 특정 클럽의 준비·공개·도메인·호스트 상태는 무엇인가? |
| 서비스 | `/admin/health`, `/admin/notifications`, `/admin/ai-ops`, `/admin/public-takedown` | 시스템 신호와 복구 작업은 무엇인가? |
| 검토 | `/admin/support`, `/admin/audit`, `/admin/analytics` | 권한·감사·aggregate evidence로 어떤 판단을 검증해야 하는가? |

모든 route는 다음 공통 page/state/evidence grammar를 사용하되 domain action ownership은 유지한다.
`AdminCaseDocket`, `AdminSafeActionDock`, `AdminReceiptTimeline`은 해당 route에 실제 선택 대상·command·receipt가
있을 때만 조합한다. Today만 operation case lifecycle을 소유하며 health, audit, analytics 같은 canonical
domain route를 억지로 case executor로 바꾸지 않는다.

- `AdminPageContext`: 제목, 설명, freshness, scope, role/capability context
- `AdminWorkViewBar`: saved view, 검색, filter, pending-new
- `AdminEvidenceLedger`: 정렬된 rows/table과 명시적 empty/partial state
- `AdminCaseDocket`: 선택 대상의 evidence, history, related links
- `AdminSafeActionDock`: permission, eligibility, concurrency, pending, conflict, retry와 L2/L3에서만 preview/confirmation
- `AdminReceiptTimeline`: L2 receipt 또는 L3 receipt/convergence/audit가 있을 때만 렌더링
- `AdminRouteState`: URL query, return state, scroll/focus restoration

이 이름들은 implementation ownership boundary다. 모든 route를 한 global store나 하나의 거대한 component로
합치라는 뜻이 아니다.

### 4.3 권한

UI는 `OWNER`, `OPERATOR`, `SUPPORT` role에서 새 권한을 추론하지 않는다. 일반 admin command의 permission
authority는 서버의 exact capability projection이다. Today case lifecycle은 별도 manage capability가 없으므로
서버 응답의 domain-owned `allowedActions`가 action authority이며 frontend가 role에서 이를 재계산하지 않는다.
실제 실행 가능성은 target state, source freshness, identity, concurrency token, L2/L3 preview
expiry/consumption까지 서버가 다시 확인한다. 현재 capability 목록과 parser는
`front/features/platform-admin/model/platform-admin-capabilities.ts:3`에 있다.

- 일반 command는 capability가 없으면, Today lifecycle은 `allowedActions`에 없으면 action을 숨기거나
  disabled reason을 명확히 보인다.
- route 진입 후 capability를 잃으면 민감 state와 pending preview를 폐기한다.
- `403`은 일반 네트워크 오류가 아니며 재시도만 제안하지 않는다.
- `409`는 최신 evidence를 다시 읽고 사용자가 의도를 재확인하게 한다.
- response loss는 성공/실패를 추측하지 않고 L1의 authoritative domain state/history 또는 L2/L3 receipt로
  reconciliation한다.
- SUPPORT는 export, replay, public takedown, mutation을 role 이름만으로 얻지 않는다.

### 4.4 Today polling 안정성

Polling은 읽던 row와 focus를 임의로 움직이지 않되 새 critical signal을 숨기지 않는다.

- 현재 선택 case의 새 version/evidence는 제자리에서 갱신하고 stale action을 즉시 잠근다.
- 새 WARNING/READY/INFO case는 `새 항목 n개` pending으로 모아 사용자가 적용할 때 정렬한다.
- 새 CRITICAL case는 pending count와 별도의 assertive하지 않은 urgent notice에 즉시 나타내고, 한 번만
  announce한다. focus를 자동 이동시키지는 않는다.
- 사용자가 urgent notice 또는 pending CTA를 선택하면 서버 priority order를 적용하고 선택·scroll·focus의
  복원 target을 명시적으로 갱신한다.
- source freshness와 전체 count는 row 순서를 고정한 동안에도 최신 값으로 갱신한다.

## 5. 프런트엔드 경계

ADR-0003의 route-first architecture를 유지한다.

```text
API/query data
    ↓
pure model: normalized state, rows, primary action, evidence
    ↓
route: URL/query/auth/capability/mutation/reconciliation ownership
    ↓
UI: props + callbacks only
```

- pure model은 `window`, router, query cache를 직접 읽지 않는다.
- route는 URL parsing/serialization, query orchestration, authority loss, mutation과 해당 등급의
  state/history/receipt reconciliation을 소유한다.
- UI는 server contract나 role에서 권한을 다시 추론하지 않는다.
- admin shell은 navigation과 공통 context만 소유하고 domain data를 선행 로드하는 mega-store가 되지 않는다.
- host panel은 독립적으로 lazy-load하고 한 panel의 실패가 Focus Deck 전체를 막지 않는다.
- host의 revision/CAS, idempotency key/receipt, stale cache action lock, public convergence를 유지한다.

## 6. 상태·오류·복구 문법

모든 host panel과 admin route는 최소 다음 상태를 명시적으로 모델링한다.

| 상태 | 표시 | 허용 행동 |
| --- | --- | --- |
| loading | skeleton/status와 대상 이름 | 중복 submit 금지 |
| empty | 비어 있는 이유와 가능한 다음 행동 | capability 또는 `allowedActions`가 허용한 안전 행동 |
| stale | 관측 시각과 stale 이유 | 최신성이 필요한 mutation 잠금, refresh |
| partial | 성공/실패 source와 마지막 성공 evidence | source별 retry |
| forbidden/403 | 잃은 권한과 안전한 이탈 경로 | 권한 없는 mutation 금지 |
| conflict/409 | 최신 값과 기존 의도의 차이 | refresh 후 명시적 재확인 |
| unknown outcome | 요청 식별자와 authoritative state/history 또는 receipt 조회 상태 | blind retry 금지 |
| unavailable | 실패 범위와 retry 대상 | 성공한 sibling state 보존 |

Success toast만으로 작업 완료를 표현하지 않는다. L1은 authoritative domain state/history가, L2는 receipt가,
L3는 receipt와 실제 convergence가 완료 근거다.
Live region은 의미 있는 상태 전이에만 사용하고 polling마다 같은 문장을 반복하지 않는다.

## 7. 미병합 브랜치 통합 결정

### 7.1 현재 branch census

기준 시점의 `main`은 `origin/main`과 동기화된 `f2fab4e1`이다.

- `codex/admin-operations-command-center-design`과 `feat/platform-admin-service-spine`의 작업은 현재 main에
  포함되어 있다.
- platform-admin의 기능별 frontend side branch는 patch-equivalent이거나 main에 통합됐다.
- `feat/host-meeting-workspace-redesign` at `bfba21ea`와 host preview commit `b5643c04`도 main의 조상이며
  별도 host merge 대상이 아니다.
- 실질적으로 미병합인 frontend branch는 `codex/admin-site-tone-redesign` at `e9386c81`이다.
- `main...codex/admin-site-tone-redesign`은 main-only 426, branch-only 15 commits이며 텍스트 충돌 지점도
  많다. 따라서 branch head 병합은 최신 auth, capability, route, fixture, CSS를 되돌릴 위험이 크다.

### 7.2 선택적 포팅 목록

다음 commit은 그대로 cherry-pick하는 대상이 아니라 최신 main에서 다시 테스트·구현할 의도 목록이다.

| Commit | 보존할 의도 |
| --- | --- |
| `e70714ec` | saved work view, 이미 로드한 record 검색, 안정적인 짧은 locator model |
| `a4aeaeb8` | polling 중 현재 순서 고정, 새 항목 pending-new로 분리 |
| `088acd4f` | work view/search/filter control |
| `12b45d60`, `70149f5b` | editorial queue와 evidence inspector hierarchy |
| `2c9d8538` | component test와 responsive visual baseline 의도 |
| `99939325`, `e9386c81` | polling/recovery/capability-loss test intent |
| `9c39901c` | 44px touch target invariant |
| `82cd77db` | pending mutation·selection·background failure recovery invariant |
| `62b01233` | polling continuation·pagination retry·version monotonicity invariant |

다음은 포팅하지 않는다.

- role-derived authorization과 pre-capability auth
- 오래된 shell, onboarding, registry preload, fixture
- branch의 899-line global CSS patch
- current API/contract보다 오래된 action dialog와 mutation wiring

### 7.3 통합 절차

1. 이 spec, ADR-0044, ADR-0045, ADR-0020/0027 status, ADR README, technical decisions index,
   `docs/development/architecture.md` 현행 교정을 먼저 하나의 authority commit으로 만든다. 구현 계획은 그
   exact commit hash를 기록하고, 해당 commit을 조상으로 가진 `codex/` 통합 branch와 별도 worktree만 쓴다.
2. 이 설계 문서 커밋에서 교정한 active architecture의 Meeting Folio 현행 설명과 Proposed Focus Deck
   목표를 implementation 시작점으로 확인한다.
3. 시각 권위 fixture와 RED characterization test를 먼저 만든다.
4. host는 current model/API/safety contract 위에서 Focus Deck composition을 재구성한다.
5. admin은 순수 model/test intent부터 재작성하고 현재 Service Spine route에 ledger composition을 적용한다.
6. 각 vertical slice가 끝날 때 최신 main을 practice-integrate하고 충돌을 그 slice 안에서 해결한다.
7. 전체 branch review와 최종 검증 후에만 main으로 병합한다.

Final integration review는 다음 negative provenance/survival evidence도 남긴다.

- implementation plan의 slice별 file allowlist와 최종 diff를 비교한다.
- old branch head가 integration branch의 조상이 아니며 wholesale merge/cherry-pick이 없음을 확인한다.
- capability parser/API, command recovery, public takedown, `AdminActionDock`, `AdminModalDialog`,
  `AdminPageFrame`, `AdminStatePanel`, host authority-loss/public-convergence E2E가 삭제·우회되지 않았음을
  파일 존재와 focused test로 확인한다.
- old role-derived auth, stale onboarding/fixture, old global CSS patch가 diff에 다시 들어오지 않았음을
  targeted history/diff scan으로 확인한다.

## 8. 구현 순서

구현 계획은 이 설계가 문서 단위로 승인된 뒤 별도 `writing-plans` 단계에서 file-level task와 RED/GREEN
명령으로 세분한다. 고정된 vertical slice 순서는 다음과 같다.

1. 공통 visual grammar, token, fixture, `front/DESIGN.md`
2. host shell, home, meeting list
3. Focus Deck DRAFT/OPEN/CLOSED/PUBLISHED 상태와 record-readiness prerequisite
4. host panel, recovery, trash, mobile completion
5. admin shell, page context, common state grammar
6. `/admin/today` ledger, evidence docket, polling order freeze
7. clubs list/detail, return-state restoration, onboarding
8. service health, notifications, AI, emergency takedown
9. support, audit, analytics와 capability 결함 수정
10. cross-route handoff, visual baseline, whole-branch hardening

각 slice는 `RED test → 최소 구현 → focused test → independent review → bounded fix → latest-main practice
integration` 순서로 끝낸다. 다른 slice의 shared 파일을 동시에 수정하지 않는다.

## 9. 검증 설계

### 9.1 상태 matrix

호스트:

- DRAFT, OPEN, meeting-day, overdue OPEN
- CLOSED without record, CLOSED draft record, publication pending, PUBLISHED
- stale cache, 403 authority loss, 409 revision conflict, response loss, trash, restore conflict

관리자:

- OWNER, OPERATOR, SUPPORT fixture에서 capability별 on/off와 Today `allowedActions`
- loading, empty, stale, partial, 403, 409, response loss, long-running convergence
- 긴 한국어, empty evidence, 여러 source 실패, pending-new, pagination failure

### 9.2 viewport·접근성 matrix

- width: 320, 390, 768, 900, 1024, 1440px
- 200% zoom과 긴 Korean/English wrapping
- keyboard only, visible focus, focus restoration, screen-reader name/state
- 44px target, safe area, reduced motion, live-region 중복 방지
- Chromium, Firefox, mobile WebKit

기존 Firefox/mobile WebKit project는 host smoke만 실행하므로, admin은 Today와 각 primary area의 대표
read/action route를 focused project에 추가한다. 추가 전에는 admin cross-browser를 통과했다고 주장하지 않는다.

Visual baseline은 최소 1440, 900, 768, 390, 320px에서 host 주요 상태와 admin 각 primary area를 가진다.
desktop/mobile 실제 browser inspection은 한 번에 모아 비교하고, 수정 뒤 확인 round는 한 번으로 제한한다.

### 9.3 canonical gate

구현 branch에서 다음을 모두 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front test:coverage
corepack pnpm --dir front build
corepack pnpm --dir front test:ct
corepack pnpm --dir front test:e2e
corepack pnpm --dir front test:e2e:host-workspace-browsers
corepack pnpm --dir front test:host-workspace-performance
corepack pnpm --dir front performance:budget
```

변경 범위의 public-safety scan, CHANGELOG/Unreleased, CI/deploy 영향, architecture baseline/exception도
`docs/development/release-readiness-review.md`에 따라 검토한다. 실제 AI 호출, 이메일/알림 발송, 실제 권한
변경, public takedown 같은 billable/user-impacting smoke는 별도 승인 없이는 실행하지 않는다.

## 10. Merge gate

다음 조건이 모두 충족될 때만 main 병합을 권고한다.

- 호스트가 승인된 Focus Deck hierarchy와 desktop/mobile composition에 시각적으로 일치한다.
- host lifecycle, recovery, authority loss, conflict, receipt, public convergence E2E가 통과한다.
- `/admin/**` 모든 ready route가 role/capability/Today `allowedActions`, deep link, return state, error,
  mobile matrix를 통과한다.
- analytics export와 notification replay가 exact capability projection을 사용한다.
- Today case action은 server-owned `allowedActions`를 사용하고 frontend role 추론을 추가하지 않는다.
- analytics export는 capability 없음 또는 direct-handler 우회에서 request가 0회다. 서버 403에서는 최초
  request 뒤 state/cache를 폐기하고 blob/download와 자동 retry가 없어야 한다. Notification replay는
  preview/reason/idempotency/result까지 authority loss 때 폐기하는 focused test를 통과한다.
- Focus Deck은 record readiness를 알 수 없는 동안 잘못된 주 행동을 추정하지 않고 fail closed한다.
- 선택적 포팅 목록의 의도는 최신 main test로 재현되고 오래된 auth/shell/CSS는 포함되지 않는다.
- whole-branch independent review에 Critical/Important issue가 없다.
- 최신 main practice integration 뒤 canonical gate를 새로 실행했다.
- active architecture와 design guide가 실제 코드·테스트와 일치한다.
- ADR-0044와 ADR-0045가 코드·tests·active architecture 증거와 함께 `Accepted`로 승격되고 ADR README와
  technical decisions 인덱스가 일치한다.

## 11. 비범위

- server domain contract, database migration, auth model의 재설계. Today는 현행 server-owned
  `allowedActions`를 유지한다.
- 새로운 admin primary area 추가
- host lifecycle, attendance, audience, publication 의미 변경
- role에서 capability를 다시 파생하는 frontend policy
- 오래된 redesign branch의 wholesale merge
- live deploy와 실제 사용자/운영 데이터 mutation

## 12. 남은 위험

- 원 시안의 HTML 비교 artifact는 일회성 planning 산출물이므로 구현 시작 시 이 명세와 tracked Focus Deck
  spec을 fixture로 변환하고 시각 기준선을 먼저 저장해야 한다.
- 광범위한 CSS를 한 번에 교체하면 member/public surface 회귀가 생길 수 있다. role-scoped style과 shared
  primitive 변경을 구분한다.
- 오래된 branch의 테스트는 최신 contract와 이름이 다를 수 있다. 테스트 파일 자체보다 invariant를 포팅한다.
- 이 설계 문서 커밋은 active architecture를 Meeting Folio 현행과 Proposed Focus Deck 목표로 분리한다.
  실제 구현 완료 시 코드·tests와 함께 Focus Deck을 active contract로 승격해야 한다.
- 자동 접근성 검증만으로 VoiceOver/Safari와 NVDA/Chrome의 실제 읽기·focus 순서를 보장할 수 없다.
  병합 전 수동 결과를 `measured` 또는 솔직한 `not measured`로 기록한다.

## 13. 승인 기록

사용자는 다음을 순서대로 승인했다.

1. 호스트는 원 시안 Focus Deck을 따른다.
2. 플랫폼 관리자는 다중 에이전트 제품·branch·외부 연구 결과인 Editorial Operations Ledger를 따른다.
3. 관리자는 `/admin/**` 전체를 같은 문법으로 개편한다.
4. 오래된 관리자 branch는 통째로 병합하지 않고 pure model/test intent만 선택적으로 통합한다.
5. route-first 경계, 상태/오류 계약, vertical slice, 품질·merge gate를 적용한다.
