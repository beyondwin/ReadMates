# Release Pipeline Security Readiness Implementation Plan

> **Execution note:** 이 계획은 승인된 설계
> [`2026-08-02-release-pipeline-security-readiness-design.md`](../specs/2026-08-02-release-pipeline-security-readiness-design.md)를 구현한다.
> 현재 권한은 저장소 수정과 로컬 검증까지다. commit, push, PR, tag, GitHub Actions dispatch, secret/config mutation, 실제 배포는 하지 않는다.

**Goal:** 최신 CI 실패와 GitHub HIGH dependency alert를 모두 닫고, 수동 서버 이미지 재실행도 정확한 annotated release tag의 commit만 build/scan/promote하도록 고정하며, active 문서와 배포 runbook을 현재 코드·workflow에 맞춘다.

**Architecture:** 프론트는 React Router v8의 package split(`react-router`, `react-router/dom`)을 명시적인 architecture test로 보호한다. 배포 workflow는 canonical `vMAJOR.MINOR.PATCH` tag를 checkout source, concurrency key, image tag의 단일 출처로 사용하고 annotated tag와 `HEAD` 일치를 fail-closed로 검증한다. 저장소의 Python contract checker가 이 YAML 불변식을 self-test, CI, pre-push, public-release candidate에서 반복 검증한다.

**Tech Stack:** Bash/ShellCheck, Python 3 stdlib, GitHub Actions/actionlint, pnpm 11.13.1 via Corepack, React 19.2.7, React Router 8.3.0, TypeScript 6, Vitest, Vite 8, Playwright, Markdown/public-release scanners.

---

## Global constraints and baseline

- [ ] 시작 시 `git status --short --branch --untracked-files=all`, `git diff --name-only`, `git diff --check`를 다시 실행한다.
- [ ] 현재 사용자 변경인 `front/features/archive/ui/my-page/**`, `front/src/styles/globals.css`, `front/tests/e2e/member-space-information-architecture.spec.ts`와 이후 새로 생긴 dirty path를 보존한다.
- [ ] 아래 Router migration 대상 목록과 dirty path가 겹치면 그 파일은 자동 rewrite하지 않고, 사용자 diff를 먼저 읽어 import 한 줄만 안전하게 분리할 수 있을 때에만 수정한다. 안전하지 않으면 중단하고 보고한다.
- [ ] `python3 scripts/agent-preflight.py --intent release --base origin/main ...`을 예상 변경 경로 전체에 다시 실행한다.
- [ ] `origin/main..HEAD` 전체를 release-readiness 범위로 유지한다. 마지막 계획이나 최신 commit만 검토 범위로 축소하지 않는다.
- [ ] 실제 secret, domain, VM IP, OCID, member data, token-shaped example을 source/docs/log 요약에 추가하지 않는다.
- [ ] dependency 변경은 alert 무시, audit suppression, scanner 완화로 닫지 않는다.
- [ ] 모든 frontend 명령은 `npx --yes corepack@0.35.0 pnpm ...`을 사용해 repository-pinned `pnpm@11.13.1`과 일치시킨다.

## Task 1: 최신 Scripts CI 실패를 최소 수정으로 복구

**Files:**

- Modify: `scripts/run-local-google-oauth-stack.sh`
- Modify: `scripts/verify-local-google-oauth-stack-fixtures.sh`

- [ ] **Step 1: 현재 실패를 그대로 재현한다 (RED)**

Run:

```bash
shellcheck scripts/run-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
```

Expected: `SC2034`가 `attempt` 두 곳과 `now` 한 곳을 지적한다. CI에서 관찰된 ShellCheck 버전은 cleanup의 `A && B || true`에도 `SC2015`를 보고할 수 있다.

- [ ] **Step 2: 의미를 바꾸지 않는 최소 수정만 적용한다**

`scripts/run-local-google-oauth-stack.sh`:

- `local attempt`와 `local now`를 제거한다.
- `for attempt in 1 2 3 4 5`를 `for _ in 1 2 3 4 5`로 바꾼다.
- TERM 대기 5초 뒤 KILL이라는 기존 process-group cleanup 계약을 유지한다.

`scripts/verify-local-google-oauth-stack-fixtures.sh`:

- cleanup의 `[[ -n "$listener_pid" ]] && kill ... || true`를 명시적인 `if [[ -n ... ]]; then kill ... || true; fi`로 바꾼다.
- `for attempt in ...`를 `for _ in ...`로 바꾼다.
- fixture의 INT → 대기 → TERM → wait 순서는 유지한다.

- [ ] **Step 3: fixture와 shell gate를 통과시킨다 (GREEN)**

Run:

```bash
bash scripts/verify-local-google-oauth-stack-fixtures.sh
bash -n scripts/run-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
shellcheck scripts/run-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
```

Expected: 모두 exit 0. 실제 browser, OAuth provider, production credential은 사용하지 않는다.

## Task 2: React Router v8과 HIGH dependency floors를 regression contract로 고정

**Files:**

- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Modify: `front/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: all tracked files returned by `rg -l 'react-router-dom' front/src front/features front/shared front/tests front/vite.config.ts`

- [ ] **Step 1: legacy router package와 잘못된 package split을 거절하는 test를 먼저 추가한다 (RED)**

`front/tests/unit/frontend-boundaries.test.ts`에 literal self-match를 피하도록 다음 상수를 추가한다.

```ts
const legacyRouterPackage = ["react", "router", "dom"].join("-");
const routerPackage = "react-router";
const routerDomEntry = "react-router/dom";
```

다음 helper와 test를 추가한다.

```ts
function hasLegacyRouterPackageReference(source: string) {
  return source.includes(legacyRouterPackage);
}

it("uses the React Router v8 package split without the legacy DOM wrapper", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  expect(packageJson.dependencies?.[routerPackage]).toBe("8.3.0");
  expect(packageJson.dependencies).not.toHaveProperty(legacyRouterPackage);

  const routerContractFiles = [
    ...collectAllSourceFiles(),
    ...collectSourceFiles(path.join(projectRoot, "tests")),
    {
      absolutePath: path.join(projectRoot, "vite.config.ts"),
      displayPath: "front/vite.config.ts",
      relativePath: "vite.config.ts",
    },
  ];

  const violations = routerContractFiles
    .filter((sourceFile) => hasLegacyRouterPackageReference(fs.readFileSync(sourceFile.absolutePath, "utf8")))
    .map((sourceFile) => sourceFile.displayPath);

  expect(violations, violations.join("\n")).toEqual([]);
});
```

`isFeatureModelBoundaryImport`의 framework 금지 목록도 `react`, `react-dom`, `react-router`를 검사하도록 바꿔 v8 전환이 model의 framework independence를 약화하지 않게 한다. `routerDomEntry`는 별도 test fixture에서 `RouterProvider`의 허용 entrypoint를 설명하거나, 사용하지 않으면 선언하지 않는다.

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: direct dependency `react-router-dom@7.18.1`과 현재 source/test/mock/config의 legacy 문자열 때문에 실패한다.

- [ ] **Step 2: dependency floors를 정확한 수정 버전으로 올린다**

`front/package.json`:

```json
"react-router": "8.3.0"
```

기존 `"react-router-dom": "7.18.1"`은 제거한다.

`pnpm-workspace.yaml` overrides:

```yaml
"brace-expansion@>=3.0.0 <5.0.8": 5.0.8
"postcss@<=8.5.17": 8.5.25
```

기존 brace floor `5.0.7`은 교체하며 중복 override를 남기지 않는다.

- [ ] **Step 3: ordinary API import와 DOM provider entrypoint를 기계적으로 분리한다**

먼저 정확한 inventory를 보존한다.

```bash
rg -l 'react-router-dom' front/src front/features front/shared front/tests front/vite.config.ts | sort > .tmp/react-router-v8-files.txt
```

tracked file만 대상으로 `react-router-dom`을 `react-router`로 치환한다. 그 후 아래 21개 `RouterProvider` 사용 파일에서는 `RouterProvider`만 `react-router/dom`의 별도 import로 옮기고, `createMemoryRouter`, `MemoryRouter`, `Route`, `Router`, `Routes`, hook/type은 `react-router`에 둔다.

```text
front/features/archive/route/my-records-route.test.tsx
front/features/archive/ui/member-session-detail-page.test.tsx
front/features/current-session/route/current-session-route-error.test.tsx
front/features/guest-browse/route/guest-scoped-app-route.test.tsx
front/features/host/route/host-session-editor-route.test.tsx
front/features/notifications/route/member-notification-settings-route.test.tsx
front/src/main.tsx
front/tests/unit/current-session.test.tsx
front/tests/unit/feedback-document-route.test.tsx
front/tests/unit/guest-current-session-page.test.tsx
front/tests/unit/host-members.test.tsx
front/tests/unit/host-notifications.test.tsx
front/tests/unit/member-notifications.test.tsx
front/tests/unit/member-session-detail-page.test.tsx
front/tests/unit/notes-feed-page.test.tsx
front/tests/unit/notes-page.test.tsx
front/tests/unit/public-records-page.test.tsx
front/tests/unit/public-session-page.test.tsx
front/tests/unit/route-error-metadata.test.tsx
front/tests/unit/spa-layout.test.tsx
front/tests/unit/spa-router.test.tsx
```

모든 `vi.mock("react-router-dom")`, `importOriginal<typeof import("react-router-dom")>()`, Vite manual chunk regex도 `react-router`에 맞춘다. historical `docs/superpowers/**`와 `docs/reports/**`의 예제는 active code migration 대상이 아니다.

- [ ] **Step 4: lockfile을 repo package manager로만 갱신한다**

Run:

```bash
npx --yes corepack@0.35.0 pnpm install --lockfile-only
```

Expected resolution:

- direct `react-router 8.3.0`, no installed `react-router-dom`
- `brace-expansion 5.0.8` for affected minimatch paths
- `postcss 8.5.25` for affected Vite/Playwright paths

- [ ] **Step 5: package/import contract와 focused frontend를 통과시킨다 (GREEN)**

Run:

```bash
test -z "$(rg -l 'react-router-dom' front/src front/features front/shared front/tests front/vite.config.ts front/package.json || true)"
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
npx --yes corepack@0.35.0 pnpm why -r react-router react-router-dom brace-expansion postcss
npx --yes corepack@0.35.0 pnpm audit --audit-level high
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
```

Expected: legacy package reference 0, boundary test PASS, HIGH audit 0, lint/unit/build PASS. `pnpm why` 출력에서 취약 버전이 남으면 override 범위를 넓히기 전에 실제 dependency path를 다시 진단한다.

## Task 3: 서버 이미지 workflow provenance checker를 TDD로 추가

**Files:**

- Create: `scripts/check-deploy-workflow-contract.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/pre-push-check.sh`
- Modify: `scripts/build-public-release-candidate.sh`
- Modify: `scripts/verify-public-release-fixtures.sh`

- [ ] **Step 1: stdlib self-test harness를 먼저 만들고 production validator 부재를 확인한다 (RED)**

새 checker의 public interface를 다음으로 고정한다.

```py
def validate_deploy_server_workflow(source: str) -> list[str]:
    """Return every missing fail-closed deploy invariant."""

def run_self_tests() -> int:
    """Exercise one valid fixture and independently broken fixtures."""

def main(argv: list[str] | None = None) -> int:
    """Validate --workflow (default deploy-server.yml) or run --self-test."""
```

`argparse`, `pathlib`, `re`, `tempfile`, `unittest`만 사용한다. self-test는 임시 YAML을 만들며 최소한 다음 변형을 각각 실패시킨다.

- branch/`${{ github.ref }}` checkout
- `fetch-depth: 0` 누락
- generic Docker tag regex
- annotated-tag object 검증 누락
- tag commit과 `HEAD` 일치 검증 누락
- concurrency가 canonical tag 대신 `github.ref`를 사용
- scan 대상 digest와 promote 대상 digest 불일치

먼저 test class와 CLI를 작성한 상태에서 validator가 미구현/빈 결과를 반환하게 두고 다음이 실패하는 것을 확인한다.

```bash
python3 -B scripts/check-deploy-workflow-contract.py --self-test
```

- [ ] **Step 2: 명시적인 text-contract validator를 구현한다 (GREEN for fixtures)**

Validator가 다음 불변식을 모두 요구하도록 구현한다.

1. `workflow_dispatch.inputs.image_tag`가 required string이다.
2. canonical tag가 dispatch input 또는 pushed `GITHUB_REF_NAME`에서만 나온다.
3. exact semver regex `^v[0-9]+\.[0-9]+\.[0-9]+$`를 사용한다.
4. checkout ref가 dispatch input 또는 pushed tag를 가리키고 `fetch-depth: 0`이다.
5. `git cat-file -t` 결과가 `tag`여야 한다.
6. `git rev-list -n 1 "$RELEASE_TAG"`와 `git rev-parse HEAD`가 exact match여야 한다.
7. concurrency group이 canonical tag expression을 포함한다.
8. Trivy가 `${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}`를 scan한다.
9. promotion도 같은 `${{ steps.build.outputs.digest }}`를 사용한다.

Run:

```bash
python3 -B scripts/check-deploy-workflow-contract.py --self-test
python3 -B scripts/check-deploy-workflow-contract.py
```

Expected: self-test PASS, 현재 `deploy-server.yml` 실제 검사는 checkout/concurrency/semver/tag provenance 때문에 FAIL.

- [ ] **Step 3: checker를 CI와 local/public gates에 연결한다**

`.github/workflows/ci.yml` Scripts job에서 agent guidance 뒤, apt tool 설치 전에 다음 두 step을 실행한다.

```yaml
- name: Deploy workflow contract self-tests
  run: python3 -B scripts/check-deploy-workflow-contract.py --self-test

- name: Deploy workflow contract
  run: python3 -B scripts/check-deploy-workflow-contract.py
```

`scripts/pre-push-check.sh`에서는 package manager activation 전 fast gate로 추가한다.

```bash
run_step "Deploy workflow contract" python3 -B scripts/check-deploy-workflow-contract.py
```

`scripts/build-public-release-candidate.sh`은 checker를 required file로 복사한다. `scripts/verify-public-release-fixtures.sh`의 required workspace/support file 목록에도 checker와 `.github/workflows/deploy-server.yml`을 추가해 public candidate에서 계약 검사를 재실행할 수 있음을 고정한다.

## Task 4: manual dispatch도 정확한 annotated release tag만 build하도록 workflow 수정

**Files:**

- Modify: `.github/workflows/deploy-server.yml`
- Test: `scripts/check-deploy-workflow-contract.py`

- [ ] **Step 1: canonical tag를 checkout과 concurrency의 단일 출처로 만든다**

Workflow expression은 다음 의미를 갖게 한다.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ inputs.image_tag || github.ref_name }}
```

Checkout은 full history/tag object를 가져온다.

```yaml
with:
  ref: ${{ inputs.image_tag || github.ref }}
  fetch-depth: 0
```

- [ ] **Step 2: build 전에 exact release provenance를 fail-closed로 검증한다**

기존 `Set image name` step을 `Resolve and verify release tag`로 바꾸거나 바로 앞에 provenance step을 추가한다. 핵심 shell contract:

```bash
release_tag="${DISPATCH_IMAGE_TAG:-${GITHUB_REF_NAME}}"
if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release tag: $release_tag" >&2
  exit 1
fi

if [[ "$(git cat-file -t "$release_tag" 2>/dev/null || true)" != "tag" ]]; then
  echo "Release tag must be annotated: $release_tag" >&2
  exit 1
fi

tag_commit="$(git rev-list -n 1 "$release_tag")"
head_commit="$(git rev-parse HEAD)"
if [[ "$tag_commit" != "$head_commit" ]]; then
  echo "Checked out commit does not match release tag: $release_tag" >&2
  exit 1
fi
```

같은 step에서 `name`과 `tag` output을 만든다. 기존 scan candidate digest → Trivy digest scan → 같은 digest release-tag promotion 흐름은 유지한다.

- [ ] **Step 3: static workflow checks를 통과시킨다 (GREEN)**

Run:

```bash
python3 -B scripts/check-deploy-workflow-contract.py --self-test
python3 -B scripts/check-deploy-workflow-contract.py
actionlint .github/workflows/ci.yml .github/workflows/deploy-server.yml .github/workflows/deploy-front.yml .github/workflows/sync-config.yml
```

Expected: 모두 exit 0. Workflow dispatch는 실행하지 않는다.

## Task 5: active 기술 문서와 배포 runbook을 source of truth에 맞춘다

**Files:**

- Modify: `README.md`
- Modify: `docs/agents/front.md`
- Modify: `docs/development/new-developer-onboarding-guide.md`
- Modify: `docs/development/adr/0001-cloudflare-pages-functions-bff.md`
- Review/narrowly modify if phrased as current state: `docs/development/adr/0003-frontend-route-first-architecture.md`
- Modify: `docs/deploy/README.md`
- Modify: `docs/deploy/compose-stack.md`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/release-publish-runbook.md`
- Modify: `docs/operations/runbooks/secrets-management.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `scripts/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: frontend active docs를 Router v8 package split에 맞춘다**

- README tech stack, frontend agent guide, onboarding의 current-state `React Router 7`을 `React Router 8`로 갱신한다.
- current ADR의 stack 표기만 현재 버전으로 갱신한다.
- `docs/superpowers/**`, `docs/reports/**`, 과거 계획의 historical version/import example은 수정하지 않는다.
- ADR-0003의 “v7 도입 당시 결정”처럼 역사적 맥락인 문장은 유지하고, “현재 v7 migration 중”처럼 현재 사실을 주장하는 문장만 v8/data-router 표현으로 고친다.

- [ ] **Step 2: config ownership 문서 오류를 실제 workflow/script에 맞춘다**

다음 source-of-truth를 문서에 명시한다.

- `.github/workflows/sync-config.yml`은 GitHub Secrets/Variables로 `/etc/readmates/readmates.env`만 render/upload한다.
- `deploy/oci/05-deploy-compose-stack.sh`은 operator input `CADDY_SITE`로 `/etc/readmates/caddy.env`를 쓰고, `READMATES_SERVER_IMAGE`로 `/opt/readmates/.env`를 쓴다.
- 따라서 `CADDY_SITE`와 `READMATES_SERVER_IMAGE`는 sync-config inventory가 아니라 compose deployment input이다.
- secret 값이나 live deployment state는 문서에 기록하지 않는다.

- [ ] **Step 3: release runbook에 tag provenance와 manual rerun 계약을 추가한다**

`docs/deploy/release-publish-runbook.md`의 검토일을 실행일로 갱신하고 다음을 명시한다.

- server workflow의 수동 재실행은 `image_tag=vX.Y.Z`를 받고 그 annotated tag 자체를 checkout한다.
- generic Docker tag나 branch checkout은 허용되지 않는다.
- tag object type과 checked-out HEAD mismatch는 build 전에 실패한다.
- pushed tag와 manual dispatch 모두 동일 tag concurrency key를 사용한다.
- scan한 digest와 promote한 digest가 동일해야 다음 OCI/frontend 단계로 갈 수 있다.
- 실패한 이미지는 existing tag를 이동/덮어쓰지 않고 source fix 후 새 patch tag를 사용한다.

`scripts/README.md`와 `docs/deploy/README.md`에는 `python3 -B scripts/check-deploy-workflow-contract.py --self-test` 및 실제 workflow 검사 명령을 추가한다.

- [ ] **Step 4: release-readiness evidence를 실행 시점의 live read-only 상태로 다시 확인한다**

Run (read-only):

```bash
git cat-file -t v2.1.0
git rev-list -n 1 v2.1.0
gh run list --workflow "Deploy Server Image" --branch v2.1.0 --limit 5
gh run list --workflow "Deploy Front" --event workflow_dispatch --limit 10
gh release view v2.1.0 --json tagName,name,url,publishedAt
```

현재 확인값과 달라졌을 수 있으므로 실행 결과만 `docs/development/release-readiness-review.md`에 반영한다. server image 성공, frontend/GitHub Release/production smoke 미완료처럼 단계별 상태를 분리하고 repository/local evidence를 production evidence로 표현하지 않는다.

- [ ] **Step 5: CHANGELOG Unreleased에 운영자 관점 변경을 기록한다**

`Fixed`에는 ShellCheck blocker와 3개 HIGH dependency floor/Router v8 migration을, `Deployment Notes`에는 annotated-tag provenance gate와 same-digest promotion을 추가한다. 아직 실행하지 않은 배포나 GitHub alert closure를 완료됐다고 쓰지 않는다.

- [ ] **Step 6: docs safety와 link/whitespace를 검증한다**

Run:

```bash
git diff --check -- README.md CHANGELOG.md docs scripts/README.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  README.md CHANGELOG.md docs/deploy docs/operations/runbooks/secrets-management.md docs/development/release-readiness-review.md scripts/README.md
python3 -B scripts/check-agent-guidance.py
```

Expected: whitespace/link/guidance checks PASS, private-looking values 0. Placeholder examples만 남는다.

## Task 6: public candidate와 full release evidence를 최종 HEAD에서 수집

**Files:**

- Verify only: all changed files and generated ignored output under `.tmp/`

- [ ] **Step 1: 전체 tracked shell/workflow gate**

Run:

```bash
git ls-files -z -- ':(glob)scripts/**/*.sh' ':(glob)deploy/oci/**/*.sh' | xargs -0 -n 1 bash -n
git ls-files -z -- ':(glob)scripts/**/*.sh' ':(glob)deploy/oci/**/*.sh' | xargs -0 shellcheck
python3 -B scripts/check-deploy-workflow-contract.py --self-test
python3 -B scripts/check-deploy-workflow-contract.py
actionlint .github/workflows/*.yml
```

- [ ] **Step 2: public release candidate를 새로 만들고 scanner를 통과시킨다**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
python3 -B .tmp/public-release-candidate/scripts/check-deploy-workflow-contract.py \
  --workflow .tmp/public-release-candidate/.github/workflows/deploy-server.yml
```

Expected: candidate build, public safety scan, candidate 내부 deploy contract 모두 PASS.

- [ ] **Step 3: Router package 변경의 browser/runtime surface를 검증한다**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

Expected: component tests와 Chromium E2E PASS. 기존 사용자 dirty UI 변경 때문에 현재 checkout에서 독립 재현이 불가능하면 그 사실을 숨기지 말고 exact skipped reason 또는 별도 clean-HEAD evidence로 구분한다.

- [ ] **Step 4: canonical umbrella gate를 최종 변경 상태에서 한 번 실행한다**

Run:

```bash
./scripts/pre-push-check.sh --full --release
```

Expected: CHANGELOG, frontend lint/coverage/build, Zod fixture, server quality/integration, public candidate/gitleaks, E2E, observability gates PASS.

- [ ] **Step 5: completion claim 전에 최종 diff와 dependency evidence를 다시 확인한다**

Run:

```bash
git status --short --branch --untracked-files=all
git diff --check
git diff --stat
git diff --name-only
npx --yes corepack@0.35.0 pnpm audit --audit-level high
npx --yes corepack@0.35.0 pnpm why -r react-router react-router-dom brace-expansion postcss
rg -n 'react-router-dom' front --glob '!node_modules/**' --glob '!dist/**'
```

Expected: only intended files plus untouched user changes are dirty; whitespace clean; HIGH audit 0; legacy active frontend reference 0. GitHub Dependabot UI의 alert closure는 push 후 원격 dependency graph가 갱신되어야 확인 가능하므로 이번 repository-only 완료 증거와 분리한다.

## Handoff and residual-risk format

- Changed surfaces: Scripts CI, frontend dependency/router contract, deploy workflow provenance, active docs/runbooks.
- Evidence: 실제 실행한 command와 pass/fail count를 그대로 기록한다.
- Skipped: 실행하지 못한 command와 원인을 exact하게 기록한다.
- Remaining remote-only gates: push/CI re-run, Dependabot alert refresh, tag workflow, GHCR promotion, frontend/OCI deployment, production smoke.
- Authority boundary: commit/push/PR/tag/deploy는 별도 요청 전까지 실행하지 않는다.
- 사용자 변경 파일은 최종 status에서 별도 목록으로 분리해 이번 작업 결과로 주장하지 않는다.
