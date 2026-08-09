#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
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


@dataclass(frozen=True)
class Migration:
    path: str
    version: int
    content: bytes


@dataclass(frozen=True, order=True)
class Violation:
    category: str
    path: str
    detail: str


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
            migrations.append(Migration(path, version, blob.stdout))
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
            migrations.append(Migration(path, version, blob.stdout))
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
        elif current.content != base_migration.content:
            violations.append(Violation("historical-modified", _public_path(path), "base migration bytes changed"))
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


def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(FlywayMigrationImmutabilityTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check immutable production Flyway migrations")
    parser.add_argument("--base-ref")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()
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
