# ReadMates Deployment Runbook

Last reviewed: 2026-04-22

This directory contains public-safe deployment notes for ReadMates. The docs describe the intended production shape and the security boundaries, while keeping account-specific values and private operational state out of Git.

Approved portfolio demo URL: [https://readmates.pages.dev](https://readmates.pages.dev)

## Deployment Shape

| Layer | Runtime | Notes |
| --- | --- | --- |
| Frontend SPA | Cloudflare Pages | Builds `front/dist` from the Vite app |
| BFF and OAuth proxy | Cloudflare Pages Functions | Functions live in `front/functions` |
| Spring API | OCI Compute or equivalent VM | Runs the Spring Boot JAR behind a reverse proxy |
| Reverse proxy | Caddy | Terminates the direct API origin when used |
| Database | MySQL 8 compatible service | OCI MySQL HeatWave is the documented target |
| Migrations | Flyway | Applied by Spring on startup |

Production secrets stay outside Git. Public docs use variable names and placeholders only. Real values belong in Cloudflare Pages secrets, server runtime environment files, Google Cloud, OCI, or ignored operator-managed files.

## BFF Security Boundary

```text
Browser
  |
  | same-origin /api/bff/**
  v
Cloudflare Pages Functions
  |
  | X-Readmates-Bff-Secret + forwarded cookies
  v
Spring Boot /api/**
```

The browser-facing trust boundary is Cloudflare Pages, not the direct Spring API origin. Browsers call same-origin `/api/bff/**`; Pages Functions forward the request to Spring and attach `X-Readmates-Bff-Secret`. Spring validates that header on API requests and should fail startup in production when `READMATES_BFF_SECRET` is missing.

The BFF secret must never be exposed through `VITE_*`, `NEXT_PUBLIC_*`, static assets, browser logs, screenshots, or public docs.

Mutation requests also check the request origin or referer against the allowed app origins.

## Session Cookie Posture

Spring issues the `readmates_session` cookie after successful Google OAuth login.

- `HttpOnly`: browser JavaScript cannot read the token.
- `SameSite=Lax`: normal login and navigation work while reducing cross-site request risk.
- `Secure` in production: set `READMATES_AUTH_SESSION_COOKIE_SECURE=true` so the cookie is HTTPS-only.
- Session tokens are matched server-side through hashed records in `auth_sessions`.

## Membership And Authorization

ReadMates is invite-only at the product level.

- A host creates invitation links.
- A Google user can become pending approval when no accepted invitation is available.
- A host approves or rejects pending members and can suspend, restore, deactivate, or remove members from the current session.
- Host APIs require an active `host` role.
- Member APIs require an allowed `member` state and, for current-session writes, active participation in that session.
- Public APIs return only explicitly published public sessions.

## Environment Variables

Cloudflare Pages Functions:

```text
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<bff-secret>
```

Spring:

```text
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=<jdbc-mysql-url>
SPRING_DATASOURCE_USERNAME=<db-user>
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-bff-secret-as-pages-functions>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
```

Use placeholders in committed files. Do not paste real secret values into docs, issues, terminal transcripts, screenshots, or release notes.

## Deployment Steps

Frontend:

1. Configure Cloudflare Pages with root directory `front`.
2. Use install command `pnpm install --frozen-lockfile`.
3. Use build command `pnpm build`.
4. Use output directory `dist`.
5. Set the Pages Function secrets listed above.

Backend:

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

The OCI scripts are placeholder-based and expect operator-supplied values. They should not contain real tenancy IDs, API keys, database passwords, private IPs, or deploy state.

## Smoke Checks

Use the public demo origin when checking the approved portfolio deployment:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS https://readmates.pages.dev/api/bff/api/public/club
```

Use placeholders for direct backend checks in public docs:

```bash
curl -sS https://api.example.com/internal/health
```

## Cost Guardrails

The documented target stays compatible with free or low-cost tiers unless there is a separate explicit upgrade decision:

- Cloudflare Pages and Workers-compatible free usage
- OCI A1 Compute within free-tier limits
- OCI boot/block volume within free-tier limits
- OCI MySQL HeatWave `MySQL.Free` where available

Avoid adding production deployment credentials to GitHub Actions unless automated backend deployment is explicitly approved later.

## Public Release Checks

Before publishing a public repository, generate and inspect the clean release candidate:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

The candidate should not contain local env files, provider state, database dumps, key material, generated design artifacts, private planning docs, screenshots with real data, or private deployment state.

## Related Docs

- [Cloudflare Pages deployment](cloudflare-pages.md)
- [OCI backend deployment](oci-backend.md)
- [OCI MySQL HeatWave and backups](oci-mysql-heatwave.md)
- [Cloudflare Pages SPA notes](cloudflare-pages-spa.md)
- [Public repository security checklist](security-public-repo.md)
