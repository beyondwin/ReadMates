# ReadMates Server

This guide adds to `../AGENTS.md`. Before editing server code, read `../docs/agents/execution.md` and `../docs/agents/server.md`.

Use `../docs/development/acceptance-matrix.md` when authorization, club context, lifecycle, visibility, persistence, async delivery, cache, or provider behavior changes.

Do not add production migrations outside `src/main/resources/db/mysql/migration`, expose private data, or treat repository configuration as live-runtime evidence.

The PR-level server gate is `./scripts/server-ci-check.sh`; add `./server/gradlew -p server integrationTest` when MySQL, Flyway, API contract, query budget, or Testcontainers evidence is required. Report skipped checks exactly.
