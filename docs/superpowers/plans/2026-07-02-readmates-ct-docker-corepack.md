# ReadMates CT Docker Corepack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReadMates Playwright component-test Docker commands use the root `packageManager` through Corepack, share one helper path, and avoid overwriting host `node_modules` during Docker CT runs.

**Architecture:** Add a pure CT Docker command builder under `front/tests/performance` and a small runtime wrapper under `front/scripts`. `front/package.json` delegates `test:ct:docker` and `test:ct:update:docker` to the wrapper, while CI keeps calling the package script. Docker mounts the repo read/write for screenshot output but overlays root and frontend `node_modules` with named volumes so Linux optional dependencies do not replace the host install.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, Vitest, pnpm 10.33.0 via Corepack, Docker, Playwright component testing, GitHub Actions, ReadMates public-release scripts.

## Global Constraints

- The canonical package manager source is root `package.json` `packageManager`.
- Keep `packageManager: "pnpm@10.33.0"` unchanged in root `package.json` and `front/package.json`.
- Do not regenerate `pnpm-lock.yaml`.
- Do not add or update screenshot baselines except through `pnpm --dir front test:ct:update:docker`.
- Do not change UI layout, copy, design system primitive behavior, route composition, server API, DB migration, BFF/OAuth proxy, auth/session behavior, release image workflow, or deploy behavior.
- Docker is the canonical CT renderer; do not substitute macOS local `pnpm --dir front test:ct` for Docker verification.
- CI must not pass `--update-snapshots` or any equivalent baseline update flag.
- Logs may show package manager source and resolved pnpm version, but must not print private domains, secrets, token-shaped values, or deployment state.
- Public release candidate must continue to exclude `front/__screenshots__`.

---

## File Structure

- Create: `front/tests/performance/ct-docker.ts`
  - Responsibility: parse `packageManager`, build the Docker command, and expose deterministic command pieces for focused unit tests.
- Create: `front/tests/performance/ct-docker.test.ts`
  - Responsibility: prove package-manager parsing, verify/update command assembly, node_modules volume isolation, and no accidental snapshot update in verify mode.
- Create: `front/scripts/run-ct-docker.ts`
  - Responsibility: runtime CLI wrapper that reads root `package.json`, builds the Docker command, spawns Docker, and exits with Docker's result.
- Modify: `front/package.json`
  - Responsibility: replace long inline Docker CT scripts with `tsx scripts/run-ct-docker.ts` and `tsx scripts/run-ct-docker.ts --update`.
- Modify: `.github/workflows/ci.yml`
  - Responsibility: keep the visual regression job on `pnpm test:ct:docker`; no snapshot update flags.
- Modify: `docs/development/test-guide.md`
  - Responsibility: document the helper path, Corepack package-manager source, Docker-only baseline update policy, and node_modules volume isolation.
- Modify: `docs/showcase/engineering-confidence.md`
  - Responsibility: keep the visual regression confidence entry current with the helper-backed Docker path.
- Modify: `CHANGELOG.md`
  - Responsibility: add an Unreleased Testing/Tooling entry for CT Docker Corepack standardization.

---

### Task 1: Add a Pure CT Docker Command Builder

**Files:**
- Create: `front/tests/performance/ct-docker.ts`
- Create: `front/tests/performance/ct-docker.test.ts`

**Interfaces:**
- Consumes: a root package manager string such as `"pnpm@10.33.0"`.
- Produces:
  - `parsePnpmPackageManager(value: string): PnpmPackageManager`
  - `buildCtDockerCommand(input: CtDockerCommandInput): CtDockerCommand`
  - `CT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.60.0-jammy"`
  - `CT_ROOT_NODE_MODULES_VOLUME = "readmates-ct-root-node-modules"`
  - `CT_FRONT_NODE_MODULES_VOLUME = "readmates-ct-front-node-modules"`
  - `CT_PNPM_STORE_VOLUME = "readmates-ct-pnpm-store"`

- [ ] **Step 1: Write the failing tests**

Create `front/tests/performance/ct-docker.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildCtDockerCommand,
  CT_DOCKER_IMAGE,
  CT_FRONT_NODE_MODULES_VOLUME,
  CT_PNPM_STORE_VOLUME,
  CT_ROOT_NODE_MODULES_VOLUME,
  parsePnpmPackageManager,
} from "./ct-docker";

describe("CT Docker command helpers", () => {
  it("parses a pnpm packageManager string", () => {
    expect(parsePnpmPackageManager("pnpm@10.33.0")).toEqual({
      raw: "pnpm@10.33.0",
      name: "pnpm",
      version: "10.33.0",
    });
  });

  it("rejects missing or non-pnpm packageManager values", () => {
    expect(() => parsePnpmPackageManager("")).toThrow("Expected root package.json packageManager to match pnpm@version");
    expect(() => parsePnpmPackageManager("npm@10.0.0")).toThrow(
      "Expected root package.json packageManager to match pnpm@version",
    );
    expect(() => parsePnpmPackageManager("pnpm")).toThrow("Expected root package.json packageManager to match pnpm@version");
  });

  it("builds verification command without a snapshot update flag", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@10.33.0"),
      mode: "verify",
      workspaceHostPath: "/repo",
    });

    expect(command.command).toBe("docker");
    expect(command.args).toContain(CT_DOCKER_IMAGE);
    expect(command.args).toContain("READMATES_CT_PACKAGE_MANAGER=pnpm@10.33.0");
    expect(command.args).toContain(`${CT_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`);
    expect(command.args).toContain(`${CT_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`);
    expect(command.args).toContain(`${CT_PNPM_STORE_VOLUME}:/pnpm-store`);
    expect(command.args.join(" ")).toContain("corepack prepare \"$READMATES_CT_PACKAGE_MANAGER\" --activate");
    expect(command.args.join(" ")).toContain("pnpm exec playwright test --config=playwright-ct.config.ts");
    expect(command.args.join(" ")).not.toContain("--update-snapshots");
  });

  it("adds update flag only for baseline update mode", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@10.33.0"),
      mode: "update",
      workspaceHostPath: "/repo",
    });

    expect(command.args.join(" ")).toContain("pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: FAIL with an import error for `./ct-docker`.

- [ ] **Step 3: Add the helper implementation**

Create `front/tests/performance/ct-docker.ts` with:

```ts
export const CT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.60.0-jammy";
export const CT_ROOT_NODE_MODULES_VOLUME = "readmates-ct-root-node-modules";
export const CT_FRONT_NODE_MODULES_VOLUME = "readmates-ct-front-node-modules";
export const CT_PNPM_STORE_VOLUME = "readmates-ct-pnpm-store";

export type PnpmPackageManager = {
  raw: string;
  name: "pnpm";
  version: string;
};

export type CtDockerMode = "verify" | "update";

export type CtDockerCommandInput = {
  packageManager: PnpmPackageManager;
  mode: CtDockerMode;
  workspaceHostPath: string;
};

export type CtDockerCommand = {
  command: "docker";
  args: string[];
};

export function parsePnpmPackageManager(value: string): PnpmPackageManager {
  const match = value.match(/^pnpm@(\S+)$/);
  if (!match) {
    throw new Error(`Expected root package.json packageManager to match pnpm@version, got: ${value || "(empty)"}`);
  }
  return {
    raw: value,
    name: "pnpm",
    version: match[1],
  };
}

function shellEscapeDoubleQuoted(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

export function buildCtDockerCommand(input: CtDockerCommandInput): CtDockerCommand {
  const playwrightArgs = ["pnpm", "exec", "playwright", "test", "--config=playwright-ct.config.ts"];
  if (input.mode === "update") {
    playwrightArgs.push("--update-snapshots");
  }

  const containerScript = [
    "set -eu",
    "corepack enable",
    'corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate',
    'resolved_pnpm_version="$(pnpm --version)"',
    'expected_pnpm_version="${READMATES_CT_PACKAGE_MANAGER#pnpm@}"',
    'if [ "$resolved_pnpm_version" != "$expected_pnpm_version" ]; then',
    '  echo "Expected pnpm $expected_pnpm_version, got $resolved_pnpm_version" >&2',
    "  exit 1",
    "fi",
    "pnpm config set store-dir /pnpm-store",
    "pnpm install --frozen-lockfile=false",
    playwrightArgs.map(shellEscapeDoubleQuoted).join(" "),
  ].join("\n");

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--ipc=host",
      "-e",
      "CI=true",
      "-e",
      `READMATES_CT_PACKAGE_MANAGER=${input.packageManager.raw}`,
      "-v",
      `${input.workspaceHostPath}:/work`,
      "-v",
      `${CT_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`,
      "-v",
      `${CT_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`,
      "-v",
      `${CT_PNPM_STORE_VOLUME}:/pnpm-store`,
      "-w",
      "/work/front",
      CT_DOCKER_IMAGE,
      "/bin/sh",
      "-lc",
      containerScript,
    ],
  };
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/tests/performance/ct-docker.ts front/tests/performance/ct-docker.test.ts
git commit -m "test(front): cover ct docker command builder"
```

---

### Task 2: Add the Runtime Wrapper and Package Scripts

**Files:**
- Create: `front/scripts/run-ct-docker.ts`
- Modify: `front/package.json`

**Interfaces:**
- Consumes:
  - `parsePnpmPackageManager(value: string)` from `front/tests/performance/ct-docker.ts`
  - `buildCtDockerCommand(input)` from `front/tests/performance/ct-docker.ts`
- Produces:
  - CLI `tsx scripts/run-ct-docker.ts`
  - CLI `tsx scripts/run-ct-docker.ts --update`
  - package scripts `test:ct:docker` and `test:ct:update:docker`

- [ ] **Step 1: Write the failing script scan**

Run:

```bash
node -e "const pkg=require('./front/package.json'); if (!pkg.scripts['test:ct:docker'].includes('scripts/run-ct-docker.ts')) process.exit(1)"
```

Expected: FAIL because `test:ct:docker` still contains the inline Docker command.

- [ ] **Step 2: Create the runtime wrapper**

Create `front/scripts/run-ct-docker.ts` with:

```ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCtDockerCommand, parsePnpmPackageManager, type CtDockerMode } from "../tests/performance/ct-docker";

const frontRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(frontRoot, "..");

type RootPackageJson = {
  packageManager?: string;
};

function parseMode(argv: string[]): CtDockerMode {
  if (argv.length === 0) return "verify";
  if (argv.length === 1 && argv[0] === "--update") return "update";
  throw new Error(`Usage: tsx scripts/run-ct-docker.ts [--update]`);
}

async function readRootPackageManager(): Promise<string> {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as RootPackageJson;
  return packageJson.packageManager ?? "";
}

function runProcess(command: string, args: string[]): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: frontRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`CT Docker command terminated by ${signal}`);
        resolveExit(1);
        return;
      }
      resolveExit(code ?? 1);
    });
  });
}

async function run() {
  const mode = parseMode(process.argv.slice(2));
  const packageManager = parsePnpmPackageManager(await readRootPackageManager());
  console.log(`Running Playwright CT Docker (${mode}) with ${packageManager.raw}`);
  const dockerCommand = buildCtDockerCommand({
    packageManager,
    mode,
    workspaceHostPath: repoRoot,
  });
  const exitCode = await runProcess(dockerCommand.command, dockerCommand.args);
  process.exitCode = exitCode;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Update package scripts**

In `front/package.json`, replace:

```json
"test:ct:docker": "docker run --rm --ipc=host -e CI=true -v \"$PWD/..\":/work -w /work/front mcr.microsoft.com/playwright:v1.60.0-jammy /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts'",
"test:ct:update:docker": "docker run --rm --ipc=host -e CI=true -v \"$PWD/..\":/work -w /work/front mcr.microsoft.com/playwright:v1.60.0-jammy /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots'",
```

with:

```json
"test:ct:docker": "tsx scripts/run-ct-docker.ts",
"test:ct:update:docker": "tsx scripts/run-ct-docker.ts --update",
```

- [ ] **Step 4: Verify script scan passes**

Run:

```bash
node -e "const pkg=require('./front/package.json'); if (!pkg.scripts['test:ct:docker'].includes('scripts/run-ct-docker.ts')) process.exit(1); if (!pkg.scripts['test:ct:update:docker'].includes('--update')) process.exit(1)"
```

Expected: PASS.

- [ ] **Step 5: Verify TypeScript wrapper through focused tests**

Run:

```bash
pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify no inline Docker CT command remains in package scripts**

Run:

```bash
node -e "const pkg=require('./front/package.json'); if (pkg.scripts['test:ct:docker'].includes('docker run')) process.exit(1); if (pkg.scripts['test:ct:update:docker'].includes('docker run')) process.exit(1)"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/scripts/run-ct-docker.ts front/package.json
git commit -m "fix(front): route ct docker scripts through helper"
```

---

### Task 3: Align CI and Documentation With the Helper Path

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/showcase/engineering-confidence.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes:
  - `pnpm --dir front test:ct:docker`
  - `pnpm --dir front test:ct:update:docker`
  - Docker named volumes `readmates-ct-root-node-modules`, `readmates-ct-front-node-modules`, `readmates-ct-pnpm-store`
- Produces:
  - Docs that describe the helper-backed Docker path and baseline update policy.
  - CI confirmation that the visual regression job still uses verification mode only.

- [ ] **Step 1: Write the CI no-update scan**

Run:

```bash
awk '/Run component visual regression tests/{flag=1} flag && /run:/{print; exit}' .github/workflows/ci.yml | rg "pnpm test:ct:docker$"
```

Expected: PASS if CI already calls `pnpm test:ct:docker`. If it fails, update only that step to:

```yaml
      - name: Run component visual regression tests
        run: pnpm test:ct:docker
```

- [ ] **Step 2: Update test guide CT section**

In `docs/development/test-guide.md`, replace the four CT command bullets under `## 시각 회귀 (컴포넌트 하니스)` with:

```markdown
- `test:ct`는 Linux CI와 로컬 Linux에서 committed baseline과 현재 렌더 결과를 비교하는 검증 명령입니다. snapshot update flag를 사용하지 않습니다.
- `test:ct:docker`는 macOS/renderer drift 회피용 검증 명령입니다. `front/scripts/run-ct-docker.ts`가 루트 `package.json`의 `packageManager`를 읽고 Docker 컨테이너 안에서 Corepack으로 같은 pnpm을 활성화한 뒤 Playwright CT를 실행합니다. 이 명령은 snapshot을 갱신하지 않습니다.
- `test:ct:update`는 로컬 baseline 갱신용이지만, macOS나 CI 기준과 다른 렌더러에서 생성한 결과는 커밋하지 않습니다.
- `test:ct:update:docker`가 baseline 생성의 **유일한 정규 경로**입니다. 같은 helper에 `--update`를 넘겨 `mcr.microsoft.com/playwright:v1.60.0-jammy` 이미지 안에서 실행합니다.
```

Immediately after those bullets, add:

````markdown
Docker CT는 repository를 `/work`에 mount하되 root `node_modules`, `front/node_modules`, pnpm store를 Docker named volume으로 분리합니다. 그래서 Linux optional dependency install이 host `node_modules`를 덮어쓰는 일을 피합니다. Docker volume이 오래되어 의존성 상태가 의심되면 다음처럼 CT 전용 volume만 지웁니다.

```bash
docker volume rm readmates-ct-root-node-modules readmates-ct-front-node-modules readmates-ct-pnpm-store
```
````

- [ ] **Step 3: Update engineering confidence**

In `docs/showcase/engineering-confidence.md`, change the `Route-critical component visual regression` row so the guardrail cell includes both commands:

```markdown
| Route-critical component visual regression | `pnpm --dir front test:ct:docker`, `pnpm --dir front test:ct:update:docker`, `front/__screenshots__/features/**` | host closing board, platform-admin support, public records 같은 반복 UI 조각의 pixel drift |
```

Also update the Validation Commands CT line from:

```markdown
pnpm --dir front test:ct:update:docker
```

to:

```markdown
pnpm --dir front test:ct:docker
```

- [ ] **Step 4: Update changelog**

Under `CHANGELOG.md` `## Unreleased`, add a Testing or Tooling bullet:

```markdown
- **CT Docker Corepack path:** Playwright component visual-regression Docker commands now run through a shared helper that activates the repo-defined pnpm with Corepack, verifies the container pnpm version, and isolates CT `node_modules` in Docker volumes so the host install is not rewritten by Linux optional dependencies.
```

- [ ] **Step 5: Run docs and scan checks**

Run:

```bash
git diff --check -- .github/workflows/ci.yml front/package.json front/scripts/run-ct-docker.ts front/tests/performance/ct-docker.ts front/tests/performance/ct-docker.test.ts docs/development/test-guide.md docs/showcase/engineering-confidence.md CHANGELOG.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/development/test-guide.md docs/showcase/engineering-confidence.md CHANGELOG.md
```

Expected: `git diff --check` PASS; private-value scan has no matches.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml docs/development/test-guide.md docs/showcase/engineering-confidence.md CHANGELOG.md
git commit -m "docs: align ct docker corepack guidance"
```

---

### Task 4: Run Integrated Verification and Close Out

**Files:**
- Modify after verification: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: helper and docs from Tasks 1-3.
- Produces: final release-readiness evidence with exact command results.

- [ ] **Step 1: Run focused helper tests**

Run:

```bash
pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Docker CT verification**

Run:

```bash
pnpm --dir front test:ct:docker
```

Expected: PASS with existing 7 Playwright CT tests and no screenshot updates.

- [ ] **Step 3: Run Docker CT update idempotence check**

Run:

```bash
pnpm --dir front test:ct:update:docker
git status --short -- front/__screenshots__
```

Expected: CT command PASS. `git status --short -- front/__screenshots__` prints no output because current baselines are already up to date.

- [ ] **Step 4: Run frontend gates**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 5: Run public release checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
find .tmp/public-release-candidate -path '*__screenshots__*' -print
```

Expected: build/check PASS. The `find` command prints no output.

- [ ] **Step 6: Record release-readiness evidence**

At the top of `docs/development/release-readiness-review.md`, add this section above the 2026-07-01 Corepack note, editing only command counts or output summaries to match actual results:

```markdown
## 2026-07-02 CT Docker Corepack path

- Scope: frontend Playwright component-test Docker command path only. No UI baseline expansion, route behavior, server API contract, DB migration, auth/BFF behavior, release image workflow, or deploy behavior changed.
- Tooling change: `front/package.json` now routes `test:ct:docker` and `test:ct:update:docker` through `front/scripts/run-ct-docker.ts`. The helper reads root `package.json` `packageManager`, activates that pnpm inside `mcr.microsoft.com/playwright:v1.60.0-jammy` with Corepack, verifies the resolved pnpm version, and separates verification from snapshot update mode.
- Host dependency safety: Docker CT mounts root `node_modules`, `front/node_modules`, and pnpm store as CT-specific Docker named volumes so Linux optional dependency installs do not replace the host install.
- Local verification: `pnpm --dir front exec vitest run tests/performance/ct-docker.test.ts` passed; `pnpm --dir front test:ct:docker` passed against the committed CT baselines; `pnpm --dir front test:ct:update:docker` passed and left `front/__screenshots__` unchanged; `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build` passed; `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed; `find .tmp/public-release-candidate -path '*__screenshots__*' -print` produced no output.
- Residual risk: Docker CT remains a heavy renderer-specific check, and pnpm 11 migration remains separate. No known local release-readiness blocker remains after helper tests, Docker CT verification/update idempotence, frontend checks, and public-release candidate checks pass.
```

- [ ] **Step 7: Final diff checks**

Run:

```bash
git diff --check -- .github/workflows/ci.yml front/package.json front/scripts/run-ct-docker.ts front/tests/performance/ct-docker.ts front/tests/performance/ct-docker.test.ts docs/development/test-guide.md docs/development/release-readiness-review.md docs/showcase/engineering-confidence.md CHANGELOG.md
git status --short
```

Expected: whitespace PASS. `git status --short` shows only intended files.

- [ ] **Step 8: Commit release-readiness evidence**

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record ct docker corepack verification"
```

- [ ] **Step 9: Final summary for reviewer**

Report:

```text
Changed surface: frontend tooling, CI visual-regression path, docs.
Checks run: list every command from Steps 1-7 with pass/fail.
Remaining risk: Docker CT remains heavy; pnpm 11 migration remains separate; no UI/server/API behavior changed.
```

---

## Plan Self-review

- Spec coverage: Task 1 covers packageManager parsing, container pnpm version guard, verify/update command separation, and host node_modules volume isolation. Task 2 wires the helper into package scripts. Task 3 aligns CI, test-guide, engineering-confidence, and changelog docs. Task 4 runs CT, frontend, and public-release verification and records exact release-readiness evidence.
- Temporary-marker scan: no temporary markers, unspecified files, or deferred implementation steps remain.
- Type consistency: `PnpmPackageManager`, `CtDockerMode`, `CtDockerCommandInput`, and `CtDockerCommand` are defined in Task 1 and reused with the same names in Task 2.
