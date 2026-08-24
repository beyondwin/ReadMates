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


class ContractError(ValueError):
    pass


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


def validate_structural_sources(sources: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED_SOURCES:
        if relative not in sources:
            errors.append(f"required source is missing: {relative}")
    if errors:
        return errors

    ci = sources[".github/workflows/ci.yml"]
    _require(ci, "python3 -B scripts/check-host-client-rollout-contract.py --self-test", "CI omits rollout contract self-test", errors)
    _require(ci, "python3 -B scripts/check-host-client-rollout-contract.py", "CI omits rollout structural mode", errors)
    _require(ci, "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test", "CI omits evidence verifier self-test", errors)

    workflow = sources[".github/workflows/host-client-rollout-evidence.yml"]
    for needle, message in (
        ("workflow_call:", "evidence workflow must be reusable"),
        (
            "github.ref_protected && github.event_name != 'workflow_dispatch' && !startsWith(github.event_name, 'pull_request')",
            "manual dispatch, untrusted refs, or pull request events are not denied",
        ),
        ("environment:\n      name: host-client-rollout-evidence", "protected evidence environment is missing"),
        ("contents: read", "evidence workflow contents permission is not least privilege"),
        ("id-token: write", "evidence workflow cannot mint attestation identity"),
        ("attestations: write", "evidence workflow cannot persist attestations"),
        ("artifact-metadata: write", "evidence workflow artifact metadata permission is missing"),
        (ATTEST_PIN, "official attestation action is not pinned by full SHA"),
        (UPLOAD_PIN, "artifact upload action is not pinned by full SHA"),
        (DOWNLOAD_PIN, "artifact download action is not pinned by full SHA"),
        ("trusted-backend-digest:", "trusted backend digest input is missing"),
        ("trusted-pages-digest:", "trusted Pages digest input is missing"),
        ("trusted-cache-source-set-digest:", "trusted cache source-set digest input is missing"),
        ("digest-mismatch: error", "downloaded artifact digest mismatch is not fail closed"),
        ("--schema-only", "producer does not validate the manifest schema and policy"),
        ("bundle-path", "attestation bundle output is not persisted"),
        ("if-no-files-found: error", "evidence upload does not fail on missing artifacts"),
        (
            "TRUSTED_PRODUCER_WORKFLOW_REF: ${{ format('{0}/.github/workflows/host-client-rollout-evidence.yml@{1}', github.repository, github.ref) }}",
            "called-workflow identity is not bound to the manifest",
        ),
        ("TRUSTED_PRODUCER_RUN_ID: ${{ github.run_id }}", "producer run ID is not bound to the manifest"),
        ("TRUSTED_PRODUCER_RUN_ATTEMPT: ${{ github.run_attempt }}", "producer run attempt is not bound to the manifest"),
        (
            "READMATES_HOST_ROLLOUT_SIGNER_WORKFLOW_REF: ${{ format('{0}/.github/workflows/host-client-rollout-evidence.yml@{1}', github.repository, github.ref) }}",
            "live verifier is not bound to the called workflow identity",
        ),
        ('test "$TRUSTED_GIT_SHA" = "$GITHUB_SHA"', "protected source SHA is not bound to the trusted candidate"),
        (
            'manifest["producer"]["workflowRef"] != os.environ["TRUSTED_PRODUCER_WORKFLOW_REF"]',
            "manifest workflow identity is not compared with the protected producer",
        ),
        (
            'manifest["producer"]["runId"] != os.environ["TRUSTED_PRODUCER_RUN_ID"]',
            "manifest run ID is not compared with the protected producer",
        ),
        (
            'manifest["producer"]["runAttempt"] != int(os.environ["TRUSTED_PRODUCER_RUN_ATTEMPT"])',
            "manifest run attempt is not compared with the protected producer",
        ),
    ):
        _require(workflow, needle, message, errors)
    _forbid(workflow, "workflow_dispatch:", "live evidence must not accept workflow_dispatch human inputs", errors)
    _forbid(workflow, "pull_request:", "pull requests must not trigger live evidence", errors)
    _require(workflow, "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE: protected", "protected live-evidence marker is missing", errors)
    _require(workflow, "READMATES_HOST_ROLLOUT_REF_PROTECTED: ${{ github.ref_protected }}", "protected-ref marker is missing", errors)
    if re.search(r"workflow_call:[\s\S]{0,2400}(backend|pages)[-_]digest:[\s\S]{0,160}default:", workflow):
        errors.append("trusted digest inputs must not have human-selectable defaults")

    sync_config = sources[".github/workflows/sync-config.yml"]
    _require(sync_config, "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE:", "typed host contract mode is not rendered", errors)
    _require(sync_config, "DISABLED|V2_ONLY|SUPPORT_V2_V3|ENFORCE_V3", "typed host contract mode allowlist is missing", errors)
    _forbid(
        sync_config,
        'READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED: "true"',
        "legacy required flag conflicts with typed production mode",
        errors,
    )

    deploy_server = sources[".github/workflows/deploy-server.yml"]
    _require(deploy_server, "backend-digest: ${{ steps.build.outputs.digest }}", "server workflow does not expose the trusted build digest", errors)
    _require(deploy_server, '"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"', "server promotion is not digest immutable", errors)

    deploy_front = sources[".github/workflows/deploy-front.yml"]
    _require(deploy_front, UPLOAD_PIN, "front workflow does not use the pinned upload producer", errors)
    _require(
        deploy_front,
        "pages-digest: ${{ format('sha256:{0}', steps.pages-candidate.outputs.artifact-digest) }}",
        "front workflow does not expose the trusted Pages artifact digest with its algorithm",
        errors,
    )
    _require(deploy_front, "archive: false", "Pages candidate digest is not bound to one unarchived immutable file", errors)

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
        ("readmates_host_client_contract_writes_total", "adoption metric query is unnamed"),
        ("Host Client Contract Adoption", "adoption dashboard is unnamed"),
    ):
        _require(docs, needle, message, errors)
    if re.search(r"sha256:[0-9a-f]{64}|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", docs):
        errors.append("tracked rollout docs contain live-looking digest or timestamp evidence")

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

    cache_stage = cache["stage"]
    pre_change = _parse_timestamp(cache_stage["preChangeCachedAt"])
    policy_deployed = _parse_timestamp(cache_stage["policyDeployedAt"])
    wait_completed = _parse_timestamp(cache_stage["waitCompletedAt"])
    browser_completed = _parse_timestamp(cache_stage["browserProofCompletedAt"])
    cache_produced = _parse_timestamp(cache_stage["evidenceProducedAt"])
    if (wait_completed - max(pre_change, policy_deployed)).total_seconds() < 720:
        raise ContractError("R2a previous browser cache lifetime was not fully exhausted")
    if browser_completed < wait_completed or cache_produced < browser_completed:
        raise ContractError("R2a browser proof or evidence timestamp order is invalid")
    for manifest in (compatibility, security):
        if _parse_timestamp(manifest["stage"]["evidenceProducedAt"]) < browser_completed:
            raise ContractError("R2b evidence predates the completed R2a cache proof")


def _valid_structural_sources() -> dict[str, str]:
    generic = ""
    sources = {path: generic for path in REQUIRED_SOURCES}
    sources[".github/workflows/ci.yml"] = "\n".join(
        (
            "python3 -B scripts/check-host-client-rollout-contract.py --self-test",
            "python3 -B scripts/check-host-client-rollout-contract.py",
            "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test",
        )
    )
    sources[".github/workflows/host-client-rollout-evidence.yml"] = "\n".join(
        (
            "workflow_call:",
            "  trusted-backend-digest:",
            "    required: true",
            "  trusted-pages-digest:",
            "    required: true",
            "  trusted-cache-source-set-digest:",
            "    required: true",
            "permissions:",
            "  contents: read",
            "  id-token: write",
            "  attestations: write",
            "  artifact-metadata: write",
            "if: ${{ github.ref_protected && github.event_name != 'workflow_dispatch' && !startsWith(github.event_name, 'pull_request') }}",
            "environment:\n      name: host-client-rollout-evidence",
            ATTEST_PIN,
            UPLOAD_PIN,
            DOWNLOAD_PIN,
            "digest-mismatch: error",
            "--schema-only",
            "bundle-path",
            "if-no-files-found: error",
            "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE: protected",
            "READMATES_HOST_ROLLOUT_REF_PROTECTED: ${{ github.ref_protected }}",
            "TRUSTED_PRODUCER_WORKFLOW_REF: ${{ format('{0}/.github/workflows/host-client-rollout-evidence.yml@{1}', github.repository, github.ref) }}",
            "TRUSTED_PRODUCER_RUN_ID: ${{ github.run_id }}",
            "TRUSTED_PRODUCER_RUN_ATTEMPT: ${{ github.run_attempt }}",
            "READMATES_HOST_ROLLOUT_SIGNER_WORKFLOW_REF: ${{ format('{0}/.github/workflows/host-client-rollout-evidence.yml@{1}', github.repository, github.ref) }}",
            'test "$TRUSTED_GIT_SHA" = "$GITHUB_SHA"',
            'manifest["producer"]["workflowRef"] != os.environ["TRUSTED_PRODUCER_WORKFLOW_REF"]',
            'manifest["producer"]["runId"] != os.environ["TRUSTED_PRODUCER_RUN_ID"]',
            'manifest["producer"]["runAttempt"] != int(os.environ["TRUSTED_PRODUCER_RUN_ATTEMPT"])',
        )
    )
    sources[".github/workflows/sync-config.yml"] = "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE:\nDISABLED|V2_ONLY|SUPPORT_V2_V3|ENFORCE_V3"
    sources[".github/workflows/deploy-server.yml"] = "backend-digest: ${{ steps.build.outputs.digest }}\n\"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}\""
    sources[".github/workflows/deploy-front.yml"] = (
        f"{UPLOAD_PIN}\n"
        "pages-digest: ${{ format('sha256:{0}', steps.pages-candidate.outputs.artifact-digest) }}\n"
        "archive: false"
    )
    sources["scripts/schemas/host-client-rollout-evidence-v1.schema.json"] = '"additionalProperties": false'
    sources["scripts/tooling/gh-attestation-lock.json"] = '"version": "2.98.0"\n"Linux-x86_64"\n"Linux-aarch64"\n"Darwin-x86_64"\n"Darwin-arm64"'
    sources["scripts/README.md"] = "check-host-client-rollout-contract.py\nverify-host-client-rollout-evidence.py"
    sources["scripts/build-public-release-candidate.sh"] = "\n".join(
        f'copy_required_file "{path}"'
        for path in (
            ".github/workflows/host-client-rollout-evidence.yml",
            "scripts/check-host-client-rollout-contract.py",
            "scripts/verify-host-client-rollout-evidence.py",
            "scripts/schemas/host-client-rollout-evidence-v1.schema.json",
            "scripts/tooling/gh-attestation-lock.json",
        )
    )
    sources["scripts/verify-public-release-fixtures.sh"] = "\n".join(
        (
            "python3 -B scripts/check-host-client-rollout-contract.py --self-test",
            "python3 -B scripts/check-host-client-rollout-contract.py",
            "python3 -B scripts/verify-host-client-rollout-evidence.py --self-test",
        )
    )
    sources["docs/deploy/release-publish-runbook.md"] = " ".join(
        (
            "R1 SUPPORT_V2_V3 R2a 720 R2b 24시간 v2 writes == 0 v3 writes > 0",
            "missing/unknown == 0 R3 ENFORCE_V3 fresh explicit preflight abort rollback",
            "production email billable readmates_host_client_contract_writes_total Host Client Contract Adoption",
        )
    )
    sources[".env.example"] = "READMATES_HOST_WRITE_CLIENT_CONTRACT_MODE="
    sources[".gitignore"] = "front/output/host-rollout/"
    return sources


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
        )

    def test_valid_staged_contract_passes(self) -> None:
        self.assertEqual(validate_structural_sources(_valid_structural_sources()), [])
        self._combined(*self._manifests())

    def test_structural_omissions_and_conflicting_config_fail_independently(self) -> None:
        cases = (
            ("CI omission", ".github/workflows/ci.yml", "--self-test", ""),
            ("scripts index omission", "scripts/README.md", "check-host-client-rollout-contract.py", ""),
            ("release candidate omission", "scripts/build-public-release-candidate.sh", "scripts/tooling/gh-attestation-lock.json", "omitted"),
            ("public fixture omission", "scripts/verify-public-release-fixtures.sh", "verify-host-client-rollout-evidence.py --self-test", "omitted"),
            ("support stage omission", "docs/deploy/release-publish-runbook.md", "SUPPORT_V2_V3", "V2_ONLY"),
            ("residue gate omission", "docs/deploy/release-publish-runbook.md", "v2 writes == 0", "v2 observed"),
            ("rollback omission", "docs/deploy/release-publish-runbook.md", "rollback", "recovery"),
            (
                "untrusted PR event omission",
                ".github/workflows/host-client-rollout-evidence.yml",
                "github.event_name != 'workflow_dispatch' && !startsWith(github.event_name, 'pull_request')",
                "github.event_name != 'pull_request'",
            ),
            (
                "producer run identity omission",
                ".github/workflows/host-client-rollout-evidence.yml",
                "TRUSTED_PRODUCER_RUN_ID: ${{ github.run_id }}",
                "TRUSTED_PRODUCER_RUN_ID: omitted",
            ),
            (
                "protected source SHA omission",
                ".github/workflows/host-client-rollout-evidence.yml",
                'test "$TRUSTED_GIT_SHA" = "$GITHUB_SHA"',
                'test "$TRUSTED_GIT_SHA" = "$CHECKED_OUT_SHA"',
            ),
        )
        for name, path, old, new in cases:
            sources = _valid_structural_sources()
            sources[path] = sources[path].replace(old, new)
            with self.subTest(name=name):
                self.assertTrue(validate_structural_sources(sources))
        sources = _valid_structural_sources()
        sources[".github/workflows/sync-config.yml"] += '\nREADMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED: "true"'
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
            )


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
        cache = verifier.verify_evidence(args.cache_manifest, args.cache_attestation, "cache-safety", gh_binary=gh_binary)
        compatibility = verifier.verify_evidence(args.compat_manifest, args.compat_attestation, "compatibility", gh_binary=gh_binary)
        security = verifier.verify_evidence(args.security_manifest, args.security_attestation, "security", gh_binary=gh_binary)
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
        )
    except (ContractError, EvidenceError) as error:
        print(f"host rollout contract: {error}", file=sys.stderr)
        return 1
    print("Host client rollout attested evidence contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
