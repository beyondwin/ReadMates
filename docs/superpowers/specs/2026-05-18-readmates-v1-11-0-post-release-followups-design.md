# ReadMates v1.11.0 Post-Release Follow-ups Design

## Scope

검토 기준은 2026-05-18 11:38 UTC에 완료된 v1.11.0 운영 배포의 잔여 리스크입니다. 검토 입력은 다음 5개 표면입니다:

- `CHANGELOG.md` § v1.11.0 의 `Deployment Notes`와 `Verification` 섹션에 명시된 skip 항목.
- VM `140.245.74.76`의 deploy-attempts ledger (`/var/log/readmates/deploy-attempts.jsonl`) 마지막 6개 라인.
- VM `/var/backups/readmates/mysql/` 디렉토리의 백업 신선도와 보관 위치.
- `Deploy Front`와 `Deploy Server Image` GitHub Actions run (각각 26030338759, 26030338673)의 step 결과.
- `git log v1.10.2..v1.11.0`의 57개 commit이 건드린 21개 server Kotlin + 33개 server test + 63개 frontend production 파일.

직전 release-risk remediation(2026-05-17)은 backend CI gate, AI generation typed errors, platform-admin onboarding email ordering, AI error logging PII scrub 등을 닫았습니다. 이 문서는 그 후속 release(v1.11.0)의 운영 표면에서 남은 잔여 리스크를 닫기 위한 제품/기술 요구사항을 고정합니다. 실행 순서와 파일별 작업은 `docs/superpowers/plans/2026-05-18-readmates-v1-11-0-post-release-followups-implementation-plan.md`를 따릅니다.

비포함: Gemini API key, Gmail App Password 등 시크릿 로테이션은 사용자 콘솔 접근이 필요해 별도 트랙으로 분리합니다.

## Source Documents

- Release notes: `CHANGELOG.md` § v1.11.0 - 2026-05-18
- Release management: `docs/development/release-management.md`
- Release publish runbook: `docs/deploy/release-publish-runbook.md`
- Release readiness review: `docs/development/release-readiness-review.md`
- Deploy attempts ledger schema: `docs/operations/runbooks/deploy-attempts.md`
- Post-deploy watch: `docs/operations/runbooks/post-deploy-watch.md`
- ADR-0016 deploy ledger event schema: `docs/development/adr/0016-deploy-ledger-event-schema.md`
- AI generation runbook: `docs/operations/runbooks/ai-session-generation.md`
- AI generation state machine spec: `docs/superpowers/specs/2026-05-18-readmates-aigen-job-commit-state-machine-design.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`

## Operational Invariants

이 invariant들은 v1.11.0이 깨면 안 되는 운영 계약입니다. follow-up 작업은 invariant 위반을 닫고, 동일 위반이 v1.12.x에서 재발하지 않도록 가드를 추가합니다.

1. **AI 생성 job state 일관성** — Redis에 살아있는 `aigen:job:*` key는 v1.11.0이 정의한 transition policy(`PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED|COMMITTING|COMMITTED`)에 정합해야 합니다. v1.10.1 시점에 작성된 잔여 key가 새 코드의 CAS 전이를 막거나 정의되지 않은 상태에 도달하면 안 됩니다.
2. **운영 검증 무손실** — release에 포함된 새 사용자 경로(host AI commit, OWNER `/admin` workbench, OAuth login)는 unit test 통과 외에 최소 1회 live 실행으로 확인되어야 합니다. CHANGELOG `Verification`이 unit-only이면 release-readiness-review가 그 사실을 명시적으로 인정해야 합니다.
3. **DB 백업 가용성** — pre-release manual mysqldump는 VM 디스크 단일 사본만으로 충분하지 않습니다. 48시간 이내 backup이 운영 backup 위치(VM 외부 — OCI Object Storage 또는 동등 외부 저장소)에도 존재해야 합니다.
4. **Deploy ledger correlation** — `attemptId`는 한 deploy의 모든 ledger 라인(preflight, install, image, compose-up, health, bff-smoke, post-deploy-watch, complete)에 동일 값으로 전파되어야 합니다. `unknown`은 한 번도 나오면 안 됩니다.
5. **OAuth 흐름 안정성** — `/oauth2/authorization/google` → Google → `/login/oauth2/code/google` → `/app/...` happy path는 session cookie scope(`HttpOnly`, `Secure`, `SameSite=Lax`, `readmates.pages.dev` only)와 함께 회귀가 없어야 합니다. v1.11.0의 current-session loader/query 마이그레이션이 post-login hydration을 깨면 안 됩니다.
6. **Release process 명확성** — branch protection bypass는 의도된 경우(solo admin + local CI 통과)에만 사용되고 문서화되어야 합니다. multi-contributor 또는 auth/permission/migration이 포함된 변경은 PR review를 거쳐야 합니다.
7. **CHANGELOG hygiene** — `## Unreleased` 섹션은 release tag push 시점에 placeholder 외 내용을 담고 있으면 안 됩니다. 직전 release에서 옮긴 콘텐츠가 잔존해 새 tag에 stale 항목으로 노출되는 사고를 가드해야 합니다.

## Findings To Close

### P1: In-flight AI 생성 job이 v1.10.1 schema로 Redis에 잔존 가능

Evidence:

- v1.11.0은 `AiGenerationJobTransitionPolicy`를 추가하고 `SUCCEEDED -> COMMITTING -> COMMITTED` terminal path를 도입했습니다 (CHANGELOG § AI Generation Job Lifecycle).
- Redis CAS 강제(`transitionStatus`, `saveResultIfStatus`)가 v1.10.1에는 없었고, 같은 job key는 정의되지 않은 상태로 새 코드에 진입할 수 있습니다.
- v1.10.1 → v1.11.0 컨테이너 recreation은 2026-05-18 11:37:51Z에 일어났고 (deploy ledger), `aigen:job:*` key의 default TTL은 1시간 + COMMITTED/CANCELLED/FAILED는 terminal hash가 TTL까지 유지됩니다.

Impact:

- 거의 가능성 없음: 11:37 시점 활성 호스트 세션이 없었습니다.
- 가능성 있는 경우:
  - 잔여 `RUNNING` key가 새 worker의 CAS check(`RUNNING → SUCCEEDED`)를 통과하지 못해 `STALE_COMPLETION_IGNORED` 경로로 떨어집니다(설계상 안전, 운영 메트릭에는 노이즈).
  - 잔여 `SUCCEEDED` key의 result payload가 v1.10.1 schema이면, host가 그 job을 commit하려 할 때 `DefaultSessionImportV1Validator`가 새 필드(예: feedback document file name 컨벤션 변경) 미스매치를 던져 typed error `COMMIT_VALIDATION_FAILED`를 반환합니다. 호스트는 재시작 가능합니다.

Decision:

- **잔여 key 검증을 verification 단계**로 명시: scan + TTL + status field만 확인하고 활성 jobs가 모두 terminal state에 있으면 자연 만료를 기다립니다.
- **수동 정리는 last resort**: 1시간 TTL 후에도 non-terminal 잔여가 있으면 ledger에 `MANUAL_REDIS_CLEANUP` 이벤트 한 줄 남기고 `DEL`.
- v1.10.x → v1.11.0 인-flight migration은 별도 데이터 마이그레이션 컴포넌트를 추가하지 않습니다(비용 대비 가치 낮음). 대신 transition policy의 `STALE_COMPLETION_IGNORED` 메트릭을 24시간 모니터링해 잔여 시그널을 캡처합니다.

Acceptance criteria:

- `redis-cli --scan --pattern 'aigen:job:*'`가 0건 반환하거나, 모든 잔여 key의 `status`가 `COMMITTED|FAILED|CANCELLED`(terminal under v1.11.0).
- 검증 결과 한 줄이 deploy-attempts ledger에 `AIGEN_RESIDUAL_VERIFIED` 이벤트로 기록됨.
- `STALE_COMPLETION_IGNORED` 메트릭이 v1.11.0 배포 직후 24시간 동안 비정상 spike(>10건/시간) 없이 baseline 유지.

### P1: 새 사용자 경로의 live 검증 부재

Evidence:

- v1.11.0 CHANGELOG `Verification`: "미실행: pnpm --dir front test:e2e (Playwright), ./server/gradlew -p server integrationTest (Testcontainers)".
- 새 경로는 (a) host session editor의 `세션 기록 완성` 패널 통합, (b) OWNER `/admin` platform-admin workbench, (c) current-session route의 query loader hydration.
- unit test 통과는 mock 기반: 실제 BFF → server → MySQL/Redis 라이브 경로의 회귀를 잡지 못합니다.

Impact:

- 첫 실사용자가 host AI commit 또는 platform-admin 진입 시 인증/로딩/저장 회귀를 발견할 가능성이 있습니다.
- 회귀가 발생하면 v1.10.1로 롤백 가능하지만, 회귀 원인이 v1.11.0 코드인지 무관한 infra 이벤트인지 식별하려면 baseline 가까운 시점에 한 번은 live smoke가 있어야 합니다.

Decision:

- 자동 e2e suite full run을 강제하지 않습니다(비용 대비 가치 낮음, 정기 CI shard가 다음 PR/tag에서 검증).
- **본인 호스트 계정으로 1회 manual smoke**를 의무화: AI 생성 풀 플로우(upload → preview → regenerate → commit → cancel), OWNER admin 진입, OAuth login + logout.
- smoke 결과는 `docs/development/release-readiness-review.md`의 v1.11.0 후속 노트에 기록.

Acceptance criteria:

- AI 생성 5단계(start, generate, regenerate, commit, cancel) 각각 1회 live 실행, 모두 success.
- `/admin` 진입 시 onboarding queue + club directory + support-access panel이 권한별로 정상 렌더링.
- OAuth login/logout cycle이 cookie scope invariants를 만족하며 회귀 없음.
- release-readiness-review.md의 "v1.11.0 post-release smoke" 섹션이 실행자/일시/결과/이슈 링크를 담고 있음.

### P2: Pre-v1.11.0 DB 백업이 VM 디스크에만 존재

Evidence:

- VM `/var/backups/readmates/mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz` (84KB, sha256 sidecar 존재).
- Object Storage 또는 외부 백업 위치로의 자동 업로드 흔적이 deploy ledger 또는 systemd journal에 보이지 않음.
- 가장 최근의 그 다음 백업은 `readmates-pre-v1.8.3-consistent-20260513T070803Z.sql.gz`(5일 전) — release-publish-runbook이 요구하는 48시간 윈도우를 벗어남.

Impact:

- VM 디스크 또는 인스턴스 손실 시 pre-v1.11.0 백업이 함께 소실됩니다.
- 그 결과 가용한 가장 최신 백업이 v1.8.3-pre(5일 전)가 되며, 그 시점 이후의 사용자 데이터 변경은 복구 불가.
- 데이터 손실 가능성은 v1.11.0 자체의 결함이 아닌 운영 backup 정책의 공백.

Decision:

- v1.11.0 백업을 OCI Object Storage 버킷에 즉시 업로드(manual one-shot).
- 일일 backup → Object Storage 업로드를 systemd timer로 자동화(또는 기존 cron이 있다면 확인). 시간대: 04:15 UTC (off-peak).
- 보관 정책: 30일 일일 백업 + 6개월 주간 백업 + 1년 월간 백업. Object Storage lifecycle rule로 자동 관리.
- 복구 절차는 `docs/operations/runbooks/db-backup.md`(신규)에 명문화.

Acceptance criteria:

- `readmates-pre-v1.11.0-20260518T113652Z.sql.gz`가 Object Storage 버킷에 존재하며 sha256 메타데이터가 sidecar와 일치.
- 일일 자동 업로드 메커니즘(`systemctl list-timers` 또는 `crontab -l`로 확인 가능)이 활성.
- 복구 runbook이 manual restore 명령(`oci os object get` + `gunzip` + `mysql --execute`)을 placeholder 없이 실행 가능한 형태로 기록.

### P2: Deploy ledger `attemptId == "unknown"` 라인 존재

Evidence:

- v1.11.0 deploy ledger 마지막 6 라인 중 2 라인이 `"attemptId":"unknown"`:
  ```jsonc
  {"attemptId":"unknown","event":"WATCH_PASSED","status":"SUCCESS","stage":"post-deploy-watch","at":"2026-05-18T11:38:22Z",...}
  {"ts":"2026-05-18T11:38:22Z","stage":"post-deploy-watch","event":"WATCH_PASSED","status":"SUCCESS","detail":{},"attemptId":"unknown",...}
  ```
- 같은 시점의 다른 라인은 parent attempt id `20260518T113717Z-1563`을 포함.
- `deploy/oci/05-deploy-compose-stack.sh`의 watch 호출 env 블록(line ~280)이 `READMATES_DEPLOY_ATTEMPT_ID`를 export하지 않습니다.
- `deploy/oci/watch-compose-post-deploy.sh`는 attempt id를 받지 못하면 fallback default(`unknown` 또는 새 timestamp-id)를 사용합니다.

Impact:

- ADR-0016에 정의된 deploy ledger event-schema 기반 자동 query(`jq 'select(.attemptId == "<id>")'`)가 post-deploy-watch 단계 라인을 놓칩니다.
- 사고 분석 시 단일 attempt의 timeline을 재구성하려면 timestamp correlation에 의존해야 합니다 — 정확하지만 자동화에 부적합.
- 런타임 동작 자체는 영향 없음 (post-deploy watch는 정상 실행됨).

Decision:

- `05-deploy-compose-stack.sh`의 watch 호출 env 블록에 `READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID"` 추가.
- `watch-compose-post-deploy.sh`의 attempt-id 결정 로직을 `${READMATES_DEPLOY_ATTEMPT_ID:-${ATTEMPT_ID:-unknown}}` 패턴으로 바꿔 부모 id가 있으면 우선 사용.
- shell unit test(또는 dry-run mode flag)로 회귀 가드 추가.
- 이 fix는 `v1.11.1` patch tag로 배포(또는 다음 정기 release에 묶음).
- 과거 ledger 라인의 backfill은 하지 않습니다 — 비용 대비 가치 낮고, 동일 timestamp window로 correlation 가능.

Acceptance criteria:

- `v1.11.1`(또는 다음 release) 이후의 모든 deploy ledger 라인이 동일 attempt id를 갖습니다. `jq 'select(.attemptId == "unknown")'`이 0건.
- `docs/operations/runbooks/deploy-attempts.md`가 이 fix 시점부터 `unknown`이 보이면 회귀임을 명시.

### P2: OAuth 전체 흐름 live 검증 부재

Evidence:

- v1.11.0 frontend smoke는 `/oauth2/authorization/google` → 302 redirect까지만 확인(redirect_uri 정확성 OK).
- callback hop, session cookie 설정, post-login `auth/me`, `recommendedAppEntryUrl` 기반 진입 라우트는 검증되지 않음.
- v1.11.0의 current-session/host TanStack Query 마이그레이션이 post-login hydration 경로를 변경했습니다.

Impact:

- 회귀가 있다면 첫 실사용자 로그인에서 발견됩니다(silent crash, 무한 로딩, 잘못된 진입 라우트).
- 데이터 손실은 없습니다(read-only login hop).
- 사용자 경험 손실 가능성: 로그인 후 빈 페이지나 잘못된 권한 상태 표시.

Decision:

- private/incognito 브라우저로 사용자 본인 1회 login + logout cycle 실행.
- DevTools Network 탭에서 redirect chain의 각 hop status code 기록.
- session cookie 속성(`HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=readmates.pages.dev`) 검증.
- 검증 결과를 release-readiness-review.md에 P1 항목 smoke 노트와 함께 기록.

Acceptance criteria:

- login: 모든 redirect hop이 302 → 200/302로 정상 종료, 마지막 진입 라우트가 `recommendedAppEntryUrl`과 일치.
- `auth/me` 응답이 `authenticated=true`, `approvalState=ACTIVE`, `membershipId`/`clubId` populated.
- session cookie가 invariants를 만족(scope, HttpOnly, Secure, SameSite).
- logout: ANONYMOUS 상태로 복귀, 잔여 세션 cookie 없음.

### P3: Branch protection bypass 정책 부재 + CHANGELOG Unreleased 가드 부재

Evidence:

- v1.11.0의 main push: "Bypassed rule violations for refs/heads/main: Changes must be made through a pull request. 2 of 2 required status checks are expected." (admin override).
- `docs/development/release-management.md`와 `docs/deploy/release-publish-runbook.md`에 bypass가 언제 적절한지에 대한 명시적 정책 없음.
- `CHANGELOG.md`의 `## Unreleased`는 release 작업 시 카테고리 헤더(`### Highlights`)와 함께 콘텐츠를 옮기는 manual 과정 — 단일 타이핑 실수가 stale 콘텐츠를 새 release에 노출할 수 있음.

Impact:

- 프로세스 드리프트: bypass가 매번 일어나면 protection rule이 ceremonial해지고, 진짜 review가 필요한 경우와 구분이 흐려집니다.
- CHANGELOG 위생: stale 콘텐츠가 새 tag 섹션에 노출되면 release note 신뢰성이 하락합니다(낮은 가능성, 사고 시 가시적 영향).

Decision:

- **bypass 정책 명문화** (`docs/development/release-management.md` 신규 subsection):
  - 허용 조건: 단독 admin + 로컬에서 `./scripts/pre-push-check.sh` 통과 + DB migration / auth-permission-touching 변경 없음.
  - 비허용 조건: multi-contributor 변경, DB migration 포함, auth/permission/RLS 변경 포함, public API contract 변경.
  - 비허용 시 "release PR" 패턴 — 모든 commit을 하나의 PR로 묶고 1 external review 후 merge.
- **CHANGELOG 가드** (`scripts/pre-push-check.sh`):
  - tag push 감지 시(`git push origin v*`) `## Unreleased` 섹션이 placeholder 한 줄만 갖는지 검증.
  - 카테고리 헤더(`### Added/Changed/Fixed/Highlights/Engineering...`)가 있으면 fail-fast.
  - non-tag push에는 적용 안 함 (개발 중 false positive 방지).
- **emergency bypass**: `--no-changelog-check` flag로 의도적 override 가능 (release ledger에 사유 기록 필요).

Acceptance criteria:

- release-management.md에 bypass 정책 subsection이 있고, release-publish-runbook.md가 cross-link.
- `scripts/pre-push-check.sh`가 tag push 시 Unreleased 가드를 실행하고, 위반 시 actionable 메시지로 종료.
- 가짜 stale Unreleased 콘텐츠로 manual test 시 pre-push가 실패함을 확인.
- `scripts/README.md`가 새 가드를 문서화.

## Non-Goals

- Secret rotation (Gemini API key, Gmail App Password) — 사용자 콘솔 접근 필요, 별도 트랙.
- AI 생성 추가 기능(다른 LLM provider, batch 생성, 자동 재시도) — v1.12+.
- Frontend 시각 회귀 인프라(Storybook + Percy/Chromatic) — design-system 테스트 정책 재검토 시.
- Backend integration test 자동화 강화 — 현재 정기 CI shard로 충분, 자동화 확장은 별도 spec.
- Backup script 자체의 리팩토링 — Object Storage 업로드가 작동한다면 현 구조 유지. 동작 변경은 별도 spec.
- v1.10.x 이전의 deploy ledger backfill — correlation은 timestamp로 가능, 자동 분석을 그 윈도우까지 확장할 필요 없을 때.

## Verification Matrix

각 finding이 닫혔는지 측정하는 방법.

| Finding | 검증 명령 / 측정 | 통과 기준 |
| --- | --- | --- |
| P1 AI job 호환성 | `redis-cli --scan --pattern 'aigen:job:*'` + 각 key의 `status` field | 0건 OR 전부 terminal status |
| P1 Live 검증 | `release-readiness-review.md`의 v1.11.0 smoke 섹션 | AI 5단계 + admin + OAuth 모두 success 기록 |
| P2 Object Storage 백업 | `oci os object head -bn <bucket> --name <key>` sha256 메타데이터 | sidecar와 일치, 일일 timer 활성 |
| P2 Ledger attemptId | `jq 'select(.stage == "post-deploy-watch" and .attemptId == "unknown")'` on v1.11.1+ ledger | 0건 |
| P2 OAuth 흐름 | DevTools Network 탭 redirect chain + cookie inspector | 모든 hop 정상, cookie invariants 만족 |
| P3 Release process | `release-management.md` policy subsection + pre-push manual test | 정책 명문화 + 가드 동작 확인 |

## Open Questions

- OCI Object Storage 버킷이 이미 존재하는지 / lifecycle rule이 어떻게 설정되어 있는지 확인 필요. 만약 없으면 P2 백업 task가 bucket creation까지 포함해야 합니다.
- `STALE_COMPLETION_IGNORED` 메트릭이 Prometheus/Grafana에 노출되어 있는지, 노출되어 있다면 dashboard 또는 alert가 정의되어 있는지. 없으면 P1 AI job task의 acceptance criterion을 "24h ledger 검증"으로 약화해야 합니다.
- `scripts/pre-push-check.sh`가 tag push 감지를 어떻게 할지(`git symbolic-ref HEAD` vs 환경 변수 vs argv parsing) — 가장 단순한 형태는 `READMATES_PRE_PUSH_RELEASE=true` 환경 변수 + `--release` flag로 명시적 opt-in. 자동 감지는 false positive 위험.
- v1.11.1 patch tag가 정당한지(deploy ledger fix만으로 patch release를 정당화) vs v1.12.0까지 묶을지 — 운영 ledger 신뢰도를 곧 회복할 가치가 있다면 v1.11.1을 권장.
