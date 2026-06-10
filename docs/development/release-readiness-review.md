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
- Task 3 (DB backup → Object Storage + daily timer): 2026-05-18T12:37Z UTC, partial. Object upload: automated via local OCI CLI fallback. Uploaded `mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz` to the configured DB export bucket with a recorded SHA-256 metadata value and release tag. Bucket names, namespaces, and provider identifiers are intentionally omitted from repo docs. Local unit files + runbook committed. Timer install on VM: BLOCKED (OCI CLI not installed on VM, ENV_BLOCKER per spec §S1.4.3). Artifact: .tmp/v1.11.0-followups/oci-object-head.json.
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
