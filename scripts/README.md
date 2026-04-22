# Release Helper Scripts

These scripts build and verify a clean public release candidate from the private ReadMates working tree. They do not publish to GitHub, change repository visibility, rotate secrets, or create commits.

## `build-public-release-candidate.sh`

Run from anywhere inside this repository:

```bash
./scripts/build-public-release-candidate.sh
```

The destination is fixed at `.tmp/public-release-candidate`; custom destinations are intentionally unsupported. The script first verifies that `.tmp` resolves to the repository-local `.tmp`, then builds into a unique `.tmp/public-release-candidate.staging.*` directory. The final candidate is replaced only after the staging tree passes verification, so a failed build leaves any previous successful candidate in place.

The manifest is explicit. The script copies only:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitleaks.toml` when present
- `.env.example`
- `README.md`
- `compose.yml`
- `front/`
- `server/`
- `deploy/oci/`
- `docs/deploy/`
- release helper files under `scripts/`

Directory copies exclude private and generated files, including `.env*`, `*.env`, key material, dumps, and the plan-scoped generated paths such as `front/output`, `front/node_modules`, `front/dist`, `server/build`, `server/.gradle`, and `server/.kotlin`.

The root `.env.example` file is the only environment file intentionally included. Required files and directory roots must not be symlinks, and the script rejects symlinks found inside approved source roots before copying. It also fails the verified staging candidate if any symlink or forbidden path remains, including provider state, key material, dumps, screenshots, private planning directories, `design`, `.gstack`, `.superpowers`, `.idea`, `.playwright-cli`, `.tmp`, or `recode`.

On success, the script prints the candidate path and follow-up verification commands. The candidate includes the root `.gitleaks.toml` config when present, so the same custom scanner rules are available before publishing.

## `public-release-check.sh`

Run the release check against the clean public candidate:

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Run it without an argument to scan the current private working tree:

```bash
./scripts/public-release-check.sh
```

Current-tree mode uses `git ls-files` for forbidden tracked path and tracked symlink checks. Candidate mode uses `find` against the supplied directory, including `.tmp/public-release-candidate`, and rejects any symlink it finds.

The script runs targeted path and content checks for private keys, OCI OCIDs, GitHub tokens, OpenAI/API-key-shaped tokens, real-looking DB/BFF/OAuth secret assignments, Gmail addresses, private club domain references, and local workstation paths. If `gitleaks` is installed, it also runs `gitleaks dir <path>` with the repository `.gitleaks.toml`. If an older installed `gitleaks` binary does not support `dir`, the script falls back to `gitleaks detect --source <path>` for compatibility and prints that downgrade explicitly. If `gitleaks` is missing, the script prints a fallback notice and still runs the targeted checks.

The fallback checks are intentionally narrow. Passing them is not the same as passing a professional or complete secret scan; they are a local guardrail for catching obvious mistakes before publishing.

Run the fixture check after changing scanner patterns:

```bash
./scripts/verify-public-release-fixtures.sh
```

It verifies that dollar-containing DB password assignments are rejected, comment text cannot allowlist a real matched secret value, and documented placeholders/env indirections still pass. It also refuses to run when the repository-local `.tmp` parent is a symlink, matching the release-candidate builder's cleanup guard.
