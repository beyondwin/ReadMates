#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = REPO_ROOT / "scripts/schemas/host-client-rollout-evidence-v1.schema.json"
DEFAULT_LOCK = REPO_ROOT / "scripts/tooling/gh-attestation-lock.json"
SIGNER_WORKFLOW = ".github/workflows/host-client-rollout-evidence.yml"
PREDICATE_TYPE = "https://slsa.dev/provenance/v1"
MAX_MANIFEST_BYTES = 256 * 1024
MAX_ATTESTATION_BYTES = 4 * 1024 * 1024
MAX_SUBJECT_BYTES = 100 * 1024 * 1024
MAX_GH_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_GH_OUTPUT_BYTES = 4 * 1024 * 1024
GH_TIMEOUT_SECONDS = 90
DOWNLOAD_TIMEOUT_SECONDS = 30

EXPECTED_COMMANDS = {
    "cache-safety": {
        "seed-r2a-prechange-cache",
        "deploy-r2a-cache-policy",
        "playwright-r2a-cache-safety",
    },
    "compatibility": {
        "bff-unit-contract-matrix",
        "server-unit-contract-policy",
        "server-integration-host-security",
        "playwright-contract-rollout",
        "playwright-non-session-regressions",
    },
    "security": {"playwright-authority-cache-regressions"},
}

EXPECTED_CASES = {
    "cache-safety": {
        "origin-immediate-deny",
        "bff-generation-deny",
        "cdn-old-generation-not-served",
        "browser-general-120s",
        "browser-emergency-60s",
        "browser-previous-policy-720s",
        "browser-proof-after-wait",
    },
    "compatibility": {
        "browser-v2-bff-v2v3-backend-support",
        "browser-v2-bff-v2v3-backend-enforce",
        "browser-v3-bff-v2only-blocked",
        "browser-v3-bff-v2v3-backend-v2only-forbidden",
        "browser-v3-bff-v2v3-backend-support",
        "browser-v3-bff-v2v3-backend-enforce",
        "reads-unaffected",
        "capability-probe-no-store",
        "member-approval",
        "invite",
        "notification-policy",
        "notification-preview",
        "notification-confirm",
        "notification-dispatch",
        "manual-resend-confirmation",
        "test-mail",
    },
    "security": {
        "host-authority-revoked",
        "membership-suspended",
        "cross-club-scope",
        "inflight-request-cancelled",
        "exact-club-state-purged",
        "other-club-state-preserved",
        "back-reload-new-tab-offline-no-resurrection",
        "revision-conflict-preserves-draft",
        "authorized-response-loss-preserves-draft",
        "origin-immediate-deny-rerun",
        "old-generation-not-reserved-rerun",
        "browser-general-120s-rerun",
        "browser-emergency-60s-rerun",
    },
}

EXPECTED_PROVENANCE = {
    "cache-safety": {"A7", "C1"},
    "compatibility": {"D3"},
    "security": {"B7", "C1", "D5"},
}

FORBIDDEN_FIELD_PARTS = {
    "secret",
    "password",
    "token",
    "hostname",
    "actorid",
    "memberid",
    "resourceid",
    "tracepath",
    "deploymentid",
    "email",
    "ipaddress",
    "note",
}


class EvidenceError(ValueError):
    pass


def _read_bounded(path: Path, label: str, limit: int) -> bytes:
    try:
        info = path.lstat()
    except OSError as error:
        raise EvidenceError(f"{label} is unavailable") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise EvidenceError(f"{label} must be a regular non-symlink file")
    if info.st_size <= 0 or info.st_size > limit:
        raise EvidenceError(f"{label} size is outside the allowed range")
    try:
        return path.read_bytes()
    except OSError as error:
        raise EvidenceError(f"{label} cannot be read") from error


def _json_depth(value: Any, depth: int = 0) -> int:
    if depth > 20:
        raise EvidenceError("JSON nesting exceeds the allowed depth")
    if isinstance(value, dict):
        return max((_json_depth(item, depth + 1) for item in value.values()), default=depth)
    if isinstance(value, list):
        return max((_json_depth(item, depth + 1) for item in value), default=depth)
    return depth


def _load_json_bytes(raw: bytes, label: str) -> Any:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise EvidenceError(f"{label} is not valid UTF-8 JSON") from error
    _json_depth(value)
    return value


def load_manifest(path: Path) -> dict[str, Any]:
    value = _load_json_bytes(_read_bounded(path, "manifest", MAX_MANIFEST_BYTES), "manifest")
    if not isinstance(value, dict):
        raise EvidenceError("manifest must be a JSON object")
    return value


def load_schema(path: Path) -> dict[str, Any]:
    value = _load_json_bytes(_read_bounded(path, "schema", MAX_MANIFEST_BYTES), "schema")
    if not isinstance(value, dict):
        raise EvidenceError("schema must be a JSON object")
    if value.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        raise EvidenceError("schema must declare JSON Schema draft 2020-12")
    if value.get("additionalProperties") is not False:
        raise EvidenceError("schema must deny unknown top-level fields")
    return value


def _resolve_ref(root: dict[str, Any], ref: str) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise EvidenceError("schema contains a non-local reference")
    value: Any = root
    for part in ref[2:].split("/"):
        if not isinstance(value, dict) or part not in value:
            raise EvidenceError("schema contains an unresolved reference")
        value = value[part]
    if not isinstance(value, dict):
        raise EvidenceError("schema reference does not resolve to an object")
    return value


def _matches_schema(value: Any, schema: dict[str, Any], root: dict[str, Any]) -> bool:
    errors: list[str] = []
    _validate_schema(value, schema, root, "$", errors)
    return not errors


def _validate_schema(
    value: Any,
    schema: dict[str, Any],
    root: dict[str, Any],
    path: str,
    errors: list[str],
) -> None:
    if "$ref" in schema:
        _validate_schema(value, _resolve_ref(root, schema["$ref"]), root, path, errors)
        return
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: value does not match the required constant")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value is not allowed")

    expected_type = schema.get("type")
    type_ok = True
    if expected_type == "object":
        type_ok = isinstance(value, dict)
    elif expected_type == "array":
        type_ok = isinstance(value, list)
    elif expected_type == "string":
        type_ok = isinstance(value, str)
    elif expected_type == "integer":
        type_ok = isinstance(value, int) and not isinstance(value, bool)
    if not type_ok:
        errors.append(f"{path}: value has the wrong type")
        return

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: required field is missing")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{path}: unknown field is forbidden")
        for key, child_schema in properties.items():
            if key in value:
                _validate_schema(value[key], child_schema, root, f"{path}.{key}", errors)

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: too few items")
        if len(value) > schema.get("maxItems", sys.maxsize):
            errors.append(f"{path}: too many items")
        if schema.get("uniqueItems"):
            encoded = [json.dumps(item, sort_keys=True, separators=(",", ":")) for item in value]
            if len(set(encoded)) != len(encoded):
                errors.append(f"{path}: duplicate items are forbidden")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _validate_schema(item, item_schema, root, f"{path}[{index}]", errors)

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: string is too short")
        if len(value) > schema.get("maxLength", sys.maxsize):
            errors.append(f"{path}: string is too long")
        pattern_value = schema.get("pattern")
        if pattern_value is not None and re.search(pattern_value, value) is None:
            errors.append(f"{path}: string does not match the required pattern")
        if schema.get("format") == "date-time":
            try:
                datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                errors.append(f"{path}: timestamp is invalid")

    if isinstance(value, int) and not isinstance(value, bool):
        if value < schema.get("minimum", value):
            errors.append(f"{path}: integer is below the minimum")
        if value > schema.get("maximum", value):
            errors.append(f"{path}: integer is above the maximum")

    for child in schema.get("allOf", []):
        if_clause = child.get("if")
        if if_clause is None:
            _validate_schema(value, child, root, path, errors)
        elif _matches_schema(value, if_clause, root):
            _validate_schema(value, child.get("then", {}), root, path, errors)
        elif "else" in child:
            _validate_schema(value, child["else"], root, path, errors)


def _reject_forbidden_fields(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            if any(part in normalized for part in FORBIDDEN_FIELD_PARTS):
                raise EvidenceError("manifest contains a forbidden sensitive or deployment field")
            _reject_forbidden_fields(child)
    elif isinstance(value, list):
        for child in value:
            _reject_forbidden_fields(child)


def _result_ids(items: Any, label: str) -> set[str]:
    if not isinstance(items, list):
        raise EvidenceError(f"{label} must be an array")
    ids = [item.get("id") for item in items if isinstance(item, dict)]
    if len(ids) != len(items) or len(set(ids)) != len(ids):
        raise EvidenceError(f"{label} must contain unique bounded IDs")
    return set(ids)


def validate_manifest_policy(
    manifest: dict[str, Any],
    schema: dict[str, Any],
    expected_kind: str,
) -> None:
    if expected_kind not in EXPECTED_COMMANDS:
        raise EvidenceError("unsupported evidence kind")
    _reject_forbidden_fields(manifest)
    errors: list[str] = []
    _validate_schema(manifest, schema, schema, "$", errors)
    if errors:
        raise EvidenceError(errors[0])
    if manifest["evidenceKind"] != expected_kind:
        raise EvidenceError("manifest evidence kind does not match the requested kind")
    if manifest["producer"]["job"] != expected_kind:
        raise EvidenceError("producer job does not match the evidence kind")
    repository = manifest["producer"]["repository"]
    expected_workflow_ref = f"{repository}/{SIGNER_WORKFLOW}@{manifest['producer']['sourceRef']}"
    if manifest["producer"]["workflowRef"] != expected_workflow_ref:
        raise EvidenceError("producer workflow identity is inconsistent")
    if _result_ids(manifest["commands"], "commands") != EXPECTED_COMMANDS[expected_kind]:
        raise EvidenceError("manifest commands do not match the exact bounded contract")
    if _result_ids(manifest["cases"], "cases") != EXPECTED_CASES[expected_kind]:
        raise EvidenceError("manifest cases do not match the exact bounded contract")

    provenance_ids = [item["id"] for item in manifest["provenance"]]
    if len(set(provenance_ids)) != len(provenance_ids):
        raise EvidenceError("manifest provenance contains duplicate IDs")
    if set(provenance_ids) != EXPECTED_PROVENANCE[expected_kind]:
        raise EvidenceError("manifest provenance does not match the evidence kind")

    stage = manifest["stage"]
    cache_timestamp_fields = {
        "preChangeCachedAt",
        "policyDeployedAt",
        "waitCompletedAt",
        "browserProofCompletedAt",
    }
    if expected_kind == "cache-safety":
        if stage["name"] != "R2a" or stage["browserContract"] != "v2":
            raise EvidenceError("cache evidence must bind R2a browser v2")
    else:
        if stage["name"] != "R2b" or stage["browserContract"] != "v3":
            raise EvidenceError("R2b evidence must bind browser v3")
        if cache_timestamp_fields.intersection(stage):
            raise EvidenceError("R2b evidence must not carry R2a cache timestamps")


def _checksum_command(path: Path) -> list[str]:
    if platform.system() == "Darwin":
        executable = shutil.which("shasum")
        if executable is None:
            raise EvidenceError("checksum verifier is unavailable")
        return [executable, "-a", "256", str(path)]
    executable = shutil.which("sha256sum")
    if executable is None:
        raise EvidenceError("checksum verifier is unavailable")
    return [executable, str(path)]


def compute_sha256(path: Path) -> str:
    try:
        completed = subprocess.run(
            _checksum_command(path),
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise EvidenceError("checksum verification failed") from error
    if completed.returncode != 0:
        raise EvidenceError("checksum verification failed")
    digest = completed.stdout.split(maxsplit=1)[0].lower() if completed.stdout else ""
    if re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        raise EvidenceError("checksum verifier returned an invalid digest")
    return digest


def verify_expected_checksum(path: Path, expected_digest: str) -> None:
    if re.fullmatch(r"[0-9a-f]{64}", expected_digest) is None or compute_sha256(path) != expected_digest:
        raise EvidenceError("GitHub CLI release checksum mismatch")


def _load_lock(path: Path) -> dict[str, Any]:
    value = _load_json_bytes(_read_bounded(path, "GitHub CLI lock", MAX_MANIFEST_BYTES), "GitHub CLI lock")
    if not isinstance(value, dict):
        raise EvidenceError("GitHub CLI lock must be a JSON object")
    expected_keys = {"schemaVersion", "version", "releaseUrl", "checksumsUrl", "platforms"}
    if set(value) != expected_keys or value.get("schemaVersion") != 1:
        raise EvidenceError("GitHub CLI lock schema is invalid")
    version = value.get("version")
    if not isinstance(version, str) or re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is None:
        raise EvidenceError("GitHub CLI lock version is invalid")
    expected_release = f"https://github.com/cli/cli/releases/tag/v{version}"
    expected_checksums = f"https://github.com/cli/cli/releases/download/v{version}/gh_{version}_checksums.txt"
    if value.get("releaseUrl") != expected_release or value.get("checksumsUrl") != expected_checksums:
        raise EvidenceError("GitHub CLI lock URLs are not official release URLs")
    if not isinstance(value.get("platforms"), dict):
        raise EvidenceError("GitHub CLI lock platforms are invalid")
    return value


def _download_bounded(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "ReadMates-rollout-verifier"})
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, target.open("xb") as output:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_GH_ARCHIVE_BYTES:
                    raise EvidenceError("GitHub CLI release archive exceeds the size limit")
                output.write(chunk)
    except (OSError, urllib.error.URLError, TimeoutError) as error:
        raise EvidenceError("GitHub CLI release download failed") from error
    if total == 0:
        raise EvidenceError("GitHub CLI release download was empty")


def _extract_binary(archive: Path, member_name: str, target: Path) -> None:
    try:
        if archive.suffix == ".zip":
            with zipfile.ZipFile(archive) as bundle:
                member = bundle.getinfo(member_name)
                if member.is_dir() or member.file_size <= 0 or member.file_size > MAX_GH_ARCHIVE_BYTES:
                    raise EvidenceError("GitHub CLI archive member is invalid")
                with bundle.open(member, "r") as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output, length=64 * 1024)
        else:
            with tarfile.open(archive, mode="r:gz") as bundle:
                member = bundle.getmember(member_name)
                if not member.isfile() or member.size <= 0 or member.size > MAX_GH_ARCHIVE_BYTES:
                    raise EvidenceError("GitHub CLI archive member is invalid")
                source = bundle.extractfile(member)
                if source is None:
                    raise EvidenceError("GitHub CLI archive member is unavailable")
                with source, target.open("xb") as output:
                    shutil.copyfileobj(source, output, length=64 * 1024)
    except (KeyError, OSError, tarfile.TarError, zipfile.BadZipFile) as error:
        raise EvidenceError("GitHub CLI release archive is invalid") from error
    target.chmod(0o700)


def ensure_verified_gh(lock_path: Path = DEFAULT_LOCK) -> Path:
    lock = _load_lock(lock_path)
    platform_key = f"{platform.system()}-{platform.machine()}"
    platform_entry = lock["platforms"].get(platform_key)
    if not isinstance(platform_entry, dict) or set(platform_entry) != {"asset", "sha256", "binaryPath"}:
        raise EvidenceError("this platform is not pinned for GitHub CLI attestation verification")
    asset = platform_entry["asset"]
    expected_digest = platform_entry["sha256"]
    binary_path = platform_entry["binaryPath"]
    version = lock["version"]
    if not isinstance(asset, str) or re.fullmatch(rf"gh_{re.escape(version)}_[A-Za-z0-9_.-]+", asset) is None:
        raise EvidenceError("GitHub CLI asset name is invalid")
    if not isinstance(expected_digest, str) or re.fullmatch(r"[0-9a-f]{64}", expected_digest) is None:
        raise EvidenceError("GitHub CLI asset checksum is invalid")
    if not isinstance(binary_path, str) or binary_path.startswith(("/", "..")) or "/../" in binary_path:
        raise EvidenceError("GitHub CLI archive member path is invalid")

    install_parent = REPO_ROOT / ".tmp/host-rollout-gh"
    install_parent.mkdir(parents=True, exist_ok=True)
    if install_parent.is_symlink():
        raise EvidenceError("GitHub CLI install cache must not be a symlink")
    install_dir = Path(tempfile.mkdtemp(prefix=f"gh-{version}-", dir=install_parent))
    archive = install_dir / asset
    binary = install_dir / "gh"
    url = f"https://github.com/cli/cli/releases/download/v{version}/{asset}"
    try:
        _download_bounded(url, archive)
        verify_expected_checksum(archive, expected_digest)
        _extract_binary(archive, binary_path, binary)
    except Exception:
        cleanup_verified_gh(binary)
        raise
    return binary


def cleanup_verified_gh(binary: Path) -> None:
    install_parent = REPO_ROOT / ".tmp/host-rollout-gh"
    try:
        parent = binary.parent
        if (
            binary.name == "gh"
            and parent.parent.resolve(strict=True) == install_parent.resolve(strict=True)
            and parent.name.startswith("gh-")
            and not parent.is_symlink()
        ):
            shutil.rmtree(parent)
    except OSError:
        return


def _verification_command(
    gh_binary: Path,
    manifest_path: Path,
    attestation_path: Path,
    manifest: dict[str, Any],
) -> list[str]:
    repository = manifest["producer"]["repository"]
    return [
        str(gh_binary),
        "attestation",
        "verify",
        str(manifest_path),
        "--repo",
        repository,
        "--bundle",
        str(attestation_path),
        "--signer-workflow",
        f"{repository}/{SIGNER_WORKFLOW}",
        "--source-digest",
        manifest["gitSha"],
        "--source-ref",
        manifest["producer"]["sourceRef"],
        "--deny-self-hosted-runners",
        "--predicate-type",
        PREDICATE_TYPE,
        "--format",
        "json",
    ]


def _subject_verification_command(
    gh_binary: Path,
    subject_path: Path,
    attestation_path: Path,
    repository: str,
    git_sha: str,
    source_ref: str,
) -> list[str]:
    return [
        str(gh_binary),
        "attestation",
        "verify",
        str(subject_path),
        "--repo",
        repository,
        "--bundle",
        str(attestation_path),
        "--signer-workflow",
        f"{repository}/{SIGNER_WORKFLOW}",
        "--source-digest",
        git_sha,
        "--source-ref",
        source_ref,
        "--deny-self-hosted-runners",
        "--predicate-type",
        PREDICATE_TYPE,
        "--format",
        "json",
    ]


def _run_gh_verification(command: list[str]) -> Any:
    with tempfile.TemporaryDirectory(prefix="readmates-gh-verify-") as directory:
        stdout_path = Path(directory) / "stdout.json"
        stderr_path = Path(directory) / "stderr.txt"
        environment = os.environ.copy()
        environment.update({"GH_PROMPT_DISABLED": "1", "NO_COLOR": "1", "GH_DEBUG": "false"})
        try:
            with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
                completed = subprocess.run(
                    command,
                    check=False,
                    stdout=stdout,
                    stderr=stderr,
                    env=environment,
                    timeout=GH_TIMEOUT_SECONDS,
                )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise EvidenceError("GitHub attestation verification could not run") from error
        if completed.returncode != 0:
            raise EvidenceError("GitHub attestation verification failed")
        return _load_json_bytes(
            _read_bounded(stdout_path, "GitHub CLI verified output", MAX_GH_OUTPUT_BYTES),
            "GitHub CLI verified output",
        )


def _verified_timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or len(value) > 64:
        raise EvidenceError("GitHub CLI verified output has an invalid trusted timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise EvidenceError("GitHub CLI verified output has an invalid trusted timestamp") from error
    if parsed.tzinfo is None:
        raise EvidenceError("GitHub CLI verified output has an invalid trusted timestamp")
    return parsed.astimezone(timezone.utc)


def _validate_verified_output(output: Any, manifest_path: Path) -> datetime:
    if not isinstance(output, list) or len(output) != 1 or not isinstance(output[0], dict):
        raise EvidenceError("GitHub CLI verified output must contain one result")
    result = output[0]
    if not isinstance(result.get("attestation"), dict):
        raise EvidenceError("GitHub CLI verified output is missing the attestation")
    verification = result.get("verificationResult")
    if not isinstance(verification, dict):
        raise EvidenceError("GitHub CLI verified output is missing the verification result")
    signature = verification.get("signature")
    if not isinstance(signature, dict) or not isinstance(signature.get("certificate"), dict) or not signature["certificate"]:
        raise EvidenceError("GitHub CLI verified output is missing the verified certificate")
    timestamps = verification.get("verifiedTimestamps")
    if not isinstance(timestamps, list) or not timestamps or len(timestamps) > 32:
        raise EvidenceError("GitHub CLI verified output has no trusted timestamp")
    verified_times: list[datetime] = []
    for timestamp in timestamps:
        if not isinstance(timestamp, dict) or set(timestamp) - {"type", "uri", "timestamp"}:
            raise EvidenceError("GitHub CLI verified output has an invalid trusted timestamp")
        verified_times.append(_verified_timestamp(timestamp.get("timestamp")))
    statement = verification.get("statement")
    if not isinstance(statement, dict) or statement.get("predicateType") != PREDICATE_TYPE:
        raise EvidenceError("GitHub CLI verified output has the wrong predicate type")
    subjects = statement.get("subject")
    if not isinstance(subjects, list) or not subjects:
        raise EvidenceError("GitHub CLI verified output has no subject")
    expected_digest = compute_sha256(manifest_path)
    matches = [
        subject
        for subject in subjects
        if isinstance(subject, dict)
        and isinstance(subject.get("digest"), dict)
        and subject["digest"].get("sha256") == expected_digest
    ]
    if len(matches) != 1:
        raise EvidenceError("GitHub CLI verified output does not bind the manifest digest")
    return min(verified_times)


def verify_evidence(
    manifest_path: Path,
    attestation_path: Path,
    expected_kind: str,
    schema_path: Path = DEFAULT_SCHEMA,
    *,
    gh_binary: Path | None = None,
) -> tuple[dict[str, Any], datetime]:
    if manifest_path.absolute() == attestation_path.absolute():
        raise EvidenceError("manifest and attestation inputs must be separate files")
    manifest = load_manifest(manifest_path)
    validate_manifest_policy(manifest, load_schema(schema_path), expected_kind)
    _read_bounded(attestation_path, "attestation bundle", MAX_ATTESTATION_BYTES)
    owned_binary = gh_binary is None
    binary = gh_binary if gh_binary is not None else ensure_verified_gh()
    try:
        output = _run_gh_verification(_verification_command(binary, manifest_path, attestation_path, manifest))
        verified_at = _validate_verified_output(output, manifest_path)
        return manifest, verified_at
    finally:
        if owned_binary:
            cleanup_verified_gh(binary)


def verify_subject_attestation(
    subject_path: Path,
    attestation_path: Path,
    *,
    repository: str,
    git_sha: str,
    source_ref: str,
    gh_binary: Path | None = None,
) -> datetime:
    if subject_path.absolute() == attestation_path.absolute():
        raise EvidenceError("subject and attestation inputs must be separate files")
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) is None:
        raise EvidenceError("attestation repository is invalid")
    if re.fullmatch(r"[0-9a-f]{40}", git_sha) is None:
        raise EvidenceError("attestation source SHA is invalid")
    if re.fullmatch(r"refs/(heads/[A-Za-z0-9._/-]+|tags/v[0-9]+\.[0-9]+\.[0-9]+)", source_ref) is None:
        raise EvidenceError("attestation source ref is invalid")
    _read_bounded(subject_path, "attested subject", MAX_SUBJECT_BYTES)
    _read_bounded(attestation_path, "attestation bundle", MAX_ATTESTATION_BYTES)
    owned_binary = gh_binary is None
    binary = gh_binary if gh_binary is not None else ensure_verified_gh()
    try:
        output = _run_gh_verification(
            _subject_verification_command(
                binary,
                subject_path,
                attestation_path,
                repository,
                git_sha,
                source_ref,
            )
        )
        return _validate_verified_output(output, subject_path)
    finally:
        if owned_binary:
            cleanup_verified_gh(binary)


def schema_only(
    manifest_path: Path,
    expected_kind: str,
    schema_path: Path = DEFAULT_SCHEMA,
) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    validate_manifest_policy(manifest, load_schema(schema_path), expected_kind)
    return manifest


def require_protected_live_context() -> None:
    signer_workflow_ref = os.environ.get("READMATES_HOST_ROLLOUT_SIGNER_WORKFLOW_REF", "")
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("READMATES_HOST_ROLLOUT_LIVE_EVIDENCE") != "protected"
        or os.environ.get("READMATES_HOST_ROLLOUT_REF_PROTECTED") != "true"
        or f"/{SIGNER_WORKFLOW}@" not in signer_workflow_ref
    ):
        raise EvidenceError("live evidence verification requires the protected evidence workflow")


def _sample_manifest(kind: str) -> dict[str, Any]:
    sha = "1" * 40
    stage: dict[str, Any] = {
        "name": "R2a" if kind == "cache-safety" else "R2b",
        "releaseTag": "v3.0.1" if kind == "cache-safety" else "v3.0.2",
        "browserContract": "v2" if kind == "cache-safety" else "v3",
        "evidenceProducedAt": "2026-08-24T01:20:00Z",
    }
    if kind == "cache-safety":
        stage.update(
            {
                "preChangeCachedAt": "2026-08-24T01:00:00Z",
                "policyDeployedAt": "2026-08-24T01:00:00Z",
                "waitCompletedAt": "2026-08-24T01:12:00Z",
                "browserProofCompletedAt": "2026-08-24T01:15:00Z",
            }
        )
    return {
        "schemaVersion": "host-client-rollout-evidence/v1",
        "evidenceKind": kind,
        "gitSha": sha,
        "candidateId": "r2a-111111111111" if kind == "cache-safety" else "r2b-111111111111",
        "backendDigest": "sha256:" + "2" * 64,
        "pagesDigest": "sha256:" + ("3" if kind == "cache-safety" else "4") * 64,
        "cacheSafetySourceSetDigest": "sha256:" + "5" * 64,
        "producer": {
            "repository": "example/readmates",
            "workflowRef": "example/readmates/.github/workflows/host-client-rollout-evidence.yml@refs/heads/main",
            "sourceRef": "refs/heads/main",
            "runId": "1234",
            "runAttempt": 1,
            "job": kind,
            "startedAt": "2026-08-24T00:59:00Z",
        },
        "commands": [{"id": item, "result": "PASS"} for item in sorted(EXPECTED_COMMANDS[kind])],
        "cases": [{"id": item, "result": "PASS"} for item in sorted(EXPECTED_CASES[kind])],
        "provenance": [{"id": item, "gitSha": sha} for item in sorted(EXPECTED_PROVENANCE[kind])],
        "stage": stage,
    }


class EvidenceVerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = load_schema(DEFAULT_SCHEMA)

    def test_schema_and_policy_accept_all_three_exact_kinds(self) -> None:
        for kind in EXPECTED_COMMANDS:
            with self.subTest(kind=kind):
                validate_manifest_policy(_sample_manifest(kind), self.schema, kind)

    def test_missing_unknown_sensitive_and_duplicate_fields_fail_closed(self) -> None:
        cases: list[tuple[str, dict[str, Any]]] = []
        missing = _sample_manifest("cache-safety")
        missing.pop("gitSha")
        cases.append(("missing", missing))
        unknown = _sample_manifest("cache-safety")
        unknown["unknown"] = "value"
        cases.append(("unknown", unknown))
        sensitive = _sample_manifest("cache-safety")
        sensitive["memberId"] = "example"
        cases.append(("sensitive", sensitive))
        duplicate = _sample_manifest("cache-safety")
        duplicate["commands"].append(duplicate["commands"][0])
        cases.append(("duplicate", duplicate))
        for name, manifest in cases:
            with self.subTest(name=name), self.assertRaises(EvidenceError):
                validate_manifest_policy(manifest, self.schema, "cache-safety")

    def test_missing_unknown_command_case_and_provenance_fail_closed(self) -> None:
        for field in ("commands", "cases", "provenance"):
            manifest = _sample_manifest("security")
            manifest[field] = manifest[field][:-1]
            with self.subTest(field=field), self.assertRaises(EvidenceError):
                validate_manifest_policy(manifest, self.schema, "security")
        manifest = _sample_manifest("compatibility")
        manifest["cases"][0]["id"] = "unknown-case"
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(manifest, self.schema, "compatibility")

    def test_kind_job_stage_and_browser_binding_fail_closed(self) -> None:
        manifest = _sample_manifest("compatibility")
        manifest["producer"]["job"] = "security"
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(manifest, self.schema, "compatibility")
        manifest = _sample_manifest("compatibility")
        manifest["stage"]["browserContract"] = "v2"
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(manifest, self.schema, "compatibility")

    def test_producer_ref_and_kind_specific_timestamp_fields_fail_closed(self) -> None:
        manifest = _sample_manifest("cache-safety")
        manifest["producer"]["workflowRef"] = (
            "example/readmates/.github/workflows/host-client-rollout-evidence.yml@refs/heads/release"
        )
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(manifest, self.schema, "cache-safety")

        manifest = _sample_manifest("compatibility")
        manifest["stage"]["waitCompletedAt"] = "2026-08-24T01:12:00Z"
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(manifest, self.schema, "compatibility")

    def test_checksum_uses_platform_verifier_and_detects_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "archive"
            path.write_bytes(b"official release fixture")
            digest = compute_sha256(path)
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            self.assertNotEqual(digest, "0" * 64)
            verify_expected_checksum(path, digest)
            with self.assertRaises(EvidenceError):
                verify_expected_checksum(path, "0" * 64)

    def test_locked_archive_member_paths_match_official_release_layout(self) -> None:
        lock = _load_lock(DEFAULT_LOCK)
        version = lock["version"]
        expected = {
            "Linux-x86_64": f"gh_{version}_linux_amd64/bin/gh",
            "Linux-aarch64": f"gh_{version}_linux_arm64/bin/gh",
            "Darwin-x86_64": f"gh_{version}_macOS_amd64/bin/gh",
            "Darwin-arm64": f"gh_{version}_macOS_arm64/bin/gh",
        }
        self.assertEqual(
            {key: entry["binaryPath"] for key, entry in lock["platforms"].items()},
            expected,
        )

    def test_verified_gh_temporary_install_is_removed_and_bounded(self) -> None:
        install_parent = REPO_ROOT / ".tmp/host-rollout-gh"
        install_parent.mkdir(parents=True, exist_ok=True)
        install_dir = Path(tempfile.mkdtemp(prefix="gh-fixture-", dir=install_parent))
        binary = install_dir / "gh"
        binary.write_bytes(b"fixture")
        cleanup_verified_gh(binary)
        self.assertFalse(install_dir.exists())
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory) / "gh"
            outside.write_bytes(b"fixture")
            cleanup_verified_gh(outside)
            self.assertTrue(outside.exists())

    def test_verified_gh_failed_install_is_cleaned_in_finally_path(self) -> None:
        install_parent = REPO_ROOT / ".tmp/host-rollout-gh"
        install_parent.mkdir(parents=True, exist_ok=True)
        before = {item.name for item in install_parent.iterdir()}
        with (
            mock.patch.object(platform, "system", return_value="Linux"),
            mock.patch.object(platform, "machine", return_value="x86_64"),
            mock.patch.object(sys.modules[__name__], "_download_bounded", side_effect=EvidenceError("fixture")),
            self.assertRaises(EvidenceError),
        ):
            ensure_verified_gh()
        self.assertEqual({item.name for item in install_parent.iterdir()}, before)

    def test_verified_output_requires_subject_predicate_and_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "cache-safety.manifest.json"
            manifest_path.write_text(json.dumps(_sample_manifest("cache-safety")), encoding="utf-8")
            digest = compute_sha256(manifest_path)
            valid = [
                {
                    "attestation": {"bundle": {}},
                    "verificationResult": {
                        "signature": {"certificate": {"issuer": "fixture"}},
                        "verifiedTimestamps": [
                            {"type": "transparency-log", "timestamp": "2026-08-24T01:21:00Z"}
                        ],
                        "statement": {
                            "predicateType": PREDICATE_TYPE,
                            "subject": [{"name": manifest_path.name, "digest": {"sha256": digest}}],
                        },
                    },
                }
            ]
            self.assertEqual(
                _validate_verified_output(valid, manifest_path),
                datetime.strptime("2026-08-24T01:21:00Z", "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc),
            )
            for name, mutate in (
                ("timestamp", lambda value: value[0]["verificationResult"].update({"verifiedTimestamps": []})),
                ("empty timestamp", lambda value: value[0]["verificationResult"].update({"verifiedTimestamps": [{}]})),
                ("certificate", lambda value: value[0]["verificationResult"].pop("signature", None)),
                ("predicate", lambda value: value[0]["verificationResult"]["statement"].update({"predicateType": "invalid"})),
                ("subject", lambda value: value[0]["verificationResult"]["statement"].update({"subject": []})),
            ):
                broken = json.loads(json.dumps(valid))
                mutate(broken)
                with self.subTest(name=name), self.assertRaises(EvidenceError):
                    _validate_verified_output(broken, manifest_path)

    def test_explicit_gh_command_enforces_every_trust_input(self) -> None:
        manifest = _sample_manifest("cache-safety")
        command = _verification_command(Path("/verified/gh"), Path("manifest.json"), Path("bundle.jsonl"), manifest)
        self.assertEqual(command[0:3], ["/verified/gh", "attestation", "verify"])
        self.assertIn("--bundle", command)
        self.assertEqual(command[command.index("--repo") + 1], "example/readmates")
        self.assertEqual(
            command[command.index("--signer-workflow") + 1],
            "example/readmates/.github/workflows/host-client-rollout-evidence.yml",
        )
        self.assertEqual(command[command.index("--source-digest") + 1], "1" * 40)
        self.assertEqual(command[command.index("--source-ref") + 1], "refs/heads/main")
        self.assertIn("--deny-self-hosted-runners", command)
        self.assertEqual(command[command.index("--predicate-type") + 1], PREDICATE_TYPE)
        self.assertEqual(command[-2:], ["--format", "json"])

    def test_verify_evidence_returns_manifest_and_verified_signing_time(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "cache-safety.manifest.json"
            bundle_path = Path(directory) / "cache-safety.intoto.jsonl"
            manifest = _sample_manifest("cache-safety")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            bundle_path.write_text("{}\n", encoding="utf-8")
            digest = compute_sha256(manifest_path)
            verified_output = [
                {
                    "attestation": {"bundle": {}},
                    "verificationResult": {
                        "signature": {"certificate": {"issuer": "fixture"}},
                        "verifiedTimestamps": [
                            {"type": "Tlog", "timestamp": "2026-08-24T01:21:00Z"}
                        ],
                        "statement": {
                            "predicateType": PREDICATE_TYPE,
                            "subject": [{"name": manifest_path.name, "digest": {"sha256": digest}}],
                        },
                    },
                }
            ]
            with mock.patch.object(sys.modules[__name__], "_run_gh_verification", return_value=verified_output):
                actual_manifest, verified_at = verify_evidence(
                    manifest_path,
                    bundle_path,
                    "cache-safety",
                    gh_binary=Path("/verified/gh"),
                )
            self.assertEqual(actual_manifest, manifest)
            self.assertEqual(verified_at, datetime(2026, 8, 24, 1, 21, tzinfo=timezone.utc))

    def test_verify_subject_attestation_binds_exact_candidate_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            subject = Path(directory) / "readmates-pages-candidate.tar"
            bundle = Path(directory) / "pages-candidate.intoto.jsonl"
            subject.write_bytes(b"exact deterministic candidate")
            bundle.write_text("{}\n", encoding="utf-8")
            digest = compute_sha256(subject)
            verified_output = [
                {
                    "attestation": {"bundle": {}},
                    "verificationResult": {
                        "signature": {"certificate": {"issuer": "fixture"}},
                        "verifiedTimestamps": [{"type": "Tlog", "timestamp": "2026-08-24T01:21:00Z"}],
                        "statement": {
                            "predicateType": PREDICATE_TYPE,
                            "subject": [{"name": subject.name, "digest": {"sha256": digest}}],
                        },
                    },
                }
            ]
            with mock.patch.object(sys.modules[__name__], "_run_gh_verification", return_value=verified_output):
                verified_at = verify_subject_attestation(
                    subject,
                    bundle,
                    repository="example/readmates",
                    git_sha="1" * 40,
                    source_ref="refs/heads/host-rollout-r2b",
                    gh_binary=Path("/verified/gh"),
                )
            self.assertEqual(verified_at, datetime(2026, 8, 24, 1, 21, tzinfo=timezone.utc))

    def test_unavailable_network_trust_or_signature_failure_is_redacted_and_closed(self) -> None:
        with self.assertRaisesRegex(EvidenceError, "verification failed"):
            _run_gh_verification([sys.executable, "-c", "import sys; sys.exit(2)"])

    def test_live_mode_rejects_untrusted_or_local_invocation(self) -> None:
        with self.assertRaises(EvidenceError):
            require_protected_live_context()

    def test_live_mode_accepts_only_the_called_protected_signer_context(self) -> None:
        trusted = {
            "GITHUB_ACTIONS": "true",
            "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE": "protected",
            "READMATES_HOST_ROLLOUT_REF_PROTECTED": "true",
            "READMATES_HOST_ROLLOUT_SIGNER_WORKFLOW_REF": (
                "example/readmates/.github/workflows/host-client-rollout-evidence.yml@refs/heads/main"
            ),
            "GITHUB_WORKFLOW_REF": "example/readmates/.github/workflows/caller.yml@refs/heads/main",
        }
        with mock.patch.dict(os.environ, trusted, clear=True):
            require_protected_live_context()
        trusted.pop("READMATES_HOST_ROLLOUT_SIGNER_WORKFLOW_REF")
        trusted["GITHUB_WORKFLOW_REF"] = (
            "example/readmates/.github/workflows/host-client-rollout-evidence.yml@refs/heads/main"
        )
        with mock.patch.dict(os.environ, trusted, clear=True), self.assertRaises(EvidenceError):
            require_protected_live_context()

    def test_human_authored_unattested_missing_and_same_path_inputs_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "cache-safety.manifest.json"
            manifest_path.write_text(json.dumps(_sample_manifest("cache-safety")), encoding="utf-8")
            with self.assertRaises(EvidenceError):
                verify_evidence(manifest_path, manifest_path, "cache-safety", gh_binary=Path("missing-gh"))
            with self.assertRaises(EvidenceError):
                verify_evidence(manifest_path, Path(directory) / "missing.intoto.jsonl", "cache-safety", gh_binary=Path("missing-gh"))

    def test_wrong_repository_workflow_ref_sha_ref_and_accessibility_kind_fail_closed(self) -> None:
        cases: list[tuple[str, dict[str, Any], str]] = []
        wrong_workflow = _sample_manifest("cache-safety")
        wrong_workflow["producer"]["workflowRef"] = "other/readmates/.github/workflows/host-client-rollout-evidence.yml@refs/heads/main"
        cases.append(("workflow", wrong_workflow, "cache-safety"))
        wrong_sha = _sample_manifest("cache-safety")
        wrong_sha["gitSha"] = "short"
        cases.append(("sha", wrong_sha, "cache-safety"))
        wrong_ref = _sample_manifest("cache-safety")
        wrong_ref["producer"]["sourceRef"] = "refs/pull/1/merge"
        cases.append(("ref", wrong_ref, "cache-safety"))
        for name, manifest, kind in cases:
            with self.subTest(name=name), self.assertRaises(EvidenceError):
                validate_manifest_policy(manifest, self.schema, kind)
        with self.assertRaises(EvidenceError):
            validate_manifest_policy(_sample_manifest("cache-safety"), self.schema, "accessibility")


def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(EvidenceVerifierTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify one attested host-client rollout evidence manifest")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--attestation", type=Path)
    parser.add_argument("--kind", choices=sorted(EXPECTED_COMMANDS))
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--schema-only", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()
    if args.manifest is None or args.kind is None:
        parser.error("--manifest and --kind are required outside self-test mode")
    if not args.schema_only and args.attestation is None:
        parser.error("--attestation is required outside schema-only mode")
    try:
        if args.schema_only:
            schema_only(args.manifest, args.kind, args.schema)
        else:
            require_protected_live_context()
            verify_evidence(args.manifest, args.attestation, args.kind, args.schema)
    except EvidenceError as error:
        print(f"host rollout evidence: {error}", file=sys.stderr)
        return 1
    print(f"Host rollout evidence policy passed: {args.kind}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
