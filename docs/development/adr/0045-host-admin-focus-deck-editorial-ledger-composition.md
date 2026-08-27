# ADR-0045: 호스트·플랫폼 관리자 composition을 Focus Deck·Editorial Operations Ledger로 고정

- 상태: Accepted
- 결정일: 2026-08-26
- 작성자: 제품·디자인·플랫폼 운영·프런트엔드
- 관련: ADR-0003, ADR-0020, ADR-0039, ADR-0040, ADR-0043, ADR-0044, ADR-0046, ADR-0047,
  `docs/superpowers/specs/2026-08-26-readmates-host-admin-visual-authority-and-integration-design.md`

> Host page-level composition은 ADR-0046이다. Admin case-desk composition은 ADR-0047이다. 이 ADR은 공유 paper/ink primitive 계약을 위해 `Accepted`로 남는다.

## 컨텍스트

기존 ADR-0020은 모든 역할이 하나의 ReadMates 브랜드 primitive를 공유하되 host는 Meeting Folio,
platform admin은 system command ledger를 사용한다고 정했다. 이후 host runtime은 page-level local
navigation과 judgment rail이 시각적 주인이 됐고, 사용자가 승인한 원 시안의 단일 주 행동과 멀어졌다.
플랫폼 관리자는 Today, Clubs, Services, Review의 task-centered Service Spine과 domain-owned safe-command를
갖췄지만 각 route의 evidence hierarchy, 상태·복구 문법, URL selection, mobile flow는 고르지 않다.
현재 route catalog는 exact capability로 visible area를 계산한다
(`front/features/platform-admin/model/admin-route-catalog.ts:38`). 이 권한·도메인 계약을 바꾸지 않고 두 역할의
시각 권위를 다시 명확히 해야 한다.

## 결정

모든 역할은 warm paper, ink hierarchy, restrained navy accent, semantic state, typography, spacing, focus
primitive를 계속 공유한다. 이 공통 브랜드 안에서 host meeting detail은 ADR-0044의 **Focus Deck**을,
다른 host route는 같은 primitive를 사용한 route-specific list/form grammar를, platform admin은
**Editorial Operations Ledger**를 page-level composition 권위로 사용한다. 관리자 전체 운영 문법은
`signal → prioritized case → evidence docket → guarded command → command 등급에 맞는
history/receipt/convergence`이며, desktop은 priority ledger와 persistent evidence docket, mobile은 queue
→ record → review → 결과 확인의 route-based flow를 사용한다. L1은 capability/concurrency/source
revalidation/atomic history, L2는 preview/confirm/receipt, L3는 receipt/convergence/resume를 사용한다. 모든
action에 preview·receipt·convergence를 강제하지 않는다. Public, guest, member의 기존 editorial composition은
이 결정으로 변경하지 않는다. ADR-0039의 네 primary area, ADR-0040의 domain-owned safe-command, 서버 exact
capability projection은 유지한다. Today case lifecycle action은 서버가 내려주는 domain-owned
`allowedActions`를 사용하며 frontend가 role로 재계산하지 않는다.

## 근거

- 역할을 오가도 브랜드 신뢰와 component semantics는 유지된다.
- 호스트는 한 모임의 지금 할 일을, 관리자는 여러 클럽과 서비스의 판단 근거를 각각 먼저 볼 수 있다.
- 관리자 판단의 입력, 근거, 행동, 결과를 한 흐름으로 추적할 수 있다.
- shared primitive와 role-specific composition의 경계가 분명해져 role-only theme drift를 막는다.
- 오래된 관리자 redesign의 polling/queue 의도는 최신 권한·contract 위에서 선택적으로 재구현할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 모든 역할에 같은 page template | 역할별 업무 밀도와 주요 행동을 무시한다. |
| host/admin 전용 palette와 theme | 같은 제품의 component semantics와 브랜드 신뢰가 갈라진다. |
| generic SaaS KPI dashboard | 운영 판단보다 수치 카드가 앞서고 ReadMates editorial identity와 맞지 않는다. |
| dark network operations center | 서비스 성격보다 긴장감과 장식이 앞선다. |
| 각 admin route 독립 디자인 | 상태·근거·receipt 문법이 다시 분산된다. |
| 오래된 redesign branch wholesale merge | 최신 auth, capability, route, fixture, CSS 회귀 위험이 크다. |

## 결과

긍정적:

- host와 admin의 시각 권위가 분명하면서도 같은 design primitive를 공유한다.
- 모든 admin route가 같은 page/state/evidence grammar를 사용하고, 실제 command가 있는 route만 등급에 맞는
  action/result grammar를 사용할 수 있다.
- saved view, pending-new, URL state, mobile back restoration을 공통 계약으로 만들 수 있다.
- exact capability와 safe-command를 UI composition의 중심에 둔다.

부정적/감수한 비용:

- host 주요 상태와 `/admin/**` 전체를 vertical slice로 다시 검증해야 한다.
- shared component와 route-owned state 경계를 엄격히 review해야 한다.
- 역할·viewport별 visual baseline 유지 비용이 생긴다.

## 검증

- host Focus Deck의 상태·responsive 검증은 ADR-0044의 matrix를 따른다.
- 모든 ready admin route에서 loading, empty, stale, partial, 403, 409, unknown outcome을 검증한다.
- OWNER/OPERATOR/SUPPORT 이름에서 새 권한을 추론하지 않는지, 일반 command는 capability projection을,
  Today lifecycle은 server-owned `allowedActions`를 따르는지 test한다.
- queue selection, filter, pagination, polling order freeze, pending-new, Back/Forward, scroll/focus restoration을 검증한다.
- L1 state/history, L2 preview/confirm/receipt, L3 convergence/resume를 해당 command에서만 E2E 검증한다.
- 320/390/768/900/1024/1440px, 200% zoom, keyboard/focus, reduced motion, 긴 한국어를 검증한다.

## 후속 작업

- 오래된 관리자 branch의 pure model/test intent를 current main에 재작성한다.
- 분석 export와 notification replay를 exact capability projection으로 교정한다.
- 코드·tests·`front/DESIGN.md`·active architecture가 일치하여 `Accepted`로 승격한다.
