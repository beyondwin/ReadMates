# ReadMates Ops Depth + Confidence Evidence

작성일: 2026-06-01
상태: DRAFT DESIGN SPEC

## 1. 배경

Admin vNext closeout 이후 `/admin` route family는 모두 READY 상태가 되었고, `/admin/analytics`도 lite reporting surface로 닫혔다. 이어서 host/member reading loop와 showcase polish까지 반영되어, ReadMates는 현재 "운영 콘솔이 있는 독서모임 앱"이라는 형태를 갖췄다.

다음 고도화는 새 화면을 더 여는 것보다, 이미 닫힌 운영 표면을 실제 판단에 더 쓸 수 있게 만들고, 그 판단이 코드·테스트·릴리즈 증거로 반복 검증되게 만드는 쪽이 맞다. 이 문서는 사용자가 선택한 두 축을 하나의 실행 가능한 spec으로 묶는다.

- **운영 깊이**: `/admin/analytics`, observability, release evidence가 운영자가 다음 판단을 내릴 수 있는 수준으로 깊어진다.
- **신뢰성 증거**: query budget, visual regression, release safety, architecture boundary가 "문서상 주장"이 아니라 반복 가능한 검증으로 남는다.

이 spec은 Admin vNext historical roadmap을 덮어쓰지 않는다. 현재 source of truth는 코드, 테스트, scripts, migrations, `docs/development/architecture.md`다.

## 2. 목표

성공 기준은 "차트가 늘었다"가 아니다. 운영자가 같은 데이터로 같은 결론을 낼 수 있고, reviewer가 그 결론을 public-safe evidence로 확인할 수 있어야 한다.

성공 기준:

- `/admin/analytics`가 7/30/90일 point-in-time 비교를 넘어 추세와 export 가능한 근거를 제공한다.
- 운영자는 데이터 부족, 측정 불가, 위험 신호를 서로 혼동하지 않는다.
- 주요 운영 화면의 query budget과 visual baseline이 drift를 감지한다.
- release-readiness, public-release safety, architecture boundary가 변경 범위에 맞게 자동 또는 반자동으로 확인된다.
- 공개 문서와 showcase는 private workflow를 열지 않고 sanitized evidence만 연결한다.

## 3. 선택한 접근

선택한 접근은 **A + R 병렬형 단일 spec**이다.

```text
A. Analytics / observability depth
  -> operational trend and export
  -> honest unavailable states

R. Reliability evidence layer
  -> query budget
  -> visual regression
  -> release safety proof

Shared gate
  -> architecture boundaries
  -> public-safe docs
  -> targeted checks
```

대안은 두 가지였다.

1. Analytics만 먼저 심화한다.
   - 장점: 구현 범위가 작다.
   - 단점: 증거 체계가 약하면 새 분석 화면도 "보기 좋은 대시보드"에 머문다.

2. 검증 체계만 먼저 만든다.
   - 장점: 장기 유지보수 체질이 좋아진다.
   - 단점: 사용자-facing 가치가 즉시 드러나지 않는다.

3. Analytics와 confidence evidence를 같이 설계한다.
   - 장점: 운영 기능과 그 기능의 신뢰 증거가 함께 닫힌다.
   - 단점: 한 PR로 구현하면 커질 수 있어 plan 단계에서 task를 나눠야 한다.

이 spec은 3번을 택하되, implementation plan에서는 A와 R을 독립 task로 나누는 것을 전제로 한다.

## 4. 범위

### 4.1 Analytics / Observability Depth

주요 표면:

- `/admin/analytics`
- `admin.analytics` server slice
- `docs/operations/observability/*`
- `docs/development/release-readiness-review.md`
- `docs/showcase/operational-proof.md`

범위:

- 기존 KPI의 추세를 더 분명히 보여준다.
  - 활성 멤버
  - 세션 완료율
  - RSVP 응답률
  - AI 비용/세션
  - 알림 도달률
- 7/30/90일 선택은 유지하고, 현재-대비-직전 델타만이 아니라 window 내부 series를 표시한다.
- CSV export는 "보이는 overview와 같은 계약"에서 생성한다.
- 데이터 부족은 `NOT_ENOUGH_DATA` 또는 동일한 명시 상태로 표현한다.
- 측정 실패는 데이터 부족과 구분한다.
- 운영 runbook은 어떤 지표가 어떤 판단에 쓰이는지 public-safe 수준으로 설명한다.

Non-goals:

- 실시간 streaming dashboard.
- 임의 forecast나 fake benchmark.
- raw member data, email body, provider raw error, transcript, generated result JSON 노출.
- 새 charting library 도입. 필요하면 먼저 무라이브러리 SVG/HTML 또는 기존 UI primitive를 검토한다.

### 4.2 Reliability Evidence Layer

주요 표면:

- `front/tests/unit/frontend-boundaries.test.ts`
- `server/src/test/kotlin/com/readmates/performance/*`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Playwright E2E specs
- public release scripts
- `docs/showcase/engineering-confidence.md`
- `docs/development/test-guide.md`

범위:

- Query budget follow-up:
  - analytics overview, host/member reading loop, public/archive read path 중 운영상 중요한 route의 observed budget을 문서화하고 테스트로 핀한다.
  - query budget은 성능 숫자 자랑이 아니라 accidental N+1 회귀 감지 장치로 둔다.
- Visual regression infrastructure:
  - admin analytics와 host/member 핵심 route에 대해 desktop/mobile screenshot baseline을 시작한다.
  - baseline은 private data 없는 fixture나 route mock을 사용한다.
  - screenshot이 깨졌을 때 "디자인 변경"인지 "회귀"인지 리뷰 가능한 파일명을 사용한다.
- Release safety proof:
  - 변경 표면에 따라 `pre-push-check`, public release candidate check, docs safety scan을 어떤 순서로 실행할지 test guide에 반영한다.
  - release-readiness review는 계속 "테스트 통과 = 리스크 종결"로 취급하지 않는다.
- Architecture evidence:
  - frontend route-first, server clean architecture, CQRS read/write split 예외가 늘지 않도록 변경이 있으면 boundary test를 확장한다.

Non-goals:

- 모든 route에 즉시 visual baseline을 강제하지 않는다.
- flaky visual diff를 CI blocking gate로 바로 올리지 않는다.
- public release scanner 규칙을 넓게 완화하지 않는다.
- historical `docs/superpowers` planning note를 현재 동작 source of truth처럼 홍보하지 않는다.

## 5. 사용자와 운영자 흐름

### 5.1 Operator: analytics 판단

운영자는 `/admin/analytics`에서 다음 순서로 판단한다.

1. 선택 window의 핵심 KPI를 본다.
2. 이전 window 대비 delta를 확인한다.
3. window 내부 series에서 일회성 spike인지 지속 추세인지 구분한다.
4. 문제가 있는 KPI는 관련 route로 이동한다.
   - 알림 도달률 → `/admin/notifications`
   - AI 비용/세션 또는 실패 → `/admin/ai-ops`
   - 특정 클럽 readiness → `/admin/clubs/:clubId`
5. CSV export로 같은 overview를 운영 리뷰에 첨부한다.

### 5.2 Reviewer: confidence evidence 확인

리뷰어는 README와 showcase에서 다음을 확인한다.

1. 어떤 route가 public이고 어떤 workflow가 private인지 확인한다.
2. private workflow는 테스트와 sanitized fixture evidence로 확인한다.
3. 운영 분석은 raw private data가 아니라 aggregate/read-only projection임을 확인한다.
4. release-readiness와 public-release safety가 어떤 변경을 막는지 확인한다.

## 6. 데이터와 계약

Analytics 계약은 기존 `admin.analytics_overview.v1`을 우선 유지한다. 내부 series나 export metadata가 기존 shape에 자연스럽게 붙지 않으면 `admin.analytics_overview.v2`를 새로 핀한다.

계약 원칙:

- JDBC adapter는 가능한 한 raw count와 raw money/count aggregate만 반환한다.
- application service가 ratio, delta, availability, display-safe reason을 계산한다.
- frontend model은 URL state, CSV filename/href, display formatting만 소유한다.
- UI는 contract를 직접 해석하지 않고 route/model이 만든 props를 렌더링한다.
- `clubId`, `clubSlug`, actor, source slice 같은 filter vocabulary는 admin audit/analytics가 이미 쓰는 이름을 우선 재사용한다.

CSV export:

- 브라우저에서 생성 가능한 범위면 frontend model helper로 둔다.
- 서버 파일 다운로드 endpoint가 필요할 정도로 커지면 별도 plan에서 API contract를 설계한다.
- CSV에는 real email, private domain, raw provider error, transcript, generated body를 넣지 않는다.

## 7. 아키텍처 경계

Frontend:

```text
src/app -> src/pages -> features -> shared
```

- `features/platform-admin/api`: analytics endpoint 호출과 response contract.
- `features/platform-admin/queries`: analytics query key, loader seeding, invalidation.
- `features/platform-admin/model`: window parsing, series normalization, CSV helper.
- `features/platform-admin/route`: loader, URL state, API/model 조립.
- `features/platform-admin/ui`: props/callback 기반 렌더링.
- visual regression fixture는 public-safe mock을 사용하고 production secrets나 local path를 포함하지 않는다.

Server:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

- `admin.analytics`는 ops read-side slice로 유지한다.
- controller는 request parsing과 response mapping만 맡는다.
- service는 availability, ratio, delta, honest empty-state derivation을 소유한다.
- persistence adapter는 aggregate SQL과 row mapping만 소유한다.
- read-only service는 mutation port와 write transaction을 갖지 않는다.

Docs:

- `docs/development/architecture.md`가 현재 동작 source of truth다.
- `docs/showcase/*`는 reviewer-facing evidence map이며, private route를 public으로 열지 않는다.
- `docs/development/test-guide.md`는 실행 가능한 command 중심으로 갱신한다.

## 8. UI 방향

Admin analytics는 generic SaaS chart wall이 아니라 ReadMates 운영 ledger의 일부여야 한다.

원칙:

- 차트보다 판단 문장을 우선한다.
- 색상만으로 좋음/나쁨을 구분하지 않는다.
- 데이터 부족과 측정 실패는 다른 시각 상태를 갖는다.
- 모바일 360px에서 KPI 카드, window 선택, export action이 겹치지 않는다.
- table/series는 horizontal overflow를 허용하더라도 핵심 summary는 viewport 안에 남긴다.
- CSV export는 아이콘/텍스트 버튼으로 명확히 드러내되, 과장된 report builder처럼 만들지 않는다.

## 9. 에러 처리와 Public Safety

에러 처리:

- Analytics 필수 overview fetch 실패는 route-level error 또는 admin shell error state로 처리한다.
- 일부 series만 계산 불가하면 전체 화면을 blank 처리하지 않고 card-local unavailable state를 둔다.
- 데이터가 없어서 계산할 수 없는 경우와 provider/DB 오류는 copy에서 구분한다.
- CSV 생성 실패는 inline alert 또는 disabled action으로 처리한다.

Public safety:

- 문서, fixture, screenshot, CSV test fixture에 real member data를 넣지 않는다.
- private domain, deployment state, local absolute path, OCID, secret, token-shaped 예시를 넣지 않는다.
- provider raw error, transcript, generated session body, raw email body는 응답·문서·테스트 fixture에 넣지 않는다.
- Graphify 결과는 code discovery aid로만 사용하고 source of truth로 쓰지 않는다.

## 10. 검증 계획

기본 frontend:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Analytics route 또는 user-flow 변경:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Server analytics 변경:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
```

Query budget 변경:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Docs/showcase 변경:

```bash
git diff --check -- <changed-docs>
```

Public release or public-facing docs:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Visual regression은 plan 단계에서 command를 확정한다. 첫 도입 시에는 CI blocking보다 report artifact로 시작하고, flake 원인을 닫은 뒤 blocking gate를 재평가한다.

## 11. 완료 기준

- Analytics 심화는 운영자가 다음 조치 route로 이어갈 수 있는 판단 정보를 제공한다.
- 데이터 부족과 측정 실패가 UI와 CSV에서 혼동되지 않는다.
- Query budget 또는 visual baseline이 최소 하나 이상의 실제 회귀 유형을 막도록 설계되어 있다.
- Architecture boundary test가 새 예외를 만들지 않는다.
- Showcase와 README는 private workflow를 열지 않고 evidence map만 갱신한다.
- CHANGELOG `Unreleased`는 사용자-facing, operator-facing, reviewer-facing 변경을 반영한다.
- 실행한 검증과 skipped validation이 release-readiness 문서 또는 final report에 구분되어 남는다.

## 12. Implementation Plan 입력

다음 단계의 implementation plan은 최소 네 task로 나눈다.

1. **Analytics contract and model**
   - 현재 `admin.analytics_overview.v1`로 충분한지 확인한다.
   - 부족하면 v2 contract를 설계한다.
   - service/model 단위 테스트를 먼저 둔다.

2. **Analytics route and CSV export**
   - URL state, series rendering, export helper를 route/model/ui 경계에 맞춘다.
   - admin analytics E2E를 갱신한다.

3. **Reliability evidence baseline**
   - query budget 후보 route를 선정하고 budget test를 보강한다.
   - visual regression 도입 범위와 command를 확정한다.

4. **Docs and release evidence**
   - test guide, engineering confidence, operational proof, release-readiness 연결을 갱신한다.
   - public safety scan과 docs diff check를 실행한다.

한 PR로 닫을 수 없을 경우 1-2를 먼저 ship하고, 3-4를 후속 PR로 분리한다. 단, analytics 심화가 docs에서 과장되지 않도록 evidence 문서 갱신은 같은 릴리즈 안에서 닫는다.
