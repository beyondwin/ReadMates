# ReadMates Ops Insight & Release Trust

작성일: 2026-05-31
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext closeout 이후 `/admin` 라우트는 모두 `ready` 상태이고, H 하드닝 베이스라인과 member/host reading loop도 `main`에 반영되어 있다. 남은 고도화 후보는 세 갈래다.

- `/admin/analytics`는 S8 lite로 출시되어 KPI current-vs-prior delta와 club benchmark를 제공하지만, 운영자가 추세를 읽고 외부 리포트로 넘기기에는 아직 얕다.
- Observability 문서 일부는 코드가 실제 live gauge로 진화한 뒤에도 placeholder 설명을 남기고 있어, 운영자가 어떤 신호를 믿어야 하는지 헷갈릴 수 있다.
- Release-readiness 문서는 v1.11.0 이후 남은 manual smoke와 backup timer residual을 추적하지만, 현재 상태 기준으로 다시 분류되지 않았다.

이 스펙은 세 후보를 하나의 umbrella로 묶는다. 목적은 기능을 넓히는 것이 아니라, **운영 insight -> 관측 신뢰 -> 릴리즈 신뢰** 흐름을 한 번에 닫는 것이다.

## 2. 목표

- `/admin/analytics`를 "lite overview"에서 "운영 추세를 읽고 내보낼 수 있는 report surface"로 올린다.
- 관측성 문서, dashboard/alert 설명, 코드 KDoc이 같은 사실을 말하게 맞춘다.
- release-readiness residual을 자동 검증 가능 항목, 수동 운영 항목, 범위 밖 항목으로 재분류한다.
- 변경 전반에서 public repo safety, admin hardening baseline, route/server architecture boundary를 유지한다.

성공 기준:

- 운영자가 `/admin/analytics`에서 KPI별 기간 흐름을 읽고 CSV로 내려받을 수 있다.
- 데이터가 얇은 구간은 계속 정직하게 "데이터 부족"으로 표현된다.
- `readmates.aigen.queue.depth` 같은 관측성 신호 설명이 코드와 문서에서 모순되지 않는다.
- release-readiness 문서가 "테스트 통과"와 "릴리즈 리스크 종결"을 혼동하지 않고, 남은 항목의 owner/action/상태를 명확히 한다.

## 3. 선택한 접근

선택한 접근은 **Unified Ops Trust Spec**이다.

검토한 접근:

- Analytics-only: 구현은 작지만 observability/release residual이 계속 따로 떠서 운영 신뢰가 닫히지 않는다.
- Release-first: 즉시 ship confidence는 올라가지만 사용자가 요청한 제품 고도화 체감이 약하다.
- Unified Ops Trust: analytics v2, observability truth cleanup, release-readiness residual closure를 순서대로 실행해 제품과 운영 증거를 같이 닫는다.

이 스펙은 세 슬라이스를 한 문서에 담되, 구현 계획은 슬라이스 경계를 유지한다. 한 PR로 묶을 수 있더라도 작업 순서는 A -> O -> R을 따른다.

## 4. 슬라이스 순서

확정 순서: **A -> O -> R**

- **A: Analytics v2** 먼저. 실제 운영 표면을 깊게 만든 뒤, 그 표면을 설명하는 운영 문서와 release-readiness 판단이 의미를 가진다.
- **O: Observability truth cleanup** 다음. Analytics v2가 만드는 운영 판단과 기존 Prometheus/alert 문서가 서로 다른 말을 하지 않게 한다.
- **R: Release-readiness residual closure** 마지막. 제품/관측 문서가 정리된 뒤 전체 residual을 현재 branch 기준으로 재검토한다.

## 5. Slice A - `/admin/analytics` v2

### 5.1 범위

현재 `/admin/analytics`는 `GET /api/admin/analytics/overview?window=7d|30d|90d`를 통해 active members, session completion, RSVP rate, AI cost per session, notification delivery KPI와 club benchmark를 보여준다. v2는 이 표면을 다음처럼 확장한다.

- KPI별 시계열 projection: 7/30/90일 window 안에서 일정한 bucket 단위로 current trend를 보여준다.
- CSV export: 현재 선택한 window와 KPI/benchmark 데이터를 public-safe CSV로 내려받을 수 있게 한다.
- 데이터 부족 상태: bucket 또는 KPI 분모가 0이면 값을 지어내지 않고 unavailable 상태를 유지한다.
- URL state 유지: `?window=` 기반 탐색 패턴을 유지하고, 필요하면 `?metric=` 같은 작은 필터만 추가한다.

### 5.2 데이터 계약

기본 방향은 기존 `admin.analytics_overview.v1`을 깨지 않는 것이다.

우선순위:

1. 기존 overview contract에 additive field로 `series`와 `exports` metadata를 붙일 수 있는지 검토한다.
2. breaking 변경이 필요하면 `admin.analytics_overview.v2`를 새 schema로 명시하고, frontend fixture/contract test를 같이 갱신한다.
3. CSV는 서버-generated endpoint와 client-side export 중 더 단순한 쪽을 선택하되, 데이터 source of truth는 서버 projection이어야 한다.

서버는 raw count를 adapter에서 반환하고, 비율/델타/availability 파생은 application service에서 수행하는 기존 S8 패턴을 유지한다. JDBC adapter가 presentation-ready trend label이나 색상 의미를 만들지 않는다.

### 5.3 UI 방향

무거운 charting library를 기본값으로 추가하지 않는다. 초기 v2는 다음 중 하나로 충분하다.

- small inline trend table
- CSS-only sparkline/list
- KPI card 아래 bucketed mini grid

운영자가 비교해야 하는 것은 예쁜 그래프가 아니라 "좋아지는가, 나빠지는가, 데이터가 충분한가"다. 색상만으로 의미를 전달하지 않고 label/text를 함께 제공한다. 모바일 360px에서는 KPI trend가 접히거나 표 형태로 전환되어야 한다.

### 5.4 Error / Empty

- overview fetch 실패는 route-level alert로 표시한다.
- series 일부가 부족하면 전체 analytics 화면을 blank 처리하지 않고 해당 KPI만 unavailable 처리한다.
- CSV export 실패는 export control 주변 inline alert로 제한한다.
- raw SQL error, internal provider detail, private member data, email body, token-shaped 예시는 응답과 UI에 노출하지 않는다.

## 6. Slice O - Observability Truth Cleanup

### 6.1 범위

현재 코드에는 `AiGenerationQueueDepthGaugeBinder`가 `AiGenerationJobStore.loadActiveJobs()` 기반으로 `PENDING + RUNNING` job count를 `readmates.aigen.queue.depth` gauge에 묶는 구조가 있다. 반면 일부 문서에는 아직 placeholder 0 gauge 또는 Kafka consumer lag wiring 전 설명이 남아 있다.

이 슬라이스는 관측성 source들을 같은 의미로 맞춘다.

대상 후보:

- `docs/operations/observability/metrics-catalog.md`
- `docs/operations/observability/dashboards.md`
- `docs/operations/observability/alerts.md`
- `docs/operations/runbooks/ai-session-generation.md`
- 관련 KDoc과 테스트 이름
- `CHANGELOG.md`의 `Unreleased` 현재 항목

### 6.2 의미 고정

`readmates.aigen.queue.depth`의 의미는 아래 중 하나로 명확히 고정해야 한다.

- 현재 코드 의미: Redis job store의 active job backlog (`PENDING + RUNNING`) count.
- 미래 Kafka lag 의미: 별도 meter로 분리하거나, 이 스펙 범위 밖 후속으로 명시.

같은 metric 이름이 문서마다 "job backlog", "consumer lag", "placeholder"를 오가면 안 된다. 이 스펙의 기본 선택은 **현재 코드 의미를 문서화**하는 것이다.

### 6.3 Non-goals

- 새 Prometheus stack을 추가하지 않는다.
- alert threshold를 근거 없이 바꾸지 않는다.
- metric label에 `club_id`, `user_id`, email, job id 같은 고카디널리티 또는 민감 값을 추가하지 않는다.
- 운영 dashboard에 실제 운영 host, secret, provider key, private deployment state를 기록하지 않는다.

## 7. Slice R - Release-readiness Residual Closure

### 7.1 범위

`docs/development/release-readiness-review.md`의 v1.11.0 post-release smoke 항목을 현재 기준으로 재검토한다.

대상 residual:

- production host smoke
- OAuth happy path smoke
- DB backup daily timer
- 필요하면 최근 admin/analytics/observability 변경으로 생긴 새 release-readiness 항목

### 7.2 분류 정책

각 residual은 다음 중 하나로 분류한다.

- **Closed by automated evidence**: 현재 repo command, script, test, docs evidence로 닫힌 항목.
- **Manual operational action remains**: Google OAuth 또는 VM 접근처럼 자동화가 현실적으로 막힌 항목. owner, action, target condition을 남긴다.
- **Out of scope for this branch**: 이번 스펙 변경과 직접 관련 없는 기존 운영 항목. 사라진 것처럼 삭제하지 않는다.

수동 항목을 자동으로 닫았다고 쓰지 않는다. 반대로, 이미 코드/문서가 실제로 닫은 항목을 영구 residual처럼 방치하지 않는다.

### 7.3 Release readiness review

R 슬라이스 완료 시 `docs/development/release-readiness-review.md`의 기준을 따라 현재 branch 전체를 본다. 사용자가 특정 plan만 보라고 하지 않았으므로 기본 범위는 `origin/main..HEAD` 또는 실제 merge base다.

검토 영역:

- CHANGELOG `Unreleased`
- 운영 surprise 기록 위치
- CI/deploy/script 진단 일관성
- security code hygiene
- architecture baseline/exception 부채
- public-release 후보와 scanner 안전
- 실행한 검증과 skipped validation 분리

## 8. 아키텍처 경계

### 8.1 Frontend

`docs/agents/front.md`의 route-first 경계를 따른다.

- `features/platform-admin/api`: analytics API contract와 CSV endpoint/client helper.
- `features/platform-admin/queries`: query keys, queryOptions, invalidation-free read helpers.
- `features/platform-admin/model`: window parsing, KPI/series formatting, CSV filename/row derivation 같은 순수 계산.
- `features/platform-admin/route`: loader, query seeding, URL state, UI prop assembly.
- `features/platform-admin/ui`: props/callback 기반 렌더링. fetch/query/route import 금지.

### 8.2 Server

`admin.analytics`는 read-only server slice로 유지한다.

```text
adapter.in.web
  -> application.port.in
  -> application.service
  -> application.port.out
  -> adapter.out.persistence
```

- Controller는 request parsing, auth carrier, response mapping만 담당한다.
- Application service가 raw aggregate에서 rate, delta, series availability, CSV-safe projection을 파생한다.
- Persistence adapter는 raw counts와 bucket rows만 반환한다.
- Read-only service에 mutation port나 `@Transactional`을 추가하지 않는다.

### 8.3 Docs / Ops

관측성·release 문서는 현재 코드, config, tests, scripts를 source of truth로 삼는다. `docs/superpowers/`의 과거 계획 문서는 historical record이므로, 현재 동작 설명은 `docs/development`, `docs/operations`, `README`, `CHANGELOG`에 반영한다.

## 9. Public Repo Safety

모든 슬라이스는 공개 저장소 안전 기준을 유지한다.

금지:

- 실제 멤버 이름, 이메일, private club data
- 실제 secret, API key, token-shaped 예시
- private domain, deployment state, OCID, DB dump
- raw provider error, transcript body, generated result JSON
- 로컬 절대 경로

허용:

- repo-relative path
- placeholder domain or values
- masked/synthetic fixture
- aggregate-only operational counts

## 10. 검증 계획

Slice A 예상 검증:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
```

Analytics route/user-flow가 바뀌면:

```bash
pnpm --dir front test:e2e
```

Slice O/R docs 검증:

```bash
git diff --check -- docs/superpowers/specs/2026-05-31-readmates-ops-insight-release-trust-design.md
```

Public-facing docs, deploy docs, release scanner 관련 변경이면:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

R 슬라이스 완료 시 release-readiness review 명령은 `docs/development/release-readiness-review.md`의 권장 명령을 따른다.

## 11. 완료 기준

- `/admin/analytics` v2가 trend와 export를 제공하면서 기존 lite KPI/benchmark 의미를 깨지 않는다.
- thin data, zero denominator, partial unavailable 상태가 정직하게 표현된다.
- Observability metric 설명이 code/KDoc/docs/CHANGELOG에서 일관된다.
- Release-readiness residual은 자동 closure, manual remains, out-of-scope로 재분류된다.
- CHANGELOG `Unreleased`가 user/operator-facing 변경을 반영한다.
- Admin hardening baseline과 public safety gate가 통과한다.
- 실행한 검증과 실행하지 못한 검증이 최종 보고에 구분된다.

## 12. 다음 산출물

이 스펙의 implementation plan은 A -> O -> R 순서로 작성한다.

계획은 최소한 다음을 확정해야 한다.

- analytics series contract를 additive v1로 둘지 v2 schema로 둘지
- CSV export를 server endpoint로 둘지 client-side derived export로 둘지
- `readmates.aigen.queue.depth`의 문서상 최종 의미와 변경 파일
- release-readiness residual별 evidence source와 남길 문구
- 필요한 unit, route, server, E2E, public release checks
