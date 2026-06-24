# ReadMates Route UI Visual Regression Gate Design

작성일: 2026-06-25
상태: APPROVED DESIGN SPEC
대상 표면: frontend component visual regression, design-system quality, test documentation, public release safety

## 1. 배경

ReadMates는 최근 public Lighthouse 진단, host closing board 제품화, admin support/audit 운영 흐름, 모바일 overflow polish를 연속으로 다뤘다. 공통 리스크는 새 기능 부재보다 **이미 만든 핵심 route UI가 작은 레이아웃/copy 변경으로 조용히 깨지는 것**이다.

현재 visual regression 기반은 존재하지만 범위가 좁다.

- `front/playwright-ct.config.ts`가 Playwright component test screenshot baseline을 지원한다.
- `front/__screenshots__/shared/ui/*`에는 shared primitive baseline이 있다.
- `front/__screenshots__/features/host/ui/session-closing-board.ct.tsx/host-closing-board-blocked.png`는 host closing board의 첫 feature-level baseline이다.
- `docs/development/test-guide.md`는 Docker renderer를 canonical baseline 생성 경로로 기록한다.

다음 고도화는 새 visual test framework를 만드는 일이 아니다. 기존 CT harness를 route-critical UI 조각으로 확장해, 최근 실제로 자주 바뀐 운영/공개 화면의 regressions를 작고 반복 가능한 gate로 잡는다.

## 2. 목표

성공 기준:

- Route 전체 E2E screenshot이 아니라 props-driven UI component snapshot을 중심으로 baseline을 확장한다.
- Admin support/audit, host closing board, public records/session 중 implementation 범위에서 고른 핵심 UI 조각을 visual regression 대상으로 추가한다.
- Fixture와 screenshot baseline은 public-safe 값만 사용한다.
- Docker `mcr.microsoft.com/playwright:v1.60.0-jammy` 경로를 canonical baseline 생성 경로로 유지한다.
- Public release candidate가 `front/__screenshots__` baseline을 계속 제외하는지 영향을 확인한다.
- Frontend route-first 경계와 design identity를 유지한다.

## 3. Non-goals

- 새 visual regression SaaS 또는 이미지 diff 서비스를 도입하지 않는다.
- Lighthouse 점수 gate를 CI hard gate로 승격하지 않는다.
- 전체 route screenshot을 대량으로 커밋하지 않는다.
- Server API contract, DB migration, auth/BFF, OAuth, deploy workflow를 변경하지 않는다.
- 실제 멤버 데이터, private email/domain, deployment state, secret, token-shaped value를 fixture나 baseline에 넣지 않는다.
- UI redesign이나 정보 구조 재설계를 이번 범위에 포함하지 않는다.

## 4. 선택한 접근

선택한 접근은 **route-critical UI component visual gate 확장**이다.

검토한 대안:

1. **Server read-model query budget 2차 하드닝**
   - 장점: 데이터 증가에 따른 N+1과 plan drift를 더 빨리 잡는다.
   - 단점: 최근 반복된 UI overflow/copy/hierarchy 회귀를 직접 막지 못한다.

2. **Authenticated Lighthouse route group 확장**
   - 장점: 이미 만든 Lighthouse diagnostic harness를 더 넓게 활용한다.
   - 단점: dev-seed/auth noise, route entry failure, local Lighthouse noise 분류가 먼저 필요해 첫 implementation 범위가 커진다.

3. **Route-critical UI component visual gate 확장** - 추천
   - 장점: 현재 CT harness를 재사용하고, 최근 실제 defect 유형과 잘 맞으며, server/API 변경 없이 품질 신뢰도를 올린다.
   - 단점: route data loading, auth, BFF 흐름은 검증하지 않으므로 필요한 경우 E2E evidence와 함께 써야 한다.

## 5. Architecture

기존 frontend boundary를 유지한다.

```text
route module
  -> model/query/api composition
  -> ui component props
  -> Playwright CT fixture mount
  -> committed PNG baseline
```

Visual gate는 UI component의 rendering contract만 고정한다. Route loader, BFF proxy, auth guard, server data fetch는 이 gate의 책임이 아니다.

책임 분리:

- Feature `ui` directories: snapshot 대상. props/callback driven이어야 하며 API 호출을 직접 하지 않는다.
- Feature `model` directories: snapshot fixture를 만들 때 필요한 순수 상태 계산을 제공할 수 있다.
- Feature `route` directories: CT 대상이 아니다. route data orchestration은 기존 route tests/E2E가 담당한다.
- `shared/ui`: primitive baseline은 계속 shared surface에 둔다.
- `front/__screenshots__`: committed visual baseline 저장소. public release candidate에는 포함하지 않는다.

## 6. Component Scope

첫 implementation은 아래 우선순위에서 작은 묶음을 고른다.

### 6.1 Admin Support/Audit

대상 후보:

- `/admin/support`의 support grant risk review 또는 selected-result state.
- `/admin/audit`의 operation summary/detail panel.

선정 이유:

- 운영자가 판단해야 하는 copy와 state badge가 밀집되어 있다.
- 최근 route polish에서 initial/loading/no-result/result/selected-result 상태가 명확히 분리되었다.
- 모바일에서 spacing, wrapping, overflow 회귀가 나기 쉽다.

요구사항:

- UI component가 route와 강하게 결합되어 있으면, API 호출 없는 presentation 단위로만 작게 분리한다.
- Fixture에는 masked/public-safe actor, reason preset, safe operation label만 둔다.
- Raw email, raw metadata JSON, provider raw error, private support context를 넣지 않는다.

### 6.2 Host Closing Board

대상 후보:

- 기존 `front/features/host/ui/session-closing-board.ct.tsx` 확장.
- blocked/action-required 외 ready/resolved/published 상태 중 하나.

선정 이유:

- 이미 feature-level baseline이 있어 incremental expansion 비용이 낮다.
- host board는 checklist, 상태 badge, next action, evidence ledger가 함께 있어 regression signal이 크다.
- admin closing-risk repair link의 목적지가 되는 핵심 운영 표면이다.

요구사항:

- 기존 CT fixture pattern을 재사용한다.
- 새 상태가 실제 model type과 맞아야 한다.
- Copy가 길어지는 상태를 우선해 wrapping regressions를 잡는다.

### 6.3 Public Records/Session

대상 후보:

- Public latest-record card.
- Public session summary/detail card.
- Public archive link/card region.

선정 이유:

- 최근 Lighthouse closeout에서 public accessible name과 metadata 품질을 개선했다.
- Public route는 guest-facing 첫인상이고, literary journal identity가 중요하다.
- Server/auth 없이 deterministic fixture로 렌더링하기 쉽다.

요구사항:

- Route 안에만 존재하는 JSX가 너무 크면 작은 presentation component로 분리한다.
- Public copy, title, card hierarchy, link accessible name이 baseline에 드러나야 한다.
- Book/session fixture는 public-safe sample만 쓴다.

## 7. Fixture And Snapshot Policy

Fixture 원칙:

- Public-safe Korean copy와 sample club/session/book values만 사용한다.
- UUID는 placeholder/dev-seed style 값만 사용한다.
- 실제 멤버 이메일, private domain, deployment state, token-shaped value, raw feedback body, provider raw error, transcript는 금지한다.
- Data unavailable, blocked, ready처럼 운영 판단이 갈리는 상태를 우선한다.

Snapshot 원칙:

- Baseline PNG는 matching feature path under `front/__screenshots__/features/` 또는 shared path under `front/__screenshots__/shared/` 아래에 둔다.
- Generated E2E screenshot은 release evidence artifact로만 사용하고 commit하지 않는다.
- macOS 로컬 renderer로 생성한 PNG는 커밋하지 않는다.
- Docker renderer로 생성한 baseline만 canonical으로 취급한다.
- Snapshot이 자주 깨지는 animation, clock, caret, random value는 fixture에서 제거한다.

## 8. Error Handling And Safety

CT failure는 제품 regression 후보로 다룬다. 단, renderer drift와 fixture drift를 구분한다.

- Pixel diff가 발생하면 먼저 실제 UI 변경인지 fixture/baseline drift인지 확인한다.
- 의도한 UI 변경이면 Docker 경로로 baseline을 갱신하고 변경 이유를 commit message 또는 PR 설명에 남긴다.
- 의도하지 않은 overflow, clipped text, missing state, hierarchy collapse면 product code를 고친다.
- CT가 환경 문제로 실행되지 않으면 통과로 포장하지 않고 skipped validation과 residual risk로 기록한다.

Public release safety:

- `front/__screenshots__` baseline은 repo에 남지만 public release candidate에는 포함하지 않는다.
- 이번 작업이 screenshot path, release candidate copy rules, public scanner rules에 닿으면 `build-public-release-candidate`와 `public-release-check`를 실행한다.
- Historical `docs/superpowers` raw planning note 외에 current source-of-truth doc을 바꿀 때는 해당 guide와 scanner 기대치를 함께 확인한다.

## 9. Testing

Targeted visual:

```bash
pnpm --dir front test:ct
pnpm --dir front test:ct:update:docker
```

Frontend standard checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Docs and whitespace:

```bash
git diff --check
```

Public release safety, required only if screenshot exclusion or release-candidate packaging is touched:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Full E2E is not required for pure CT fixture/baseline work. Run targeted E2E if implementation changes route behavior, BrowserRouter ordering, auth/BFF behavior, or user-facing route composition.

## 10. Acceptance Criteria

- At least one new route-critical UI visual baseline is added or an existing feature-level CT baseline is meaningfully expanded.
- The selected component is props-driven and does not fetch data directly.
- Fixtures are public-safe and deterministic.
- Docker-generated baseline policy is documented or unchanged.
- Frontend checks and targeted CT commands are run or explicitly reported as skipped with reason.
- Public release candidate screenshot exclusion is not weakened.
- Final implementation report names changed frontend surface, checks run, skipped validation, and residual risk.

## 11. Spec Self-review

- Placeholder scan: no unfinished markers or incomplete file paths remain.
- Internal consistency: the design expands existing Playwright CT visual gates and does not introduce Lighthouse or E2E as the primary mechanism.
- Scope check: this is one implementation plan, limited to frontend visual regression confidence and release-safety verification.
- Ambiguity check: component scope, fixture rules, baseline policy, testing commands, and non-goals are explicit.
