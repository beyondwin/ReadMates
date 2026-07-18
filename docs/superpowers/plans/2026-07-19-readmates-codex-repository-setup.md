# ReadMates Codex Repository Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect ReadMates agent routing, project-specific risk selection, deterministic preflight, and CI guidance checks so Codex can choose the right constraints and evidence without introducing a new agent framework.

**Architecture:** Keep the root `AGENTS.md` as a compact router, add pointer-first local routers only at high-risk server/BFF/scripts/deploy boundaries, and place shared execution and acceptance rules in active docs. Add one read-only Python preflight that classifies paths and prints guidance without running commands, then expand the existing guidance checker and CI to protect all instruction chains and both tools' self-tests.

**Tech Stack:** Markdown, Python 3 standard library, Git, GitHub Actions YAML, existing Bash verification and public-release scripts.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-19-readmates-codex-repository-setup-design.md` without reopening the selected repository-contained approach.
- Keep the root and every supported combined `AGENTS.md` chain below 32 KiB.
- Local routers are concise pointers; do not duplicate `docs/agents/*.md`, architecture, test, or deploy runbooks into them.
- Do not add Graphify, `.codex/config.toml`, repo skills, custom agents, plugins, MCP, hooks, rules, a parallel orchestrator, or user-level Codex configuration.
- `scripts/agent-preflight.py` is read-only. It may inspect Git and print text/JSON, but it must not edit files, run tests, start or stop processes, commit, push, or deploy.
- Existing `scripts/pre-push-check.sh`, frontend checks, server wrapper, E2E, integration, and public-release scanner remain execution sources of truth; preflight only recommends their canonical commands.
- Do not modify frontend/server product source, API contracts, migrations, runtime configuration, or deployment behavior.
- Do not modify ignored `.codex-orchestrator/` state or persist local absolute paths, private domains, real member data, credentials, OCIDs, deployment state, or token-shaped examples.
- Preserve existing user changes. Before every task run `git status --short --branch --untracked-files=all` and stage only that task's declared files.
- Do not push, create a PR, tag, deploy, or mutate production state as part of this plan.

---

## Target File Structure

| File | Responsibility after implementation | Task |
| --- | --- | --- |
| `docs/agents/execution.md` | Shared analyze/diagnose/change/release/local-runtime authority, isolation, TDD, artifact, and evidence contract | 1 |
| `docs/development/acceptance-matrix.md` | ReadMates-specific actor/context/lifecycle/visibility/transport/persistence/failure risk selection | 1 |
| `server/AGENTS.md` | Server-local pointer to root, execution, server architecture, and canonical verification | 1 |
| `front/functions/AGENTS.md` | BFF/OAuth-local pointer to frontend/server trust-boundary guidance | 1 |
| `scripts/AGENTS.md` | Script/scanner-local pointer to docs, public-safety, and script contracts | 1 |
| `deploy/AGENTS.md` | Deploy-local pointer separating repository edits from live mutation authority | 1 |
| `AGENTS.md` and documentation hubs | Compact entrypoints to execution, acceptance, and preflight guidance | 1 |
| `scripts/agent-preflight.py` | Read-only path/intent/Git-state classifier with text, JSON, and self-tests | 2 |
| `scripts/check-agent-guidance.py` | Required-path, local-router, chain-size, link, command, package-manager, preflight-policy, and public-safety checker | 3 |
| `.github/workflows/ci.yml` | Runs both self-test suites before the current-tree guidance contract | 4 |
| `scripts/README.md` | Documents preflight semantics, examples, and its boundary from pre-push | 4 |

Task dependency order is `1 -> 2 -> 3 -> 4 -> 5`. Do not parallelize Tasks 1-4: they intentionally modify shared guidance and policy files in sequence. Task 5 is verification-only.

---

### Task 1: Add The Execution Contract, Acceptance Matrix, And Local Routers

**Files:**
- Create: `docs/agents/execution.md`
- Create: `docs/development/acceptance-matrix.md`
- Create: `server/AGENTS.md`
- Create: `front/functions/AGENTS.md`
- Create: `scripts/AGENTS.md`
- Create: `deploy/AGENTS.md`
- Modify: `AGENTS.md:5-49`
- Modify: `docs/agents/docs.md:12-33`
- Modify: `docs/development/project-map.md:6-119`
- Modify: `docs/development/vertical-slice-checklist.md:1-49`
- Modify: `README.md:30-45,230-245`
- Modify: `docs/README.md:5-31`
- Modify: `docs/development/README.md:5-45`

**Interfaces:**
- Consumes: Current source-of-truth order, surface guides, canonical checks, and public-repo safety contract.
- Produces: Stable paths `docs/agents/execution.md` and `docs/development/acceptance-matrix.md` consumed by every local router, preflight policy, and the checker in Tasks 2-3.
- Produces: Supported instruction chains `root`, `front`, `front/functions`, `server`, `scripts`, and `deploy`.

- [ ] **Step 1: Capture the current routing baseline**

Run:

```bash
git status --short --branch --untracked-files=all
wc -c AGENTS.md front/AGENTS.md docs/agents/*.md
find . -path './.git' -prune -o -path './node_modules' -prune -o -name AGENTS.md -print
python3 -B scripts/check-agent-guidance.py
```

Expected: worktree contains only the already committed design/plan history, current checker passes, and only root plus `front/AGENTS.md` are tracked routers before this task.

- [ ] **Step 2: Create the common execution contract**

Create `docs/agents/execution.md` with these exact sections and rules:

```markdown
# ReadMates Agent Execution Guide

Read this for rules that apply across frontend, BFF, server, scripts, deploy, and documentation work. Surface guides add architecture-specific constraints.

## Request Types

- **Analyze or explain:** inspect read-only evidence and distinguish repository claims from live-runtime confirmation.
- **Diagnose:** identify root cause and impact; do not modify product files unless the request also asks for a fix.
- **Change or build:** implement the requested scope, run focused checks first, and expand to PR-level evidence when the touched surface requires it.
- **Release or readiness review:** inspect the whole branch diff against its real base and use `docs/development/release-readiness-review.md`.
- **Local runtime:** preserve existing processes, worktrees, containers, ports, and caches; isolate the requested service before starting it.

## Before Editing

- Run `git status --short --branch --untracked-files=all` and inspect staged, unstaged, and untracked paths.
- Name the expected edit surface and required guides before changing files.
- Stop before editing when existing user changes overlap the expected files.
- Treat current code, tests, migrations, scripts, and architecture as current truth; historical plans, reports, ignored tool state, and generated output are context only.

## Implementation And Artifacts

- For behavior changes, add a failing test or characterization evidence before the implementation. Do not force TDD onto docs-only or non-behavior configuration edits.
- Keep tracked contract fixtures intentional. Do not commit build output, coverage, screenshots, reports, caches, `.tmp`, or `.codex-orchestrator` state unless a repository contract explicitly tracks that artifact.
- Do not terminate or reconfigure an existing local service to free a port. Use an alternate port, isolated checkout, cache, or container project.

## Authority Boundary

- Read-only inspection and requested repository edits are in scope.
- Commit, push, PR, tag, deploy, secret rotation, and production data mutation require explicit request scope and the repository release contract.
- Never present repository configuration as proof that production is currently running that configuration.

## Verification And Handoff

- Run the smallest focused check first, then the canonical surface gate selected by `AGENTS.md` and `docs/development/acceptance-matrix.md`.
- Report exact commands, automated evidence, manual evidence, skipped validation with reasons, and residual risk.
- State whether evidence is repository-only, local-runtime, or live production evidence.
```

- [ ] **Step 3: Create the ReadMates acceptance matrix**

Create `docs/development/acceptance-matrix.md` with this stable selection structure. Verify concrete enum names, routes, and test files against current code before adding examples; do not turn the table into an exhaustive Cartesian test suite.

```markdown
# ReadMates Acceptance Matrix

Use this matrix to select risk evidence for the touched slice. Select only relevant rows, record why each was selected, and state why adjacent high-risk rows do not apply.

| Trigger | Minimum states or failures to consider | Evidence direction |
| --- | --- | --- |
| Actor or authorization | anonymous, invited or pending user, active member, host, platform admin | Focused authorization test plus denied-path evidence |
| Club context | scoped club, unscoped compatibility route, different club context, trusted BFF-derived context | Route/BFF/server test proving club isolation |
| Session lifecycle | current code's creation, active, closing, and published states | Allowed and rejected transition evidence |
| Publication visibility | host-only, member-visible, public exposure, cache invalidation | Server/public API test and affected frontend state |
| BFF or OAuth | same-origin proxy, cookie/session, safe return path, trusted header stripping | BFF unit test and relevant E2E flow |
| Cursor collection | empty page, first page, continuation, last page, duplicate accumulation | Contract and route/model accumulation test |
| Persistence or migration | Flyway ordering, forward compatibility, query behavior, rollback limitation | Focused integration test or full `integrationTest` lane |
| Async, cache, or provider | duplicate delivery, retry/dead recovery, unavailable Redis, timeout, typed provider failure | Focused failure-path test and operator evidence |
| UI or runtime state | loading, empty, denied, stale, error, wrapping, desktop, mobile | Component/route test plus responsive or browser evidence |

## Handoff Record

- Selected rows and reasons
- Adjacent high-risk rows excluded and reasons
- Automated evidence
- Manual evidence
- Runtime, provider, or deploy validation not performed
```

Link the matrix to `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md`, and the four surface guides without copying their detailed rules.

- [ ] **Step 4: Add pointer-first local routers**

Create `server/AGENTS.md`:

```markdown
# ReadMates Server

This guide adds to `../AGENTS.md`. Before editing server code, read `../docs/agents/execution.md` and `../docs/agents/server.md`.

Use `../docs/development/acceptance-matrix.md` when authorization, club context, lifecycle, visibility, persistence, async delivery, cache, or provider behavior changes.

Do not add production migrations outside `src/main/resources/db/mysql/migration`, expose private data, or treat repository configuration as live-runtime evidence.

The PR-level server gate is `./scripts/server-ci-check.sh`; add `./server/gradlew -p server integrationTest` when MySQL, Flyway, API contract, query budget, or Testcontainers evidence is required. Report skipped checks exactly.
```

Create `front/functions/AGENTS.md`:

```markdown
# ReadMates BFF And OAuth Functions

This guide adds to `../../AGENTS.md` and `../AGENTS.md`. Before editing, read `../../docs/agents/execution.md`, `../../docs/agents/front.md`, and `../../docs/agents/server.md`.

Treat this directory as a browser-facing security boundary. Preserve same-origin BFF routing, strip internal `x-readmates-*` headers and secrets, derive club context from trusted input, and keep return paths safe.

Use `../../docs/development/acceptance-matrix.md` for auth, club-context, header, cookie, redirect, error, and E2E states. Never expose secrets through `VITE_*` configuration.
```

Create `scripts/AGENTS.md`:

```markdown
# ReadMates Scripts

This guide adds to `../AGENTS.md`. Before editing scripts, read `../docs/agents/execution.md`, `../docs/agents/docs.md`, and `README.md`.

Preserve public-release safety, fail closed on scanner errors, keep temporary output under ignored paths, and do not duplicate secret-pattern engines when an existing scanner owns the contract.

Run focused script fixtures or syntax checks first. Release-sensitive changes also require `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` from the repository root.
```

Create `deploy/AGENTS.md`:

```markdown
# ReadMates Deploy

This guide adds to `../AGENTS.md`. Before editing deploy files, read `../docs/agents/execution.md`, `../docs/agents/docs.md`, and `../docs/deploy/README.md`.

Repository edits do not authorize a live deployment, secret rotation, provider-console change, or production data mutation. Keep examples public-safe and distinguish repository evidence from live operational evidence.

Validate the touched config or script and run the public-release candidate checks. Use the release-readiness checklist for branch safety or ship decisions.
```

- [ ] **Step 5: Wire compact entrypoints without duplicating rules**

Add this paragraph after the opening surface list in `AGENTS.md`:

```markdown
Read `docs/agents/execution.md` for the shared analyze/diagnose/change/release/local-runtime contract. Use `python3 scripts/agent-preflight.py` to classify current or expected paths, and use `docs/development/acceptance-matrix.md` to select ReadMates-specific risk evidence. These are navigation and evidence-selection aids; current code, tests, migrations, scripts, and architecture remain source of truth.
```

Update the package-local sentence to name `front/AGENTS.md`, `front/functions/AGENTS.md`, `server/AGENTS.md`, `scripts/AGENTS.md`, and `deploy/AGENTS.md` without restating their contents.

Update `docs/agents/docs.md`, `docs/development/project-map.md`, and `docs/development/vertical-slice-checklist.md` so:

- agent instruction changes keep all package-local routers aligned;
- project-map's first-five-minutes flow includes the execution guide and preflight;
- vertical-slice handoff records selected acceptance rows and exclusions;
- local runtime work preserves existing services and selects isolation before start.

Add concise links to the new execution guide and acceptance matrix in `README.md`, `docs/README.md`, and `docs/development/README.md`. Do not add a second copy of the workflow text.

- [ ] **Step 6: Verify the documentation and instruction chains**

Run:

```bash
guidance_docs=(
  AGENTS.md
  server/AGENTS.md
  front/functions/AGENTS.md
  scripts/AGENTS.md
  deploy/AGENTS.md
  docs/agents/execution.md
  docs/agents/docs.md
  docs/development/acceptance-matrix.md
  docs/development/project-map.md
  docs/development/vertical-slice-checklist.md
  README.md
  docs/README.md
  docs/development/README.md
)
git diff --check -- "${guidance_docs[@]}"
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" "${guidance_docs[@]}"
wc -c AGENTS.md front/AGENTS.md front/functions/AGENTS.md server/AGENTS.md scripts/AGENTS.md deploy/AGENTS.md
python3 -B scripts/check-agent-guidance.py
```

Expected: diff and targeted safety scan return no findings, every individual router is small, and the existing checker still passes before Task 3 expands its contract.

- [ ] **Step 7: Commit the active guidance**

```bash
git add \
  AGENTS.md \
  server/AGENTS.md \
  front/functions/AGENTS.md \
  scripts/AGENTS.md \
  deploy/AGENTS.md \
  docs/agents/execution.md \
  docs/agents/docs.md \
  docs/development/acceptance-matrix.md \
  docs/development/project-map.md \
  docs/development/vertical-slice-checklist.md \
  README.md \
  docs/README.md \
  docs/development/README.md
git commit -m "docs: add Codex execution guidance"
```

---

### Task 2: Implement The Read-Only Agent Preflight

**Files:**
- Create: `scripts/agent-preflight.py`

**Interfaces:**
- Consumes: optional `--intent`, `--base`, repeated `--paths`, optional `--isolation-note`, current Git state, and the stable guide/check paths from Task 1.
- Produces: `PreflightResult` with `repository_state`, `surfaces`, `required_guides`, `risk_triggers`, `recommended_checks`, `stop_reasons`, and `evidence_level`.
- Produces CLI modes: default text, `--json`, and `--self-test`.
- Does not execute any value in `recommended_checks`.

- [ ] **Step 1: Create a testable scaffold with RED self-tests**

Create `scripts/agent-preflight.py` with the shebang, imports, immutable models, stub classifiers, and these tests:

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import unittest
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class Classification:
    surfaces: tuple[str, ...]
    required_guides: tuple[str, ...]
    risk_triggers: tuple[str, ...]
    recommended_checks: tuple[str, ...]


@dataclass(frozen=True)
class RepositoryState:
    branch: str
    base: str
    base_resolved: bool
    dirty_paths: tuple[str, ...]
    staged_paths: tuple[str, ...]
    base_paths: tuple[str, ...]


@dataclass(frozen=True)
class PreflightResult:
    repository_state: RepositoryState
    surfaces: tuple[str, ...]
    required_guides: tuple[str, ...]
    risk_triggers: tuple[str, ...]
    recommended_checks: tuple[str, ...]
    stop_reasons: tuple[str, ...]
    evidence_level: str


def classify_paths(paths: tuple[str, ...], intent: str) -> Classification:
    return Classification(("unknown",), ("AGENTS.md", "docs/development/project-map.md"), (), ())


def paths_overlap(expected: tuple[str, ...], dirty: tuple[str, ...]) -> bool:
    return False


class AgentPreflightTests(unittest.TestCase):
    def test_bff_selects_front_server_and_e2e(self) -> None:
        result = classify_paths(("front/functions/api/bff/[...path].ts",), "change")
        self.assertIn("bff-auth", result.surfaces)
        self.assertIn("docs/agents/front.md", result.required_guides)
        self.assertIn("docs/agents/server.md", result.required_guides)
        self.assertIn("pnpm --dir front test:e2e", result.recommended_checks)

    def test_migration_selects_integration_evidence(self) -> None:
        result = classify_paths(
            ("server/src/main/resources/db/mysql/migration/V999__example.sql",),
            "change",
        )
        self.assertIn("persistence-migration", result.surfaces)
        self.assertIn("./scripts/server-ci-check.sh", result.recommended_checks)
        self.assertIn(
            "./server/gradlew -p server integrationTest",
            result.recommended_checks,
        )

    def test_unknown_path_uses_lightweight_fallback(self) -> None:
        result = classify_paths(("unknown-area/file.txt",), "change")
        self.assertEqual(("unknown",), result.surfaces)
        self.assertEqual((), result.recommended_checks)

    def test_expected_path_overlap_is_detected(self) -> None:
        self.assertTrue(paths_overlap(("server/AGENTS.md",), ("server/AGENTS.md",)))

    def test_text_and_json_share_the_same_model(self) -> None:
        result = classify_paths(("front/src/app/router.tsx",), "change")
        encoded = json.loads(json.dumps(asdict(result), sort_keys=True))
        self.assertEqual(list(result.surfaces), encoded["surfaces"])
```

Add a `--self-test` parser branch that loads `AgentPreflightTests`. Leave ordinary execution returning the stub result so the test suite records RED rather than performing repository actions.

Use this self-test runner in the scaffold:

```python
def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AgentPreflightTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect ReadMates agent task readiness")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    return run_self_tests() if args.self_test else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run self-tests and verify RED**

Run:

```bash
python3 -B scripts/agent-preflight.py --self-test
```

Expected: FAIL in the BFF, migration, and overlap tests because the classifier and overlap detector are still stubs.

- [ ] **Step 3: Implement the path policy and stable union behavior**

Add this immutable rule model and complete rule table above `classify_paths`:

```python
@dataclass(frozen=True)
class PathRule:
    prefixes: tuple[str, ...]
    surfaces: tuple[str, ...]
    guides: tuple[str, ...]
    risks: tuple[str, ...]
    checks: tuple[str, ...]


DOCUMENTATION_PATHS = {
    "README.md",
    "AGENTS.md",
    "front/AGENTS.md",
    "front/functions/AGENTS.md",
    "server/AGENTS.md",
    "scripts/AGENTS.md",
    "deploy/AGENTS.md",
}

DOCUMENTATION_RULE = PathRule(
    (),
    ("documentation",),
    ("docs/agents/docs.md", "docs/agents/execution.md"),
    ("public-safety", "source-of-truth-drift"),
    ("git diff --check", "./scripts/build-public-release-candidate.sh", "./scripts/public-release-check.sh .tmp/public-release-candidate"),
)

PATH_RULES = (
    PathRule(
        ("front/functions/",),
        ("frontend", "bff-auth"),
        ("front/AGENTS.md", "front/functions/AGENTS.md", "docs/agents/front.md", "docs/agents/server.md", "docs/agents/execution.md", "docs/development/acceptance-matrix.md"),
        ("auth", "club-context", "trusted-headers", "redirects", "browser-error-contract"),
        ("pnpm --dir front lint", "pnpm --dir front test", "pnpm --dir front build", "pnpm --dir front test:e2e"),
    ),
    PathRule(
        ("front/",),
        ("frontend",),
        ("front/AGENTS.md", "docs/agents/front.md", "docs/agents/execution.md"),
        ("route-state", "responsive-ui"),
        ("pnpm --dir front lint", "pnpm --dir front test", "pnpm --dir front build"),
    ),
    PathRule(
        ("server/src/main/resources/db/mysql/migration/",),
        ("server", "persistence-migration"),
        ("server/AGENTS.md", "docs/agents/server.md", "docs/agents/execution.md", "docs/development/acceptance-matrix.md"),
        ("flyway-ordering", "forward-compatibility", "rollback-limit", "query-behavior"),
        ("./scripts/server-ci-check.sh", "./server/gradlew -p server integrationTest"),
    ),
    PathRule(
        ("server/",),
        ("server",),
        ("server/AGENTS.md", "docs/agents/server.md", "docs/agents/execution.md"),
        ("authorization", "application-boundary", "async-cache-provider"),
        ("./scripts/server-ci-check.sh",),
    ),
    PathRule(
        ("scripts/",),
        ("scripts",),
        ("scripts/AGENTS.md", "docs/agents/docs.md", "docs/agents/execution.md", "scripts/README.md"),
        ("scanner-fail-closed", "generated-artifacts", "release-contract"),
        ("python3 -B scripts/check-agent-guidance.py", "./scripts/build-public-release-candidate.sh", "./scripts/public-release-check.sh .tmp/public-release-candidate"),
    ),
    PathRule(
        ("deploy/", ".github/workflows/"),
        ("deploy-release",),
        ("deploy/AGENTS.md", "docs/agents/docs.md", "docs/agents/execution.md", "docs/deploy/README.md", "docs/development/release-readiness-review.md"),
        ("live-mutation-authority", "operator-surprise", "public-safety"),
        ("./scripts/build-public-release-candidate.sh", "./scripts/public-release-check.sh .tmp/public-release-candidate"),
    ),
)


def matches(path: str, prefix: str) -> bool:
    return path.startswith(prefix) if prefix.endswith("/") else path == prefix


def stable_unique(values: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def classify_paths(paths: tuple[str, ...], intent: str) -> Classification:
    surfaces: list[str] = []
    guides = ["AGENTS.md"]
    risks: list[str] = []
    checks: list[str] = []
    for path in paths:
        candidate_rules = (
            (DOCUMENTATION_RULE,)
            if path.startswith("docs/") or path in DOCUMENTATION_PATHS
            else PATH_RULES
        )
        for rule in candidate_rules:
            if any(matches(path, prefix) for prefix in rule.prefixes):
                surfaces.extend(rule.surfaces)
                guides.extend(rule.guides)
                risks.extend(rule.risks)
                checks.extend(rule.checks)
    if intent == "release":
        surfaces.append("release-readiness")
        guides.append("docs/development/release-readiness-review.md")
        risks.extend(("whole-branch-diff", "operator-follow-up", "skipped-validation"))
        checks.extend(("./scripts/build-public-release-candidate.sh", "./scripts/public-release-check.sh .tmp/public-release-candidate"))
    if not surfaces:
        return Classification(
            ("unknown",),
            ("AGENTS.md", "docs/development/project-map.md"),
            (),
            (),
        )
    return Classification(
        stable_unique(surfaces),
        stable_unique(guides),
        stable_unique(risks),
        stable_unique(checks),
    )
```

Implement overlap so a file overlaps itself or a declared directory prefix, while sibling files do not:

```python
def paths_overlap(expected: tuple[str, ...], dirty: tuple[str, ...]) -> bool:
    def overlaps(left: str, right: str) -> bool:
        left = left.rstrip("/")
        right = right.rstrip("/")
        return left == right or left.startswith(right + "/") or right.startswith(left + "/")

    return any(overlaps(left, right) for left in expected for right in dirty)
```

- [ ] **Step 4: Implement Git state, stop reasons, and rendering**

Implement these boundaries:

```python
def git_lines(root: Path, *args: str) -> tuple[int, tuple[str, ...]]:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    lines = tuple(line for line in result.stdout.splitlines() if line)
    return result.returncode, lines


def collect_repository_state(root: Path, base: str) -> RepositoryState:
    _, branch_lines = git_lines(root, "branch", "--show-current")
    branch = branch_lines[0] if branch_lines else ""
    base_code, _ = git_lines(root, "rev-parse", "--verify", base)
    _, unstaged = git_lines(root, "diff", "--name-only")
    _, staged = git_lines(root, "diff", "--cached", "--name-only")
    _, untracked = git_lines(root, "ls-files", "--others", "--exclude-standard")
    if base_code == 0:
        _, base_paths = git_lines(root, "diff", "--name-only", f"{base}...HEAD")
    else:
        base_paths = ()
    return RepositoryState(
        branch=branch,
        base=base,
        base_resolved=base_code == 0,
        dirty_paths=stable_unique([*unstaged, *staged, *untracked]),
        staged_paths=stable_unique(list(staged)),
        base_paths=stable_unique(list(base_paths)),
    )


def build_result(
    state: RepositoryState,
    expected_paths: tuple[str, ...],
    intent: str,
    isolation_note: str | None,
) -> PreflightResult:
    selected_paths = expected_paths or stable_unique(
        [*state.dirty_paths, *state.base_paths]
    )
    classification = classify_paths(selected_paths, intent)
    stop_reasons: list[str] = []
    if not state.branch:
        stop_reasons.append("detached HEAD: branch-scoped mutation and integration require an explicit safe path")
    if not state.base_resolved:
        stop_reasons.append(f"base ref cannot be resolved: {state.base}")
    if expected_paths and paths_overlap(expected_paths, state.dirty_paths):
        stop_reasons.append("expected edit paths overlap existing dirty paths")
    if intent == "local-runtime" and not isolation_note:
        stop_reasons.append("local-runtime intent requires an isolation note that preserves existing services")
    evidence_level = "local-runtime-required" if intent == "local-runtime" else "repository"
    return PreflightResult(
        repository_state=state,
        surfaces=classification.surfaces,
        required_guides=classification.required_guides,
        risk_triggers=classification.risk_triggers,
        recommended_checks=classification.recommended_checks,
        stop_reasons=tuple(stop_reasons),
        evidence_level=evidence_level,
    )


def render_text(result: PreflightResult) -> str:
    payload = asdict(result)
    lines: list[str] = []
    for key in (
        "repository_state",
        "surfaces",
        "required_guides",
        "risk_triggers",
        "recommended_checks",
        "stop_reasons",
        "evidence_level",
    ):
        lines.append(f"{key}:")
        value = payload[key]
        if isinstance(value, dict):
            lines.extend(f"  {name}: {item}" for name, item in value.items())
        elif isinstance(value, (list, tuple)):
            lines.extend(f"  - {item}" for item in value)
        else:
            lines.append(f"  {value}")
    return "\n".join(lines)
```

Replace the scaffold `main` with this complete CLI after adding the arguments:

```python
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect ReadMates agent task readiness")
    parser.add_argument(
        "--intent",
        choices=("analyze", "diagnose", "change", "release", "local-runtime"),
        default="analyze",
    )
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--paths", action="append", default=[])
    parser.add_argument("--isolation-note")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()

    root = Path(__file__).resolve().parent.parent
    state = collect_repository_state(root, args.base)
    result = build_result(
        state,
        tuple(args.paths),
        args.intent,
        args.isolation_note,
    )
    if args.json:
        print(json.dumps(asdict(result), indent=2, sort_keys=True))
    else:
        print(render_text(result))
    return 2 if result.stop_reasons else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Self-test mode must return before resolving or inspecting the real repository.

- [ ] **Step 5: Complete failure-path tests and verify GREEN**

Add tests for:

```python
def test_local_runtime_requires_isolation_note(self) -> None:
    state = RepositoryState("main", "origin/main", True, (), (), ())
    result = build_result(state, ("front/",), "local-runtime", None)
    self.assertTrue(any("isolation note" in reason for reason in result.stop_reasons))

def test_dirty_overlap_becomes_stop_reason(self) -> None:
    state = RepositoryState("main", "origin/main", True, ("server/AGENTS.md",), (), ())
    result = build_result(state, ("server/AGENTS.md",), "change", None)
    self.assertIn("expected edit paths overlap existing dirty paths", result.stop_reasons)

def test_release_intent_selects_whole_branch_review(self) -> None:
    result = classify_paths(("docs/README.md",), "release")
    self.assertIn("release-readiness", result.surfaces)
    self.assertIn("whole-branch-diff", result.risk_triggers)
```

Run:

```bash
python3 -B scripts/agent-preflight.py --self-test
python3 -B scripts/agent-preflight.py --intent change --paths front/functions/api/example.ts --json
python3 -B scripts/agent-preflight.py --intent change --paths server/src/main/resources/db/mysql/migration/V999__example.sql
python3 -B scripts/agent-preflight.py --intent change --paths unknown-area/file.txt
```

Expected: self-tests pass; BFF JSON names both front/server guides and E2E; migration text names server and integration gates; unknown path uses root/project-map fallback with no heavy recommended check. The virtual paths are classification inputs and are not created.

- [ ] **Step 6: Commit the preflight tool**

```bash
git add scripts/agent-preflight.py
git commit -m "feat(tooling): add agent preflight"
```

---

### Task 3: Harden The Agent Guidance Checker

**Files:**
- Modify: `scripts/check-agent-guidance.py:13-268,272-444`

**Interfaces:**
- Consumes: All routers, execution/acceptance docs, `scripts/agent-preflight.py`, root `package.json`, and existing public-release scanner.
- Produces: `LOCAL_ROUTER_CONTRACTS`, `INSTRUCTION_CHAINS`, package-manager drift validation, tracked-router discovery, preflight policy reference checks, and expanded self-tests.
- Preserves: `python3 scripts/check-agent-guidance.py` and `--self-test` CLI compatibility used by pre-push and CI.

- [ ] **Step 1: Extend fixtures and add RED tests first**

Add to `REQUIRED_PATHS`:

```python
    "server/AGENTS.md",
    "front/functions/AGENTS.md",
    "scripts/AGENTS.md",
    "deploy/AGENTS.md",
    "docs/agents/execution.md",
    "docs/development/acceptance-matrix.md",
    "scripts/agent-preflight.py",
    "package.json",
```

Add these contracts:

```python
LOCAL_ROUTER_CONTRACTS = {
    "server/AGENTS.md": ("../AGENTS.md", "../docs/agents/execution.md", "../docs/agents/server.md"),
    "front/functions/AGENTS.md": ("../../AGENTS.md", "../AGENTS.md", "../../docs/agents/execution.md", "../../docs/agents/front.md", "../../docs/agents/server.md"),
    "scripts/AGENTS.md": ("../AGENTS.md", "../docs/agents/execution.md", "../docs/agents/docs.md", "README.md"),
    "deploy/AGENTS.md": ("../AGENTS.md", "../docs/agents/execution.md", "../docs/agents/docs.md", "../docs/deploy/README.md"),
}

INSTRUCTION_CHAINS = {
    "root": ("AGENTS.md",),
    "front": ("AGENTS.md", "front/AGENTS.md"),
    "front/functions": ("AGENTS.md", "front/AGENTS.md", "front/functions/AGENTS.md"),
    "server": ("AGENTS.md", "server/AGENTS.md"),
    "scripts": ("AGENTS.md", "scripts/AGENTS.md"),
    "deploy": ("AGENTS.md", "deploy/AGENTS.md"),
}
```

Update `make_valid_fixture` to write `package.json` with `{"packageManager":"pnpm@11.13.1"}`, write each local router with its required reference strings, and write root guidance containing `pnpm@11.13.1` plus the canonical server command.

Add these tests before implementing new checks:

```python
def test_missing_local_router_reference_fails(self) -> None:
    errors = self.check_fixture(lambda root: write(root, "server/AGENTS.md", "../AGENTS.md\n"))
    self.assertTrue(any("local router reference missing" in error for error in errors), errors)

def test_oversized_front_functions_chain_fails(self) -> None:
    errors = self.check_fixture(
        lambda root: write(root, "front/functions/AGENTS.md", "x" * INSTRUCTION_LIMIT)
    )
    self.assertTrue(any("front/functions" in error for error in errors), errors)

def test_package_manager_version_drift_fails(self) -> None:
    errors = self.check_fixture(
        lambda root: write(root, "AGENTS.md", f"{CANONICAL_SERVER_COMMAND}\npnpm@10.0.0\n")
    )
    self.assertTrue(any("package manager drift" in error for error in errors), errors)

def test_unmapped_agent_router_fails(self) -> None:
    errors = self.check_fixture(lambda root: write(root, "ops/AGENTS.md", "# Unexpected\n"))
    self.assertTrue(any("unsupported AGENTS.md" in error for error in errors), errors)
```

Run:

```bash
python3 -B scripts/check-agent-guidance.py --self-test
```

Expected: FAIL because the current checker does not enforce local references, new chains, package-manager versions, or unexpected routers.

- [ ] **Step 2: Implement router discovery and contract checks**

Add:

```python
def discover_agent_paths(root: Path) -> tuple[str, ...]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode == 0 and result.stdout:
        tracked = (
            item.decode()
            for item in result.stdout.split(b"\0")
            if item
        )
        return tuple(
            sorted(
                relative
                for relative in tracked
                if relative == "AGENTS.md" or relative.endswith("/AGENTS.md")
            )
        )
    return tuple(
        sorted(path.relative_to(root).as_posix() for path in root.rglob("AGENTS.md"))
    )


def check_agent_router_contracts(root: Path) -> list[str]:
    errors: list[str] = []
    supported = {"AGENTS.md", "front/AGENTS.md", *LOCAL_ROUTER_CONTRACTS}
    for relative in discover_agent_paths(root):
        if relative not in supported:
            errors.append(f"unsupported AGENTS.md without chain contract: {relative}")
    for relative, required in LOCAL_ROUTER_CONTRACTS.items():
        path = root / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for reference in required:
            if reference not in text:
                errors.append(f"local router reference missing: {relative} -> {reference}")
    return errors
```

Replace the local `chains` variable in `check_instruction_chains` with `INSTRUCTION_CHAINS`.

- [ ] **Step 3: Implement package-manager and preflight-policy checks**

Add `json` to imports and implement:

```python
PNPM_VERSION_RE = re.compile(r"\bpnpm@(\d+\.\d+\.\d+)\b")
PACKAGE_MANAGER_GUIDANCE_PATHS = (
    "AGENTS.md",
    "docs/development/local-setup.md",
    "docs/development/test-guide.md",
)


def check_package_manager_contract(root: Path) -> list[str]:
    package_path = root / "package.json"
    if not package_path.is_file():
        return []
    package_manager = json.loads(package_path.read_text(encoding="utf-8")).get("packageManager", "")
    expected = package_manager.removeprefix("pnpm@")
    errors: list[str] = []
    for relative in PACKAGE_MANAGER_GUIDANCE_PATHS:
        path = root / relative
        if not path.is_file():
            continue
        for found in PNPM_VERSION_RE.findall(path.read_text(encoding="utf-8")):
            if found != expected:
                errors.append(
                    f"package manager drift: {relative} has pnpm@{found}; expected pnpm@{expected}"
                )
    return errors


def check_preflight_policy_references(root: Path) -> list[str]:
    path = root / "scripts/agent-preflight.py"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    required = (
        "docs/agents/execution.md",
        "docs/development/acceptance-matrix.md",
        "./scripts/server-ci-check.sh",
        "pnpm --dir front test:e2e",
        "./scripts/public-release-check.sh .tmp/public-release-candidate",
    )
    return [
        f"preflight policy reference missing: {reference}"
        for reference in required
        if reference not in text
    ]
```

Call `check_agent_router_contracts`, `check_package_manager_contract`, and `check_preflight_policy_references` from `run_checks` before the public scan. Add the new active docs and local routers to `GUIDANCE_PATHS` through the expanded required-path set so link and staged-safety checks cover them.

- [ ] **Step 4: Expand the staged public-safety fixture**

In `test_guidance_public_scan_stages_release_contract_support_files`, require the mock scanner to see:

```python
required_guidance = (
    "server/AGENTS.md",
    "front/functions/AGENTS.md",
    "scripts/AGENTS.md",
    "deploy/AGENTS.md",
    "docs/agents/execution.md",
    "docs/development/acceptance-matrix.md",
    "scripts/agent-preflight.py",
)
```

Include `required_guidance` in the generated shell assertions. Do not add a second secret regex engine to Python.

- [ ] **Step 5: Verify checker RED-to-GREEN and current-tree behavior**

Run:

```bash
python3 -B scripts/check-agent-guidance.py --self-test
python3 -B scripts/check-agent-guidance.py
python3 -B scripts/agent-preflight.py --self-test
git diff --check -- scripts/check-agent-guidance.py scripts/agent-preflight.py
```

Expected: all checker and preflight tests pass, current-tree guidance scan passes, and no Python bytecode is created because `-B` is used.

- [ ] **Step 6: Commit checker hardening**

```bash
git add scripts/check-agent-guidance.py
git commit -m "test(tooling): harden agent guidance contracts"
```

---

### Task 4: Wire CI And Script Documentation

**Files:**
- Modify: `.github/workflows/ci.yml:24-27`
- Modify: `scripts/README.md:11-18,39-61`

**Interfaces:**
- Consumes: Stable `--self-test` and current-tree CLI contracts from Tasks 2-3.
- Produces: CI order `guidance self-tests -> preflight self-tests -> current-tree guidance check`.
- Preserves: Existing pre-push checker invocation and all existing frontend/server/public-release execution gates.

- [ ] **Step 1: Record the missing CI self-test evidence**

Run:

```bash
sed -n '16,32p' .github/workflows/ci.yml
rg -n "agent-preflight|check-agent-guidance.py --self-test" .github/workflows/ci.yml scripts/README.md || true
```

Expected: CI runs only `python3 scripts/check-agent-guidance.py`; no preflight or mandatory self-test step exists.

- [ ] **Step 2: Add the fast CI self-test step**

Replace the single guidance step with:

```yaml
      - name: Agent tooling self-tests
        run: |
          python3 -B scripts/check-agent-guidance.py --self-test
          python3 -B scripts/agent-preflight.py --self-test

      - name: Agent guidance contract
        run: python3 -B scripts/check-agent-guidance.py
```

Keep this before apt installation and all heavier jobs. Do not add live Codex, LLM, network-provider, frontend, or Gradle calls to the scripts job.

- [ ] **Step 3: Document preflight semantics and examples**

Add a `scripts/agent-preflight.py` section after the checker section in `scripts/README.md`:

```markdown
## `agent-preflight.py`

`agent-preflight.py` reads Git state plus current or expected paths and prints the required guides, ReadMates risk triggers, canonical recommended checks, stop reasons, and evidence level. It is read-only: it never executes the recommended commands or changes repository/runtime state.

```bash
python3 -B scripts/agent-preflight.py --intent change --paths front/functions/api/example.ts
python3 -B scripts/agent-preflight.py --intent change --paths server/src/main/resources/db/mysql/migration/V999__example.sql --json
python3 -B scripts/agent-preflight.py --intent local-runtime --paths front/ --isolation-note "preserve existing services and use an alternate port"
python3 -B scripts/agent-preflight.py --self-test
```

Exit code 2 means a stop reason requires resolution, such as detached HEAD, unresolved base, dirty overlap, or missing local-runtime isolation. Recommended checks remain canonical commands owned by existing scripts and guides; preflight does not replace `pre-push-check.sh`.
```

Update the checker section to state that CI runs `--self-test` and the current-tree check separately. Keep the existing pre-push documentation unchanged except for a cross-reference to preflight as planning support.

- [ ] **Step 4: Verify CI syntax shape and documentation**

Run:

```bash
python3 -B scripts/check-agent-guidance.py --self-test
python3 -B scripts/agent-preflight.py --self-test
python3 -B scripts/check-agent-guidance.py
rg -n "Agent tooling self-tests|check-agent-guidance.py --self-test|agent-preflight.py --self-test|Agent guidance contract" .github/workflows/ci.yml
git diff --check -- .github/workflows/ci.yml scripts/README.md
```

Expected: both self-test suites and actual guidance pass; CI contains the self-test block before the actual contract; whitespace check passes.

- [ ] **Step 5: Commit CI and documentation integration**

```bash
git add .github/workflows/ci.yml scripts/README.md
git commit -m "ci: verify agent tooling contracts"
```

---

### Task 5: Run Full Guidance And Public-Release Verification

**Files:**
- No source edits expected. If a check exposes a defect, modify only the owning file from Tasks 1-4, rerun its focused tests, and amend by adding a new fix commit rather than rewriting unrelated history.

**Interfaces:**
- Consumes: All implementation commits and `origin/main` as the branch base.
- Produces: Fresh deterministic, public-safety, candidate-boundary, and residual-risk evidence.

- [ ] **Step 1: Verify repository state and the complete branch range**

Run:

```bash
git status --short --branch --untracked-files=all
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
git diff --check origin/main..HEAD
```

Expected: only the approved design, plan, guidance, preflight, checker, CI, and documentation files appear; no frontend/server product source, migration, generated artifact, or ignored orchestration state is included.

- [ ] **Step 2: Run all deterministic agent-tooling checks**

Run:

```bash
python3 -B scripts/check-agent-guidance.py --self-test
python3 -B scripts/agent-preflight.py --self-test
python3 -B scripts/check-agent-guidance.py
python3 -B scripts/agent-preflight.py --intent change --paths front/functions/api/example.ts --json
python3 -B scripts/agent-preflight.py --intent change --paths server/src/main/resources/db/mysql/migration/V999__example.sql
python3 -B scripts/agent-preflight.py --intent release --paths .github/workflows/ci.yml
```

Expected: all self-tests and current guidance pass; representative outputs select BFF/E2E, migration/integration, and whole-branch release risks respectively; none of the virtual input paths is created.

- [ ] **Step 3: Run targeted documentation safety checks**

Run:

```bash
guidance_docs=(
  AGENTS.md
  server/AGENTS.md
  front/functions/AGENTS.md
  scripts/AGENTS.md
  deploy/AGENTS.md
  docs/agents/execution.md
  docs/agents/docs.md
  docs/development/acceptance-matrix.md
  docs/development/project-map.md
  docs/development/vertical-slice-checklist.md
  README.md
  docs/README.md
  docs/development/README.md
  scripts/README.md
)
git diff --check origin/main..HEAD -- "${guidance_docs[@]}"
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" "${guidance_docs[@]}"
```

Expected: whitespace check passes and targeted safety scan returns no matches.

- [ ] **Step 4: Prove the clean public candidate boundary**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
find .tmp/public-release-candidate -name AGENTS.md -print
test -f .tmp/public-release-candidate/docs/agents/execution.md
test -f .tmp/public-release-candidate/docs/development/acceptance-matrix.md
```

Expected: candidate build and scanner pass; `find` prints nothing because local routers remain private guidance; both public-safe active docs exist in the candidate.

- [ ] **Step 5: Record scoped validation and residual risk**

Run:

```bash
git status --short --branch --untracked-files=all
git log -5 --oneline --decorate
```

Expected: worktree is clean and `main` remains ahead of `origin/main` only by the local approved design, plan, and implementation commits.

Record these scope decisions in the handoff:

- Frontend lint/test/build, server Gradle, integrationTest, and E2E were not run because no product code, API, auth behavior, persistence, migration, or runtime behavior changed.
- No push, PR, tag, deploy, production inspection, or production mutation was performed.
- CI YAML was verified through exact command presence and local execution of the referenced Python commands; GitHub-hosted CI remains remote evidence until it runs after a push or PR.

---

## Final Requirement Traceability

| Approved design requirement | Implementation task |
| --- | --- |
| Compact root router and pointer-first high-risk local routers | Task 1 |
| Shared execution, authority, isolation, artifact, and evidence contract | Task 1 |
| ReadMates actor/context/lifecycle/visibility/failure selection matrix | Task 1 |
| Read-only text/JSON preflight with stop reasons | Task 2 |
| Dynamic router, chain, package-manager, policy, link, and public-safety checks | Task 3 |
| Checker and preflight self-tests required in CI | Task 4 |
| Preserve existing pre-push and product verification sources of truth | Tasks 2-4 |
| Clean public-candidate exclusion of local routers and inclusion of public-safe active docs | Task 5 |
| Exact evidence, skipped validation, and residual-risk handoff | Task 5 |
