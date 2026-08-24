#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
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
    "front/playwright.config.ts",
    "front/tests/e2e/support/host-authority-cache-security-reporter.ts",
    "scripts/check-host-client-rollout-contract.py",
    "scripts/host-rollout-cache-evidence.py",
    "scripts/host-rollout-evidence-reporter.py",
    "scripts/host-rollout-test-contract.json",
    "scripts/host-rollout-workflow-contract.json",
    "scripts/test-host-rollout-evidence-reporter.py",
    "scripts/test-host-rollout-cache-evidence.py",
    "scripts/validate-host-rollout-candidate.py",
    "scripts/verify-host-client-rollout-evidence.py",
    "scripts/schemas/host-client-rollout-evidence-v1.schema.json",
    "scripts/schemas/host-rollout-test-report-v1.schema.json",
    "scripts/schemas/host-rollout-workflow-contract-v1.schema.json",
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
    "deploy/oci/05-deploy-compose-stack.sh",
    "deploy/oci/watch-compose-post-deploy.sh",
)

WORKFLOW_CONTRACT_PATH = "scripts/host-rollout-workflow-contract.json"
WORKFLOW_CONTRACT_SCHEMA_PATH = "scripts/schemas/host-rollout-workflow-contract-v1.schema.json"
WORKFLOW_CONTRACT_SCHEMA_VERSION = "readmates.host-rollout.workflow-contract.v1"
WORKFLOW_CONTRACT_CANONICALIZATION = "supported-yaml-parsed-ast-json-order-v1"
WORKFLOW_CONTRACT_SCHEMA_DIGEST = "sha256:c7c1160d64208c5b6a03e8ee5b5cda10dc6c6529918f666d69ced198f7ec271e"
WORKFLOW_CONTRACT_WORKFLOWS = (
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-front.yml",
    ".github/workflows/deploy-server.yml",
    ".github/workflows/host-client-rollout-evidence.yml",
    ".github/workflows/sync-config.yml",
)

ATTEST_PIN = "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4.2.1"
UPLOAD_PIN = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1"
DOWNLOAD_PIN = "actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3 # v8.0.0"
CHECKOUT_USE = "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd"
SETUP_NODE_USE = "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"
ATTEST_USE = ATTEST_PIN.split(" #", 1)[0]
UPLOAD_USE = UPLOAD_PIN.split(" #", 1)[0]
DOWNLOAD_USE = DOWNLOAD_PIN.split(" #", 1)[0]
DEPLOY_FRONT_USE = "./.github/workflows/deploy-front.yml"
DEPLOY_SERVER_USE = "./.github/workflows/deploy-server.yml"
ROLLOUT_JOBS = {
    "source",
    "pages-candidate",
    "prime-r2a-cache",
    "build-r2a-policy",
    "deploy-r2a-policy",
    "deploy-r2a-pages",
    "bind-r2a-runtime-pair",
    "wait-r2a-cache-lifetime",
    "browser-r2a-proof",
    "cache-report-r2a",
    "compatibility-r2b",
    "security-r2b",
    "resolve-r2a",
    "attest-evidence",
    "final-evidence-gate",
    "deploy-r2b-pages",
}
PRODUCTION_WORKFLOW_USES = {
    ".github/workflows/host-client-rollout-evidence.yml": {
        CHECKOUT_USE,
        SETUP_NODE_USE,
        ATTEST_USE,
        UPLOAD_USE,
        DOWNLOAD_USE,
        DEPLOY_FRONT_USE,
        DEPLOY_SERVER_USE,
    },
    ".github/workflows/deploy-front.yml": {CHECKOUT_USE, DOWNLOAD_USE},
    ".github/workflows/deploy-server.yml": {
        CHECKOUT_USE,
        "actions/setup-java@be666c2fcd27ec809703dec50e508c2fdc7f6654",
        "gradle/actions/setup-gradle@50e97c2cd7a37755bbfafc9c5b7cafaece252f6e",
        "docker/setup-qemu-action@ce360397dd3f832beb865e1373c09c0e9f86d70a",
        "docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
        "docker/login-action@4907a6ddec9925e35a0a9e82d7399ccc52663121",
        "docker/build-push-action@bcafcacb16a39f128d818304e6c9c0c18556b85f",
        "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
        UPLOAD_USE,
    },
}
PRODUCTION_WORKFLOW_JOBS = {
    ".github/workflows/host-client-rollout-evidence.yml": ROLLOUT_JOBS,
    ".github/workflows/deploy-front.yml": {"deploy"},
    ".github/workflows/deploy-server.yml": {"build-and-push"},
}
AUTHORIZED_DEPLOY_USES = {
    (".github/workflows/host-client-rollout-evidence.yml", "build-r2a-policy", "job", DEPLOY_SERVER_USE),
    (".github/workflows/host-client-rollout-evidence.yml", "deploy-r2a-pages", "job", DEPLOY_FRONT_USE),
    (".github/workflows/host-client-rollout-evidence.yml", "deploy-r2b-pages", "job", DEPLOY_FRONT_USE),
    (
        ".github/workflows/deploy-server.yml",
        "build-and-push",
        "id:build",
        "docker/build-push-action@bcafcacb16a39f128d818304e6c9c0c18556b85f",
    ),
}
AUTHORIZED_RUN_DEPLOYS = {
    (".github/workflows/host-client-rollout-evidence.yml", "deploy-r2a-policy", "id:deploy", "oci"),
    (".github/workflows/deploy-front.yml", "deploy", "id:deploy", "pages"),
    (
        ".github/workflows/deploy-server.yml",
        "build-and-push",
        "name:Promote scanned digest to release tag",
        "registry-publish",
    ),
}
MAX_ATTESTATION_SKEW_SECONDS = 300
EXPECTED_REPORTER_ARGV = {
    "seed-r2a-prechange-cache": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/public-projection-cache-safety.spec.ts", "--grep", "@prechange"],
    "deploy-r2a-cache-policy": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/public-projection-cache-safety.spec.ts", "--grep", "@policy-deployed"],
    "playwright-r2a-cache-safety": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/public-projection-cache-safety.spec.ts"],
    "bff-unit-contract-matrix": ["corepack", "pnpm", "--dir", "front", "exec", "vitest", "run", "tests/unit/cloudflare-bff.test.ts", "tests/unit/proxy-bff-secret.test.ts", "tests/unit/cloudflare-bff-client-contract-status.test.ts"],
    "server-unit-contract-policy": ["./server/gradlew", "-p", "server", "unitTest", "--tests", "com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest"],
    "server-integration-host-security": ["./server/gradlew", "-p", "server", "integrationTest", "--tests", "com.readmates.session.api.HostSessionBffSecurityTest"],
    "playwright-contract-rollout": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "--config", "playwright-rollout.config.ts", "tests/e2e/host-client-contract-rollout.spec.ts"],
    "playwright-non-session-regressions": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/host-feedback-notification-composer.spec.ts", "tests/e2e/host-next-book-notification-composer.spec.ts", "tests/e2e/manual-notifications.spec.ts"],
    "playwright-authority-cache-regressions": ["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/host-authority-loss.spec.ts", "tests/e2e/public-projection-cache-safety.spec.ts"],
}

SECURITY_REPORTER_REQUIRED_PATHS = {
    "front/playwright.config.ts",
    "front/tests/e2e/host-authority-loss.spec.ts",
    "front/tests/e2e/public-projection-cache-safety.spec.ts",
    "front/tests/e2e/support/host-authority-cache-security-reporter.ts",
}


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


def _external_sha256(payload: bytes) -> str:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="readmates-workflow-ast-", suffix=".json", delete=False) as handle:
            handle.write(payload)
            temporary_path = Path(handle.name)
        return f"sha256:{verifier.compute_sha256(temporary_path)}"
    except (OSError, EvidenceError) as error:
        raise ContractError("canonical workflow checksum verification failed") from error
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def _canonical_workflow_digest(ast: dict[str, Any]) -> str:
    payload = json.dumps(ast, ensure_ascii=True, separators=(",", ":"), sort_keys=False).encode("utf-8")
    return _external_sha256(payload)


def _workflow_contract_document(workflow_asts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "schemaVersion": WORKFLOW_CONTRACT_SCHEMA_VERSION,
        "canonicalization": WORKFLOW_CONTRACT_CANONICALIZATION,
        "workflows": {
            path: _canonical_workflow_digest(workflow_asts[path])
            for path in WORKFLOW_CONTRACT_WORKFLOWS
        },
    }


def _validate_workflow_contract(
    sources: dict[str, str],
    workflow_asts: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    contract_source = sources[WORKFLOW_CONTRACT_PATH]
    schema_source = sources[WORKFLOW_CONTRACT_SCHEMA_PATH]
    if len(contract_source.encode("utf-8")) > 65_536 or len(schema_source.encode("utf-8")) > 65_536:
        errors.append("canonical workflow contract or schema exceeds the structural size limit")
        return
    try:
        if _external_sha256(schema_source.encode("utf-8")) != WORKFLOW_CONTRACT_SCHEMA_DIGEST:
            errors.append("canonical workflow contract schema does not match the reviewed digest")
            return
    except ContractError as error:
        errors.append(str(error))
        return
    try:
        contract = json.loads(contract_source)
        schema = json.loads(schema_source)
    except json.JSONDecodeError:
        errors.append("canonical workflow contract and schema must be valid JSON")
        return
    if not isinstance(contract, dict) or not isinstance(schema, dict):
        errors.append("canonical workflow contract and schema must be JSON objects")
        return

    schema_errors: list[str] = []
    try:
        verifier._validate_schema(contract, schema, schema, "$", schema_errors)
    except EvidenceError:
        errors.append("canonical workflow contract schema cannot be resolved")
        return
    if schema_errors:
        errors.append(f"canonical workflow contract does not match its schema: {schema_errors[0]}")

    if set(contract) != {"schemaVersion", "canonicalization", "workflows"}:
        errors.append("canonical workflow contract fields do not match the exact allowlist")
        return
    if contract.get("schemaVersion") != WORKFLOW_CONTRACT_SCHEMA_VERSION:
        errors.append("canonical workflow contract schema version is not supported")
    if contract.get("canonicalization") != WORKFLOW_CONTRACT_CANONICALIZATION:
        errors.append("canonical workflow contract algorithm is not supported")
    expected_digests = contract.get("workflows")
    if not isinstance(expected_digests, dict) or set(expected_digests) != set(WORKFLOW_CONTRACT_WORKFLOWS):
        errors.append("canonical workflow contract paths do not match the exact allowlist")
        return

    try:
        actual = _workflow_contract_document(workflow_asts)["workflows"]
    except ContractError as error:
        errors.append(str(error))
        return
    for path in WORKFLOW_CONTRACT_WORKFLOWS:
        if expected_digests.get(path) != actual[path]:
            errors.append(f"{path} executable AST does not match the reviewed canonical workflow contract")


def _is_full_action_pin(value: Any) -> bool:
    return isinstance(value, str) and (
        value.startswith("./.github/workflows/")
        or re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}", value) is not None
    )


def _step_identity(step: dict[str, Any]) -> str:
    if isinstance(step.get("id"), str) and step["id"]:
        return f"id:{step['id']}"
    if isinstance(step.get("name"), str) and step["name"]:
        return f"name:{step['name']}"
    return "anonymous"


def _ordered_tokens(tokens: list[str], expected: tuple[str, ...]) -> bool:
    position = 0
    for token in tokens:
        if token == expected[position]:
            position += 1
            if position == len(expected):
                return True
    return False


def _run_deploy_primitives(run: Any) -> list[str]:
    if not isinstance(run, str) or not run:
        return []
    tokens = [item.lower() for item in re.findall(r"[A-Za-z0-9_./:@${},+=-]+", run)]
    primitives: list[str] = []
    for index, token in enumerate(tokens):
        executable = token.rsplit("/", 1)[-1]
        if re.fullmatch(r"wrangler(?:@[a-z0-9_.-]+)?", executable) and _ordered_tokens(tokens[index + 1 :], ("pages", "deploy")):
            primitives.append("pages")
        if executable == "docker":
            tail = tokens[index + 1 :]
            if _ordered_tokens(tail, ("buildx", "imagetools", "create")) or _ordered_tokens(tail, ("push",)):
                primitives.append("registry-publish")
    if any(token.endswith("deploy/oci/05-deploy-compose-stack.sh") for token in tokens):
        primitives.append("oci")
    return primitives


def _deploy_use_kind(value: str) -> str | None:
    if value == DEPLOY_FRONT_USE:
        return "pages"
    if value == DEPLOY_SERVER_USE or value.startswith("docker/build-push-action@"):
        return "registry-publish"
    return None


def _validate_production_workflow_ast(path: str, ast: dict[str, Any], errors: list[str]) -> None:
    jobs = _mapping(ast.get("jobs"))
    if set(jobs) != PRODUCTION_WORKFLOW_JOBS[path]:
        errors.append(f"{path} job IDs do not match the exact production allowlist")
    approved_uses = PRODUCTION_WORKFLOW_USES[path]
    for job_name, job_value in jobs.items():
        job = _mapping(job_value)
        job_use = job.get("uses")
        if job_use is not None:
            if job_use not in approved_uses:
                errors.append(f"{path} job {job_name} uses an unapproved action or reusable workflow")
            deploy_kind = _deploy_use_kind(str(job_use))
            if deploy_kind is not None and (path, job_name, "job", job_use) not in AUTHORIZED_DEPLOY_USES:
                errors.append(f"{path} job {job_name} contains an unauthorized {deploy_kind} workflow call")

        step_names: set[str] = set()
        step_ids: set[str] = set()
        for step in _steps(job):
            name = step.get("name")
            step_id = step.get("id")
            if isinstance(name, str):
                if name in step_names:
                    errors.append(f"{path} job {job_name} has a duplicate production step name")
                step_names.add(name)
            if isinstance(step_id, str):
                if step_id in step_ids:
                    errors.append(f"{path} job {job_name} has a duplicate production step id")
                step_ids.add(step_id)
            identity = _step_identity(step)
            step_use = step.get("uses")
            if step_use is not None:
                if step_use not in approved_uses:
                    errors.append(f"{path} job {job_name} uses an unapproved action or reusable workflow")
                deploy_kind = _deploy_use_kind(str(step_use))
                if deploy_kind is not None and (path, job_name, identity, step_use) not in AUTHORIZED_DEPLOY_USES:
                    errors.append(f"{path} job {job_name} step {identity} contains an unauthorized {deploy_kind} action")
            run_deploys = _run_deploy_primitives(step.get("run"))
            if len(run_deploys) > 1:
                errors.append(f"{path} job {job_name} step {identity} contains multiple deployment commands")
            for deploy_kind in run_deploys:
                if (path, job_name, identity, deploy_kind) not in AUTHORIZED_RUN_DEPLOYS:
                    errors.append(f"{path} job {job_name} step {identity} contains an unauthorized {deploy_kind} command")


def validate_structural_sources(sources: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED_SOURCES:
        if relative not in sources:
            errors.append(f"required source is missing: {relative}")
    if errors:
        return errors

    workflow_asts = {
        path: _workflow_ast(path, sources, errors)
        for path in WORKFLOW_CONTRACT_WORKFLOWS
    }
    _validate_workflow_contract(sources, workflow_asts, errors)

    ci_ast = workflow_asts[".github/workflows/ci.yml"]
    ci_runs = "\n".join(str(item.get("run", "")) for job in _mapping(ci_ast.get("jobs")).values() for item in _steps(_mapping(job)))
    _require(ci_runs, "python3 -B scripts/check-host-client-rollout-contract.py --self-test", "CI omits rollout contract self-test", errors)
    _require(ci_runs, "python3 -B scripts/check-host-client-rollout-contract.py", "CI omits rollout structural mode", errors)
    _require(ci_runs, "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test", "CI omits evidence verifier self-test", errors)
    _require(ci_runs, "python3 -B scripts/test-host-rollout-evidence-reporter.py", "CI omits structured reporter self-test", errors)
    _require(ci_runs, "python3 -B scripts/test-host-rollout-cache-evidence.py", "CI omits cache transport adversarial self-test", errors)
    _require(ci_runs, "python3 -B scripts/host-rollout-evidence-reporter.py check-config --artifact-ready", "CI omits artifact-ready reporter contract check", errors)
    _require(ci_runs, "python3 -B scripts/validate-host-rollout-candidate.py --self-test", "CI omits candidate archive adversarial self-test", errors)
    if "--cache-manifest" in ci_runs or "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE" in ci_runs:
        errors.append("normal CI must not invoke live rollout evidence")

    workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
    workflow = sources[workflow_path]
    workflow_ast = workflow_asts[workflow_path]
    _validate_production_workflow_ast(workflow_path, workflow_ast, errors)
    trigger = _mapping(workflow_ast.get("on"))
    if set(trigger) != {"workflow_dispatch"} or trigger.get("workflow_dispatch") is not None:
        errors.append("live evidence trigger must be no-input workflow_dispatch only")
    if any(item in trigger for item in ("push", "pull_request", "pull_request_target", "workflow_call", "schedule")):
        errors.append("live evidence must not have automatic, PR, scheduled, or caller-authored triggers")
    if "inputs." in workflow:
        errors.append("protected evidence subject or predicate must not depend on workflow inputs")
    if _mapping(workflow_ast.get("permissions")) != {"contents": "read", "actions": "read"}:
        errors.append("orchestrator top-level permissions are not least privilege")

    active_rollout_docs = (
        "docs/deploy/release-publish-runbook.md",
        "docs/deploy/cloudflare-pages.md",
        "docs/development/release-management.md",
        "docs/development/versioning.md",
    )
    for path in active_rollout_docs:
        _require(
            sources[path],
            "workflow_dispatch",
            f"{path} does not name the no-input rollout trigger",
            errors,
        )
        _forbid(
            sources[path],
            "--event push",
            f"{path} incorrectly treats a rollout ref push as the workflow trigger",
            errors,
        )
    dispatch_command = 'gh workflow run "Host Client Rollout Evidence" --ref host-rollout-r2b'
    dispatch_lookup = (
        'gh run list --workflow "Host Client Rollout Evidence" '
        "--branch host-rollout-r2b --event workflow_dispatch --limit 5"
    )
    for path in (
        "docs/deploy/release-publish-runbook.md",
        "docs/development/release-management.md",
    ):
        _require(sources[path], dispatch_command, f"{path} omits the no-input R2b dispatch command", errors)
        _require(sources[path], dispatch_lookup, f"{path} omits the R2b dispatch run lookup", errors)
    runbook_sequence = (
        "Fresh explicit R2b live approval을 확인한 뒤 no-input `workflow_dispatch`를 실행합니다. "
        "Dispatch로 생성된 run의 environment-bound job은 그 다음 protected environment reviewer "
        "승인을 통과해야 진행합니다."
    )
    _require(
        sources["docs/deploy/release-publish-runbook.md"],
        runbook_sequence,
        "release runbook does not order live approval, dispatch, then run-specific environment review",
        errors,
    )

    jobs = _mapping(workflow_ast.get("jobs"))
    if set(jobs) != ROLLOUT_JOBS:
        errors.append("protected rollout orchestrator jobs are incomplete")
    for job in jobs.values():
        for item in _steps(_mapping(job)):
            if "uses" in item and not _is_full_action_pin(item["uses"]):
                errors.append("workflow action is not pinned by full commit SHA")

    source_job = _mapping(jobs.get("source"))
    source_if = str(source_job.get("if", ""))
    if not all(term in source_if for term in ("github.ref_protected", "github.event_name == 'workflow_dispatch'", "github.event.repository.fork == false")):
        errors.append("source job does not deny unprotected, non-dispatch, or fork execution")
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
        ("host-rollout-evidence-reporter.py source-set", "C1 source-set digest is not derived from canonical candidate tree entries"),
        ("prevent_self_review == true", "source preflight does not require external environment review"),
        ("deployment-branch-policies", "source preflight does not verify exact environment branch policies"),
    ):
        _require(source_runs, needle, message, errors)

    try:
        reporter_contract = json.loads(sources["scripts/host-rollout-test-contract.json"])
    except json.JSONDecodeError:
        reporter_contract = {}
        errors.append("structured reporter contract is not valid JSON")
    configured_commands: dict[str, dict[str, Any]] = {}
    configured_cases: dict[str, set[str]] = {}
    groups = reporter_contract.get("groups") if isinstance(reporter_contract, dict) else None
    if reporter_contract.get("schemaVersion") != "readmates.host-rollout.test-contract.v1" or not isinstance(groups, dict):
        errors.append("structured reporter contract envelope is invalid")
    else:
        for group, value in groups.items():
            commands = value.get("commands") if isinstance(value, dict) else None
            if group not in verifier.EXPECTED_COMMANDS or not isinstance(commands, list):
                errors.append("structured reporter group is invalid")
                continue
            configured_cases[group] = set()
            for command in commands:
                if not isinstance(command, dict) or set(command) != {"id", "argv", "timeoutSeconds", "requiredPaths", "cases"}:
                    errors.append("structured reporter command fields are invalid")
                    continue
                command_id = command.get("id")
                if not isinstance(command_id, str) or command_id in configured_commands:
                    errors.append("structured reporter command id is invalid or duplicated")
                    continue
                configured_commands[command_id] = command
                argv = command.get("argv")
                if argv != EXPECTED_REPORTER_ARGV.get(command_id):
                    errors.append("structured reporter substantive command was replaced, skipped, or changed")
                paths = command.get("requiredPaths")
                if not isinstance(paths, list) or not paths or any(not isinstance(path, str) or not path for path in paths):
                    errors.append("structured reporter substantive spec/config path set is empty or invalid")
                elif command_id == "playwright-authority-cache-regressions" and set(paths) != SECURITY_REPORTER_REQUIRED_PATHS:
                    errors.append("security reporter causal source set is incomplete or unknown")
                cases = command.get("cases")
                if not isinstance(cases, list) or not cases or any(not isinstance(case, str) for case in cases):
                    errors.append("structured reporter case set is empty or invalid")
                else:
                    if len(set(cases)) != len(cases):
                        errors.append("structured reporter case set is duplicated")
                    configured_cases[group].update(cases)
        if set(configured_commands) != set(EXPECTED_REPORTER_ARGV):
            errors.append("structured reporter exact command set is incomplete or unknown")
        for group in verifier.EXPECTED_COMMANDS:
            actual_ids = {
                command_id
                for command_id, command in configured_commands.items()
                if command_id in verifier.EXPECTED_COMMANDS[group]
            }
            if actual_ids != verifier.EXPECTED_COMMANDS[group] or configured_cases.get(group) != verifier.EXPECTED_CASES[group]:
                errors.append(f"structured reporter {group} command/case set is incomplete or unknown")

    reporter_source = sources["scripts/host-rollout-evidence-reporter.py"]
    for needle, message in (
        ("subprocess.run(", "structured reporter does not execute commands with subprocess argument arrays"),
        ("READMATES_HOST_ROLLOUT_CASE_REPORT", "structured reporter does not require per-test structured output"),
        ("protected_profile_identity", "structured reporter does not bind cache reports to the protected run profile"),
        ('value["bindings"] = {"profileIdentity": protected_profile_identity(environment)}', "structured reporter does not add the trusted cache profile binding"),
        ("cache partial reports do not bind the same protected profile", "structured reporter combines mismatched cache profile reports"),
        ("require_paths=True", "structured reporter live mode does not fail closed on missing prerequisites"),
        ("timeout=command[\"timeoutSeconds\"]", "structured reporter command timeout is not bounded"),
        ("structured test report timestamp is outside the actual command window", "structured reporter time is not bound to the actual command window"),
        ("source-set path is ambiguous", "C1 source-set reporter does not fail closed on tree entry drift"),
    ):
        _require(reporter_source, needle, message, errors)
    if "hashlib" in reporter_source or "cryptography" in reporter_source:
        errors.append("structured reporter must not implement cryptography in Python")

    playwright_config = sources["front/playwright.config.ts"]
    for needle, message in (
        ("reporter: protectedSecurityReporterEnabled()", "Playwright config does not scope the causal reporter to the protected security command"),
        ("host-authority-cache-security-reporter", "Playwright config does not select the causal security reporter"),
    ):
        _require(playwright_config, needle, message, errors)
    security_reporter = sources["front/tests/e2e/support/host-authority-cache-security-reporter.ts"]
    for needle, message in (
        ("onTestEnd", "security reporter does not aggregate actual Playwright callbacks"),
        ("unexpected source file", "security reporter does not fail closed on unexpected spec files"),
        ("unknown test", "security reporter does not fail closed on unknown tests"),
        ("duplicate callback", "security reporter does not fail closed on duplicate callbacks"),
        ("callback set is missing", "security reporter does not fail closed on missing callbacks"),
        ("did not pass", "security reporter does not fail closed on failed or skipped callbacks"),
        ("unknown case", "security reporter does not fail closed on unknown cases"),
        ("duplicate case", "security reporter does not fail closed on duplicate cases"),
    ):
        _require(security_reporter, needle, message, errors)

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
    if "./deploy/oci/05-deploy-compose-stack.sh" not in deploy_policy_run or "backend-deployed-at=" not in deploy_policy_run:
        errors.append("R2a backend runtime identity is not generated after the real OCI deploy and health action")
    for needle in ("OCI_SSH_KNOWN_HOSTS", "SSH_KNOWN_HOSTS", "SSH_STRICT_HOST_KEY_CHECKING=yes"):
        _require(deploy_policy_run + workflow, needle, "R2a OCI deploy does not require pinned strict SSH host identity", errors)

    deploy_r2a_pages = _mapping(jobs.get("deploy-r2a-pages"))
    if _needs(deploy_r2a_pages) != {"source", "pages-candidate", "deploy-r2a-policy"} or deploy_r2a_pages.get("uses") != "./.github/workflows/deploy-front.yml":
        errors.append("R2a Pages deployment is not gated by the exact backend and candidate jobs")
    r2a_pages_with = _mapping(deploy_r2a_pages.get("with"))
    if r2a_pages_with != {
        "candidate_artifact_id": "${{ needs.pages-candidate.outputs.artifact-id }}",
        "candidate_sha256": "${{ needs.pages-candidate.outputs.pages-digest }}",
    }:
        errors.append("R2a Pages deploy does not consume only trusted package job outputs")
    pair_job = _mapping(jobs.get("bind-r2a-runtime-pair"))
    pair_run = str(_step(pair_job, step_id="bind").get("run", ""))
    if _needs(pair_job) != {"source", "prime-r2a-cache", "pages-candidate", "deploy-r2a-policy", "deploy-r2a-pages"}:
        errors.append("R2a backend and Pages deployed pair binding is incomplete")
    if not all(needle in pair_run for needle in ("DEPLOYED_PAGES_DIGEST", "BACKEND_DIGEST", "PAGES_RUNTIME_HEALTH_AT", "policy-deployed-at=")):
        errors.append("policyDeployedAt is not generated after exact pair digest and runtime health binding")
    wait_job = _mapping(jobs.get("wait-r2a-cache-lifetime"))
    wait_run = str(_step(wait_job, step_id="wait").get("run", ""))
    if _needs(wait_job) != {"source", "prime-r2a-cache", "bind-r2a-runtime-pair"} or "base_epoch + 720" not in wait_run or "sleep" not in wait_run:
        errors.append("R2a wait job does not enforce a real max-timestamp plus 720-second wait")
    if _needs(_mapping(jobs.get("browser-r2a-proof"))) != {"source", "prime-r2a-cache", "bind-r2a-runtime-pair", "wait-r2a-cache-lifetime"}:
        errors.append("R2a browser proof must run only after the real wait")

    for job_name in ("prime-r2a-cache", "bind-r2a-runtime-pair", "browser-r2a-proof", "compatibility-r2b", "security-r2b"):
        live_job = _mapping(jobs.get(job_name))
        uses = {str(item.get("uses", "")) for item in _steps(live_job)}
        runs = "\n".join(str(item.get("run", "")) for item in _steps(live_job))
        if "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e" not in uses:
            errors.append(f"{job_name} omits pinned Node setup")
        for needle in ("pnpm@11.13.1", "pnpm install --frozen-lockfile", "playwright install --with-deps chromium"):
            _require(runs, needle, f"{job_name} omits exact frozen browser setup", errors)
    producer_commands = {
        "bind-r2a-runtime-pair": {"deploy-r2a-cache-policy"},
        "browser-r2a-proof": {"seed-r2a-prechange-cache", "playwright-r2a-cache-safety"},
        "compatibility-r2b": verifier.EXPECTED_COMMANDS["compatibility"],
        "security-r2b": verifier.EXPECTED_COMMANDS["security"],
    }
    for job_name, command_ids in producer_commands.items():
        runs = "\n".join(str(item.get("run", "")) for item in _steps(_mapping(jobs.get(job_name))))
        _require(runs, "host-rollout-evidence-reporter.py", f"{job_name} omits structured reporter", errors)
        for command_id in command_ids:
            _require(runs, command_id, f"{job_name} omits exact reporter command {command_id}", errors)

    prime_runs = "\n".join(str(item.get("run", "")) for item in _steps(_mapping(jobs.get("prime-r2a-cache"))))
    for needle, message in (
        ("host-rollout-cache-evidence.py validate-config", "R2a prime omits protected boundary and synthetic-target preflight"),
        ("--probe", "R2a prime does not capture the actual old generation validator"),
        ("playwright test", "R2a prime does not execute C1 Playwright directly"),
        ("--grep @prechange", "R2a prime does not execute the exact prechange phase"),
        ("host-rollout-cache-evidence.py package-profile", "R2a prime does not package the persistent browser state"),
        ("retention-days: 1", "R2a prime profile does not use short artifact retention"),
    ):
        _require(workflow + prime_runs, needle, message, errors)
    if "host-rollout-evidence-reporter.py run-command" in prime_runs:
        errors.append("R2a prime must not produce an accepted PASS report")
    prime_job = _mapping(jobs.get("prime-r2a-cache"))
    prime_browser_steps = [step for step in _steps(prime_job) if step.get("name") == "Prime only the protected public synthetic browser profile"]
    prime_expected_urls = {
        "READMATES_HOST_ROLLOUT_EXPECTED_ORIGIN_REVOKED_URL": "${{ steps.preflight.outputs.expected-origin-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_BFF_REVOKED_URL": "${{ steps.preflight.outputs.expected-bff-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL": "${{ steps.preflight.outputs.expected-cdn-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_CLUB_URL": "${{ steps.preflight.outputs.expected-cdn-club-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_STABLE_SESSION_URL": "${{ steps.preflight.outputs.expected-cdn-stable-session-url }}",
    }
    if len(prime_browser_steps) != 1 or any(
        _mapping(prime_browser_steps[0].get("env")).get(key) != value
        for key, value in prime_expected_urls.items()
    ):
        errors.append("R2a prime does not hand C1 exact helper-derived public URLs")

    cache_helper = sources["scripts/host-rollout-cache-evidence.py"]
    for needle, message in (
        ("validate_protected_config", "cache helper does not fail closed on protected configuration"),
        ("_canonical_https_origin", "cache helper does not canonicalize HTTPS boundaries"),
        ("rollout-synthetic-", "cache helper does not reserve a synthetic public namespace"),
        ("class _NoRedirect(urllib.request.HTTPRedirectHandler)", "cache helper does not deny privileged HTTP redirects"),
        ("hmac.new(", "cache helper does not derive redacted identities without an argv leak"),
        ("validate_synthetic_ownership", "cache helper does not validate authoritative synthetic ownership"),
        ("syntheticMarkerIdentity", "cache helper does not bind the synthetic ownership marker"),
        ("ownershipResponseIdentity", "cache helper does not bind the normalized existing-endpoint ownership response"),
        ("api/bff/api/host/club-operations", "cache helper does not use the existing authenticated host club context"),
        ("api/bff/api/host/sessions/{config.synthetic_session_id}", "cache helper does not use the existing authenticated host session detail"),
        ("_open_public_exact", "cache helper does not deny redirects and final-URL changes at public boundaries"),
        ('with _open_public_exact(request, f"prechange {label}", expected_url) as response:', "public probes bypass the exact no-redirect opener"),
        ('"ownershipResponseIdentity": ownership_response_identity,', "profile transport does not bind the validated ownership response identity"),
        ("package_profile", "cache helper does not package a persistent browser profile"),
        ("inspect_archive", "cache helper does not safely inspect the browser transport"),
        ("_validated_archive_payload", "cache helper does not validate all transport metadata before extraction"),
        ("mutate_synthetic_target", "cache helper does not perform the protected same-target transition"),
        ("SESSION_REVERSE", "cache helper does not bind the exact synthetic mutation operation"),
        ("MAX_PROFILE_BYTES", "cache helper profile transport is not bounded"),
        ("subprocess.run(", "cache helper does not use bounded subprocess argument arrays"),
    ):
        _require(cache_helper, needle, message, errors)
    if cache_helper.count("verify_synthetic_ownership(config)") != 3:
        errors.append("cache helper must verify existing-endpoint ownership before prime, after prime packaging, and immediately before mutation")
    if "/api/bff/api/host/rollout-evidence/synthetic-targets/" in cache_helper:
        errors.append("cache helper depends on a bespoke synthetic ownership endpoint that does not exist")
    if cache_helper.count("_validated_archive_payload") != 2:
        errors.append("cache helper pre-extraction trust validator must have one definition and one exact use")
    extract_start = cache_helper.find("def extract_profile(")
    validation_position = cache_helper.find("_validated_archive_payload(raw_archive, expected, config)", extract_start)
    destination_position = cache_helper.find("destination.mkdir", extract_start)
    if extract_start < 0 or validation_position < extract_start or destination_position < validation_position:
        errors.append("cache helper writes extraction bytes before every carried digest and HMAC binding is verified")
    for forbidden in ("cryptography", "shell=True", 'shutil.which("openssl")'):
        if forbidden in cache_helper:
            errors.append("cache helper must not expose HMAC secrets to an external crypto argv or a shell")
    if "READMATES_HOST_ROLLOUT_SYNTHETIC_IDEMPOTENCY_KEY" in workflow:
        errors.append("rollout workflow must derive a non-secret run idempotency identifier instead of reading a secret")

    protected_cache_jobs = ("prime-r2a-cache", "bind-r2a-runtime-pair", "browser-r2a-proof")
    required_cache_env = {
        "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL": "${{ vars.READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL }}",
        "READMATES_HOST_ROLLOUT_BFF_BASE_URL": "${{ vars.READMATES_HOST_ROLLOUT_BFF_BASE_URL }}",
        "READMATES_HOST_ROLLOUT_CDN_BASE_URL": "${{ vars.READMATES_HOST_ROLLOUT_CDN_BASE_URL }}",
        "READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH": "${{ vars.READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH }}",
        "READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH": "${{ vars.READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH }}",
        "READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH": "${{ vars.READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH }}",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID": "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID }}",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE": "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE }}",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY": "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY }}",
    }
    for job_name in protected_cache_jobs:
        job = _mapping(jobs.get(job_name))
        envs = [_mapping(step.get("env")) for step in _steps(job)]
        for key, expected in required_cache_env.items():
            if not any(env.get(key) == expected for env in envs):
                errors.append(f"{job_name} does not receive protected {key} authority")
    for forbidden in ("https://localhost", "http://", ".example/", ".test/"):
        if forbidden in workflow:
            errors.append("rollout workflow contains a local, fake, or non-HTTPS boundary")

    marker_environment = "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY }}"
    club_environment = "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID }}"
    marker_value_environment = "${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE }}"
    for job, step_ids in (
        (prime_job, ("preflight", "profile")),
        (pair_job, ("extracted", "mutation")),
        (_mapping(jobs.get("browser-r2a-proof")), ("extracted",)),
    ):
        for step_id in step_ids:
            if _mapping(_step(job, step_id=step_id).get("env")).get("READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY") != marker_environment:
                errors.append(f"protected cache helper step {step_id} omits the authoritative synthetic marker identity")
            if _mapping(_step(job, step_id=step_id).get("env")).get("READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID") != club_environment:
                errors.append(f"protected cache helper step {step_id} omits the authoritative synthetic club identity")
            if _mapping(_step(job, step_id=step_id).get("env")).get("READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE") != marker_value_environment:
                errors.append(f"protected cache helper step {step_id} omits the authoritative synthetic marker value")
    prime_outputs = _mapping(prime_job.get("outputs"))
    exact_prime_outputs = {
        "pre-change-cached-at": "${{ steps.profile.outputs.pre-change-cached-at }}",
        "old-generation-etag": "${{ steps.profile.outputs.old-generation-etag }}",
        "profile-artifact-id": "${{ steps.upload-profile.outputs.artifact-id }}",
        "profile-identity": "${{ steps.profile.outputs.profile-identity }}",
        "profile-transport-digest": "${{ steps.profile.outputs.profile-transport-digest }}",
        "profile-content-digest": "${{ steps.profile.outputs.profile-content-digest }}",
        "profile-state-digest": "${{ steps.profile.outputs.profile-state-digest }}",
        "target-identity": "${{ steps.profile.outputs.target-identity }}",
        "boundary-identities": "${{ steps.profile.outputs.boundary-identities }}",
        "synthetic-marker-identity": "${{ steps.profile.outputs.synthetic-marker-identity }}",
        "ownership-response-identity": "${{ steps.profile.outputs.ownership-response-identity }}",
        "expected-origin-revoked-url": "${{ steps.preflight.outputs.expected-origin-revoked-url }}",
        "expected-bff-revoked-url": "${{ steps.preflight.outputs.expected-bff-revoked-url }}",
        "expected-cdn-revoked-url": "${{ steps.preflight.outputs.expected-cdn-revoked-url }}",
        "expected-cdn-club-url": "${{ steps.preflight.outputs.expected-cdn-club-url }}",
        "expected-cdn-stable-session-url": "${{ steps.preflight.outputs.expected-cdn-stable-session-url }}",
    }
    if prime_outputs != exact_prime_outputs:
        errors.append("R2a prime outputs do not bind the exact profile transport and redacted identities")
    profile_step = _step(prime_job, step_id="profile")
    if (
        _mapping(profile_step.get("env")).get("EXPECTED_OWNERSHIP_RESPONSE_IDENTITY")
        != "${{ steps.preflight.outputs.ownership-response-identity }}"
        or '--ownership-response-identity "$EXPECTED_OWNERSHIP_RESPONSE_IDENTITY"' not in str(profile_step.get("run", ""))
    ):
        errors.append("R2a profile package is not bound to the pre-prime existing-endpoint ownership response")
    profile_upload = _step(prime_job, step_id="upload-profile")
    profile_upload_with = _mapping(profile_upload.get("with"))
    if (
        profile_upload.get("uses") != UPLOAD_USE
        or profile_upload_with.get("archive") is not False
        or profile_upload_with.get("retention-days") != 1
    ):
        errors.append("R2a profile transport must be an exact unarchived one-day artifact")

    pair_steps = _steps(pair_job)
    pair_tokens = [_step_identity(item) for item in pair_steps]
    if not _ordered_tokens(pair_tokens, ("id:extracted", "id:mutation", "id:bind", "name:Prove exact same-target deny at origin BFF and CDN")):
        errors.append("R2a profile validation, mutation, pair timestamp, and deny proof are not causally ordered")
    pair_downloads = [step for step in pair_steps if step.get("uses") == DOWNLOAD_USE]
    if len(pair_downloads) != 1 or _mapping(pair_downloads[0].get("with")).get("artifact-ids") != "${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}":
        errors.append("R2a policy proof does not download the exact primed profile artifact ID")
    exact_extract_bindings = {
        "EXPECTED_PROFILE_IDENTITY": "${{ needs.prime-r2a-cache.outputs.profile-identity }}",
        "EXPECTED_TRANSPORT_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-transport-digest }}",
        "EXPECTED_PROFILE_CONTENT_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-content-digest }}",
        "EXPECTED_PROFILE_STATE_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-state-digest }}",
        "EXPECTED_TARGET_IDENTITY": "${{ needs.prime-r2a-cache.outputs.target-identity }}",
        "EXPECTED_BOUNDARY_IDENTITIES": "${{ needs.prime-r2a-cache.outputs.boundary-identities }}",
        "EXPECTED_SYNTHETIC_MARKER_IDENTITY": "${{ needs.prime-r2a-cache.outputs.synthetic-marker-identity }}",
        "EXPECTED_OWNERSHIP_RESPONSE_IDENTITY": "${{ needs.prime-r2a-cache.outputs.ownership-response-identity }}",
        "EXPECTED_OLD_GENERATION_ETAG": "${{ needs.prime-r2a-cache.outputs.old-generation-etag }}",
        "EXPECTED_TRANSPORT_ARTIFACT_ID": "${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}",
    }
    pair_extract_env = _mapping(_step(pair_job, step_id="extracted").get("env"))
    if any(pair_extract_env.get(key) != value for key, value in exact_extract_bindings.items()):
        errors.append("R2a policy proof extraction is not bound to exact trusted profile outputs")
    pair_material = "\n".join(str(step.get("run", "")) for step in pair_steps)
    for needle in (
        '--transport-digest "$EXPECTED_TRANSPORT_DIGEST"',
        '--profile-content-digest "$EXPECTED_PROFILE_CONTENT_DIGEST"',
        '--state-digest "$EXPECTED_PROFILE_STATE_DIGEST"',
        '--target-identity "$EXPECTED_TARGET_IDENTITY"',
        '--synthetic-marker-identity "$EXPECTED_SYNTHETIC_MARKER_IDENTITY"',
        '--ownership-response-identity "$EXPECTED_OWNERSHIP_RESPONSE_IDENTITY"',
        '--old-generation-etag "$EXPECTED_OLD_GENERATION_ETAG"',
        "host-rollout-cache-evidence.py mutate-synthetic-target",
    ):
        _require(pair_material, needle, "R2a policy proof is not bound to the exact carried profile or mutation", errors)
    exact_expected_url_bindings = {
        "READMATES_HOST_ROLLOUT_EXPECTED_ORIGIN_REVOKED_URL": "${{ needs.prime-r2a-cache.outputs.expected-origin-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_BFF_REVOKED_URL": "${{ needs.prime-r2a-cache.outputs.expected-bff-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL": "${{ needs.prime-r2a-cache.outputs.expected-cdn-revoked-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_CLUB_URL": "${{ needs.prime-r2a-cache.outputs.expected-cdn-club-url }}",
        "READMATES_HOST_ROLLOUT_EXPECTED_CDN_STABLE_SESSION_URL": "${{ needs.prime-r2a-cache.outputs.expected-cdn-stable-session-url }}",
    }
    pair_proof_steps = [step for step in pair_steps if step.get("name") == "Prove exact same-target deny at origin BFF and CDN"]
    if len(pair_proof_steps) != 1 or any(
        _mapping(pair_proof_steps[0].get("env")).get(key) != value
        for key, value in exact_expected_url_bindings.items()
    ):
        errors.append("R2a policy proof does not receive exact helper-derived public URLs")

    browser_job = _mapping(jobs.get("browser-r2a-proof"))
    browser_steps = _steps(browser_job)
    browser_downloads = [step for step in browser_steps if step.get("uses") == DOWNLOAD_USE]
    if len(browser_downloads) != 1 or _mapping(browser_downloads[0].get("with")).get("artifact-ids") != "${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}":
        errors.append("post-wait browser proof does not download the exact primed profile artifact ID")
    browser_extract_env = _mapping(_step(browser_job, step_id="extracted").get("env"))
    if any(browser_extract_env.get(key) != value for key, value in exact_extract_bindings.items()):
        errors.append("post-wait browser extraction is not bound to exact trusted profile outputs")
    browser_material = "\n".join(str(step.get("run", "")) for step in browser_steps)
    for needle in (
        "host-rollout-cache-evidence.py extract-profile",
        '--transport-artifact-id "$EXPECTED_TRANSPORT_ARTIFACT_ID"',
        "--command seed-r2a-prechange-cache",
        "--command playwright-r2a-cache-safety",
    ):
        _require(browser_material, needle, "post-wait browser proof is not bound to the same carried profile and exact reports", errors)
    proof_env = _mapping(_step(browser_job, step_id="proof").get("env"))
    exact_proof_bindings = {
        "READMATES_ROLLOUT_CACHE_PHASE": "post-wait",
        "READMATES_HOST_ROLLOUT_OLD_GENERATION_ETAG": "${{ steps.extracted.outputs.old-generation-etag }}",
        "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE": "${{ steps.extracted.outputs.profile-path }}",
        "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_STATE": "${{ steps.extracted.outputs.state-path }}",
        "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_ARTIFACT_ID": "${{ steps.extracted.outputs.profile-identity }}",
        "READMATES_HOST_ROLLOUT_PRECHANGE_PRIMED_AT": "${{ needs.prime-r2a-cache.outputs.pre-change-cached-at }}",
        "READMATES_HOST_ROLLOUT_POLICY_DEPLOYED_AT": "${{ needs.bind-r2a-runtime-pair.outputs.policy-deployed-at }}",
        "READMATES_HOST_ROLLOUT_WAIT_COMPLETED_AT": "${{ needs.wait-r2a-cache-lifetime.outputs.wait-completed-at }}",
        **exact_expected_url_bindings,
    }
    if any(proof_env.get(key) != value for key, value in exact_proof_bindings.items()):
        errors.append("post-wait browser proof phase, profile, validator, or timestamps are misbound")

    cache_report_job = _mapping(jobs.get("cache-report-r2a"))
    cache_report_runs = "\n".join(str(item.get("run", "")) for item in _steps(cache_report_job))
    if _needs(cache_report_job) != {"source", "prime-r2a-cache", "bind-r2a-runtime-pair", "browser-r2a-proof"}:
        errors.append("R2a structured report combiner is not bound to all exact producer jobs")
    for needle in ("report-sha256", "sha256sum", "host-rollout-evidence-reporter.py combine", "cache-safety.report.json"):
        _require(workflow + cache_report_runs, needle, "R2a structured report artifact is not exactly bound and validated", errors)
    if "needs.prime-r2a-cache.outputs.report-" in cache_report_runs or "needs.prime-r2a-cache.outputs.report-" in workflow:
        errors.append("R2a report combiner must not accept a pre-wait prime PASS artifact")

    for job_name, job_value in jobs.items():
        job = _mapping(job_value)
        material = str(job.get("uses", "")) + "\n" + "\n".join(str(item.get("uses", "")) + "\n" + str(item.get("run", "")) for item in _steps(job))
        if re.search(r"gh api[^\n]*(--method[ =](POST|PUT|PATCH|DELETE)|-X (POST|PUT|PATCH|DELETE))", material, re.IGNORECASE):
            errors.append(f"job {job_name} contains a mutable GitHub API bypass")

    attest_job = _mapping(jobs.get("attest-evidence"))
    if not {"pages-candidate", "bind-r2a-runtime-pair", "cache-report-r2a", "browser-r2a-proof", "compatibility-r2b", "security-r2b", "resolve-r2a"}.issubset(_needs(attest_job)):
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
        "R2A_BACKEND_DIGEST": "${{ needs.bind-r2a-runtime-pair.outputs.backend-digest }}",
        "R2A_PAGES_DIGEST": "${{ needs.bind-r2a-runtime-pair.outputs.pages-digest }}",
        "IMPORTED_BACKEND_DIGEST": "${{ needs.resolve-r2a.outputs.backend-digest }}",
        "PRE_CHANGE_CACHED_AT": "${{ needs.prime-r2a-cache.outputs.pre-change-cached-at }}",
        "POLICY_DEPLOYED_AT": "${{ needs.bind-r2a-runtime-pair.outputs.policy-deployed-at }}",
        "WAIT_COMPLETED_AT": "${{ needs.wait-r2a-cache-lifetime.outputs.wait-completed-at }}",
        "BROWSER_PROOF_COMPLETED_AT": "${{ needs.browser-r2a-proof.outputs.browser-proof-completed-at }}",
        "CACHE_PROFILE_ARTIFACT_ID": "${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}",
        "CACHE_PROFILE_IDENTITY": "${{ needs.prime-r2a-cache.outputs.profile-identity }}",
        "CACHE_PROFILE_TRANSPORT_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-transport-digest }}",
        "CACHE_PROFILE_CONTENT_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-content-digest }}",
        "CACHE_PROFILE_STATE_DIGEST": "${{ needs.prime-r2a-cache.outputs.profile-state-digest }}",
        "CACHE_TARGET_IDENTITY": "${{ needs.prime-r2a-cache.outputs.target-identity }}",
        "CACHE_BOUNDARY_IDENTITIES": "${{ needs.prime-r2a-cache.outputs.boundary-identities }}",
        "CACHE_SYNTHETIC_MARKER_IDENTITY": "${{ needs.prime-r2a-cache.outputs.synthetic-marker-identity }}",
        "CACHE_OWNERSHIP_RESPONSE_IDENTITY": "${{ needs.prime-r2a-cache.outputs.ownership-response-identity }}",
        "CACHE_MUTATION_RECEIPT_DIGEST": "${{ needs.bind-r2a-runtime-pair.outputs.mutation-receipt-digest }}",
    }
    if any(manifest_env.get(key) != value for key, value in required_bindings.items()):
        errors.append("manifest identity, digest, or time is not bound to exact protected job outputs")
    manifest_run = str(manifest_step.get("run", ""))
    if "json.dumps(manifest" not in manifest_run or "date -u" not in manifest_run or "--schema-only" not in manifest_run:
        errors.append("signer does not construct and schema-check its own bounded manifest")
    for needle in (
        "cacheTransport",
        "profileIdentity",
        "boundaryIdentities",
        "syntheticMarkerIdentity",
        "ownershipResponseIdentity",
        "mutationReceiptDigest",
        'report_profile_identity = report["bindings"]["profileIdentity"]',
        "expected_profile_identity = f\"run-{os.environ['GITHUB_RUN_ID']}-attempt-{os.environ['GITHUB_RUN_ATTEMPT']}-r2a-public-cache\"",
    ):
        _require(manifest_run, needle, "signer does not bind the redacted browser profile transport contract", errors)
    if "download" in str(manifest_step.get("name", "")).lower() or "incoming" in manifest_run:
        errors.append("signer must not attest a downloaded caller-authored manifest")
    attest_runs = "\n".join(str(item.get("run", "")) for item in _steps(attest_job))
    for needle in (
        "needs.cache-report-r2a.outputs.report-sha256",
        "needs.compatibility-r2b.outputs.report-sha256",
        "needs.security-r2b.outputs.report-sha256",
        "host-rollout-evidence-reporter.py validate-report",
        'report["commands"]',
        'report["cases"]',
    ):
        _require(workflow + attest_runs, needle, "signer does not consume exact validated structured report artifacts", errors)
    for forbidden in ("commands = {", "cases = {", '"result": "PASS"} for item in commands', '"result": "PASS"} for item in cases'):
        if forbidden in manifest_run:
            errors.append("signer contains a fabricated static PASS command/case array")
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
    deploy_job = _mapping(jobs.get("deploy-r2b-pages"))
    if "final-evidence-gate" not in _needs(deploy_job) or deploy_job.get("uses") != "./.github/workflows/deploy-front.yml":
        errors.append("Pages deploy does not depend on the final live checker")
    deploy_with = _mapping(deploy_job.get("with"))
    if deploy_with.get("candidate_artifact_id") != "${{ needs.pages-candidate.outputs.artifact-id }}" or deploy_with.get("candidate_sha256") != "${{ needs.pages-candidate.outputs.pages-digest }}":
        errors.append("Pages deploy inputs are not exact protected package job outputs")
    if set(deploy_with) != {"candidate_artifact_id", "candidate_sha256"}:
        errors.append("Pages deploy caller must not supply ref, stage, SHA, tag, or timestamp identity")

    sync_config = sources[".github/workflows/sync-config.yml"]
    _require(sync_config, "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE:", "typed host contract mode is not rendered", errors)
    _require(sync_config, "DISABLED|V2_ONLY|SUPPORT_V2_V3|ENFORCE_V3", "typed host contract mode allowlist is missing", errors)
    _forbid(
        sync_config,
        'READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED: "true"',
        "legacy required flag conflicts with typed production mode",
        errors,
    )

    deploy_server_ast = workflow_asts[".github/workflows/deploy-server.yml"]
    _validate_production_workflow_ast(".github/workflows/deploy-server.yml", deploy_server_ast, errors)
    server_call = _mapping(_mapping(deploy_server_ast.get("on")).get("workflow_call"))
    if _mapping(_mapping(server_call.get("outputs")).get("backend-digest")).get("value") != "${{ jobs.build-and-push.outputs.backend-digest }}":
        errors.append("server reusable workflow does not expose its trusted build digest")
    _require(sources[".github/workflows/deploy-server.yml"], '"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"', "server promotion is not digest immutable", errors)

    deploy_front_path = ".github/workflows/deploy-front.yml"
    deploy_front = sources[deploy_front_path]
    deploy_front_ast = workflow_asts[deploy_front_path]
    _validate_production_workflow_ast(deploy_front_path, deploy_front_ast, errors)
    front_trigger = _mapping(deploy_front_ast.get("on"))
    if set(front_trigger) != {"workflow_call"} or "workflow_dispatch" in front_trigger:
        errors.append("front deploy must be reusable-only with no manual bypass")
    front_job = _mapping(_mapping(deploy_front_ast.get("jobs")).get("deploy"))
    front_if = str(front_job.get("if", ""))
    if not all(term in front_if for term in ("github.ref_protected", "github.event_name == 'workflow_dispatch'", "refs/heads/host-rollout-r2a", "refs/heads/host-rollout-r2b", "fork == false")):
        errors.append("front deploy does not restrict the protected caller event and ref")
    front_inputs = _mapping(_mapping(front_trigger.get("workflow_call")).get("inputs"))
    if set(front_inputs) != {"candidate_artifact_id", "candidate_sha256"}:
        errors.append("front deploy reusable contract accepts caller-authored ref, stage, SHA, tag, or time")
    environment_name = str(_mapping(front_job.get("environment")).get("name", ""))
    if "host-client-rollout-r2a" not in environment_name or "production" not in environment_name:
        errors.append("front deploy does not derive its protected environment from exact caller ref")
    front_runs = "\n".join(str(item.get("run", "")) for item in _steps(front_job))
    for needle, message in (
        ("$GITHUB_WORKFLOW_REF", "front deploy does not bind its protected caller workflow identity"),
        ("$GITHUB_SHA", "front deploy does not derive exact caller SHA"),
        ("$GITHUB_REF", "front deploy does not derive protected stage/ref"),
        ("git tag --points-at", "front deploy does not derive its immutable release tag"),
        ("sha256sum", "front deploy does not verify exact candidate bytes"),
        ("readmates-pages-candidate.tar", "front deploy does not use the deterministic candidate"),
        ("wrangler@4.84.1 pages deploy dist", "front deploy does not deploy verified extracted bytes"),
        ("validate-host-rollout-candidate.py --candidate", "front deploy does not invoke candidate archive validator"),
        ("--no-same-owner --no-same-permissions", "front deploy extraction does not suppress archive ownership and permissions"),
        ("runtime-health-at=", "front deploy does not produce post-deploy runtime health evidence"),
    ):
        _require(front_runs, needle, message, errors)
    for forbidden in ("inputs.candidate_git_sha", "inputs.release_tag", "accept-new"):
        if forbidden in deploy_front:
            errors.append("front deploy accepts or trusts caller-authored identity or TOFU state")
    candidate_validator = sources["scripts/validate-host-rollout-candidate.py"]
    for needle, message in (
        ("member.issym()", "candidate validator does not reject archive symlinks"),
        ("member.islnk()", "candidate validator does not reject archive hardlinks"),
        ("member.isdev()", "candidate validator does not reject archive devices"),
        ("member.isfifo()", "candidate validator does not reject archive FIFOs"),
        ("pure.is_absolute()", "candidate validator does not reject absolute archive paths"),
        ('".." in pure.parts', "candidate validator does not reject parent archive paths"),
        ("CandidateValidationTests", "candidate validator lacks adversarial archive fixtures"),
    ):
        _require(candidate_validator, needle, message, errors)
    front_download = _step(front_job, uses=DOWNLOAD_PIN.split(" #", 1)[0])
    front_download_with = _mapping(front_download.get("with"))
    if front_download_with.get("artifact-ids") != "${{ inputs.candidate_artifact_id }}" or front_download_with.get("skip-decompress") is not True:
        errors.append("front deploy does not download the exact unmodified candidate artifact")

    schema = sources["scripts/schemas/host-client-rollout-evidence-v1.schema.json"]
    _require(schema, '"additionalProperties": false', "evidence schema does not deny unknown fields", errors)
    for forbidden in ("secret", "hostname", "actorId", "memberId", "resourceId", "tracePath", "notes"):
        if f'"{forbidden}"' in schema:
            errors.append("evidence schema contains a forbidden sensitive/deployment field")
    for needle in ('"cacheTransport"', '"profileIdentity"', '"targetIdentity"', '"boundaryIdentities"', '"syntheticMarkerIdentity"', '"ownershipResponseIdentity"', '"mutationReceiptDigest"'):
        _require(schema, needle, "evidence schema omits the redacted cache transport binding", errors)
    report_schema = sources["scripts/schemas/host-rollout-test-report-v1.schema.json"]
    for needle, message in (
        ('"additionalProperties": false', "structured report schema does not deny unknown fields"),
        ('"structured-test-reporter"', "structured report schema does not identify substantive test reporters"),
        ('"bindings"', "structured report schema omits the cache profile binding"),
    ):
        _require(report_schema, needle, message, errors)

    lock = sources["scripts/tooling/gh-attestation-lock.json"]
    _require(lock, '"version": "2.98.0"', "GitHub CLI version is not pinned", errors)
    for platform_key in ("Linux-x86_64", "Linux-aarch64", "Darwin-x86_64", "Darwin-arm64"):
        _require(lock, f'"{platform_key}"', f"GitHub CLI checksum is missing for {platform_key}", errors)

    scripts_readme = sources["scripts/README.md"]
    _require(scripts_readme, "check-host-client-rollout-contract.py", "scripts index omits rollout contract checker", errors)
    _require(scripts_readme, "verify-host-client-rollout-evidence.py", "scripts index omits evidence verifier", errors)
    _require(scripts_readme, "host-rollout-evidence-reporter.py", "scripts index omits structured reporter", errors)
    _require(scripts_readme, "artifact-ready", "scripts index confuses structural and live reporter readiness", errors)
    _require(scripts_readme, "--print-workflow-digests", "scripts index omits the deliberate workflow contract update procedure", errors)

    builder = sources["scripts/build-public-release-candidate.sh"]
    for relative in (
        ".github/workflows/host-client-rollout-evidence.yml",
        "scripts/check-host-client-rollout-contract.py",
        "scripts/host-rollout-cache-evidence.py",
        "scripts/host-rollout-evidence-reporter.py",
        "scripts/host-rollout-test-contract.json",
        "scripts/host-rollout-workflow-contract.json",
        "scripts/test-host-rollout-evidence-reporter.py",
        "scripts/test-host-rollout-cache-evidence.py",
        "scripts/validate-host-rollout-candidate.py",
        "scripts/verify-host-client-rollout-evidence.py",
        "scripts/schemas/host-client-rollout-evidence-v1.schema.json",
        "scripts/schemas/host-rollout-test-report-v1.schema.json",
        "scripts/schemas/host-rollout-workflow-contract-v1.schema.json",
        "scripts/tooling/gh-attestation-lock.json",
    ):
        _require(builder, f'copy_required_file "{relative}"', f"public release candidate omits {relative}", errors)

    fixtures = sources["scripts/verify-public-release-fixtures.sh"]
    _require(fixtures, "python3 -B scripts/check-host-client-rollout-contract.py --self-test", "public fixtures omit rollout self-test", errors)
    _require(fixtures, "python3 -B scripts/check-host-client-rollout-contract.py", "public fixtures omit structural mode", errors)
    _require(fixtures, "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test", "public fixtures omit verifier self-test", errors)
    _require(fixtures, "python3 -B scripts/test-host-rollout-evidence-reporter.py", "public fixtures omit structured reporter self-test", errors)
    _require(fixtures, "python3 -B scripts/test-host-rollout-cache-evidence.py", "public fixtures omit cache transport adversarial self-test", errors)
    _require(fixtures, "python3 -B scripts/host-rollout-evidence-reporter.py check-config --artifact-ready", "public fixtures omit artifact-ready reporter contract check", errors)
    _require(fixtures, "python3 -B scripts/validate-host-rollout-candidate.py --self-test", "public fixtures omit candidate archive adversarial self-test", errors)

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
        ("no-input", "no-input protected rollout dispatch authority is undocumented"),
        ("prevent self-review", "protected environment external review requirement is undocumented"),
        ("artifact-ready", "repository-only readiness boundary is undocumented"),
        ("OCI_SSH_KNOWN_HOSTS", "pinned OCI host identity secret contract is undocumented"),
        ("StrictHostKeyChecking=yes", "strict OCI host identity verification is undocumented"),
        ("rollout-synthetic-", "protected synthetic public fixture namespace is undocumented"),
        ("numeric transport artifact ID", "numeric profile transport artifact binding is undocumented"),
        ("public-only tar", "public-only persistent browser transport is undocumented"),
        ("SESSION_REVERSE", "same-target synthetic revoke mutation is undocumented"),
        ("target와 boundary category별 HMAC", "redacted target and boundary manifest identities are undocumented"),
        ("/api/bff/api/host/club-operations", "existing host club ownership endpoint is undocumented"),
        ("/api/bff/api/host/sessions/{sessionId}", "existing host session ownership endpoint is undocumented"),
        ("ownershipResponseIdentity", "normalized ownership response HMAC is undocumented"),
        ("run-derived non-secret idempotency identifier", "non-secret reconciliation identifier contract is undocumented"),
        ("same-origin 3xx", "privileged no-redirect cookie boundary is undocumented"),
        ("response.url()", "C1 exact browser final-URL handoff is undocumented"),
        ("O_NOFOLLOW", "pre-extraction single-read trust boundary is undocumented"),
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
    oci_deploy = sources["deploy/oci/05-deploy-compose-stack.sh"]
    oci_watch = sources["deploy/oci/watch-compose-post-deploy.sh"]
    for source, label in ((oci_deploy, "OCI deploy"), (oci_watch, "OCI watch")):
        for needle in ("StrictHostKeyChecking=yes", "UserKnownHostsFile=${SSH_KNOWN_HOSTS}", "TOFU modes are forbidden"):
            _require(source, needle, f"{label} does not pin strict SSH host identity", errors)
        _forbid(source, "accept-new", f"{label} permits TOFU SSH host identity", errors)
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

    def test_active_rollout_docs_require_explicit_no_input_dispatch(self) -> None:
        sources = _read_sources(REPO_ROOT)
        active_docs = (
            "docs/deploy/release-publish-runbook.md",
            "docs/deploy/cloudflare-pages.md",
            "docs/development/release-management.md",
            "docs/development/versioning.md",
        )
        for path in active_docs:
            with self.subTest(path=path):
                self.assertIn("workflow_dispatch", sources[path])
                self.assertNotIn("--event push", sources[path])

        dispatch_command = 'gh workflow run "Host Client Rollout Evidence" --ref host-rollout-r2b'
        dispatch_lookup = (
            'gh run list --workflow "Host Client Rollout Evidence" '
            "--branch host-rollout-r2b --event workflow_dispatch --limit 5"
        )
        for path in (
            "docs/deploy/release-publish-runbook.md",
            "docs/development/release-management.md",
        ):
            with self.subTest(path=path):
                self.assertIn(dispatch_command, sources[path])
                self.assertIn(dispatch_lookup, sources[path])

        runbook_sequence = (
            "Fresh explicit R2b live approval을 확인한 뒤 no-input `workflow_dispatch`를 실행합니다. "
            "Dispatch로 생성된 run의 environment-bound job은 그 다음 protected environment reviewer "
            "승인을 통과해야 진행합니다."
        )
        self.assertIn(runbook_sequence, sources["docs/deploy/release-publish-runbook.md"])

    def test_structural_parser_rejects_human_digest_untrusted_trigger_and_malformed_yaml(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        mutations = []
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = sources[workflow_path].replace(
            "  workflow_dispatch:\n",
            "  workflow_dispatch:\n    inputs:\n      pages_digest:\n        required: true\n        type: string\n",
            1,
        )
        mutations.append(("human digest input", sources))
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = sources[workflow_path].replace("  workflow_dispatch:\n", "  pull_request:\n  workflow_dispatch:\n", 1)
        mutations.append(("untrusted trigger", sources))
        sources = _read_sources(REPO_ROOT)
        sources[workflow_path] = "name: broken\njobs:\n   missing-colon\n"
        mutations.append(("malformed YAML", sources))
        for name, sources in mutations:
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))

    def test_production_ast_rejects_deploy_bypass_noop_and_reporter_omission(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        cases = (
            (
                "substantive command replaced with true",
                "scripts/host-rollout-test-contract.json",
                '["corepack", "pnpm", "--dir", "front", "exec", "playwright", "test", "tests/e2e/public-projection-cache-safety.spec.ts", "--grep", "@prechange"]',
                '["true"]',
            ),
            (
                "direct wrangler bypass",
                workflow_path,
                "python3 -B scripts/host-rollout-cache-evidence.py validate-config \\",
                "npx wrangler pages deploy dist\\n          python3 -B scripts/host-rollout-cache-evidence.py validate-config \\",
            ),
            (
                "direct OCI bypass",
                workflow_path,
                "python3 -B scripts/host-rollout-cache-evidence.py validate-config \\",
                "./deploy/oci/05-deploy-compose-stack.sh\\n          python3 -B scripts/host-rollout-cache-evidence.py validate-config \\",
            ),
            (
                "direct ghcr bypass",
                workflow_path,
                "--command playwright-authority-cache-regressions",
                "docker push ghcr.io/example/bypass:latest",
            ),
            (
                "reporter validator omitted",
                workflow_path,
                "host-rollout-evidence-reporter.py",
                "omitted-rollout-reporter.py",
            ),
            (
                "unsafe archive extraction",
                ".github/workflows/deploy-front.yml",
                "--no-same-owner --no-same-permissions",
                "",
            ),
            (
                "candidate validator omitted",
                ".github/workflows/deploy-front.yml",
                "python3 -B scripts/validate-host-rollout-candidate.py --candidate \"$candidate\"",
                "true",
            ),
            (
                "TOFU SSH host key",
                "deploy/oci/05-deploy-compose-stack.sh",
                'StrictHostKeyChecking=yes',
                'StrictHostKeyChecking=accept-new',
            ),
        )
        for name, path, old, new in cases:
            sources = _read_sources(REPO_ROOT)
            sources[path] = sources[path].replace(old, new, 1)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))

    def test_production_ast_rejects_versioned_optioned_and_pinned_deploy_bypasses(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        cases = (
            (
                "versioned wrangler in source job",
                workflow_path,
                "printf 'stage=%s\\n' \"$stage\"",
                "npx --yes wrangler@4.84.1 pages deploy dist --project-name bypass\n            printf 'stage=%s\\n' \"$stage\"",
            ),
            (
                "docker imagetools GHCR publish in source job",
                workflow_path,
                "printf 'stage=%s\\n' \"$stage\"",
                "docker buildx imagetools create --tag ghcr.io/example/readmates:bypass source@example\n            printf 'stage=%s\\n' \"$stage\"",
            ),
            (
                "unknown pinned wrangler action",
                workflow_path,
                "      - name: Check out the protected candidate and full history\n",
                "      - name: Unknown pinned deploy action\n        uses: cloudflare/wrangler-action@1111111111111111111111111111111111111111\n      - name: Check out the protected candidate and full history\n",
            ),
            (
                "unknown rollout job",
                workflow_path,
                "\n  pages-candidate:\n",
                "\n  bypass-job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo structural-bypass\n\n  pages-candidate:\n",
            ),
            (
                "extra OCI deploy step in authorized job",
                workflow_path,
                "      - name: Check out exact protected SHA\n        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2\n        with:\n          ref: ${{ needs.source.outputs.git-sha }}\n          persist-credentials: false\n      - name: Deploy digest-immutable policy and pass runtime health\n",
                "      - name: Check out exact protected SHA\n        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2\n        with:\n          ref: ${{ needs.source.outputs.git-sha }}\n          persist-credentials: false\n      - name: Extra OCI bypass\n        run: ./deploy/oci/05-deploy-compose-stack.sh\n      - name: Deploy digest-immutable policy and pass runtime health\n",
            ),
            (
                "extra wrangler step in authorized front job",
                ".github/workflows/deploy-front.yml",
                "      - name: Require deployed Pages runtime health\n",
                "      - name: Extra Pages bypass\n        run: npx --yes wrangler@4.84.1 pages deploy dist --project-name bypass\n      - name: Require deployed Pages runtime health\n",
            ),
            (
                "second wrangler command in authorized front step",
                ".github/workflows/deploy-front.yml",
                "          npx --yes wrangler@4.84.1 pages deploy dist \\\n",
                "          npx --yes wrangler@4.84.1 pages deploy bypass --project-name bypass\n          npx --yes wrangler@4.84.1 pages deploy dist \\\n",
            ),
            (
                "extra GHCR publish step in authorized server job",
                ".github/workflows/deploy-server.yml",
                "      - name: Record promoted digest\n",
                "      - name: Extra GHCR bypass\n        run: docker buildx imagetools create --tag ghcr.io/example/readmates:bypass source@example\n      - name: Record promoted digest\n",
            ),
        )
        for name, path, old, new in cases:
            sources = _read_sources(REPO_ROOT)
            self.assertIn(old, sources[path], name)
            sources[path] = sources[path].replace(old, new, 1)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))

    def test_canonical_workflow_contract_rejects_every_executable_ast_change(self) -> None:
        rollout_path = ".github/workflows/host-client-rollout-evidence.yml"
        front_path = ".github/workflows/deploy-front.yml"
        cases: list[tuple[str, dict[str, str]]] = []

        sources = _read_sources(REPO_ROOT)
        old = "            printf 'stage=%s\\n' \"$stage\""
        self.assertIn(old, sources[rollout_path])
        sources[rollout_path] = sources[rollout_path].replace(
            old,
            "            package=wrangler@4.84.1\n"
            "            npx --yes \"$package\" pages deploy dist\n"
            + old,
            1,
        )
        cases.append(("variable-indirected wrangler package", sources))

        sources = _read_sources(REPO_ROOT)
        self.assertIn(old, sources[rollout_path])
        sources[rollout_path] = sources[rollout_path].replace(
            old,
            "            npx --yes wrangler@4.84.1 pages deplo\"y\" dist\n" + old,
            1,
        )
        cases.append(("quoted deploy token", sources))

        sources = _read_sources(REPO_ROOT)
        self.assertIn(old, sources[rollout_path])
        sources[rollout_path] = sources[rollout_path].replace(
            old,
            "            docker buildx build --push --tag ghcr.io/example/readmates:bypass .\n" + old,
            1,
        )
        cases.append(("docker buildx push", sources))

        sources = _read_sources(REPO_ROOT)
        old_deploy = "          printf 'deployed-at=%s\\n' \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\" >> \"$GITHUB_OUTPUT\""
        self.assertIn(old_deploy, sources[front_path])
        sources[front_path] = sources[front_path].replace(
            old_deploy,
            old_deploy
            + "\n          package=wrangler@4.84.1\n"
            + "          npx --yes \"$package\" pages deplo\"y\" bypass --project-name bypass",
            1,
        )
        cases.append(("second obfuscated deploy in authorized step", sources))

        sources = _read_sources(REPO_ROOT)
        health_name = "      - name: Require deployed Pages runtime health\n"
        self.assertIn(health_name, sources[front_path])
        sources[front_path] = sources[front_path].replace(
            health_name,
            "      - name: Record harmless local audit\n"
            "        shell: bash\n"
            "        run: echo harmless\n"
            + health_name,
            1,
        )
        cases.append(("new benign-looking step", sources))

        sources = _read_sources(REPO_ROOT)
        self.assertIn("--max-time 20", sources[front_path])
        sources[front_path] = sources[front_path].replace("--max-time 20", "--max-time 21", 1)
        cases.append(("changed existing run line", sources))

        sources = _read_sources(REPO_ROOT)
        deploy_start = sources[front_path].index("      - name: Deploy only the verified extracted bytes\n")
        health_start = sources[front_path].index(health_name, deploy_start)
        deploy_block = sources[front_path][deploy_start:health_start]
        health_block = sources[front_path][health_start:]
        sources[front_path] = sources[front_path][:deploy_start] + health_block + deploy_block
        cases.append(("reordered steps", sources))

        sources = _read_sources(REPO_ROOT)
        self.assertIn(CHECKOUT_USE, sources[rollout_path])
        sources[rollout_path] = sources[rollout_path].replace(CHECKOUT_USE, SETUP_NODE_USE, 1)
        cases.append(("alternate approved pinned external action", sources))

        for name, mutated_sources in cases:
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(mutated_sources))

        sources = _read_sources(REPO_ROOT)
        sources["scripts/host-rollout-workflow-contract.json"] = '{"unexpected":true}'
        sources["scripts/schemas/host-rollout-workflow-contract-v1.schema.json"] = "{}"
        self.assertTrue(validate_structural_sources(sources))

        sources = _read_sources(REPO_ROOT)
        sources["scripts/schemas/host-rollout-workflow-contract-v1.schema.json"] = "{}"
        self.assertTrue(validate_structural_sources(sources))

        sources = _read_sources(REPO_ROOT)
        contract = json.loads(sources["scripts/host-rollout-workflow-contract.json"])
        contract["workflows"][front_path] = "not-a-digest"
        sources["scripts/host-rollout-workflow-contract.json"] = json.dumps(contract)
        self.assertTrue(validate_structural_sources(sources))

    def test_reporter_contract_rejects_empty_duplicate_unknown_and_skipped_cases(self) -> None:
        path = "scripts/host-rollout-test-contract.json"
        mutations = (
            ('"cases": ["browser-previous-policy-720s"]', '"cases": []'),
            ('"cases": ["browser-previous-policy-720s"]', '"cases": ["browser-previous-policy-720s", "browser-previous-policy-720s"]'),
            ('"cases": ["browser-previous-policy-720s"]', '"cases": ["unknown-case"]'),
            ('"requiredPaths": ["front/playwright.config.ts", "front/tests/e2e/public-projection-cache-safety.spec.ts"]', '"requiredPaths": []'),
            ('"@prechange"]', '"@prechange", "--skip"]'),
        )
        for old, new in mutations:
            sources = _read_sources(REPO_ROOT)
            sources[path] = sources[path].replace(old, new, 1)
            with self.subTest(mutation=new):
                self.assertTrue(validate_structural_sources(sources))

    def test_security_reporter_contract_rejects_unbound_or_noncausal_aggregation(self) -> None:
        cases = (
            (
                "scripts/host-rollout-test-contract.json",
                '"front/tests/e2e/support/host-authority-cache-security-reporter.ts"',
                '"front/tests/e2e/support/unbound-reporter.ts"',
            ),
            (
                "front/playwright.config.ts",
                "reporter: protectedSecurityReporterEnabled()",
                "reporter: reporterAlwaysEnabled()",
            ),
            (
                "front/tests/e2e/support/host-authority-cache-security-reporter.ts",
                "onTestEnd",
                "omittedTestCallback",
            ),
        )
        for path, old, new in cases:
            sources = _read_sources(REPO_ROOT)
            sources[path] = sources[path].replace(old, new, 1)
            with self.subTest(path=path):
                self.assertTrue(validate_structural_sources(sources))

    def test_live_browser_jobs_require_fresh_setup_and_manual_protected_authority(self) -> None:
        errors = validate_structural_sources(_read_sources(REPO_ROOT))
        self.assertEqual(errors, [])
        workflow = _parse_workflow_yaml(_read_sources(REPO_ROOT)[".github/workflows/host-client-rollout-evidence.yml"])
        self.assertEqual(set(_mapping(workflow.get("on"))), {"workflow_dispatch"})
        self.assertIsNone(_mapping(workflow.get("on")).get("workflow_dispatch"))
        jobs = _mapping(workflow.get("jobs"))
        for job_name in ("prime-r2a-cache", "bind-r2a-runtime-pair", "browser-r2a-proof", "compatibility-r2b", "security-r2b"):
            job = _mapping(jobs.get(job_name))
            uses = {str(step.get("uses", "")) for step in _steps(job)}
            runs = "\n".join(str(step.get("run", "")) for step in _steps(job))
            with self.subTest(job=job_name):
                self.assertIn("actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e", uses)
                self.assertIn("pnpm install --frozen-lockfile", runs)
                self.assertIn("playwright install --with-deps chromium", runs)

    def test_r2a_cache_transport_is_causal_and_rejects_adversarial_workflow_mutations(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        baseline = _read_sources(REPO_ROOT)
        workflow = baseline[workflow_path]
        required = (
            "python3 -B scripts/host-rollout-cache-evidence.py validate-config",
            "python3 -B scripts/host-rollout-cache-evidence.py package-profile",
            "python3 -B scripts/host-rollout-cache-evidence.py mutate-synthetic-target",
            "python3 -B scripts/host-rollout-cache-evidence.py extract-profile",
            "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL: ${{ vars.READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL }}",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE: ${{ secrets.READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE }}",
            "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE:",
            "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_STATE:",
            "READMATES_HOST_ROLLOUT_OLD_GENERATION_ETAG:",
            "retention-days: 1",
            "artifact-ids: ${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}",
            "CACHE_PROFILE_TRANSPORT_DIGEST",
            "CACHE_PROFILE_CONTENT_DIGEST",
            "CACHE_PROFILE_STATE_DIGEST",
            "CACHE_TARGET_IDENTITY",
            "CACHE_BOUNDARY_IDENTITIES",
        )
        for needle in required:
            self.assertIn(needle, workflow)
        self.assertNotIn("host-rollout-evidence-reporter.py run-command", "\n".join(
            str(step.get("run", ""))
            for step in _steps(_mapping(_mapping(_parse_workflow_yaml(workflow).get("jobs")).get("prime-r2a-cache")))
        ))

        cases = (
            (
                "missing boundary env",
                "          READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL: ${{ vars.READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL }}\n",
                "",
            ),
            (
                "localhost boundary",
                "${{ vars.READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL }}",
                "https://localhost",
            ),
            (
                "fresh profile",
                "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE: ${{ runner.temp }}/host-rollout-cache/profile",
                "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE: ${{ runner.temp }}/fresh-profile",
            ),
            (
                "tampered transport digest",
                "${{ needs.prime-r2a-cache.outputs.profile-transport-digest }}",
                "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            ),
            (
                "wrong transport artifact",
                "artifact-ids: ${{ needs.prime-r2a-cache.outputs.profile-artifact-id }}",
                "artifact-ids: ${{ needs.pages-candidate.outputs.artifact-id }}",
            ),
            (
                "sub 720 wait",
                "base_epoch + 720",
                "base_epoch + 719",
            ),
            (
                "target mismatch",
                "${{ vars.READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH }}",
                "${{ vars.READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH }}",
            ),
            (
                "mutation no-op",
                "mutate-synthetic-target",
                "validate-config",
            ),
            (
                "prime produces PASS",
                "python3 -B scripts/host-rollout-cache-evidence.py package-profile",
                "python3 -B scripts/host-rollout-evidence-reporter.py run-command --group cache-safety --command seed-r2a-prechange-cache && python3 -B scripts/host-rollout-cache-evidence.py package-profile",
            ),
            (
                "report command misbinding",
                "--command seed-r2a-prechange-cache",
                "--command playwright-r2a-cache-safety",
            ),
        )
        for name, old, new in cases:
            sources = _read_sources(REPO_ROOT)
            self.assertIn(old, sources[workflow_path], name)
            sources[workflow_path] = sources[workflow_path].replace(old, new, 1)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))

    def test_cache_security_boundary_rejects_redirect_hmac_marker_identity_and_preextract_bypasses(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        helper_path = "scripts/host-rollout-cache-evidence.py"
        sources = _read_sources(REPO_ROOT)
        helper = sources[helper_path]
        workflow = sources[workflow_path]
        for needle in (
            "class _NoRedirect(urllib.request.HTTPRedirectHandler)",
            "hmac.new(",
            "validate_synthetic_ownership",
            "verify_synthetic_ownership(config)",
            "_validated_archive_payload",
            "syntheticMarkerIdentity",
        ):
            self.assertIn(needle, helper)
        for needle in (
            "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY: ${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY }}",
            'report["bindings"]["profileIdentity"]',
            'expected_profile_identity = f"run-{os.environ[\'GITHUB_RUN_ID\']}-attempt-{os.environ[\'GITHUB_RUN_ATTEMPT\']}-r2a-public-cache"',
            '"syntheticMarkerIdentity"',
        ):
            self.assertIn(needle, workflow)
        self.assertNotIn("READMATES_HOST_ROLLOUT_SYNTHETIC_IDEMPOTENCY_KEY", workflow)

        def refresh_contract(mutated: dict[str, str]) -> dict[str, str]:
            asts = {path: _parse_workflow_yaml(mutated[path]) for path in WORKFLOW_CONTRACT_WORKFLOWS}
            contract = json.loads(mutated[WORKFLOW_CONTRACT_PATH])
            contract["workflows"] = _workflow_contract_document(asts)["workflows"]
            mutated[WORKFLOW_CONTRACT_PATH] = json.dumps(contract)
            return mutated

        helper_cases = (
            (
                "redirect handler removed",
                "class _NoRedirect(urllib.request.HTTPRedirectHandler)",
                "class _NoRedirect(object)",
            ),
            ("stdlib HMAC removed", "hmac.new(", "hmac_removed("),
            ("ownership check removed", "verify_synthetic_ownership(config)", "None"),
            ("pre-extraction verifier removed", "_validated_archive_payload", "_untrusted_archive_payload"),
        )
        for name, old, new in helper_cases:
            mutated = _read_sources(REPO_ROOT)
            self.assertIn(old, mutated[helper_path], name)
            mutated[helper_path] = mutated[helper_path].replace(old, new, 1)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(mutated))

    def test_existing_ownership_endpoints_and_exact_public_url_handoff_fail_closed(self) -> None:
        workflow_path = ".github/workflows/host-client-rollout-evidence.yml"
        helper_path = "scripts/host-rollout-cache-evidence.py"
        sources = _read_sources(REPO_ROOT)
        helper = sources[helper_path]
        workflow = sources[workflow_path]
        self.assertNotIn("/api/bff/api/host/rollout-evidence/synthetic-targets/", helper)
        for needle in (
            "api/bff/api/host/club-operations",
            "api/bff/api/host/sessions/{config.synthetic_session_id}",
            "_open_public_exact",
            "ownershipResponseIdentity",
        ):
            self.assertIn(needle, helper)
        for needle in (
            "READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID: ${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID }}",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE: ${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE }}",
            "READMATES_HOST_ROLLOUT_EXPECTED_ORIGIN_REVOKED_URL:",
            "READMATES_HOST_ROLLOUT_EXPECTED_BFF_REVOKED_URL:",
            "READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL:",
            "READMATES_HOST_ROLLOUT_EXPECTED_CDN_CLUB_URL:",
            "READMATES_HOST_ROLLOUT_EXPECTED_CDN_STABLE_SESSION_URL:",
            '"ownershipResponseIdentity"',
        ):
            self.assertIn(needle, workflow)

        def refresh_contract(mutated: dict[str, str]) -> dict[str, str]:
            asts = {path: _parse_workflow_yaml(mutated[path]) for path in WORKFLOW_CONTRACT_WORKFLOWS}
            contract = json.loads(mutated[WORKFLOW_CONTRACT_PATH])
            contract["workflows"] = _workflow_contract_document(asts)["workflows"]
            mutated[WORKFLOW_CONTRACT_PATH] = json.dumps(contract)
            return mutated

        for name, old, new in (
            (
                "bespoke missing ownership endpoint restored",
                "api/bff/api/host/club-operations",
                "api/bff/api/host/rollout-evidence/synthetic-targets/{config.synthetic_session_id}",
            ),
            (
                "public exact opener bypassed",
                'with _open_public_exact(request, f"prechange {label}", expected_url) as response:',
                "with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:",
            ),
            (
                "ownership response binding omitted",
                '"ownershipResponseIdentity": ownership_response_identity,',
                '"ignoredOwnershipResponseIdentity": ownership_response_identity,',
            ),
        ):
            mutated = _read_sources(REPO_ROOT)
            self.assertIn(old, mutated[helper_path], name)
            mutated[helper_path] = mutated[helper_path].replace(old, new, 1)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(mutated))

        mutated = _read_sources(REPO_ROOT)
        old = "          READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL: ${{ needs.prime-r2a-cache.outputs.expected-cdn-revoked-url }}\n"
        self.assertIn(old, mutated[workflow_path])
        mutated[workflow_path] = mutated[workflow_path].replace(old, "", 1)
        mutated = refresh_contract(mutated)
        self.assertTrue(validate_structural_sources(mutated))

        workflow_cases = (
            (
                "marker identity omitted",
                "          READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY: ${{ vars.READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY }}\n",
                "",
            ),
            (
                "secret idempotency key restored",
                "          READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE: ${{ secrets.READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE }}\n",
                "          READMATES_HOST_ROLLOUT_SYNTHETIC_IDEMPOTENCY_KEY: ${{ secrets.READMATES_HOST_ROLLOUT_SYNTHETIC_IDEMPOTENCY_KEY }}\n"
                "          READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE: ${{ secrets.READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE }}\n",
            ),
            (
                "report profile binding ignored",
                'report["bindings"]["profileIdentity"]',
                'os.environ["CACHE_PROFILE_IDENTITY"]',
            ),
        )
        for name, old, new in workflow_cases:
            mutated = _read_sources(REPO_ROOT)
            self.assertIn(old, mutated[workflow_path], name)
            mutated[workflow_path] = mutated[workflow_path].replace(old, new, 1)
            mutated = refresh_contract(mutated)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(mutated))

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


def print_workflow_digests(root: Path = REPO_ROOT) -> None:
    sources = _read_sources(root)
    errors: list[str] = []
    workflow_asts = {
        path: _workflow_ast(path, sources, errors)
        for path in WORKFLOW_CONTRACT_WORKFLOWS
    }
    if errors:
        raise ContractError(errors[0])
    print(json.dumps(_workflow_contract_document(workflow_asts), indent=2, ensure_ascii=True))


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
    parser.add_argument("--print-workflow-digests", action="store_true")
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
    gh_binary: Path | None = None
    try:
        if args.print_workflow_digests:
            if any(getattr(args, name) is not None for name in _live_argument_names()):
                raise ContractError("workflow digest review mode cannot be combined with live evidence inputs")
            print_workflow_digests()
            return 0
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
    finally:
        if gh_binary is not None:
            verifier.cleanup_verified_gh(gh_binary)
    print("Host client rollout attested evidence contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
