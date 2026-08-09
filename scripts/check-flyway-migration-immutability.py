#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path


MIGRATION_DIRECTORY = Path("server/src/main/resources/db/mysql/migration")
MAIN_RESOURCES_DIRECTORY = Path("server/src/main/resources")
SQL_SENTINEL = "PRIVATE_SQL_BODY_SENTINEL"
MIGRATION_NAME_RE = re.compile(r"^V([0-9]+)__([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$")
VERSION_LOOKING_RE = re.compile(r"^V[0-9]+__.*\.sql$")
MAX_PATH_DISPLAY = 240
MAX_REPORTED_VIOLATIONS = 100

VALID_WORKFLOW_FIXTURE = r'''name: CI
on: [pull_request, push]
permissions:
  contents: read
jobs:
  scripts:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@0000000000000000000000000000000000000000
        with:
          fetch-depth: 0
      - name: Flyway migration checker self-tests
        run: python3 -B scripts/check-flyway-migration-immutability.py --self-test
      - name: Flyway migration workflow contract
        run: python3 -B scripts/check-flyway-migration-immutability.py --check-workflow .github/workflows/ci.yml
      - name: Flyway migration history immutability
        env:
          READMATES_FLYWAY_EVENT_NAME: ${{ github.event_name }}
          READMATES_FLYWAY_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          READMATES_FLYWAY_PUSH_BEFORE_SHA: ${{ github.event.before }}
        shell: bash
        run: |
          base_sha=""
          case "${READMATES_FLYWAY_EVENT_NAME}" in
            pull_request)
              base_sha="${READMATES_FLYWAY_PR_BASE_SHA}"
              ;;
            push)
              base_sha="${READMATES_FLYWAY_PUSH_BEFORE_SHA}"
              if [[ "$base_sha" =~ ^0+$ ]]; then
                if ! base_sha="$(git rev-parse --verify --quiet 'HEAD^^{commit}')"; then
                  echo "Flyway comparison base is unavailable." >&2
                  exit 1
                fi
              fi
              ;;
            *)
              echo "Unsupported Flyway comparison event." >&2
              exit 1
              ;;
          esac
          if [[ -z "$base_sha" ]]; then
            echo "Flyway comparison base is empty." >&2
            exit 1
          fi
          if ! base_sha="$(git rev-parse --verify --quiet "${base_sha}^{commit}")"; then
            echo "Flyway comparison base cannot be resolved locally." >&2
            exit 1
          fi
          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"
'''

CANONICAL_HISTORY_RUN = r'''base_sha=""
case "${READMATES_FLYWAY_EVENT_NAME}" in
  pull_request)
    base_sha="${READMATES_FLYWAY_PR_BASE_SHA}"
    ;;
  push)
    base_sha="${READMATES_FLYWAY_PUSH_BEFORE_SHA}"
    if [[ "$base_sha" =~ ^0+$ ]]; then
      if ! base_sha="$(git rev-parse --verify --quiet 'HEAD^^{commit}')"; then
        echo "Flyway comparison base is unavailable." >&2
        exit 1
      fi
    fi
    ;;
  *)
    echo "Unsupported Flyway comparison event." >&2
    exit 1
    ;;
esac
if [[ -z "$base_sha" ]]; then
  echo "Flyway comparison base is empty." >&2
  exit 1
fi
if ! base_sha="$(git rev-parse --verify --quiet "${base_sha}^{commit}")"; then
  echo "Flyway comparison base cannot be resolved locally." >&2
  exit 1
fi
python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"
'''


@dataclass(frozen=True)
class Migration:
    path: str
    version: int
    content: bytes
    object_id: str | None = None


@dataclass(frozen=True, order=True)
class Violation:
    category: str
    path: str
    detail: str


@dataclass(frozen=True, order=True)
class WorkflowViolation:
    category: str
    detail: str


def _top_level_block(source: str, name: str) -> str | None:
    lines = source.splitlines(keepends=True)
    marker = f"{name}:"
    start = next((index for index, line in enumerate(lines) if line.rstrip() == marker), None)
    if start is None:
        return None
    end = len(lines)
    for index in range(start + 1, len(lines)):
        line = lines[index]
        if line.strip() and not line.startswith((" ", "\t", "#")):
            end = index
            break
    return "".join(lines[start:end])


def _scripts_job_block(source: str) -> str | None:
    jobs = _top_level_block(source, "jobs")
    if jobs is None:
        return None
    lines = jobs.splitlines(keepends=True)
    start = next((index for index, line in enumerate(lines) if line.rstrip() == "  scripts:"), None)
    if start is None:
        return None
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if re.fullmatch(r"  [A-Za-z0-9_-]+:\s*(?:#.*)?\n?", lines[index]):
            end = index
            break
    return "".join(lines[start:end])


def _workflow_step_blocks(job: str) -> list[str]:
    lines = job.splitlines(keepends=True)
    starts = [index for index, line in enumerate(lines) if line.startswith("      - ")]
    return [
        "".join(lines[start : starts[position + 1] if position + 1 < len(starts) else len(lines)])
        for position, start in enumerate(starts)
    ]


def _active_yaml_lines(source: str) -> tuple[str, ...]:
    active: list[str] = []
    for line in source.splitlines():
        stripped = line.rstrip()
        if not stripped.strip() or stripped.lstrip().startswith("#"):
            continue
        if " #" in stripped:
            stripped = stripped.split(" #", 1)[0].rstrip()
        active.append(stripped)
    return tuple(active)


def _workflow_step_name(step: str) -> str | None:
    active = _active_yaml_lines(step)
    if not active:
        return None
    match = re.fullmatch(r"      - name:\s*(.+)", active[0])
    return match.group(1) if match else None


def _workflow_run_block(step: str) -> str:
    lines = step.splitlines(keepends=True)
    for index, line in enumerate(lines):
        match = re.match(r"^        run:\s*(.*)$", line.rstrip("\n"))
        if match is None:
            continue
        value = match.group(1)
        if value in ("|", ">"):
            return "".join(lines[index + 1 :])
        return value + "\n"
    return ""


def _active_run_source(step: str) -> str:
    return "".join(
        line for line in _workflow_run_block(step).splitlines(keepends=True) if not line.lstrip().startswith("#")
    )


def _canonical_history_body(step: str) -> str | None:
    body: list[str] = []
    for line in _workflow_run_block(step).splitlines(keepends=True):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith("          "):
            return None
        body.append(line[10:])
    return "".join(body)


def _step_metadata(step: str) -> tuple[str, ...]:
    active = _active_yaml_lines(step)
    for index, line in enumerate(active):
        if line.startswith("        run:"):
            return active[: index + 1]
    return active


def _normalized_checkout_step(step: str) -> tuple[str, ...] | None:
    normalized: list[str] = []
    for line in _active_yaml_lines(step):
        if line.startswith("        uses:"):
            if re.fullmatch(r"        uses:\s*actions/checkout@[0-9a-f]{40}", line) is None:
                return None
            normalized.append("        uses: actions/checkout@<commit>")
        else:
            normalized.append(line)
    return tuple(normalized)


def validate_ci_workflow(source: str) -> list[WorkflowViolation]:
    """Validate only the Flyway history contract in the CI scripts job."""
    violations: list[WorkflowViolation] = []
    permissions = _top_level_block(source, "permissions")
    if permissions is None or _active_yaml_lines(permissions) != ("permissions:", "  contents: read"):
        violations.append(
            WorkflowViolation("workflow-permissions-unsafe", "top-level contents permission must remain read-only")
        )

    scripts_job = _scripts_job_block(source)
    if scripts_job is None:
        return violations + [
            WorkflowViolation("workflow-scripts-job-missing", "the scripts job is required for Flyway history checks")
        ]

    job_active = _active_yaml_lines(scripts_job)
    if any(re.match(r"^    (?:continue-on-error|if|permissions):", line) for line in job_active):
        violations.append(
            WorkflowViolation(
                "workflow-scripts-job-unsafe",
                "the scripts job must not override permissions, guard execution, or tolerate failure",
            )
        )

    steps = _workflow_step_blocks(scripts_job)
    named_steps: dict[str, list[str]] = {}
    for step in steps:
        name = _workflow_step_name(step)
        if name is not None:
            named_steps.setdefault(name, []).append(step)

    checkout_name = "Check out repository"
    checkout_steps = named_steps.get(checkout_name, [])
    checkout_uses = [
        step
        for step in steps
        if any(re.match(r"^        uses:\s*actions/checkout@", line) for line in _active_yaml_lines(step))
    ]
    expected_checkout = (
        "      - name: Check out repository",
        "        uses: actions/checkout@<commit>",
        "        with:",
        "          fetch-depth: 0",
    )
    if (
        len(checkout_steps) != 1
        or len(checkout_uses) != 1
        or _normalized_checkout_step(checkout_steps[0]) != expected_checkout
    ):
        violations.append(
            WorkflowViolation(
                "workflow-scripts-checkout-history",
                "the scripts checkout must be one exact pinned action step with fetch-depth 0",
            )
        )

    checker_command = "python3 -B scripts/check-flyway-migration-immutability.py"
    exact_gates = (
        (
            "Flyway migration checker self-tests",
            (
                "      - name: Flyway migration checker self-tests",
                f"        run: {checker_command} --self-test",
            ),
            "workflow-self-test-missing",
            "checker self-test step is required in its exact active shape",
        ),
        (
            "Flyway migration workflow contract",
            (
                "      - name: Flyway migration workflow contract",
                f"        run: {checker_command} --check-workflow .github/workflows/ci.yml",
            ),
            "workflow-contract-check-missing",
            "workflow contract step is required in its exact active shape",
        ),
    )
    for name, expected, category, detail in exact_gates:
        matches = named_steps.get(name, [])
        if len(matches) != 1 or _active_yaml_lines(matches[0]) != expected:
            violations.append(WorkflowViolation(category, detail))
            if matches:
                violations.append(
                    WorkflowViolation(
                        "workflow-gate-shape-unsafe",
                        "Flyway gate steps must match the canonical active shape exactly",
                    )
                )
            continue

    history_name = "Flyway migration history immutability"
    history_matches = named_steps.get(history_name, [])
    history_step = history_matches[0] if len(history_matches) == 1 else ""
    expected_history_metadata = (
        "      - name: Flyway migration history immutability",
        "        env:",
        "          READMATES_FLYWAY_EVENT_NAME: ${{ github.event_name }}",
        "          READMATES_FLYWAY_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}",
        "          READMATES_FLYWAY_PUSH_BEFORE_SHA: ${{ github.event.before }}",
        "        shell: bash",
        "        run: |",
    )
    history_shape_valid = (
        bool(history_step)
        and _step_metadata(history_step) == expected_history_metadata
        and _canonical_history_body(history_step) == CANONICAL_HISTORY_RUN
    )
    if not history_shape_valid:
        violations.extend(
            (
                WorkflowViolation(
                    "workflow-history-check-missing",
                    "real history comparison step is required in its exact active shape",
                ),
                WorkflowViolation(
                    "workflow-gate-shape-unsafe",
                    "Flyway gate steps must match the canonical active shape exactly",
                ),
                WorkflowViolation(
                    "workflow-event-base-unsafe",
                    "event base environment and history script must match the canonical active contract",
                ),
            )
        )

    gate_names = {name for name, *_ in exact_gates} | {history_name}
    gate_steps = [step for name in gate_names for step in named_steps.get(name, [])]
    if any(re.search(r"(?m)^\s*continue-on-error\s*:", step) for step in gate_steps):
        violations.append(
            WorkflowViolation(
                "workflow-gate-continue-on-error",
                "Flyway gates must not continue after failure",
            )
        )
    always_success = re.compile(
        r"\|\|\s*(?:true|:)(?:\s|$)|;\s*true(?:\s|$)|^\s*if:\s*.*always\(\)",
        re.MULTILINE,
    )
    if any(always_success.search(step) for step in gate_steps):
        violations.append(
            WorkflowViolation(
                "workflow-gate-always-success",
                "Flyway gates must not hide failure with an always-success fallback",
            )
        )

    if history_step:
        run_block = _active_run_source(history_step)
        if re.search(
            r"(?m)^\s*(?:git\s+(?:fetch|pull|push|clone|ls-remote)|git\s+remote\s+update|gh|curl|wget|ssh|scp)\b",
            run_block,
        ):
            violations.append(
                WorkflowViolation(
                    "workflow-network-forbidden",
                    "the history gate must use only checkout-provided local history",
                )
            )

    return sorted(set(violations))


def check_workflow(path: Path) -> int:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        print("[workflow-unreadable] workflow: CI workflow cannot be read safely", file=sys.stderr)
        return 1
    violations = validate_ci_workflow(source)
    if violations:
        for violation in violations:
            print(f"[{violation.category}] workflow: {violation.detail}", file=sys.stderr)
        return 1
    print("Flyway CI workflow contract passed.")
    return 0


def _git_environment(allow_lazy_fetch: bool = False) -> dict[str, str]:
    environment = os.environ.copy()
    if allow_lazy_fetch:
        environment.pop("GIT_NO_LAZY_FETCH", None)
    else:
        environment["GIT_NO_LAZY_FETCH"] = "1"
    return environment


def _git_line(output: str) -> str:
    return output.removesuffix("\n")


def _run_git(
    repo: Path,
    *args: str,
    allow_lazy_fetch: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
        env=_git_environment(allow_lazy_fetch),
    )


def _run_git_bytes(repo: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        check=False,
        env=_git_environment(),
    )


def _public_path(relative: str) -> str:
    escaped = relative.encode("unicode_escape", errors="backslashreplace").decode("ascii")
    escaped = re.sub(r"(?i)(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+", "<redacted>", escaped)
    if len(escaped) > MAX_PATH_DISPLAY:
        return escaped[: MAX_PATH_DISPLAY - 3] + "..."
    return escaped


def _classify_name(
    path: str,
    violations: list[Violation],
    category_prefix: str = "",
) -> int | None:
    name = Path(path).name
    if not name.endswith(".sql"):
        violations.append(
            Violation(
                f"{category_prefix}catalog-non-sql",
                _public_path(path),
                "only .sql migrations are allowed",
            )
        )
        return None
    match = MIGRATION_NAME_RE.fullmatch(name)
    if match is None:
        violations.append(
            Violation(
                f"{category_prefix}catalog-malformed-name",
                _public_path(path),
                "expected V{positive integer}__{lower_snake_case_description}.sql",
            )
        )
        return None
    version = int(match.group(1), 10)
    if version == 0:
        violations.append(
            Violation(
                f"{category_prefix}catalog-zero-version",
                _public_path(path),
                "migration versions must be positive",
            )
        )
        return None
    return version


def _parse_ls_tree(output: bytes) -> list[tuple[str, str, str, str]] | None:
    entries: list[tuple[str, str, str, str]] = []
    try:
        for record in output.split(b"\0"):
            if not record:
                continue
            metadata, raw_path = record.split(b"\t", 1)
            mode, object_type, object_id = metadata.decode("ascii").split(" ", 2)
            path = raw_path.decode("utf-8")
            entries.append((mode, object_type, object_id, path))
    except (UnicodeDecodeError, ValueError):
        return None
    return entries


def _parse_index(output: bytes) -> list[tuple[str, str, int, str]] | None:
    entries: list[tuple[str, str, int, str]] = []
    try:
        for record in output.split(b"\0"):
            if not record:
                continue
            metadata, raw_path = record.split(b"\t", 1)
            mode, object_id, stage = metadata.decode("ascii").split(" ", 2)
            path = raw_path.decode("utf-8")
            entries.append((mode, object_id, int(stage, 10), path))
    except (UnicodeDecodeError, ValueError):
        return None
    return entries


def _base_catalog(repo: Path, merge_base: str) -> tuple[list[Migration], list[Violation]]:
    result = _run_git_bytes(
        repo,
        "ls-tree",
        "-r",
        "-z",
        "--full-tree",
        merge_base,
        "--",
        MAIN_RESOURCES_DIRECTORY.as_posix(),
    )
    if result.returncode != 0:
        return [], [
            Violation(
                "history-incomplete",
                MAIN_RESOURCES_DIRECTORY.as_posix(),
                "base tree cannot be enumerated",
            )
        ]
    entries = _parse_ls_tree(result.stdout)
    if entries is None:
        return [], [
            Violation(
                "catalog-path-encoding",
                MAIN_RESOURCES_DIRECTORY.as_posix(),
                "base tree has an unsupported path",
            )
        ]

    migrations: list[Migration] = []
    violations: list[Violation] = []
    canonical_prefix = MIGRATION_DIRECTORY.as_posix() + "/"
    for mode, object_type, object_id, path in entries:
        if path.startswith(canonical_prefix):
            remainder = path[len(canonical_prefix) :]
            if "/" in remainder:
                violations.append(
                    Violation(
                        "catalog-wrong-location",
                        _public_path(path),
                        "migration must be a direct child of the canonical directory",
                    )
                )
                continue
            if mode == "120000":
                violations.append(
                    Violation("catalog-symlink", _public_path(path), "migration symlinks are not allowed")
                )
                continue
            version = _classify_name(path, violations)
            if version is None:
                continue
            if object_type != "blob" or not mode.startswith("100"):
                violations.append(
                    Violation(
                        "catalog-unreadable",
                        _public_path(path),
                        "migration is not a regular readable blob",
                    )
                )
                continue
            blob = _run_git_bytes(repo, "cat-file", "blob", object_id)
            if blob.returncode != 0:
                violations.append(
                    Violation("history-incomplete", _public_path(path), "base migration blob is unavailable")
                )
                continue
            migrations.append(Migration(path, version, blob.stdout, object_id))
        elif VERSION_LOOKING_RE.fullmatch(Path(path).name):
            violations.append(
                Violation(
                    "catalog-wrong-location",
                    _public_path(path),
                    "versioned migration is outside the canonical directory",
                )
            )
    return migrations, violations


def _ancestor_violations(repo: Path) -> list[Violation]:
    violations: list[Violation] = []
    try:
        repo_metadata = repo.lstat()
    except OSError:
        return [
            Violation(
                "catalog-unreadable-ancestor",
                ".",
                "repository root metadata cannot be read",
            )
        ]
    if stat.S_ISLNK(repo_metadata.st_mode):
        return [
            Violation(
                "catalog-symlink-ancestor",
                ".",
                "repository root must not be a symlink",
            )
        ]
    if not stat.S_ISDIR(repo_metadata.st_mode):
        return [
            Violation(
                "catalog-unreadable-ancestor",
                ".",
                "repository root is not a directory",
            )
        ]
    checked: set[Path] = set()
    for root in (MAIN_RESOURCES_DIRECTORY, MIGRATION_DIRECTORY):
        candidate = repo
        for component in root.parts:
            candidate /= component
            if candidate in checked:
                continue
            checked.add(candidate)
            relative = candidate.relative_to(repo).as_posix()
            try:
                metadata = candidate.lstat()
            except FileNotFoundError:
                break
            except OSError:
                violations.append(
                    Violation(
                        "catalog-unreadable-ancestor",
                        _public_path(relative),
                        "catalog ancestor metadata cannot be read",
                    )
                )
                break
            if stat.S_ISLNK(metadata.st_mode):
                violations.append(
                    Violation(
                        "catalog-symlink-ancestor",
                        _public_path(relative),
                        "catalog ancestors must not be symlinks",
                    )
                )
                break
            if not stat.S_ISDIR(metadata.st_mode):
                violations.append(
                    Violation(
                        "catalog-unreadable-ancestor",
                        _public_path(relative),
                        "catalog ancestor is not a directory",
                    )
                )
                break
    return violations


def _index_catalog(repo: Path) -> tuple[list[Migration], list[Violation]]:
    result = _run_git_bytes(
        repo,
        "ls-files",
        "--stage",
        "-z",
        "--",
        MAIN_RESOURCES_DIRECTORY.as_posix(),
    )
    if result.returncode != 0:
        return [], [
            Violation(
                "index-unreadable",
                MAIN_RESOURCES_DIRECTORY.as_posix(),
                "Git index cannot be enumerated",
            )
        ]
    entries = _parse_index(result.stdout)
    if entries is None:
        return [], [
            Violation(
                "index-path-encoding",
                MAIN_RESOURCES_DIRECTORY.as_posix(),
                "Git index has an unsupported entry",
            )
        ]

    migrations: list[Migration] = []
    violations: list[Violation] = []
    canonical_prefix = MIGRATION_DIRECTORY.as_posix() + "/"
    for mode, object_id, stage, path in entries:
        if stage != 0:
            violations.append(
                Violation(
                    "index-unmerged",
                    _public_path(path),
                    "unmerged migration index entries are not allowed",
                )
            )
            continue
        if path.startswith(canonical_prefix):
            remainder = path[len(canonical_prefix) :]
            if "/" in remainder:
                violations.append(
                    Violation(
                        "index-catalog-wrong-location",
                        _public_path(path),
                        "migration must be a direct child of the canonical directory",
                    )
                )
                continue
            if mode == "120000":
                violations.append(
                    Violation(
                        "index-catalog-symlink",
                        _public_path(path),
                        "migration symlinks are not allowed in the index",
                    )
                )
                continue
            version = _classify_name(path, violations, "index-")
            if version is None:
                continue
            if not mode.startswith("100"):
                violations.append(
                    Violation(
                        "index-catalog-unreadable",
                        _public_path(path),
                        "migration is not a regular index blob",
                    )
                )
                continue
            blob = _run_git_bytes(repo, "cat-file", "blob", object_id)
            if blob.returncode != 0:
                violations.append(
                    Violation(
                        "index-history-incomplete",
                        _public_path(path),
                        "index migration blob is unavailable",
                    )
                )
                continue
            migrations.append(Migration(path, version, blob.stdout, object_id))
        elif VERSION_LOOKING_RE.fullmatch(Path(path).name):
            violations.append(
                Violation(
                    "index-catalog-wrong-location",
                    _public_path(path),
                    "versioned migration is outside the canonical directory",
                )
            )
    return migrations, violations


def _scan_current_catalog(repo: Path) -> tuple[list[Migration], list[Violation]]:
    ancestor_violations = _ancestor_violations(repo)
    if ancestor_violations:
        return [], ancestor_violations
    resources_root = repo / MAIN_RESOURCES_DIRECTORY
    migrations: list[Migration] = []
    violations: list[Violation] = []
    if not resources_root.exists():
        return migrations, violations

    def visit(directory: Path) -> None:
        try:
            entries = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError:
            relative = directory.relative_to(repo).as_posix()
            violations.append(Violation("catalog-unreadable", _public_path(relative), "directory cannot be read"))
            return
        for entry in entries:
            path = Path(entry.path)
            relative_path = path.relative_to(repo)
            relative = relative_path.as_posix()
            try:
                metadata = entry.stat(follow_symlinks=False)
            except OSError:
                violations.append(
                    Violation("catalog-unreadable", _public_path(relative), "input metadata cannot be read")
                )
                continue
            in_canonical = relative_path == MIGRATION_DIRECTORY or MIGRATION_DIRECTORY in relative_path.parents
            if stat.S_ISLNK(metadata.st_mode):
                if in_canonical:
                    violations.append(
                        Violation(
                            "catalog-symlink",
                            _public_path(relative),
                            "migration symlinks are not allowed",
                        )
                    )
                elif VERSION_LOOKING_RE.fullmatch(path.name):
                    violations.append(
                        Violation(
                            "catalog-wrong-location",
                            _public_path(relative),
                            "versioned migration is outside the canonical directory",
                        )
                    )
                continue
            if stat.S_ISDIR(metadata.st_mode):
                visit(path)
                continue
            if not stat.S_ISREG(metadata.st_mode):
                if in_canonical:
                    violations.append(
                        Violation(
                            "catalog-unreadable",
                            _public_path(relative),
                            "migration is not a regular file",
                        )
                    )
                continue
            if in_canonical:
                try:
                    inside = relative_path.relative_to(MIGRATION_DIRECTORY)
                except ValueError:
                    inside = relative_path
                if inside.parent != Path("."):
                    violations.append(
                        Violation(
                            "catalog-wrong-location",
                            _public_path(relative),
                            "migration must be a direct child of the canonical directory",
                        )
                    )
                    continue
                version = _classify_name(relative, violations)
                if version is None:
                    continue
                if metadata.st_mode & (stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH) == 0:
                    violations.append(
                        Violation(
                            "catalog-unreadable",
                            _public_path(relative),
                            "migration has no read permission",
                        )
                    )
                    continue
                try:
                    content = path.read_bytes()
                except OSError:
                    violations.append(
                        Violation("catalog-unreadable", _public_path(relative), "migration cannot be read")
                    )
                    continue
                migrations.append(Migration(relative, version, content))
            elif VERSION_LOOKING_RE.fullmatch(path.name):
                violations.append(
                    Violation(
                        "catalog-wrong-location",
                        _public_path(relative),
                        "versioned migration is outside the canonical directory",
                    )
                )

    visit(resources_root)
    return migrations, violations


def _duplicate_violations(
    migrations: list[Migration],
    category_prefix: str = "",
) -> list[Violation]:
    by_version: dict[int, list[str]] = {}
    for migration in migrations:
        by_version.setdefault(migration.version, []).append(migration.path)
    violations: list[Violation] = []
    for version, paths in sorted(by_version.items()):
        if len(paths) < 2:
            continue
        for path in sorted(paths):
            violations.append(
                Violation(
                    f"{category_prefix}catalog-duplicate-version",
                    _public_path(path),
                    f"numeric version V{version} is used by multiple migrations",
                )
            )
    return violations


def _normalized_worktree_object_id(repo: Path, path: str) -> str | None:
    result = _run_git(
        repo,
        "hash-object",
        f"--path={path}",
        "--",
        path,
    )
    if result.returncode != 0:
        return None
    object_id = _git_line(result.stdout)
    if re.fullmatch(r"[0-9a-f]{40,64}", object_id) is None:
        return None
    return object_id


def _filter_attribute_violation(repo: Path, path: str) -> Violation | None:
    result = _run_git_bytes(
        repo,
        "check-attr",
        "-z",
        "filter",
        "--",
        path,
    )
    if result.returncode != 0:
        return Violation(
            "catalog-attribute-unreadable",
            _public_path(path),
            "Git filter attribute cannot be inspected safely",
        )
    fields = result.stdout.split(b"\0")
    if fields and fields[-1] == b"":
        fields.pop()
    try:
        reported_path = fields[0].decode("utf-8")
    except (IndexError, UnicodeDecodeError):
        reported_path = ""
    if len(fields) != 3 or reported_path != path or fields[1] != b"filter":
        return Violation(
            "catalog-attribute-unreadable",
            _public_path(path),
            "Git filter attribute response is malformed",
        )
    if fields[2] in (b"unspecified", b"unset"):
        return None
    return Violation(
        "catalog-external-filter",
        _public_path(path),
        "production migrations must not use a clean filter driver",
    )


def _print_history_failure(category: str, detail: str) -> int:
    print(f"[{category}] history: {detail}", file=sys.stderr)
    print(
        "Remedy: restore complete local Git history, rerun the checker, "
        "then add the reported next forward migration version.",
        file=sys.stderr,
    )
    return 1


def _repository_root() -> Path | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            capture_output=True,
            check=False,
            env=_git_environment(),
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return Path(_git_line(result.stdout))


def check_migrations(base_ref: str) -> int:
    repo = _repository_root()
    if repo is None:
        return _print_history_failure("history-not-repository", "the checkout is not a Git worktree")

    shallow = _run_git(repo, "rev-parse", "--is-shallow-repository")
    if shallow.returncode != 0 or _git_line(shallow.stdout) == "true":
        return _print_history_failure("history-incomplete", "complete history is required for comparison")

    resolved_base = _run_git(repo, "rev-parse", "--verify", "--quiet", "--end-of-options", f"{base_ref}^{{commit}}")
    if resolved_base.returncode != 0:
        return _print_history_failure("history-unresolved-base", "the requested base commit is unavailable")

    resolved_base_commit = _git_line(resolved_base.stdout)
    merge_base_result = _run_git(repo, "merge-base", resolved_base_commit, "HEAD")
    if merge_base_result.returncode != 0 or not _git_line(merge_base_result.stdout):
        return _print_history_failure("history-no-merge-base", "the base and HEAD do not share resolvable history")
    merge_base = _git_line(merge_base_result.stdout)
    print(f"merge-base: {merge_base}")

    base_migrations, base_violations = _base_catalog(repo, merge_base)
    index_migrations, index_violations = _index_catalog(repo)
    current_migrations, current_violations = _scan_current_catalog(repo)
    violations = base_violations + index_violations + current_violations
    violations.extend(_duplicate_violations(base_migrations))
    violations.extend(_duplicate_violations(index_migrations, "index-"))
    violations.extend(_duplicate_violations(current_migrations))

    base_by_path = {migration.path: migration for migration in base_migrations}
    index_by_path = {migration.path: migration for migration in index_migrations}
    current_by_path = {migration.path: migration for migration in current_migrations}
    base_max = max((migration.version for migration in base_migrations), default=None)
    if base_max is None:
        violations.append(
            Violation(
                "catalog-empty",
                MIGRATION_DIRECTORY.as_posix(),
                "comparison base has no valid production migrations",
            )
        )
    for path, base_migration in sorted(base_by_path.items()):
        indexed = index_by_path.get(path)
        if indexed is None:
            violations.append(
                Violation(
                    "index-historical-missing",
                    _public_path(path),
                    "base migration is missing or invalid in the Git index",
                )
            )
        elif indexed.content != base_migration.content:
            violations.append(
                Violation(
                    "index-historical-modified",
                    _public_path(path),
                    "base migration index bytes changed",
                )
            )
        current = current_by_path.get(path)
        if current is None:
            violations.append(
                Violation(
                    "historical-missing",
                    _public_path(path),
                    "base migration was deleted, renamed, moved, or made invalid",
                )
            )
        else:
            filter_violation = _filter_attribute_violation(repo, path)
            if filter_violation is not None:
                violations.append(filter_violation)
                continue
            normalized_object_id = _normalized_worktree_object_id(repo, path)
            if normalized_object_id is None:
                violations.append(
                    Violation(
                        "catalog-unreadable",
                        _public_path(path),
                        "worktree migration cannot be normalized safely",
                    )
                )
            elif normalized_object_id != base_migration.object_id:
                violations.append(
                    Violation(
                        "historical-modified",
                        _public_path(path),
                        "base migration content changed after Git normalization",
                    )
                )
    if base_max is not None:
        for path, indexed in sorted(index_by_path.items()):
            if path not in base_by_path and indexed.version <= base_max:
                violations.append(
                    Violation(
                        "index-addition-not-forward",
                        _public_path(path),
                        f"new index version V{indexed.version} must be greater than base maximum V{base_max}",
                    )
                )
        for path, current in sorted(current_by_path.items()):
            if path not in base_by_path and current.version <= base_max:
                violations.append(
                    Violation(
                        "addition-not-forward",
                        _public_path(path),
                        f"new version V{current.version} must be greater than base maximum V{base_max}",
                    )
                )

    if violations:
        ordered = sorted(set(violations))
        for violation in ordered[:MAX_REPORTED_VIOLATIONS]:
            print(f"[{violation.category}] {violation.path}: {violation.detail}", file=sys.stderr)
        omitted = len(ordered) - MAX_REPORTED_VIOLATIONS
        if omitted > 0:
            print(f"[violation-limit] {omitted} additional violations omitted", file=sys.stderr)
        if base_max is None:
            print(
                "Remedy: fix the base catalog, then add the reported next forward migration version.",
                file=sys.stderr,
            )
        else:
            print(
                f"Remedy: preserve base migrations byte-for-byte and add forward migration "
                f"V{base_max + 1}__lower_snake_case_description.sql.",
                file=sys.stderr,
            )
        return 1

    assert base_max is not None
    print(f"base-count: {len(base_migrations)}")
    print(f"index-count: {len(index_migrations)}")
    print(f"current-count: {len(current_migrations)}")
    print(f"next-version: V{base_max + 1}")
    print("Flyway migration immutability check passed.")
    return 0


class FlywayMigrationImmutabilityTests(unittest.TestCase):
    maxDiff = None

    def _write(self, repo: Path, relative: str, content: str) -> Path:
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def _git(self, repo: Path, *args: str) -> str:
        result = _run_git(repo, *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return _git_line(result.stdout)

    def _new_repo(self, root: Path, name: str = "repo") -> tuple[Path, str]:
        repo = root / name
        repo.mkdir()
        self._git(repo, "init", "--quiet", "--initial-branch=main")
        self._git(repo, "config", "user.name", "Fixture User")
        self._git(repo, "config", "user.email", "fixture@example.invalid")
        self._write(
            repo,
            str(MIGRATION_DIRECTORY / "V1__baseline.sql"),
            f"CREATE TABLE fixture_one (id INT); -- {SQL_SENTINEL}\n",
        )
        self._write(
            repo,
            str(MIGRATION_DIRECTORY / "V9__current.sql"),
            "ALTER TABLE fixture_one ADD COLUMN label VARCHAR(20);\n",
        )
        self._git(repo, "add", ".")
        self._git(repo, "commit", "--quiet", "-m", "fixture base")
        return repo, self._git(repo, "rev-parse", "HEAD")

    def _new_autocrlf_clone(self, root: Path) -> tuple[Path, str, Path]:
        source, base = self._new_repo(root, "source")
        clone = root / "autocrlf-clone"
        clone_result = subprocess.run(
            ["git", "clone", "--quiet", "--no-checkout", str(source), str(clone)],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(clone_result.returncode, 0, "autocrlf clone fixture setup failed")
        self._git(clone, "config", "core.autocrlf", "true")
        self._git(clone, "checkout", "--quiet", "HEAD")
        migration = clone / MIGRATION_DIRECTORY / "V9__current.sql"
        content = migration.read_bytes()
        self.assertIn(b"\r\n", content)
        self.assertNotIn(b"\n", content.replace(b"\r\n", b""))
        self.assertEqual(self._git(clone, "status", "--porcelain=v1", "--untracked-files=all"), "")
        return clone, base, migration

    def _configure_mask_filter(
        self,
        repo: Path,
        attribute_rule: str,
    ) -> Path:
        marker = repo / "filter-invoked.marker"
        filter_script = self._write(
            repo,
            "mask_filter.py",
            "from pathlib import Path\n"
            "import sys\n"
            "data = sys.stdin.buffer.read()\n"
            "Path(sys.argv[1]).write_text('invoked', encoding='utf-8')\n"
            "sys.stdout.buffer.write(data.replace(b'edited_label', b'label'))\n",
        )
        self._write(repo, ".gitattributes", attribute_rule + "\n")
        command = f"{shlex.quote(sys.executable)} {shlex.quote(str(filter_script))} {shlex.quote(str(marker))}"
        self._git(repo, "config", "filter.mask.clean", command)
        self._git(repo, "add", ".gitattributes", "mask_filter.py")
        self._git(repo, "commit", "--quiet", "-m", "configure fixture attributes")
        if marker.exists():
            marker.unlink()
        return marker

    def _run_checker(
        self,
        repo: Path,
        base_ref: str,
        extra_environment: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        if extra_environment:
            environment.update(extra_environment)
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--base-ref", base_ref],
            cwd=repo,
            text=True,
            capture_output=True,
            check=False,
            env=environment,
        )
        combined = result.stdout + result.stderr
        self.assertNotIn(str(repo), combined)
        self.assertNotIn(SQL_SENTINEL, combined)
        self.assertNotIn("file://", combined)
        self.assertNotIn("Traceback", combined)
        for line in combined.splitlines():
            self.assertLessEqual(len(line), 512, line)
        return result

    def _assert_failure(self, repo: Path, base_ref: str, category: str) -> None:
        result = self._run_checker(repo, base_ref)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"[{category}]", result.stderr)
        self.assertIn("forward migration", result.stderr)

    def test_unchanged_tree_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            result = self._run_checker(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f"merge-base: {base}", result.stdout)

    def test_new_unique_version_above_base_maximum_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(
                repo,
                str(MIGRATION_DIRECTORY / "V10__forward_change.sql"),
                "ALTER TABLE fixture_one ADD COLUMN created_at TIMESTAMP;\n",
            )
            self._git(repo, "add", ".")
            self._git(repo, "commit", "--quiet", "-m", "forward migration")
            result = self._run_checker(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_untracked_valid_forward_migration_is_detected_before_commit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(
                repo,
                str(MIGRATION_DIRECTORY / "V10__untracked_forward_change.sql"),
                "ALTER TABLE fixture_one ADD COLUMN updated_at TIMESTAMP;\n",
            )
            result = self._run_checker(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("current-count: 3", result.stdout)

    def test_staged_valid_forward_migration_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            relative = MIGRATION_DIRECTORY / "V10__staged_forward_change.sql"
            self._write(repo, str(relative), "ALTER TABLE fixture_one ADD COLUMN staged_at TIMESTAMP;\n")
            self._git(repo, "add", str(relative))
            result = self._run_checker(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("current-count: 3", result.stdout)

    def test_historical_modification_fails_for_staged_and_unstaged_worktree_bytes(self) -> None:
        for staged in (False, True):
            with self.subTest(staged=staged), tempfile.TemporaryDirectory() as temporary:
                repo, base = self._new_repo(Path(temporary))
                self._write(
                    repo,
                    str(MIGRATION_DIRECTORY / "V9__current.sql"),
                    "ALTER TABLE fixture_one ADD COLUMN changed INT;\n",
                )
                if staged:
                    self._git(repo, "add", str(MIGRATION_DIRECTORY / "V9__current.sql"))
                self._assert_failure(repo, base, "historical-modified")

    def test_index_and_worktree_are_independent_for_base_owned_migrations(self) -> None:
        relative = MIGRATION_DIRECTORY / "V9__current.sql"
        original = "ALTER TABLE fixture_one ADD COLUMN label VARCHAR(20);\n"
        cases = (
            ("modified", "index-historical-modified"),
            ("missing", "index-historical-missing"),
            ("symlink", "index-catalog-symlink"),
        )
        for operation, category in cases:
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as temporary:
                repo, base = self._new_repo(Path(temporary))
                path = repo / relative
                if operation == "modified":
                    self._write(repo, str(relative), "ALTER TABLE fixture_one ADD COLUMN staged_change INT;\n")
                    self._git(repo, "add", str(relative))
                    self._write(repo, str(relative), original)
                elif operation == "missing":
                    self._git(repo, "rm", "--quiet", "--cached", str(relative))
                else:
                    path.unlink()
                    path.symlink_to("V1__baseline.sql")
                    self._git(repo, "add", str(relative))
                    path.unlink()
                    self._write(repo, str(relative), original)
                self._assert_failure(repo, base, category)

    def test_historical_deletion_rename_and_move_fail(self) -> None:
        for operation in ("delete", "rename", "move"):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as temporary:
                repo, base = self._new_repo(Path(temporary))
                source = repo / MIGRATION_DIRECTORY / "V9__current.sql"
                if operation == "delete":
                    source.unlink()
                elif operation == "rename":
                    source.rename(repo / MIGRATION_DIRECTORY / "V9__renamed.sql")
                else:
                    destination = repo / MAIN_RESOURCES_DIRECTORY / "db/archive/V9__current.sql"
                    destination.parent.mkdir(parents=True)
                    source.rename(destination)
                self._assert_failure(repo, base, "historical-missing")

    def test_duplicate_numeric_version_with_different_description_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(
                repo,
                str(MIGRATION_DIRECTORY / "V09__duplicate_identity.sql"),
                "SELECT 1;\n",
            )
            self._assert_failure(repo, base, "catalog-duplicate-version")

    def test_invalid_catalog_entries_fail(self) -> None:
        cases = (
            ("V10_bad.sql", "catalog-malformed-name"),
            ("V0__zero.sql", "catalog-zero-version"),
            ("V10__Upper.sql", "catalog-malformed-name"),
            ("notes.txt", "catalog-non-sql"),
        )
        for filename, category in cases:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as temporary:
                repo, base = self._new_repo(Path(temporary))
                self._write(repo, str(MIGRATION_DIRECTORY / filename), "SELECT 1;\n")
                self._assert_failure(repo, base, category)

    def test_version_looking_sql_outside_canonical_directory_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(
                repo,
                str(MAIN_RESOURCES_DIRECTORY / "db/archive/V10__wrong_location.sql"),
                "SELECT 1;\n",
            )
            self._assert_failure(repo, base, "catalog-wrong-location")

    def test_new_version_at_or_below_base_maximum_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(repo, str(MIGRATION_DIRECTORY / "V8__late_gap.sql"), "SELECT 1;\n")
            self._assert_failure(repo, base, "addition-not-forward")

    def test_unresolved_base_ref_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, _ = self._new_repo(Path(temporary))
            self._assert_failure(repo, "missing-base-ref", "history-unresolved-base")

    def test_unrelated_history_without_merge_base_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._git(repo, "checkout", "--quiet", "--orphan", "unrelated")
            self._git(repo, "rm", "--quiet", "-rf", ".")
            self._write(repo, "README.md", "unrelated history\n")
            self._git(repo, "add", ".")
            self._git(repo, "commit", "--quiet", "-m", "unrelated root")
            self._assert_failure(repo, base, "history-no-merge-base")

    def test_shallow_history_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, base = self._new_repo(root, "source")
            self._write(source, "README.md", "second commit\n")
            self._git(source, "add", ".")
            self._git(source, "commit", "--quiet", "-m", "fixture head")
            shallow = root / "shallow"
            clone = subprocess.run(
                ["git", "clone", "--quiet", "--depth", "1", "--no-local", str(source), str(shallow)],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(clone.returncode, 0, clone.stderr)
            self._assert_failure(shallow, base, "history-incomplete")

    def test_symlinked_migration_fails_without_following_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            path = repo / MIGRATION_DIRECTORY / "V9__current.sql"
            path.unlink()
            path.symlink_to("V1__baseline.sql")
            self._assert_failure(repo, base, "catalog-symlink")

    def test_symlinked_resources_ancestor_fails_without_following_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            resources = repo / MAIN_RESOURCES_DIRECTORY
            relocated = repo / "relocated-resources"
            resources.rename(relocated)
            resources.symlink_to(Path("../../..") / relocated.name)
            self._git(repo, "add", "-A")
            self._git(repo, "commit", "--quiet", "-m", "relocate resources behind symlink")
            self._assert_failure(repo, base, "catalog-symlink-ancestor")

    def test_unreadable_migration_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            path = repo / MIGRATION_DIRECTORY / "V9__current.sql"
            path.chmod(0)
            try:
                self._assert_failure(repo, base, "catalog-unreadable")
            finally:
                path.chmod(stat.S_IRUSR | stat.S_IWUSR)

    def test_partial_clone_never_lazy_fetches_missing_base_blob(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, base = self._new_repo(root, "source")
            relative = MIGRATION_DIRECTORY / "V9__current.sql"
            old_blob = self._git(source, "rev-parse", f"{base}:{relative.as_posix()}")
            self._write(
                source,
                str(relative),
                "ALTER TABLE fixture_one ADD COLUMN partial_clone_change INT;\n",
            )
            self._git(source, "add", str(relative))
            self._git(source, "commit", "--quiet", "-m", "partial clone head")
            self._git(source, "config", "uploadpack.allowFilter", "true")

            partial = root / "partial"
            clone = subprocess.run(
                [
                    "git",
                    "clone",
                    "--quiet",
                    "--filter=blob:none",
                    "--no-checkout",
                    source.resolve().as_uri(),
                    str(partial),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(clone.returncode, 0, "partial clone fixture setup failed")
            checkout = _run_git(
                partial,
                "checkout",
                "--quiet",
                "HEAD",
                allow_lazy_fetch=True,
            )
            self.assertEqual(checkout.returncode, 0, "partial clone checkout failed")
            probe_environment = os.environ.copy()
            probe_environment["GIT_NO_LAZY_FETCH"] = "1"
            missing_probe = subprocess.run(
                ["git", "cat-file", "-e", old_blob],
                cwd=partial,
                text=True,
                capture_output=True,
                check=False,
                env=probe_environment,
            )
            self.assertNotEqual(missing_probe.returncode, 0, "base blob must be absent before checker execution")

            trace = root / "checker-trace.json"
            result = self._run_checker(partial, base, {"GIT_TRACE2_EVENT": str(trace)})
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("[history-incomplete]", result.stderr)
            trace_text = trace.read_text(encoding="utf-8")
            self.assertFalse("upload-pack" in trace_text, "checker attempted upload-pack")
            self.assertFalse('"cmd_name":"fetch"' in trace_text, "checker attempted lazy fetch")

    def test_output_redacts_and_truncates_relative_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            token = "ghp_" + "A" * 24
            self._write(repo, str(MIGRATION_DIRECTORY / f"{token}.txt"), "fixture\n")
            self._write(repo, str(MIGRATION_DIRECTORY / (("x" * 230) + ".txt")), "fixture\n")
            result = self._run_checker(repo, base)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("<redacted>.txt", result.stderr)
            self.assertNotIn(token, result.stderr)
            self.assertIn("...", result.stderr)

    def test_violation_output_is_deterministically_sorted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            self._write(repo, str(MIGRATION_DIRECTORY / "a_non_sql.txt"), "fixture\n")
            self._write(repo, str(MIGRATION_DIRECTORY / "V10__Upper.sql"), "fixture\n")
            first = self._run_checker(repo, base)
            second = self._run_checker(repo, base)
            self.assertEqual(first.stderr, second.stderr)
            violation_lines = [line for line in first.stderr.splitlines() if line.startswith("[")]
            self.assertEqual(violation_lines, sorted(violation_lines))

    def test_violation_output_is_capped_at_one_hundred_findings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            for index in range(107):
                self._write(repo, str(MIGRATION_DIRECTORY / f"invalid_{index:03d}.txt"), "fixture\n")
            result = self._run_checker(repo, base)
            self.assertNotEqual(result.returncode, 0)
            violation_lines = [
                line
                for line in result.stderr.splitlines()
                if line.startswith("[") and not line.startswith("[violation-limit]")
            ]
            self.assertEqual(len(violation_lines), 100)
            self.assertIn("[violation-limit] 7 additional violations omitted", result.stderr)

    def test_repository_path_ending_in_space_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary), "repo ")
            result = self._run_checker(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f"merge-base: {base}", result.stdout)

    def test_clean_autocrlf_checkout_matches_base_after_git_normalization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            clone, base, _ = self._new_autocrlf_clone(Path(temporary))
            result = self._run_checker(
                clone,
                base,
                {"GIT_EXTERNAL_DIFF": "external-diff-must-not-run"},
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_actual_edit_in_autocrlf_checkout_still_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            clone, base, migration = self._new_autocrlf_clone(Path(temporary))
            content = migration.read_bytes()
            migration.write_bytes(content.replace(b"label", b"edited_label", 1))
            self._assert_failure(clone, base, "historical-modified")

    def test_external_clean_filter_is_rejected_without_invocation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo, base = self._new_repo(Path(temporary))
            marker = self._configure_mask_filter(repo, "*.sql filter=mask")
            relative = MIGRATION_DIRECTORY / "V9__current.sql"
            migration = repo / relative
            migration.write_bytes(migration.read_bytes().replace(b"label", b"edited_label", 1))

            result = self._run_checker(repo, base)
            with self.subTest(contract="fails closed"):
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            with self.subTest(contract="bounded category"):
                self.assertIn("[catalog-external-filter]", result.stderr)
            with self.subTest(contract="filter not invoked"):
                self.assertFalse(marker.exists(), "checker invoked configured clean filter")

    def test_unset_and_unspecified_filter_attributes_do_not_invoke_driver(self) -> None:
        for attribute_rule in ("*.sql -filter", "*.sql !filter"):
            with self.subTest(attribute_rule=attribute_rule), tempfile.TemporaryDirectory() as temporary:
                repo, base = self._new_repo(Path(temporary))
                marker = self._configure_mask_filter(repo, attribute_rule)
                result = self._run_checker(repo, base)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse(marker.exists(), "checker invoked inactive clean filter")


class FlywayWorkflowContractTests(unittest.TestCase):
    def _run_workflow_checker(self, source: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary:
            workflow = Path(temporary) / "ci.yml"
            workflow.write_text(source, encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--check-workflow", str(workflow)],
                text=True,
                capture_output=True,
                check=False,
            )

    def _assert_workflow_failure(self, source: str, category: str) -> None:
        result = self._run_workflow_checker(source)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"[{category}]", result.stderr)

    def test_valid_scripts_job_workflow_contract_passes(self) -> None:
        unrelated_shallow_checkout = VALID_WORKFLOW_FIXTURE + r'''
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@example
'''
        for name, source in (
            ("minimal", VALID_WORKFLOW_FIXTURE),
            ("unrelated shallow checkout", unrelated_shallow_checkout),
        ):
            with self.subTest(name=name):
                result = self._run_workflow_checker(source)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_workflow_keeps_read_only_contents_permission(self) -> None:
        source = VALID_WORKFLOW_FIXTURE.replace("  contents: read", "  contents: write", 1)
        self._assert_workflow_failure(source, "workflow-permissions-unsafe")

    def test_scripts_job_checkout_requires_complete_history(self) -> None:
        source = VALID_WORKFLOW_FIXTURE.replace("          fetch-depth: 0\n", "")
        self._assert_workflow_failure(source, "workflow-scripts-checkout-history")

    def test_scripts_job_requires_each_flyway_gate(self) -> None:
        cases = (
            (
                "self-test",
                VALID_WORKFLOW_FIXTURE.replace(" --self-test", " --base-ref HEAD", 1),
                "workflow-self-test-missing",
            ),
            (
                "workflow contract",
                VALID_WORKFLOW_FIXTURE.replace(
                    " --check-workflow .github/workflows/ci.yml",
                    " --base-ref HEAD",
                    1,
                ),
                "workflow-contract-check-missing",
            ),
            (
                "history check",
                VALID_WORKFLOW_FIXTURE.replace(" --base-ref \"$base_sha\"", " --self-test", 1),
                "workflow-history-check-missing",
            ),
            (
                "commented self-test",
                VALID_WORKFLOW_FIXTURE.replace(
                    "        run: python3 -B scripts/check-flyway-migration-immutability.py --self-test",
                    "        run: echo skipped\n"
                    "        # python3 -B scripts/check-flyway-migration-immutability.py --self-test",
                    1,
                ),
                "workflow-self-test-missing",
            ),
        )
        for name, source, category in cases:
            with self.subTest(name=name):
                self._assert_workflow_failure(source, category)

    def test_event_base_cannot_be_empty_or_fall_back_for_pull_requests(self) -> None:
        cases = (
            (
                "empty base accepted",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          if [[ -z "$base_sha" ]]; then\n',
                    '          if [[ "$base_sha" == "not-empty" ]]; then\n',
                    1,
                ),
            ),
            (
                "empty guard commented out",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          if [[ -z "$base_sha" ]]; then\n',
                    '          # if [[ -z "$base_sha" ]]; then\n',
                    1,
                ),
            ),
            (
                "pull request fallback",
                VALID_WORKFLOW_FIXTURE.replace(
                    '              base_sha="${READMATES_FLYWAY_PR_BASE_SHA}"',
                    '              base_sha="${READMATES_FLYWAY_PR_BASE_SHA:-HEAD^}"',
                    1,
                ),
            ),
            (
                "unverified zero push fallback",
                VALID_WORKFLOW_FIXTURE.replace(
                    'if ! base_sha="$(git rev-parse --verify --quiet \'HEAD^^{commit}\')"; then',
                    'if ! base_sha="HEAD^"; then',
                    1,
                ),
            ),
        )
        for name, source in cases:
            with self.subTest(name=name):
                self._assert_workflow_failure(source, "workflow-event-base-unsafe")

    def test_flyway_gates_cannot_continue_on_error_or_force_success(self) -> None:
        cases = (
            (
                "continue on error",
                VALID_WORKFLOW_FIXTURE.replace(
                    "      - name: Flyway migration checker self-tests\n",
                    "      - name: Flyway migration checker self-tests\n        continue-on-error: true\n",
                    1,
                ),
                "workflow-gate-continue-on-error",
            ),
            (
                "always-success fallback",
                VALID_WORKFLOW_FIXTURE.replace(
                    " --check-workflow .github/workflows/ci.yml\n",
                    " --check-workflow .github/workflows/ci.yml || true\n",
                    1,
                ),
                "workflow-gate-always-success",
            ),
        )
        for name, source, category in cases:
            with self.subTest(name=name):
                self._assert_workflow_failure(source, category)

    def test_history_gate_cannot_fetch_or_contact_a_remote(self) -> None:
        cases = (
            "git fetch origin main",
            "git ls-remote origin",
            "gh api repos/example/project",
        )
        for command in cases:
            with self.subTest(command=command):
                source = VALID_WORKFLOW_FIXTURE.replace(
                    '          base_sha=""\n',
                    f'          {command}\n          base_sha=""\n',
                    1,
                )
                self._assert_workflow_failure(source, "workflow-network-forbidden")

    def test_history_shell_uses_environment_instead_of_expression_interpolation(self) -> None:
        source = VALID_WORKFLOW_FIXTURE.replace(
            '          base_sha=""\n',
            '          base_sha="${{ github.event.before }}"\n',
            1,
        )
        self._assert_workflow_failure(source, "workflow-event-base-unsafe")

    def test_exact_history_step_rejects_execution_wrappers(self) -> None:
        wrapped_if_false = VALID_WORKFLOW_FIXTURE.replace(
            '        run: |\n          base_sha=""',
            '        run: |\n          if false; then\n            base_sha=""',
            1,
        ).replace(
            '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n',
            '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n'
            '          fi\n',
            1,
        )
        cases = (
            (
                "step if",
                VALID_WORKFLOW_FIXTURE.replace(
                    "      - name: Flyway migration history immutability\n",
                    "      - name: Flyway migration history immutability\n        if: ${{ success() }}\n",
                    1,
                ),
            ),
            (
                "continue on error",
                VALID_WORKFLOW_FIXTURE.replace(
                    "      - name: Flyway migration history immutability\n",
                    "      - name: Flyway migration history immutability\n        continue-on-error: true\n",
                    1,
                ),
            ),
            ("if false wrapper", wrapped_if_false),
            (
                "set plus e",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          base_sha=""\n',
                    '          set +e\n          base_sha=""\n',
                    1,
                ),
            ),
            (
                "always success prelude",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          base_sha=""\n',
                    '          false || true\n          base_sha=""\n',
                    1,
                ),
            ),
            (
                "later exit zero",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n',
                    '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n'
                    '          exit 0\n',
                    1,
                ),
            ),
            (
                "custom shell",
                VALID_WORKFLOW_FIXTURE.replace("        shell: bash\n", "        shell: bash -e {0}\n", 1),
            ),
            (
                "heredoc wrapper",
                VALID_WORKFLOW_FIXTURE.replace(
                    '          base_sha=""\n',
                    "          bash <<'WRAPPED_GATE'\n          base_sha=\"\"\n",
                    1,
                ).replace(
                    '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n',
                    '          python3 -B scripts/check-flyway-migration-immutability.py --base-ref "$base_sha"\n'
                    '          WRAPPED_GATE\n',
                    1,
                ),
            ),
        )
        for name, source in cases:
            with self.subTest(name=name):
                self._assert_workflow_failure(source, "workflow-gate-shape-unsafe")

    def test_scripts_job_rejects_guards_and_permission_overrides(self) -> None:
        cases = (
            (
                "job if",
                VALID_WORKFLOW_FIXTURE.replace(
                    "    runs-on: ubuntu-latest\n",
                    "    runs-on: ubuntu-latest\n    if: ${{ success() }}\n",
                    1,
                ),
            ),
            (
                "job contents write",
                VALID_WORKFLOW_FIXTURE.replace(
                    "    runs-on: ubuntu-latest\n",
                    "    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n",
                    1,
                ),
            ),
            (
                "job continue on error",
                VALID_WORKFLOW_FIXTURE.replace(
                    "    runs-on: ubuntu-latest\n",
                    "    runs-on: ubuntu-latest\n    continue-on-error: true\n",
                    1,
                ),
            ),
            (
                "job continue on error expression",
                VALID_WORKFLOW_FIXTURE.replace(
                    "    runs-on: ubuntu-latest\n",
                    "    runs-on: ubuntu-latest\n"
                    "    continue-on-error: ${{ github.event_name == 'push' }}\n",
                    1,
                ),
            ),
        )
        for name, source in cases:
            with self.subTest(name=name):
                self._assert_workflow_failure(source, "workflow-scripts-job-unsafe")

    def test_event_env_requires_active_exact_mappings(self) -> None:
        source = VALID_WORKFLOW_FIXTURE.replace(
            "          READMATES_FLYWAY_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}\n",
            "          READMATES_FLYWAY_PR_BASE_SHA: ${{ github.sha }}\n"
            "          # READMATES_FLYWAY_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}\n",
            1,
        )
        self._assert_workflow_failure(source, "workflow-event-base-unsafe")

    def test_exact_history_step_rejects_disguised_remote_commands(self) -> None:
        run_commands = (
            "/usr/bin/git fetch origin main",
            "command git fetch origin main",
            "env git ls-remote origin",
            "/usr/bin/curl example.invalid",
        )
        for command in run_commands:
            with self.subTest(location="run", command=command):
                source = VALID_WORKFLOW_FIXTURE.replace(
                    '          base_sha=""\n',
                    f'          {command}\n          base_sha=""\n',
                    1,
                )
                self._assert_workflow_failure(source, "workflow-gate-shape-unsafe")

        with self.subTest(location="env"):
            source = VALID_WORKFLOW_FIXTURE.replace(
                "          READMATES_FLYWAY_EVENT_NAME: ${{ github.event_name }}\n",
                "          READMATES_FLYWAY_EVENT_NAME: ${{ github.event_name }}\n"
                "          READMATES_FLYWAY_REMOTE_COMMAND: git fetch origin main\n",
                1,
            )
            self._assert_workflow_failure(source, "workflow-gate-shape-unsafe")


def run_self_tests() -> int:
    suite = unittest.TestSuite(
        (
            unittest.defaultTestLoader.loadTestsFromTestCase(FlywayMigrationImmutabilityTests),
            unittest.defaultTestLoader.loadTestsFromTestCase(FlywayWorkflowContractTests),
        )
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check immutable production Flyway migrations")
    parser.add_argument("--base-ref")
    parser.add_argument("--check-workflow", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()
    if args.check_workflow is not None:
        if args.base_ref:
            print("[usage-conflicting-modes] choose workflow or migration history mode", file=sys.stderr)
            return 2
        return check_workflow(args.check_workflow)
    if not args.base_ref:
        print("[usage-missing-base-ref] --base-ref is required", file=sys.stderr)
        return 2

    try:
        return check_migrations(args.base_ref)
    except (OSError, UnicodeError, ValueError):
        return _print_history_failure(
            "history-io-error",
            "repository paths or local objects cannot be read safely",
        )


if __name__ == "__main__":
    raise SystemExit(main())
