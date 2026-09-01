# ADR-0051: 전역 공간을 플랫폼 운영·내 클럽 두 축으로 고정

- 상태: Accepted
- 결정일: 2026-08-30
- 작성자: 제품·프런트엔드·보안
- 관련: ADR-0019, ADR-0026, ADR-0030, ADR-0035, ADR-0040, ADR-0050, `server/src/main/kotlin/com/readmates/auth/application/model/AuthAccessProjection.kt`, `front/shared/auth/available-spaces.ts`, `front/src/app/global-space-transition.ts`

## 컨텍스트

같은 사용자가 platform admin, club host, member 권한을 동시에 가질 수 있다. 개편 전 공통 workspace 타입은 `member | host`뿐이었고 admin은 별도 메뉴에서 `joinedClubs`의 role/status를 다시 계산했다. 이 계산은 host 접근 정책이 요구하는 approval state와도 달랐고, Admin에서 club으로 가는 메뉴는 있지만 member/host shell에서 platform으로 돌아오는 동일한 전역 모델이 없었다.

또한 개편 전 role 전환 route model은 pathname family와 정규식 fallback을 중심으로 했고 복귀 정보는 workspace별 pathname 하나만 session storage에 보존했다. 작성 중, effect 진행 중, response loss로 결과를 모르는 상태에서 공간을 바꾸는 공통 안전 계약도 없었다. 현재 구현은 `front/src/app/global-space-continuity.ts`와 `front/src/app/global-space-transition.ts`로 이 책임을 대체한다.

ADR-0026은 member/host를 동급 global workspace로 놓고 platform admin을 별도 cross-club scope로 설명했다. 새 승인 방향은 최상위 선택을 platform과 personal club로 단순화하고, club과 perspective를 그 아래 독립 축으로 분리하므로 ADR-0026을 대체해야 한다.

## 결정

ReadMates의 전역 공간 kind 전체 집합은 정확히 `플랫폼 운영`과 `내 클럽` 두 축이다. UI는 서버가 현재 계정에 허용한 subset만 렌더하고 하나만 허용되면 switcher를 숨기거나 비활성화한다.

- `플랫폼 운영`은 cross-club platform authority를 사용한다.
- `내 클럽`은 URL-authoritative club identity를 먼저 선택하고, 그 안에서 허용된 `멤버로 보기` 또는 `호스트로 운영` perspective를 선택한다.
- 계정 identity와 로그인/로그아웃은 공간 선택과 분리한다.
- 서버 projection이 `availableSpaces`와 club별 허용 perspective를 소유한다. 각 목적 route의 기존 capability/guard는 action authority를 다시 확인하고, client는 role/status enum으로 공간 접근을 재계산하지 않는다.
- return target은 `pathname`, `search`, `hash`, focus target, scroll 위치를 공간·club·perspective별로 보존한다. 민감 state나 command payload는 보존하지 않는다. 복원 전에 최신 `availableSpaces`, route correspondence와 route-owned allowlist를 다시 검사하고 stale/invalid target은 폐기한다.
- 전환 안전 상태는 `clean`, `dirty`, `pending`, `unknown-outcome`이다. `dirty`는 명시적 이탈 확인을 요구한다. `pending` 등록은 operation identity와 domain-owned recovery strategy를 함께 보관하고, request가 응답하거나 기본 30초 timeout(기존 domain 계약이 더 짧으면 그 값)에 도달할 때까지 이동을 막는다. timeout이면 같은 identity와 recovery를 보존한 `unknown-outcome`으로 전환한다. `unknown-outcome`은 자동 재실행하지 않고, receipt가 있는 command는 같은 command/receipt identity로 조회·재개하며 L1은 authoritative state/history를 다시 읽는다.
- coordinator는 등록마다 generation을 발급한다. Normal unmount는 active 등록을 tombstone 처리하되 receipt capsule을 retired registry에 남겨 같은 identity의 detached lookup/reconciliation만 허용한다. Authority loss는 active/retired capsule, timer, 민감 cache와 draft를 먼저 invalidate/clear하고 generation을 올린다. 이전 generation의 늦은 응답은 UI·cache·receipt callback·success copy·navigation·return target을 갱신하지 않으며, authority loss 뒤에는 replay 없이 `authority-lost`로 끝난다. Member·host·admin의 변경 producer는 전수 inventory에서 등록 owner, 수정 factory, 검증된 leaf 또는 mounted graph에서 도달 불가한 export로 분류한다.
- authority loss에서는 ADR-0035대로 해당 민감 cache/draft를 폐기하고, 서버 projection이 허용한 안전 목적지로 replace 이동한다.
- 대응 route가 없으면 같은 공간·club·perspective의 마지막 안전 목적지, 그 perspective 대표 route 순으로 fallback한다.

이 결정은 ADR-0026을 대체한다. ADR-0019의 URL-authoritative club identity와 ADR-0030의 platform authority/club membership 분리는 유지한다.

## 근거

- 사용자는 역할 enum이 아니라 `플랫폼을 운영하는가`, `내 클럽에 참여하는가`를 먼저 이해한다.
- club 선택과 member/host perspective를 분리하면 다중 클럽·겸임 사용자의 목적지가 명확해진다.
- 서버 projection을 권위로 삼아 admin과 member shell의 authorization drift를 제거한다.
- full return target과 transition state가 작성 중 손실, duplicate command, response-loss 오판을 막는다.
- 계정 전환을 분리해 현재 공간과 current identity를 혼동하지 않는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| `멤버 공간`, `호스트 공간`, `플랫폼 운영` 3개를 동급으로 표시 | club identity와 perspective가 섞이고 다중 클럽에서 항목 수가 폭증한다. |
| 각 shell의 독립 switcher 유지 | 진입 방향에 따라 다른 권한 계산과 복귀 정책이 계속된다. |
| client role enum으로 목적지 계산 | approval/capability 변경과 authority loss를 정확히 반영하지 못한다. |
| pathname만 보존 | filter, selected item, anchor, focus, scroll을 잃어 운영 문맥 복귀가 불완전하다. |
| pending command 중 자유 전환 | duplicate effect 또는 결과 오판 위험이 있다. |

## 결과

긍정적:

- 운영자·호스트·멤버 전환이 하나의 개념과 접근성 패턴을 사용한다.
- authorization과 destination projection의 source of truth가 서버로 모인다.
- club/perspective별 문맥 복귀와 authority-loss recovery를 일관되게 검증할 수 있다.

부정적/감수한 비용:

- auth/BFF/server DTO와 frontend app/shared 경계를 함께 바꾸는 수직 slice가 필요하다.
- 기존 workspace continuity storage key migration과 compatibility fallback이 필요하다.
- dirty/pending/unknown-outcome과 기본 30초(더 짧은 기존 domain 계약 우선) timeout/reconciliation strategy를 각 workflow가 공통 transition coordinator에 보고해야 한다.

## 검증

- Server contract와 frontend fixture/E2E가 platform-only, member-only, host+member, platform+member, platform+host+member 조합 및 inactive/suspended/pending membership을 검증한다. `availableSpaces` unknown/malformed projection은 fail close하고, field가 없는 혼합 배포 응답에서만 legacy fallback을 허용한다.
- Route/transition tests가 pathname/search/hash/focus/scroll의 club/perspective 격리, dirty confirm, pending block→timeout, unknown-outcome receipt/history recovery와 clean transition을 검증한다.
- Exact interleaving `beginPending → unregister/unmount → authority loss → late settlement/reconciliation`은 원래 request count 불변, replay 0회, UI/cache/receipt/copy/navigation/return-target publication 0회, retained canonical field clear와 detached capsule 0개를 검증한다. Normal unmount의 same-identity receipt lookup은 이 authority-loss zero-replay 경로와 별도로 검증한다.
- `front/tests/unit/frontend-boundaries.test.ts`와 `front/src/app/space-transition-producer-inventory.test.ts`가 query/API/router 없는 nested presentation, observation-only mutation execution, accepted-owner publisher 호출과 모든 write producer 분류를 강제한다.
- Canonical frontend lint/test/build, focused/full E2E, server PR gate, MySQL/Testcontainers 1,422건, Docker Chromium component 104건과 public release candidate 검증을 통과했다. Server DTO, frontend strict schema/model, active architecture가 일치해 `Accepted`로 승격했다.
- Keyboard menu, visible focus, mobile switch flow와 자동 접근성 계약은 검증했다. VoiceOver/Safari·NVDA/Chrome 수동 screen-reader announcement order는 아직 `not measured`이며 완료로 주장하지 않는다.

## 후속 작업

- 혼합 배포 compatibility가 필요 없다는 production residue evidence가 생기기 전에는 기존 auth field와 `availableSpaces` absent-only legacy fallback을 제거하지 않는다.
- VoiceOver/Safari·NVDA/Chrome 수동 screen-reader announcement order를 별도 evidence로 측정한다.
