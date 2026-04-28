# ReadMates Zero-Cost Public Deployment Design

## Purpose

ReadMates should stay on a zero-cost production footprint now while becoming easy to operate, publish as a public GitHub repository, and migrate to paid infrastructure later if usage grows.

The target deployment model is:

- Frontend: Cloudflare Pages connected to GitHub `main`.
- Frontend BFF: Cloudflare Pages Functions under `front/functions`.
- Backend: Spring Boot on OCI Compute, deployed manually with explicit scripts.
- Database: OCI MySQL HeatWave `MySQL.Free`.
- Secrets: stored only in Cloudflare, OCI VM environment files, local ignored files, or provider consoles.

## Goals

- Keep current production hosting at $0.
- Make deployment source of truth obvious for each layer.
- Remove Vercel-era ambiguity from docs and scripts.
- Make the repository safe to publish publicly.
- Preserve a simple paid migration path without adding Terraform, paid CI, or paid managed services now.
- Add verification steps that prove the app is deployed, configured, and still within free-tier guardrails.

## Non-Goals

- No paid migration in this phase.
- No Terraform/OpenTofu state management in this phase.
- No database provider migration.
- No automated backend deployment from GitHub Actions unless a later plan explicitly adds it.
- No production data export into the public repository.

## Current Findings

### Cloudflare

The Cloudflare account is authenticated through Wrangler and has a Pages project named `readmates`.

- Domain: `readmates.pages.dev`
- Git provider: `No`
- Production deployments are direct uploads rather than GitHub-triggered builds.
- Production secrets include `READMATES_API_BASE_URL` and `READMATES_BFF_SECRET`.

This means the live frontend can differ from GitHub `origin/main`. That is the main deployment-management problem to fix.

Cloudflare official free limits relevant to this project:

- Pages Free includes static asset hosting and limited build capacity.
- Pages Functions use Workers pricing.
- Workers Free includes a daily request allowance suitable for the current small app.

References:

- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/workers/platform/limits/

Cloudflare billing plan was not conclusively verified through API because the current Wrangler OAuth token lacks Billing Read permission. A dashboard check or a Billing Read API token is required for an exact account-plan assertion.

### OCI

OCI CLI is configured for the home region `ap-chuncheon-1`.

Observed resources:

- Compute: two `VM.Standard.A1.Flex` instances running.
- Compute total: 3 OCPU, 18 GB memory.
- Boot volumes: two 50 GB volumes, 100 GB total.
- MySQL: one ACTIVE `MySQL.Free` DB system named `readmates-mysql`.
- Usage summary for April 2026 returned `0.0 SGD`.

The observed OCI footprint is inside the relevant Always Free guardrails for the current project. The two running compute instances should still be reviewed because one Spring API instance is enough for the intended architecture.

Oracle official Always Free references:

- https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/iaas/mysql-database/doc/features-mysql-heatwave-service.html

### Repository Safety

Tracked source contains no obvious committed `.env`, `.vercel`, `.deploy-state`, or private key files, but several public-repo risks remain:

- Real personal Gmail addresses appear in README, dev seed SQL, frontend dev-login UI, tests, and older design/plan docs.
- Real Korean member names appear in the same areas.
- `deploy/oci/.deploy-state` is ignored but contains real operational secrets locally.
- `.vercel` directories exist locally and Vercel wording remains in deployment scripts.
- `.env.example` is safe as a template, but should be clearer about which values are examples.

## Target Architecture

### Frontend Deployment

Cloudflare Pages should be connected to the GitHub repository.

Production settings:

- Project name: `readmates`
- Production branch: `main`
- Root directory: `front`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Build output directory: `dist`
- Functions directory: `front/functions` through the Pages project root.

Cloudflare should be the only public frontend host. Vercel project metadata and Vercel deployment references should be removed from the repository and docs.

Wrangler direct upload can remain available as an emergency manual fallback, but it should not be the normal production path. The runbook must state that GitHub `main` is the frontend deployment source of truth.

### Backend Deployment

OCI remains the backend runtime.

Production flow:

1. Build backend locally: `./server/gradlew -p server bootJar`.
2. Deploy jar with `deploy/oci/03-deploy.sh`.
3. Restart and verify `readmates-server` systemd service.
4. Run smoke checks through the Cloudflare Pages origin.

The backend is deliberately not tied to GitHub auto-deploy in this phase. Manual backend deployment keeps the free footprint simple and avoids introducing GitHub Actions secrets, self-hosted runners, or paid deployment services.

### BFF Boundary

Browser traffic should continue to call same-origin Cloudflare routes:

- `/api/bff/api/**`
- `/oauth2/authorization/**`
- `/login/oauth2/code/**`

Cloudflare Pages Functions forward only safe upstream paths to Spring and add `X-Readmates-Bff-Secret` from `READMATES_BFF_SECRET`. Browser bundles must never contain the BFF secret.

### Database

OCI MySQL HeatWave `MySQL.Free` remains the production database.

The application continues to run Flyway migrations against MySQL. Production data must stay outside Git and outside design/plan docs.

### Backup

The current docs mention an Object Storage bucket named `readmates-db-exports`, but the bucket was not observed in the root compartment during review. The implementation should make one of these states explicit:

- Create and configure the bucket within Always Free limits, then document backup and restore rehearsal.
- Or mark Object Storage backups as planned and keep only local/manual dump guidance until the bucket exists.

The preferred state is to create the bucket and lifecycle policy later if it can be done within the free footprint.

## Configuration Ownership

### Repository

The repository may contain:

- `.env.example`
- deployment docs
- scripts with placeholder variable names
- public-safe sample data
- public-safe test fixtures

The repository must not contain:

- `.env`
- `.env.*` except `.env.example`
- `.vercel/`
- `.wrangler/`
- `deploy/oci/.deploy-state`
- `*.pem`
- SSH private keys
- OCI API private keys
- real BFF secrets
- real DB passwords
- real Google OAuth client secrets
- production export dumps
- real member emails or personal Gmail addresses

### Cloudflare

Cloudflare Pages production environment should contain:

- `READMATES_API_BASE_URL`
- `READMATES_BFF_SECRET`

Preview deployments should not receive the production BFF secret. If preview API access is needed later, it should use a separate preview backend and separate secret.

### OCI VM

`/etc/readmates/readmates.env` on the VM should contain:

- `SPRING_PROFILES_ACTIVE=prod`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `READMATES_APP_BASE_URL=https://readmates.pages.dev`
- `READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev`
- `READMATES_BFF_SECRET`
- `READMATES_BFF_SECRET_REQUIRED=true`
- `READMATES_AUTH_SESSION_COOKIE_SECURE=true`
- `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`
- `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET`
- `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile`

The existing `deploy/oci/02-configure.sh` should be updated to use Cloudflare naming, not `VERCEL_URL`, and to write all production-required variables.

### Local Development

Local secrets stay in ignored files:

- `.env.local`
- `front/.env.local`
- local OCI CLI config
- local SSH key files

Local dev should use `local-dev-secret`, `e2e-secret`, or similar non-production fixtures only.

## Public Repository Sanitization

The implementation should anonymize all real people in tracked files.

Target replacements:

- Real Gmail addresses become reserved sample addresses such as `host@example.com`, `member1@example.com`, `member2@example.com`.
- Real names become sample names or role-based names.
- Dev Google subject IDs become generic deterministic strings such as `readmates-dev-google-host`.
- README seed account tables use sample accounts.
- Tests and e2e fixtures use the same sample identities.
- Older design and plan docs are sanitized if they are tracked and will remain in the public repo.

Dev-login behavior should keep working, but the UI should display sample accounts. If real local accounts are needed by the maintainer, they should be supplied through ignored local configuration rather than committed source.

## Secret Rotation

Before or immediately after publishing the repository publicly, rotate secrets that were present in local state or were broadly copied during setup.

Recommended rotation list:

- `READMATES_BFF_SECRET`
- MySQL application user password
- MySQL admin password if still retained or used
- Google OAuth client secret
- OCI API key
- SSH deploy key if it has been copied through local notes or shared devices

Rotation order:

1. Generate new BFF secret.
2. Update Cloudflare production secret.
3. Update OCI `/etc/readmates/readmates.env`.
4. Restart Spring.
5. Smoke test `/api/bff/api/auth/me`.
6. Rotate DB and OAuth secrets with the same update-and-smoke-test loop.
7. Revoke old OCI API key after confirming the new key works.

## Free-Tier Guardrails

Add a runbook section with read-only checks:

- Cloudflare project list and deployment list.
- Cloudflare secret names without values.
- OCI compute instance shapes and total OCPU/memory.
- OCI boot/block volume totals.
- OCI MySQL shape.
- OCI monthly usage summary.

Guardrail thresholds:

- OCI A1 total should stay at or below 4 OCPU and 24 GB memory.
- OCI block volume total should stay at or below 200 GB unless a paid migration is intentionally approved.
- MySQL should remain `MySQL.Free`.
- Cloudflare should remain on Pages/Workers Free-compatible usage.
- Any new object storage or backups must be checked against Always Free limits before activation.

## Paid Migration Path

The zero-cost layout should not block a later paid migration.

Likely future upgrades:

- Add a custom domain in Cloudflare.
- Move Spring behind a managed load balancer or Cloudflare Tunnel.
- Move backend deployment to GitHub Actions with scoped secrets.
- Increase OCI compute resources or consolidate into paid managed app hosting.
- Move file storage and backups to paid Object Storage policies.
- Add observability with paid log retention.

Keeping frontend, BFF, backend, and database boundaries explicit now makes those migrations incremental later.

## Documentation Changes

The implementation should replace the current split deployment docs with a clearer deployment set:

- `docs/deploy/README.md`: top-level production map and free-tier status checks.
- `docs/deploy/cloudflare-pages.md`: GitHub Pages deployment, secrets, and smoke tests.
- `docs/deploy/oci-backend.md`: VM, systemd, env file, deploy script, health checks.
- `docs/deploy/security-public-repo.md`: public repo checklist, secret rotation, sanitization policy.

Existing `cloudflare-pages-spa.md` and `oci-mysql-heatwave.md` may be renamed or kept as lower-level references, but the top-level README must identify the current source of truth.

## Script Changes

Expected script changes:

- Update `deploy/oci/02-configure.sh` to accept Cloudflare app origin variables.
- Add required prod variables that are currently missing from the script.
- Update health-check text to use the actual available health endpoint or Cloudflare smoke tests.
- Avoid writing real IPs, OCIDs, or generated secrets to tracked files.
- Keep `.deploy-state` ignored and local-only.

## Verification

Pre-publish checks:

```bash
git ls-files | rg '(^|/)(\\.env|\\.vercel|\\.wrangler|.*\\.pem|deploy/oci/\\.deploy-state)$'
git grep -n -E 'gmai[l][.]com' -- . || true
git grep -n -E 'oci[d]1[.]' -- . || true
git grep -n -E 'PRIVATE KEY----[-]' -- . || true
git grep -n -E '(READMATES_BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS)[[:space:]]*=' -- . | grep -Ev '<(shared-bff-secret|db-password)>|[$][{]' || true
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server test
./server/gradlew -p server bootJar
```

Production smoke checks:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS https://readmates.pages.dev/api/bff/api/public/club
```

Cloudflare/OCI account checks should be documented as commands in the runbook, but commands that reveal secret values should never be included.

## Risks

- Sanitizing real emails touches many tests and dev seed files, so the implementation should be done with broad test coverage.
- Cloudflare GitHub linking is partly console-driven; the repo can document and verify it, but cannot fully enforce it from source alone.
- Secret rotation can briefly break login or API calls if Cloudflare and Spring secrets are updated out of sync.
- Two OCI compute instances are currently running; deleting or stopping one requires confirming which instance is the active backend.

## Acceptance Criteria

- GitHub `main` is the intended frontend production source of truth.
- Cloudflare direct upload is documented only as a fallback.
- OCI backend deploy remains manual and script-driven.
- Vercel references are removed or clearly marked obsolete.
- Tracked files contain no real member Gmail addresses or real operational secrets.
- Deployment docs explain exactly where each environment variable lives.
- Free-tier guardrail commands are documented.
- Secret rotation checklist is documented.
- Frontend and backend tests/builds pass after sanitization and script/doc changes.
