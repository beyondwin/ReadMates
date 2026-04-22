# ReadMates Zero-Cost Public Deployment Implementation Plan

작성일: 2026-04-22
기준 설계 문서: `docs/superpowers/specs/2026-04-22-readmates-zero-cost-public-deploy-design.md`

> Implement this plan in small, verifiable slices. Preserve the zero-cost runtime. Do not rotate production secrets or stop OCI instances without an explicit operator action.

## Goal

Make ReadMates safe to publish as a public GitHub repository and easier to operate with a clear zero-cost deployment model:

1. Cloudflare Pages GitHub auto-deploy is the frontend source of truth.
2. OCI systemd plus scripts are the backend source of truth.
3. Real people, personal Gmail addresses, and operational secrets are absent from tracked files.
4. Free-tier guardrails and secret rotation steps are documented.

## Scope Guardrails

- Do not change app product behavior except for replacing dev/sample identities.
- Do not rotate production secrets in code.
- Do not delete or stop OCI resources in this plan.
- Do not push to GitHub from this plan.
- Do not introduce Terraform, paid CI, or paid services.
- Do not commit local provider state, local env files, private keys, or database dumps.

## Task 1 - Deployment Runbooks

Files:

- Create: `docs/deploy/README.md`
- Create: `docs/deploy/cloudflare-pages.md`
- Create: `docs/deploy/oci-backend.md`
- Create: `docs/deploy/security-public-repo.md`
- Modify: `README.md`
- Modify: existing deploy docs only to point at the new source of truth

Checklist:

- [x] Document the production map.
- [x] Document Cloudflare GitHub auto-deploy settings and the current direct-upload caveat.
- [x] Document OCI backend deploy, env ownership, and smoke checks.
- [x] Document public repo safety and secret rotation.
- [x] Document free-tier verification commands.

## Task 2 - Deployment Script Hygiene

Files:

- Modify: `deploy/oci/02-configure.sh`
- Modify: `deploy/oci/03-deploy.sh`
- Modify: `.gitignore`
- Delete: `.vercelignore`

Checklist:

- [x] Replace Vercel naming with Cloudflare app origin naming.
- [x] Include all required Spring production env vars in `02-configure.sh`.
- [x] Keep secrets supplied through environment variables, never generated into tracked files.
- [x] Update health/smoke check text to match current endpoints.
- [x] Ignore local provider state, key material, dumps, and local deploy env files.
- [x] Remove obsolete Vercel deploy config.

## Task 3 - Public Repo Identity Sanitization

Files:

- Modify tracked README, docs, dev seed SQL, frontend dev-login fixtures, and tests containing real identities.
- Modify backend helper code that hardcodes dev seed emails.

Checklist:

- [x] Replace personal Gmail addresses with reserved sample addresses.
- [x] Replace real member names with public-safe sample identities.
- [x] Replace dev Google subject strings with generic deterministic strings.
- [x] Keep local/dev/e2e login behavior working with sample identities.
- [x] Confirm no tracked file contains the old personal Gmail addresses.

## Task 4 - Public Repo Secret Scan

Checklist:

- [x] Confirm no tracked `.env`, `.vercel`, `.wrangler`, `.pem`, or `.deploy-state` files.
- [x] Confirm no tracked OCIDs, private keys, real OAuth secrets, or real BFF/DB secrets.
- [x] Confirm `.env.example` uses placeholders only.
- [x] Document manual Cloudflare billing-plan verification because the current OAuth token lacks Billing Read.

## Task 5 - Verification

Commands:

- [x] `pnpm --dir front lint`
- [x] `pnpm --dir front test`
- [x] `pnpm --dir front build`
- [x] `./server/gradlew -p server test`
- [x] `./server/gradlew -p server bootJar`
- [x] Production smoke checks through `https://readmates.pages.dev`

Expected result: all local checks pass, public repo scan has no real identities/secrets in tracked files, and production smoke checks still pass.
