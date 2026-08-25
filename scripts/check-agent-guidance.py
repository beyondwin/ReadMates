#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
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
PNPM_VERSION_RE = re.compile(r"\bpnpm@(\d+\.\d+\.\d+)\b")
ADR_FILE_RE = re.compile(r"^(\d{4})-[a-z0-9][a-z0-9-]*\.md$")
ADR_TITLE_RE = re.compile(r"^# ADR-(\d{4}): (.+)$", re.MULTILINE)
ADR_STATUS_RE = re.compile(
    r"^- 상태: (Accepted|Proposed|Deprecated|Superseded by ADR-\d{4})$",
    re.MULTILINE,
)
ADR_DATE_RE = re.compile(r"^- 결정일: (\d{4}-\d{2}-\d{2})$", re.MULTILINE)
ADR_INDEX_ROW_RE = re.compile(
    r"^\| \[(\d{4})\]\((\d{4}-[^)]+\.md)\) \| (.*?) \| "
    r"(Accepted|Proposed|Deprecated|Superseded by ADR-\d{4}) \|",
    re.MULTILINE,
)
TECHNICAL_ADR_ROW_RE = re.compile(
    r"^\| \[ADR-(\d{4})\]\(adr/(\d{4}-[^)]+\.md)\) \| (.*?) \| "
    r"(Accepted|Proposed|Deprecated|Superseded by ADR-\d{4}) \|$",
    re.MULTILINE,
)
ADR_POLICY_EFFECTIVE_DATE = "2026-08-22"
DATED_PLANNING_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-.+\.md$")
ADR_IMPACT_RE = re.compile(
    r"^ADR impact: (none|update|new|supersede)(?:\s+[—-].*)?$",
    re.MULTILINE,
)
ADR_REFERENCE_RE = re.compile(r"\bADR-(\d{4})\b")
PR_ADR_IMPACT_RE = re.compile(r"^ADR impact: (none|update|new|supersede)$", re.MULTILINE)
PR_ADR_REFS_RE = re.compile(r"^ADR refs: (.+)$", re.MULTILINE)
TECHNICAL_DECISIONS_INTRO = (
    "ReadMates의 durable product·technical·design·operational decision은 "
    "[ADR 인덱스](adr/README.md)가 유일한 canonical registry다. 이 문서는 기존 링크 호환을 위한 "
    "파생 인덱스이며 별도 결정 산문을 두지 않는다. `Accepted`는 현재 코드·테스트·active architecture와 "
    "일치하는 판단 근거이고, `Proposed`는 승인됐지만 아직 구현되지 않은 의무다."
)
TECHNICAL_DECISIONS_FOOTER = (
    "Active architecture는 [architecture.md](architecture.md), 검증 경로는 [test-guide.md](test-guide.md)와 "
    "각 ADR의 `검증` 절을 따른다. Server의 canonical PR gate는 `./scripts/server-ci-check.sh`다. 외부 서비스의 "
    "가격·한도·API 동작처럼 변할 수 있는 사실은 운영 판단 직전에 공식 source로 다시 확인한다."
)

PRIVATE_GUIDANCE_SOURCE_PATHS = (
    "AGENTS.md",
    "scripts/check-agent-guidance.py",
    "scripts/agent-preflight.py",
)
CONTRIBUTOR_ONLY_GUIDANCE_PATHS = (
    "docs/agents/execution.md",
    "docs/agents/front.md",
    "docs/agents/server.md",
    "docs/agents/design.md",
    "docs/agents/docs.md",
)
AUTHORITY_CONTRACT_SNIPPETS = (
    '"--authority-scope"',
    '"--authority-note"',
    '"private-data"',
    '"secrets"',
    '"live-mutation"',
    "authority-sensitive scopes require a non-blank authority note",
    "authority-note-confirmed",
)
PRIVATE_GUIDANCE_GUARD_SNIPPETS = (
    "private_guidance_paths=(",
    'if [[ "$present_count" -eq "${#private_guidance_paths[@]}" ]]; then',
    'elif [[ "$present_count" -eq 0 ]]; then',
    'READMATES_PRIVATE_AGENT_GUIDANCE=true',
    'READMATES_PRIVATE_AGENT_GUIDANCE=false',
    "Private guidance source contract is incomplete",
    "exit 1",
    "if: env.READMATES_PRIVATE_AGENT_GUIDANCE == 'true'",
)

REQUIRED_PATHS = (
    ".github/workflows/ci.yml",
    ".github/pull_request_template.md",
    "AGENTS.md",
    "front/AGENTS.md",
    "front/functions/AGENTS.md",
    "server/AGENTS.md",
    "scripts/AGENTS.md",
    "deploy/AGENTS.md",
    "CLAUDE.md",
    "front/CLAUDE.md",
    ".claude/settings.json",
    ".claude/commands/release-readiness.md",
    ".impeccable.md",
    "docs/agents/front.md",
    "docs/agents/server.md",
    "docs/agents/design.md",
    "docs/agents/docs.md",
    "docs/agents/execution.md",
    "docs/development/acceptance-matrix.md",
    "docs/development/architecture.md",
    "docs/development/adr/README.md",
    "docs/development/adr/template.md",
    "docs/development/project-map.md",
    "docs/development/vertical-slice-checklist.md",
    "docs/development/release-readiness-review.md",
    "docs/reports/2026-07-11-release-readiness-history.md",
    "scripts/README.md",
    "scripts/agent-preflight.py",
    "scripts/build-public-release-candidate.sh",
    "scripts/public-release-check.sh",
    "package.json",
)

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
PACKAGE_MANAGER_GUIDANCE_PATHS = (
    "AGENTS.md",
    "docs/development/local-setup.md",
    "docs/development/test-guide.md",
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
PUBLIC_SCAN_SUPPORT_PATHS = (
    ".env.example",
    ".github/workflows/sync-config.yml",
    "deploy/oci/compose.yml",
    "deploy/oci/compose.infra.yml",
    "deploy/oci/grafana/provisioning/datasources/tempo.yml",
    "docs/operations/runbooks/secrets-management.md",
    "ops/tempo/tempo.yml",
    "ops/observability/local/compose.yml",
    "ops/observability/local/grafana/provisioning/datasources/tempo.yml",
    "server/src/main/resources/application.yml",
    "scripts/validate-production-ai-config.sh",
    "scripts/sync-config/import-from-prod-env.sh",
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
    write(root, "AGENTS.md", f"# Guidance\n\n{CANONICAL_SERVER_COMMAND}\npnpm@11.13.1\n")
    for relative, references in LOCAL_ROUTER_CONTRACTS.items():
        write(root, relative, "\n".join(references) + "\n")
    write(root, "package.json", '{"packageManager":"pnpm@11.13.1"}\n')
    write(
        root,
        "scripts/agent-preflight.py",
        "\n".join(
            (
                "docs/agents/execution.md",
                "docs/development/acceptance-matrix.md",
                "./scripts/server-ci-check.sh",
                "pnpm --dir front test:e2e",
                "./scripts/public-release-check.sh .tmp/public-release-candidate",
                '"--authority-scope"',
                '"--authority-note"',
                '"private-data"',
                '"secrets"',
                '"live-mutation"',
                "authority-sensitive scopes require a non-blank authority note",
                "authority-note-confirmed",
            )
        )
        + "\n",
    )
    write(
        root,
        ".github/workflows/ci.yml",
        "private_guidance_paths=(\n"
        "  AGENTS.md\n"
        "  scripts/check-agent-guidance.py\n"
        "  scripts/agent-preflight.py\n"
        ")\n"
        'if [[ "$present_count" -eq "${#private_guidance_paths[@]}" ]]; then\n'
        '  echo "READMATES_PRIVATE_AGENT_GUIDANCE=true"\n'
        'elif [[ "$present_count" -eq 0 ]]; then\n'
        '  echo "READMATES_PRIVATE_AGENT_GUIDANCE=false"\n'
        "else\n"
        '  echo "Private guidance source contract is incomplete"\n'
        "  exit 1\n"
        "fi\n"
        "if: env.READMATES_PRIVATE_AGENT_GUIDANCE == 'true'\n"
        "python3 -B scripts/check-agent-guidance.py --self-test\n"
        "python3 -B scripts/agent-preflight.py --self-test\n"
        "if: env.READMATES_PRIVATE_AGENT_GUIDANCE == 'true'\n"
        "python3 -B scripts/check-agent-guidance.py\n",
    )
    write(
        root,
        "scripts/build-public-release-candidate.sh",
        "# Contributor-only agent guidance is intentionally omitted.\n",
    )
    write(root, "CLAUDE.md", "@AGENTS.md\n")
    write(root, "front/CLAUDE.md", "@AGENTS.md\n")
    write(
        root,
        "docs/development/adr/README.md",
        "# Architecture Decision Records\n\n"
        "| # | 제목 | 상태 | 결정일 | 영향 영역 |\n"
        "|---|---|---|---|---|\n"
        "| [0001](0001-fixture-decision.md) | Fixture decision | Accepted | 2026-01-01 | test |\n"
        "| [0002](0002-server-clean-architecture-with-archunit.md) | Fixture server decision | Accepted | 2026-01-01 | test |\n"
        "| [0007](0007-mysql-with-flyway-over-alternatives.md) | Fixture database decision | Accepted | 2026-01-01 | test |\n",
    )
    write(
        root,
        "docs/development/adr/0001-fixture-decision.md",
        "# ADR-0001: Fixture decision\n\n"
        "- 상태: Accepted\n"
        "- 결정일: 2026-01-01\n"
        "- 작성자: Test\n\n"
        "## 컨텍스트\nFixture.\n\n"
        "## 결정\nFixture.\n",
    )
    for number, filename, title in (
        ("0002", "0002-server-clean-architecture-with-archunit.md", "Fixture server decision"),
        ("0007", "0007-mysql-with-flyway-over-alternatives.md", "Fixture database decision"),
    ):
        write(
            root,
            f"docs/development/adr/{filename}",
            f"# ADR-{number}: {title}\n\n"
            "- 상태: Accepted\n"
            "- 결정일: 2026-01-01\n"
            "- 작성자: Test\n\n"
            f"Canonical server gate: `{CANONICAL_SERVER_COMMAND}`.\n",
        )
    write(
        root,
        "docs/development/technical-decisions.md",
        "# 주요 기술적 의사결정\n\n"
        f"{TECHNICAL_DECISIONS_INTRO}\n\n"
        "| ADR | 제목 | 상태 |\n"
        "|-----|------|------|\n"
        "| [ADR-0001](adr/0001-fixture-decision.md) | Fixture decision | Accepted |\n"
        "| [ADR-0002](adr/0002-server-clean-architecture-with-archunit.md) | Fixture server decision | Accepted |\n"
        "| [ADR-0007](adr/0007-mysql-with-flyway-over-alternatives.md) | Fixture database decision | Accepted |\n\n"
        f"{TECHNICAL_DECISIONS_FOOTER}\n",
    )
    write(
        root,
        "docs/superpowers/specs/2026-08-22-fixture-design.md",
        "# Fixture design\n\nADR impact: none\n",
    )
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
    for name, paths in INSTRUCTION_CHAINS.items():
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


def check_preflight_authority_contract(root: Path) -> list[str]:
    path = root / "scripts/agent-preflight.py"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    return [
        f"preflight authority contract missing: {snippet}"
        for snippet in AUTHORITY_CONTRACT_SNIPPETS
        if snippet not in text
    ]


def check_ci_private_guidance_guard(root: Path) -> list[str]:
    path = root / ".github/workflows/ci.yml"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    errors = [
        f"private guidance source guard missing: {snippet}"
        for snippet in (*PRIVATE_GUIDANCE_SOURCE_PATHS, *PRIVATE_GUIDANCE_GUARD_SNIPPETS)
        if snippet not in text
    ]
    if text.count("if: env.READMATES_PRIVATE_AGENT_GUIDANCE == 'true'") < 2:
        errors.append("private guidance source guard must protect both guidance CI steps")
    ordered_commands = (
        "python3 -B scripts/check-agent-guidance.py --self-test",
        "python3 -B scripts/agent-preflight.py --self-test",
        "python3 -B scripts/check-agent-guidance.py",
    )
    positions = [
        text.find(ordered_commands[0]),
        text.find(ordered_commands[1]),
        text.rfind(ordered_commands[2]),
    ]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        errors.append("private guidance source guard must preserve self-test/current-tree order")
    return errors


def check_public_guidance_manifest(root: Path) -> list[str]:
    path = root / "scripts/build-public-release-candidate.sh"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    errors = []
    for relative in CONTRIBUTOR_ONLY_GUIDANCE_PATHS:
        if (
            f'copy_required_file "{relative}"' in text
            or f'copy_optional_file "{relative}"' in text
        ):
            errors.append(
                f"public guidance manifest must omit contributor-only file: {relative}"
            )
    if 'copy_dir "docs/agents"' in text:
        errors.append("public guidance manifest must not copy the docs/agents directory")
    return errors


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


def read_adr_files(root: Path) -> tuple[dict[str, tuple[str, str, str]], list[str]]:
    adr_root = root / "docs/development/adr"
    records: dict[str, tuple[str, str, str]] = {}
    errors: list[str] = []
    if not adr_root.is_dir():
        return records, ["ADR directory is missing: docs/development/adr"]
    for path in sorted(adr_root.glob("*.md")):
        if path.name in {"README.md", "template.md"}:
            continue
        match = ADR_FILE_RE.fullmatch(path.name)
        if not match:
            errors.append(f"invalid ADR filename: {path.relative_to(root)}")
            continue
        number = match.group(1)
        if number in records:
            errors.append(f"duplicate ADR number: ADR-{number}")
            continue
        text = path.read_text(encoding="utf-8")
        title = ADR_TITLE_RE.search(text)
        status = ADR_STATUS_RE.search(text)
        if title is None or title.group(1) != number:
            errors.append(f"ADR title/filename number drift: {path.relative_to(root)}")
        if status is None:
            errors.append(f"ADR status missing or invalid: {path.relative_to(root)}")
            continue
        records[number] = (path.name, title.group(2).strip() if title else "", status.group(1))
    return records, errors


def parse_adr_index(path: Path, pattern: re.Pattern[str]) -> tuple[dict[str, tuple[str, str, str]], list[str]]:
    if not path.is_file():
        return {}, [f"ADR index is missing: {path}"]
    entries: dict[str, tuple[str, str, str]] = {}
    errors: list[str] = []
    for number, filename, title, status in pattern.findall(path.read_text(encoding="utf-8")):
        if number in entries:
            errors.append(f"duplicate ADR index entry: ADR-{number} in {path.name}")
            continue
        entries[number] = (filename, title.strip(), status)
    return entries, errors


def check_adr_registry(root: Path) -> list[str]:
    records, errors = read_adr_files(root)
    adr_index, adr_index_errors = parse_adr_index(
        root / "docs/development/adr/README.md",
        ADR_INDEX_ROW_RE,
    )
    technical_index, technical_index_errors = parse_adr_index(
        root / "docs/development/technical-decisions.md",
        TECHNICAL_ADR_ROW_RE,
    )
    errors.extend(adr_index_errors)
    errors.extend(technical_index_errors)

    superseded_edges: dict[str, str] = {}
    for number, (filename, title, status) in records.items():
        for index_name, entries in (("ADR index", adr_index), ("technical decisions index", technical_index)):
            indexed = entries.get(number)
            if indexed is None:
                errors.append(f"ADR missing from index: ADR-{number} in {index_name}")
                continue
            indexed_filename, indexed_title, indexed_status = indexed
            if indexed_filename != filename:
                errors.append(
                    f"ADR filename drift: ADR-{number} has {filename}; {index_name} has {indexed_filename}"
                )
            if indexed_title != title:
                errors.append(
                    f"ADR title drift: ADR-{number} file={title!r}; {index_name}={indexed_title!r}"
                )
            if indexed_status != status:
                errors.append(
                    f"ADR status drift: ADR-{number} file={status}; {index_name}={indexed_status}"
                )
        if status.startswith("Superseded by ADR-"):
            target = status.removeprefix("Superseded by ADR-")
            superseded_edges[number] = target
            if target not in records:
                errors.append(f"superseded ADR target missing: ADR-{number} -> ADR-{target}")
            elif target <= number:
                errors.append(f"superseded ADR target must be newer: ADR-{number} -> ADR-{target}")

    for index_name, entries in (("ADR index", adr_index), ("technical decisions index", technical_index)):
        for number in entries.keys() - records.keys():
            errors.append(f"indexed ADR file missing: ADR-{number} in {index_name}")

    for start in superseded_edges:
        seen: set[str] = set()
        current = start
        while current in superseded_edges:
            if current in seen:
                errors.append(f"superseded ADR cycle: ADR-{start}")
                break
            seen.add(current)
            current = superseded_edges[current]
    return errors


def check_planning_adr_impact(root: Path) -> list[str]:
    errors: list[str] = []
    records, _ = read_adr_files(root)
    for directory in ("docs/superpowers/specs", "docs/superpowers/plans"):
        planning_root = root / directory
        if not planning_root.is_dir():
            continue
        for path in sorted(planning_root.glob("*.md")):
            dated = DATED_PLANNING_FILE_RE.fullmatch(path.name)
            if dated is None or dated.group(1) < ADR_POLICY_EFFECTIVE_DATE:
                continue
            text = path.read_text(encoding="utf-8")
            impact = ADR_IMPACT_RE.search(text)
            if impact is None:
                errors.append(f"ADR impact missing: {path.relative_to(root)}")
                continue
            if impact.group(1) != "none":
                references = set(ADR_REFERENCE_RE.findall(impact.group(0)))
                if not references:
                    errors.append(f"ADR impact references missing: {path.relative_to(root)}")
                for number in references - records.keys():
                    errors.append(f"ADR impact references unknown ADR-{number}: {path.relative_to(root)}")
                if impact.group(1) == "new":
                    matching_date = False
                    for number in references & records.keys():
                        adr_path = root / "docs/development/adr" / records[number][0]
                        adr_date = ADR_DATE_RE.search(adr_path.read_text(encoding="utf-8"))
                        if adr_date is not None and adr_date.group(1) == dated.group(1):
                            matching_date = True
                    if not matching_date:
                        errors.append(
                            f"ADR impact new requires an ADR decided on {dated.group(1)}: {path.relative_to(root)}"
                        )
                if impact.group(1) == "supersede":
                    if not any(
                        records[number][2].startswith("Superseded by ADR-")
                        for number in references & records.keys()
                    ):
                        errors.append(
                            f"ADR impact supersede requires a superseded ADR reference: {path.relative_to(root)}"
                        )
    return errors


def check_technical_decisions_is_index_only(root: Path) -> list[str]:
    path = root / "docs/development/technical-decisions.md"
    if not path.is_file():
        return []
    records, record_errors = read_adr_files(root)
    if record_errors:
        return []
    rows = "\n".join(
        f"| [ADR-{number}](adr/{filename}) | {title} | {status} |"
        for number, (filename, title, status) in sorted(records.items())
    )
    expected = (
        "# 주요 기술적 의사결정\n\n"
        f"{TECHNICAL_DECISIONS_INTRO}\n\n"
        "| ADR | 제목 | 상태 |\n"
        "|-----|------|------|\n"
        f"{rows}\n\n"
        f"{TECHNICAL_DECISIONS_FOOTER}\n"
    )
    if path.read_text(encoding="utf-8") != expected:
        return ["parallel decision registry: technical-decisions.md must remain an ADR index/pointer"]
    return []


def pull_request_adr_changes(
    root: Path,
    pull_request: dict[str, object],
) -> tuple[dict[str, str], list[str]]:
    base = pull_request.get("base")
    base_sha = base.get("sha") if isinstance(base, dict) else None
    if not isinstance(base_sha, str) or re.fullmatch(r"[0-9a-fA-F]{40}", base_sha) is None:
        return {}, ["pull request ADR comparison base is missing or invalid"]
    result = subprocess.run(
        [
            "git",
            "diff",
            "--name-status",
            "--find-renames",
            f"{base_sha}...HEAD",
            "--",
            "docs/development/adr",
        ],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return {}, ["pull request ADR comparison failed"]
    changes: dict[str, str] = {}
    errors: list[str] = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status = parts[0]
        if status.startswith("R") and len(parts) >= 3:
            old_match = ADR_FILE_RE.fullmatch(Path(parts[1]).name)
            new_match = ADR_FILE_RE.fullmatch(Path(parts[2]).name)
            if old_match is not None and new_match is not None:
                errors.append(
                    f"pull request cannot rename ADR-{old_match.group(1)}; preserve its stable filename"
                )
                if old_match.group(1) == new_match.group(1):
                    changes[new_match.group(1)] = "M"
                else:
                    changes[old_match.group(1)] = "D"
                    changes[new_match.group(1)] = "A"
            elif old_match is not None:
                changes[old_match.group(1)] = "D"
            elif new_match is not None:
                changes[new_match.group(1)] = "A"
            continue
        filename = Path(parts[-1]).name
        match = ADR_FILE_RE.fullmatch(filename)
        if match is None:
            continue
        if status.startswith("A") or status.startswith("C"):
            changes[match.group(1)] = "A"
        elif status.startswith("D"):
            changes[match.group(1)] = "D"
        else:
            changes[match.group(1)] = "M"
            base = subprocess.run(
                ["git", "show", f"{base_sha}:{parts[-1]}"],
                cwd=root,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            current_path = root / parts[-1]
            if base.returncode != 0 or not current_path.is_file():
                errors.append(f"pull request cannot verify ADR-{match.group(1)} history")
                continue
            base_status = ADR_STATUS_RE.search(base.stdout)
            current_text = current_path.read_text(encoding="utf-8")
            current_status = ADR_STATUS_RE.search(current_text)
            if base_status is None or current_status is None:
                errors.append(f"pull request cannot verify ADR-{match.group(1)} status history")
                continue
            if base_status.group(1) == "Accepted":
                next_status = current_status.group(1)
                if next_status != "Deprecated" and not next_status.startswith("Superseded by ADR-"):
                    errors.append(
                        f"pull request cannot rewrite Accepted ADR-{match.group(1)}; supersede or deprecate it"
                    )
                    continue
                expected = ADR_STATUS_RE.sub(f"- 상태: {next_status}", base.stdout, count=1)
                if current_text != expected:
                    errors.append(
                        f"pull request cannot rewrite Accepted ADR-{match.group(1)} body; change only its status"
                    )
            elif base_status.group(1) == "Deprecated" or base_status.group(1).startswith(
                "Superseded by ADR-"
            ):
                errors.append(f"pull request cannot rewrite terminal ADR-{match.group(1)}")
    return changes, errors


def check_pull_request_adr_impact(
    root: Path,
    event_path: Path | None,
    changed_adrs: dict[str, str] | None = None,
) -> list[str]:
    if event_path is None or not event_path.is_file():
        return []
    try:
        payload = json.loads(event_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ["pull request ADR impact event is unreadable"]
    pull_request = payload.get("pull_request")
    if not isinstance(pull_request, dict):
        return []
    if changed_adrs is None:
        changed_adrs, change_errors = pull_request_adr_changes(root, pull_request)
        if change_errors:
            return change_errors
    body = pull_request.get("body")
    if not isinstance(body, str):
        return ["pull request ADR impact declaration is missing"]
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    impact = PR_ADR_IMPACT_RE.search(body)
    refs_match = PR_ADR_REFS_RE.search(body)
    if impact is None or refs_match is None:
        return ["pull request ADR impact declaration is missing or invalid"]
    refs_text = refs_match.group(1).strip()
    refs = set(ADR_REFERENCE_RE.findall(refs_text))
    errors: list[str] = []
    deleted_numbers = {number for number, status in changed_adrs.items() if status == "D"}
    for number in sorted(deleted_numbers):
        errors.append(f"pull request cannot delete ADR-{number}; supersede it instead")
    if impact.group(1) == "none":
        if refs_text != "none":
            errors.append("pull request ADR refs must be none when impact is none")
        if changed_adrs:
            errors.append("pull request ADR impact none cannot include ADR file changes")
        return errors
    if not refs:
        return ["pull request ADR refs require at least one ADR-NNNN"]
    records, _ = read_adr_files(root)
    for number in refs - records.keys():
        errors.append(f"pull request ADR refs unknown ADR-{number}")
    changed_numbers = set(changed_adrs)
    for number in changed_numbers - refs:
        errors.append(f"pull request changed ADR-{number} is missing from ADR refs")
    added_refs = {number for number in refs if changed_adrs.get(number) == "A"}
    modified_refs = {number for number in refs if changed_adrs.get(number) == "M"}
    superseded_modified_refs = {
        number
        for number in modified_refs & records.keys()
        if records[number][2].startswith("Superseded by ADR-")
    }
    if superseded_modified_refs and impact.group(1) != "supersede":
        errors.append("pull request must classify a Superseded ADR status change as supersede")
    if impact.group(1) == "new" and not added_refs:
        errors.append("pull request ADR impact new requires an added ADR reference")
    if impact.group(1) == "update" and not modified_refs:
        errors.append("pull request ADR impact update requires a modified ADR reference")
    if impact.group(1) == "update" and added_refs:
        errors.append("pull request ADR impact update cannot classify an added ADR")
    if impact.group(1) == "supersede":
        valid_edge = any(
            records[number][2].startswith("Superseded by ADR-")
            and records[number][2].removeprefix("Superseded by ADR-") in added_refs
            for number in modified_refs & records.keys()
        )
        if not valid_edge:
            errors.append("pull request ADR impact supersede requires a modified old ADR pointing to an added ADR")
    return errors


def run_guidance_public_scan(root: Path) -> list[str]:
    scanner = root / "scripts/public-release-check.sh"
    if not scanner.is_file():
        return ["public release scanner is missing"]
    with tempfile.TemporaryDirectory(prefix="readmates-guidance-scan-") as raw:
        staged = Path(raw)
        for relative in GUIDANCE_PATHS + PUBLIC_SCAN_SUPPORT_PATHS:
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
    errors.extend(check_agent_router_contracts(root))
    errors.extend(check_instruction_chains(root))
    errors.extend(check_normative_commands(root))
    errors.extend(check_pointer_contract(root))
    errors.extend(check_package_manager_contract(root))
    errors.extend(check_preflight_policy_references(root))
    errors.extend(check_preflight_authority_contract(root))
    errors.extend(check_ci_private_guidance_guard(root))
    errors.extend(check_public_guidance_manifest(root))
    errors.extend(check_release_docs(root))
    errors.extend(check_adr_registry(root))
    errors.extend(check_planning_adr_impact(root))
    errors.extend(check_technical_decisions_is_index_only(root))
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

    def initialize_git_fixture(self, root: Path) -> str:
        for command in (
            ["git", "init", "-q"],
            ["git", "config", "user.name", "ReadMates Test"],
            ["git", "config", "user.email", "test@example.com"],
            ["git", "add", "."],
            ["git", "commit", "-q", "-m", "fixture base"],
        ):
            subprocess.run(command, cwd=root, check=True)
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            text=True,
            stdout=subprocess.PIPE,
            check=True,
        ).stdout.strip()

    def commit_git_fixture(self, root: Path, message: str) -> None:
        subprocess.run(["git", "add", "-A"], cwd=root, check=True)
        subprocess.run(["git", "commit", "-q", "-m", message], cwd=root, check=True)

    def test_valid_fixture(self) -> None:
        self.assertEqual([], self.check_fixture())

    def test_unindexed_adr_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/adr/0003-unindexed.md",
                "# ADR-0003: Unindexed\n\n- 상태: Proposed\n- 결정일: 2026-01-02\n",
            )
        )
        self.assertTrue(any("ADR missing from index" in error for error in errors), errors)

    def test_adr_status_drift_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/adr/0001-fixture-decision.md",
                "# ADR-0001: Fixture decision\n\n- 상태: Proposed\n- 결정일: 2026-01-01\n",
            )
        )
        self.assertTrue(any("ADR status drift" in error for error in errors), errors)

    def test_duplicate_adr_number_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/adr/0001-duplicate.md",
                "# ADR-0001: Duplicate\n\n- 상태: Accepted\n- 결정일: 2026-01-01\n",
            )
        )
        self.assertTrue(any("duplicate ADR number" in error for error in errors), errors)

    def test_malformed_adr_filename_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/adr/ADR-0003-hidden.md",
                "# ADR-0003: Hidden\n\n- 상태: Proposed\n- 결정일: 2026-01-02\n",
            )
        )
        self.assertTrue(any("invalid ADR filename" in error for error in errors), errors)

    def test_adr_title_drift_fails(self) -> None:
        def mutate(root: Path) -> None:
            path = root / "docs/development/technical-decisions.md"
            path.write_text(
                path.read_text(encoding="utf-8").replace("Fixture decision | Accepted", "Different title | Accepted"),
                encoding="utf-8",
            )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("ADR title drift" in error for error in errors), errors)

    def test_superseded_adr_requires_existing_target(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/adr/0001-fixture-decision.md",
                "# ADR-0001: Fixture decision\n\n"
                "- 상태: Superseded by ADR-9999\n"
                "- 결정일: 2026-01-01\n",
            )
        )
        self.assertTrue(any("superseded ADR target missing" in error for error in errors), errors)

    def test_superseded_adr_rejects_self_target(self) -> None:
        def mutate(root: Path) -> None:
            adr = root / "docs/development/adr/0001-fixture-decision.md"
            adr.write_text(
                adr.read_text(encoding="utf-8").replace("- 상태: Accepted", "- 상태: Superseded by ADR-0001"),
                encoding="utf-8",
            )
            for relative in ("docs/development/adr/README.md", "docs/development/technical-decisions.md"):
                path = root / relative
                path.write_text(
                    path.read_text(encoding="utf-8").replace(
                        "Fixture decision | Accepted",
                        "Fixture decision | Superseded by ADR-0001",
                    ),
                    encoding="utf-8",
                )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("target must be newer" in error for error in errors), errors)

    def test_new_spec_requires_adr_impact(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/superpowers/specs/2026-08-23-missing-impact-design.md",
                "# Missing ADR impact\n",
            )
        )
        self.assertTrue(any("ADR impact missing" in error for error in errors), errors)

    def test_non_none_spec_impact_requires_existing_adr_reference(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/superpowers/specs/2026-08-23-unbound-impact-design.md",
                "# Unbound impact\n\nADR impact: new\n",
            )
        )
        self.assertTrue(any("ADR impact references missing" in error for error in errors), errors)

    def test_new_spec_rejects_old_unrelated_adr_reference(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/superpowers/specs/2026-08-23-unrelated-impact-design.md",
                "# Unrelated impact\n\nADR impact: new — ADR-0001\n",
            )
        )
        self.assertTrue(any("requires an ADR decided on 2026-08-23" in error for error in errors), errors)

    def test_technical_decisions_rejects_parallel_prose_registry(self) -> None:
        def mutate(root: Path) -> None:
            path = root / "docs/development/technical-decisions.md"
            path.write_text(
                path.read_text(encoding="utf-8")
                + "\n## Durable decision outside ADR\n\nDo this forever.\n",
                encoding="utf-8",
            )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("parallel decision registry" in error for error in errors), errors)

    def test_technical_decisions_rejects_headingless_parallel_prose(self) -> None:
        def mutate(root: Path) -> None:
            path = root / "docs/development/technical-decisions.md"
            path.write_text(
                path.read_text(encoding="utf-8") + "\n- Durable decision outside ADR.\n",
                encoding="utf-8",
            )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("parallel decision registry" in error for error in errors), errors)

    def test_technical_decisions_rejects_replaced_pointer_prose(self) -> None:
        def mutate(root: Path) -> None:
            path = root / "docs/development/technical-decisions.md"
            path.write_text(
                path.read_text(encoding="utf-8").replace(
                    TECHNICAL_DECISIONS_INTRO,
                    "This permanent decision bypasses ADR review.",
                ),
                encoding="utf-8",
            )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("parallel decision registry" in error for error in errors), errors)

    def test_technical_decisions_rejects_non_adr_table_row(self) -> None:
        def mutate(root: Path) -> None:
            path = root / "docs/development/technical-decisions.md"
            path.write_text(
                path.read_text(encoding="utf-8").replace(
                    f"\n{TECHNICAL_DECISIONS_FOOTER}",
                    f"\n| Permanent rule | Do this forever | Accepted |\n\n{TECHNICAL_DECISIONS_FOOTER}",
                ),
                encoding="utf-8",
            )

        errors = self.check_fixture(mutate)
        self.assertTrue(any("parallel decision registry" in error for error in errors), errors)

    def test_pull_request_requires_adr_impact_declaration(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(json.dumps({"pull_request": {"body": "No declaration"}}), encoding="utf-8")
            errors = check_pull_request_adr_impact(root, event, {})
            self.assertTrue(any("ADR impact declaration" in error for error in errors), errors)

    def test_pull_request_non_none_impact_requires_known_adr(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: new\nADR refs: none"}}),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event, {})
            self.assertTrue(any("require at least one" in error for error in errors), errors)

    def test_pull_request_accepts_known_adr_reference(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: update\nADR refs: ADR-0001"}}),
                encoding="utf-8",
            )
            self.assertEqual([], check_pull_request_adr_impact(root, event, {"0001": "M"}))

    def test_pull_request_none_rejects_changed_adr(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: none\nADR refs: none"}}),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event, {"0001": "M"})
            self.assertTrue(any("cannot include ADR file changes" in error for error in errors), errors)

    def test_pull_request_update_rejects_added_adr(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: update\nADR refs: ADR-0001"}}),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event, {"0001": "A"})
            self.assertTrue(any("cannot classify an added ADR" in error for error in errors), errors)

    def test_pull_request_new_rejects_unchanged_adr_reference(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: new\nADR refs: ADR-0001"}}),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event, {"0001": "M"})
            self.assertTrue(any("requires an added ADR" in error for error in errors), errors)

    def test_pull_request_new_accepts_added_adr_reference(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps({"pull_request": {"body": "ADR impact: new\nADR refs: ADR-0001"}}),
                encoding="utf-8",
            )
            self.assertEqual([], check_pull_request_adr_impact(root, event, {"0001": "A"}))

    def test_pull_request_supersede_accepts_old_to_new_edge(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            old = root / "docs/development/adr/0001-fixture-decision.md"
            old.write_text(
                old.read_text(encoding="utf-8").replace(
                    "- 상태: Accepted",
                    "- 상태: Superseded by ADR-0002",
                ),
                encoding="utf-8",
            )
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: supersede\nADR refs: ADR-0001, ADR-0002"
                        }
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                [],
                check_pull_request_adr_impact(root, event, {"0001": "M", "0002": "A"}),
            )

    def test_pull_request_supersede_rejects_missing_old_to_new_edge(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: supersede\nADR refs: ADR-0001, ADR-0002"
                        }
                    }
                ),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event, {"0001": "M", "0002": "A"})
            self.assertTrue(any("modified old ADR pointing" in error for error in errors), errors)

    def test_pull_request_rejects_accepted_adr_body_rewrite(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-history-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            base_sha = self.initialize_git_fixture(root)
            adr = root / "docs/development/adr/0001-fixture-decision.md"
            adr.write_text(
                adr.read_text(encoding="utf-8").replace(
                    "## 결정\nFixture.",
                    "## 결정\nOpposite policy.",
                ),
                encoding="utf-8",
            )
            self.commit_git_fixture(root, "rewrite accepted ADR")
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: update\nADR refs: ADR-0001",
                            "base": {"sha": base_sha},
                        }
                    }
                ),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event)
            self.assertTrue(any("cannot rewrite Accepted ADR-0001" in error for error in errors), errors)

    def test_pull_request_rejects_adr_rename_and_renumber(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-history-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            base_sha = self.initialize_git_fixture(root)
            old = root / "docs/development/adr/0001-fixture-decision.md"
            new = root / "docs/development/adr/0003-renumbered-decision.md"
            old.rename(new)
            new.write_text(
                new.read_text(encoding="utf-8").replace("ADR-0001", "ADR-0003"),
                encoding="utf-8",
            )
            self.commit_git_fixture(root, "renumber ADR")
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: update\nADR refs: ADR-0003",
                            "base": {"sha": base_sha},
                        }
                    }
                ),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event)
            self.assertTrue(any("cannot rename ADR-0001" in error for error in errors), errors)

    def test_pull_request_classifies_non_adr_to_adr_rename_as_added(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-history-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            write(
                root,
                "docs/development/adr/template.md",
                "# ADR-0003: Fresh decision\n\n"
                "- 상태: Proposed\n"
                "- 결정일: 2026-01-02\n"
                "- 작성자: Test\n\n"
                "## 결정\nFresh.\n",
            )
            base_sha = self.initialize_git_fixture(root)
            (root / "docs/development/adr/template.md").rename(
                root / "docs/development/adr/0003-fresh-decision.md"
            )
            self.commit_git_fixture(root, "rename template into ADR")
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: none\nADR refs: none",
                            "base": {"sha": base_sha},
                        }
                    }
                ),
                encoding="utf-8",
            )
            errors = check_pull_request_adr_impact(root, event)
            self.assertTrue(any("none cannot include ADR file changes" in error for error in errors), errors)

    def test_pull_request_accepts_status_only_supersede_of_accepted_adr(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-pr-history-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            base_sha = self.initialize_git_fixture(root)
            old = root / "docs/development/adr/0001-fixture-decision.md"
            old.write_text(
                old.read_text(encoding="utf-8").replace(
                    "- 상태: Accepted",
                    "- 상태: Superseded by ADR-0003",
                ),
                encoding="utf-8",
            )
            write(
                root,
                "docs/development/adr/0003-replacement-decision.md",
                "# ADR-0003: Replacement decision\n\n"
                "- 상태: Proposed\n"
                "- 결정일: 2026-01-02\n"
                "- 작성자: Test\n\n"
                "## 결정\nReplacement.\n",
            )
            self.commit_git_fixture(root, "supersede ADR")
            event = root / "event.json"
            event.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "body": "ADR impact: supersede\nADR refs: ADR-0001, ADR-0003",
                            "base": {"sha": base_sha},
                        }
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual([], check_pull_request_adr_impact(root, event))

    def test_guidance_public_scan_stages_release_contract_support_files(self) -> None:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-public-scan-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            required_support = (
                ".env.example",
                ".github/workflows/sync-config.yml",
                "ops/tempo/tempo.yml",
                "ops/observability/local/compose.yml",
                "deploy/oci/compose.yml",
                "deploy/oci/compose.infra.yml",
                "ops/observability/local/grafana/provisioning/datasources/tempo.yml",
                "deploy/oci/grafana/provisioning/datasources/tempo.yml",
                "server/src/main/resources/application.yml",
                "scripts/validate-production-ai-config.sh",
                "scripts/sync-config/import-from-prod-env.sh",
            )
            required_guidance = (
                "server/AGENTS.md",
                "front/functions/AGENTS.md",
                "scripts/AGENTS.md",
                "deploy/AGENTS.md",
                "docs/agents/execution.md",
                "docs/development/acceptance-matrix.md",
                "scripts/agent-preflight.py",
            )
            for relative in required_support:
                write(root, relative, "fixture\n")

            scanner = root / "scripts/public-release-check.sh"
            scanner.write_text(
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "staged=$1\n"
                + "".join(
                    f'test -f \"$staged/{relative}\"\n'
                    for relative in required_support + required_guidance
                ),
                encoding="utf-8",
            )
            scanner.chmod(0o755)

            self.assertEqual([], run_guidance_public_scan(root))

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
                "```bash\nnpx --yes pnpm@11.13.1 --dir front build\n```\n",
            )
        )
        self.assertTrue(any("direct pnpm" in error for error in errors), errors)

    def test_missing_local_router_reference_fails(self) -> None:
        errors = self.check_fixture(lambda root: write(root, "server/AGENTS.md", "../AGENTS.md\n"))
        self.assertTrue(any("local router reference missing" in error for error in errors), errors)

    def test_oversized_front_functions_chain_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "front/functions/AGENTS.md",
                "\n".join(LOCAL_ROUTER_CONTRACTS["front/functions/AGENTS.md"])
                + "\n"
                + "x" * INSTRUCTION_LIMIT,
            )
        )
        self.assertTrue(any("instruction chain front/functions" in error for error in errors), errors)

    def test_package_manager_version_drift_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "AGENTS.md", f"{CANONICAL_SERVER_COMMAND}\npnpm@10.0.0\n")
        )
        self.assertTrue(any("package manager drift" in error for error in errors), errors)

    def test_unmapped_agent_router_fails(self) -> None:
        errors = self.check_fixture(lambda root: write(root, "ops/AGENTS.md", "# Unexpected\n"))
        self.assertTrue(any("unsupported AGENTS.md" in error for error in errors), errors)

    def test_missing_preflight_policy_reference_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "scripts/agent-preflight.py", "docs/agents/execution.md\n")
        )
        self.assertTrue(any("preflight policy reference missing" in error for error in errors), errors)

    def test_missing_authority_preflight_contract_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "scripts/agent-preflight.py",
                "docs/agents/execution.md\n"
                "docs/development/acceptance-matrix.md\n"
                "./scripts/server-ci-check.sh\n"
                "pnpm --dir front test:e2e\n"
                "./scripts/public-release-check.sh .tmp/public-release-candidate\n",
            )
        )
        self.assertTrue(any("preflight authority contract" in error for error in errors), errors)

    def test_unconditional_private_guidance_workflow_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                ".github/workflows/ci.yml",
                "run: python3 -B scripts/check-agent-guidance.py --self-test\n",
            )
        )
        self.assertTrue(any("private guidance source guard" in error for error in errors), errors)

    def test_partial_private_guidance_guard_fails_closed(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                ".github/workflows/ci.yml",
                "AGENTS.md scripts/check-agent-guidance.py scripts/agent-preflight.py\n"
                "python3 -B scripts/check-agent-guidance.py --self-test\n"
                "python3 -B scripts/agent-preflight.py --self-test\n"
                "python3 -B scripts/check-agent-guidance.py\n",
            )
        )
        self.assertTrue(any("private guidance source guard" in error for error in errors), errors)

    def test_public_guidance_manifest_rejects_contributor_files(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "scripts/build-public-release-candidate.sh",
                'copy_required_file "docs/agents/execution.md"\n',
            )
        )
        self.assertTrue(
            any("must omit contributor-only file" in error for error in errors),
            errors,
        )

    def test_public_guidance_manifest_rejects_directory_copy(self) -> None:
        errors = self.check_fixture(
            lambda root: (root / "scripts/build-public-release-candidate.sh").write_text(
                (root / "scripts/build-public-release-candidate.sh").read_text(encoding="utf-8")
                + 'copy_dir "docs/agents"\n',
                encoding="utf-8",
            )
        )
        self.assertTrue(any("public guidance manifest" in error for error in errors), errors)

    def test_oversized_instruction_chain_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "AGENTS.md", "x" * (INSTRUCTION_LIMIT + 1))
        )
        self.assertTrue(any("instruction chain" in error for error in errors), errors)

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
    event_value = os.environ.get("GITHUB_EVENT_PATH")
    errors.extend(check_pull_request_adr_impact(root, Path(event_value) if event_value else None))
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("ReadMates agent guidance check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
