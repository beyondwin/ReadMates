#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = REPO_ROOT / "scripts/host-rollout-test-contract.json"
MAX_JSON_BYTES = 256 * 1024
MAX_COMMANDS = 8
MAX_CASES = 64
ALLOWED_EXECUTABLES = {"corepack", "./server/gradlew"}
FORBIDDEN_ARGUMENTS = {"true", "false", ":", "echo", "printf", "--skip", "--passWithNoTests", "--allow-empty"}
ID_PATTERN = re.compile(r"[a-z0-9-]{1,100}")
TIMESTAMP_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")
PROFILE_ID_PATTERN = re.compile(r"run-[1-9][0-9]{0,19}-attempt-[1-9][0-9]{0,2}-r2a-public-cache")


class ReporterError(ValueError):
    pass


def _read_json(path: Path, label: str) -> Any:
    try:
        info = path.lstat()
    except OSError as error:
        raise ReporterError(f"{label} is unavailable") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_size <= 0 or info.st_size > MAX_JSON_BYTES:
        raise ReporterError(f"{label} must be a bounded regular non-symlink file")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ReporterError(f"{label} is not valid UTF-8 JSON") from error


def load_config(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    value = _read_json(path, "test contract")
    if not isinstance(value, dict):
        raise ReporterError("test contract must be an object")
    return value


def _safe_relative_path(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 240:
        raise ReporterError("required path is invalid")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts or value.startswith(".git/"):
        raise ReporterError("required path escapes the repository")
    if re.fullmatch(r"[A-Za-z0-9._/\[\]-]+", value) is None:
        raise ReporterError("required path contains unsupported characters")
    return value


def _command_map(config: dict[str, Any], group: str) -> dict[str, dict[str, Any]]:
    groups = config.get("groups")
    if not isinstance(groups, dict) or group not in groups or not isinstance(groups[group], dict):
        raise ReporterError("test group is unknown")
    commands = groups[group].get("commands")
    if not isinstance(commands, list) or not 1 <= len(commands) <= MAX_COMMANDS:
        raise ReporterError("test group commands are empty or oversized")
    result: dict[str, dict[str, Any]] = {}
    for command in commands:
        if not isinstance(command, dict) or set(command) != {"id", "argv", "timeoutSeconds", "requiredPaths", "cases"}:
            raise ReporterError("test command fields are invalid")
        command_id = command.get("id")
        if not isinstance(command_id, str) or ID_PATTERN.fullmatch(command_id) is None or command_id in result:
            raise ReporterError("test command id is invalid or duplicated")
        result[command_id] = command
    return result


def validate_contract(
    config: dict[str, Any],
    root: Path = REPO_ROOT,
    *,
    require_paths: bool,
    only_group: str | None = None,
) -> None:
    if set(config) != {"schemaVersion", "groups"} or config.get("schemaVersion") != "readmates.host-rollout.test-contract.v1":
        raise ReporterError("test contract envelope is invalid")
    groups = config.get("groups")
    if not isinstance(groups, dict) or not groups or len(groups) > 3:
        raise ReporterError("test contract groups are invalid")
    all_case_ids: set[tuple[str, str]] = set()
    selected_groups = [only_group] if only_group is not None else list(groups)
    if any(group not in groups for group in selected_groups):
        raise ReporterError("selected test contract group is unknown")
    for group in selected_groups:
        if group not in {"cache-safety", "compatibility", "security"}:
            raise ReporterError("test contract group is unsupported")
        for command_id, command in _command_map(config, group).items():
            argv = command["argv"]
            if not isinstance(argv, list) or not 1 <= len(argv) <= 40 or not all(isinstance(item, str) and item for item in argv):
                raise ReporterError("test command argv is invalid")
            if argv[0] not in ALLOWED_EXECUTABLES or any(item in FORBIDDEN_ARGUMENTS for item in argv):
                raise ReporterError("test command is a no-op, skipped, or unsupported invocation")
            if any(len(item) > 240 or "\n" in item or "\x00" in item for item in argv):
                raise ReporterError("test command argument is oversized or unsafe")
            timeout = command["timeoutSeconds"]
            if not isinstance(timeout, int) or not 30 <= timeout <= 3600:
                raise ReporterError("test command timeout is outside the bounded range")
            paths = command["requiredPaths"]
            if not isinstance(paths, list) or not paths or len(paths) > 16:
                raise ReporterError("test command substantive paths are empty or oversized")
            normalized_paths = [_safe_relative_path(path) for path in paths]
            if len(set(normalized_paths)) != len(normalized_paths):
                raise ReporterError("test command substantive paths are duplicated")
            if require_paths:
                for relative in normalized_paths:
                    path = root / relative
                    try:
                        info = path.lstat()
                    except OSError as error:
                        raise ReporterError(f"staged prerequisite is unavailable: {relative}") from error
                    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_size <= 0:
                        raise ReporterError(f"staged prerequisite is not a substantive regular file: {relative}")
            cases = command["cases"]
            if not isinstance(cases, list) or not cases or len(cases) > MAX_CASES:
                raise ReporterError("test command cases are empty or oversized")
            if any(not isinstance(case_id, str) or ID_PATTERN.fullmatch(case_id) is None for case_id in cases):
                raise ReporterError("test case id is invalid")
            if len(set(cases)) != len(cases):
                raise ReporterError("test command cases are duplicated")
            for case_id in cases:
                key = (group, case_id)
                if key in all_case_ids:
                    raise ReporterError("test case belongs to multiple commands")
                all_case_ids.add(key)


def _timestamp(value: Any) -> str:
    if not isinstance(value, str) or TIMESTAMP_PATTERN.fullmatch(value) is None:
        raise ReporterError("report completion timestamp is invalid")
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise ReporterError("report completion timestamp is invalid") from error
    return value


def protected_profile_identity(environment: Mapping[str, str] = os.environ) -> str:
    run_id = environment.get("GITHUB_RUN_ID", "")
    run_attempt = environment.get("GITHUB_RUN_ATTEMPT", "")
    carried = environment.get("READMATES_HOST_ROLLOUT_PRIMED_BROWSER_ARTIFACT_ID", "")
    if re.fullmatch(r"[1-9][0-9]{0,19}", run_id) is None or re.fullmatch(r"[1-9][0-9]{0,2}", run_attempt) is None:
        raise ReporterError("protected report run identity is invalid")
    if int(run_attempt) > 100:
        raise ReporterError("protected report run attempt is outside the bounded range")
    expected = f"run-{run_id}-attempt-{run_attempt}-r2a-public-cache"
    if carried != expected or PROFILE_ID_PATTERN.fullmatch(carried) is None:
        raise ReporterError("cache report profile identity is not bound to the protected run")
    return carried


def _validate_report_shape(report: dict[str, Any]) -> None:
    fields = {"schemaVersion", "group", "commands", "cases", "completedAt"}
    if report.get("group") == "cache-safety":
        fields.add("bindings")
    if set(report) != fields:
        raise ReporterError("report fields are invalid")
    if report.get("schemaVersion") != "readmates.host-rollout.test-report.v1":
        raise ReporterError("report schema version is invalid")
    commands = report.get("commands")
    cases = report.get("cases")
    if not isinstance(commands, list) or not 1 <= len(commands) <= MAX_COMMANDS:
        raise ReporterError("report commands are empty or oversized")
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise ReporterError("report cases are empty or oversized")
    if report.get("group") == "cache-safety":
        bindings = report.get("bindings")
        if (
            not isinstance(bindings, dict)
            or set(bindings) != {"profileIdentity"}
            or PROFILE_ID_PATTERN.fullmatch(str(bindings.get("profileIdentity", ""))) is None
        ):
            raise ReporterError("cache report profile binding is invalid")
    _timestamp(report.get("completedAt"))
    command_ids: list[str] = []
    for command in commands:
        if not isinstance(command, dict) or set(command) != {"id", "result", "source"}:
            raise ReporterError("report command fields are invalid")
        if command.get("result") != "PASS" or command.get("source") != "structured-test-reporter":
            raise ReporterError("report command result or source is invalid")
        command_id = command.get("id")
        if not isinstance(command_id, str) or ID_PATTERN.fullmatch(command_id) is None:
            raise ReporterError("report command id is invalid")
        command_ids.append(command_id)
    if len(set(command_ids)) != len(command_ids):
        raise ReporterError("report commands are duplicated")
    case_ids: list[str] = []
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"id", "result", "commandId"}:
            raise ReporterError("report case fields are invalid")
        if case.get("result") != "PASS" or case.get("commandId") not in command_ids:
            raise ReporterError("report case result or command binding is invalid")
        case_id = case.get("id")
        if not isinstance(case_id, str) or ID_PATTERN.fullmatch(case_id) is None:
            raise ReporterError("report case id is invalid")
        case_ids.append(case_id)
    if len(set(case_ids)) != len(case_ids):
        raise ReporterError("report cases are duplicated")


def validate_report(report: dict[str, Any], group: str, config: dict[str, Any], *, allow_partial: bool = False) -> None:
    _validate_report_shape(report)
    if report.get("group") != group:
        raise ReporterError("report group is invalid")
    expected_commands = _command_map(config, group)
    actual_commands = {item["id"]: item for item in report["commands"]}
    if allow_partial:
        if not actual_commands or not set(actual_commands).issubset(expected_commands):
            raise ReporterError("partial report command set is invalid")
    elif set(actual_commands) != set(expected_commands):
        raise ReporterError("report command set is incomplete or unknown")
    expected_cases = {
        case_id: command_id
        for command_id, command in expected_commands.items()
        if command_id in actual_commands
        for case_id in command["cases"]
    }
    actual_cases = {item["id"]: item["commandId"] for item in report["cases"]}
    if actual_cases != expected_cases:
        raise ReporterError("report case set or command binding is incomplete or unknown")
    for command_id, item in actual_commands.items():
        if item["source"] != "structured-test-reporter":
            raise ReporterError("report command source does not match the configured producer")


def validate_command_window(report: dict[str, Any], started_at: datetime, completed_at: datetime) -> None:
    report_time = datetime.strptime(report["completedAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    if report_time < started_at - timedelta(seconds=5) or report_time > completed_at + timedelta(seconds=5):
        raise ReporterError("structured test report timestamp is outside the actual command window")


def _run_git(root: Path, arguments: list[str]) -> bytes:
    environment = os.environ.copy()
    environment["GIT_CONFIG_NOSYSTEM"] = "1"
    environment["GIT_TERMINAL_PROMPT"] = "0"
    environment["GIT_NO_LAZY_FETCH"] = "1"
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=True,
            capture_output=True,
            timeout=30,
            env=environment,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ReporterError("local Git source-set verification failed") from error
    return result.stdout


def _tree_payload(root: Path, commit: str, paths: list[str]) -> bytes:
    if re.fullmatch(r"[0-9a-f]{40}", commit) is None:
        raise ReporterError("source-set commit SHA is invalid")
    lines: list[bytes] = []
    for relative in sorted({_safe_relative_path(path) for path in paths}):
        raw = _run_git(root, ["ls-tree", "-z", commit, "--", relative])
        entries = [entry for entry in raw.split(b"\0") if entry]
        if not entries:
            lines.append(b"000000 missing 0000000000000000000000000000000000000000\t" + relative.encode("utf-8") + b"\n")
            continue
        if len(entries) != 1 or not entries[0].endswith(b"\t" + relative.encode("utf-8")):
            raise ReporterError("source-set path is ambiguous")
        if re.fullmatch(rb"[0-7]{6} (blob|commit) [0-9a-f]{40}\t[A-Za-z0-9._/-]+", entries[0]) is None:
            raise ReporterError("source-set tree entry is invalid")
        lines.append(entries[0] + b"\n")
    if not lines:
        raise ReporterError("source-set path list is empty")
    return b"".join(lines)


def _sha256_external(payload: bytes) -> str:
    with tempfile.NamedTemporaryFile(prefix="readmates-source-set-", delete=True) as fixture:
        fixture.write(payload)
        fixture.flush()
        try:
            result = subprocess.run(["sha256sum", fixture.name], check=True, capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError) as error:
            raise ReporterError("platform SHA-256 verifier is unavailable") from error
    digest = result.stdout.split()[0] if result.stdout.split() else ""
    if re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        raise ReporterError("platform SHA-256 verifier output is invalid")
    return f"sha256:{digest}"


def canonical_source_set(root: Path, checkpoint: str, candidate: str, paths: list[str]) -> str:
    normalized_paths = sorted({_safe_relative_path(path) for path in paths})
    checkpoint_payload = _tree_payload(root, checkpoint, normalized_paths)
    candidate_payload = _tree_payload(root, candidate, normalized_paths)
    if checkpoint_payload != candidate_payload:
        raise ReporterError("candidate changed a checkpoint-owned source-set tree entry")
    return _sha256_external(checkpoint_payload)


def _write_report(path: Path, report: dict[str, Any]) -> None:
    if path.is_symlink() or path.exists():
        raise ReporterError("report output must be a new regular file")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def run_command(config: dict[str, Any], group: str, command_id: str, output: Path, root: Path = REPO_ROOT) -> None:
    validate_contract(config, root, require_paths=True, only_group=group)
    command = _command_map(config, group).get(command_id)
    if command is None:
        raise ReporterError("requested command is not a structured test command")
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("READMATES_HOST_ROLLOUT_LIVE_EVIDENCE") != "protected":
        raise ReporterError("structured live report requires protected GitHub Actions context")
    with tempfile.TemporaryDirectory(prefix="readmates-host-report-") as directory:
        raw_path = Path(directory) / "command-result.json"
        environment = os.environ.copy()
        environment["READMATES_HOST_ROLLOUT_COMMAND_ID"] = command_id
        environment["READMATES_HOST_ROLLOUT_CASE_REPORT"] = str(raw_path)
        started_at = datetime.now(timezone.utc)
        try:
            subprocess.run(
                list(command["argv"]),
                cwd=root,
                env=environment,
                check=True,
                timeout=command["timeoutSeconds"],
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ReporterError("structured test command failed") from error
        completed_at = datetime.now(timezone.utc)
        value = _read_json(raw_path, "structured test command result")
    if not isinstance(value, dict):
        raise ReporterError("structured test command result must be an object")
    if group == "cache-safety":
        if "bindings" in value:
            raise ReporterError("structured test command cannot author its own transport binding")
        value["bindings"] = {"profileIdentity": protected_profile_identity(environment)}
    validate_report(value, group, config, allow_partial=True)
    if [item["id"] for item in value["commands"]] != [command_id]:
        raise ReporterError("structured test command result is not bound to the invoked command")
    validate_command_window(value, started_at, completed_at)
    _write_report(output, value)


def combine_reports(config: dict[str, Any], group: str, inputs: list[Path], output: Path) -> None:
    if not 1 <= len(inputs) <= MAX_COMMANDS:
        raise ReporterError("report input list is empty or oversized")
    commands: list[dict[str, str]] = []
    cases: list[dict[str, str]] = []
    times: list[str] = []
    profile_identity: str | None = None
    for path in inputs:
        value = _read_json(path, "partial report")
        if not isinstance(value, dict):
            raise ReporterError("partial report must be an object")
        validate_report(value, group, config, allow_partial=True)
        commands.extend(value["commands"])
        cases.extend(value["cases"])
        times.append(value["completedAt"])
        if group == "cache-safety":
            candidate = value["bindings"]["profileIdentity"]
            if profile_identity is None:
                profile_identity = candidate
            elif candidate != profile_identity:
                raise ReporterError("cache partial reports do not bind the same protected profile")
    report = {
        "schemaVersion": "readmates.host-rollout.test-report.v1",
        "group": group,
        "commands": commands,
        "cases": cases,
        "completedAt": max(times),
    }
    if group == "cache-safety":
        report["bindings"] = {"profileIdentity": profile_identity}
    validate_report(report, group, config)
    _write_report(output, report)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run and validate bounded host rollout evidence reporters")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    check = subparsers.add_parser("check-config")
    check.add_argument("--artifact-ready", action="store_true")
    run = subparsers.add_parser("run-command")
    run.add_argument("--group", required=True)
    run.add_argument("--command", required=True)
    run.add_argument("--output", type=Path, required=True)
    combine = subparsers.add_parser("combine")
    combine.add_argument("--group", required=True)
    combine.add_argument("--input", type=Path, action="append", required=True)
    combine.add_argument("--output", type=Path, required=True)
    validate = subparsers.add_parser("validate-report")
    validate.add_argument("--group", required=True)
    validate.add_argument("--report", type=Path, required=True)
    source = subparsers.add_parser("source-set")
    source.add_argument("--checkpoint", required=True)
    source.add_argument("--candidate", required=True)
    source.add_argument("--path", action="append", required=True)
    source.add_argument("--github-output", type=Path)
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        if args.mode == "check-config":
            validate_contract(config, REPO_ROOT, require_paths=not args.artifact_ready)
        elif args.mode == "run-command":
            run_command(config, args.group, args.command, args.output)
        elif args.mode == "combine":
            combine_reports(config, args.group, args.input, args.output)
        elif args.mode == "validate-report":
            value = _read_json(args.report, "test report")
            if not isinstance(value, dict):
                raise ReporterError("test report must be an object")
            validate_report(value, args.group, config)
        else:
            digest = canonical_source_set(REPO_ROOT, args.checkpoint, args.candidate, args.path)
            line = f"cache-source-set-digest={digest}\n"
            if args.github_output is None:
                sys.stdout.write(line)
            else:
                with args.github_output.open("a", encoding="utf-8") as output:
                    output.write(line)
    except ReporterError as error:
        print(f"Host rollout reporter failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
