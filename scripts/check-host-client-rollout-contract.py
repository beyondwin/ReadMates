#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


REPO_ROOT = Path(__file__).resolve().parents[1]
VERIFIER_PATH = REPO_ROOT / "scripts/verify-host-client-rollout-evidence.py"


def _load_verifier() -> Any:
    spec = importlib.util.spec_from_file_location("readmates_host_rollout_verifier", VERIFIER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("host rollout verifier module is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verifier = _load_verifier()
EvidenceError = verifier.EvidenceError

REQUIRED_SOURCES = (
    ".github/workflows/ci.yml",
    ".github/workflows/host-client-rollout-evidence.yml",
    ".github/workflows/sync-config.yml",
    ".github/workflows/deploy-server.yml",
    ".github/workflows/deploy-front.yml",
    "server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt",
    "scripts/check-host-client-rollout-contract.py",
    "scripts/verify-host-client-rollout-evidence.py",
    "scripts/schemas/host-client-rollout-evidence-v1.schema.json",
    "scripts/tooling/gh-attestation-lock.json",
    "scripts/README.md",
    "scripts/build-public-release-candidate.sh",
    "scripts/verify-public-release-fixtures.sh",
    "docs/deploy/release-publish-runbook.md",
    "docs/deploy/cloudflare-pages.md",
    "docs/development/release-management.md",
    "docs/development/versioning.md",
    ".env.example",
    ".gitignore",
)

ATTEST_PIN = "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4.2.1"
UPLOAD_PIN = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1"
DOWNLOAD_PIN = "actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3 # v8.0.0"
MAX_ATTESTATION_SKEW_SECONDS = 300


class ContractError(ValueError):
    pass


class _YamlToken:
    def __init__(self, indent: int, text: str, line: int, block: str | None = None) -> None:
        self.indent = indent
        self.text = text
        self.line = line
        self.block = block


def _strip_yaml_comment(value: str) -> str:
    single = False
    double = False
    for index, character in enumerate(value):
        if character == "'" and not double:
            single = not single
        elif character == '"' and not single and (index == 0 or value[index - 1] != "\\"):
            double = not double
        elif character == "#" and not single and not double and (index == 0 or value[index - 1].isspace()):
            return value[:index].rstrip()
    if single or double:
        raise ContractError("workflow YAML contains an unterminated quoted scalar")
    return value.rstrip()


def _yaml_tokens(source: str) -> list[_YamlToken]:
    if len(source.encode("utf-8")) > 1_048_576:
        raise ContractError("workflow YAML exceeds the structural size limit")
    raw_lines = source.splitlines()
    tokens: list[_YamlToken] = []
    index = 0
    while index < len(raw_lines):
        raw = raw_lines[index]
        line_number = index + 1
        index += 1
        if "\t" in raw:
            raise ContractError(f"workflow YAML line {line_number} contains a tab")
        stripped = raw.lstrip(" ")
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw) - len(stripped)
        if indent % 2:
            raise ContractError(f"workflow YAML line {line_number} has invalid indentation")
        text = _strip_yaml_comment(stripped)
        block_match = re.match(r"^([^:]+):\s*([|>])[-+]?\s*$", text)
        if block_match:
            block_lines: list[str] = []
            while index < len(raw_lines):
                candidate = raw_lines[index]
                candidate_stripped = candidate.lstrip(" ")
                candidate_indent = len(candidate) - len(candidate_stripped)
                if candidate_stripped and candidate_indent <= indent:
                    break
                index += 1
                if not candidate_stripped:
                    block_lines.append("")
                    continue
                if "\t" in candidate:
                    raise ContractError(f"workflow YAML line {index} contains a tab")
                block_lines.append(candidate[indent + 2 :])
            separator = "\n" if block_match.group(2) == "|" else " "
            tokens.append(_YamlToken(indent, f"{block_match.group(1).strip()}:", line_number, separator.join(block_lines)))
            continue
        tokens.append(_YamlToken(indent, text, line_number))
    if not tokens:
        raise ContractError("workflow YAML is empty")
    return tokens


def _yaml_key_value(text: str, line: int) -> tuple[str, str]:
    if ":" not in text:
        raise ContractError(f"workflow YAML line {line} is not a mapping entry")
    key, value = text.split(":", 1)
    key = key.strip()
    if re.fullmatch(r"[A-Za-z0-9_.-]+", key) is None:
        raise ContractError(f"workflow YAML line {line} has an unsupported mapping key")
    return key, value.strip()


def _yaml_scalar(value: str, line: int) -> Any:
    if value == "":
        return None
    if value.startswith(("&", "*", "!")):
        raise ContractError(f"workflow YAML line {line} uses an unsupported YAML feature")
    if value.startswith('"'):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as error:
            raise ContractError(f"workflow YAML line {line} has an invalid quoted scalar") from error
        if not isinstance(parsed, str):
            raise ContractError(f"workflow YAML line {line} has an invalid scalar")
        return parsed
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise ContractError(f"workflow YAML line {line} has an invalid quoted scalar")
        return value[1:-1].replace("''", "'")
    if value in {"true", "false"}:
        return value == "true"
    if value in {"null", "~"}:
        return None
    if re.fullmatch(r"[0-9]+", value):
        return int(value)
    if value.startswith("[") or value.startswith("{"):
        try:
            return json.loads(value)
        except json.JSONDecodeError as error:
            raise ContractError(f"workflow YAML line {line} has an invalid flow scalar") from error
    return value


def _parse_workflow_yaml(source: str) -> dict[str, Any]:
    tokens = _yaml_tokens(source)

    def parse_block(position: int, indent: int) -> tuple[Any, int]:
        if position >= len(tokens) or tokens[position].indent != indent:
            raise ContractError("workflow YAML contains an invalid nested block")
        is_sequence = tokens[position].text == "-" or tokens[position].text.startswith("- ")
        if is_sequence:
            result_list: list[Any] = []
            while position < len(tokens) and tokens[position].indent == indent:
                token = tokens[position]
                if token.text != "-" and not token.text.startswith("- "):
                    raise ContractError(f"workflow YAML line {token.line} mixes mapping and sequence entries")
                rest = token.text[1:].strip()
                position += 1
                if rest == "":
                    if position >= len(tokens) or tokens[position].indent <= indent:
                        raise ContractError(f"workflow YAML line {token.line} has an empty sequence item")
                    item, position = parse_block(position, tokens[position].indent)
                elif ":" in rest:
                    key, scalar = _yaml_key_value(rest, token.line)
                    item = {}
                    if scalar:
                        item[key] = _yaml_scalar(scalar, token.line)
                    elif token.block is not None:
                        item[key] = token.block
                    elif position < len(tokens) and tokens[position].indent > indent + 2:
                        item[key], position = parse_block(position, tokens[position].indent)
                    else:
                        item[key] = None
                    if position < len(tokens) and tokens[position].indent > indent:
                        continuation_indent = tokens[position].indent
                        continuation, position = parse_block(position, continuation_indent)
                        if not isinstance(continuation, dict):
                            raise ContractError(f"workflow YAML line {token.line} has an invalid sequence mapping")
                        for continuation_key, continuation_value in continuation.items():
                            if continuation_key in item:
                                raise ContractError(f"workflow YAML line {token.line} has a duplicate mapping key")
                            item[continuation_key] = continuation_value
                else:
                    item = _yaml_scalar(rest, token.line)
                result_list.append(item)
            return result_list, position

        result: dict[str, Any] = {}
        while position < len(tokens) and tokens[position].indent == indent:
            token = tokens[position]
            if token.text == "-" or token.text.startswith("- "):
                raise ContractError(f"workflow YAML line {token.line} mixes mapping and sequence entries")
            key, scalar = _yaml_key_value(token.text, token.line)
            if key in result:
                raise ContractError(f"workflow YAML line {token.line} has a duplicate mapping key")
            position += 1
            if token.block is not None:
                result[key] = token.block
            elif scalar:
                result[key] = _yaml_scalar(scalar, token.line)
            elif position < len(tokens) and tokens[position].indent > indent:
                result[key], position = parse_block(position, tokens[position].indent)
            else:
                result[key] = None
        return result, position

    parsed, final_position = parse_block(0, tokens[0].indent)
    if final_position != len(tokens) or not isinstance(parsed, dict) or tokens[0].indent != 0:
        raise ContractError("workflow YAML root is invalid")
    if not isinstance(parsed.get("jobs"), dict):
        raise ContractError("workflow YAML jobs mapping is missing")
    return parsed


def _read_sources(root: Path) -> dict[str, str]:
    sources: dict[str, str] = {}
    for relative in REQUIRED_SOURCES:
        path = root / relative
        try:
            if path.is_symlink() or not path.is_file():
                raise OSError
            sources[relative] = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise ContractError(f"required rollout contract source is unavailable: {relative}") from error
    return sources


def _require(source: str, needle: str, message: str, errors: list[str]) -> None:
    if needle not in source:
        errors.append(message)


def _forbid(source: str, needle: str, message: str, errors: list[str]) -> None:
    if needle in source:
        errors.append(message)


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _sequence(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _needs(job: dict[str, Any]) -> set[str]:
    return {str(item) for item in _sequence(job.get("needs"))}


def _steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in _sequence(job.get("steps")) if isinstance(item, dict)]


def _step(job: dict[str, Any], *, step_id: str | None = None, uses: str | None = None) -> dict[str, Any]:
    matches = []
    for item in _steps(job):
        if step_id is not None and item.get("id") != step_id:
            continue
        if uses is not None and item.get("uses") != uses:
            continue
        matches.append(item)
    return matches[0] if len(matches) == 1 else {}


def _workflow_ast(path: str, sources: dict[str, str], errors: list[str]) -> dict[str, Any]:
    try:
        return _parse_workflow_yaml(sources[path])
    except ContractError as error:
        errors.append(f"{path} is not valid supported workflow YAML: {error}")
        return {}


def _is_full_action_pin(value: Any) -> bool:
    return isinstance(value, str) and (
        value.startswith("./.github/workflows/")
        or re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}", value) is not None
    )


def validate_structural_sources(sources: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED_SOURCES:
        if relative not in sources:
            errors.append(f"required source is missing: {relative}")
    if errors:
        return errors

    ci_ast = _workflow_ast(".github/workflows/ci.yml", sources, errors)
    ci_runs = "\n".join(str(item.get("run", "")) for job in _mapping(ci_ast.get("jobs")).values() for item in _steps(_mapping(job)))
    _require(ci_runs, "python3 -B scripts/check-host-client-rollout-contract.py --self-test", "CI omits rollout contract self-test", errors)
    _require(ci_runs, "python3 -B scripts/check-host-client-rollout-contract.py", "CI omits rollout structural mode", errors)
    _require(ci_runs, "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test", "CI omits evidence verifier self-test", errors)
    if "--cache-manifest" in ci_runs or "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE" in ci_runs:
        errors.append("normal CI must not invoke live rollout evidence")

    workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
    workflow = sources[workflow_path]
    workflow_ast = _workflow_ast(workflow_path, sources, errors)
    trigger = _mapping(workflow_ast.get("on"))
    push = _mapping(trigger.get("push"))
    if set(trigger) != {"push"} or set(_sequence(push.get("branches"))) != {"host-rollout-r2a", "host-rollout-r2b"}:
        errors.append("live evidence trigger must be protected R2a/R2b push only")
    if any(item in trigger for item in ("workflow_dispatch", "pull_request", "pull_request_target", "workflow_call")):
        errors.append("live evidence must not have manual, PR, or caller-authored triggers")
    if "inputs." in workflow:
        errors.append("protected evidence subject or predicate must not depend on workflow inputs")
    if _mapping(workflow_ast.get("permissions")) != {"contents": "read", "actions": "read"}:
        errors.append("orchestrator top-level permissions are not least privilege")

    jobs = _mapping(workflow_ast.get("jobs"))
    required_jobs = {
        "source",
        "pages-candidate",
        "prime-r2a-cache",
        "build-r2a-policy",
        "deploy-r2a-policy",
        "wait-r2a-cache-lifetime",
        "browser-r2a-proof",
        "compatibility-r2b",
        "security-r2b",
        "resolve-r2a",
        "attest-evidence",
        "final-evidence-gate",
        "deploy-pages",
    }
    if not required_jobs.issubset(jobs):
        errors.append("protected rollout orchestrator jobs are incomplete")
    for job in jobs.values():
        for item in _steps(_mapping(job)):
            if "uses" in item and not _is_full_action_pin(item["uses"]):
                errors.append("workflow action is not pinned by full commit SHA")

    source_job = _mapping(jobs.get("source"))
    source_if = str(source_job.get("if", ""))
    if not all(term in source_if for term in ("github.ref_protected", "github.event_name == 'push'", "github.event.repository.fork == false")):
        errors.append("source job does not deny unprotected, non-push, or fork execution")
    if _mapping(source_job.get("environment")).get("name") != "host-client-rollout-source":
        errors.append("protected source environment is missing")
    source_runs = "\n".join(str(item.get("run", "")) for item in _steps(source_job))
    for needle, message in (
        ("git tag --points-at", "source job does not derive its immutable tag from checked-out SHA"),
        ("git cat-file -t", "source job does not require an annotated release tag"),
        ("git merge-base --is-ancestor", "source job does not verify checkpoint ancestry"),
        ("feat(publication): version public projections and convergence", "C1 checkpoint provenance is not derived from history"),
        ("feat(front): purge host state on authority loss", "B7 checkpoint provenance is not derived from history"),
        ("test(host): prove client contract v3 compatibility", "D3 checkpoint provenance is not derived from history"),
        ("test(host): verify authority and public cache recovery", "D5 checkpoint provenance is not derived from history"),
        ("git archive --format=tar", "C1 source-set digest is not derived from checked-out history"),
    ):
        _require(source_runs, needle, message, errors)

    pages_job = _mapping(jobs.get("pages-candidate"))
    if _needs(pages_job) != {"source"}:
        errors.append("Pages package job must depend only on protected source")
    digest_step = _step(pages_job, step_id="digest")
    upload_step = _step(pages_job, step_id="upload")
    if "sha256sum" not in str(digest_step.get("run", "")) or _mapping(pages_job.get("outputs")).get("pages-digest") != "${{ steps.digest.outputs.pages-digest }}":
        errors.append("Pages digest must be the SHA-256 of exact deterministic candidate bytes")
    if upload_step.get("uses") != UPLOAD_PIN.split(" #", 1)[0] or _mapping(upload_step.get("with")).get("archive") is not False:
        errors.append("Pages candidate must use the pinned unarchived upload action")
    if "artifact-digest" in str(_mapping(pages_job.get("outputs")).get("pages-digest", "")):
        errors.append("Pages digest must not use upload-artifact container metadata")

    build_policy_job = _mapping(jobs.get("build-r2a-policy"))
    if _needs(build_policy_job) != {"source", "prime-r2a-cache"} or build_policy_job.get("uses") != "./.github/workflows/deploy-server.yml":
        errors.append("R2a policy image build must follow the pre-change cache proof")
    deploy_policy_job = _mapping(jobs.get("deploy-r2a-policy"))
    deploy_policy_run = str(_step(deploy_policy_job, step_id="deploy").get("run", ""))
    if _needs(deploy_policy_job) != {"source", "prime-r2a-cache", "build-r2a-policy"}:
        errors.append("R2a runtime policy deployment must follow its exact image build")
    if _mapping(deploy_policy_job.get("environment")).get("name") != "host-client-rollout-r2a":
        errors.append("R2a runtime policy deployment lacks its protected environment")
    if "./deploy/oci/05-deploy-compose-stack.sh" not in deploy_policy_run or "deployed-at=" not in deploy_policy_run:
        errors.append("policyDeployedAt is not generated after the real OCI deploy and health action")
    wait_job = _mapping(jobs.get("wait-r2a-cache-lifetime"))
    wait_run = str(_step(wait_job, step_id="wait").get("run", ""))
    if _needs(wait_job) != {"source", "prime-r2a-cache", "deploy-r2a-policy"} or "base_epoch + 720" not in wait_run or "sleep" not in wait_run:
        errors.append("R2a wait job does not enforce a real max-timestamp plus 720-second wait")
    if _needs(_mapping(jobs.get("browser-r2a-proof"))) != {"source", "wait-r2a-cache-lifetime"}:
        errors.append("R2a browser proof must run only after the real wait")

    attest_job = _mapping(jobs.get("attest-evidence"))
    if not {"pages-candidate", "browser-r2a-proof", "compatibility-r2b", "security-r2b", "resolve-r2a"}.issubset(_needs(attest_job)):
        errors.append("attestation producer is not bound to all exact result jobs")
    if _mapping(attest_job.get("environment")).get("name") != "host-client-rollout-evidence":
        errors.append("protected evidence environment is missing")
    attest_permissions = _mapping(attest_job.get("permissions"))
    if attest_permissions != {"actions": "read", "contents": "read", "id-token": "write", "attestations": "write", "artifact-metadata": "write"}:
        errors.append("attestation job permissions are not exact least privilege")
    manifest_step = _step(attest_job, step_id="manifest")
    manifest_env = _mapping(manifest_step.get("env"))
    required_bindings = {
        "GIT_SHA": "${{ needs.source.outputs.git-sha }}",
        "CANDIDATE_ID": "${{ needs.source.outputs.candidate-id }}",
        "PAGES_DIGEST": "${{ needs.pages-candidate.outputs.pages-digest }}",
        "R2A_BACKEND_DIGEST": "${{ needs.deploy-r2a-policy.outputs.backend-digest }}",
        "IMPORTED_BACKEND_DIGEST": "${{ needs.resolve-r2a.outputs.backend-digest }}",
        "PRE_CHANGE_CACHED_AT": "${{ needs.prime-r2a-cache.outputs.pre-change-cached-at }}",
        "POLICY_DEPLOYED_AT": "${{ needs.deploy-r2a-policy.outputs.deployed-at }}",
        "WAIT_COMPLETED_AT": "${{ needs.wait-r2a-cache-lifetime.outputs.wait-completed-at }}",
        "BROWSER_PROOF_COMPLETED_AT": "${{ needs.browser-r2a-proof.outputs.browser-proof-completed-at }}",
    }
    if any(manifest_env.get(key) != value for key, value in required_bindings.items()):
        errors.append("manifest identity, digest, or time is not bound to exact protected job outputs")
    manifest_run = str(manifest_step.get("run", ""))
    if "json.dumps(manifest" not in manifest_run or "date -u" not in manifest_run or "--schema-only" not in manifest_run:
        errors.append("signer does not construct and schema-check its own bounded manifest")
    if "download" in str(manifest_step.get("name", "")).lower() or "incoming" in manifest_run:
        errors.append("signer must not attest a downloaded caller-authored manifest")
    attested_subjects = {
        _mapping(item.get("with")).get("subject-path")
        for item in _steps(attest_job)
        if item.get("uses") == ATTEST_PIN.split(" #", 1)[0]
    }
    if attested_subjects != {
        "front/output/host-rollout/candidate/readmates-pages-candidate.tar",
        "front/output/host-rollout/attested/cache-safety.manifest.json",
        "front/output/host-rollout/attested/compatibility.manifest.json",
        "front/output/host-rollout/attested/security.manifest.json",
    }:
        errors.append("attestation subjects do not include exact candidate and all bounded manifests")

    gate_job = _mapping(jobs.get("final-evidence-gate"))
    if _needs(gate_job) != {"source", "pages-candidate", "resolve-r2a", "attest-evidence"}:
        errors.append("final live checker is not wired to every protected evidence artifact")
    gate_runs = "\n".join(str(item.get("run", "")) for item in _steps(gate_job))
    for needle in ("--cache-manifest", "--compat-manifest", "--security-manifest", "--pages-candidate", "--pages-attestation"):
        _require(gate_runs, needle, "final live checker invocation is incomplete", errors)
    deploy_job = _mapping(jobs.get("deploy-pages"))
    if "final-evidence-gate" not in _needs(deploy_job) or deploy_job.get("uses") != "./.github/workflows/deploy-front.yml":
        errors.append("Pages deploy does not depend on the final live checker")
    deploy_with = _mapping(deploy_job.get("with"))
    if deploy_with.get("candidate_artifact_id") != "${{ needs.pages-candidate.outputs.artifact-id }}" or deploy_with.get("candidate_sha256") != "${{ needs.pages-candidate.outputs.pages-digest }}":
        errors.append("Pages deploy inputs are not exact protected package job outputs")

    sync_config = sources[".github/workflows/sync-config.yml"]
    _require(sync_config, "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE:", "typed host contract mode is not rendered", errors)
    _require(sync_config, "DISABLED|V2_ONLY|SUPPORT_V2_V3|ENFORCE_V3", "typed host contract mode allowlist is missing", errors)
    _forbid(
        sync_config,
        'READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED: "true"',
        "legacy required flag conflicts with typed production mode",
        errors,
    )

    deploy_server_ast = _workflow_ast(".github/workflows/deploy-server.yml", sources, errors)
    server_call = _mapping(_mapping(deploy_server_ast.get("on")).get("workflow_call"))
    if _mapping(_mapping(server_call.get("outputs")).get("backend-digest")).get("value") != "${{ jobs.build-and-push.outputs.backend-digest }}":
        errors.append("server reusable workflow does not expose its trusted build digest")
    _require(sources[".github/workflows/deploy-server.yml"], '"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"', "server promotion is not digest immutable", errors)

    deploy_front_path = ".github/workflows/deploy-front.yml"
    deploy_front = sources[deploy_front_path]
    deploy_front_ast = _workflow_ast(deploy_front_path, sources, errors)
    front_trigger = _mapping(deploy_front_ast.get("on"))
    if set(front_trigger) != {"workflow_call"} or "workflow_dispatch" in front_trigger:
        errors.append("front deploy must be reusable-only with no manual bypass")
    front_job = _mapping(_mapping(deploy_front_ast.get("jobs")).get("deploy"))
    front_if = str(front_job.get("if", ""))
    if not all(term in front_if for term in ("github.ref_protected", "github.event_name == 'push'", "refs/heads/host-rollout-r2b", "fork == false")):
        errors.append("front deploy does not restrict the protected caller event and ref")
    if _mapping(front_job.get("environment")).get("name") != "production":
        errors.append("front deploy production environment is missing")
    front_runs = "\n".join(str(item.get("run", "")) for item in _steps(front_job))
    for needle, message in (
        ("$GITHUB_WORKFLOW_REF", "front deploy does not bind its protected caller workflow identity"),
        ("sha256sum", "front deploy does not verify exact candidate bytes"),
        ("readmates-pages-candidate.tar", "front deploy does not use the deterministic candidate"),
        ("wrangler@4.84.1 pages deploy dist", "front deploy does not deploy verified extracted bytes"),
    ):
        _require(front_runs, needle, message, errors)
    front_download = _step(front_job, uses=DOWNLOAD_PIN.split(" #", 1)[0])
    front_download_with = _mapping(front_download.get("with"))
    if front_download_with.get("artifact-ids") != "${{ inputs.candidate_artifact_id }}" or front_download_with.get("skip-decompress") is not True:
        errors.append("front deploy does not download the exact unmodified candidate artifact")

    schema = sources["scripts/schemas/host-client-rollout-evidence-v1.schema.json"]
    _require(schema, '"additionalProperties": false', "evidence schema does not deny unknown fields", errors)
    for forbidden in ("secret", "hostname", "actorId", "memberId", "resourceId", "tracePath", "notes"):
        if f'"{forbidden}"' in schema:
            errors.append("evidence schema contains a forbidden sensitive/deployment field")

    lock = sources["scripts/tooling/gh-attestation-lock.json"]
    _require(lock, '"version": "2.98.0"', "GitHub CLI version is not pinned", errors)
    for platform_key in ("Linux-x86_64", "Linux-aarch64", "Darwin-x86_64", "Darwin-arm64"):
        _require(lock, f'"{platform_key}"', f"GitHub CLI checksum is missing for {platform_key}", errors)

    scripts_readme = sources["scripts/README.md"]
    _require(scripts_readme, "check-host-client-rollout-contract.py", "scripts index omits rollout contract checker", errors)
    _require(scripts_readme, "verify-host-client-rollout-evidence.py", "scripts index omits evidence verifier", errors)

    builder = sources["scripts/build-public-release-candidate.sh"]
    for relative in (
        ".github/workflows/host-client-rollout-evidence.yml",
        "scripts/check-host-client-rollout-contract.py",
        "scripts/verify-host-client-rollout-evidence.py",
        "scripts/schemas/host-client-rollout-evidence-v1.schema.json",
        "scripts/tooling/gh-attestation-lock.json",
    ):
        _require(builder, f'copy_required_file "{relative}"', f"public release candidate omits {relative}", errors)

    fixtures = sources["scripts/verify-public-release-fixtures.sh"]
    _require(fixtures, "python3 -B scripts/check-host-client-rollout-contract.py --self-test", "public fixtures omit rollout self-test", errors)
    _require(fixtures, "python3 -B scripts/check-host-client-rollout-contract.py", "public fixtures omit structural mode", errors)
    _require(fixtures, "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test", "public fixtures omit verifier self-test", errors)

    docs = "\n".join(
        sources[path]
        for path in (
            "docs/deploy/release-publish-runbook.md",
            "docs/deploy/cloudflare-pages.md",
            "docs/development/release-management.md",
            "docs/development/versioning.md",
        )
    )
    for needle, message in (
        ("R1", "R1 support stage is undocumented"),
        ("SUPPORT_V2_V3", "support stage mode is undocumented"),
        ("R2a", "R2a cache-safety stage is undocumented"),
        ("720", "previous browser cache lifetime gate is undocumented"),
        ("R2b", "R2b browser v3 stage is undocumented"),
        ("24시간", "R2b adoption observation is undocumented"),
        ("v2 writes == 0", "v2 residue-zero threshold is undocumented"),
        ("v3 writes > 0", "v3 adoption threshold is undocumented"),
        ("missing/unknown == 0", "missing/unknown residue threshold is undocumented"),
        ("R3", "R3 enforcement stage is undocumented"),
        ("ENFORCE_V3", "R3 enforcement mode is undocumented"),
        ("fresh explicit", "fresh live-mutation checkpoint is undocumented"),
        ("preflight", "stage preflight is undocumented"),
        ("abort", "stage abort path is undocumented"),
        ("rollback", "stage rollback path is undocumented"),
        ("production email", "production email authority boundary is undocumented"),
        ("billable", "billable smoke authority boundary is undocumented"),
        ("readmates_host_client_contract_total", "adoption metric query is unnamed"),
        ("Host Client Contract Adoption", "adoption dashboard is unnamed"),
    ):
        _require(docs, needle, message, errors)
    if re.search(r"sha256:[0-9a-f]{64}|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", docs):
        errors.append("tracked rollout docs contain live-looking digest or timestamp evidence")

    metric_source = sources["server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt"]
    for needle, message in (
        ('"readmates.host.client_contract"', "server metric name does not match the rollout contract"),
        ('"generation", generation', "server metric omits the bounded generation label"),
        ('"mode", modeTag', "server metric omits the bounded mode label"),
    ):
        _require(metric_source, needle, message, errors)
    for generation, operator in (("v2", "== 0"), ("v3", "> 0"), ("missing", "== 0"), ("unknown", "== 0")):
        query = (
            f'(sum(increase(readmates_host_client_contract_total{{generation="{generation}",mode="support"}}[24h])) '
            f'or vector(0)) {operator}'
        )
        _require(docs, query, f"exact 24-hour {generation} adoption query is missing", errors)
    _forbid(docs, "readmates_host_client_contract_writes_total", "runbook names a metric that code does not emit", errors)
    _forbid(docs, 'result="', "runbook uses a non-existent result metric label", errors)

    env_example = sources[".env.example"]
    _require(env_example, "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE=", "typed host contract example is missing", errors)
    _require(sources[".gitignore"], "front/output/host-rollout/", "rollout evidence artifacts are not explicitly ignored", errors)
    return errors


def validate_structural_contract(root: Path = REPO_ROOT) -> None:
    errors = validate_structural_sources(_read_sources(root))
    if errors:
        raise ContractError(errors[0])


def _parse_timestamp(value: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ContractError("manifest timestamp is invalid") from error


def _expect_digest(value: str, label: str) -> None:
    if re.fullmatch(r"sha256:[0-9a-f]{64}", value) is None:
        raise ContractError(f"{label} must be a SHA-256 digest")


def _expect_git_sha(value: str, label: str) -> None:
    if re.fullmatch(r"[0-9a-f]{40}", value) is None:
        raise ContractError(f"{label} must be a full Git commit SHA")


def _git_ancestor(root: Path, older: str, newer: str) -> bool:
    environment = os.environ.copy()
    environment.update({"GIT_NO_LAZY_FETCH": "1", "GIT_TERMINAL_PROMPT": "0"})
    try:
        completed = subprocess.run(
            ["git", "merge-base", "--is-ancestor", older, newer],
            cwd=root,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ContractError("Git ancestry verification could not run") from error
    if completed.returncode not in (0, 1):
        raise ContractError("Git ancestry verification failed closed")
    return completed.returncode == 0


def validate_combined_policy(
    cache: dict[str, Any],
    compatibility: dict[str, Any],
    security: dict[str, Any],
    *,
    r2a_git_sha: str,
    r2a_backend_digest: str,
    r2a_pages_digest: str,
    r2b_git_sha: str,
    r2b_backend_digest: str,
    r2b_pages_digest: str,
    repository: str,
    ancestry_check: Callable[[str, str], bool],
    cache_verified_at: datetime,
    compatibility_verified_at: datetime,
    security_verified_at: datetime,
    provenance_ancestry_check: Callable[[str, str], bool],
) -> None:
    for digest, label in (
        (r2a_backend_digest, "R2a backend digest"),
        (r2a_pages_digest, "R2a Pages digest"),
        (r2b_backend_digest, "R2b backend digest"),
        (r2b_pages_digest, "R2b Pages digest"),
    ):
        _expect_digest(digest, label)
    _expect_git_sha(r2a_git_sha, "R2a Git SHA")
    _expect_git_sha(r2b_git_sha, "R2b Git SHA")
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) is None:
        raise ContractError("attestation repository is invalid")

    expected = (
        (cache, "cache-safety", r2a_git_sha, r2a_backend_digest, r2a_pages_digest),
        (compatibility, "compatibility", r2b_git_sha, r2b_backend_digest, r2b_pages_digest),
        (security, "security", r2b_git_sha, r2b_backend_digest, r2b_pages_digest),
    )
    for manifest, kind, sha, backend, pages in expected:
        if manifest["evidenceKind"] != kind:
            raise ContractError("manifest kinds are missing or swapped")
        if manifest["producer"]["repository"] != repository:
            raise ContractError("manifest repository does not match the attestation repository")
        if manifest["gitSha"] != sha:
            raise ContractError("manifest Git SHA does not match the protected candidate")
        if manifest["backendDigest"] != backend or manifest["pagesDigest"] != pages:
            raise ContractError("manifest digest does not match the trusted job output")

    if r2a_backend_digest != r2b_backend_digest:
        raise ContractError("Pages-only R2b must retain the deployed R2a backend digest")
    if r2a_pages_digest == r2b_pages_digest:
        raise ContractError("R2a and R2b must use distinct Pages digests")
    if compatibility["candidateId"] != security["candidateId"]:
        raise ContractError("compatibility and security evidence must bind the same R2b candidate")
    if cache["candidateId"] == compatibility["candidateId"]:
        raise ContractError("R2a and R2b candidate IDs must be distinct")
    source_set_digests = {
        cache["cacheSafetySourceSetDigest"],
        compatibility["cacheSafetySourceSetDigest"],
        security["cacheSafetySourceSetDigest"],
    }
    if len(source_set_digests) != 1:
        raise ContractError("C1 cache-safety source-set digest changed between R2a and R2b")
    if cache["stage"]["releaseTag"] == compatibility["stage"]["releaseTag"]:
        raise ContractError("R2a and R2b must use distinct immutable release tags")
    if compatibility["stage"]["releaseTag"] != security["stage"]["releaseTag"]:
        raise ContractError("R2b evidence must bind one immutable release tag")
    if not ancestry_check(r2a_git_sha, r2b_git_sha):
        raise ContractError("R2a Git SHA is not an ancestor of the R2b candidate")

    for verified_at, label in (
        (cache_verified_at, "cache-safety"),
        (compatibility_verified_at, "compatibility"),
        (security_verified_at, "security"),
    ):
        if verified_at.tzinfo is None or verified_at.utcoffset() is None:
            raise ContractError(f"{label} verified timestamp must be timezone-aware")

    expected_provenance = (
        (cache, r2a_git_sha),
        (compatibility, r2b_git_sha),
        (security, r2b_git_sha),
    )
    for manifest, candidate_sha in expected_provenance:
        for entry in manifest["provenance"]:
            source_sha = entry["gitSha"]
            _expect_git_sha(source_sha, f"{entry['id']} provenance Git SHA")
            if not provenance_ancestry_check(source_sha, candidate_sha):
                raise ContractError(f"{entry['id']} provenance is not an ancestor of its stage candidate")
    cache_c1 = next(entry["gitSha"] for entry in cache["provenance"] if entry["id"] == "C1")
    security_c1 = next(entry["gitSha"] for entry in security["provenance"] if entry["id"] == "C1")
    if cache_c1 != security_c1:
        raise ContractError("C1 provenance changed between R2a and R2b")

    cache_stage = cache["stage"]
    cache_started = _parse_timestamp(cache["producer"]["startedAt"])
    pre_change = _parse_timestamp(cache_stage["preChangeCachedAt"])
    policy_deployed = _parse_timestamp(cache_stage["policyDeployedAt"])
    wait_completed = _parse_timestamp(cache_stage["waitCompletedAt"])
    browser_completed = _parse_timestamp(cache_stage["browserProofCompletedAt"])
    cache_produced = _parse_timestamp(cache_stage["evidenceProducedAt"])
    if not cache_started <= pre_change <= policy_deployed:
        raise ContractError("R2a producer, pre-change cache, and policy deployment order is invalid")
    if (wait_completed - max(pre_change, policy_deployed)).total_seconds() < 720:
        raise ContractError("R2a previous browser cache lifetime was not fully exhausted")
    if browser_completed < wait_completed or cache_produced < browser_completed:
        raise ContractError("R2a browser proof or evidence timestamp order is invalid")
    if cache_produced > cache_verified_at:
        raise ContractError("R2a evidence claims exceed its verified signing time")
    if (cache_verified_at - cache_produced).total_seconds() > MAX_ATTESTATION_SKEW_SECONDS:
        raise ContractError("R2a verified signing time is outside the bounded evidence skew")
    for manifest, verified_at in (
        (compatibility, compatibility_verified_at),
        (security, security_verified_at),
    ):
        started = _parse_timestamp(manifest["producer"]["startedAt"])
        produced = _parse_timestamp(manifest["stage"]["evidenceProducedAt"])
        if produced < browser_completed:
            raise ContractError("R2b evidence predates the completed R2a cache proof")
        if started > produced:
            raise ContractError("R2b evidence predates its protected producer")
        if produced > verified_at:
            raise ContractError("R2b evidence claims exceed its verified signing time")
        if (verified_at - produced).total_seconds() > MAX_ATTESTATION_SKEW_SECONDS:
            raise ContractError("R2b verified signing time is outside the bounded evidence skew")


class RolloutContractTests(unittest.TestCase):
    def _manifests(self) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        cache = verifier._sample_manifest("cache-safety")
        compatibility = verifier._sample_manifest("compatibility")
        security = verifier._sample_manifest("security")
        compatibility["gitSha"] = security["gitSha"] = "6" * 40
        for manifest in (compatibility, security):
            manifest["backendDigest"] = cache["backendDigest"]
            manifest["stage"]["evidenceProducedAt"] = "2026-08-24T01:30:00Z"
        return cache, compatibility, security

    def _combined(self, cache: dict[str, Any], compatibility: dict[str, Any], security: dict[str, Any]) -> None:
        validate_combined_policy(
            cache,
            compatibility,
            security,
            r2a_git_sha=cache["gitSha"],
            r2a_backend_digest=cache["backendDigest"],
            r2a_pages_digest=cache["pagesDigest"],
            r2b_git_sha=compatibility["gitSha"],
            r2b_backend_digest=compatibility["backendDigest"],
            r2b_pages_digest=compatibility["pagesDigest"],
            repository="example/readmates",
            ancestry_check=lambda older, newer: True,
            cache_verified_at=datetime(2026, 8, 24, 1, 21, tzinfo=timezone.utc),
            compatibility_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
            security_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
            provenance_ancestry_check=lambda older, newer: older == "1" * 40 and newer in {"1" * 40, "6" * 40},
        )

    def test_valid_staged_contract_passes(self) -> None:
        self.assertEqual(validate_structural_sources(_read_sources(REPO_ROOT)), [])
        self._combined(*self._manifests())

    def test_workflow_yaml_parser_rejects_malformed_input(self) -> None:
        parsed = _parse_workflow_yaml("name: Test\non:\n  push:\njobs:\n  verify:\n    runs-on: ubuntu-latest\n")
        self.assertIn("verify", parsed["jobs"])
        with self.assertRaises(ContractError):
            _parse_workflow_yaml("name: Test\njobs:\n   malformed-without-colon\n")

    def test_structural_omissions_and_conflicting_config_fail_independently(self) -> None:
        cases = (
            ("CI omission", ".github/workflows/ci.yml", "--self-test", ""),
            ("scripts index omission", "scripts/README.md", "check-host-client-rollout-contract.py", ""),
            ("release candidate omission", "scripts/build-public-release-candidate.sh", "scripts/tooling/gh-attestation-lock.json", "omitted"),
            ("public fixture omission", "scripts/verify-public-release-fixtures.sh", "verify-host-client-rollout-evidence.py --self-test", "omitted"),
            ("residue gate omission", "docs/deploy/release-publish-runbook.md", "v2 writes == 0", "v2 observed"),
            (
                "missing orchestrator",
                ".github/workflows/host-client-rollout-evidence.yml",
                "  source:\n",
                "  omitted-source:\n",
            ),
            (
                "deploy before checker",
                ".github/workflows/host-client-rollout-evidence.yml",
                "      - final-evidence-gate\n",
                "",
            ),
            (
                "missing live checker invocation",
                ".github/workflows/host-client-rollout-evidence.yml",
                "--cache-manifest front/output/host-rollout/r2a/cache-safety.manifest.json",
                "--omitted-cache-manifest",
            ),
            (
                "wrong metric",
                "server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt",
                '"readmates.host.client_contract"',
                '"readmates.host.client_contract.writes"',
            ),
            (
                "wrong metric label",
                "docs/deploy/release-publish-runbook.md",
                'mode="support"',
                'result="accepted"',
            ),
        )
        for name, path, old, new in cases:
            sources = _read_sources(REPO_ROOT)
            sources[path] = sources[path].replace(old, new)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))
        sources = _read_sources(REPO_ROOT)
        sources[".github/workflows/sync-config.yml"] += '\nREADMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED: "true"'
        self.assertTrue(validate_structural_sources(sources))

    def test_structural_parser_rejects_human_digest_untrusted_trigger_and_malformed_yaml(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        mutations = []
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = sources[workflow_path].replace(
            "  push:\n",
            "  workflow_dispatch:\n    inputs:\n      pages_digest:\n        required: true\n        type: string\n  push:\n",
            1,
        )
        mutations.append(("human digest input", sources))
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = sources[workflow_path].replace("  push:\n", "  pull_request:\n  push:\n", 1)
        mutations.append(("untrusted trigger", sources))
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = "name: broken\njobs:\n   missing-colon\n"
        mutations.append(("malformed YAML", sources))
        for name, sources in mutations:
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))

    def test_pages_only_digest_candidate_source_set_and_repository_bindings_fail_closed(self) -> None:
        mutations = []
        cache, compatibility, security = self._manifests()
        compatibility["backendDigest"] = "sha256:" + "7" * 64
        mutations.append(("backend changed", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        compatibility["pagesDigest"] = cache["pagesDigest"]
        security["pagesDigest"] = cache["pagesDigest"]
        mutations.append(("pages equal", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        security["candidateId"] = "r2b-777777777777"
        mutations.append(("candidate mismatch", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        security["cacheSafetySourceSetDigest"] = "sha256:" + "7" * 64
        mutations.append(("source set changed", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        security["producer"]["repository"] = "other/readmates"
        mutations.append(("repository mismatch", cache, compatibility, security))
        for name, cache, compatibility, security in mutations:
            with self.subTest(name=name), self.assertRaises(ContractError):
                self._combined(cache, compatibility, security)

    def test_tag_time_order_wait_and_ancestry_fail_closed(self) -> None:
        cache, compatibility, security = self._manifests()
        compatibility["stage"]["releaseTag"] = cache["stage"]["releaseTag"]
        with self.assertRaises(ContractError):
            self._combined(cache, compatibility, security)
        cache, compatibility, security = self._manifests()
        cache["stage"]["waitCompletedAt"] = "2026-08-24T01:11:59Z"
        with self.assertRaises(ContractError):
            self._combined(cache, compatibility, security)
        cache, compatibility, security = self._manifests()
        with self.assertRaises(ContractError):
            validate_combined_policy(
                cache,
                compatibility,
                security,
                r2a_git_sha=cache["gitSha"],
                r2a_backend_digest=cache["backendDigest"],
                r2a_pages_digest=cache["pagesDigest"],
                r2b_git_sha=compatibility["gitSha"],
                r2b_backend_digest=compatibility["backendDigest"],
                r2b_pages_digest=compatibility["pagesDigest"],
                repository="example/readmates",
                ancestry_check=lambda older, newer: False,
                cache_verified_at=datetime(2026, 8, 24, 1, 21, tzinfo=timezone.utc),
                compatibility_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                security_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                provenance_ancestry_check=lambda older, newer: True,
            )
        cache, compatibility, security = self._manifests()
        with self.assertRaises(ContractError):
            validate_combined_policy(
                cache,
                compatibility,
                security,
                r2a_git_sha=cache["gitSha"],
                r2a_backend_digest=cache["backendDigest"],
                r2a_pages_digest=cache["pagesDigest"],
                r2b_git_sha=compatibility["gitSha"],
                r2b_backend_digest=compatibility["backendDigest"],
                r2b_pages_digest=compatibility["pagesDigest"],
                repository="example/readmates",
                ancestry_check=lambda older, newer: True,
                cache_verified_at=datetime(2026, 8, 24, 1, 40, tzinfo=timezone.utc),
                compatibility_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                security_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                provenance_ancestry_check=lambda older, newer: True,
            )

    def test_verified_time_rejects_reverse_fake_future_and_stale_claims(self) -> None:
        mutations: list[tuple[str, dict[str, Any], dict[str, Any], dict[str, Any]]] = []
        cache, compatibility, security = self._manifests()
        cache["stage"]["preChangeCachedAt"] = "2026-08-24T01:01:00Z"
        cache["stage"]["policyDeployedAt"] = "2026-08-24T01:00:00Z"
        mutations.append(("reverse prechange policy", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        cache["producer"]["startedAt"] = "2026-08-24T01:05:00Z"
        mutations.append(("instant fake 720", cache, compatibility, security))
        cache, compatibility, security = self._manifests()
        cache["stage"]["evidenceProducedAt"] = "2099-01-01T00:00:00Z"
        mutations.append(("future 2099", cache, compatibility, security))
        for name, cache, compatibility, security in mutations:
            with self.subTest(name=name), self.assertRaises(ContractError):
                self._combined(cache, compatibility, security)

        cache, compatibility, security = self._manifests()
        with self.assertRaises(ContractError):
            validate_combined_policy(
                cache,
                compatibility,
                security,
                r2a_git_sha=cache["gitSha"],
                r2a_backend_digest=cache["backendDigest"],
                r2a_pages_digest=cache["pagesDigest"],
                r2b_git_sha=compatibility["gitSha"],
                r2b_backend_digest=compatibility["backendDigest"],
                r2b_pages_digest=compatibility["pagesDigest"],
                repository="example/readmates",
                ancestry_check=lambda older, newer: True,
                cache_verified_at=datetime(2026, 8, 24, 1, 14, tzinfo=timezone.utc),
                compatibility_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                security_verified_at=datetime(2026, 8, 24, 1, 31, tzinfo=timezone.utc),
                provenance_ancestry_check=lambda older, newer: True,
            )

    def test_provenance_requires_stage_ancestry_and_shared_c1_binding(self) -> None:
        cache, compatibility, security = self._manifests()
        security["provenance"][0]["gitSha"] = "f" * 40
        with self.assertRaises(ContractError):
            self._combined(cache, compatibility, security)

        cache, compatibility, security = self._manifests()
        next(item for item in security["provenance"] if item["id"] == "C1")["gitSha"] = "6" * 40
        with self.assertRaises(ContractError):
            self._combined(cache, compatibility, security)


def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RolloutContractTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def _live_argument_names() -> tuple[str, ...]:
    return (
        "cache_manifest",
        "cache_attestation",
        "compat_manifest",
        "compat_attestation",
        "security_manifest",
        "security_attestation",
        "pages_candidate",
        "pages_attestation",
        "r2a_git_sha",
        "r2a_backend_digest",
        "r2a_pages_digest",
        "r2b_git_sha",
        "r2b_backend_digest",
        "r2b_pages_digest",
        "attestation_repository",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the staged host-client rollout and evidence contract")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--cache-manifest", type=Path)
    parser.add_argument("--cache-attestation", type=Path)
    parser.add_argument("--compat-manifest", type=Path)
    parser.add_argument("--compat-attestation", type=Path)
    parser.add_argument("--security-manifest", type=Path)
    parser.add_argument("--security-attestation", type=Path)
    parser.add_argument("--pages-candidate", type=Path)
    parser.add_argument("--pages-attestation", type=Path)
    parser.add_argument("--r2a-git-sha")
    parser.add_argument("--r2a-backend-digest")
    parser.add_argument("--r2a-pages-digest")
    parser.add_argument("--r2b-git-sha")
    parser.add_argument("--r2b-backend-digest")
    parser.add_argument("--r2b-pages-digest")
    parser.add_argument("--attestation-repository")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()
    try:
        validate_structural_contract()
        live_values = [getattr(args, name) for name in _live_argument_names()]
        if not any(value is not None for value in live_values):
            print("Host client rollout structural contract passed.")
            return 0
        if not all(value is not None for value in live_values):
            raise ContractError("live evidence mode requires every explicit manifest, bundle, SHA, digest, and repository input")

        verifier.require_protected_live_context()
        gh_binary = verifier.ensure_verified_gh()
        cache, cache_verified_at = verifier.verify_evidence(
            args.cache_manifest, args.cache_attestation, "cache-safety", gh_binary=gh_binary
        )
        compatibility, compatibility_verified_at = verifier.verify_evidence(
            args.compat_manifest, args.compat_attestation, "compatibility", gh_binary=gh_binary
        )
        security, security_verified_at = verifier.verify_evidence(
            args.security_manifest, args.security_attestation, "security", gh_binary=gh_binary
        )
        if f"sha256:{verifier.compute_sha256(args.pages_candidate)}" != args.r2b_pages_digest:
            raise ContractError("exact Pages candidate bytes do not match the trusted R2b digest")
        verifier.verify_subject_attestation(
            args.pages_candidate,
            args.pages_attestation,
            repository=args.attestation_repository,
            git_sha=args.r2b_git_sha,
            source_ref=security["producer"]["sourceRef"],
            gh_binary=gh_binary,
        )
        validate_combined_policy(
            cache,
            compatibility,
            security,
            r2a_git_sha=args.r2a_git_sha,
            r2a_backend_digest=args.r2a_backend_digest,
            r2a_pages_digest=args.r2a_pages_digest,
            r2b_git_sha=args.r2b_git_sha,
            r2b_backend_digest=args.r2b_backend_digest,
            r2b_pages_digest=args.r2b_pages_digest,
            repository=args.attestation_repository,
            ancestry_check=lambda older, newer: _git_ancestor(REPO_ROOT, older, newer),
            cache_verified_at=cache_verified_at,
            compatibility_verified_at=compatibility_verified_at,
            security_verified_at=security_verified_at,
            provenance_ancestry_check=lambda older, newer: _git_ancestor(REPO_ROOT, older, newer),
        )
    except (ContractError, EvidenceError) as error:
        print(f"host rollout contract: {error}", file=sys.stderr)
        return 1
    print("Host client rollout attested evidence contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
