# ReadMates Public Repository Readiness Design

Date: 2026-04-22

## Goal

Prepare ReadMates for portfolio-oriented GitHub public release without exposing secrets, real member identity data, private deployment state, or avoidable personal/local development artifacts.

The preferred release model is a clean public repository import, not making the existing private repository public with its full history. The current private repository can remain the working source of truth until the public release branch or clean export passes the checklist below.

## Current Observations

The repository is currently private at `beyondwin/ReadMates`, and `main` is synced with `origin/main` at the time this design was written.

No high-confidence active cloud/API secret pattern was found in the checked current tree or the targeted Git history scans that looked for common AWS, GitHub, OpenAI, OCI, private key, and Google API key formats. The visible secret-like values in tracked files are placeholders or test/local values such as `local-dev-secret`, `e2e-secret`, and `<google-oauth-client-secret>`.

Two local environment files exist and are ignored by Git:

- `.env.local`
- `front/.env.local`

Those files contain real local values and must remain untracked. They must not be copied into any public export, issue, screenshot, or support request.

The main public-readiness risks are not an obvious checked-in credential. They are:

- `design/` is ignored but already tracked in Git, including generated standalone design artifacts.
- Existing docs and plans contain local absolute paths such as `<local-workspace>/ReadMates`.
- Some design/docs/test material contains personal-looking sample identifiers and private-domain member email examples.
- The repository contains many historical planning docs under `docs/superpowers`. These are useful privately, but a portfolio repo should only publish the docs that help reviewers understand the product and engineering choices.
- The repo has no committed `.gitleaks.toml`, `.secretlintrc`, or equivalent secret scanning config.

## Release Strategy

Use a clean public repository import.

The clean import should be generated from a curated release branch or temporary export directory that contains only public-approved files. It should become the first commit history of the public repository. This avoids publishing private development history, large generated design artifacts, obsolete plans, local paths, and accidental context that is not needed for a portfolio review.

The existing private repository should stay private unless a later explicit decision is made to rewrite and audit its full history.

## Public File Set

Include:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.env.example`
- `README.md`
- `compose.yml` if it remains local-development only and contains no real credential
- `front/` source, config, public headers/redirects, tests, and lockfile
- `server/` source, config, migrations, tests, Gradle wrapper, and lockfiles/wrapper metadata
- `deploy/oci/` scripts and service templates that use placeholders only
- `docs/deploy/` public deployment and security runbooks after scrubbing
- A small number of public-facing design/architecture docs if they directly explain the project

Exclude:

- `.env`, `.env.*`, except `.env.example`
- `.env.local`
- `front/.env.local`
- `.gstack/`
- `.superpowers/`
- `.idea/`
- `.playwright-cli/`
- `.tmp/`
- `output/`
- `front/output/`
- `front/dist/`
- `front/node_modules/`
- `node_modules/`
- `server/build/`
- `server/.gradle/`
- `server/.kotlin/`
- `recode/`
- `design/` generated artifacts unless a specific small asset is intentionally selected and reviewed
- `deploy/oci/.deploy-state`
- `deploy/oci/*.env`
- `deploy/oci/*.state`
- `*.pem`
- `*.key`
- `*.sql.gz`
- `*.dump`
- database dumps, screenshots with real user data, production exports, and provider state files

## Scrubbing Rules

Tracked public files must not contain:

- Real DB passwords, BFF secrets, OAuth client secrets, SSH keys, OCI API keys, provider tokens, or private keys.
- Real member emails, real Gmail addresses, real names of private club members, or real profile image URLs.
- Local absolute paths such as `<local-home>/...`.
- Machine-specific instructions that only work on the current laptop.
- Private deployment state such as OCI OCIDs, VM public IPs, private IPs that identify the current tenancy, or Cloudflare account-specific data.

Allowed examples:

- `host@example.com`, `member1@example.com`, and similar reserved sample emails.
- Clearly fake names such as `김호스트`, `안멤버1`, or English equivalents when used as seed/test data.
- Placeholder URLs such as `https://api.example.com`.
- Test-only secrets such as `test-secret`, `e2e-secret`, and `local-dev-secret`, when clearly scoped to tests or local examples.

Default URL policy:

- Public docs should use placeholders such as `https://readmates.example.com` and `https://api.example.com`.
- The live `readmates.pages.dev` URL should only stay in public docs if it is intentionally designated as a portfolio demo URL.

## Repository Guardrails

Add a repository-level secret scanning configuration before public release. The minimum acceptable setup is:

- A committed secret scanner config, preferably `.gitleaks.toml`.
- A documented local command for scanning the current tree.
- A documented command or CI job for scanning the release export before publishing.

The public repo should keep the existing GitHub Actions SHA pinning. A CODEOWNERS file for workflow and deployment paths is recommended:

- `.github/workflows/*`
- `deploy/**`
- `docs/deploy/**`
- `.env.example`

The public repo should not receive GitHub Actions deployment secrets until there is a separate decision to automate production deployment.

## Secret Rotation Policy

If any production secret value was ever copied into a tracked file, terminal transcript, screenshot, issue, PR comment, support request, or shared note, rotate it before or immediately after public release.

Recommended first-release rotation order:

1. Generate a new `READMATES_BFF_SECRET`.
2. Update Cloudflare Pages Functions secret.
3. Update OCI VM `/etc/readmates/readmates.env`.
4. Restart Spring and smoke test `/api/bff/api/auth/me`.
5. Rotate the MySQL application user password.
6. Rotate Google OAuth client secret.
7. Review OCI API keys and revoke any key that was copied into repo-local material.
8. Rotate SSH deploy keys if any key path, material, or screenshot may have exposed them.

Rotate one boundary at a time and smoke test after each step.

## Clean Import Flow

1. Create a temporary release export from the private repository.
2. Copy only the approved public file set.
3. Remove tracked-but-ignored artifacts such as `design/`.
4. Scrub docs and tests for local paths, private identifiers, and real service details.
5. Add secret scanning config and public-release checklist commands.
6. Run the verification suite.
7. Initialize a fresh Git repository from the clean export.
8. Create the first public commit.
9. Push to a new GitHub repository or replace an empty public repository.
10. Enable GitHub secret scanning and branch protection in GitHub settings.

## Verification

The release candidate must pass:

- `git status --short --ignored` review to confirm ignored local files are not staged.
- `git ls-files` scan for forbidden tracked paths.
- Current-tree secret scan.
- Git history scan if publishing rewritten history; clean import avoids private history publication.
- PII and local-path grep across tracked files.
- `pnpm audit --prod` from `front/`.
- Frontend lint, unit tests, and build.
- Backend test suite.
- Review of `.github/workflows/ci.yml` for pinned actions and lack of inline secrets.
- Review of deployment docs for placeholders and no account-specific provider state.

## Error Handling

If a real secret is found in the current tree, stop the release, revoke or rotate the credential, remove the value, and repeat the scan.

If a real secret is found only in private history, do not make the existing repository public. Use clean import. Rotate the secret if it may still be active or if its exposure window is unclear.

If a public release candidate contains ambiguous personal data, remove or anonymize it unless the user explicitly confirms it is synthetic and intended for the portfolio.

If CI or tests fail during release verification, do not publish the public repository until the failure is either fixed or documented as unrelated and accepted.

## Public README Shape

The public README should be reviewer-focused:

- What ReadMates does.
- Product scope and screenshots only if they contain sample data.
- Architecture diagram and trust boundaries.
- Security design: BFF secret, same-origin mutation checks, HttpOnly session cookie, invite-only membership, role guards.
- Local development setup.
- Test commands.
- Deployment overview with placeholders.
- Public repo safety note that production secrets are managed outside Git.

The public README should avoid long private planning history. Detailed implementation plans can stay private unless a specific one is polished into a concise architecture note.

## Approval Criteria

ReadMates is ready to publish as a portfolio repository when:

- The public candidate contains no ignored local env files or provider state.
- The public candidate contains no generated design bundle or local-only output artifacts.
- Secret scanning and targeted grep scans return no high-confidence findings.
- Personal-looking identifiers are either removed, anonymized, or explicitly approved as synthetic.
- Docs use placeholders unless a live demo URL is intentionally public.
- Frontend and backend verification commands pass.
- The public repository starts from a clean first commit or other explicitly approved sanitized history.

