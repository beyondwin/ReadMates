# Release Readiness Review

남은 리스크, release readiness, merge 후 안전성, ship 가능 여부를 확인할 때 사용하는 체크리스트입니다. 구현 계획의 완료 여부와 테스트 통과 여부만으로 release risk가 닫혔다고 판단하지 않습니다.

## 2026-06-30 observability stack production deploy repair

- Scope reviewed: `deploy/oci/06-deploy-observability-stack.sh`, production Prometheus startup logs, and the production observability stack deployment path for Prometheus and Grafana.
- Root cause: macOS tar emitted AppleDouble `._*.yml` files into the alert archive. Local `promtool` validated the real rule files, but production Prometheus loaded `/etc/prometheus/alerts/*.yml` and rejected the generated `._aigen-rules.yml` metadata file.
- Repair: observability archive creation now disables macOS copyfile metadata, suppresses extended-attribute headers, and excludes `._*` and `.DS_Store`; VM installation also deletes stale metadata files from Prometheus alerts, Grafana provisioning, and Grafana dashboard directories before compose startup.
- Partial-stack target health repair: Prometheus+Grafana-only deploys now send a Prometheus config without Alertmanager scrape/alerting targets, avoiding intentional `alertmanager` target-down noise until SMTP-backed Alertmanager is actually deployed.
- Runtime apply repair: the deploy script now restarts Prometheus after `compose up` so an already-running Prometheus container applies changed scrape/rule config during the same deploy.
- Grafana credential apply repair: the deploy script now resets the Grafana admin password after startup using the container's actual Grafana home/config paths and verifies authenticated dashboard search so regenerated VM-local credentials are accepted when a persisted Grafana volume already exists.
- Additional production intake repair: Spring Security now treats `POST /api/observability/frontend-events` like other trusted BFF mutation paths for CSRF and authorization, while `BffSecretFilter` still requires the BFF secret and allowed origin. Without this, the endpoint returned `403` after BFF secret/origin validation because it fell through to the generic member-session `/api/**` rule.
- Public safety: the repair does not add credentials, domains, host identifiers, alert recipients, provider IDs, deployment state, or token-shaped values to the repo. Grafana credentials remain VM-local runtime environment only.
- Local verification:
  - `bash -n deploy/oci/06-deploy-observability-stack.sh scripts/public-release-check.sh` - pass.
  - `shellcheck deploy/oci/06-deploy-observability-stack.sh` - pass.
  - `git diff --check -- deploy/oci/06-deploy-observability-stack.sh CHANGELOG.md docs/development/release-readiness-review.md` - pass.
  - `./server/gradlew -p server integrationTest --tests com.readmates.observability.adapter.in.web.FrontendObservabilityBffSecurityTest` - pass.
- Verification plan: publish `v1.16.2`, promote the backend image, redeploy Prometheus/Grafana on the production VM, then verify Prometheus readiness, `readmates-server` scrape target, Grafana health, and the frontend telemetry metrics after a production BFF smoke.

## 2026-06-30 v1.16.1 frontend observability intake repair

- Scope reviewed: production `v1.16.0` frontend observability smoke, Pages BFF telemetry function, Spring `BffSecretFilter`, and the existing BFF secret diagnostic route.
- Release classification: patch release. The change is limited to Pages Functions forwarding of safe request metadata for the frontend telemetry intake. No DB migration, server API response contract, OAuth scope, auth cookie format, BFF secret format, backend runtime behavior, or deploy workflow trigger change is included.
- Root cause: `POST /api/bff/observability/frontend-events` sanitized and forwarded telemetry plus the BFF secret, but did not forward browser `Origin` or `Referer`. Spring correctly rejects mutating `/api/**` requests that have a valid BFF secret but no allowed origin evidence, so production telemetry was blocked with `403`.
- Public safety: the repair forwards only `Origin` and `Referer`, which are already part of the established BFF security boundary. It does not forward browser-supplied `X-Readmates-Bff-Secret`, club headers, cookies beyond the existing path behavior, raw URLs, request bodies beyond sanitized telemetry, stack traces, member identifiers, private domains, OCIDs, VM IPs, or deployment state.
- Local repair verification before publication:
  - `npx --yes pnpm@10.33.0 --dir front test -- --run tests/unit/functions/frontend-observability-bff.test.ts` - pass, 164 files and 1306 tests under the project Vitest task.
- Residual release-operation risk: tag workflows, Cloudflare Pages production deployment, GitHub Release publication, OCI backend tag consistency, production telemetry smoke, and production Prometheus/Grafana confirmation remain pending until `v1.16.1` is published and deployed.

## 2026-06-30 v1.16.0 pre-release readiness

- Scope reviewed: `v1.15.1..HEAD` on local `main`, covering frontend runtime observability v2, same-origin BFF telemetry intake, Spring frontend observability metrics/SLOs, frontend-runtime Grafana dashboard, production observability bootstrap docs/scripts, and the platform-admin workspace switcher.
- Release classification: minor release. The release adds operator observability and frontend/admin UX behavior, plus additive server telemetry intake. No Flyway migration, OAuth scope change, auth cookie format change, BFF secret format change, or deploy workflow trigger change is included.
- Deployment impact: tag push must run both `Deploy Front` and `Deploy Server Image`. Because server runtime code and Pages Functions both changed, release completion requires OCI Compose backend promotion to `ghcr.io/<owner>/<repo>/readmates-server:v1.16.0` after the server image workflow promotes that tag.
- Public safety: telemetry remains a fail-open side path and uses only normalized route patterns, enum-like API groups, status classes, safe error codes, severity/result/navigation type, and allowlisted dropped reasons. Raw URL, query string, club slug value, UUID, email, display name, member/user identifier, stack trace, request/response body, cookie, OAuth code, token, private domain, OCID, VM IP, and deployment state are prohibited.
- Local merged-main verification before publication:
  - `git diff --check -- front server ops docs CHANGELOG.md` - pass.
  - `npx --yes pnpm@10.33.0 --dir front lint` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test` - pass, 164 files and 1306 tests.
  - `npx --yes pnpm@10.33.0 --dir front build` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test:e2e` - pass, 68 Playwright tests.
  - `./server/gradlew -p server check architectureTest` - pass.
  - `./scripts/lint-grafana-dashboards.sh` - pass.
  - `./scripts/validate-prometheus-rules.sh` - pass.
  - `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass; gitleaks reported no leaks.
  - `graphify update .` plus freshness audit - pass for commit `f1f7382f`.
- Additional local observability evidence:
  - `npx --yes pnpm@10.33.0 --dir front test -- observability route-observability readmates-fetch frontend-observability-bff` - pass.
  - `./server/gradlew -p server unitTest --tests 'com.readmates.observability.*'` - pass.
  - `npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2` - pass; route count 2, failed route count 0.
- Skipped before publication: tag-triggered `Deploy Front`, tag-triggered `Deploy Server Image`, GitHub Release creation, OCI Compose backend promotion, production scrape/dashboard data confirmation, external synthetic monitor setup, production OAuth/provider-console checks, and post-deploy smoke. These require pushed `main`/tag or production operator access.
- Residual risk: no known local release-readiness blocker remains. Release-operation risk remains until the pushed tag workflows pass, the backend is promoted to the same image tag, GitHub Release exists, BFF/OAuth smoke passes, and production Prometheus/Grafana shows the new frontend telemetry metrics after real browser traffic or an explicit production telemetry smoke.

## 2026-06-30 frontend observability v2 closeout

- Scope reviewed: frontend runtime telemetry contracts, BFF telemetry intake, Spring `readmates.frontend.*` Micrometer metrics, Grafana dashboard JSON, and observability docs.
- Release classification: operational observability side path. No DB migration, product API response contract, OAuth scope, auth cookie contract, user-facing route behavior, or deploy workflow behavior changes are included.
- Public safety: browser telemetry sends normalized route patterns, enum-like API groups, status classes, safe error codes, and optional short hash prefixes only. Raw URL, query string, club slug value, UUID, email, display name, account name, membership/user id, stack trace, request/response body, token, private domain, OCID, VM IP, and deployment state are prohibited.
- Risk repair before merge: the BFF sanitizer now forwards safe `droppedReasons` for rejected telemetry events so normal browser traffic increments `readmates.frontend.observability.dropped` instead of silently losing validation failures.
- Local verification before merge:
  - `npx --yes pnpm@10.33.0 --dir front test -- observability route-observability readmates-fetch frontend-observability-bff` - pass.
  - `npx --yes pnpm@10.33.0 --dir front lint` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test` - pass.
  - `npx --yes pnpm@10.33.0 --dir front build` - pass.
  - `npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2` - pass; route count 2, failed route count 0, summary `.tmp/performance/lighthouse-preview/2026-06-30T05-47-44-735Z/summary.md`.
  - `npx --yes pnpm@10.33.0 --dir front test:e2e` - pass, 68 Playwright tests.
  - `./server/gradlew -p server unitTest --tests 'com.readmates.observability.*'` - pass.
  - `./server/gradlew -p server clean test` - pass.
  - `./server/gradlew -p server check architectureTest` - pass.
  - `./server/gradlew -p server architectureTest` - pass.
  - `./scripts/lint-grafana-dashboards.sh` - pass.
  - `./scripts/validate-prometheus-rules.sh` - pass.
  - `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass.
  - `graphify update .` plus CPE Graphify freshness audit - pass.
- Skipped before merge: production scrape, dashboard data confirmation, production external blackbox monitor installation, and production OAuth/provider-console/tag workflows. These require traffic or operator access and are not local merge evidence.
- Residual risk: no known local release-readiness blocker remains after dropped-metric repair, local production-build Lighthouse preview smoke, frontend/server/observability checks, public-release scan, and Graphify freshness. Production scrape/dashboard data and an always-on external synthetic monitor remain post-deploy operational evidence, not local merge evidence.

## 2026-06-30 production observability bootstrap closeout

- Scope reviewed: local `main..codex/2026-06-30-readmates-production-observability-v1-20260630-040540` before merge, covering OCI observability deploy helper values, Grafana provisioning/runbook closure, alert triage docs, and public-release scanner docs.
- Release classification: operator-facing deployment/runbook and public-release safety documentation. No Flyway migration, public API contract, auth/BFF token handling, OAuth scope, Pages Functions behavior, frontend route behavior, secret/session handling, or production server code behavior is included.
- CI/deploy impact: `deploy/oci/06-deploy-observability-stack.sh` keeps the same manual VM deployment entry point and now uses public-safe dummy env values when Alertmanager or Grafana is intentionally not selected. The script still requires private operator env before production deployment.
- Public safety: Grafana admin credentials and Alertmanager SMTP values remain VM-local env only. Docs use `example.com` and shell env guards instead of VM IPs, private domains, SMTP credentials, OCIDs, deployment state, or token-shaped examples.
- Local verification before merge:
  - `bash -n deploy/oci/06-deploy-observability-stack.sh scripts/public-release-check.sh scripts/validate-prometheus-config.sh scripts/validate-prometheus-rules.sh scripts/validate-alertmanager-config.sh` - pass.
  - `./scripts/lint-grafana-dashboards.sh` - pass, 3 dashboards.
  - `./scripts/validate-prometheus-rules.sh` - pass, 17 rules across 7 files.
  - `./scripts/validate-prometheus-config.sh` - pass.
  - `./scripts/validate-alertmanager-config.sh` - pass.
  - Generated placeholder `alertmanager.env` and `grafana.env` plus `docker compose -f compose.infra.yml config` - pass, with `grafana` and `127.0.0.1:3001:3000` present.
  - `git diff --check --` changed deploy/docs files - pass.
  - `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass; gitleaks reported no leaks.
  - `graphify update .` plus CPE Graphify freshness audit - pass; `graphify-out/` remains ignored and evidence is command-based.
- Skipped before merge: production metrics/dashboard deploy, full Alertmanager deploy, Grafana SSH tunnel login, controlled inbox alert, production OAuth/provider-console/tag workflows. These require operator-provided VM, SSH, Grafana password, SMTP, browser, or release-operation access and are not local merge evidence.
- Residual risk: no known local release-readiness blocker remains after static, compose, observability, public-release, Graphify, CHANGELOG, and closeout-doc evidence. Same-VM observability still cannot report a total VM outage, and production proof remains an operator deployment step after private env is available.

## 2026-06-29 v1.15.1 server image repair readiness

- Scope reviewed: `v1.15.0` tag operation, failed `Deploy Server Image` run `28338469979`, and local server runtime dependency graph before publishing `v1.15.1`.
- Release classification: patch release to unblock server release-image Trivy gate. No Flyway migration, public API contract, auth/BFF token handling, OAuth scope, Pages Functions behavior, frontend behavior, secret/session handling, or deploy workflow trigger change is included.
- `v1.15.0` release operation status: `Deploy Front` passed for tag `v1.15.0`; `Deploy Server Image` built and pushed a scan candidate but failed before release-tag promotion. Therefore `ghcr.io/<owner>/<repo>/readmates-server:v1.15.0` was not promoted by the deploy workflow.
- Root cause: Trivy found four fixed HIGH Jackson databind findings in the scan candidate: CVE-2026-54512 and CVE-2026-54513 in `com.fasterxml.jackson.core:jackson-databind 2.21.2`, plus the same CVEs in `tools.jackson.core:jackson-databind 3.1.2`.
- Server impact: runtime dependency resolution now forces `com.fasterxml.jackson.core:jackson-databind` to `2.21.4` and `tools.jackson.core` modules to `3.1.4`; `jackson-annotations` is constrained to published `2.21` because `2.21.4` is not available.
- Remote CI impact found during publication: `main` CI run `28338937980` passed Scripts, Public release safety, Design system, Frontend, Frontend visual regression, Backend, and all E2E shards, but `Backend Integration` failed in two `MySqlQueryPlanTest` cases. The failing EXPLAIN plans used full scans on `sessions` only because the shallow dev seed made MySQL's cost model prefer a tiny-table scan. The affected tests now seed the existing large read-path fixture before checking the session cursor plans, keeping the index-use contract while removing small-cardinality optimizer noise.
- Local dependency verification before publication: `./server/gradlew -p server dependencyInsight --dependency jackson-databind --configuration runtimeClasspath` selected `com.fasterxml.jackson.core:jackson-databind 2.21.4` and `tools.jackson.core:jackson-databind 3.1.4`.
- Local server/image verification before publication:
  - `./server/gradlew -p server clean check bootJar` - pass.
  - `./server/gradlew -p server integrationTest` - pass.
  - `./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest` - pass after remote CI EXPLAIN fixture repair.
  - `docker build -f server/Dockerfile.release server -t readmates-server:v1.15.1-local` - pass.
  - `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.70.0 image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln readmates-server:v1.15.1-local` - pass, 0 Ubuntu and Java HIGH/CRITICAL findings.
  - `git diff --check -- server/build.gradle.kts server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt CHANGELOG.md docs/development/release-readiness-review.md` - pass.
  - `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass; gitleaks reported no leaks.
- Release plan: do not force-update `v1.15.0`; publish `v1.15.1`, confirm tag-triggered `Deploy Front` and `Deploy Server Image`, promote OCI Compose backend to `ghcr.io/<owner>/<repo>/readmates-server:v1.15.1`, create the GitHub Release, then run sanitized BFF/OAuth/admin/host smoke checks.
- Residual risk: remote server image Trivy pass, GHCR release-tag promotion, OCI backend promotion, GitHub Release publication, and post-deploy smoke remain pending until the pushed `v1.15.1` tag workflows and production promotion complete.

## 2026-06-29 v1.15.0 pre-release readiness

- Scope reviewed: local `v1.14.1..HEAD` and `main...origin/main` before publishing `v1.15.0`.
- Release classification: minor frontend/operator workflow, frontend quality tooling, CI visual-regression gate, observability documentation, and build/dev dependency security cleanup. No Flyway migration, auth/BFF token handling, OAuth scope, Pages Functions behavior, secret/session handling, or deploy workflow trigger change is included.
- Server impact: production server code change is limited to extracting session-closing SQL strings into constants in `JdbcSessionClosingStatusAdapter`; server performance fixture/query-plan tests also changed. No DB migration or public API contract change was found.
- CI/CD impact: `.github/workflows/ci.yml` now adds the `Frontend visual regression` job that runs `pnpm test:ct:docker` against committed component-test baselines so CI uses the same canonical renderer as baseline generation; tag-triggered `Deploy Front` and `Deploy Server Image` workflows are unchanged.
- Local verification before publication:
  - `git diff --check origin/main...HEAD -- . ':(exclude)docs/superpowers/**'` - pass.
  - `git diff --check -- . ':(exclude)docs/superpowers/**'` - pass.
  - `git diff --cached --check -- . ':(exclude)docs/superpowers/**'` - pass.
  - `bash -n scripts/*.sh deploy/oci/*.sh` - pass.
  - `shellcheck scripts/*.sh deploy/oci/*.sh` - pass.
  - `bash scripts/aigen-pii-check.sh` - pass, 5 invariants.
  - `npx --yes pnpm@10.33.0 --dir front lint` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test` - pass, 157 files and 1280 tests.
  - `npx --yes pnpm@10.33.0 --dir front test:coverage` - pass, 157 files and 1280 tests.
  - `npx --yes pnpm@10.33.0 --dir front build` - pass, no large-chunk warning.
  - `npx --yes pnpm@10.33.0 --dir front zod:export-fixtures` plus `git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/` - pass.
  - `./server/gradlew -p server check` - pass.
  - `./server/gradlew -p server clean check bootJar` - pass.
  - `./server/gradlew -p server integrationTest` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test:e2e` - pass, 67 Playwright tests.
  - `./scripts/build-public-release-candidate.sh` - pass.
  - `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass; gitleaks reported no leaks.
  - `./scripts/lint-grafana-dashboards.sh` - pass, 3 dashboards.
  - `./scripts/validate-prometheus-rules.sh` - pass, 17 rules across 7 files.
  - `./scripts/validate-prometheus-config.sh` - pass.
  - `./scripts/validate-alertmanager-config.sh` - pass.
  - `npx --yes pnpm@10.33.0 design:check` - pass, design system 7 files/13 tests and design docs 1 file/2 tests.
  - `npx --yes pnpm@10.33.0 --dir front test:ct:docker` - pass, 7 Playwright CT tests.
  - `npx --yes pnpm@10.33.0 --dir front build:budget` - pass; wrote `.tmp/performance/build-budget.md`.
  - `npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2` - pass after host dependency restoration; wrote `.tmp/performance/lighthouse-preview/2026-06-28T22-24-42-078Z/summary.md`, route count 2, failed route count 0.
- Local environment repair: Docker CT intentionally runs inside the Playwright Linux image and recreated the host-mounted workspace `node_modules` with Linux optional dependencies. The first preview Lighthouse run then failed on missing macOS Rolldown bindings. `CI=true npx --yes pnpm@10.33.0 install --frozen-lockfile` restored host dependencies, and the unchanged Lighthouse command passed afterward.
- Remote CI repair before tag: pushed `main` run `28338141231` passed all jobs except the new `Frontend visual regression` job. The failure was renderer mismatch, not app behavior: CI ran host `pnpm test:ct` on `ubuntu-24.04`, while the committed baselines were generated with the Docker renderer. `.github/workflows/ci.yml` now runs `pnpm test:ct:docker` for that job, matching the documented baseline path and the local passing gate.
- Public safety: the clean public release candidate excludes generated dist, reports, screenshot artifacts, local `.tmp` outputs, design workspace outputs, and private/deployment-shaped files. The scanner passed on the candidate.
- Skipped before publication: GitHub Actions status, tag-triggered `Deploy Front`, tag-triggered `Deploy Server Image`, OCI Compose backend promotion, GitHub Release publication, production OAuth, provider-console checks, and post-deploy smoke. These require pushed `main`/tag or production operator access.
- Residual risk: no known local release-readiness blocker remains after local CI/CD parity, public-release safety, CT, E2E, and release documentation checks. Operational release risk remains until the pushed tag workflows, backend promotion, GitHub Release, and sanitized production smoke checks succeed for `v1.15.0`.

## 2026-06-28 Frontend performance budget and bundle diet closeout

- Scope reviewed: local frontend build tooling, Vite chunk grouping, host route entry splitting, preview Lighthouse diagnostic path, and docs.
- Release classification: frontend build/test tooling plus route-entry chunk refactor. No server API contract, DB migration, auth/BFF token, OAuth scope, Cloudflare Pages Functions behavior, release image behavior, or deploy workflow behavior changed.
- Product evidence: production build assets are reported under `.tmp/performance/build-budget.*`; split vendor, host route chunks, app entry, and global CSS stay within hard-gated budgets. The current global CSS bundle is about 104.5 kB against a 110 kB hard gate.
- Lighthouse evidence: preview mode runs against Vite production build output, points the Vite proxy at a local public-safe API mock upstream, records `server profile: vite-preview`, and separates route entry failures from Lighthouse findings. Final preview smoke wrote `.tmp/performance/lighthouse-preview/2026-06-27T17-40-38-784Z/summary.md` with route count 2 and failed route count 0, without local backend proxy `ECONNREFUSED` or preview shutdown failure noise.
- Public safety: generated `.tmp/performance/` artifacts are ignored/local-only and public release candidate checks passed without adding build, Lighthouse, screenshot, secret, private-domain, local-path, OCID, deployment-state, or token-shaped artifacts.
- Local verification before merge:
  - `npx --yes pnpm@10.33.0 --dir front lint` - pass.
  - `npx --yes pnpm@10.33.0 --dir front test` - pass, 157 files and 1280 tests.
  - `npx --yes pnpm@10.33.0 --dir front build` - pass, with the previous Vite 350 kB chunk warning gone.
  - `npx --yes pnpm@10.33.0 --dir front build:budget` - pass, hard-gated JS and CSS budgets passed.
  - `npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/build-budget.test.ts tests/performance/lighthouse-preview.test.ts` - pass, 2 files and 8 tests.
  - `npx --yes pnpm@10.33.0 --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts tests/e2e/manual-notifications.spec.ts tests/e2e/host-club-operations.spec.ts` - pass, 9 Playwright tests.
  - `npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2` - pass; wrote `.tmp/performance/lighthouse-preview/2026-06-27T17-40-38-784Z/summary.md`, route count 2, failed route count 0, with a local API mock upstream and clean preview cleanup.
  - `git diff --check -- CHANGELOG.md docs/development/performance-budget.md docs/development/release-readiness-review.md` - pass.
  - `./scripts/build-public-release-candidate.sh` - pass.
  - `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass.
- Skipped before merge: production OAuth, VM, provider-console, release tag workflow, OCI compose promotion, GitHub Release publication, and post-deploy smoke. These require release-operation access after merge and are not local evidence for this frontend tooling branch.
- Residual risk: the Vite 350 kB warning is gone. No known local build-budget or preview-Lighthouse residual remains after the CSS hard gate and local preview API mock. Production OAuth, VM/provider-console checks, release tag workflows, OCI compose promotion, GitHub Release publication, and post-deploy smoke remain release-operation evidence after merge/deploy, not local evidence for this frontend tooling branch.

## 2026-06-27 CT visual regression CI gate closeout

- Scope reviewed: local `main..HEAD` after adding the CI visual-regression job, Docker CT validation script, and contributor docs.
- Release classification: CI/test tooling and contributor documentation. No production route composition, route loader, auth/BFF proxy, server API contract, DB migration, OAuth scope, release image, or deploy workflow behavior changed.
- Product evidence: existing Playwright CT baselines for shared UI, host closing board, platform-admin support, and public records are now verified by a dedicated GitHub Actions job without snapshot updates.
- Renderer-risk closure: baseline creation remains Docker-only through `pnpm --dir front test:ct:update:docker`; local macOS developers can validate without snapshot updates through `pnpm --dir front test:ct:docker`.
- Public safety: `front/__screenshots__` remains committed visual-regression evidence but is excluded from `.tmp/public-release-candidate`; public release scan passed after the CI/doc changes.
- Local verification before merge: `pnpm --dir front test:ct:docker`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `find .tmp/public-release-candidate -path '*__screenshots__*' -print`, and `git diff --check` passed.
- Skipped before merge: production OAuth, VM, provider-console, release tag, deploy workflow execution, OCI compose promotion, GitHub Release publication, and post-deploy smoke. These require release-operation access after merge and are not local evidence for this CI/docs branch.
- Residual risk: no known local release-readiness residual remains after CT, frontend, public-release, docs, and screenshot-exclusion evidence. First GitHub Actions run on the pushed branch remains remote CI evidence outside the local working tree.

## v1.11.0 post-release smoke

> 자동 실행 출처: [docs/superpowers/plans/2026-05-18-readmates-v1-11-0-followups-autonomous-implementation-plan.md](../superpowers/plans/2026-05-18-readmates-v1-11-0-followups-autonomous-implementation-plan.md).

- Task 1 (Redis aigen residual): 2026-05-18T12:12Z UTC, automated. Keys: 0. Action: no-op. Ledger event: AIGEN_RESIDUAL_VERIFIED.
- Task 2 Step 1 (Local Playwright E2E): 2026-05-18T12:18Z UTC, automated. Specs: 17 pass / 0 fail (grep fallback `@aigen|host`; initial `@aigen|host session editor|platform-admin` matched 0 specs). Log: .tmp/v1.11.0-followups/playwright-e2e-output.log.
- Task 2 Step 2-3 (Production host smoke): 2026-05-18T12:18Z UTC, MANUAL REQUIRED. Google OAuth automation blocked at https://accounts.google.com/v3/signin/identifier (no redirect back to readmates.pages.dev under automated browser, per spec S1.4.3).
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 2 production host smoke — 2026-05-31T12:17Z UTC, browser-profile OAuth smoke. Started from `https://readmates.pages.dev/login`, selected an existing Google account in Chrome, and confirmed redirect back to the ReadMates production origin at `/clubs/<slug>/app`. No credentials, cookies, or account identifiers were captured.
- Task 5 (OAuth happy path): 2026-05-18T12:24Z UTC, MANUAL REQUIRED. Playwright MCP redirect from https://readmates.pages.dev/login reached https://accounts.google.com/v3/signin/identifier; Google blocked credential entry under automated browser (spec §S1.4.3 escape hatch). Artifact: .tmp/v1.11.0-followups/oauth-flow-results.json.
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 5 OAuth happy-path — 2026-05-31T12:17Z UTC, same browser-profile OAuth smoke confirmed `/login` -> Google account chooser -> ReadMates production app return. CLI smoke also confirmed Google receives `redirect_uri=https://readmates.pages.dev/login/oauth2/code/google`.
- Task 3 (DB backup → Object Storage + daily timer): 2026-05-18T12:37Z UTC, partial. Object upload: automated via local OCI CLI fallback. Uploaded `mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz` to the configured DB export bucket with a recorded SHA-256 metadata value and release tag. Bucket names, namespaces, and provider identifiers are intentionally omitted from repo docs. Local unit files + runbook committed. Timer install on VM: BLOCKED (OCI CLI not installed on VM, ENV_BLOCKER per spec §S1.4.3). Artifact: .tmp/v1.11.0-followups/oci-object-head.json.
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 3 daily backup timer — 2026-05-31T12:09Z UTC, automated with operator CLI. Installed backup scripts, backup env/defaults, OCI CLI, instance-principal Object Storage policy, `backup-mysql.service`, and `backup-mysql.timer` on the ReadMates VM. Verification: `backup-mysql.timer` is enabled/active with next run scheduled for 2026-06-01T04:19:30Z UTC, and a manual `backup-mysql.service` run uploaded both `mysql/readmates-20260531T120949Z.sql.gz` and `mysql/readmates-20260531T120949Z.sql.gz.sha256`.

## 2026-05-31 Ops Insight & Release Trust residual policy

For the Ops Insight & Release Trust branch, residuals are classified as:

- **Closed by automated evidence** only when a repo command, script, test, or public-safe document proves the condition without private operator access.
- **Manual operational action remains** when Google OAuth credential entry, production host access, VM access, or provider console access is required.
- **Out of scope for this branch** when the item predates the branch and is not changed by analytics, observability, release-readiness, docs, scripts, or deploy behavior.

The v1.11.0 production OAuth and backup timer items are closed by 2026-05-31 operational evidence. Analytics v2 and observability truth cleanup did not close those items by themselves; the closure evidence above came from browser-profile OAuth smoke, VM timer installation, and manual backup upload proof.

## 2026-06-26 Server read-model performance confidence v2 closeout

- Scope reviewed: local `main..codex/readmates-server-read-model-performance-confidence-v2-20260626-175248`.
- Release classification: server integration-test confidence and contributor showcase docs. No production server code, DB migration, public API contract, auth/BFF token, frontend route/UI behavior, CI/deploy workflow, or release image behavior changed.
- Product evidence: `current-session` and `archive` session detail now have deterministic public-safe large-fixture query-budget guards. Archive session detail also has MySQL EXPLAIN evidence for header, public batch, personal batch, and feedback document lookup access paths.
- CHANGELOG: no entry added because this branch changes test evidence and engineering confidence docs only; it does not change user-visible behavior, operator behavior, security posture, deploy behavior, or runtime API behavior.
- Public safety: fixture data uses deterministic placeholder UUIDs and public-safe synthetic book/session/member text only. No real member data, private domains, local absolute paths, secrets, token-shaped values, OCIDs, deployment state, screenshot artifacts, or provider identifiers were added.
- Local verification before merge: `git diff --check main...HEAD`, targeted `ServerQueryBudgetTest` and `MySqlQueryPlanTest`, `architectureTest`, `check`, docs whitespace checks, public release candidate build/check, `graphify update .`, and Graphify freshness audit passed.
- Skipped: frontend lint/test/build/E2E, production OAuth, VM, provider-console, and tag/deploy smoke. The branch does not change frontend, BFF, auth, deploy, API response shape, or production runtime behavior; production/tag smoke remains release-operation evidence outside this local merge.
- Residual risk: no known local release-readiness residual remains after query-budget, EXPLAIN, server quality, public-release, docs, and Graphify evidence. Duration smoke remains diagnostic only; query count and EXPLAIN guards are the release-relevant evidence.

## 2026-06-25 Route UI visual regression gate closeout

- Scope reviewed: local `main..codex/2026-06-25-readmates-route-ui-visual-regression-gate-20260625-083423`.
- Release classification: frontend component-test coverage and contributor docs only. No production route composition, route loader, auth/BFF proxy, server API contract, DB migration, OAuth scope, CI/deploy workflow, or release image behavior changed.
- Product evidence: route-critical presentation fixtures now cover host closing board published state, platform-admin support grant risk review, and public records index copy/wrapping. Fixtures use deterministic public-safe Korean sample values and placeholder UUIDs only.
- Renderer-risk closure: local macOS `pnpm --dir front test:ct` can still report feature-level pixel diffs against Docker-generated baselines, so the release gate uses the documented canonical `pnpm --dir front test:ct:update:docker` path. The Docker CT run passed all shared and feature baselines.
- Public safety: `front/__screenshots__` remains committed regression evidence but is excluded from the clean public release candidate. Generated CT cache/test-result artifacts are ignored and must be cleaned before public-candidate scans if they were produced locally.
- Local verification before merge: focused RED checks proved each new baseline was initially missing, `pnpm --dir front test:ct:update:docker`, focused admin/public Vitest checks, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e`, `./server/gradlew -p server clean test`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, Graphify freshness audit, CPE prompt-cache audit, CPE reconcile, and CPE state validation passed. The project `test` task is skipped by Gradle configuration; no server source changed.
- CHANGELOG: `## Unreleased` now records the route-critical visual-regression gate under Testing.
- Skipped before merge: production OAuth, VM, provider-console, and tag/deploy smoke. These require release-operation access after merge and are not local evidence for this frontend test/docs branch; the changed files do not touch server, deploy, auth, BFF, persistence, or release image behavior.
- Residual risk: no known local release-readiness residual remains after CHANGELOG repair, canonical Docker CT evidence, frontend lint/unit/build evidence, public-release safety checks, Graphify freshness, and CPE validation. Production deploy/tag smoke remains outside this local merge.

## 2026-06-25 Lighthouse public improvements closeout

- Scope reviewed: local public route metadata and public initial loading-cost review only.
- Release classification: frontend public-route metadata and route-layout boundary refinement. No server API contract, DB migration, auth/BFF token, OAuth scope, CI/deploy workflow, or release image behavior change.
- Product evidence: public route titles and descriptions now derive from public club/session route data; canonical and robots behavior remains in the existing public URL policy boundary.
- Local Lighthouse evidence: pre-change and post-change `pnpm --dir front lighthouse:diagnose -- --group public` reports were compared from `.tmp/lighthouse/`; post-change route entry failures stayed at 0 and SEO metadata findings decreased from 11 to 3.
- Public safety: generated reports stay under ignored `.tmp/lighthouse/`; docs and code do not add real member data, private domains, local paths, secrets, token-shaped examples, screenshot artifacts, or deployment identifiers.
- Residual-risk repair before merge: login, retired reset-password, and public not-found routes now set public-safe document titles and meta descriptions; retired reset-password has a `main` landmark; public home/about archive links use descriptive link text; latest public-record cards use their visible card text as the accessible name. A fresh public Lighthouse run at `.tmp/lighthouse/2026-06-24T22-54-00-259Z/summary.md` kept route entry failures at 0, removed release-actionable repeated root causes, and reported accessibility and best-practices scores of 1.00 for every public route.
- Remaining follow-up boundary: local-dev-only Lighthouse findings such as unminified dev bundles, Vite client payload, local `robots.txt`, dependency duplication insight, image delivery insight, and timing metrics are now separated under `Local Dev Noise`. They are not treated as release-actionable residuals for this branch; production bundle warnings and deeper code-splitting remain future performance work.

## 2026-06-25 Host/admin member defect polish closeout

- Scope reviewed: local `main..codex/2026-06-25-readmates-host-admin-member-defect-polish-20260625-045334`.
- Release classification: frontend-only route/UI defect polish. No server API contract, DB migration, auth/BFF token, OAuth scope, CI/deploy script behavior, or platform-admin permission/capability change.
- Product evidence: `/app/host/**` and `/clubs/:slug/app/host/**` are composed before the member wildcard route tree; `/admin/clubs/:clubId` closing-risk rows collapse to a one-column mobile layout without document overflow; `/admin/support` now distinguishes initial, loading, no-result, result, and selected-result search states.
- Public safety: browser-visible fixture data remains public-safe. The branch does not add real member data, private domains, local paths, secrets, token-shaped values, screenshot artifacts, or deployment identifiers. `graphify-out/`, `front/dist/`, and `front/node_modules` remain ignored/generated outputs.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front test -- router-route-order`, `pnpm --dir front test -- admin-support`, `pnpm --dir front test -- admin-club-operations`, `pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, public-safe Playwright browser evidence for host/admin routes, `graphify update .`, Graphify freshness audit, CPE prompt-cache audit, CPE reconcile, and CPE state validation passed.
- Release-readiness repair before closeout: CHANGELOG `Unreleased` now records the frontend-only operator/host polish, and this closeout note records the evidence boundary. The Vite build still emits the existing large-chunk warning, but the build exits 0 and the branch does not add new large route chunks beyond the touched frontend polish.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke, and server Gradle checks. These are not local evidence for this frontend-only route/UI polish branch and the changed files do not touch server, deploy, auth, BFF, persistence, or release image behavior.
- Residual risk: no known local release-readiness residual remains after CHANGELOG repair, frontend unit/E2E/build evidence, public-safe browser evidence, Graphify freshness, and public release safety checks. Production deploy/tag smoke remains outside this local merge.

## 2026-06-25 Lighthouse diagnostic harness closeout

- Scope reviewed: local `main..codex/2026-06-25-readmates-lighthouse-diagnostic-20260625-060445`.
- Release classification: frontend dev/test tooling and docs only. No app runtime route behavior, server API contract, DB migration, auth/BFF token, OAuth scope, CI/deploy workflow, or release image behavior change.
- Product evidence: `pnpm --dir front lighthouse:diagnose` inventories public/member/host/admin dev-seed routes, runs local Lighthouse through a browser adapter, writes `.tmp/lighthouse/` JSON/HTML/Markdown reports, classifies repeated findings, and reports route entry failures separately from Lighthouse scores.
- Risk repaired before merge: the first public smoke exposed a false route-entry failure when the expected brand text appeared more than once. The runner now waits on the first visible text match, and the regression test covers repeated route markers.
- Public safety: generated reports stay under ignored `.tmp/lighthouse/`; docs and scripts do not include real member data, private domains, deployment state, local absolute paths, secrets, or token-shaped examples.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front exec vitest run tests/lighthouse`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, local `pnpm --dir front lighthouse:diagnose -- --group public --limit 2` smoke with failed route count 0, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, and Graphify freshness audit passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke, E2E, and server Gradle checks. These are not local evidence for this frontend diagnostics branch and the changed files do not touch app runtime, server, deploy, auth, BFF, persistence, or release image behavior.
- Residual risk: no known local release-readiness residual remains after route-smoke, frontend, public-release, CHANGELOG, and Graphify evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-05-31 v1.12.0 release preparation note

- Scope reviewed: `v1.11.0..HEAD`, with `origin/main..HEAD` also considered because this local `main` is ahead of the remote baseline.
- Release classification: minor release (`v1.12.0`) because the branch adds platform-admin routes/contracts, host/member reading-loop changes, observability/deploy behavior, and additive Flyway migrations V34/V35.
- Executed: `git diff --check v1.11.0..HEAD -- . ':(exclude)docs/superpowers/**'`, `./scripts/pre-push-check.sh --release --dry-run`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `./server/gradlew -p server clean test`, `pnpm --dir front test:e2e`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate`.
- Deployment constraint: direct `main` admin-bypass is not release-policy eligible for this version because DB migrations and public API contracts changed. Use a release PR, then create/push the annotated `v1.12.0` tag after merge so `Deploy Front` and `Deploy Server Image` run from the merged release commit.
- Branch protection exception: PR #10 preserved the release PR artifact and CI evidence, but normal merge was blocked by `REVIEW_REQUIRED` after all checks passed because the repository required one code-owner review while no non-author collaborator was available. Use an admin merge for PR #10 only after recording this exception; do not direct-push the release commit to `main`.
- Follow-up: before the next DB/API release, either add a non-author release reviewer/code owner or adjust branch protection so a solo-admin release PR cannot require an impossible self-review.
- Residual risk: production deployment and smoke are not complete until the tag workflows succeed, OCI compose is promoted to `ghcr.io/<owner>/<repo>/readmates-server:v1.12.0`, and sanitized post-deploy BFF/OAuth/admin smoke checks pass.

## 2026-05-31 v1.12.1 server image scan repair note

- Scope reviewed: server dependency-management repair only (`server/build.gradle.kts`) plus release documentation.
- Release classification: patch release (`v1.12.1`) because `v1.12.0` frontend deployment succeeded but `Deploy Server Image` failed at the Trivy vulnerability gate before release-tag promotion.
- Root cause: Spring Boot 4.0.6 managed `tomcat-embed-core 11.0.21`; the image scan reported fixed HIGH/CRITICAL Tomcat findings with fixed version `11.0.22`.
- Executed: `./server/gradlew -p server dependencyInsight --dependency tomcat-embed-core --configuration runtimeClasspath` and `./server/gradlew -p server check`.
- Deployment constraint: this patch has no DB migration, API contract, auth, BFF token, or frontend behavior change. It is eligible for the documented solo-admin `main` push path after pre-push checks pass.
- Closure evidence: `v1.12.1` `Deploy Server Image` passed image scan and release-tag promotion, `Deploy Front` passed, `READMATES_SERVER_IMAGE` repo variable was updated to the `v1.12.1` GHCR image, OCI compose was promoted to that image, the API container reported healthy, and post-deploy BFF/OAuth smoke passed.
- Residual risk: no `v1.12.1` server-image scan, GHCR promotion, OCI compose promotion, or sanitized post-deploy smoke residual remains open. The branch-protection follow-up from `v1.12.0` remains a repository policy improvement before the next DB/API release.

## 2026-05-31 solo-admin branch protection policy note

- Scope reviewed: branch protection/code-owner operating policy for the current solo-admin repository.
- Policy decision: keep required `Frontend` and `Backend` status checks; remove impossible required PR/code-owner self-review until a real non-author reviewer or team exists.
- Executed: `gh api .../branches/main/protection` before and after the change, and `gh api -X DELETE .../protection/required_pull_request_reviews`.
- Closure evidence: branch protection still requires strict `Frontend` and `Backend` checks, force pushes and branch deletion remain disabled, and `required_pull_request_reviews` is absent.
- Residual risk: no impossible self-review blocker remains for solo-admin DB/API release PRs. High-control surfaces still require explicit release-readiness evidence and external review when a real reviewer is available.

## 2026-05-31 Ops Insight & Release Trust verification note

- Scope reviewed: `origin/main..HEAD` (broad because local `main` is ahead of `origin/main` in this workspace).
- Executed: frontend lint/test/build, targeted admin analytics E2E, server clean test, public release candidate build, public release safety scan, production OAuth browser-profile smoke, and backup timer/manual upload proof.
- Skipped: none.
- Residual risk: no v1.11.0 OAuth or backup timer residual remains open after the 2026-05-31 operational evidence recorded above.

## 2026-06-01 Analytics confidence residual closure note

- Scope reviewed: local `main..codex/2026-06-01-readmates-ops-depth-confidence-evidence-implementation-plan-20260601-010925`.
- Closure evidence: admin analytics visual evidence is now a blocking Playwright check that captures desktop/mobile screenshots, asserts non-empty screenshot payloads, and checks public-safe mocked content for private-data sentinels.
- Closure evidence: admin analytics SQL confidence now combines an authenticated query budget (`ServerQueryBudgetTest`) with an EXPLAIN guard (`MySqlQueryPlanTest`) over the benchmark query. The benchmark participant join uses the existing session/club FK index explicitly to avoid full participant scans as data grows.
- Closure evidence: the merged `MySqlQueryPlanTest` suite also revalidated the existing notes feed query-plan guard; the notes question-count subquery now pins the existing club/session index so MySQL cannot choose a full question scan on small seed statistics.
- Executed: focused analytics Vitest, admin analytics Playwright E2E, analytics service/controller tests, `ServerQueryBudgetTest`, `MySqlQueryPlanTest`, frontend lint/test/build, `architectureTest`, `git diff --check`, public release candidate build/check, and Graphify refresh.
- Skipped: none.
- Residual risk: no analytics confidence residual remains open for this branch. Future visual pixel-diff baselines can still be introduced separately after flake policy is defined, but the shipped branch now blocks on screenshot artifact creation and core layout/private-leak assertions.

## 2026-06-02 Residual risk closure note

- Scope reviewed: `origin/main..HEAD`.
- Failure found before repair: `MySqlQueryPlanTest` reported that the notes feed union query could select a full `questions` scan (`accessType=ALL`, `key=null`) for the question branch.
- Repair evidence: the production notes feed question branch and matching EXPLAIN guard now pin the existing `questions_club_session_created_idx` indexed access strategy.
- Contract evidence: frontend/server contract confidence now compares recursive object key sets and representative array element shapes. The current-session fixture now includes public-safe representative nested items, and the recursive guard exposed and closed the missing `participationStatus` attendee field in the server current-session response.
- DEV parser evidence: current-session and admin analytics overview API clients now run DEV-only Zod parsers after fetch while keeping production casts free of runtime validation cost.
- Executed: targeted `MySqlQueryPlanTest`, `FrontendZodSchemaContractTest`, `ServerQueryBudgetTest`, frontend parser/unit tests, frontend lint/test/build, focused visual E2E, `architectureTest`, `git diff --check`, public release candidate build/check, and Graphify refresh.
- Skipped: no production OAuth, VM, provider-console, or tag/deploy smoke was run in this remediation because the changed surface is local SQL/query-plan, contract validation, and docs.
- Residual risk: no known local release-readiness residual remains for the repaired branch. Production deploy/tag smoke remains a release-operation step, not evidence generated by this local remediation.

## 2026-06-07 Outbound resilience + visual-regression branch review note

- Scope reviewed: `origin/main..HEAD` (40 commits, ~85 files). Local `main`이 `origin/main`보다 앞서 있어 outbound resilience(server CircuitBreaker)와 Playwright 컴포넌트 시각 회귀 하니스뿐 아니라 member reading pace, my-page 독서 여정/완독률, host 회차 준비 페이스, notes feed 정렬까지 모두 포함해 검토했습니다(최신 plan으로 범위를 좁히지 않음).
- Release classification: 신규 DB migration 없음, public API contract는 additive(my-page `completedReadingCount`/`readingProgress` 등 필드 추가만, frontend Zod fixture·server DB test 동기화 확인), CI/deploy/scripts behavior 변경 없음.
- Blocker found before repair: `./scripts/build-public-release-candidate.sh`가 신규 CT baseline PNG(`front/__screenshots__/shared/ui/*.png`) 때문에 실패했습니다. `copy_dir "front"` rsync에 `/__screenshots__/` 제외가 없어 baseline이 후보로 복사됐고, 이후 `*screenshot*` forbidden 정책이 빌드를 막았습니다.
- Repair evidence: `copy_dir "front"`에 `--exclude='/__screenshots__/'`를 추가해 기존 `/screenshot/`·`/screenshots/` 제외와 정합화했습니다. baseline 3개는 repo에 계속 추적되지만(`git ls-files front/__screenshots__/` = 3) public release 후보에는 포함되지 않습니다. 수정 후 `build-public-release-candidate.sh`와 `public-release-check.sh .tmp/public-release-candidate`가 모두 통과(gitleaks: no leaks found)했습니다.
- Executed: `git diff --check origin/main..HEAD`(clean), CI/deploy/scripts 변경 없음 확인, `./server/gradlew -p server clean test`(BUILD SUCCESSFUL), `pnpm --dir front lint`(exit 0, eslint CT-cache ignore 추가 후), `pnpm --dir front test`(1139 passed, `.ct.tsx` 미수집), `pnpm --dir front build`(PASS), Docker 컴포넌트 결정성 게이트(`mcr.microsoft.com/playwright:v1.60.0-jammy`, 3 passed, no diff), public release candidate build/scan, CHANGELOG Unreleased 대조, architecture guard 검토.
- Security/architecture hygiene: resilience4j는 fail-open(비민감 경로 allow, 민감 rate-limit는 `failClosedSensitive`로 fail-closed 선택, cache는 DB read-through fallback, admin-only domain check는 `DOMAIN_CHECK_CIRCUIT_OPEN` 반환)이며 Micrometer 카운터와 `/admin/health` `outbound-resilience` 카드로 관측 가능합니다. 신규 ArchUnit 규칙 `application packages do not depend on resilience4j types`는 guard이며 새 exception/allowlist baseline을 만들지 않습니다(`baselineExceptionClasses = emptySet()` 유지).
- Skipped: 프로덕션 OAuth, VM, provider-console, tag/deploy smoke는 실행하지 않았습니다(변경 표면이 server outbound resilience·frontend 컴포넌트 테스트 하니스·docs로, deploy/tag 동작을 바꾸지 않음).
- Residual risk (의도적 deferral):
  - **CT 시각 회귀 CI 미통합:** plan이 명시적으로 out-of-scope(별도 인프라 변경)로 둔 항목입니다. macOS 로컬은 Vite 8 네이티브 바인딩 부재로 Docker 경로만 사용하며, CI linux runner에 Playwright/Docker 환경이 확보되기 전까지 baseline 드리프트를 자동 감지하는 게이트는 없습니다. 후속 인프라 작업으로 추적합니다.
  - **resilience 튜닝 파라미터 운영 노트:** `readmates.resilience.*` 6개 속성은 안전한 기본값으로 별도 조작 없이 동작합니다. 튜닝이 필요하면 Spring relaxed binding 환경변수(`READMATES_RESILIENCE_*`)로 오버라이드할 수 있으며, 기본값 운영이 권장됩니다.
  - 프로덕션 deploy/tag smoke는 release-operation 단계로 남아 있으며 이 로컬 검토가 생성하는 증거가 아닙니다.

## 2026-06-07 Effective Java / Clean Code 서버 위생 리팩터 리뷰 노트

- Scope reviewed: `main..HEAD` (로컬 `main`에 머지 예정인 4개 refactor 커밋). `origin/main..HEAD`의 outbound resilience + 시각 회귀 작업은 위 2026-06-07 노트에서 이미 검토 완료되어 본 리뷰는 신규 EJ/CC 위생 변경만 다룹니다(사용자가 명시적으로 좁힘).
- Release classification: 신규 DB migration 없음, public API contract 변경 없음(응답·라우트·스키마·인가 무변경), CI/deploy/scripts behavior 변경 없음. 동작 보존 내부 리팩터입니다.
- Change scope: (1) SHA-256 hex 인코딩을 `shared/security/Sha256` 유틸로 통합(`AiGenerationOrchestrator`, 3개 notification service, `ClientIpHashing`), (2) 실패 audit 행 생성을 `AuditLogEntry.failed` 정적 팩터리로 일원화, (3) 광범위 catch/swallow 지점에 근거 주석 + `ignored` 네이밍 정렬.
- Security hygiene: SHA-256 통합은 byte-identical입니다 — 기존 `joinToString("") { "%02x".format(it) }`와 JDK `HexFormat.of()` 모두 소문자·2자리 zero-pad·구분자 없음으로 동일하며, 음수 바이트(-1/-128) 엣지 케이스를 characterization 테스트로 고정했습니다. `ClientIpHashing`의 `.take(32)` 절단도 보존했습니다. 헬스 카드 provider의 swallow는 "health probe는 throw 금지" 근거 주석으로 의도를 명시했습니다.
- Architecture/detekt: `architectureTest`(ArchUnit) 통과 — 신규 baseline·exception 부채 없음. `AuditLogEntry.failed`에 `@Suppress("LongParameterList")` 1개를 근거 주석과 함께 추가했으며(시그니처 변경은 plan이 회귀 위험으로 금지), 그 외 신규 suppress 없음.
- Executed: `./server/gradlew -p server clean check architectureTest`(BUILD SUCCESSFUL, ktlint+detekt+unitTest+JaCoCo≥0.23 포함), `git diff --check main..HEAD`(clean), `./scripts/build-public-release-candidate.sh` + `./scripts/public-release-check.sh .tmp/public-release-candidate`(gitleaks: no leaks found — 64자 SHA-256 빈문자열 테스트 벡터 미플래그).
- CHANGELOG: 사용자/운영자/보안 posture/CI/behavior 변경이 없는 순수 내부 위생 리팩터이므로 `## Unreleased` 항목을 추가하지 않았습니다(체크리스트의 CHANGELOG 기준 밖).
- Skipped: 프로덕션 OAuth, VM, provider-console, tag/deploy smoke는 실행하지 않았습니다(변경 표면이 server-only 내부 리팩터로 deploy/tag 동작을 바꾸지 않음).
- Residual risk: 본 로컬 리팩터 브랜치에 남은 release-readiness 리스크 없음. 프로덕션 deploy/tag smoke는 release-operation 단계로 남아 있으며 이 로컬 검토가 생성하는 증거가 아닙니다.

## 2026-06-07 aigen provider failover 브랜치 리뷰 노트

- Scope reviewed: `origin/main..HEAD` (6 commits, 16 files). 로컬 `main`이 `origin/main`과 동일 baseline이라 범위를 좁히지 않고 전체를 검토했습니다. 변경 표면은 server `aigen` 모듈(provider 가용성 failover) + CHANGELOG + plan/spec 문서뿐입니다.
- Release classification: 신규 DB migration 없음, public API contract 변경 없음, CI/deploy/scripts behavior 변경 없음. additive server 동작 변경입니다.
- API 영향 확인: `JobView.actualModel`은 내부 회계용(cost/audit/metrics)이며 `toStatusResponse`/`toRecentJobResponse` 어느 쪽도 노출하지 않습니다(둘 다 `model.name`만 emit). 따라서 frontend Zod contract 영향이 없습니다.
- Persistence 확인: Redis hash에 `actualModelProvider`/`actualModelName`를 조건부로 쓰고 `fromHash`에서 복원하며, Lua `SAVE_RESULT_IF_STATUS_SCRIPT`는 ARGV가 빈 문자열이 아닐 때만 HSET 합니다. 빈 값(=failover 없음)은 null로 round-trip 됨을 통합 테스트로 고정했습니다.

- Security/하이진: audit/metric silent-loss 없음 — 성공은 실제 생성 모델(`actualModel`) 기준으로 1행 SUCCESS audit + metrics를, availability 실패는 provider별 FAILED audit 행을 남깁니다(failover 후 양쪽 실패 시 FAILED audit 2행을 테스트로 고정). 호출 예산은 불변(job당 LLM 호출 ≤3, failover 깊이 1)이며 `call cap exhausted prevents failover call` 테스트로 고정. content 코드 실패(`SCHEMA_INVALID` 등)는 failover하지 않고 같은 provider strengthen/retry 경로를 유지합니다.
- Finding repaired (audit/metric mis-attribution): failover retry까지 실패할 때 최종 `failJob`의 FAILED audit 행과 job metric이 실제로 마지막에 실패한 failover provider가 아니라 primary 모델(`record.model`)로 기록되어 provider별 실패율 분석을 왜곡하던 문제를 발견·수정했습니다. `Outcome.Failure`/`failJob`에 실패 모델을 함께 흘려 실패 경로도 성공 경로와 동일하게 실제 모델 기준으로 회계하도록 고쳤고, `failover target also failing` 테스트가 2번째 FAILED 행의 provider=OPENAI/model을 검증하도록 강화했습니다.
- Architecture/detekt/ktlint: `architectureTest`(ArchUnit) 통과 — 신규 baseline·exception 부채 없음. `saveResultIfStatus`의 `LongParameterList`는 "각 파라미터가 result commit의 atomic write 필드"라는 근거를 KDoc에 남기고 `@Suppress` 1개만 추가했으며, 그 외 신규 suppress 없음.
- 테스트 가시성 함정 회피: server `test` task는 비활성, `unitTest` 필터에 `excludeTestsMatching("*\$*")`가 있어 `@Nested` inner 테스트가 조용히 제외됩니다. failover 테스트는 `@Nested`가 아닌 top-level 클래스 `AiGenerationWorkerFailoverTest`로 작성해 실제로 수집·실행됨을 XML 리포트(`skipped=0`)로 확인했습니다.
- Executed: `git diff --check origin/main..HEAD`(clean), `./server/gradlew -p server clean check`(BUILD SUCCESSFUL — ktlint+detekt+unitTest+JaCoCo+architectureTest), `./server/gradlew -p server integrationTest --tests RedisAiGenerationJobStoreTest`(22 pass, skipped=0, 신규 actualModel round-trip 2건 포함, Docker/Testcontainers), `./scripts/build-public-release-candidate.sh` + `./scripts/public-release-check.sh .tmp/public-release-candidate`(gitleaks: no leaks found).
- Skipped: 프로덕션 OAuth, VM, provider-console, tag/deploy smoke는 실행하지 않았습니다(변경 표면이 server-only로 deploy/tag 동작을 바꾸지 않음). frontend lint/test/build·E2E는 frontend 변경이 없어 생략.
- Residual risk:
  - **운영 구성 노트:** `readmates.aigen.fallbackChain`은 기본 빈 리스트(기능 off, 동일 provider 재시도)입니다. failover를 켜려면 모델 alias 순서를 환경 구성으로 지정해야 하며, 해석 불가 alias는 시작 시 경고 로그 후 런타임에서 skip 됩니다. provider별 API 키/enable 구성이 선행되어야 실제 cross-provider 전환이 일어납니다.
  - 프로덕션 deploy/tag smoke는 release-operation 단계로 남아 있으며 이 로컬 검토가 생성하는 증거가 아닙니다.

## 2026-06-10 Spring-course ops hardening evidence

- Observability: local Prometheus/Grafana smoke stack and SLO report draft generator are documented without production credentials or private endpoints.
- SQL confidence: notes feed large-fixture query budget, duration smoke, and EXPLAIN guard pin the public-safe read path against accidental N+1 and index drift.
- Failure found before repair: the large fixture exposed a `highlights` branch full scan in the notes feed union query.
- Repair evidence: the production notes feed highlight branch and matching EXPLAIN guard now pin the existing `highlights_club_session_created_idx` indexed access strategy.
- Release-candidate repair evidence: public release candidate generation now includes the local observability compose/provisioning files, dashboard JSON, Prometheus alert rules, and validation scripts required by `scripts/observability-local-smoke.sh`; the candidate-local smoke path was executed successfully.
- Required local checks: `./scripts/lint-grafana-dashboards.sh`, `./scripts/validate-prometheus-rules.sh`, `./scripts/observability-local-smoke.sh`, `python3 scripts/generate-slo-report.py --prometheus-url http://localhost:9090 --month 2026-06`, and focused server integration tests.

## 2026-06-18 Host session record preview evidence gate

- Scope reviewed: local `main..HEAD` for the host session record preview branch. `origin/main..HEAD` was also considered, but local `main` is ahead of `origin/main`; older inherited commits are covered by earlier readiness notes, so this closure focuses on the 4 new preview commits plus this readiness note.
- Release classification: frontend host-editor UX and test evidence only. No server production code, DB migration, public API contract, auth/BFF token, CI/deploy script, or release-candidate scanner behavior changed.
- Residual risk found before merge: the initial implementation evidence stopped at a branch-ready state. This closeout reran release-readiness checks, verified screenshot/test-result artifacts are not tracked, and recorded this branch-specific readiness note before local `main` merge.
- Public safety: private-looking fixture strings (`member1@example.com`, `private.example.com`, `ADMIN_ROUTE`, raw JSON sentinel) exist only in tests as non-render assertions. Production UI renders server issue messages, not issue codes or raw JSON.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, and graphify freshness audit passed. Public release check reported gitleaks no leaks.
- Skipped: `./server/gradlew -p server clean test`, production OAuth, VM, provider-console, tag/deploy smoke. Server checks are not required for this frontend-only branch; production/tag smoke remains a release-operation step and is not local merge evidence.
- Residual risk: no known local release-readiness residual remains for this branch after frontend, E2E, public-release, artifact, and Graphify evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-06-18 Host-to-member session record loop closeout

- Scope reviewed: local `main..HEAD` for the host-to-member session record loop branch. `origin/main..HEAD` was considered, but local `main` is 19 commits ahead of `origin/main`; inherited local-main work is covered by earlier readiness notes, so this closeout focuses on the 4 new feature commits plus this readiness note.
- Release classification: frontend host/member/archive UX and test evidence only. No server production code, DB migration, public API contract, auth/BFF token, CI/deploy script, release-candidate scanner behavior, or architecture-test baseline changed.
- Residual risk found before merge: the initial completion had skipped server validation because the branch was frontend-only. The closeout reran `./server/gradlew -p server clean test` and found the repo's `test` task is intentionally skipped, then ran `./server/gradlew -p server clean check` to execute ktlint, detekt, `unitTest`, JaCoCo verification, and `architectureTest` successfully.
- Product/readiness evidence: host import commit now has a public-safe result ledger, member home has a recent preserved-record entry, archive/session feedback copy distinguishes readable, locked, and missing states, and the existing host session record Playwright spec now proves the host-to-member path through commit result and member-home entry.
- CHANGELOG: `## Unreleased` records both the earlier host session record preview evidence and this host-to-member record loop behavior. No deploy/runbook or architecture doc update is required because server/API/auth/deploy boundaries are unchanged.
- Public safety: private-looking sentinel strings remain only in tests that assert non-rendering. Public release candidate generation and scanner passed with gitleaks reporting no leaks. Broad sentinel scan found existing test fixtures and one old changelog regex false positive, not new production or public-doc exposure.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test` (135 files, 1163 tests), `pnpm --dir front build`, `pnpm --dir front test:e2e` (62/62), `./server/gradlew -p server clean test` (BUILD SUCCESSFUL, `test` task skipped by project configuration), `./server/gradlew -p server clean check` (BUILD SUCCESSFUL), `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, and graphify freshness audit passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this frontend-only merge.
- Residual risk: no known local release-readiness residual remains after frontend, full E2E, backend check, public-release, CHANGELOG, and Graphify evidence. Production deploy/tag smoke remains a release-operation step.

## 2026-06-18 Member record reflection loop closeout

- Scope reviewed: local `main..HEAD` for the member record reflection loop branch. `origin/main..HEAD` was considered, but local `main` already carries earlier local release work covered by the notes above; this closeout focuses on the 4 new reflection-loop commits plus this readiness note.
- Release classification: frontend member-home/archive/feedback UX and test evidence only. No server production code, DB migration, public API contract, auth/BFF token, CI/deploy script, release-candidate scanner behavior, or architecture-test baseline changed.
- Product/readiness evidence: member home now renders `지난 모임 회고`, groups the latest preserved record kinds by session, preserves record and feedback entry points, and keeps final feedback availability decisions inside existing archive/feedback routes.
- Public safety: private-looking fixture strings remain only in tests that assert non-rendering. Public release candidate generation and scanner passed with gitleaks reporting no leaks. Broad changed-file sentinel scan found only those non-render assertions plus existing changelog history, not new production exposure.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test` (138 files, 1170 tests), `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/host-session-record-preview.spec.ts` (1/1), `pnpm --dir front test:e2e` (62/62), `./server/gradlew -p server clean check`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, and graphify freshness audit passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this frontend-only merge.
- Residual risk: no known local release-readiness residual remains after frontend, full E2E, backend check, public-release, CHANGELOG, and Graphify evidence. Production deploy/tag smoke remains a release-operation step.

## 2026-06-07 v1.13.0 release-risk remediation note

- Scope reviewed: `v1.12.1..HEAD`, with current local `main` ahead of `origin/main`.
- Finding repaired: new frontend `/admin/analytics` can now normalize older `admin.analytics_overview.v1` or missing-`series` payloads into the v2 UI model with `series=[]`, avoiding a tag-push window where Cloudflare Pages deploys before OCI backend promotion.
- Finding repaired: `Deploy Server Image` now runs `./server/gradlew -p server clean check bootJar`, aligning release-image build verification with the backend CI quality gate instead of the skipped `test` task.
- Release classification: minor release (`v1.13.0`). No DB migration. Public API contract changes are additive, but server/API/frontend contract surfaces changed and require backend promotion before final frontend/admin smoke.
- Required post-tag operations: confirm `Deploy Server Image`, promote OCI Compose backend to `ghcr.io/<owner>/<repo>/readmates-server:v1.13.0`, confirm `Deploy Front`, then run sanitized BFF/OAuth/admin analytics smoke.
- Local verification: `git diff --check v1.12.1..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test` (134 files, 1142 tests), `pnpm --dir front build`, `./server/gradlew -p server clean check architectureTest integrationTest --tests RedisAiGenerationJobStoreTest`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, and `pnpm --dir front test:e2e` (61/61) all passed. Public release check reported gitleaks no leaks.
- Residual risk: production tag/deploy smoke remains open until the release operation runs. This local remediation does not prove production OAuth, VM health, provider-console state, or GHCR promotion.

## 2026-06-07 Host operations signal card closeout note

- Scope reviewed: local `main..HEAD` for the host operations signal card branch. `origin/main..HEAD` was also inspected and contains inherited local-main release work already covered by the earlier 2026-06-07 notes above.
- Release classification: frontend host-surface polish only. No DB migration, public API contract change, auth/BFF token change, CI/deploy script change, server behavior change, or architecture-test baseline/exception change.
- Finding repaired before merge: `CHANGELOG.md` `## Unreleased` still said `(없음)` even though the host dashboard visible behavior changed. The branch first recorded the host operations signal card under `Unreleased` with unchanged server/API/auth/DB surfaces; the final `v1.13.0` release note below moves that entry into the versioned release section.
- Public safety and security hygiene: production source does not contain `ADMIN_ROUTE`, private member email, private domain, raw JSON sentinel, secret, or token-shaped values. The sentinel strings remain only in tests that assert they are not rendered. The card exposes only host-safe links to `/app/host/sessions/new` and `/app/host/notifications`, and no mutation button or admin action.
- Evidence: component RED/GREEN covered READY judgment, blocker priority, due-record priority, AI failure delta guidance, host-safe links, and no admin/mutation controls. Targeted Playwright E2E covered desktop card evidence, mobile host summary preservation, screenshot artifact creation, and public-safe sentinel checks.
- Executed before local main merge: `pnpm --dir front test -- host-club-operations-card`, `pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e` (61/61), `git diff --check`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, and `graphify update .`. `graphify-out/` is ignored, so no tracked graph output changed; after the docs-only closeout commit, Graphify reported no code-graph topology changes and left the ignored report at the previous code-change commit.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke, and server Gradle checks. These are not local evidence for this frontend-only polish branch and the changed files do not touch server, deploy, auth, BFF, persistence, or release image behavior.
- Residual risk: no known local release-readiness residual remains for this branch after the CHANGELOG repair and frontend/public-safety evidence above. Production deploy/tag smoke remains a release-operation step.

## 2026-06-07 v1.13.0 pre-push release note

- Scope reviewed: `v1.12.1..HEAD` and `origin/main..HEAD` on local `main` before publishing `v1.13.0`.
- Release classification: minor release (`v1.13.0`). The release includes additive server/API/frontend contract work, AI provider failover, outbound resilience, analytics compatibility, visual evidence hardening, member/host reading-loop improvements, and the host operations signal card. No DB migration is included in this release window.
- CHANGELOG repair: the host operations signal card entry was moved from `## Unreleased` into the `v1.13.0` section so the release-tag `Unreleased` guard can pass and the GitHub Release body matches the shipped tag. `## Unreleased` now contains only the placeholder entry.
- Finding repaired before push: the Docker-based Prometheus and Alertmanager validation scripts passed `promtool`/`amtool` as arguments to images whose default entrypoints already launch `prometheus`/`alertmanager`, causing `unexpected promtool` during `./scripts/pre-push-check.sh --full --release`. After fixing entrypoints and Docker mount paths, `promtool` also exposed an invalid escaped dollar-format template in `AiGenBudgetExhaustion`; the rule now uses valid Go template `printf` syntax.
- Deployment order: push `main`, push annotated tag `v1.13.0`, confirm `Deploy Server Image` and `Deploy Front`, promote OCI Compose backend to `ghcr.io/<owner>/<repo>/readmates-server:v1.13.0`, then run sanitized BFF/OAuth/admin analytics smoke. Frontend can tolerate legacy analytics payloads during the tag-push window, but release completion still depends on backend promotion.
- Local verification before push: `git diff --check v1.12.1..HEAD`, `git diff --check -- CHANGELOG.md docs/development/release-readiness-review.md`, `pnpm --dir front lint`, `pnpm --dir front test` (134 files, 1145 tests), `pnpm --dir front build`, `./server/gradlew -p server clean test`, `./server/gradlew -p server check`, `pnpm --dir front test:e2e` (61/61), `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, and `./scripts/pre-push-check.sh --full --release` passed. Public release check reported gitleaks no leaks.
- Skipped before push: production OAuth, VM, provider-console, GitHub Actions deploy workflow results, OCI compose promotion, GitHub Release publication, and post-deploy smoke. These require the release tag and/or operator access after push.
- Residual risk: no known local pre-push blocker remains after the checks above. Production release is not complete until tag workflows, GHCR promotion, OCI compose promotion, GitHub Release creation, and sanitized post-deploy smoke are completed.

## 2026-06-18 Session closing flywheel closeout

- Scope reviewed: local `main..HEAD` for the session closing flywheel branch.
- Release classification: server read API plus host/member/public frontend behavior. No DB migration, auth/BFF token change, deploy script change, or CI workflow change.
- Product evidence: host closing board shows next action, checklist, Host/Member/Public status, and evidence ledger; member notifications show a past-session reflection action for session links; public records show record richness without host/member-only state.
- Public safety: private member email sentinels, raw JSON sentinel, admin route sentinel, provider error fields, token-shaped values, and private deployment data are not rendered in production UI. Public release candidate generation and scanner passed with gitleaks reporting no leaks.
- Local verification before merge: `git diff --check`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e`, `./server/gradlew -p server clean test`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed. The Gradle `test` task is skipped by this project configuration; server verification evidence came from `check`, `unitTest`, `detekt`, `ktlint`, coverage, and `architectureTest`.
- Release-readiness repair before closeout: server `check` initially failed on detekt/ktlint style gates in the new `sessionclosing` files; the branch split long helpers, aligned the use-case filename, and added the new keyword package entries to the existing ktlint baseline before rerunning `check` successfully. Final residual review also moved this closeout note out of the DB/API checklist body so the release-readiness source remains readable.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after server, frontend, E2E, architecture, docs, Graphify freshness, and public-release evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-06-19 Platform admin closing projection closeout

- Scope reviewed: local `main..HEAD` for the platform admin closing projection branch.
- Release classification: additive server/admin frontend projection plus route-order fix. No DB migration, auth/BFF token change, deploy script change, CI workflow change, or platform-admin mutation was added.
- Product evidence: `/admin/**` direct BrowserRouter entry now reaches the admin shell, and `/admin/clubs/:clubId` shows admin-safe session closing risk rows with host closing board drilldowns instead of only aggregate incomplete-record counts.
- Public safety: closing risk projection contains session id, session number, book title, meeting date, safe state/blocker label, and host closing href only. It does not expose raw member data, feedback bodies, provider raw errors, raw JSON, private domains, or token-shaped values.
- Local verification before merge: `git diff --check`, `pnpm --dir front lint`, `pnpm --dir front test` (146 files, 1189 tests), `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./server/gradlew -p server integrationTest --tests JdbcAdminClubOperationsClosingRiskTest`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed. `graphify update .` also ran; `graphify-out/` is ignored and the freshness audit reported no tracked output changes.
- Release-readiness repair before closeout: first `./server/gradlew -p server check` failed on detekt style gates in the new closing-risk mapper and integration fixture, and a concurrent standalone `architectureTest` collided with `check` while writing XML test results. The branch split the mapper state calculation, introduced a test fixture value object, reran focused integration, then reran `check` and standalone `architectureTest` successfully.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after admin route, frontend, server, targeted E2E, architecture, Graphify, and public-release evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-06-20 Admin today closing risk recovery closeout

- Scope reviewed: local `main..HEAD` for the admin today closing risk recovery branch.
- Release classification: additive server read API plus platform-admin frontend queue rendering and host board copy polish. No DB migration, auth/BFF token change, deploy script change, CI workflow change, or platform-admin session mutation was added.
- Product evidence: `/api/admin/today/closing-risks` returns `admin.today_closing_risks.v1`, and `/admin/today` can render admin-safe session closing risk rows with host closing board links while keeping summary/clubs as the required workbench data.
- Public safety: the today projection exposes only club/session ids, slug/name, session number, book title, meeting date, safe state/blocker codes, and a canonical host closing href. Raw feedback source, member data, provider errors, private domains, raw JSON, deployment identifiers, token-shaped values, and local paths are not rendered in production UI.
- Local verification before merge: `./server/gradlew -p server integrationTest --tests PlatformAdminClubOperationsControllerTest --tests JdbcAdminTodayClosingRiskTest`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./server/gradlew -p server clean test` (project `test` task skipped by configuration), `pnpm --dir front lint`, `pnpm --dir front test --reporter=dot` (146 files, 1200 tests), `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/admin-today.spec.ts tests/e2e/admin-today-closing-risks.spec.ts` (3/3), `pnpm --dir front test:e2e` (64/64), `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `git diff --check`, production-added-line sentinel scan, and `graphify update .` passed. `graphify-out/` is ignored.
- Release-readiness repair before closeout: after adding `/admin/today` closing risk query wiring, the first full E2E run failed because the existing `admin-today.spec.ts` mock fixture did not handle the new optional closing-risk request. The fixture now returns an empty `admin.today_closing_risks.v1` payload, targeted admin-today E2E passed, and the full E2E suite passed on rerun. A later residual review found that first-load `ReadmatesApiError` fallback could hide the required partial-error queue item by replacing the query with an empty success response; the frontend loader now records a separate unavailable flag, route coverage asserts the partial warning, and the full frontend test count increased to 1200.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after server, frontend, E2E, architecture, Graphify, and public-release evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-06-21 Closing risk aging ledger closeout

- Scope reviewed: local `main..HEAD` for the closing risk aging ledger branch.
- Release classification: additive DB migration plus additive platform-admin server/frontend API fields. Old frontend clients ignore the new ledger fields, and new frontend clients treat missing ledger fields as untracked. No auth/BFF token change, deploy script change, CI workflow change, or platform-admin session-content mutation was added.
- Product evidence: `/admin/today` and `/admin/clubs/:clubId` now show durable first-detected, last-seen, age, occurrence, tracking-unavailable, and recently-resolved closing risk metadata while keeping repair actions host-owned through the host closing board link.
- Public safety: the ledger stores and exposes only club/session ids, session number, book title/date, safe state/blocker code, timestamps, occurrence count, and canonical host closing href. Raw member data, feedback bodies, provider raw errors, generated JSON, private domains, deployment identifiers, token-shaped values, and local paths are not stored or rendered.
- TDD and repair evidence: Task 5 first added E2E assertions for `3일째 차단`, `반복 2회`, host closing link, and non-rendering of a public-safe unknown blocker sentinel; the assertion-only run failed on missing `3일째 차단`, then passed after adding ledger fixture fields. A later full E2E run failed because generated-session cleanup did not delete `admin_closing_risk_ledger` rows before deleting sessions; the cleanup helper now removes ledger rows with the other session child tables, and the full suite passed on rerun. Final code review then found that limited club-detail snapshots could falsely resolve omitted active ledger rows and that read-then-write upsert could race; targeted integration coverage was added, `syncClub` stopped resolving limited slices, atomic `INSERT ... ON DUPLICATE KEY UPDATE` now reopens rows using the DB current state, and `JdbcAdminClosingRiskLedgerAdapterTest` passed on rerun.
- Local verification before merge: `git diff --check 7f871b9e..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test` (146 files, 1203 tests), `pnpm --dir front build` (passed after retry; existing chunk-size warning), `./server/gradlew -p server clean test` (BUILD SUCCESSFUL, project `test` task skipped by configuration), `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts` (1/1), `pnpm --dir front test:e2e` (64/64), `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `graphify update .`, Graphify freshness audit, and CPE prompt-cache audit passed. Public release check reported gitleaks no leaks.
- Residual risk: no known local release-readiness residual remains after server, frontend, targeted/full E2E, Graphify, prompt-cache, CHANGELOG, and public-release evidence. Production deploy/tag smoke remains outside this local branch.

## 2026-06-21 v1.14.1 server image scan repair

- Scope reviewed: `v1.14.0..HEAD` after the `v1.14.0` release operation.
- Release classification: patch release (`v1.14.1`) because `v1.14.0` `Deploy Front` passed, but `Deploy Server Image` failed before release-tag promotion at the Trivy vulnerability gate. No DB migration, public API contract, auth/BFF token, OAuth scope, frontend behavior, or deploy workflow behavior is changed by this repair.
- Root cause: the release image scan found fixed HIGH findings in the Ubuntu 22.04 base layer (`libssl3`/`openssl` fixed in `3.0.2-0ubuntu1.25`) and Java runtime dependencies (`io.netty:netty-handler` / `io.netty:netty-resolver-dns` fixed in `4.2.15.Final`, `org.springframework.kafka:spring-kafka` fixed in `4.0.6`).
- Repair plan: release Docker image builds now apply Ubuntu package upgrades before installing runtime tools, and Gradle runtime dependency management overrides Netty and Spring Kafka to the fixed versions reported by the failed scan.
- Local verification before tag: dependency insight selected Netty `4.2.15.Final` and Spring Kafka `4.0.6`; `./server/gradlew -p server clean check bootJar` passed; `docker build -f server/Dockerfile.release server -t readmates-server:v1.14.1-local` passed; the built image reports `libssl3`/`openssl` `3.0.2-0ubuntu1.25` and contains the fixed Netty/Spring Kafka jars; local Trivy `0.70.0` scan with `--severity HIGH,CRITICAL --ignore-unfixed --scanners vuln` passed with 0 Ubuntu and Java findings.
- Release operation evidence: `Deploy Front` passed for tag `v1.14.1`; `Deploy Server Image` passed, scanned `ghcr.io/beyondwin/readmates/readmates-server@sha256:9254b7ff380b6fa869ec6694acc8ea2a13010940445b52a595968712030e528f`, and promoted the same digest to `ghcr.io/beyondwin/readmates/readmates-server:v1.14.1`.
- OCI backend promotion evidence: `deploy/oci/05-deploy-compose-stack.sh` promoted the Compose stack to `ghcr.io/beyondwin/readmates/readmates-server:v1.14.1`; `readmates-api` reported healthy liveness; post-deploy watch passed VM compose health, Cloudflare BFF auth smoke, OAuth redirect smoke, Pages marker smoke, and recent backend error scan.
- Residual risk: no `v1.14.1` server image scan, GHCR promotion, OCI Compose promotion, or sanitized post-deploy watch residual remains open. GitHub still reports unrelated Dependabot vulnerability alerts on the default branch; handle those as dependency-maintenance follow-up rather than a blocker for this server-image scan repair release.

## 2026-06-22 Dependabot toolchain residual closure

- Scope reviewed: open GitHub Dependabot alerts on the default branch after `v1.14.1` deployment. All open alerts were npm toolchain findings for Vite `>= 8.0.0, <= 8.0.15` across `front/package.json`, `design/docs/package.json`, `design/system/package.json`, and `pnpm-lock.yaml`, plus the lockfile-only `esbuild >= 0.27.3, < 0.28.1` finding. During remediation, local `pnpm audit --audit-level low` also exposed dev/test transitive findings for `ws`, `js-yaml`, and `@babel/core`; those are included in this closure.
- Release classification: dev/build toolchain security maintenance. No frontend route behavior, UI workflow, server API contract, DB migration, auth/BFF token, OAuth scope, release image, or deploy workflow behavior changes.
- Repair evidence: `front`, `design/docs`, and `design/system` now pin Vite `8.0.16`; root pnpm overrides map only vulnerable ranges to patched versions: `esbuild@>=0.27.3 <0.28.1` to `0.28.1`, `ws@>=8.0.0 <8.21.0` to `8.21.0`, `js-yaml@<=4.1.1` to `4.2.0`, and `@babel/core@<=7.29.0` to `7.29.6`. `pnpm list vite esbuild ws js-yaml @babel/core --depth 10 -r` shows the Vite 8 path on `vite@8.0.16` and `esbuild@0.28.1`, `jsdom` on `ws@8.21.0`, ESLint on `js-yaml@4.2.0`, and Playwright CT React tooling on `@babel/core@7.29.6`; the Playwright CT Vite 6 path remains on `esbuild@0.25.12`, outside the vulnerable range.
- Residual risk: local dependency evidence shows no vulnerable Vite `8.0.9`, `esbuild@0.28.0`, `ws@8.20.1`, `js-yaml@4.1.1`, or `@babel/core@7.29.0` path remains in the workspace dependency tree, and `pnpm audit --audit-level low` reports no known vulnerabilities. GitHub Dependabot alert closure still depends on rescanning the pushed default branch.

## 2026-06-24 Host closing board productization closeout

- Scope reviewed: local `main..HEAD` for the host closing board productization branch.
- Release classification: frontend host UX only. No server API contract, DB migration, auth/BFF token, OAuth scope, notification event type, deploy workflow, CI script, or release image behavior changed.
- Product evidence: `/clubs/:slug/app/host/sessions/:sessionId/closing` now reads as a Korean operating board with a clear next action, reason, closing checklist state labels, host/member/public surface status, and safe evidence ledger. Member/public links remain derived from `host.session_closing_status.v1` and remain host/member/public-safe.
- Public safety: changed production UI and tests do not render private member email, `ADMIN_ROUTE`, raw JSON markers, token-shaped values, private domains, deployment identifiers, OCIDs, or local paths. The E2E fixture keeps these values as non-rendering sentinels only.
- Local verification before merge: `git diff --check main..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test` (147 files, 1217 tests), `pnpm --dir front build` (exit 0 with existing Vite chunk-size warning), `pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts`, full `pnpm --dir front test:e2e`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, public-safety sentinel scan over changed files, and `graphify update .` passed. `graphify-out/` is ignored, so Graphify freshness is command evidence rather than tracked output.
- Skipped: server Gradle checks, production OAuth, VM, provider-console, release tag, deploy workflow, OCI compose promotion, GitHub Release publication, and post-deploy smoke. Server checks are not local evidence for this frontend-only branch because no server, persistence, auth, BFF, deploy, or release-image files changed; production/tag/deploy smoke requires release-operation access after merge.
- Residual risk: no known local release-readiness residual remains after frontend, targeted/full E2E, CHANGELOG, Graphify, and public-release evidence. Production deploy/tag smoke remains outside this local merge.

## 2026-06-25 Host Closing Board Confidence Gates

- Scope: host closing status read-model confidence only. No API response schema, DB migration, auth/BFF token, notification event type, platform-admin mutation, or deploy workflow behavior changed.
- Evidence added: `/api/host/sessions/{sessionId}/closing-status` is covered by `ServerQueryBudgetTest`; `JdbcSessionClosingStatusAdapter` base and notification SQL are covered by `MySqlQueryPlanTest`; `SessionClosingBoard` blocked/action-required state has a Docker-generated Playwright CT baseline.
- Local verification: `./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest --tests com.readmates.performance.MySqlQueryPlanTest`, Docker CT with `mcr.microsoft.com/playwright:v1.60.0-jammy`, and `git diff --check` over changed docs/tests. `pnpm --dir front test:ct` was run locally and failed only because the macOS renderer geometry differs from the committed Linux/Docker CT baseline.
- Residual risk: no known local release-readiness residual remains for this confidence-gate branch after server integration, Docker CT, public-release scanner, Graphify, and docs evidence. Production deploy, OAuth, VM, provider-console, tag/deploy smoke, and provider health remain release-operation evidence outside this local merge.

## 기본 범위

기본 범위는 현재 branch와 base branch의 차이입니다. 보통 `origin/main..HEAD`를 사용합니다.

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
```

feature branch에서 base가 `origin/main`이 아니면 실제 base branch 또는 merge-base를 먼저 확인합니다. 사용자가 명시적으로 특정 implementation plan 범위만 보라고 하지 않았다면, 최신 계획 문서나 마지막 커밋 묶음으로 범위를 좁히지 않습니다.

## 필수 확인 항목

- `CHANGELOG.md`의 `## Unreleased`가 사용자에게 보이는 변경, 운영자에게 보이는 변경, security posture 변경, CI/deploy 변경, behavior change를 반영하는지 확인합니다.
- 운영자가 놀랄 수 있는 변경이 historical planning docs에만 남지 않고 CHANGELOG, deploy/runbook, operator-facing docs 중 적절한 곳에 기록되어 있는지 확인합니다.
- CI/deploy script가 scan한 artifact와 publish/deploy한 artifact를 다르게 만들지 않는지, root cause를 오도하는 진단 메시지를 만들지 않는지, broad false positive로 운영 실패를 유발하지 않는지 확인합니다.
- Security code에 피할 수 있는 dead code, inconsistent constant-time behavior, unsafe fallback mode, secret/token exposure, audit/metric silent-loss mode가 없는지 확인합니다.
- Architecture test의 baseline이나 exception list가 새 부채를 영속화하지 않는지 확인합니다. 남겨야 한다면 후속 plan, issue, TODO가 아니라 실행 가능한 추적 문서에 명시되어야 합니다.
- Public release candidate 생성과 scanner가 새 generated artifact, private state, local path, token-shaped data를 허용하지 않는지 확인합니다.
- 운영 분석 또는 observability 표면이 바뀌면 데이터 부족, 측정 실패, 위험 신호가 UI/API/docs에서 서로 구분되는지 확인합니다. Analytics 변경은 가능한 경우 query budget evidence와 public-safe visual evidence를 함께 남깁니다.
- 테스트 통과는 중요한 증거지만, release note 누락, 운영 surprise, 보안 코드 위생, 배포 진단 리스크를 자동으로 닫지는 않습니다.

## DB/API 릴리즈 추가 체크리스트

DB migration 또는 public API contract 변경이 포함된 release는 일반 테스트 통과 외에 아래 증거를 release-readiness review에 남깁니다.

- **Migration scope:** 변경된 `server/src/main/resources/db/mysql/migration/V*.sql` 파일, Flyway 적용 방향, additive 여부, rollback 대신 forward-fix가 필요한 이유.
- **API contract scope:** 변경된 route, method, request schema, response schema, error code, auth requirement, frontend Zod fixture/export 영향.
- **Deployment order:** `main` merge, annotated release tag, `Deploy Front`, `Deploy Server Image`, OCI compose promotion, post-deploy smoke 순서.
- **Review path:** non-author reviewer 존재 여부, solo-admin release PR 사용 여부, branch protection blocker가 있다면 `POLICY_MISMATCH`, `CHECK_FAILURE`, `MISSING_EVIDENCE` 중 하나로 분류.
- **Smoke evidence:** anonymous BFF/auth status, logged-in host/member route, OAuth redirect marker, DB-backed route, admin route 중 변경 표면에 맞는 smoke 결과.
- **Public safety:** public release candidate check 결과와 private value, token-shaped value, local path, member data 노출 여부.
- **Residual risk:** deploy 전 남은 일, deploy 후 남은 일, skipped validation, operator follow-up을 분리합니다.

`POLICY_MISMATCH`는 reviewer 부재 또는 code-owner self-review 요구처럼 정책 설정이 단독 운영 현실과 맞지 않는 경우에만 사용합니다. CI 실패, scanner 실패, smoke 실패, release note 누락은 `POLICY_MISMATCH`가 아니며 merge 전에 고칩니다.

## 권장 명령

변경 파일에 맞춰 필요한 명령만 실행하되, 아래 확인을 우선 고려합니다.

```bash
git diff --check origin/main..HEAD
rg -n "^## Unreleased|\\(없음\\)" CHANGELOG.md
rg -n "[T]ODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE" \
  CHANGELOG.md \
  .github \
  deploy \
  scripts \
  server/src/main/kotlin \
  server/src/test/kotlin
```

Public release나 deploy 관련 변경이 있으면 repo guide의 public release checks도 실행합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Server behavior, auth, BFF, persistence, architecture boundary 변경이 있으면 관련 targeted test와 server guide의 server check를 선택합니다.

```bash
./server/gradlew -p server clean test
```

Frontend route, BFF proxy, user-flow 변경이 있으면 frontend guide의 checks와 E2E 필요성을 검토합니다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

## 출력 형식

findings를 우선순위별로 보고합니다.

- Blocker
- High
- Medium
- Low
- Not an issue

각 finding에는 파일/라인, 문제가 되는 이유, 추천 액션, 실행한 검증 또는 실행하지 못한 검증을 포함합니다. 문제가 없다고 판단한 항목도 중요한 오해 가능성이 있었다면 `Not an issue`에 짧게 남깁니다.

## 완료 기준

- 검토 범위가 `origin/main..HEAD` 또는 명시된 base 범위로 기록되어 있습니다.
- CHANGELOG/release note, 운영 문서, CI/deploy, security-code hygiene, architecture baseline, public-release safety가 모두 고려되었습니다.
- 실행한 검증과 skipped validation이 구분되어 있습니다.
- “테스트 통과”만을 근거로 운영/릴리즈 리스크가 없다고 결론내리지 않았습니다.
