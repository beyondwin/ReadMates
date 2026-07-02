# ReadMates CT Docker Corepack Design

작성일: 2026-07-02
상태: APPROVED DESIGN SPEC
대상 표면: frontend Playwright component tests, Docker CT scripts, package-manager activation, CI/docs tooling

## 1. 배경

ReadMates는 Playwright component test 기반의 route-critical visual regression gate를 이미 갖고 있다.

- `front/playwright-ct.config.ts`가 committed screenshot baseline을 검증한다.
- `front/__screenshots__/shared/ui/**`와 `front/__screenshots__/features/**`가 Docker renderer 기준 baseline을 보관한다.
- `front/package.json`은 `test:ct:docker`와 `test:ct:update:docker`를 제공한다.
- GitHub Actions의 `Frontend visual regression` job은 `pnpm test:ct:docker`를 실행한다.

최근 pnpm/Corepack 표준화로 CI, deploy, pre-push는 루트 `package.json`의 `packageManager`를 기준으로 pnpm을 활성화한다. 그러나 CT Docker scripts는 아직 inline shell command 안에서 컨테이너 내부 `corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts`를 직접 실행한다. 이 경로는 동작하지만, repo-defined pnpm activation 규칙과 install 정책이 script 문자열에 숨어 있고, Docker CT 실행 뒤 host dependency state가 Linux optional dependency로 오염될 수 있다는 release-readiness residual이 남아 있다.

이번 고도화는 새 visual regression 체계를 만들지 않는다. 목표는 기존 CT Docker path를 Corepack 표준화 이후의 package-manager 정책과 맞추고, baseline 검증/갱신 경로를 더 예측 가능하게 만드는 것이다.

## 2. 목표

성공 기준:

- `test:ct:docker`와 `test:ct:update:docker`가 루트 `package.json`의 `packageManager`를 package-manager source of truth로 사용한다.
- 컨테이너 내부 pnpm version이 repo-defined pnpm version과 다르면 즉시 실패한다.
- Docker CT 검증과 baseline update가 같은 helper path를 공유하고, update 여부만 명시적으로 갈린다.
- 일반 검증 command는 screenshot baseline을 갱신하지 않는다.
- Docker CT 실행이 host `node_modules`를 Linux dependency state로 바꾸는 위험을 줄이거나, 피할 수 없는 경우 복구/주의 경계를 명확히 문서화한다.
- CI workflow는 기존 job 구조를 유지하면서 helper 기반 CT path를 사용한다.
- `docs/development/test-guide.md`, `docs/development/release-readiness-review.md`, 필요한 경우 `docs/showcase/engineering-confidence.md`가 같은 실행 모델을 설명한다.

## 3. Non-goals

- 새 screenshot baseline을 추가하지 않는다.
- UI layout, copy, design system primitive, route composition을 바꾸지 않는다.
- Lighthouse diagnostic, Playwright E2E screenshot evidence, external visual regression SaaS를 이번 범위에 포함하지 않는다.
- Server API, DB migration, BFF/OAuth proxy, auth/session behavior, deploy image workflow를 변경하지 않는다.
- pnpm 11 migration을 이번 작업에 포함하지 않는다.
- CT 실행 시간을 줄이기 위한 caching/parallelism 최적화를 이번 목표로 삼지 않는다.

## 4. 검토한 접근

### 접근 A: Inline Docker command 유지

현재 `front/package.json`의 긴 Docker command를 유지하고 문서만 보강한다.

장점은 구현이 거의 없다는 점이다. 단점은 package-manager activation, install, Playwright 실행 정책이 script 문자열에 계속 묶여 있어 다음 pnpm migration이나 Playwright image 갱신 때 drift가 다시 생긴다.

### 접근 B: Helper script로 CT Docker path 표준화 - 추천

`front/package.json`의 Docker CT scripts를 작은 helper로 위임한다. helper는 루트 `packageManager`를 읽고, 컨테이너 안에서 Corepack으로 같은 pnpm을 활성화한 뒤 CT를 실행한다. `test:ct:docker`와 `test:ct:update:docker`는 같은 helper에 `--update` 여부만 넘긴다.

장점은 정책이 한 곳에 모이고, CI와 로컬이 같은 path를 탄다는 점이다. 단점은 helper script와 focused tests/docs가 필요하다.

### 접근 C: 완전 분리된 Docker workspace/volume로 전환

Docker CT가 host workspace의 `node_modules`를 전혀 건드리지 않도록 temp copy 또는 Docker volume 기반 install로 전환한다.

장점은 host dependency 오염을 가장 확실히 막는다는 점이다. 단점은 CI 시간, pnpm store/cache, snapshot output sync, baseline update path가 복잡해진다. 이번 작업의 목표는 재현성 정렬이지 Docker caching 재설계가 아니므로 1차 범위로는 과하다.

## 5. 선택한 설계

선택한 설계는 **helper script를 통한 CT Docker path 표준화**다.

원칙:

- 루트 `package.json`의 `packageManager`가 Docker CT pnpm version의 단일 출처다.
- `front/package.json` scripts는 정책을 직접 담지 않고 helper를 호출한다.
- helper는 update 여부, Docker image, workspace mount, package-manager activation, Playwright command를 명확히 조립한다.
- Docker renderer가 기준이므로 Docker unavailable 상태를 macOS local CT로 대체하지 않는다.
- host `node_modules` 오염은 가능하면 구조적으로 줄인다. 구현 중 과도한 복잡도가 확인되면 문서화된 복구 경계를 둔다.

## 6. Architecture

```text
front/package.json
  test:ct:docker
  test:ct:update:docker
        |
        v
front/scripts/run-ct-docker.ts
        |
        +-- read root package.json packageManager
        +-- docker run mcr.microsoft.com/playwright:v1.60.0-jammy
        +-- container corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate
        +-- container pnpm --version check
        +-- container pnpm install / verify dependencies
        +-- container pnpm exec playwright test --config=playwright-ct.config.ts
        |
        v
front/__screenshots__ committed baselines
```

책임 분리:

- `front/package.json`: developer-facing command names만 제공한다.
- `front/scripts/run-ct-docker.ts`: package-manager activation, Docker command assembly, update flag policy, failure messaging을 소유한다.
- `front/playwright-ct.config.ts`: component test renderer와 screenshot baseline path를 계속 소유한다.
- `.github/workflows/ci.yml`: `pnpm test:ct:docker`를 호출하는 CI entry point를 유지한다.
- `docs/development/test-guide.md`: 로컬 검증, baseline update, Docker renderer policy를 설명한다.
- `docs/development/release-readiness-review.md`: Corepack 표준화 residual 중 Docker CT path review가 닫혔는지 또는 남은 경계를 기록한다.

## 7. Execution Flow

검증 command:

```text
developer or CI
  -> pnpm --dir front test:ct:docker
  -> helper runs Docker CT without snapshot update
  -> committed baselines are compared
  -> failure means product drift, fixture drift, renderer drift, or infrastructure failure
```

Baseline update command:

```text
developer
  -> pnpm --dir front test:ct:update:docker
  -> helper runs Docker CT with update snapshots flag
  -> changed PNG baselines are reviewed and committed only for intentional UI changes
```

CI command:

```text
GitHub Actions frontend-visual-regression job
  -> repo pnpm activation from packageManager
  -> pnpm install --frozen-lockfile
  -> pnpm test:ct:docker
  -> upload Playwright reports on failure
```

CI should not pass `--update` or any equivalent snapshot update flag.

## 8. Error Handling

Failure categories:

- **Invalid packageManager**: 루트 `package.json`의 `packageManager`가 없거나 `pnpm@10.33.0`처럼 pnpm 이름과 version을 함께 담은 형식이 아니면 helper가 실패한다.
- **Corepack activation failure**: 컨테이너 내부 Corepack이 repo-defined pnpm을 활성화하지 못하면 helper가 실패한다.
- **Version mismatch**: 컨테이너 내부 `pnpm --version`이 repo-defined version과 다르면 helper가 실패한다.
- **Docker unavailable**: Docker daemon, image pull, container runtime 문제가 있으면 helper가 실패한다. local host CT로 대체하지 않는다.
- **Install failure**: lockfile/dependency install 문제는 CT 실행 전 실패로 분리한다.
- **Screenshot diff**: Playwright CT가 정상 실행된 뒤 baseline과 current render가 다르면 product/fixture/renderer drift로 취급한다.

로그에는 package manager source와 resolved pnpm version을 남긴다. 단, local absolute path, private domain, secret, token-shaped value, deployment state는 출력하지 않는다.

## 9. Host Dependency Boundary

현재 Docker CT scripts는 host workspace를 컨테이너에 mount하고 컨테이너 내부에서 install을 수행한다. 이 방식은 Docker/Linux optional dependency가 host `node_modules`에 남아 macOS local build나 Lighthouse preview를 방해할 수 있다.

선호 구현은 다음 순서로 검토한다.

1. 컨테이너 install이 host `node_modules`를 덮어쓰지 않는 mount/volume 구조를 사용한다.
2. 위 방식이 snapshot output sync나 CI 시간 측면에서 과도하면 기존 mount 구조를 유지하되, helper와 문서에 host dependency 복구 경계를 명확히 남긴다.
3. 어떤 방식을 선택하든 `test:ct:update:docker`만 committed baseline 변경을 만들 수 있어야 한다.

이번 설계의 acceptance는 host 오염을 완전히 0으로 만드는 것이 아니라, 현재보다 drift source를 줄이고 남은 경계를 명시하는 것이다.

## 10. Testing And Verification

Design/spec verification:

```bash
git diff --check -- docs/superpowers/specs/2026-07-02-readmates-ct-docker-corepack-design.md
```

Implementation verification should include:

```bash
pnpm --dir front test:ct:docker
pnpm --dir front test:ct:update:docker
git status --short -- front/__screenshots__
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

If a helper script is added with unit-testable logic, add focused tests for:

- packageManager parsing
- update flag command assembly
- pnpm version mismatch failure
- Docker command arguments that prevent accidental snapshot update in verification mode

Docs/tooling closeout should also run:

```bash
git diff --check -- front/package.json front/scripts docs/development/test-guide.md docs/development/release-readiness-review.md docs/showcase/engineering-confidence.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
find .tmp/public-release-candidate -path '*__screenshots__*' -print
```

Expected public-candidate screenshot scan result is no output.

## 11. Acceptance Criteria

- `front/package.json` CT Docker scripts delegate to one maintained helper path.
- The helper reads root `packageManager` and verifies the container pnpm version.
- `test:ct:docker` cannot update baselines.
- `test:ct:update:docker` remains the only canonical baseline update path.
- Docker unavailable or package-manager mismatch failures are explicit.
- CI visual regression job continues to use the canonical Docker CT verification path.
- Documentation matches the actual helper behavior and does not overstate host dependency isolation if a residual remains.
- Public release candidate still excludes committed screenshot baselines.
- No product UI, server API, DB migration, auth/BFF, OAuth, release image, or deploy behavior changes are introduced.

## 12. Remaining Risks

- Docker CT remains a relatively heavy check. This design improves reproducibility, not runtime.
- A fully isolated Docker install may require more CI cache and snapshot synchronization work than is worthwhile for this iteration.
- Playwright CT uses an experimental package. If the Vite/React/Playwright combination changes behavior, the helper should surface the failure rather than hiding it with baseline updates.
- pnpm 11 migration remains a separate phase. Passing this work does not prove pnpm 11 readiness.

## 13. Spec Self-review

- Placeholder scan: no placeholder markers or incomplete file paths remain.
- Internal consistency: the design standardizes existing CT Docker execution and does not add UI, server, Lighthouse, or E2E scope.
- Scope check: this is one implementation plan, limited to frontend tooling, CI/docs alignment, and public-release safety verification.
- Ambiguity check: helper responsibilities, update policy, failure categories, host dependency boundary, verification commands, and non-goals are explicit.
