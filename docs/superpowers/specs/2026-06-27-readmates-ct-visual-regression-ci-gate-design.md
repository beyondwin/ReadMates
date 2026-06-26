# ReadMates CT Visual Regression CI Gate Design

작성일: 2026-06-27
상태: APPROVED DESIGN SPEC
대상 표면: GitHub Actions CI, frontend Playwright component tests, visual regression confidence, docs, public release safety

## 1. 배경

ReadMates는 이미 route-critical UI component visual regression 기반을 갖고 있다.

- `front/playwright-ct.config.ts`가 Playwright component test screenshot baseline을 실행한다.
- `front/features/**/**/*.ct.tsx`와 `front/shared/ui/*.ct.tsx`가 committed PNG baseline과 연결되어 있다.
- `front/__screenshots__/features/**`에는 host closing board, platform-admin support, public records 같은 feature-level baseline이 있다.
- `docs/development/test-guide.md`는 Docker `mcr.microsoft.com/playwright:v1.60.0-jammy` 경로를 canonical baseline 생성 경로로 기록한다.

하지만 현재 CI workflow는 frontend lint/unit/build, backend, integration, E2E, public release safety를 실행할 뿐, CT visual baseline drift를 자동으로 검증하지 않는다. 그래서 UI copy, badge wrapping, card spacing, mobile-safe layout 같은 회귀는 사람이 로컬 Docker CT를 실행해야만 잡힌다.

이번 고도화는 새 visual framework를 만드는 일이 아니다. 이미 있는 CT baseline을 CI에서 안정적으로 검증해, “baseline은 repo에 있지만 자동 gate는 없음” 상태를 닫는다.

## 2. 목표

성공 기준:

- GitHub Actions CI에 Playwright CT visual regression 검증 job을 추가한다.
- CI는 baseline을 갱신하지 않고 committed baseline과 현재 렌더 결과를 비교만 한다.
- Baseline 갱신 경로는 계속 `pnpm --dir front test:ct:update:docker`로 유지한다.
- 실패 시 Playwright CT report, test-results, screenshot diff artifact를 업로드해 원인을 확인할 수 있게 한다.
- CI job은 기존 frontend route-first 경계, server API contract, DB migration, auth/BFF, OAuth, deploy workflow behavior를 바꾸지 않는다.
- `front/__screenshots__`가 public release candidate에서 계속 제외되는지 검증한다.

## 3. Non-goals

- 새 route-critical baseline을 대량 추가하지 않는다.
- UI redesign, layout polish, copy rewrite를 이번 범위에 포함하지 않는다.
- Lighthouse diagnostic을 CI hard gate로 승격하지 않는다.
- 전체 route E2E screenshot diff를 도입하지 않는다.
- 외부 visual regression SaaS를 도입하지 않는다.
- Server code, DB migration, BFF/OAuth proxy, deploy-front/deploy-server workflow behavior를 변경하지 않는다.
- macOS 로컬 렌더 결과로 baseline을 갱신하거나 커밋하지 않는다.

## 4. 선택한 접근

선택한 접근은 **기존 CT baseline의 CI 검증 승격**이다.

검토한 대안:

1. **계속 로컬 Docker CT만 사용**
   - 장점: CI 시간이 늘지 않고 renderer control이 현재 문서와 동일하다.
   - 단점: baseline drift가 PR에서 자동으로 잡히지 않는다. 최근 UI confidence 작업의 남은 약점이 그대로 남는다.

2. **CI에서 기존 CT baseline만 검증** - 추천
   - 장점: 새 UI scope를 넓히지 않고 현재 회귀 감지 체계를 자동화한다. 실패 artifact를 붙이면 리뷰어가 drift와 의도한 변경을 구분할 수 있다.
   - 단점: CI 시간이 늘고 Playwright CT/Vite/React 조합의 환경 안정성을 확인해야 한다.

3. **Lighthouse와 CT를 함께 CI gate로 승격**
   - 장점: visual drift와 route quality를 한 번에 감시한다.
   - 단점: Lighthouse는 dev-server-only noise와 route data failure 분류가 필요하므로 hard gate로 바로 올리기에는 false failure 위험이 크다.

## 5. Architecture

CI 검증 흐름:

```text
.github/workflows/ci.yml
  -> frontend-visual-regression job
  -> checkout, Node 24, pnpm 10.33.0, dependencies
  -> Playwright CT browser/runtime setup
  -> pnpm --dir front test:ct
  -> compare current render with front/__screenshots__ baselines
  -> upload report artifacts on failure
```

책임 분리:

- `front/*.ct.tsx`: rendering contract를 검증하는 source test.
- `front/__screenshots__`: committed baseline source of truth.
- `.github/workflows/ci.yml`: drift detection만 담당하고 baseline을 갱신하지 않는다.
- `front/package.json`: 필요한 경우 CI용 script alias만 추가한다. Baseline update script는 기존 Docker 경로를 유지한다.
- `docs/development/test-guide.md`: 로컬 갱신과 CI 검증의 역할 차이를 설명한다.
- `docs/development/release-readiness-review.md`: 기존 “CT 시각 회귀 CI 미통합” residual risk를 닫은 evidence를 기록한다.
- `CHANGELOG.md`: 테스트/품질 게이트 변경으로 기록한다.

CI job은 frontend app runtime, route loader, BFF proxy, auth guard, server data fetch를 검증하지 않는다. 이 책임은 기존 unit/E2E/backend jobs가 유지한다.

## 6. CI Job Policy

Job 이름은 기존 CI 구조와 맞게 명확해야 한다. 예:

```yaml
frontend-visual-regression:
  name: Frontend visual regression
```

실행 원칙:

- `pull_request`와 `main` push에서 실행한다.
- 기존 frontend job과 병렬 실행한다.
- CI는 snapshot update flag를 사용하지 않는다.
- 실패 artifact는 `front/playwright-report`, `front/test-results`, CT diff output을 포함한다.
- dependency install은 기존 frontend job의 Node/pnpm version과 맞춘다.
- 가능한 경우 `pnpm install --frozen-lockfile`을 사용한다.

Renderer 원칙:

- CI Linux runner의 renderer를 기준으로 검증한다.
- Baseline 갱신은 Docker `test:ct:update:docker` 경로만 canonical이다.
- CI 렌더와 Docker baseline 사이에 반복 diff가 발생하면 product code보다 renderer/package mismatch를 먼저 조사한다.
- 안정성이 확인되기 전에는 CT job을 기존 baseline 범위로만 제한한다.

## 7. Data Flow

정상 변경:

```text
developer changes UI intentionally
  -> local Docker update command refreshes baseline
  -> changed .ct.tsx / PNG baseline reviewed together
  -> CI test:ct passes
```

회귀 변경:

```text
developer changes UI accidentally
  -> committed baseline remains unchanged
  -> CI test:ct detects screenshot diff
  -> artifact shows changed pixels
  -> developer fixes UI or intentionally updates baseline through Docker path
```

환경 문제:

```text
CI CT boot/install/render fails before useful diff
  -> treat as CI infrastructure issue
  -> inspect Playwright/Vite/browser dependencies
  -> do not update baselines to hide the failure
```

## 8. Error Handling And Safety

CT failure categories:

- **Intentional UI change**: update baseline through `pnpm --dir front test:ct:update:docker`, review PNG diff, record reason.
- **Unintentional product regression**: fix UI or fixture until current render matches baseline.
- **Fixture drift**: update deterministic fixture data only if product state names/types changed intentionally.
- **Renderer drift**: align CI runtime with canonical Docker renderer or document the limitation before making the job required.
- **Infrastructure failure**: fix CI setup. Do not claim visual regression passed if CT did not execute.

Public release safety:

- `front/__screenshots__` remains tracked in the private working repo but excluded from `.tmp/public-release-candidate`.
- Workflow/doc/script changes require public release candidate build and scan.
- Artifact upload paths must not include secrets, real member data, private domains, local absolute paths, deployment state, OCIDs, or token-shaped examples.
- Baseline fixtures must remain public-safe synthetic data.

## 9. Testing

Design/spec verification:

```bash
git diff --check -- docs/superpowers/specs/2026-06-27-readmates-ct-visual-regression-ci-gate-design.md
```

Implementation verification should include:

```bash
pnpm --dir front test:ct
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Because CI workflow and public release candidate contents are touched, implementation closeout should also run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

If workflow behavior changes, inspect the CI workflow syntax with the existing script gates:

```bash
bash -n scripts/*.sh deploy/oci/*.sh
shellcheck scripts/*.sh deploy/oci/*.sh
```

Full frontend E2E is not required solely for CT CI wiring because no user route behavior changes. Run targeted or full E2E only if implementation also changes route composition, BrowserRouter behavior, BFF/auth behavior, or user-facing UI code.

## 10. Acceptance Criteria

- CI includes a dedicated visual regression job or equivalent step that runs Playwright CT without updating snapshots.
- Existing committed CT baselines are validated automatically on pull requests and `main` pushes.
- CI failure artifacts make screenshot drift diagnosable.
- Baseline update policy remains Docker-only and documented.
- Public release candidate still excludes `front/__screenshots__`.
- No server API contract, DB migration, auth/BFF token, OAuth scope, deploy image behavior, or user route behavior changes are introduced.
- CHANGELOG and release-readiness docs record the confidence gate change and residual risk status.
- Verification commands are run or explicitly reported as skipped with exact reasons.

## 11. Spec Self-review

- Placeholder scan: no TBD/TODO markers or incomplete file paths remain.
- Internal consistency: the design promotes existing Playwright CT visual baselines to CI verification and does not introduce Lighthouse or E2E as the primary mechanism.
- Scope check: this is one implementation plan, limited to CI wiring, docs, and public-release safety verification.
- Ambiguity check: CI behavior, baseline update policy, artifact expectations, testing commands, and non-goals are explicit.
