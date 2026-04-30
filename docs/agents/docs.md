# Documentation Agent Guide

Read this for README, project documentation, deployment notes, script documentation, and agent instruction updates.

Successful documentation changes make the current source of truth easier to follow without adding private data, stale claims, or broad rewrites outside the requested surface.

Current source-of-truth order:

- `README.md`: portfolio-facing overview, concise product and architecture summary, and links to detailed docs.
- `docs/development/`: local setup, testing, architecture, and contributor-facing technical guidance.
- `docs/deploy/`: public-safe deployment runbooks and release-safety policy.
- `scripts/README.md`: public release helper behavior and scanner expectations.
- `AGENTS.md`, `front/AGENTS.md`, `docs/agents/*.md`: agent routing and task-specific editing rules.
- `docs/superpowers/`: historical design and implementation records. Do not treat these as current behavior unless the user explicitly asks to update historical planning notes.

Documentation rules:

- Cross-check factual claims against current code, config, tests, and scripts before editing.
- Keep public-facing docs free of real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, and token-shaped examples.
- Use placeholders such as `https://api.example.com`, `<db-password>`, and `host@example.com`.
- Preserve the Korean-first documentation style in current docs.
- Prefer small factual patches over broad rewrites unless the user asks for a rewrite.
- If docs describe frontend, server, or UI rules in detail, read the matching surface guide before changing those claims.
- For unstable external facts such as product limits, pricing, APIs, laws, or platform behavior, verify against current official sources or clearly state that the fact was not revalidated.

Stop rules:

- Ask before editing if the user asks to publish private deployment details, real member data, secrets, OCIDs, token-like examples, or local absolute paths.
- Ask or narrow scope when the requested doc update conflicts with current code, scripts, or `docs/development/architecture.md`.
- Do not update historical `docs/superpowers/` planning notes unless the user explicitly asks for historical records to change.

Checks:

```bash
git diff --check -- <changed-docs>
```

For deploy, public repository, release-candidate, or scanner documentation, also run targeted link and public-safety scans over the changed docs. When building a clean public release candidate, run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

The private working tree may intentionally contain tracked historical planning notes under `docs/superpowers`; do not treat current-tree public-release scanner findings from that historical directory as a docs update regression unless the changed files introduced them.

Done when changed docs match current source files or explicitly note uncertainty, public-safety constraints are preserved, `git diff --check -- <changed-docs>` has run or is reported as skipped, and the final response names any targeted safety or link scans performed.
