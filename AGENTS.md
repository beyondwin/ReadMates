# ReadMates Agent Router

ReadMates is an invite-only reading-club app: React/Vite frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot API, MySQL/Flyway.

Successful work keeps the touched feature inside the existing architecture, protects public-repo safety, and verifies the smallest surface that could have regressed.

Before editing, check `git status --short --branch`, identify the touched surface, and choose the primary guide for the task. If a task crosses surfaces, read each matching guide before changing that surface:

- Frontend route, state, API client, or tests: `docs/agents/front.md`
- Cloudflare Pages Functions BFF or OAuth proxy code under `front/functions`: `docs/agents/front.md`; also read `docs/agents/server.md` when the change affects Spring auth, API contracts, trusted headers, or authorization behavior.
- Server API, auth, persistence, or migration work: `docs/agents/server.md`
- UI, layout, copy, or visual polish: `docs/agents/design.md`
- README, project docs, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md`

Mixed-surface examples:

- UI implementation under `front/`: read `docs/agents/front.md` and `docs/agents/design.md`.
- API contract or auth flow touching frontend and server: read `docs/agents/front.md` and `docs/agents/server.md`.
- Documentation that describes frontend, server, or UI behavior: read `docs/agents/docs.md` plus the relevant surface guide.
- Deploy, CI, public-release, or scanner behavior: read `docs/agents/docs.md`, then verify the referenced scripts/workflows directly.

Package-local instructions add to this router. When working inside `front/`, read `front/AGENTS.md` as well; it does not replace the root guide.

Keep changes scoped to the touched feature and follow `docs/development/architecture.md` when boundaries are unclear.

For architecture questions, impact analysis, or first-pass orientation across multiple surfaces, use `docs/development/project-map.md` as a navigation aid, then verify against the current code, tests, migrations, scripts, and `docs/development/architecture.md`.

For spec or implementation-plan work, read `docs/development/project-map.md` and `docs/development/vertical-slice-checklist.md` before handing tasks to any executor.

Public repo safety matters: do not add real member data, secrets, deployment state, local absolute paths, private domains, OCIDs, or token-shaped examples. You may inspect local env or generated files when needed, but do not quote or persist their private values in docs, tests, commits, or final responses.

Ask before editing when the request needs private data, conflicts with the architecture source of truth, requires destructive git or deployment operations, or is too underspecified to choose a safe surface. If a relevant check cannot run, do not claim it passed; report the skipped command and reason.

Residual risk and release readiness reviews: when asked to check remaining risk, release readiness, or whether a branch is safe after merge, do not limit the review to the latest implementation plan unless the user explicitly says so. Review the current branch against its base, usually `origin/main..HEAD`, and use `docs/development/release-readiness-review.md` to check CHANGELOG/Unreleased, CI/deploy scripts, operator-facing behavior changes, security-code hygiene, architecture-test baselines/exceptions, and public-release safety. Passing tests is evidence, not proof that no operational or release risk remains.

Release tags in `vMAJOR.MINOR.PATCH` format remain the authoritative product version; do not introduce a new `VERSION` file.

Run the smallest relevant checks before finishing:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server PR-level: `./scripts/server-ci-check.sh`
- Server full Testcontainers: `./server/gradlew -p server integrationTest`
- End-to-end or auth/BFF changes: `pnpm --dir front test:e2e`
- Public release checks: `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`
- Docs-only: `git diff --check -- <changed-docs>` plus targeted link/safety scans. For public release work, run the public release candidate checks above.

The pinned package manager is the root `package.json` `packageManager` value (`pnpm@11.13.1` in the current tree). If local `pnpm` behavior differs, a lockfile/install/build check is involved, or CI parity matters, activate the repo-defined package manager through Corepack and run the frontend command through the resolved Corepack launcher, such as `corepack pnpm --dir front ...` or `npx --yes corepack@0.35.0 pnpm --dir front ...` when `corepack` is not on PATH. Report the exact command. Use `npx --yes pnpm@11.13.1 ...` only as an explicit fallback when Corepack itself is unavailable and call that out.

Final responses should name the changed surface, list the checks actually run, and call out any remaining risk or skipped validation.
