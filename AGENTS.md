# ReadMates Agent Router

ReadMates is an invite-only reading-club app: React/Vite frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot API, MySQL/Flyway.

Successful work keeps the touched feature inside the existing architecture, protects public-repo safety, and verifies the smallest surface that could have regressed.

## Route The Task

Before editing, check `git status --short --branch`, identify the touched surface, and read the matching guide. If a task crosses surfaces, read each matching guide before changing that surface:

- Frontend route, state, API client, or tests: `docs/agents/front.md`
- Cloudflare Pages Functions BFF or OAuth proxy code under `front/functions`: `docs/agents/front.md`; also read `docs/agents/server.md` when the change affects Spring auth, API contracts, trusted headers, or authorization behavior.
- Server API, auth, persistence, or migration work: `docs/agents/server.md`
- UI, layout, copy, or visual polish: `docs/agents/design.md` (with `docs/agents/front.md` for code under `front/`)
- README, project docs, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md` plus the surface guide the docs describe
- Deploy, CI, public-release, or scanner behavior: `docs/agents/docs.md`, then verify the referenced scripts/workflows directly.

Always read `docs/agents/execution.md` for the shared analyze/diagnose/change/release/local-runtime contract. Package-local guides add to this router and are not always auto-loaded, so read the matching one when working in `front/` (`front/AGENTS.md`), `front/functions/` (`front/functions/AGENTS.md`), `server/` (`server/AGENTS.md`), `scripts/` (`scripts/AGENTS.md`), or `deploy/` (`deploy/AGENTS.md`).

Navigation aids, not sources of truth: `python3 scripts/agent-preflight.py` classifies current or expected paths, `docs/development/acceptance-matrix.md` selects risk evidence, and `docs/development/project-map.md` orients architecture questions and impact analysis. Current code, tests, migrations, scripts, and `docs/development/architecture.md` win when they disagree; follow the architecture doc when boundaries are unclear, and keep changes scoped to the touched feature.

## Decisions (ADR)

Before spec, implementation-plan, or direct implementation work, read the accepted/proposed decisions in `docs/development/adr/README.md` and record the ADR impact as `none`, `update`, `new`, or `supersede`. For spec or implementation-plan work, also read `docs/development/project-map.md` and `docs/development/vertical-slice-checklist.md` before handing tasks to any executor.

A durable product, technical, design, or operational decision that will constrain future work needs one focused ADR in `Proposed` before implementation, regardless of how many surfaces it touches; move it to `Accepted` only after code, tests, and active architecture agree. Routine implementation detail does not need an ADR. Never silently rewrite an accepted decision; supersede it with a new ADR and keep both indexed.

## Keep Going Or Stop

Complete authorized work using repository evidence and session context for routine decisions. Do not request approval again for the same scope. When a step does not need the user, keep going: put status notes in the same message as the next action instead of ending a turn with a summary that only announces the next step, an offer to wait, or a list of non-blocking decisions.

Stop and ask before the affected action only when:

- private-data access, destructive git, commit/push/PR/tag, deployment, secret rotation, or production data mutation lacks explicit authority;
- the request conflicts with the architecture source of truth; or
- missing information prevents choosing a safe surface.

Complete independent authorized preparation first. If a relevant check cannot run, do not claim it passed; report the skipped command and reason.

## Public Repo Safety

Do not add real member data, secrets, deployment state, local absolute paths, private domains, OCIDs, or token-shaped examples. You may inspect local env or generated files when needed, but do not quote or persist their private values in docs, tests, commits, or final responses.

## Release And Residual Risk

When asked about remaining risk, release readiness, or whether a branch is safe after merge, review the whole branch against its base (usually `origin/main..HEAD`), not only the latest plan, unless the user explicitly narrows it. Use `docs/development/release-readiness-review.md` for CHANGELOG/Unreleased, CI/deploy scripts, operator-facing behavior changes, security-code hygiene, architecture-test baselines/exceptions, and public-release safety. Passing tests are evidence, not proof that no operational or release risk remains.

Release tags in `vMAJOR.MINOR.PATCH` format remain the authoritative product version; do not introduce a new `VERSION` file.

## Checks

Run the smallest relevant checks before finishing:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server PR-level: `./scripts/server-ci-check.sh` (Gradle `check`: ktlint, detekt, `unitTest`, `architectureTest`, JaCoCo; the default `test` task is disabled)
- Server full Testcontainers: `./server/gradlew -p server integrationTest`
- End-to-end or auth/BFF changes: `pnpm --dir front test:e2e`
- Public release checks: `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`
- Docs-only: `git diff --check -- <changed-docs>` plus targeted link/safety scans; agent guidance also runs `python3 -B scripts/check-agent-guidance.py`.

The pinned package manager is the root `package.json` `packageManager` value (`pnpm@11.13.1` in the current tree). When local `pnpm` differs, a lockfile/install/build check is involved, or CI parity matters, run through Corepack, such as `corepack pnpm --dir front ...` or `npx --yes corepack@0.35.0 pnpm --dir front ...` when `corepack` is not on PATH, and report the exact command. Use `npx --yes pnpm@11.13.1 ...` only as an explicit fallback when Corepack itself is unavailable and call that out.

## Final Response

Keep it concise and in this order: changed surface, checks actually run (exact commands), and remaining risk or skipped validation with reasons.
