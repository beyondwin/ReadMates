# ReadMates Agent Router

ReadMates is an invite-only reading-club app: React/Vite frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot API, MySQL/Flyway.

Successful work keeps the touched feature inside the existing architecture, protects public-repo safety, and verifies the smallest surface that could have regressed.

Before editing, choose the primary guide for the task. If a task crosses surfaces, read each matching guide before changing that surface:

- Frontend route, state, API client, or tests: `docs/agents/front.md`
- Server API, auth, persistence, or migration work: `docs/agents/server.md`
- UI, layout, copy, or visual polish: `docs/agents/design.md`
- README, project docs, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md`

Mixed-surface examples:

- UI implementation under `front/`: read `docs/agents/front.md` and `docs/agents/design.md`.
- API contract or auth flow touching frontend and server: read `docs/agents/front.md` and `docs/agents/server.md`.
- Documentation that describes frontend, server, or UI behavior: read `docs/agents/docs.md` plus the relevant surface guide.

Keep changes scoped to the touched feature and follow `docs/development/architecture.md` when boundaries are unclear.

Public repo safety matters: do not add real member data, secrets, deployment state, local paths, private domains, OCIDs, or token-shaped examples.

Ask before editing when the request needs private data, conflicts with the architecture source of truth, requires destructive git or deployment operations, or is too underspecified to choose a safe surface. If a relevant check cannot run, do not claim it passed; report the skipped command and reason.

Run the smallest relevant checks before finishing:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server: `./server/gradlew -p server clean test`
- End-to-end or auth/BFF changes: `pnpm --dir front test:e2e`
- Public release checks: `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`
- Docs-only: `git diff --check -- <changed-docs>` plus targeted link/safety scans. For public release work, run the public release candidate checks above.

Final responses should name the changed surface, list the checks actually run, and call out any remaining risk or skipped validation.
