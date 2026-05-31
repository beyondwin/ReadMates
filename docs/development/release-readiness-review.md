# Release Readiness Review

남은 리스크, release readiness, merge 후 안전성, ship 가능 여부를 확인할 때 사용하는 체크리스트입니다. 구현 계획의 완료 여부와 테스트 통과 여부만으로 release risk가 닫혔다고 판단하지 않습니다.

## v1.11.0 post-release smoke

> 자동 실행 출처: [docs/superpowers/plans/2026-05-18-readmates-v1-11-0-followups-autonomous-implementation-plan.md](../superpowers/plans/2026-05-18-readmates-v1-11-0-followups-autonomous-implementation-plan.md).

- Task 1 (Redis aigen residual): 2026-05-18T12:12Z UTC, automated. Keys: 0. Action: no-op. Ledger event: AIGEN_RESIDUAL_VERIFIED.
- Task 2 Step 1 (Local Playwright E2E): 2026-05-18T12:18Z UTC, automated. Specs: 17 pass / 0 fail (grep fallback `@aigen|host`; initial `@aigen|host session editor|platform-admin` matched 0 specs). Log: .tmp/v1.11.0-followups/playwright-e2e-output.log.
- Task 2 Step 2-3 (Production host smoke): 2026-05-18T12:18Z UTC, MANUAL REQUIRED. Google OAuth automation blocked at https://accounts.google.com/v3/signin/identifier (no redirect back to readmates.pages.dev under automated browser, per spec S1.4.3).
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 2 production host smoke — 2026-05-31T12:17Z UTC, browser-profile OAuth smoke. Started from `https://readmates.pages.dev/login`, selected an existing Google account in Chrome, and confirmed redirect back to the ReadMates production origin at `/clubs/<slug>/app`. No credentials, cookies, or account identifiers were captured.
- Task 5 (OAuth happy path): 2026-05-18T12:24Z UTC, MANUAL REQUIRED. Playwright MCP redirect from https://readmates.pages.dev/login reached https://accounts.google.com/v3/signin/identifier; Google blocked credential entry under automated browser (spec §S1.4.3 escape hatch). Artifact: .tmp/v1.11.0-followups/oauth-flow-results.json.
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 5 OAuth happy-path — 2026-05-31T12:17Z UTC, same browser-profile OAuth smoke confirmed `/login` -> Google account chooser -> ReadMates production app return. CLI smoke also confirmed Google receives `redirect_uri=https://readmates.pages.dev/login/oauth2/code/google`.
- Task 3 (DB backup → Object Storage + daily timer): 2026-05-18T12:37Z UTC, partial. Object upload: automated via local OCI CLI fallback. Uploaded `mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz` to bucket `readmates-db-exports` (namespace `ax5hfpscso8v`) with `opc-meta-sha256=4b6c36c237e94736574894065ceabaa08d7492469bc6d45f4600d67903c1c81a`, `opc-meta-tag=pre-v1.11.0`. Local unit files + runbook committed. Timer install on VM: BLOCKED (OCI CLI not installed on VM, ENV_BLOCKER per spec §S1.4.3). Artifact: .tmp/v1.11.0-followups/oci-object-head.json.
- [x] [CLOSED BY OPERATIONAL EVIDENCE] Task 3 daily backup timer — 2026-05-31T12:09Z UTC, automated with operator CLI. Installed backup scripts, backup env/defaults, OCI CLI, instance-principal Object Storage policy, `backup-mysql.service`, and `backup-mysql.timer` on the ReadMates VM. Verification: `backup-mysql.timer` is enabled/active with next run scheduled for 2026-06-01T04:19:30Z UTC, and a manual `backup-mysql.service` run uploaded both `mysql/readmates-20260531T120949Z.sql.gz` and `mysql/readmates-20260531T120949Z.sql.gz.sha256`.

## 2026-05-31 Ops Insight & Release Trust residual policy

For the Ops Insight & Release Trust branch, residuals are classified as:

- **Closed by automated evidence** only when a repo command, script, test, or public-safe document proves the condition without private operator access.
- **Manual operational action remains** when Google OAuth credential entry, production host access, VM access, or provider console access is required.
- **Out of scope for this branch** when the item predates the branch and is not changed by analytics, observability, release-readiness, docs, scripts, or deploy behavior.

The v1.11.0 production OAuth and backup timer items are closed by 2026-05-31 operational evidence. Analytics v2 and observability truth cleanup did not close those items by themselves; the closure evidence above came from browser-profile OAuth smoke, VM timer installation, and manual backup upload proof.

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

## 2026-05-31 Ops Insight & Release Trust verification note

- Scope reviewed: `origin/main..HEAD` (broad because local `main` is ahead of `origin/main` in this workspace).
- Executed: frontend lint/test/build, targeted admin analytics E2E, server clean test, public release candidate build, public release safety scan, production OAuth browser-profile smoke, and backup timer/manual upload proof.
- Skipped: none.
- Residual risk: no v1.11.0 OAuth or backup timer residual remains open after the 2026-05-31 operational evidence recorded above.

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
- 테스트 통과는 중요한 증거지만, release note 누락, 운영 surprise, 보안 코드 위생, 배포 진단 리스크를 자동으로 닫지는 않습니다.

## 권장 명령

변경 파일에 맞춰 필요한 명령만 실행하되, 아래 확인을 우선 고려합니다.

```bash
git diff --check origin/main..HEAD
rg -n "^## Unreleased|\\(없음\\)" CHANGELOG.md
rg -n "TODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch" \
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
