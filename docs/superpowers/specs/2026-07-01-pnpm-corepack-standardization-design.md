# ReadMates pnpm Corepack Standardization Design

작성일: 2026-07-01
상태: APPROVED DESIGN SPEC
대상 표면: package-manager configuration, GitHub Actions CI/deploy workflows, pre-push scripts, contributor docs

## 1. 배경

ReadMates는 루트 `package.json`과 `front/package.json`에 `packageManager: "pnpm@10.33.0"`을 선언한다. GitHub Actions CI와 frontend deploy workflow도 `pnpm@10.33.0`을 설치한다. 최근 pre-push 점검은 로컬 PATH의 다른 pnpm major version이 먼저 실행되면서 lockfile/config 해석 차이로 실패했고, 이를 막기 위해 `scripts/pre-push-check.sh`가 `npx --yes pnpm@10.33.0`을 직접 사용하도록 보강되었다.

이 조치는 main push 안정화에는 맞지만, 장기적으로는 버전 문자열이 여러 위치에 복제된다. 다음 pnpm 업그레이드 때 루트 package manager 선언, CI 설치 step, pre-push helper, 문서 중 하나라도 빠지면 CI parity가 다시 깨질 수 있다.

따라서 장기 방향은 두 단계다.

1. pnpm 10.33.0을 유지한 채 Corepack 기반 실행으로 표준화한다.
2. 이후 별도 마이그레이션에서 pnpm 11로 올리고 lockfile/config/CI를 함께 검증한다.

## 2. 목표

성공 기준:

- 루트 `package.json`의 `packageManager`가 package manager version의 단일 출처가 된다.
- CI, deploy, local pre-push가 같은 package manager resolution path를 사용한다.
- `pnpm@10.33.0` 문자열 복제를 줄여 다음 업그레이드 누락 가능성을 낮춘다.
- pnpm 11 전환은 Phase 1에 섞지 않고 별도 Phase 2 작업으로 명시한다.
- lockfile/install/build/test command는 Corepack 경로로 실행해 CI와 로컬의 package manager 차이를 줄인다.
- 실패 시 어떤 단계가 package manager activation 문제인지, lockfile 문제인지, 실제 test failure인지 구분하기 쉽다.

## 3. Non-goals

- Phase 1에서 pnpm 11로 업그레이드하지 않는다.
- Phase 1에서 dependency version, lockfile resolution, package override policy를 바꾸지 않는다.
- Phase 1에서 frontend/server 제품 코드, API contract, DB migration, auth/BFF behavior를 바꾸지 않는다.
- GitHub Actions runner image, Node major version, Gradle configuration, deploy platform behavior를 바꾸지 않는다.
- Corepack이 없는 아주 오래된 Node 환경까지 지원하기 위한 별도 package manager installer를 만들지 않는다.

## 4. 검토한 접근

### 접근 A: 현재 방식 유지

`npx --yes pnpm@10.33.0`을 pre-push와 문서에 계속 사용하고, CI는 `npm install --global pnpm@10.33.0`을 유지한다.

장점은 즉시 안정적이고 단순하다는 점이다. 단점은 version source가 계속 흩어진다는 점이다. pnpm 11로 올릴 때 CI와 script 중 하나가 오래된 버전을 사용할 가능성이 남는다.

### 접근 B: Corepack 표준화 후 pnpm 11 별도 전환 - 추천

Phase 1에서 `packageManager`를 기준으로 Corepack을 활성화하고, CI/deploy/pre-push가 같은 pnpm version을 쓰게 한다. Phase 2에서 pnpm 11 전환을 별도 변경으로 수행한다.

장점은 안정화와 major upgrade를 분리할 수 있다는 점이다. Phase 1은 behavior-preserving infrastructure cleanup이고, Phase 2는 lockfile/config migration으로 명확히 나뉜다. 단점은 두 번의 작업이 필요하다는 점이다.

### 접근 C: 바로 pnpm 11 전환

`packageManager`를 pnpm 11로 바꾸고 lockfile/config/CI를 한 번에 갱신한다.

장점은 최종 상태에 빠르게 도달한다는 점이다. 단점은 package manager activation 문제와 pnpm 11 migration 문제가 한 diff에 섞인다. 실패가 나면 원인이 local activation인지, lockfile format인지, pnpm config migration인지 분리하기 어렵다.

## 5. 선택한 설계

선택한 설계는 **Corepack 표준화를 먼저 완료하고, pnpm 11은 별도 migration으로 진행**하는 방식이다.

Phase 1의 원칙:

- Canonical source: 루트 `package.json`의 `packageManager`.
- CI activation: GitHub Actions job은 Node 설치 후 Corepack을 활성화하고 루트 `packageManager` 기준 pnpm을 실행한다.
- Local activation: pre-push는 global PATH의 `pnpm`을 신뢰하지 않고 Corepack 경로 또는 packageManager-derived command를 사용한다.
- Documentation: contributor-facing command는 일반 작업과 CI parity 작업을 구분한다.
- Verification: Phase 1은 기존 pnpm 10.33.0 lockfile을 그대로 사용해 install/lint/test/build/pre-push가 통과해야 한다.

Phase 2의 원칙:

- `packageManager` version 변경, pnpm config 위치 정리, lockfile 갱신, CI 검증을 한 migration으로 묶는다.
- Phase 1에서 만든 Corepack path 덕분에 pnpm 11 전환 diff는 version/config/lockfile 중심으로 좁아진다.
- Phase 2 실패 시 Phase 1 상태로 되돌리기 쉽다.

## 6. Architecture

```text
package.json
  packageManager: pnpm@10.33.0
        |
        v
Corepack activation
        |
        +-- GitHub Actions CI jobs
        +-- GitHub Actions deploy jobs
        +-- scripts/pre-push-check.sh
        +-- contributor docs and AGENTS guidance
```

책임 분리:

- `package.json`: package manager identity의 단일 출처.
- `.github/workflows/*`: runner에서 Node와 Corepack을 준비하고, repo-defined pnpm으로 install/test/deploy checks를 실행한다.
- `scripts/pre-push-check.sh`: local/global pnpm version drift를 흡수하고 CI와 같은 package manager path로 frontend checks를 실행한다.
- `scripts/README.md`, `AGENTS.md`, `docs/agents/*`: 언제 Corepack path를 써야 하는지와 어떤 명령이 CI parity를 보장하는지 설명한다.
- `pnpm-lock.yaml`: Phase 1에서는 변경하지 않는 것이 기대값이다. Phase 2에서만 lockfile migration을 허용한다.

## 7. Phase 1 Design: Corepack Standardization

### CI/deploy workflows

현재 workflow는 job마다 `npm install --global pnpm@10.33.0`을 반복한다. Phase 1은 이를 Corepack activation step으로 바꾼다.

목표 형태:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
```

단, implementation에서는 중복 버전 문자열을 최소화해야 한다. 가능한 선택지는 다음과 같다.

- `corepack prepare "$(node -p "require('./package.json').packageManager")" --activate`
- 또는 workflow-level `PNPM_VERSION` env를 두고 packageManager sync check를 추가

선호안은 packageManager를 직접 읽는 방식이다. 그래야 CI workflow가 package manager version의 두 번째 source가 되지 않는다.

### pre-push script

`scripts/pre-push-check.sh`는 하드코딩된 `pnpm@10.33.0` 대신 루트 `package.json`에서 `packageManager` 값을 읽어 실행 command를 만든다.

필요한 behavior:

- `packageManager`가 없거나 `pnpm@...` 형식이 아니면 빠르게 실패한다.
- Corepack 사용 가능 여부를 확인하고, 사용 가능하면 Corepack으로 pnpm을 활성화한다.
- global PATH의 다른 pnpm major version이 먼저 잡혀도 pre-push 결과가 흔들리지 않는다.
- `--dry-run` 출력에는 실제 실행될 package manager command가 보여야 한다.

### docs and agent guidance

문서는 다음처럼 정리한다.

- 일반 개발자는 Node 24 환경에서 Corepack을 활성화한 뒤 `pnpm --dir front ...`를 사용한다.
- CI parity, lockfile/install/build/pre-push 관련 작업은 repo-defined package manager를 사용한다.
- `npx --yes pnpm@10.33.0`은 긴급 우회나 Corepack 사용 불가 상황의 fallback으로만 남긴다.

## 8. Phase 2 Design: pnpm 11 Migration

Phase 2는 Phase 1이 main에 안착한 뒤 별도 branch/PR로 진행한다.

작업 범위:

- 루트 `package.json`의 `packageManager`를 pnpm 11 target version으로 변경한다.
- `front/package.json`의 중복 `packageManager` 유지 여부를 결정한다. monorepo root가 canonical source이면 제거하거나 sync check를 둔다.
- pnpm 11에서 더 이상 권장되지 않거나 다르게 해석되는 config를 정리한다.
- lockfile을 pnpm 11로 재생성한다.
- CI/deploy/pre-push가 Phase 1의 Corepack path를 통해 pnpm 11을 실행하는지 확인한다.
- dependency override와 `onlyBuiltDependencies`가 pnpm 11에서 의도대로 적용되는지 검증한다.

Phase 2의 merge 조건:

- `pnpm install --frozen-lockfile`가 clean checkout 기준 통과한다.
- frontend lint/test/build/coverage가 통과한다.
- design system checks와 E2E가 통과한다.
- public release candidate check가 통과한다.
- pnpm 10과 pnpm 11이 섞여 실행된 evidence가 없어야 한다.

## 9. Error Handling

Phase 1에서 구분해야 할 실패 유형:

- **Corepack unavailable**: Node 환경이 기대보다 오래되었거나 Corepack이 비활성 상태다. 해결 메시지는 Node/Corepack 준비로 안내한다.
- **Invalid packageManager**: 루트 `package.json`의 `packageManager`가 없거나 `pnpm@version` 형식이 아니다. CI/pre-push는 즉시 실패한다.
- **Activation failure**: Corepack이 package manager를 활성화하지 못한다. 네트워크 또는 runner cache 이슈로 분리한다.
- **Lockfile mismatch**: package manager는 맞지만 lockfile/config가 현재 source와 맞지 않는다. Phase 1에서는 regression으로 보고 lockfile 변경 없이 원인을 찾는다.
- **Test/build failure**: package manager activation 이후 실제 lint/test/build가 실패한 것이다. package manager 문제와 분리해 다룬다.

pre-push와 CI log는 최소한 package manager source와 resolved pnpm version을 보여야 한다. 단, local absolute path, private domains, secrets, token-shaped values는 출력하지 않는다.

## 10. Testing And Verification

Phase 1 verification:

- `git diff --check -- <changed-files>`
- `shellcheck scripts/pre-push-check.sh`
- `./scripts/pre-push-check.sh --dry-run --no-release`
- `./scripts/pre-push-check.sh --no-release`
- Corepack path로 `pnpm install --frozen-lockfile`
- Corepack path로 `pnpm --dir front lint`
- Corepack path로 `pnpm --dir front test:coverage`
- Corepack path로 `pnpm --dir front build`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- GitHub Actions CI run success after push

Phase 2 verification:

- Phase 1 verification 전체
- lockfile diff review
- pnpm config migration review
- `pnpm list vite esbuild ws js-yaml @babel/core --depth 10 -r` 등 override 적용 evidence
- `npx --yes pnpm@10.33.0` 또는 pnpm 10 fallback이 남아 있지 않은지 targeted scan

## 11. Rollout Plan

1. Phase 1 design/spec 승인.
2. Phase 1 implementation plan 작성.
3. Corepack activation helper와 pre-push command resolution을 구현.
4. CI/deploy workflow의 global pnpm install step을 Corepack 기반으로 변경.
5. docs/agent guidance를 Corepack 기준으로 정리.
6. Phase 1 verification 후 main에 반영.
7. 별도 Phase 2 design/plan 또는 migration PR에서 pnpm 11 전환.

## 12. Remaining Risks

- GitHub Actions에서 Corepack behavior가 runner image나 Node setup action의 세부 동작에 영향을 받을 수 있다. 이를 줄이기 위해 activation command와 resolved pnpm version을 log에 남긴다.
- Docker 기반 Playwright CT script 내부는 container의 Corepack을 사용한다. Phase 1에서 host-side command path를 바꾸더라도 Docker 내부 command가 별도 drift source가 될 수 있으므로 targeted review가 필요하다.
- `front/package.json`의 `packageManager`가 루트와 중복이다. Phase 1에서는 안정성을 위해 유지하되, Phase 2에서 root-only로 줄일지 sync check를 둘지 결정한다.
- pnpm 11은 config 해석과 lockfile expectations가 달라질 수 있다. Phase 2에서만 다루며, Phase 1의 성공을 pnpm 11 readiness로 과장하지 않는다.
