# ReadMates Public Repository Readiness Implementation Plan

작성일: 2026-04-22
기준 설계 문서: `docs/superpowers/specs/2026-04-22-readmates-public-repo-readiness-design.md`

> Implement this plan in small, verifiable slices. Do not make the GitHub repository public, create a public repository, rotate production secrets, or push release artifacts without an explicit operator action.

## Goal

Create a clean, portfolio-ready public release candidate for ReadMates that does not expose secrets, private deployment state, real member identity data, generated local artifacts, or unnecessary private planning history.

Primary outcomes:

1. The private working repository remains the source of truth.
2. A clean public candidate can be generated from reviewed files only.
3. Current tracked files are safer by removing tracked ignored artifacts and scrubbing public docs.
4. Public release checks are repeatable with documented commands and secret scanning configuration.
5. The final publish step is gated by explicit user approval.

## Scope Guardrails

- Do not change product behavior.
- Do not rotate production secrets inside code or scripts.
- Do not push to GitHub from this plan.
- Do not change repository visibility from private to public.
- Do not create a new public GitHub repository without a separate explicit publish approval.
- Do not delete local ignored working artifacts unless the user asks; remove them from Git tracking only when needed.
- Do not commit `.env.local`, `front/.env.local`, provider state, private keys, screenshots, database dumps, build output, or generated bundles.
- Do not keep live deployment URLs in public docs unless explicitly designated as a portfolio demo URL.

## Current Baseline To Capture Before Implementation

- [x] Run `git status --short --branch`.
  - Baseline at plan creation: `main...origin/main [ahead 1]` because the readiness design was committed locally.
- [x] Confirm local env files are ignored and not tracked.
  - `.env.local` and `front/.env.local` are ignored and not tracked.
- [x] Confirm obvious active secret patterns were not found during design discovery.
  - Targeted current-tree and history scans found placeholders/test secrets, not high-confidence active credentials.
- [x] Confirm `pnpm audit --prod` from `front/` was run during discovery.
  - Result: no known vulnerabilities found.

Before making implementation edits, re-run:

```bash
git status --short --branch
git ls-files .env.local front/.env.local .env front/.env deploy/oci/.deploy-state
```

Expected result: no local env or deploy-state files are tracked.

---

## Task 1 - Remove Tracked Ignored Artifacts From The Private Source Tree

Files:

- Modify Git index only: `design/**`
- Keep: `.gitignore`

Checklist:

- [x] Confirm `design/` is still ignored by `.gitignore`.
- [x] Remove tracked `design/` files from Git while preserving local copies:

```bash
git rm --cached -r design
```

- [x] Confirm `git ls-files design` returns no files.
- [x] Confirm `git status --ignored --short design` shows local design files as ignored, not deleted from disk.
- [x] Do not touch `output/`, `.playwright-cli/`, `.gstack/`, `.superpowers/`, `recode/`, build folders, or local env files unless they are unexpectedly tracked.

Verification notes, 2026-04-22:

- `git status --short --branch` before Task 1 changes returned:

```text
## main...origin/main
```

- `git ls-files .env.local front/.env.local .env front/.env deploy/oci/.deploy-state` returned no files.
- `rg -n '(^|/)design/?' .gitignore` and `git check-ignore -v --no-index design/standalone/mobile.html` confirmed `.gitignore:2:design/`.
- `git ls-files design` before removal returned:

```text
design/src/mobile/pages-archive-me.jsx
design/src/mobile/pages-home.jsx
design/src/mobile/pages-session.jsx
design/src/mobile/shell.jsx
design/standalone/mobile.html
design/styles/mobile.css
"design/\354\235\275\353\212\224\354\202\254\354\235\264 \353\252\250\353\260\224\354\235\274.html"
```

- `git rm --cached -r design` removed the same seven tracked files from the Git index and preserved the local working-tree copies.
- `git ls-files design` after removal returned no files.
- `git status --ignored --short design` after removal returned:

```text
D  design/src/mobile/pages-archive-me.jsx
D  design/src/mobile/pages-home.jsx
D  design/src/mobile/pages-session.jsx
D  design/src/mobile/shell.jsx
D  design/standalone/mobile.html
D  design/styles/mobile.css
D  "design/\354\235\275\353\212\224\354\202\254\354\235\264 \353\252\250\353\260\224\354\235\274.html"
!! design/
```

The `D` entries are the intended staged removals from Git tracking caused by `git rm --cached`; `!! design/` shows the local directory is ignored. `find design -type f` confirmed local design files remain on disk.

Expected result: generated design artifacts are no longer part of any future public export made from the current tree.

---

## Task 2 - Scrub Public-Facing Docs And Deployment Examples

Files:

- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/deploy/README.md`
- Modify: `docs/deploy/cloudflare-pages.md`
- Modify: `docs/deploy/cloudflare-pages-spa.md`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/oci-mysql-heatwave.md`
- Modify: `docs/deploy/security-public-repo.md`
- Modify: `deploy/oci/02-configure.sh`
- Modify: `deploy/oci/03-deploy.sh` only if it prints live-specific defaults

Checklist:

- [x] Keep the user-approved `https://readmates.pages.dev` portfolio demo URL in public README/docs and frontend app origin examples.
- [x] Use backend direct API placeholders such as `https://api.example.com` for Spring/API origins.
- [x] Remove the hardcoded `MYSQL_PRIVATE_IP:=10.0.2.217` default from `deploy/oci/02-configure.sh`; require `MYSQL_PRIVATE_IP` or a full `SPRING_DATASOURCE_URL` instead.
- [x] Keep all credential values as placeholders, not fake-looking long random values.
- [x] Remove or generalize local absolute paths such as `<local-workspace>/ReadMates` from public docs.
- [x] Ensure deploy docs say production secrets live outside Git.
- [x] Ensure docs do not imply GitHub Actions production deployment secrets are configured.
- [x] Ensure `docs/deploy/security-public-repo.md` matches the actual clean-public-release strategy.

Expected result: docs can be published without exposing live infrastructure details or local workstation paths.

Verification notes, 2026-04-22:

- Remediation update: the user explicitly approved `https://readmates.pages.dev` as a public portfolio demo/frontend Pages URL. Task 2 verification no longer treats that URL as a finding when it appears in README/docs or frontend app origin examples.
- Direct backend API/provider/account-specific examples remain placeholders, including `READMATES_API_BASE_URL=https://api.example.com` and `CADDY_SITE=api.example.com`.
- `deploy/oci/02-configure.sh` no longer has a hardcoded private IP default. It now requires either `SPRING_DATASOURCE_URL` or `MYSQL_PRIVATE_IP`.
- `.env.example` was unstaged during remediation without reverting its content because it had been staged accidentally.
- Checked `.gitignore`, `.github/workflows/deploy-front.yml`, and `deploy/cloudflare/`; none appeared in current `git status --short --untracked-files=all -- ...`, so there were no out-of-scope files to remove.

- `git status --short --branch` before Task 2 changes returned:

```text
## main...origin/main
D  design/src/mobile/pages-archive-me.jsx
D  design/src/mobile/pages-home.jsx
D  design/src/mobile/pages-session.jsx
D  design/src/mobile/shell.jsx
D  design/standalone/mobile.html
D  design/styles/mobile.css
D  "design/\354\235\275\353\212\224\354\202\254\354\235\264 \353\252\250\353\260\224\354\235\274.html"
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
```

- `git ls-files .env.local front/.env.local .env front/.env deploy/oci/.deploy-state` returned no files.
- `rg -n 'local absolute path|private IP literal|private ReadMates domain|GitHub Actions.*secret|github actions.*secret' README.md .env.example docs/deploy deploy/oci/02-configure.sh deploy/oci/03-deploy.sh || true` returned no matches during remediation.
- `rg -n 'readmates\.pages\.dev' README.md .env.example docs/deploy deploy/oci/02-configure.sh deploy/oci/03-deploy.sh || true` returned only approved frontend/demo URL references during remediation.
- `bash -n deploy/oci/02-configure.sh` returned no output and exit code 0.
- `bash -n deploy/oci/03-deploy.sh` returned no output and exit code 0.
- `git diff --check` returned no output and exit code 0.
- `git status --short --branch` during Task 2 remediation verification returned:

```text
## main...origin/main
 M .env.example
 M README.md
 M deploy/oci/02-configure.sh
D  design/src/mobile/pages-archive-me.jsx
D  design/src/mobile/pages-home.jsx
D  design/src/mobile/pages-session.jsx
D  design/src/mobile/shell.jsx
D  design/standalone/mobile.html
D  design/styles/mobile.css
D  "design/\354\235\275\353\212\224\354\202\254\354\235\264 \353\252\250\353\260\224\354\235\274.html"
 M docs/deploy/README.md
 M docs/deploy/cloudflare-pages-spa.md
 M docs/deploy/cloudflare-pages.md
 M docs/deploy/oci-backend.md
 M docs/deploy/oci-mysql-heatwave.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
```

The current Task 2 remediation status preserves the intended Task 1 staged `design/` index removals and shows the ignored local `design/` files still present. Task 2 did not edit or stage `design/` files because they are outside this task's allowed file list.

---

## Task 3 - Define The Public Candidate File Manifest

Files:

- Create: `scripts/build-public-release-candidate.sh`
- Create or modify: `scripts/README.md` if the script needs usage notes
- Modify: `.gitignore` only if the candidate output path needs an explicit ignore

Checklist:

- [x] Create `.tmp/public-release-candidate` as the default export destination.
- [x] Copy approved source files only:
  - `.github/workflows/ci.yml`
  - `.gitignore`
  - `.env.example`
  - `README.md`
  - `compose.yml`
  - `front/`
  - `server/`
  - `deploy/oci/`
  - `docs/deploy/`
  - `scripts/` release helper scripts
- [x] Exclude private or generated paths:
  - `.git/`
  - `.env*` except `.env.example`
  - `front/.env*`
  - `docs/superpowers/`
  - `design/`
  - `output/`
  - `front/output/`
  - `node_modules/`
  - `front/node_modules/`
  - `front/dist/`
  - `server/build/`
  - `server/.gradle/`
  - `server/.kotlin/`
  - `.gstack/`
  - `.superpowers/`
  - `.idea/`
  - `.playwright-cli/`
  - `.tmp/`
  - `recode/`
  - provider state, key material, dumps, and screenshots
- [x] Make the script fail if a forbidden file is present in the candidate.
- [x] Make the script fail if `.env.local` or `front/.env.local` appears in the candidate.
- [x] Make the script print the candidate path and next verification commands.

Expected result: the release candidate is reproducible and separate from the private repo history.

Verification notes, 2026-04-22:

- Created `scripts/build-public-release-candidate.sh` and `scripts/README.md`.
- The builder uses a fixed `.tmp/public-release-candidate` destination and rejects custom arguments.
- The builder copies only the reviewed manifest paths: `.github/workflows/ci.yml`, `.gitignore`, `.env.example`, `README.md`, `compose.yml`, `front/`, `server/`, `deploy/oci/`, `docs/deploy/`, and release helper files under `scripts/`.
- Directory copies exclude `.env*` and `*.env`; the root `.env.example` is copied explicitly as the only environment file.
- Candidate verification scans NUL-delimited `find` output captured in temporary files after checking `find` exit status. It does not use process substitution for `find` reads.
- The script rejects symlinked `.tmp`, verifies that resolved `.tmp` is exactly `$repo_abs/.tmp`, and only then removes `.tmp/public-release-candidate`.
- `bash -n scripts/build-public-release-candidate.sh` returned no output and exit code 0.
- `./scripts/build-public-release-candidate.sh` returned exit code 0 and printed:

```text
Public release candidate built:
  <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate

Next verification commands:
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \( -path '*/docs/superpowers/*' -o -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -name '*.env' -o -name '*.pem' -o -name '*.key' -o -name '*.sql.gz' -o -name '*.dump' \) -print
  git diff --check
```

- `find .tmp/public-release-candidate -name '.env*' -print` returned:

```text
.tmp/public-release-candidate/.env.example
```

- A forbidden-path check equivalent to the script denylist returned no output and exit code 0.
- A temporary `server/.envrc` fixture was removed after verification. It made the script fail with exit code 1 and printed:

```text
Forbidden env loader files were found in approved source roots:
  server/.envrc
ERROR: remove .envrc* files before building a public release candidate
```

- A temporary symlinked `.tmp` fixture in an isolated copy was removed after verification. The script failed with exit code 1, did not delete the outside sentinel file, and printed:

```text
ERROR: .tmp is a symlink; refusing to remove or write release-candidate data
sentinel_preserved=/var/folders/01/pttq8zy57654cfd1zm1ps7jm0000gn/T//readmates-outside-tmp.LI8Zg9/target/sentinel.txt
```

- `git diff --check` returned no output and exit code 0 before this note was added.
- `git status --short --branch` before this note was added returned:

```text
## main...origin/main
?? scripts/
```

- Final `git diff --check` after this note was added returned no output and exit code 0.
- Final `git status --short --branch` after this note was added returned:

```text
## main...origin/main
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
?? scripts/
```

Remediation notes, 2026-04-22:

- Remediated final Task 3 code-quality findings by making required files, optional files, required directory roots, and source path components reject symlinks before copying.
- Added a source preflight that rejects symlinks inside `.github/workflows`, `front`, `server`, `deploy/oci`, `docs/deploy`, and `scripts`, while retaining candidate `find -type l` validation as a defense-in-depth check.
- Changed the build flow to create `.tmp/public-release-candidate.staging.*`, verify that staging directory, and promote it to `.tmp/public-release-candidate` only after verification succeeds. Failed verification removes staging and leaves the previous final candidate intact.
- Fixed the temp-file cleanup registry by making `new_temp_file` set a global result variable instead of being called through command substitution that loses array mutations.
- Updated the README safety command to use case-insensitive matching, include the requested sensitive extensions/patterns, and filter out the allowed root `.env.example`.
- Updated `scripts/README.md` to document staging promotion and source symlink rejection.
- `bash -n scripts/build-public-release-candidate.sh; printf 'status=%s\n' "$?"` printed:

```text
status=0
```

- `./scripts/build-public-release-candidate.sh; printf 'status=%s\n' "$?"` printed:

```text
Public release candidate built:
  <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate

Next verification commands:
  find .tmp/public-release-candidate -type l -print
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \( -path '*/docs/superpowers/*' -o -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -iname '*.env' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p8' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname '*.sql.gz' -o -iname '*.dump' -o -iname '*.tfstate' -o -iname '*.db' -o -iname '*.sqlite' \) -print
  git diff --check
status=0
```

- A temporary symlinked `.env.example` source fixture in an isolated temp copy was removed by its fixture trap. It made the copied repo fail without mutating the real source tree:

```text
ERROR: source path uses a symlink component: .env.example
script_status=1
real_source_env_example_type=not_symlink
fixture_path=/var/folders/01/pttq8zy57654cfd1zm1ps7jm0000gn/T//readmates-symlink-file-fixture.ufl7ZT
```

- `find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'readmates-symlink-file-fixture.*' -print` returned no output after the isolated source-file symlink fixture.
- A temporary `deploy/oci/TEMP_PUBLIC_RELEASE_SYMLINK` source-root symlink fixture was removed after verification. It made the script fail before copying, and the existing candidate remained symlink-free:

```text
Forbidden symlinks were found in approved source roots:
  deploy/oci/TEMP_PUBLIC_RELEASE_SYMLINK
ERROR: remove source symlinks before building a public release candidate
script_status=1
candidate_symlink_status=0
fixture_cleanup_status=0
```

- A temporary `deploy/oci/API_KEY.PEM` uppercase sensitive-extension fixture was removed after verification. It made staging verification fail, did not leave the forbidden file in the previous final candidate, and cleaned staging:

```text
Public release candidate verification failed:
  forbidden path: deploy/oci/API_KEY.PEM
ERROR: candidate contains paths outside the approved public manifest or denylist
script_status=1
final_candidate_forbidden_find_status=0
staging_cleanup_status=0
fixture_cleanup_status=0
```

- README safety-command spot checks printed exactly the forbidden sample paths and did not print `.env.example`:

```text
.env.local
.cloudflare
deploy/oci/API_KEY.PEM
deploy/oci/foo.state
backup.SQL.GZ
backup.DUMP
foo.KEY
spot_check_status=0
```

- Final README safety-command remediation narrowed the allowed `.env.example` exemption to only the repository-root path with `rg -v '^\.env\.example$'`, so nested `front/.env.example` and `server/.env.example` remain reportable. The regex now also catches `.tfstate.*`, SSH key basename patterns including `.pub` public-key files, `.bak`, and the sensitive extensions/patterns covered by the builder denylist.
- The final README regex spot check:

```bash
printf '%s\n' '.env.example' 'front/.env.example' 'server/.env.example' '.env.local' '.cloudflare' 'terraform.tfstate.backup' 'id_rsa' 'id_ed25519.pub' 'deploy/oci/API_KEY.PEM' 'backup.SQL.GZ' 'backup.DUMP' 'foo.KEY' \
  | rg -i '(^|/)(\.env[^/]*|\.vercel(/|$)|\.wrangler(/|$)|\.cloudflare(/|$)|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$|[^/]*\.(pem|key|p8|p12|pfx|jks|sql\.gz|dump|db|sqlite3?|bak|state)$|[^/]*\.tfstate(\..*)?$|deploy/oci/\.deploy-state$)' \
  | rg -v '^\.env\.example$'
printf 'spot_check_status=%s\n' "$?"
```

printed:

```text
front/.env.example
server/.env.example
.env.local
.cloudflare
terraform.tfstate.backup
id_rsa
id_ed25519.pub
deploy/oci/API_KEY.PEM
backup.SQL.GZ
backup.DUMP
foo.KEY
spot_check_status=0
```

- Final `git diff --check` after the README safety-command remediation and this Task 3 note update returned no output and exit code 0.
- Final `git status --short --branch` after the README safety-command remediation and this Task 3 note update returned:

```text
## main...origin/main
 M README.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
?? scripts/
```

- Temp cleanup verification around a successful build showed no new `readmates-public-candidate.*` files and no staging/previous directories left behind:

```text
before_temp_count=73
after_temp_count=73
before_staging_count=0
after_staging_count=0
```

Remaining Task 3 finding remediation, 2026-04-22:

- Updated `scripts/build-public-release-candidate.sh` candidate verification so lowercased basenames matching `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, or `id_dsa*` are forbidden, including `.pub` public-key variants.
- Updated the script's printed follow-up `find` command to include the same SSH key basename patterns.
- Kept rsync copy behavior unchanged for these basename patterns so the mandatory candidate verifier remains the guard exercised by the public-key fixture test.
- `bash -n scripts/build-public-release-candidate.sh && printf 'bash_n_status=%s\n' "$?"` printed `bash_n_status=0`.
- A temporary `deploy/oci/id_ed25519.pub` fixture made `./scripts/build-public-release-candidate.sh` fail during candidate verification, printed `forbidden path: deploy/oci/id_ed25519.pub`, left no `id_ed25519.pub` match in `.tmp/public-release-candidate`, and was removed.
- A subsequent `./scripts/build-public-release-candidate.sh` succeeded and printed the updated follow-up forbidden-path `find` command with `-iname 'id_rsa*'`, `-iname 'id_ed25519*'`, `-iname 'id_ecdsa*'`, and `-iname 'id_dsa*'`.
- README safety-command spot check still reported `id_ed25519.pub` and suppressed only root `.env.example`.

Additional Task 3 builder remediation, 2026-04-22:

- Updated `scripts/build-public-release-candidate.sh` so the candidate verifier rejects provider state directories at any depth, including `.wrangler`, `.cloudflare`, and `.vercel` directories plus descendants such as `front/.wrangler/state` and `front/.vercel/project.json`.
- Updated the script's printed follow-up `find` command to include provider state directories at any depth with both directory and descendant path checks.
- Updated source symlink preflight to prune generated/private directories before scanning for symlinks, so symlinks under excluded paths such as `front/node_modules`, `front/output`, `front/dist`, `server/build`, `server/.gradle`, and `server/.kotlin` do not fail preflight. Source symlinks in included approved roots still fail.
- `bash -n scripts/build-public-release-candidate.sh; printf 'bash_n_status=%s\n' "$?"` printed:

```text
bash_n_status=0
```

- A temporary `front/node_modules/.bin` symlink fixture was removed after verification. It made the script succeed, and the candidate contained no symlink or `node_modules` paths:

```text
script_status=0
candidate_symlink_count=0
candidate_node_modules_count=0
fixture_removed=yes
```

- A temporary `deploy/oci/TEMP_PUBLIC_RELEASE_SYMLINK` included-path symlink fixture was removed after verification. It made source symlink preflight fail while the existing candidate remained symlink-free:

```text
Forbidden symlinks were found in approved source roots:
  deploy/oci/TEMP_PUBLIC_RELEASE_SYMLINK
ERROR: remove source symlinks before building a public release candidate
script_status=1
candidate_symlink_count=0
fixture_removed=yes
```

- Temporary nested provider state fixtures under `front/.wrangler`, `front/.vercel`, and `front/.cloudflare` were removed after verification. They made staging verification fail, and the final candidate stayed clean:

```text
Public release candidate verification failed:
  forbidden path: front/.vercel
  forbidden path: front/.vercel/project.json
  forbidden path: front/.cloudflare
  forbidden path: front/.cloudflare/state
  forbidden path: front/.wrangler
  forbidden path: front/.wrangler/state
ERROR: candidate contains paths outside the approved public manifest or denylist
script_status=1
candidate_provider_path_count=0
fixtures_removed=yes
```

- `./scripts/build-public-release-candidate.sh; printf 'script_status=%s\n' "$?"` succeeded after fixture cleanup and printed the updated provider-state follow-up `find` command:

```text
script_status=0
```

- Fixture cleanup verification returned no remaining `front/node_modules`, `deploy/oci/TEMP_PUBLIC_RELEASE_SYMLINK`, `front/.wrangler`, `front/.vercel`, or `front/.cloudflare` paths.
- Final `git diff --check; printf 'diff_check_status=%s\n' "$?"` after the builder and note updates printed:

```text
diff_check_status=0
```

- Final `git status --short --branch` after the builder and note updates printed:

```text
## main...origin/main
 M README.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
?? scripts/
```

---

## Task 4 - Add Secret Scanning And Public-Release Checks

Files:

- Create: `.gitleaks.toml`
- Create: `scripts/public-release-check.sh`
- Modify: `docs/deploy/security-public-repo.md`
- Modify: `README.md` only if a short public-release check section is useful

Checklist:

- [x] Add a `.gitleaks.toml` that allows documented placeholders and test-only secrets.
- [x] Keep real credential patterns blocked.
- [x] Add a release check script that can scan either the current tree or `.tmp/public-release-candidate`.
- [x] Include forbidden path checks using `git ls-files` for the private tree and `find` for the candidate directory.
- [x] Reject tracked symlinks in private-tree mode and all symlinks in candidate mode.
- [x] Include targeted grep/rg checks for:
  - private keys
  - OCI OCIDs
  - GitHub tokens
  - OpenAI/API key style tokens
  - real-looking DB/BFF/OAuth secret assignments
  - Gmail addresses
  - private ReadMates domain strings
  - local absolute home paths
- [x] Prefer `gitleaks dir <path>` when `gitleaks` is installed.
- [x] Keep a legacy `gitleaks detect --source <path>` compatibility fallback for older installed binaries that do not support `dir`.
- [x] Provide a clear fallback if `gitleaks` is not installed.
- [x] Document that passing the fallback scan is not equivalent to a professional secret scan, but is enough to block obvious mistakes before local iteration.

Expected result: release safety checks are repeatable and do not rely on remembering ad hoc commands.

Verification notes, 2026-04-22:

- Created `.gitleaks.toml` with `extend.useDefault = true`, ReadMates-specific rules for private key blocks, OCI OCIDs, GitHub tokens, OpenAI/API-key-shaped tokens, and real-looking DB/BFF/OAuth secret assignments, including env-var and property-style keys such as `READMATES_BFF_SECRET`, `readmates.bff-secret`, `SPRING_DATASOURCE_PASSWORD`, and `spring.datasource.password`. The allowlist is limited to documented placeholders, `${...}` indirections, reserved example emails, and local/test-only secret strings such as `local-dev-secret`, `e2e-secret`, `test-secret`, and `test-bff-secret`.
- Created `scripts/public-release-check.sh`. It accepts zero or one path argument, scans the repository root/private tree by default regardless of caller working directory, and scans a candidate directory such as `.tmp/public-release-candidate` when a path is supplied.
- The script uses `git ls-files` for current-tree forbidden path checks, rejects tracked symlinks, and uses `find` for candidate-directory forbidden path and symlink checks.
- The script runs targeted `git grep`/`rg`/`grep` checks for private keys, OCI OCIDs, GitHub tokens, OpenAI/API-key-shaped tokens, real-looking DB/BFF/OAuth secret assignments, Gmail addresses, private club domain references, and local workstation paths. The checker avoids embedding the private domain and workstation path as literal self-matches in files copied into the candidate.
- Updated `README.md`, `docs/deploy/security-public-repo.md`, and `scripts/README.md` to point at `./scripts/public-release-check.sh .tmp/public-release-candidate` and document that fallback scanning is not a professional or complete secret scan.
- `command -v gitleaks || true; gitleaks version 2>/dev/null || gitleaks --version 2>/dev/null || true` returned no output, so `gitleaks` is not installed in this environment and no gitleaks syntax/detect run was available.
- A local TOML parse check with Python `tomllib` printed `toml_parse_status=0`.
- `bash -n scripts/public-release-check.sh; printf 'bash_n_status=%s\n' "$?"` printed:

```text
bash_n_status=0
```

- `./scripts/build-public-release-candidate.sh; printf 'build_status=%s\n' "$?"` succeeded and printed the candidate path plus the existing follow-up `find` commands. Final status:

```text
build_status=0
```

- `./scripts/public-release-check.sh .tmp/public-release-candidate; printf 'candidate_check_status=%s\n' "$?"` printed:

```text
ReadMates public-release check
  mode: candidate
  source: <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
gitleaks is not installed; running fallback path/content checks only.
Fallback scanning is not a professional or complete secret scan. It blocks obvious mistakes before local iteration, but install gitleaks before publishing.
Public-release check passed.
candidate_check_status=0
```

- `./scripts/public-release-check.sh; printf 'current_tree_check_status=%s\n' "$?"` now correctly detects this checkout as `mode: private-tree` even though `.git` is a worktree file, not a directory. It returned `current_tree_check_status=1` because the private source tree intentionally still tracks `docs/superpowers/**`, which is forbidden for public candidates, and those private planning docs contain known risk examples including local workstation paths, private club domain examples, and placeholder-looking secret assignment examples. The clean candidate scan above is the publish gate.
- A temporary forbidden-path fixture candidate containing `front/.env.local` failed as expected and was removed:

```text
forbidden candidate path: front/.env.local
forbidden_path_fixture_status=1
```

- A temporary obvious-token fixture candidate containing `OPENAI_API_KEY=<openai-api-key-shaped-fixture>` failed as expected and was removed:

```text
targeted content finding: OpenAI/API key style token
  README.md:1:OPENAI_API_KEY=<openai-api-key-shaped-fixture>
obvious_token_fixture_status=1
```

- Fixture cleanup verification returned no remaining `readmates-public-check-path.*` or `readmates-public-check-token.*` directories under `${TMPDIR:-/tmp}`.
- `git diff --check; printf 'diff_check_status=%s\n' "$?"` printed:

```text
diff_check_status=0
```

- Final `git status --short --branch --untracked-files=all` after Task 4 printed:

```text
## main...origin/main
 M README.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
?? .gitleaks.toml
?? scripts/README.md
?? scripts/build-public-release-candidate.sh
?? scripts/public-release-check.sh
```

`scripts/build-public-release-candidate.sh` remains an existing untracked Task 3 release helper; Task 4 did not edit it.

Review finding remediation notes, 2026-04-22:

- Fixed no-argument `scripts/public-release-check.sh` execution to resolve `script_root` and `repo_root` before choosing the scan source, so `../scripts/public-release-check.sh` from `front/` scans the repository root in private-tree mode instead of treating `front/` as a candidate.
- Added symlink rejection in both modes: candidate scans record every symlink path with its target, and private-tree scans reject tracked symlinks from `git ls-files -s`.
- Switched installed `gitleaks` filesystem scans to `gitleaks dir <path>`. The script keeps a documented legacy `gitleaks detect --source <path>` compatibility fallback only for older installed binaries that do not support `dir`.
- Replaced candidate match reporting that embedded `$source_abs` in `sed` expressions with shell parameter expansion, so candidate paths containing `#` report cleanly.
- Added property-style real secret patterns for `readmates.bff-secret` and `spring.datasource.password` in both `scripts/public-release-check.sh` and `.gitleaks.toml`, with matching gitleaks keywords.
- Updated `README.md`, `scripts/README.md`, and `docs/deploy/security-public-repo.md` for symlink checks and the `gitleaks dir` command.
- Remediation verification returned expected statuses: `bash_n_status=0`, `toml_parse_status=0`, `build_status=0`, candidate check status `0`, `front_no_arg_status=1` in private-tree mode against the repository root, candidate symlink fixture status `1`, tracked symlink fixture status `1`, property-style secret fixture status `1`, `#` path token fixture status `1`, and fixture cleanup removed the temporary directories.
- Fixed P1 unreadable candidate path false negatives by capturing candidate `find`, `rg`, and fallback `grep` stdout/stderr/status explicitly. Candidate traversal and content scan read errors now produce `scan error:` findings in the final failure list instead of being collapsed into a clean no-match result.
- Verified an unreadable candidate fixture containing an OpenAI-shaped token under a `chmod 000` directory now fails with `scan error: candidate path traversal (find exit 1)` plus `rg exit 2` content scan errors, then restored permissions and removed the fixture. Re-ran `bash -n scripts/public-release-check.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `./scripts/build-public-release-candidate.sh`, `git diff --check`, and `git status --short --branch`.
- Verified the fallback branch with `rg` hidden from `PATH`: an unreadable file now fails with `grep exit 2` scan errors. Also passed grep/git-grep patterns through `--`/`-e` so the private-key regex beginning with `-----BEGIN` is treated as a pattern, not an option.
- Final Task 4 finding remediation widened DB/BFF/OAuth assignment scanning to catch punctuation-containing plausible secrets such as a strong Spring datasource password, while keeping documented placeholder and test/local values allowed. It also adds `.gitleaks.toml` to the public candidate manifest and adds `scripts/verify-public-release-fixtures.sh` for repeatable secret/placeholder fixture checks.
- Latest Task 4 remediation widened the fallback and `.gitleaks.toml` real-secret assignment value regexes to allow literal `$` inside matched values instead of excluding dollar signs globally. `${...}` environment indirections remain allowed by the narrow assignment-value allowlist.
- The fallback content scanner now emits matched substrings with `git grep -o`, `rg -o`, or `grep -o`, then allowlists only the matched assignment value. A real datasource password assignment followed by a placeholder comment fails because the placeholder appears in comment text outside the matched value.
- `scripts/verify-public-release-fixtures.sh` now resolves and verifies repository-local `.tmp` like the builder before removing `.tmp/public-release-fixtures`; it refuses a symlinked `.tmp` parent and skips cleanup through symlinked temp paths.
- Updated fixture coverage so real datasource password assignments fail, comment-only placeholder hints fail, and both `<db-password>` and environment-variable indirection pass.
- Latest verification returned expected statuses: `bash_n_status=0`, `tomllib_parse_status=0`, dollar secret fixture status `1`, comment-placeholder secret fixture status `1`, placeholder fixture status `0`, env indirection fixture status `0`, isolated symlinked `.tmp` fixture status `1` with outside sentinel preserved, `build_status=0`, `candidate_check_status=0`, `fixture_script_status=0`, and `diff_check_status=0`.

---

## Task 5 - Scrub Public Candidate Identity And Local Path Data

Files:

- Modify files identified by `scripts/public-release-check.sh`
- Likely areas:
  - `README.md`
  - `docs/deploy/**`
  - `server/src/main/resources/db/**/dev/**`
  - frontend tests and fixtures only if they contain personal-looking identifiers

Checklist:

- [x] Replace personal-looking sample identifiers with generic deterministic sample identifiers.
- [x] Keep reserved emails such as `host@example.com`, `member1@example.com`, and `new.member@example.com`.
- [x] Replace `wooseung` and similar personal-looking subject fragments when they appear in files included in the public candidate.
- [x] Replace private-domain member email examples by excluding `design/`; if they appear elsewhere in the candidate, use reserved placeholders.
- [x] Keep Korean sample display names only when they are clearly generic sample names.
- [x] Re-run the release check script after each scrub batch.

Expected result: the candidate contains public-safe sample data only.

Verification notes, 2026-04-22:

- Built the public candidate with `./scripts/build-public-release-candidate.sh`; exit code 0. The script printed the candidate path as `<local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate` and the next verification commands.
- Ran `./scripts/public-release-check.sh .tmp/public-release-candidate`; exit code 0. Output included `gitleaks is not installed; running fallback path/content checks only.` and `Public-release check passed.`
- Ran the required targeted scan:

```bash
rg -n 'wooseung|seoyun|readmates[.]example[.]com|gmail[.]com|local absolute path' .tmp/public-release-candidate || true
```

It returned five exported-file findings:

```text
.tmp/public-release-candidate/front/tests/unit/host-session-editor.test.tsx:156:    expect(screen.queryByText("feedback-14-seoyun.html")).not.toBeInTheDocument();
.tmp/public-release-candidate/front/tests/unit/host-session-editor.test.tsx:196:    expect(screen.queryByText("feedback-14-seoyun.html")).not.toBeInTheDocument();
.tmp/public-release-candidate/server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt:36:            googleSubjectId = "google-existing-wooseung",
.tmp/public-release-candidate/server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt:39:            profileImageUrl = "https://example.com/wooseung.png",
.tmp/public-release-candidate/server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt:50:        assertEquals("google-existing-wooseung", subject)
```

- Inspected the findings in public-candidate source files only. The private-domain member email was absent from the candidate. The only `seoyun` occurrence was the exported frontend test filename assertion.
- Scrub batch 1 made the smallest replacements:
  - `front/tests/unit/host-session-editor.test.tsx`: `이서윤` -> `이멤버14`, `feedback-14-seoyun.html` -> `feedback-14-sample-member.html`.
  - `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`: `google-existing-wooseung` -> `google-existing-host`, `https://example.com/wooseung.png` -> `https://example.com/sample-host.png`.
- Rebuilt with `./scripts/build-public-release-candidate.sh`; exit code 0.
- Re-ran `./scripts/public-release-check.sh .tmp/public-release-candidate`; exit code 0 with the same gitleaks-not-installed fallback notice and `Public-release check passed.`
- Re-ran the required targeted scan after scrub batch 1; it returned no output.
- Ran an additional targeted scan for the discovered identifiers:

```bash
rg -n '이서윤|feedback-14-seoyun|google-existing-wooseung|wooseung\.png' .tmp/public-release-candidate || true
```

It returned no output.
- Ran a broader local-path sweep:

```bash
rg -n '/Users/|source/persnal|persnal|ReadMates-public-readiness|\.tmp/public-release-candidate' .tmp/public-release-candidate || true
```

The only output was intentional documentation/script text for `.tmp/public-release-candidate` and the checker's split local-path pattern string; no concrete local account path was present in the candidate.
- Confirmed reserved `example.com` sample emails remained unchanged.

---

## Task 6 - Public README And Reviewer Experience

Files:

- Modify: `README.md`
- Modify: `docs/deploy/README.md`

Checklist:

- [x] Keep README reviewer-focused and not dominated by internal planning history.
- [x] Include product summary, architecture, trust boundaries, local setup, test commands, and deployment overview.
- [x] Explain the BFF security boundary: browser -> Cloudflare Pages Functions -> Spring with `X-Readmates-Bff-Secret`.
- [x] Explain session-cookie posture: HttpOnly, SameSite=Lax, Secure in production.
- [x] Explain invite-only membership and host/member authorization at a high level.
- [x] Avoid listing private operational details.
- [x] Ensure any screenshots referenced in README are sample-data-only or omitted.
- [x] Ensure README links do not point to private-only `docs/superpowers` files.

Expected result: a portfolio reviewer can understand the project without private context.

Verification notes, 2026-04-22:

- Replaced the long README with a reviewer-focused public README covering product scope, stack, repository map, architecture, BFF trust boundary, session cookie posture, invite-only membership, host/member authorization, local setup, test commands, deployment overview, and public release safety.
- Kept the user-approved portfolio demo URL `https://readmates.pages.dev`.
- Omitted screenshots from the README and stated that no screenshots are included.
- Reworked `docs/deploy/README.md` into a public-safe deployment runbook with placeholders for direct API origin and secrets, and without account-specific read-only Cloudflare/OCI inventory commands.
- Confirmed the accidental patch target issue was reverted in `<local-workspace>/ReadMates`: `git status --short -- README.md docs/deploy/README.md` returned no output there.
- `rg -n 'docs/superpowers|local absolute path|readmates[.]example[.]com|gmail[.]com|private IP literal' README.md docs/deploy/README.md || true` returned no output.
- `rg -n 'X-Readmates-Bff-Secret|HttpOnly|SameSite=Lax|Secure|invite|host|member|readmates\.pages\.dev' README.md docs/deploy/README.md` returned:

```text
docs/deploy/README.md:7:Approved portfolio demo URL: [https://readmates.pages.dev](https://readmates.pages.dev)
docs/deploy/README.md:31:  | X-Readmates-Bff-Secret + forwarded cookies
docs/deploy/README.md:36:The browser-facing trust boundary is Cloudflare Pages, not the direct Spring API origin. Browsers call same-origin `/api/bff/**`; Pages Functions forward the request to Spring and attach `X-Readmates-Bff-Secret`. Spring validates that header on API requests and should fail startup in production when `READMATES_BFF_SECRET` is missing.
docs/deploy/README.md:46:- `HttpOnly`: browser JavaScript cannot read the token.
docs/deploy/README.md:47:- `SameSite=Lax`: normal login and navigation work while reducing cross-site request risk.
docs/deploy/README.md:48:- `Secure` in production: set `READMATES_AUTH_SESSION_COOKIE_SECURE=true` so the cookie is HTTPS-only.
docs/deploy/README.md:53:ReadMates is invite-only at the product level.
docs/deploy/README.md:55:- A host creates invitation links.
docs/deploy/README.md:57:- A host approves or rejects pending members and can suspend, restore, deactivate, or remove members from the current session.
docs/deploy/README.md:58:- Host APIs require an active `host` role.
docs/deploy/README.md:59:- Member APIs require an allowed `member` state and, for current-session writes, active participation in that session.
docs/deploy/README.md:78:READMATES_APP_BASE_URL=https://readmates.pages.dev
docs/deploy/README.md:79:READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
docs/deploy/README.md:114:curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
docs/deploy/README.md:115:curl -sS https://readmates.pages.dev/api/bff/api/auth/me
docs/deploy/README.md:116:curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
docs/deploy/README.md:117:curl -sS https://readmates.pages.dev/api/bff/api/public/club
README.md:3:ReadMates is an invite-only reading club web app. It combines a public site, member session preparation, host operations, and post-session feedback documents in one full-stack product.
README.md:5:Public demo: [https://readmates.pages.dev](https://readmates.pages.dev)
README.md:14:- Invited members can sign in with Google, RSVP for the current session, submit reading progress, questions, short reviews, and long reviews.
README.md:15:- Hosts can create invitations, approve or reject pending members, manage member status, create and edit sessions, confirm attendance, publish session records, and upload feedback documents.
README.md:39:| `front/features` | Domain UI and actions for public, member, host, archive, notes, feedback |
README.md:43:| `server/src/main/kotlin/com/readmates/auth` | Google login, invitations, membership lifecycle, session cookies |
README.md:44:| `server/src/main/kotlin/com/readmates/session` | Current sessions, host session operations, RSVP, attendance, publication |
README.md:45:| `server/src/main/kotlin/com/readmates/archive` | Archive, member history, notes feed |
README.md:66:  | X-Readmates-Bff-Secret + forwarded cookies
README.md:70:  |-- HttpOnly readmates_session cookie
README.md:71:  |-- membership, role, and session rules
README.md:77:The browser does not call the Spring API directly in production. It calls same-origin Cloudflare Pages Functions under `/api/bff/**`; the BFF forwards to Spring `/api/**` and adds `X-Readmates-Bff-Secret`. Spring validates that header on API requests, so the direct API origin is not the trusted browser-facing boundary.
README.md:87:- `HttpOnly`: JavaScript cannot read the session token.
README.md:88:- `SameSite=Lax`: normal top-level navigation works while reducing cross-site request risk.
README.md:89:- `Secure` in production: production sets `READMATES_AUTH_SESSION_COOKIE_SECURE=true` so cookies are sent only over HTTPS.
README.md:92:Membership is invite-only at the product boundary:
README.md:94:- A host can create invitation links and optionally attach an invited user to the current session.
README.md:96:- A host can approve, reject, suspend, restore, deactivate, or remove members from the current session.
README.md:97:- `host` routes and APIs require an active host role.
README.md:98:- `member` routes and APIs require an active or otherwise allowed member state, with write operations restricted to eligible current-session participants.
README.md:111:- `/invite/:token`
README.md:125:- `/app/host`
README.md:126:- `/app/host/members`
README.md:127:- `/app/host/invitations`
README.md:128:- `/app/host/sessions/new`
README.md:129:- `/app/host/sessions/:sessionId/edit`
README.md:156:SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC' \
README.md:157:READMATES_APP_BASE_URL=http://localhost:5173 \
README.md:158:READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
README.md:166:READMATES_API_BASE_URL=http://localhost:8080 \
README.md:171:Open `http://localhost:5173`.
README.md:173:Local dev mode shows dev-login buttons on the login page. Seed accounts use reserved sample addresses such as `host@example.com` and `member1@example.com`.
README.md:209:- `https://readmates.pages.dev`
README.md:243:Do not commit real OCI OCIDs, API keys, SSH keys, database dumps, BFF secrets, Google OAuth secrets, private member data, or production exports.
```

- `./scripts/build-public-release-candidate.sh` exited 0 and printed:

```text
Public release candidate built:
  <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate

Next verification commands:
  find .tmp/public-release-candidate -type l -print
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \( -path '*/docs/superpowers/*' -o -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -path '*/.wrangler' -o -path '*/.wrangler/*' -o -path '*/.cloudflare' -o -path '*/.cloudflare/*' -o -path '*/.vercel' -o -path '*/.vercel/*' -o -iname '*.env' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p8' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname 'id_rsa*' -o -iname 'id_ed25519*' -o -iname 'id_ecdsa*' -o -iname 'id_dsa*' -o -iname '*.sql.gz' -o -iname '*.dump' -o -iname '*.tfstate' -o -iname '*.db' -o -iname '*.sqlite' \) -print
  git diff --check
```

- `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0 and printed:

```text
ReadMates public-release check
  mode: candidate
  source: <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
gitleaks is not installed; running fallback path/content checks only.
Fallback scanning is not a professional or complete secret scan. It blocks obvious mistakes before local iteration, but install gitleaks before publishing.
Public-release check passed.
```

- `git diff --check` returned no output and exit code 0.
- `git status --short --branch` returned:

```text
## main...origin/main
 M README.md
 M docs/deploy/README.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
 M front/tests/unit/host-session-editor.test.tsx
 M server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt
?? .gitleaks.toml
?? scripts/
```

---

## Task 7 - Verification Suite

Commands:

```bash
git status --short --branch
git ls-files design
git ls-files | rg '(^|/)(\.env|\.vercel|\.wrangler|\.cloudflare|.*\.pem|.*\.key|.*\.sql\.gz|.*\.dump|deploy/oci/\.deploy-state)$' || true
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
pnpm --dir front audit --prod
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server test
```

Checklist:

- [x] Record every command result in this plan as each task completes.
- [x] If frontend or backend tests fail before relevant edits, record the baseline failure and do not hide it behind public-release changes.
- [x] If the release check finds a real secret, stop and rotate before continuing.
- [x] If the release check finds only a placeholder false positive, either adjust `.gitleaks.toml` narrowly or document why the value is allowed.

Expected result: implementation changes and the generated public candidate are both verified.

Verification notes, 2026-04-22:

- `git status --short --branch` exited 0 and printed:

```text
## main...origin/main
 M README.md
 M docs/deploy/README.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
 M front/tests/unit/host-session-editor.test.tsx
 M server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt
?? .gitleaks.toml
?? scripts/
```

- `git ls-files design` exited 0 and returned no output.
- `git ls-files | rg '(^|/)(\.env|\.vercel|\.wrangler|\.cloudflare|.*\.pem|.*\.key|.*\.sql\.gz|.*\.dump|deploy/oci/\.deploy-state)$' || true` exited 0 and returned no output.
- `./scripts/build-public-release-candidate.sh` exited 0 and printed:

```text
Public release candidate built:
  <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate

Next verification commands:
  find .tmp/public-release-candidate -type l -print
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \( -path '*/docs/superpowers/*' -o -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -path '*/.wrangler' -o -path '*/.wrangler/*' -o -path '*/.cloudflare' -o -path '*/.cloudflare/*' -o -path '*/.vercel' -o -path '*/.vercel/*' -o -iname '*.env' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p8' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname 'id_rsa*' -o -iname 'id_ed25519*' -o -iname 'id_ecdsa*' -o -iname 'id_dsa*' -o -iname '*.sql.gz' -o -iname '*.dump' -o -iname '*.tfstate' -o -iname '*.db' -o -iname '*.sqlite' \) -print
  git diff --check
```

- `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0 and printed:

```text
ReadMates public-release check
  mode: candidate
  source: <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
gitleaks is not installed; running fallback path/content checks only.
Fallback scanning is not a professional or complete secret scan. It blocks obvious mistakes before local iteration, but install gitleaks before publishing.
Public-release check passed.
```

No real secret was reported by the release check. No placeholder false positive was reported.

- `pnpm --dir front audit --prod` exited 0 and printed:

```text
No known vulnerabilities found
```

- First `pnpm --dir front lint` attempt exited 1 because local frontend dependencies were missing:

```text
> readmates-front@ lint <local-workspace>/ReadMates-public-readiness/front
> eslint .

sh: eslint: command not found
 ELIFECYCLE  Command failed.
 WARN  Local package.json exists, but node_modules missing, did you mean to install?
```

- Ran the smallest normal workflow dependency substitute, `pnpm --dir front install --frozen-lockfile`, to make local frontend checks possible. It exited 0, printed `Lockfile is up to date, resolution step is skipped`, reused the lockfile, added 279 packages under `front/node_modules`, and did not modify tracked lockfiles or package manifests.
- Re-ran `pnpm --dir front lint`; it exited 0 after printing the npm script header:

```text
> readmates-front@ lint <local-workspace>/ReadMates-public-readiness/front
> eslint .
```

- `pnpm --dir front test` exited 0. Summary:

```text
Test Files  36 passed (36)
     Tests  258 passed (258)
  Duration  4.64s
```

- `pnpm --dir front build` exited 0 and printed:

```text
vite v8.0.9 building client environment for production...
transforming...✓ 109 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.39 kB │ gzip:   0.26 kB
dist/assets/index-BKFTjvIC.css   31.34 kB │ gzip:   6.55 kB
dist/assets/index-Cjj53c4_.js   545.52 kB │ gzip: 145.72 kB

✓ built in 384ms
```

- `./server/gradlew -p server test` exited 0. Summary:

```text
> Task :test

BUILD SUCCESSFUL in 26s
6 actionable tasks: 1 executed, 5 up-to-date
```

- Final `git status --short --branch` after the verification suite and this note update should show the same readiness source changes plus this plan edit; generated `.tmp/public-release-candidate`, `front/node_modules`, and `front/dist` are not tracked.

Review remediation notes, 2026-04-22:

- Removed private `docs/superpowers` source-reference header comments from both seed SQL files and replaced them with the neutral comment `Development seed data for local ReadMates fixtures.` Seed data statements were not changed.
- Generalized candidate-visible public readiness docs and helper output so the rebuilt public candidate no longer contains the private planning path string. Helper denylist behavior still excludes the private planning directory by constructing that path without publishing it as a contiguous literal.
- Changed paths:
  - `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
  - `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
  - `scripts/build-public-release-candidate.sh`
  - `scripts/public-release-check.sh`
  - `scripts/README.md`
  - `docs/deploy/security-public-repo.md`
  - `docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md`
- `bash -n scripts/build-public-release-candidate.sh scripts/public-release-check.sh; printf 'bash_n_status=%s\n' "$?"` exited 0 and printed:

```text
bash_n_status=0
```

- `rg -n 'docs/superpowers' scripts docs/deploy README.md server/src/main/resources/db/dev/R__readmates_dev_seed.sql server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql || true; printf 'source_rg_status=%s\n' "$?"` exited 0 and printed:

```text
source_rg_status=0
```

- `./scripts/build-public-release-candidate.sh; printf 'build_status=%s\n' "$?"` exited 0 and printed:

```text
Public release candidate built:
  <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate

Next verification commands:
  find .tmp/public-release-candidate -type l -print
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \( -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -path '*/.wrangler' -o -path '*/.wrangler/*' -o -path '*/.cloudflare' -o -path '*/.cloudflare/*' -o -path '*/.vercel' -o -path '*/.vercel/*' -o -iname '*.env' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p8' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname 'id_rsa*' -o -iname 'id_ed25519*' -o -iname 'id_ecdsa*' -o -iname 'id_dsa*' -o -iname '*.sql.gz' -o -iname '*.dump' -o -iname '*.tfstate' -o -iname '*.db' -o -iname '*.sqlite' \) -print
  git diff --check
build_status=0
```

- `rg -n 'docs/superpowers' server/src/main/resources/db/dev/R__readmates_dev_seed.sql server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql .tmp/public-release-candidate || true; printf 'rg_status=%s\n' "$?"` exited 0 and printed:

```text
rg_status=0
```

- `./scripts/public-release-check.sh .tmp/public-release-candidate; printf 'candidate_check_status=%s\n' "$?"` exited 0 and printed:

```text
ReadMates public-release check
  mode: candidate
  source: <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
gitleaks is not installed; running fallback path/content checks only.
Fallback scanning is not a professional or complete secret scan. It blocks obvious mistakes before local iteration, but install gitleaks before publishing.
Public-release check passed.
candidate_check_status=0
```

- `git diff --check; printf 'diff_check_status=%s\n' "$?"` exited 0 and printed:

```text
diff_check_status=0
```

- `git status --short --branch; printf 'status_status=%s\n' "$?"` exited 0 and printed:

```text
## main...origin/main
 M README.md
 M docs/deploy/README.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
 M front/tests/unit/host-session-editor.test.tsx
 M server/src/main/resources/db/dev/R__readmates_dev_seed.sql
 M server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql
 M server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt
?? .gitleaks.toml
?? scripts/
status_status=0
```

Final required verification suite, 2026-04-22:

- Ran the requested final verification commands from `<local-workspace>/ReadMates-public-readiness` only. No publish, push, commit, remote, visibility, secret-rotation, candidate Git init, or other worktree operation was performed.
- `git status --short --branch` exited 0 and printed the same readiness source changes listed above.
- `git ls-files design` exited 0 with no stdout.
- `git ls-files | rg '(^|/)(\.env|\.vercel|\.wrangler|\.cloudflare|.*\.pem|.*\.key|.*\.sql\.gz|.*\.dump|deploy/oci/\.deploy-state)$' || true` exited 0 with no stdout.
- `./scripts/build-public-release-candidate.sh` exited 0 and rebuilt `.tmp/public-release-candidate`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0 and printed `Public-release check passed.` Initial final verification used fallback checks because `gitleaks` was not installed yet.
- `pnpm --dir front audit --prod`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, and `./server/gradlew -p server test` all exited 0.
- `./scripts/verify-public-release-fixtures.sh` exited 0 and printed `Public-release fixture checks passed.`
- `test ! -e .tmp/public-release-candidate/.git` exited 0 with no stdout.
- `rg -n 'docs/superpowers|wooseung|seoyun|readmates[.]example[.]com|gmail[.]com|local absolute path' .tmp/public-release-candidate || true` exited 0 with no stdout.
- `git diff --check` exited 0 with no stdout.

Post-publish verification, 2026-04-22:

- `gh repo view beyondwin/ReadMates-legacy --json nameWithOwner,isPrivate,visibility,url,defaultBranchRef` exited 0 and confirmed `beyondwin/ReadMates-legacy` is `PRIVATE` with default branch `main`.
- `gh repo view beyondwin/ReadMates --json nameWithOwner,isPrivate,visibility,url,homepageUrl,defaultBranchRef,pushedAt` exited 0 and confirmed `beyondwin/ReadMates` is `PUBLIC`, default branch `main`, homepage `https://readmates.pages.dev`.
- `git -C .tmp/public-release-candidate status --short --branch` exited 0 and printed `## main...origin/main`.
- `git -C .tmp/public-release-candidate log --oneline --decorate -1` exited 0 and printed `cb2bfb3 (HEAD -> main, origin/main) Initial public release`.
- `git ls-remote https://github.com/beyondwin/ReadMates.git refs/heads/main` exited 0 and resolved `cb2bfb3a1bcc9985cf44e31563e018977480f112`.
- `gitleaks git --config .gitleaks.toml --redact --no-banner .tmp/public-release-candidate` exited 0 and printed `no leaks found`.
- `git -C .tmp/public-release-candidate ls-files` with the forbidden path filter exited 0 with no stdout.
- `gh api repos/beyondwin/ReadMates --jq '{private,visibility,default_branch,homepage,security_and_analysis}'` exited 0 and confirmed secret scanning, push protection, and Dependabot security updates are enabled.
- `gh api repos/beyondwin/ReadMates/branches/main/protection` exited 0 and confirmed branch force pushes and branch deletion are disabled.

Post-gitleaks verification, 2026-04-22:

- Installed `gitleaks` 8.30.1 with Homebrew.
- Rebuilt `.tmp/public-release-candidate`.
- `gitleaks dir --config .gitleaks.toml --redact --no-banner .tmp/public-release-candidate` exited 0 and printed `no leaks found`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0 through the `gitleaks dir` path and printed `Public-release check passed.`

---

## Task 8 - Clean Public Repository Handoff

Files:

- No source file changes required unless earlier verification reveals a missing instruction.

Handoff status before publish approval, 2026-04-22:

- `.tmp/public-release-candidate` exists and passed the public-release check.
- `.tmp/public-release-candidate/.git` does not exist. Because no candidate Git repository exists, `git -C .tmp/public-release-candidate status` was intentionally not run.
- Publishing approval is not present in the conversation. The latest instruction explicitly says the user has not approved publishing, target repo owner/name, or post-candidate git init/push.
- The live demo URL is currently approved and included as `https://readmates.pages.dev`; optional final reconfirmation before publish is available if desired, but this is not a blocking unknown decision.
- Task 8 is ready for the approval gate only. It remains blocked pending explicit approval to publish and target repository owner/name. The `gitleaks` publish gate has passed for the current candidate; re-run it if the candidate changes before publishing.
- No `git init`, commit, push, public repo creation, repository visibility change, or secret rotation was performed.

Publish execution status, 2026-04-22:

- User approval was received to rename the existing GitHub repository and publish a new clean public repository.
- The existing GitHub repository `beyondwin/ReadMates` was renamed to `beyondwin/ReadMates-legacy` and remains `PRIVATE`.
- A new GitHub repository `beyondwin/ReadMates` was created with `PUBLIC` visibility and homepage `https://readmates.pages.dev`.
- `.tmp/public-release-candidate` was initialized as a fresh Git repository with branch `main`, committed as `cb2bfb3 Initial public release`, and pushed to `https://github.com/beyondwin/ReadMates.git`.
- The new public repository default branch is `main`.
- GitHub secret scanning and secret scanning push protection are enabled for the public repository.
- Dependabot security updates are enabled for the public repository.
- Basic `main` branch protection is enabled with force pushes and branch deletion disabled.
- The parent private source worktrees at `<local-workspace>/ReadMates-public-readiness` and `<local-workspace>/ReadMates` now use `https://github.com/beyondwin/ReadMates-legacy.git` as fetch origin and keep push URL disabled as `DISABLED_BY_CODEX_NO_PUSH_APPROVAL`.
- No production deployment secrets were connected to the public repository.
- No production secret rotation was performed.

Checklist:

- [x] Confirm the user has explicitly approved publishing.
- [x] Confirm the target repository name and owner.
- [x] Run `gitleaks` or an equivalent professional secret scan against the current candidate.
- [x] Keep the approved live demo URL `https://readmates.pages.dev` included.
- [x] Initialize a new Git repository inside `.tmp/public-release-candidate`.
- [x] Commit the candidate as the first public history commit.
- [x] Push only after explicit approval.
- [x] Enable GitHub secret scanning and branch protection in GitHub settings.
- [ ] Pending separate deployment decision: do not connect production deployment secrets to the public repo without a separate deployment automation decision.

Expected result after approval: the public repository starts from clean history and contains only reviewed public files.

Approval-gate verification, 2026-04-22:

- `git status --short --branch` exited 0 and printed:

```text
## main...origin/main
 M README.md
 M docs/deploy/README.md
 M docs/deploy/security-public-repo.md
 M docs/superpowers/plans/2026-04-22-readmates-public-repo-readiness-implementation-plan.md
 M front/tests/unit/host-session-editor.test.tsx
 M server/src/main/resources/db/dev/R__readmates_dev_seed.sql
 M server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql
 M server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt
?? .gitleaks.toml
?? scripts/
```

- `test -d .tmp/public-release-candidate` exited 0 with no stdout.
- `test ! -d .tmp/public-release-candidate/.git` exited 0 with no stdout.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0 and printed:

```text
ReadMates public-release check
  mode: candidate
  source: <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
	Running gitleaks dir <local-workspace>/ReadMates-public-readiness/.tmp/public-release-candidate
	1:11PM INF no leaks found
	Public-release check passed.
```

- `git diff --check` exited 0 with no stdout.
