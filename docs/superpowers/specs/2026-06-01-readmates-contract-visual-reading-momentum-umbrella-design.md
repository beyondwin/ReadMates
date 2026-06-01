# ReadMates Contract + Visual + Reading Momentum Umbrella

작성일: 2026-06-01
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext closeout 이후 `/admin` route family는 READY 상태로 닫혔고, `/admin/analytics`도 운영 판단 표면으로 심화되었다. 최근 작업은 analytics query budget, visual evidence, release-readiness 문서 연결, notes query plan까지 이어져 "운영 콘솔이 있는 독서모임 앱"의 신뢰 층을 강화했다.

다음 고도화는 새 route를 더 여는 것보다, 이미 만들어진 계약과 증거가 장기적으로 drift되지 않게 만들고, 그 위에서 member reading loop의 제품 체감을 한 단계 올리는 쪽이 맞다.

이 문서는 사용자가 선택한 세 축을 하나의 엄브렐러로 묶는다.

- **A. Contract Confidence Sweep**: frontend schema, server response, docs/showcase가 같은 계약을 말하게 한다.
- **B. Visual Evidence Baseline**: 핵심 운영/멤버 화면의 desktop/mobile 시각 증거를 반복 가능한 방식으로 남긴다.
- **C. Member Reading Momentum**: `current-session -> notes -> archive -> feedback` 흐름에서 멤버의 다음 읽기/회고 행동을 선명하게 만든다.

이 spec은 구현 상세를 한 문서에 모두 밀어 넣지 않는다. 목적은 세 슬라이스의 순서, 의존성, gate, non-goals를 고정해 후속 implementation plan이 작은 단위로 실행되게 하는 것이다.

## 2. 목표

성공 기준은 "기능 수가 늘었다"가 아니다. reviewer와 운영자가 같은 코드, 같은 테스트, 같은 문서에서 같은 결론을 얻고, 멤버는 더 적은 해석 비용으로 다음 읽기 행동을 선택할 수 있어야 한다.

성공 기준:

- 핵심 API 계약이 frontend Zod schema, generated fixture, server contract test, docs에서 서로 어긋나지 않는다.
- 현재 동작 source-of-truth 문서가 shipped code와 맞는다. 특히 historical planning note의 stale 표현을 현재 behavior처럼 홍보하지 않는다.
- 핵심 화면의 desktop/mobile layout evidence가 public-safe fixture 또는 route mock으로 반복 생성된다.
- visual evidence는 private data leak sentinel과 non-empty layout assertion을 포함한다.
- member home/current-session/notes/archive/feedback 흐름이 "다음 읽기 또는 회고 행동" 중심으로 정렬된다.
- admin-only 신호나 platform recovery command가 host/member/member-public 표면으로 새지 않는다.

## 3. 선택한 접근

선택한 접근은 **A -> B -> C 순차 엄브렐러**다.

```text
A. Contract confidence
  -> current source-of-truth cleanup
  -> frontend Zod fixtures
  -> server contract tests

B. Visual evidence baseline
  -> public-safe route mocks or fixtures
  -> desktop/mobile screenshots
  -> private-data sentinels

C. Member reading momentum
  -> role-safe reading-loop model
  -> member next actions
  -> notes/archive/feedback continuity
```

이 순서를 택하는 이유:

1. A가 먼저 닫혀야 B/C가 의존할 계약과 문서 기준이 안정된다.
2. B가 먼저 깔리면 C의 사용자-facing 변경이 layout/private-safety evidence를 물려받는다.
3. C는 제품 가치가 가장 직접적이지만, shared reading-loop와 member route를 건드리므로 앞선 gate가 있어야 regression surface를 작게 유지할 수 있다.

## 4. 범위

### 4.1 A - Contract Confidence Sweep

주요 표면:

- `front/features/*/api/*-contracts.ts`
- `front/scripts/export-zod-fixtures.ts`
- `front/tests/unit/__fixtures__/zod-schemas/`
- `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- `docs/development/architecture.md`
- `docs/development/adr/0009-frontend-backend-contract-via-zod.md`
- `docs/showcase/*`

범위:

- 핵심 read contracts를 우선순위화한다.
  - `/api/admin/analytics/overview`
  - `/api/admin/audit/events` 또는 admin route family 중 drift 위험이 큰 read endpoint
  - member home/current-session read path
  - 필요하면 host dashboard read path의 기존 coverage를 보강한다.
- frontend Zod schema가 없는 핵심 response에는 DEV-only schema와 fixture export를 추가한다.
- server contract test는 실제 MockMvc response의 top-level key set 또는 명시한 nested contract를 fixture와 비교한다.
- docs는 현재 코드와 테스트가 말하는 계약만 설명한다.
- stale current-behavior 문구는 고친다. historical `docs/superpowers/` planning note는 필요한 경우 새 문서에서 predecessor로만 참조한다.

Non-goals:

- 모든 endpoint의 완전한 OpenAPI 생성.
- production runtime Zod validation 전면 활성화.
- schema toolchain 교체.
- historical planning note 전체 rewrite.
- private 운영값이나 실제 멤버 데이터가 들어간 예시 추가.

Gate:

- 새 fixture가 필요하면 `pnpm --dir front zod:export-fixtures` 후 fixture diff가 의도와 맞아야 한다.
- 관련 server contract test가 실패-성공 루프를 가질 수 있어야 한다.
- 변경된 docs는 `git diff --check -- <changed-docs>`를 통과해야 한다.
- docs/showcase 또는 public-facing docs가 바뀌면 public-safety scanner 필요 여부를 release-readiness 기준으로 판단한다.

### 4.2 B - Visual Evidence Baseline

주요 표면:

- `front/tests/e2e/admin-analytics.spec.ts`
- `front/tests/e2e/host-club-operations.spec.ts`
- member route E2E 또는 route-mocked Playwright spec
- `docs/development/test-guide.md`
- `docs/showcase/engineering-confidence.md`
- `docs/showcase/operational-proof.md`

범위:

- 첫 대상은 세 화면으로 제한한다.
  - `/admin/analytics`
  - host dashboard
  - member current-session 또는 member home
- desktop/mobile screenshot artifact를 Playwright `test-results`에 생성한다.
- screenshot은 커밋하지 않는다.
- public-safe route mock, dev fixture, sanitized seed만 사용한다.
- visual evidence는 다음 assertion을 포함한다.
  - screenshot buffer가 비어 있지 않다.
  - 핵심 heading/action/status가 보인다.
  - private-data sentinel이 화면에 없다.
  - mobile viewport에서 primary action과 status가 겹치지 않는다.
- pixel-diff baseline은 별도 policy가 생기기 전까지 non-goal로 둔다. 이 spec에서는 artifact generation과 semantic visual assertion을 gate로 삼는다.

Non-goals:

- 전체 route family의 즉시 visual baseline.
- flaky pixel diff를 CI blocking gate로 바로 올리기.
- screenshot artifact를 repo에 커밋.
- 실제 운영 screenshot 사용.
- visual evidence를 기능 테스트의 대체물로 취급.

Gate:

- 대상 route마다 desktop/mobile evidence가 생성된다.
- 테스트 가이드는 어떤 spec이 어떤 evidence를 남기는지 command 중심으로 설명한다.
- public-safe sentinel이 화면 leak을 잡는다.
- frontend route/user-flow 변경이면 `pnpm --dir front test:e2e` 또는 대상 spec 실행을 명시한다.

### 4.3 C - Member Reading Momentum

주요 표면:

- `front/shared/model/reading-loop.ts`
- `front/features/member-home`
- `front/features/current-session`
- `front/features/archive`
- `front/features/feedback`
- `front/features/host` 중 role-safe shared state를 사용하는 부분
- 필요 시 server member/session read endpoint
- `docs/showcase/*`

범위:

- 멤버의 다음 행동을 product copy와 route action으로 정렬한다.
  - RSVP가 없으면 RSVP.
  - 읽은 분량이나 질문이 없으면 current-session 준비.
  - 참석 후에는 한줄평, 서평, 피드백 확인.
  - 기록이 공개되면 notes/archive/feedback으로 이어지는 action.
- `reading-loop` model은 역할별 next action을 고르는 작은 파생 모델로 유지한다.
- host/admin 상태를 member UI로 직접 import하지 않는다.
- viewer, pending, suspended, non-member 상태는 기존 permission boundary와 같은 의미를 유지한다.
- current-session, notes, archive, feedback 간 link continuity를 명시적으로 테스트한다.
- public showcase는 private workflow를 열지 않고 sanitized evidence와 테스트 경로만 설명한다.

Non-goals:

- admin recovery command를 host/member로 이동.
- 신규 host CRUD 추가.
- raw member email, generated body, transcript, provider raw error 노출.
- 대형 redesign 또는 marketing hero 도입.
- multi-club domain, auth provider, deployment flow 변경.

Gate:

- shared model 변경은 `front/shared/model/reading-loop.test.ts`로 역할별 state를 핀한다.
- member route/model 테스트가 다음 action과 제한 상태를 검증한다.
- route-heavy 변경은 targeted E2E로 smoke한다.
- host/member/admin boundary test가 직접 import나 admin-only signal leak을 막는다.
- 변경된 showcase/docs는 public-safety 기준을 통과한다.

## 5. 아키텍처 경계

Frontend 경계는 기존 route-first 구조를 따른다.

```text
src/app -> src/pages -> features -> shared
```

- `api`: BFF/API calls and response contracts.
- `queries`: TanStack Query keys, loader seeding, invalidation.
- `model`: pure contract normalization, reading-loop derivation, CSV or action helper.
- `route`: loader/action, URL state, query/model composition.
- `ui`: props/callback rendering only.
- `shared/model`: feature-neutral, role-safe helpers만 둔다.

Server 경계는 기존 clean architecture 구조를 따른다.

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

- Contract confidence가 server를 건드릴 때 controller는 HTTP mapping, service는 availability/authorization/domain derivation, adapter는 SQL/row mapping만 소유한다.
- Read-side slice는 mutation port와 write transaction을 갖지 않는다.
- API contract 변경은 frontend schema/fixture/docs와 같이 닫는다.

Docs 경계:

- `docs/development/architecture.md`는 현재 behavior source-of-truth다.
- `docs/showcase/*`는 reviewer-facing evidence map이다.
- `docs/superpowers/*`는 historical planning record이며, 현재 behavior처럼 참조하지 않는다.

## 6. UI 방향

Visual evidence와 reading momentum 모두 ReadMates의 기존 톤을 유지한다.

- Admin은 calm operating ledger다.
- Host는 efficient operating ledger다.
- Member는 personal reading desk다.
- Showcase는 product marketing page가 아니라 reviewer guide다.

원칙:

- 차트나 카드 수를 늘리는 것보다 판단 문장과 다음 행동을 우선한다.
- 색상만으로 상태를 구분하지 않는다.
- 모바일 360px에서 primary action, status, navigation이 겹치지 않는다.
- Korean/English wrapping이 버튼, badge, table cell을 깨지 않게 한다.
- permission limit은 숨기지 않고 짧게 설명한다.

## 7. Public Safety

전 슬라이스 공통으로 다음을 금지한다.

- 실제 멤버 이름, 이메일, private domain, deployment state, OCID, secret, token-shaped example.
- provider raw error, email body, transcript, generated result JSON.
- local absolute path가 public-facing docs나 fixture에 들어가는 것.
- private route를 showcase 때문에 guest에게 여는 것.

테스트와 문서 예시는 `host@example.com`, `https://api.example.com`, synthetic club/session/member 이름처럼 public-safe placeholder를 사용한다.

## 8. 검증

기본 docs 검증:

```bash
git diff --check -- <changed-docs>
```

Frontend 변경:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Zod fixture 변경:

```bash
pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

Server/API contract 변경:

```bash
./server/gradlew -p server clean test
```

Route-heavy 또는 user-flow 변경:

```bash
pnpm --dir front test:e2e
```

Public-facing docs/showcase 변경:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

각 슬라이스 implementation plan은 위 command 중 실제로 필요한 최소 세트를 고르고, 실행하지 못한 검증은 이유와 함께 남긴다.

## 9. 완료 기준

Umbrella 전체 완료 기준:

- A/B/C가 각각 독립 commit 또는 독립 PR로 review 가능한 단위로 닫힌다.
- current source-of-truth docs가 shipped code와 어긋나는 known stale claim을 남기지 않는다.
- 핵심 계약 drift는 fixture/server contract test로 잡힌다.
- visual evidence는 artifact 생성, public-safety sentinel, desktop/mobile coverage를 갖는다.
- member reading momentum은 role-safe state와 next-action tests로 핀된다.
- CHANGELOG `Unreleased`에는 사용자-facing, reviewer-facing, release-readiness 변경이 반영된다.
- release-readiness review는 테스트 통과만이 아니라 public safety, operator surprise, architecture boundary, docs drift를 별도로 확인한다.

## 10. 후속 계획

다음 산출물은 별도 implementation plan이다. 계획은 세 task로 나눈다.

1. Contract confidence sweep.
2. Visual evidence baseline.
3. Member reading momentum.

각 task는 자체 RED/GREEN 검증을 갖고, 앞 task의 gate가 닫히기 전에는 뒤 task를 구현하지 않는다.
