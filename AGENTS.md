# ReadMates Agent Router

ReadMates is an invite-only reading-club app: React/Vite frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot API, MySQL/Flyway.

Before editing, open only the guide that matches the task:

- Frontend route, state, API client, or tests: `docs/agents/front.md`
- Server API, auth, persistence, or migration work: `docs/agents/server.md`
- UI, layout, copy, or visual polish: `docs/agents/design.md`

Keep changes scoped to the touched feature and follow `docs/development/architecture.md` when boundaries are unclear.

Public repo safety matters: do not add real member data, secrets, deployment state, local paths, private domains, OCIDs, or token-shaped examples.

Run the smallest relevant checks before finishing:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server: `./server/gradlew -p server clean test`
- End-to-end or auth/BFF changes: `pnpm --dir front test:e2e`
- Public release checks: `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`
