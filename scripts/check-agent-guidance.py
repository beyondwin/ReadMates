#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

INSTRUCTION_LIMIT = 32 * 1024
RELEASE_CHECKLIST_LIMIT = 20 * 1024
STALE_SERVER_COMMAND = "./server/gradlew -p server clean test"
CANONICAL_SERVER_COMMAND = "./scripts/server-ci-check.sh"
DIRECT_PNPM_RE = re.compile(r"\bnpx --yes pnpm@\d")
MARKDOWN_LINK_RE = re.compile(r"!?\[[^]]+\]\(([^)]+)\)")
SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")

REQUIRED_PATHS = (
    "AGENTS.md",
    "front/AGENTS.md",
    "CLAUDE.md",
    "front/CLAUDE.md",
    ".claude/settings.json",
    ".claude/commands/release-readiness.md",
    ".impeccable.md",
    "docs/agents/front.md",
    "docs/agents/server.md",
    "docs/agents/design.md",
    "docs/agents/docs.md",
    "docs/development/project-map.md",
    "docs/development/vertical-slice-checklist.md",
    "docs/development/release-readiness-review.md",
    "docs/reports/2026-07-11-release-readiness-history.md",
    ".graphifyignore",
    "scripts/README.md",
    "scripts/public-release-check.sh",
)

NORMATIVE_COMMAND_PATHS = (
    "AGENTS.md",
    "README.md",
    "docs/agents/server.md",
    "docs/deploy/README.md",
    "docs/deploy/compose-stack.md",
    "docs/deploy/release-publish-runbook.md",
    "docs/development/adr/0002-server-clean-architecture-with-archunit.md",
    "docs/development/adr/0007-mysql-with-flyway-over-alternatives.md",
    "docs/development/project-map.md",
    "docs/development/release-management.md",
    "docs/development/release-readiness-review.md",
    "docs/development/technical-decisions.md",
    "docs/development/test-guide.md",
    "scripts/README.md",
)
DIRECT_PNPM_FORBIDDEN_PATHS = (
    "docs/development/local-setup.md",
    "docs/development/performance-budget.md",
    "docs/development/project-map.md",
)
SERVER_GATE_REQUIRED_PATHS = (
    "AGENTS.md",
    "README.md",
    "docs/agents/server.md",
    "docs/deploy/README.md",
    "docs/deploy/compose-stack.md",
    "docs/deploy/release-publish-runbook.md",
    "docs/development/adr/0002-server-clean-architecture-with-archunit.md",
    "docs/development/project-map.md",
    "docs/development/release-management.md",
    "docs/development/release-readiness-review.md",
    "docs/development/technical-decisions.md",
    "docs/development/test-guide.md",
    "scripts/README.md",
)
GUIDANCE_PATHS = tuple(
    sorted(
        set(REQUIRED_PATHS + NORMATIVE_COMMAND_PATHS + DIRECT_PNPM_FORBIDDEN_PATHS)
        - {
            "scripts/public-release-check.sh",
            "docs/reports/2026-07-11-release-readiness-history.md",
        }
    )
)
LINK_CHECK_PATHS = tuple(
    relative
    for relative in GUIDANCE_PATHS
    if relative.endswith(".md")
    and relative != "docs/reports/2026-07-11-release-readiness-history.md"
)
def write(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def make_valid_fixture(root: Path) -> None:
    paths = set(REQUIRED_PATHS + NORMATIVE_COMMAND_PATHS + DIRECT_PNPM_FORBIDDEN_PATHS)
    for relative in paths:
        write(root, relative, "# Guidance\n")
    for relative in SERVER_GATE_REQUIRED_PATHS:
        write(root, relative, f"# Guidance\n\n```bash\n{CANONICAL_SERVER_COMMAND}\n```\n")
    write(root, "CLAUDE.md", "@AGENTS.md\n")
    write(root, "front/CLAUDE.md", "@AGENTS.md\n")
    write(root, ".graphifyignore", ".waygent/\n")
    write(
        root,
        "docs/development/release-readiness-review.md",
        f"# Active checklist\n\n{CANONICAL_SERVER_COMMAND}\n",
    )
    write(root, "docs/reports/2026-07-11-release-readiness-history.md", "# History\n")
    write(root, "scripts/public-release-check.sh", "#!/usr/bin/env bash\nexit 0\n")


def fenced_lines(text: str) -> list[str]:
    lines: list[str] = []
    inside = False
    for raw in text.splitlines():
        if raw.lstrip().startswith("```"):
            inside = not inside
            continue
        if inside:
            lines.append(raw.strip())
    return lines


def check_required_paths(root: Path) -> list[str]:
    return [
        f"missing required path: {relative}"
        for relative in REQUIRED_PATHS
        if not (root / relative).is_file()
    ]


def check_markdown_links(root: Path) -> list[str]:
    errors: list[str] = []
    repository_root = root.resolve()
    for relative in LINK_CHECK_PATHS:
        source = root / relative
        if not source.is_file() or source.suffix != ".md":
            continue
        for raw in MARKDOWN_LINK_RE.findall(source.read_text(encoding="utf-8")):
            target = raw.strip().strip("<>")
            if not target or target.startswith("#") or SCHEME_RE.match(target):
                continue
            target_path = target.split("#", 1)[0]
            if not target_path:
                continue
            resolved = (source.parent / target_path).resolve()
            try:
                resolved.relative_to(repository_root)
            except ValueError:
                errors.append(f"link outside repository: {relative} -> {target_path}")
                continue
            if not resolved.exists():
                errors.append(f"broken link: {relative} -> {target_path}")
    return errors


def check_instruction_chains(root: Path) -> list[str]:
    errors: list[str] = []
    chains = {
        "root": ("AGENTS.md",),
        "front": ("AGENTS.md", "front/AGENTS.md"),
    }
    for name, paths in chains.items():
        total = sum(
            (root / relative).stat().st_size
            for relative in paths
            if (root / relative).is_file()
        )
        if total >= INSTRUCTION_LIMIT:
            errors.append(
                f"instruction chain {name} is {total} bytes; must be below {INSTRUCTION_LIMIT}"
            )
    return errors


def check_normative_commands(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in NORMATIVE_COMMAND_PATHS:
        path = root / relative
        if path.is_file() and any(
            STALE_SERVER_COMMAND in line
            for line in fenced_lines(path.read_text(encoding="utf-8"))
        ):
            errors.append(f"stale server command in runnable block: {relative}")
    for relative in DIRECT_PNPM_FORBIDDEN_PATHS:
        path = root / relative
        if path.is_file() and DIRECT_PNPM_RE.search(path.read_text(encoding="utf-8")):
            errors.append(f"direct pnpm bypasses Corepack-first policy: {relative}")
    for relative in SERVER_GATE_REQUIRED_PATHS:
        path = root / relative
        if path.is_file() and CANONICAL_SERVER_COMMAND not in path.read_text(encoding="utf-8"):
            errors.append(f"canonical server gate missing: {relative}")
    return errors


def check_pointer_contract(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in ("CLAUDE.md", "front/CLAUDE.md"):
        path = root / relative
        if path.is_file() and path.read_text(encoding="utf-8") != "@AGENTS.md\n":
            errors.append(f"pointer contract violation: {relative}")
    return errors


def check_graphify_ignore(root: Path) -> list[str]:
    path = root / ".graphifyignore"
    if not path.is_file():
        return []
    lines = {line.strip() for line in path.read_text(encoding="utf-8").splitlines()}
    return [] if ".waygent/" in lines else [".graphifyignore must contain .waygent/"]


def check_release_docs(root: Path) -> list[str]:
    active = root / "docs/development/release-readiness-review.md"
    history = root / "docs/reports/2026-07-11-release-readiness-history.md"
    errors: list[str] = []
    if active.is_file() and active.stat().st_size >= RELEASE_CHECKLIST_LIMIT:
        errors.append(
            f"release checklist is {active.stat().st_size} bytes; must be below {RELEASE_CHECKLIST_LIMIT}"
        )
    if not history.is_file():
        errors.append("release readiness history report is missing")
    return errors


def run_guidance_public_scan(root: Path) -> list[str]:
    scanner = root / "scripts/public-release-check.sh"
    if not scanner.is_file():
        return ["public release scanner is missing"]
    with tempfile.TemporaryDirectory(prefix="readmates-guidance-scan-") as raw:
        staged = Path(raw)
        for relative in GUIDANCE_PATHS:
            source = root / relative
            if not source.is_file():
                continue
            destination = staged / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        result = subprocess.run(
            [str(scanner), str(staged)],
            cwd=root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        if result.returncode != 0:
            return ["guidance public-safety scan failed:\n" + result.stdout.rstrip()]
    return []


def run_checks(root: Path, *, run_public_scan: bool) -> list[str]:
    errors: list[str] = []
    errors.extend(check_required_paths(root))
    errors.extend(check_markdown_links(root))
    errors.extend(check_instruction_chains(root))
    errors.extend(check_normative_commands(root))
    errors.extend(check_pointer_contract(root))
    errors.extend(check_graphify_ignore(root))
    errors.extend(check_release_docs(root))
    if run_public_scan and not errors:
        errors.extend(run_guidance_public_scan(root))
    return errors


class GuidanceCheckerTests(unittest.TestCase):
    def check_fixture(self, mutate=None) -> list[str]:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            if mutate is not None:
                mutate(root)
            return run_checks(root, run_public_scan=False)

    def test_valid_fixture(self) -> None:
        self.assertEqual([], self.check_fixture())

    def test_broken_link_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "docs/development/project-map.md", "[missing](missing.md)\n")
        )
        self.assertTrue(any("broken link" in error for error in errors), errors)

    def test_broken_link_in_active_guidance_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "docs/development/local-setup.md", "[missing](missing.md)\n")
        )
        self.assertTrue(any("broken link" in error for error in errors), errors)

    def test_link_outside_repository_fails(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-link-test-") as raw:
            parent = Path(raw)
            root = parent / "repo"
            root.mkdir()
            make_valid_fixture(root)
            write(parent, "outside.md", "# Outside\n")
            write(root, "docs/development/project-map.md", "[outside](../../../outside.md)\n")
            errors = run_checks(root, run_public_scan=False)
            self.assertTrue(any("outside repository" in error for error in errors), errors)

    def test_active_command_policy_file_links_are_checked(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/release-management.md",
                f"[unrelated missing reference](missing.md)\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertTrue(any("broken link" in error for error in errors), errors)

    def test_missing_release_bypass_ledger_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/release-management.md",
                "[bypass ledger](../operations/runbooks/release-bypass-ledger.md)\n"
                f"{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertTrue(any("release-bypass-ledger.md" in error for error in errors), errors)

    def test_runnable_clean_test_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/project-map.md",
                f"```bash\n{STALE_SERVER_COMMAND}\n```\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertTrue(any("stale server command" in error for error in errors), errors)

    def test_runnable_clean_test_with_arguments_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/project-map.md",
                f"```bash\n{STALE_SERVER_COMMAND} --info\n```\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertTrue(any("stale server command" in error for error in errors), errors)

    def test_explanatory_clean_test_is_allowed(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/test-guide.md",
                f"Do not use `{STALE_SERVER_COMMAND}` as evidence.\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertFalse(any("stale server command" in error for error in errors), errors)

    def test_direct_pnpm_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/performance-budget.md",
                "```bash\nnpx --yes pnpm@10.33.0 --dir front build\n```\n",
            )
        )
        self.assertTrue(any("direct pnpm" in error for error in errors), errors)

    def test_oversized_instruction_chain_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "AGENTS.md", "x" * (INSTRUCTION_LIMIT + 1))
        )
        self.assertTrue(any("instruction chain" in error for error in errors), errors)

    def test_missing_waygent_exclusion_fails(self) -> None:
        errors = self.check_fixture(lambda root: write(root, ".graphifyignore", "graphify-out/\n"))
        self.assertTrue(any(".waygent/" in error for error in errors), errors)

    def test_oversized_release_checklist_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/release-readiness-review.md",
                "x" * (RELEASE_CHECKLIST_LIMIT + 1),
            )
        )
        self.assertTrue(any("release checklist" in error for error in errors), errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check ReadMates agent guidance invariants")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run temporary positive/negative fixtures",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(GuidanceCheckerTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1

    root = Path(__file__).resolve().parent.parent
    errors = run_checks(root, run_public_scan=True)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("ReadMates agent guidance check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
