# ReadMates Toolchain And Dependency Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align ReadMates on Node 24, pnpm 11.13.1, current compatible frontend/design dependencies, and Gradle 9.6.1 without changing product behavior.

**Architecture:** Keep the root `packageManager`, one shared pnpm lockfile, CI/deploy launchers, Docker CT launcher, and active docs as one package-manager contract. Upgrade frontend/design dependencies in a shared workspace lane, keep TypeScript below 6.1 because the stable `typescript-eslint` peer contract excludes TypeScript 7, and upgrade the server wrapper independently under JDK 25.

**Tech Stack:** Node.js 24, pnpm 11, React 19, Vite 8, Vitest 4, Playwright 1.61, ESLint 10, TypeScript 6.0, jsdom 29, Kotlin/JDK 25, Gradle 9.6.

## Global Constraints

- Node.js repository contract is major 24; do not change the user's machine-wide default Node.
- Root and frontend `packageManager` must be exactly `pnpm@11.13.1`.
- Corepack fallback remains `corepack@0.35.0`.
- `@types/node` remains on major 24.
- TypeScript 7.0.2 is deferred because stable `typescript-eslint@8.64.0` declares `typescript >=4.8.4 <6.1.0`; use TypeScript 6.0.3.
- Preserve JDK 25, Kotlin 2.4.0, Spring Boot 4.0.6, and existing server dependency constraints.
- Do not change product behavior, routes, API, auth, persistence, migrations, or UI.
- Keep generated `graphify-out/**`, build output, coverage, caches, and runtime evidence untracked.
- Do not rewrite historical `docs/superpowers/**`, `docs/reports/**`, or released CHANGELOG verification evidence.

---

### Task 1: Establish The Node 24 And pnpm 11 Contract

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Modify: `front/package.json`
- Modify: `front/tests/performance/ct-docker.test.ts`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/test-guide.md`
- Modify: `scripts/check-agent-guidance.py`
- Modify: `pnpm-lock.yaml` through pnpm 11

**Interfaces:**
- Consumes: CI/deploy Node 24 setup and the existing Corepack-first launcher contract.
- Produces: root `engines`, `.node-version`, synchronized root/frontend `packageManager`, and a pnpm 11 lockfile used by later tasks.

- [ ] **Step 1: Add a failing repository package-manager contract test**

Add these imports to `front/tests/performance/ct-docker.test.ts`:

```ts
import { readFileSync } from "node:fs";

const rootPackageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { packageManager?: string; engines?: { node?: string; pnpm?: string } };
const frontPackageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { packageManager?: string };
```

Add this test before the command-builder tests:

```ts
it("keeps Node and pnpm aligned with the repository contract", () => {
  expect(rootPackageJson.packageManager).toBe("pnpm@11.13.1");
  expect(frontPackageJson.packageManager).toBe(rootPackageJson.packageManager);
  expect(rootPackageJson.engines).toEqual({
    node: "24.x",
    pnpm: "11.13.1",
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: FAIL because the root `packageManager` is still `pnpm@10.33.0` and `engines` is absent.

- [ ] **Step 3: Apply the Node and package-manager contract**

Create `.node-version`:

```text
24
```

Change the root `package.json` header to:

```json
{
  "name": "readmates",
  "private": true,
  "packageManager": "pnpm@11.13.1",
  "engines": {
    "node": "24.x",
    "pnpm": "11.13.1"
  },
```

Change `front/package.json` to `"packageManager": "pnpm@11.13.1"`. Replace the `pnpm@10.33.0` sample values in `front/tests/performance/ct-docker.test.ts` with `pnpm@11.13.1` and expected version `11.13.1`.

Update active Node/pnpm claims in `AGENTS.md`, `README.md`, `docs/development/local-setup.md`, and `docs/development/test-guide.md`. Update the negative direct-pnpm fixture in `scripts/check-agent-guidance.py` to use `pnpm@11.13.1` while preserving the assertion that direct pnpm bypass is rejected.

- [ ] **Step 4: Regenerate the lockfile with Node 24 and pnpm 11**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --lockfile-only
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --frozen-lockfile
```

Expected: both commands exit 0 and `corepack pnpm --version` resolves 11.13.1 from the root package contract.

- [ ] **Step 5: Verify GREEN and the package-manager guidance contract**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
python3 scripts/check-agent-guidance.py --self-test
python3 scripts/check-agent-guidance.py
```

Expected: focused Vitest and both guidance checks pass.

- [ ] **Step 6: Commit the runtime contract**

```bash
git add .node-version package.json front/package.json pnpm-lock.yaml front/tests/performance/ct-docker.test.ts AGENTS.md README.md docs/development/local-setup.md docs/development/test-guide.md scripts/check-agent-guidance.py
git commit -m "build: align Node and pnpm toolchain"
```

### Task 2: Refresh Compatible Frontend And Design Dependencies

**Files:**
- Modify: `front/package.json`
- Modify: `design/system/package.json`
- Modify: `design/docs/package.json`
- Modify: `front/tests/performance/ct-docker.ts`
- Modify: `pnpm-lock.yaml` through pnpm 11

**Interfaces:**
- Consumes: the Node 24/pnpm 11 contract from Task 1.
- Produces: aligned React/Vite/Vitest/Playwright/TanStack/Router package versions for the major-upgrade lane.

- [ ] **Step 1: Add the Playwright Docker image expectation first**

Add this assertion to the existing Docker command test without changing `CT_DOCKER_IMAGE` yet:

```ts
expect(CT_DOCKER_IMAGE).toBe("mcr.microsoft.com/playwright:v1.61.1-jammy");
```

- [ ] **Step 2: Run the focused Docker helper test and verify RED**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: FAIL until the helper image constant is changed to 1.61.1.

- [ ] **Step 3: Update aligned package manifests**

Change `CT_DOCKER_IMAGE` in `front/tests/performance/ct-docker.ts` to:

```ts
export const CT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.61.1-jammy";
```

Set exact shared runtime and tool versions across every package that declares them:

```text
react / react-dom                         19.2.7
@types/react                              19.2.17
@types/react-dom                          19.2.3
@types/node                               24.13.3
vite                                      8.1.5
@vitejs/plugin-react                      6.0.3
vitest / @vitest/coverage-v8              4.1.10
@playwright/test                          1.61.1
@playwright/experimental-ct-react         1.61.1
@tanstack/react-query                     5.101.2
@tanstack/eslint-plugin-query             5.101.2
react-router-dom                          7.18.1
tsx                                       4.23.1
globals                                   17.7.0
eslint-plugin-react-refresh               0.5.3
typescript-eslint                         8.64.0
```

Preserve the existing exact-versus-caret policy for each manifest, except make both Playwright package specifiers exact `1.61.1` so the Docker image, browser binary, and test package cannot drift independently.

- [ ] **Step 4: Regenerate and freeze-install the shared lockfile**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --lockfile-only
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --frozen-lockfile
```

Expected: install exits 0 with no peer dependency error.

- [ ] **Step 5: Verify the compatible dependency lane**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front lint
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front test --reporter=dot
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front build
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm design:check
```

Expected: all commands exit 0. Fix only failures attributable to the package updates.

- [ ] **Step 6: Commit the compatible dependency refresh**

```bash
git add front/package.json design/system/package.json design/docs/package.json front/tests/performance/ct-docker.ts front/tests/performance/ct-docker.test.ts pnpm-lock.yaml
git commit -m "build: refresh frontend dependencies"
```

### Task 3: Upgrade The Supported Major Tooling Lane

**Files:**
- Modify: `front/package.json`
- Modify: `design/system/package.json`
- Modify: `design/docs/package.json`
- Modify: `front/eslint.config.mjs` only if ESLint 10 reports a concrete config incompatibility
- Modify: `front/tsconfig.json` only if TypeScript 6 reports a concrete compiler-option incompatibility
- Modify: `design/system/tsconfig.json` only if TypeScript 6 reports a concrete compiler-option incompatibility
- Modify: `design/docs/tsconfig.json` only if TypeScript 6 reports a concrete compiler-option incompatibility
- Modify: `pnpm-lock.yaml` through pnpm 11

**Interfaces:**
- Consumes: aligned workspace dependencies from Task 2.
- Produces: ESLint 10.7.0, `@eslint/js` 10.0.1, TypeScript 6.0.3, and jsdom 29.1.1 with current lint/type/test behavior preserved.

- [ ] **Step 1: Capture the TypeScript 7 incompatibility evidence**

Run:

```bash
npm view typescript-eslint@8.64.0 peerDependencies --json
npm view @typescript-eslint/parser@8.64.0 peerDependencies --json
```

Expected: both declare TypeScript `>=4.8.4 <6.1.0`, proving that stable TypeScript 7 is not an installable supported target in this lane.

- [ ] **Step 2: Apply supported major versions**

Set these exact versions in every workspace manifest that declares them:

```text
eslint             10.7.0
@eslint/js         10.0.1
typescript         6.0.3
jsdom              29.1.1
```

Do not add peer-dependency bypasses, `--force`, `strict-peer-dependencies=false`, or a typescript-eslint canary release.

- [ ] **Step 3: Regenerate the lockfile and surface compatibility failures**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --lockfile-only
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --frozen-lockfile
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front lint
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm design:check
```

Expected: install succeeds. If lint or type checking fails, record the exact diagnostic before applying the smallest config repair in the listed config files.

- [ ] **Step 4: Run frontend unit and production build gates**

Run:

```bash
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front test:coverage
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front build
```

Expected: both commands exit 0 and existing coverage thresholds remain satisfied.

- [ ] **Step 5: Commit the supported major tooling lane**

```bash
git add front/package.json design/system/package.json design/docs/package.json front/eslint.config.mjs front/tsconfig.json design/system/tsconfig.json design/docs/tsconfig.json pnpm-lock.yaml
git commit -m "build: upgrade frontend tooling majors"
```

Stage only config files that actually changed.

### Task 4: Upgrade The Gradle Wrapper

**Files:**
- Modify: `server/gradle/wrapper/gradle-wrapper.properties`
- Modify: `server/gradle/wrapper/gradle-wrapper.jar` through the wrapper task if the generated JAR changes
- Modify: `server/gradlew` and `server/gradlew.bat` through the wrapper task if generated scripts change

**Interfaces:**
- Consumes: JDK 25 and the existing single-module server build.
- Produces: a checksummed Gradle 9.6.1 wrapper used by server CI and integration lanes.

- [ ] **Step 1: Record the current wrapper version**

Run:

```bash
./server/gradlew -p server --version
```

Expected before the change: Gradle 9.1.0 under JVM 25.

- [ ] **Step 2: Generate the new wrapper twice**

Run:

```bash
./server/gradlew -p server wrapper --gradle-version 9.6.1 --distribution-type bin --gradle-distribution-sha256-sum 9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14
./server/gradlew -p server wrapper --gradle-version 9.6.1 --distribution-type bin --gradle-distribution-sha256-sum 9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14
```

Expected: wrapper properties use `gradle-9.6.1-bin.zip`, preserve URL validation, and contain the official SHA-256.

- [ ] **Step 3: Verify the wrapper and server PR-level gate**

Run:

```bash
./server/gradlew -p server --version
./scripts/server-ci-check.sh
```

Expected: Gradle 9.6.1/JVM 25 and a successful server quality gate.

- [ ] **Step 4: Commit the wrapper upgrade**

```bash
git add server/gradle/wrapper/gradle-wrapper.properties server/gradle/wrapper/gradle-wrapper.jar server/gradlew server/gradlew.bat
git commit -m "build: upgrade Gradle wrapper"
```

Stage only generated wrapper files that changed.

### Task 5: Synchronize Release Notes And Run The Full Upgrade Matrix

**Files:**
- Modify: `CHANGELOG.md`
- Modify: active version docs identified by the final scan if they still contain stale current claims
- Verify only: `.github/workflows/ci.yml`
- Verify only: `.github/workflows/deploy-front.yml`
- Verify only: `scripts/pre-push-check.sh`
- Verify only: `graphify-out/**` remains ignored

**Interfaces:**
- Consumes: all verified upgrade stages.
- Produces: public-safe `Unreleased` release notes and final branch evidence.

- [ ] **Step 1: Add the Unreleased upgrade note**

Under `## Unreleased` / `### Changed`, add one Korean-first entry that records:

```markdown
- **개발 도구 정렬:** 저장소 Node 계약을 CI와 같은 24로 명시하고 pnpm 11.13.1, 최신 호환 frontend/design 의존성, Gradle wrapper 9.6.1로 갱신했습니다. ESLint 10, TypeScript 6.0, jsdom 29를 검증했으며 TypeScript 7은 stable typescript-eslint의 `<6.1.0` peer contract 때문에 보류합니다.
```

- [ ] **Step 2: Prove no stale active version claims remain**

Run:

```bash
rg -n "pnpm@10\.33\.0|Gradle 9\.1\.0|gradle-9\.1\.0" AGENTS.md README.md package.json front/package.json docs/development docs/agents scripts .github server/gradle/wrapper
```

Expected: no current claim remains. Historical fixtures or explanatory negative tests must be updated when they represent the active contract; historical release records outside this scan remain unchanged.

- [ ] **Step 3: Run the complete Node 24 frontend/design matrix**

Run sequentially:

```bash
npx --yes -p node@24 -p corepack@0.35.0 node --version
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --version
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm install --frozen-lockfile
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front lint
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front test:coverage
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front build
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front zod:export-fixtures
git diff --exit-code -- front/tests/unit/__fixtures__/zod-schemas
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm design:check
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front test:e2e
npx --yes -p node@24 -p corepack@0.35.0 corepack pnpm --dir front test:ct:docker
```

Expected: Node reports v24.x, pnpm reports 11.13.1, and every gate exits 0. Run E2E and Docker CT sequentially to avoid shared browser/build-output collisions.

- [ ] **Step 4: Run the complete server matrix sequentially**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: both Gradle 9.6.1 lanes exit 0. Do not run them concurrently because they share Gradle test-result output.

- [ ] **Step 5: Run docs, guidance, public-release, and Graphify checks**

Run:

```bash
python3 scripts/check-agent-guidance.py --self-test
python3 scripts/check-agent-guidance.py
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" .node-version package.json front/package.json design/system/package.json design/docs/package.json AGENTS.md README.md docs/development/local-setup.md docs/development/test-guide.md CHANGELOG.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
graphify update .
git status --short graphify-out
```

Expected: deterministic checks and release candidate pass, the safety scan has no finding in added lines, Graphify exits 0, and `git status --short graphify-out` is empty because the output is ignored.

- [ ] **Step 6: Commit the release-note closeout**

```bash
git add CHANGELOG.md
git commit -m "docs: record toolchain dependency refresh"
```

- [ ] **Step 7: Review the branch diff and final state**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short --branch
```

Expected: only intended toolchain, manifest, lockfile, generated wrapper, focused test, active docs, and CHANGELOG changes are present; the worktree is clean.
