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
    (
        "git diff --check",
        "./scripts/build-public-release-candidate.sh",
        "./scripts/public-release-check.sh .tmp/public-release-candidate",
    ),
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


def rule_matches(path: str, rule: PathRule) -> bool:
    return not rule.prefixes or any(matches(path, prefix) for prefix in rule.prefixes)


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
            if rule_matches(path, rule):
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


def paths_overlap(expected: tuple[str, ...], dirty: tuple[str, ...]) -> bool:
    def overlaps(left: str, right: str) -> bool:
        left = left.rstrip("/")
        right = right.rstrip("/")
        return left == right or left.startswith(right + "/") or right.startswith(left + "/")

    return any(overlaps(left, right) for left in expected for right in dirty)


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

    def test_root_agent_guide_uses_documentation_policy(self) -> None:
        result = classify_paths(("AGENTS.md",), "change")
        self.assertEqual(("documentation",), result.surfaces)
        self.assertIn("docs/agents/docs.md", result.required_guides)
        self.assertIn("public-safety", result.risk_triggers)
        self.assertIn("git diff --check", result.recommended_checks)

    def test_local_router_documentation_precedes_server_policy(self) -> None:
        result = classify_paths(("server/AGENTS.md",), "change")
        self.assertEqual(("documentation",), result.surfaces)
        self.assertNotIn("server", result.surfaces)
        self.assertNotIn("./scripts/server-ci-check.sh", result.recommended_checks)

    def test_bff_local_router_documentation_precedes_bff_policy(self) -> None:
        result = classify_paths(("front/functions/AGENTS.md",), "change")
        self.assertEqual(("documentation",), result.surfaces)
        self.assertNotIn("bff-auth", result.surfaces)
        self.assertNotIn("pnpm --dir front test:e2e", result.recommended_checks)

    def test_nested_documentation_path_uses_documentation_policy(self) -> None:
        result = classify_paths(("docs/development/example.md",), "change")
        self.assertEqual(("documentation",), result.surfaces)
        self.assertIn("docs/agents/execution.md", result.required_guides)

    def test_text_and_json_share_complete_result_model(self) -> None:
        state = RepositoryState("main", "origin/main", True, ("docs/README.md",), (), ())
        result = build_result(state, ("docs/README.md",), "change", None)
        encoded = json.loads(json.dumps(asdict(result), sort_keys=True))
        rendered = render_text(result)
        self.assertEqual("documentation", encoded["surfaces"][0])
        self.assertEqual("main", encoded["repository_state"]["branch"])
        self.assertIn("repository_state:", rendered)
        self.assertIn("documentation", rendered)
        self.assertIn("recommended_checks:", rendered)


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


def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AgentPreflightTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


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
