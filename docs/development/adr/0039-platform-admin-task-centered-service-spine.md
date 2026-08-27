# ADR-0039: 플랫폼 어드민을 task-centered Service Spine으로 구성

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 제품·디자인·플랫폼 운영
- 관련: ADR-0003, ADR-0020, ADR-0030,
  `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`,
  `front/src/app/routes/admin.tsx:14-126`,
  `front/features/platform-admin/model/admin-route-catalog.ts:1-107`,
  `front/features/platform-admin/route/admin-club-detail-route.tsx:12-58`

## 컨텍스트

Platform admin은 현재 `/admin/today`, `/admin/clubs`, `/admin/clubs/:clubId`, `/admin/health`,
`/admin/notifications`, `/admin/ai-ops`, `/admin/support`, `/admin/audit`, `/admin/analytics`에 걸쳐
cross-club 운영 기능을 제공한다. Route는 실제 데이터와 권한 경계를 갖고 있지만 navigation은
`Command`, `Operations`, `Review`라는 구현 세대의 group을 노출하고, page마다 freshness, filter,
pagination, detail, mutation feedback의 문법이 다르다.

`/admin/today`는 operation case queue, source freshness, URL selection, cursor, optimistic conflict와
mobile drill-in을 갖춘 기준 구현이다. 반면 club metadata·public visibility·domain component는 API와
component가 존재해도 현재 detail route에서 도달할 수 없고, notifications·AI·audit는 server cursor와
상태 정보를 UI에서 온전히 소비하지 않는다. CSS 단일 열 전환만으로는 mobile에서 판단부터 조치까지
완료할 수 없다.

Platform admin은 club host와 다른 권한 축이다. 같은 사용자가 platform admin이어도 특정 club의 host
API를 사용하려면 해당 membership 권한을 별도로 통과해야 한다. 따라서 admin IA가 host의 session,
member, attendance, record workflow를 흡수하면 권한과 제품 소유권이 흐려진다.

## 결정

`/admin/**`를 cross-club 운영 작업대인 task-centered Service Spine으로 구성한다.

1차 navigation은 동등한 네 영역과 하단 비상 레인만 사용한다.

- `오늘`: platform-wide 우선순위 operation case
- `클럽`: registry, onboarding, detail, readiness, public state, domain
- `파이프라인`: 배달 원장, AI 작업, 서비스 건강
- `원장`: 운영 기입, 접근 원장, 분석 부록
- 비상 레인: 긴급 공개 회수 (사이드 하단 고정, 그룹 밖)

기존 URL과 deep link는 유지한다. Create, detail, preview, recovery는 해당 resource 아래 nested flow이며
동등한 전역 tab으로 승격하지 않는다.

`/admin/today`는 여러 도메인의 public-safe signal을 materialize한 판단·우선순위 ledger다. Case의
acknowledge, snooze, resolve와 source-driven reopen lifecycle을 소유하지만 실제 notification, AI, support, club
mutation을 실행하는 generic command surface가 되지 않는다. 실제 조치는 canonical domain route와
domain-owned typed command로 이어진다. Raw event, job, club, grant와 audit evidence는 source record로
남고 case table에 private payload를 복제하지 않는다.

Platform admin에 club 내부 session, member, attendance, invitation, record, 일반 notification preparation
mutation을 복제하지 않는다. 이 workflow는 `/clubs/:slug/app/host/**`와 host domain이 계속 소유한다.

공통 화면 composition과 responsive 동작은 승인 설계와 ADR-0020을, capability·sensitive state는
ADR-0030을, mutation 확인과 receipt는 ADR-0040을 따른다.

## 근거

- 운영자가 구현 package가 아니라 `우선순위 → 대상 → 서비스 복구 → 검토`라는 실제 업무 순서로 이동한다.
- `/admin/today`의 검증된 case lifecycle을 전체 화면의 시작점으로 유지하면서 raw source와 domain
  command의 책임을 혼합하지 않는다.
- 네 primary area와 nested flow가 flat tab 증가를 막고 create/detail hierarchy를 정직하게 표현한다.
- 같은 브랜드 primitive를 공유하면서 platform admin에 필요한 cross-club density를 만들 수 있다.
- URL과 기존 route를 보존해 deep link, browser history, 관측 route pattern의 migration 위험을 줄인다.
- Mobile을 별도 task composition으로 정의해 작은 화면에서도 운영 업무를 완료할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 현재 `Command/Operations/Review`와 route별 UI 유지 | 기능 소유권과 사용자의 실제 업무가 어긋나고 route별 품질 drift가 계속된다. |
| 모든 route를 동등한 전역 tab으로 표시 | Create/detail/recovery까지 flat navigation이 되어 hierarchy와 문맥을 잃는다. |
| KPI 중심 monitoring dashboard | 상태 수치는 보이지만 case evidence, 소유, 안전한 다음 행동을 화면 아래로 밀어낸다. |
| `/admin/today`에서 모든 domain action 실행 | Generic executor가 되어 domain authorization, transaction, receipt 소유권이 무너진다. |
| Platform admin에 host workflow 복제 | Platform authority와 club membership authority가 혼합된다. |
| 별도 `/admin-v2` 앱 | 장기 이중 route, design system drift, auth·observability 중복을 만든다. |

## 결과

긍정적:
- 모든 admin route가 하나의 작업 흐름과 상태 언어를 사용한다.
- 현재 숨은 club 기능과 누락된 cursor·filter·empty/error 상태를 product-level 완료 기준으로 관리한다.
- Platform admin과 host의 책임 경계가 navigation과 command flow에 모두 드러난다.
- Desktop·mobile·keyboard의 완료 경로를 같은 acceptance matrix에서 검증할 수 있다.

부정적/감수한 비용:
- Shell과 공통 UI grammar를 먼저 안정화한 뒤 route를 순차 이관해야 한다.
- Route별 fixture, source failure, role, viewport 조합의 test·visual evidence 유지 비용이 커진다.
- 기존 route 안에서 제공하던 임시 CTA나 table을 호환 기간 동안 단계적으로 교체해야 한다.
- 한 번에 외형만 바꾸는 방식보다 구현 기간이 길지만 기능·복구 완결성을 우선한다.

## 검증

- 기존 아홉 URL, deep link, browser back/forward, selected target 복원을 route test와 E2E로 확인한다.
- True empty, filtered empty, stale, partial source failure, 403, 409, invalid cursor, long content를 route별로
  검증한다.
- Cursor load-more가 기존 item을 누적·dedupe하고 selection을 보존하는지 확인한다.
- 320, 390, 768, 900, 1024, 1440px와 200% zoom에서 primary task 완료를 검증한다.
- Keyboard navigation, dialog/menu focus, `aria-current`, selection semantics, reduced motion을 확인한다.
- SUPPORT가 허용되지 않은 action을 실행할 수 없고 direct URL/API도 server에서 거절되는지 검증한다.
- Platform admin route가 host mutation API를 호출하거나 host-sensitive state를 재사용하지 않는지 review한다.

## 구현 결과

- Service Spine 수직 slice와 route/browser evidence가 구현 및 active architecture와 일치한다.
- Admin 구현은 public·guest·member·host까지 포괄하는 ADR-0020의
  `Accepted` 승격을 단독으로 충족하지 않는다. 각 ADR은 독립적으로 승격한다.
- Admin command의 위험 등급과 preview/receipt는 ADR-0040을 따른다.
