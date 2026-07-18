# ReadMates Scripts

This guide adds to `../AGENTS.md`. Before editing scripts, read `../docs/agents/execution.md`, `../docs/agents/docs.md`, and `README.md`.

Preserve public-release safety, fail closed on scanner errors, keep temporary output under ignored paths, and do not duplicate secret-pattern engines when an existing scanner owns the contract.

Run focused script fixtures or syntax checks first. Release-sensitive changes also require `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` from the repository root.
