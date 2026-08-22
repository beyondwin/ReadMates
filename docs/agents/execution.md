# ReadMates Agent Execution Guide

Read this for rules that apply across frontend, BFF, server, scripts, deploy, and documentation work. Surface guides add architecture-specific constraints.

## Request Types

- **Analyze or explain:** inspect read-only evidence and distinguish repository claims from live-runtime confirmation.
- **Diagnose:** identify root cause and impact; do not modify product files unless the request also asks for a fix.
- **Change or build:** implement the requested scope, run focused checks first, and expand to PR-level evidence when the touched surface requires it.
- **Release or readiness review:** inspect the whole branch diff against its real base and use `docs/development/release-readiness-review.md`.
- **Local runtime:** preserve existing processes, worktrees, containers, ports, and caches; isolate the requested service before starting it.

## Before Editing

- Run `git status --short --branch --untracked-files=all` and inspect staged, unstaged, and untracked paths.
- Name the expected edit surface and required guides before changing files.
- Stop before editing when existing user changes overlap the expected files.
- Treat current code, tests, migrations, scripts, and architecture as current truth; historical plans, reports, ignored tool state, and generated output are context only.
- Read `docs/development/adr/README.md` before spec, implementation-plan, or direct implementation work. Record the impact as `none`, `update`, `new`, or `supersede` before implementation. Surface count is irrelevant: a durable product contract, architecture boundary, data/lifecycle meaning, security/reliability policy, reusable design-system rule, or operational policy belongs in an ADR even when it changes only one surface.

## Decision Record Lifecycle

- Use one ADR for one durable decision. Routine refactors, component-local choices, and reversible implementation details stay in code/tests or the implementation plan.
- Create a `Proposed` ADR after the design decision is approved and before an implementation plan treats it as fixed.
- An executor must cite the relevant ADR in the plan/task and verify that the implementation does not contradict another accepted ADR.
- Move `Proposed` to `Accepted` only when code, tests, `docs/development/architecture.md`, and any affected guide describe the same contract. A docs-only proposal is not accepted runtime behavior.
- If a decision changes, add a new ADR, mark the old one `Superseded by ADR-NNNN`, and update both ADR indexes. Do not erase the old context.
- At handoff, report ADR impact and any ADR still `Proposed`; those are implementation obligations, not evidence of completion.

## Implementation And Artifacts

- For behavior changes, add a failing test or characterization evidence before the implementation. Do not force TDD onto docs-only or non-behavior configuration edits.
- Keep tracked contract fixtures intentional. Do not commit build output, coverage, screenshots, reports, caches, `.tmp`, or `.codex-orchestrator` state unless a repository contract explicitly tracks that artifact.
- Do not terminate or reconfigure an existing local service to free a port. Use an alternate port, isolated checkout, cache, or container project.

## Authority Boundary

- Read-only inspection and requested repository edits are in scope.
- Commit, push, PR, tag, deploy, secret rotation, and production data mutation require explicit request scope and the repository release contract.
- Never present repository configuration as proof that production is currently running that configuration.

## Verification And Handoff

- Run the smallest focused check first, then the canonical surface gate selected by `AGENTS.md` and `docs/development/acceptance-matrix.md`.
- Report exact commands, automated evidence, manual evidence, skipped validation with reasons, and residual risk.
- State whether evidence is repository-only, local-runtime, or live production evidence.
- Confirm that ADR status and indexes match the delivered state; do not leave an implemented decision `Proposed` or an unimplemented decision `Accepted`.
