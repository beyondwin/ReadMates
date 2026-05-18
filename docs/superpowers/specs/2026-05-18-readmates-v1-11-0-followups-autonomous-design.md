# ReadMates v1.11.0 Post-Release Follow-ups Design (Autonomous Execution Variant)

> **Variant note:** 본 문서는 `2026-05-18-readmates-v1-11-0-post-release-followups-design.md`의 자율 실행 변형판입니다. 운영 invariants/findings/decisions/acceptance criteria는 원본과 동일합니다. 추가된 것은 §Automation Policy 섹션 한 개로, headless multi-agent executor가 본인 자격증명(SSH 키, OCI CLI, pnpm)으로 6개 태스크를 자율 실행하는 정책을 정의합니다. 본 spec과 짝이 되는 plan: `docs/superpowers/plans/2026-05-18-readmates-v1-11-0-followups-autonomous-implementation-plan.md`.

## Scope

검토 기준은 2026-05-18 11:38 UTC에 완료된 v1.11.0 운영 배포의 잔여 리스크입니다. 검토 입력은 다음 5개 표면입니다:

- `CHANGELOG.md` § v1.11.0 의 `Deployment Notes`와 `Verification` 섹션에 명시된 skip 항목.
- VM `140.245.74.76`의 deploy-attempts ledger (`/var/log/readmates/deploy-attempts.jsonl`) 마지막 6개 라인.
- VM `/var/backups/readmates/mysql/` 디렉토리의 백업 신선도와 보관 위치.
- `Deploy Front`와 `Deploy Server Image` GitHub Actions run (각각 26030338759, 26030338673)의 step 결과.
- `git log v1.10.2..v1.11.0`의 57개 commit이 건드린 21개 server Kotlin + 33개 server test + 63개 frontend production 파일.

직전 release-risk remediation(2026-05-17)은 backend CI gate, AI generation typed errors, platform-admin onboarding email ordering, AI error logging PII scrub 등을 닫았습니다. 이 문서는 그 후속 release(v1.11.0)의 운영 표면에서 남은 잔여 리스크를 닫기 위한 제품/기술 요구사항을 고정합니다. 실행 순서와 파일별 작업은 짝 plan 파일을 따릅니다.

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

1. **AI 생성 job state 일관성** — Redis에 살아있는 `aigen:job:*` key는 v1.11.0이 정의한 transition policy(`PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED|COMMITTING|COMMITTED`)에 정합해야 합니다.
2. **운영 검증 무손실** — release에 포함된 새 사용자 경로(host AI commit, OWNER `/admin` workbench, OAuth login)는 unit test 통과 외에 최소 1회 live 실행으로 확인되어야 합니다.
3. **DB 백업 가용성** — 48시간 이내 backup이 운영 backup 위치(VM 외부 — OCI Object Storage)에도 존재해야 합니다.
4. **Deploy ledger correlation** — `attemptId`는 한 deploy의 모든 ledger 라인에 동일 값으로 전파되어야 합니다. `unknown`은 나오면 안 됩니다.
5. **OAuth 흐름 안정성** — `/oauth2/authorization/google` → Google → `/login/oauth2/code/google` → `/app/...` happy path는 session cookie scope(`HttpOnly`, `Secure`, `SameSite=Lax`, `readmates.pages.dev` only)와 함께 회귀가 없어야 합니다.
6. **Release process 명확성** — branch protection bypass는 의도된 경우(solo admin + local CI 통과)에만 사용되고 문서화되어야 합니다.
7. **CHANGELOG hygiene** — `## Unreleased` 섹션은 release tag push 시점에 placeholder 외 내용을 담고 있으면 안 됩니다.

## Automation Policy

본 follow-up 라운드는 `kws-claude-multi-agent-executor` 스킬로 자율 실행합니다. 다음 정책이 모든 태스크에 동일하게 적용됩니다.

### Available capabilities

- **SSH** to OCI VM `ubuntu@140.245.74.76` with `~/.ssh/readmates_oci` (already validated — `ssh ... 'echo ok'` succeeds).
- **OCI CLI** locally at `/opt/homebrew/bin/oci` (v3.79.0) with config + key files in `~/.oci/`.
- **pnpm + npx** locally; `front/` workspace contains Playwright suite.
- **Bash, Edit, Write, Read** standard tool surface for sub-agents.
- **Playwright MCP** (`mcp__plugin_playwright_playwright__*`) for browser automation attempts.

### Credentials boundary

Sub-agents inherit user-level credentials of the worktree host. **They MAY** read `~/.ssh/readmates_oci`, run `oci` CLI, run local pnpm commands, SSH into the production VM. **They MUST NOT**:

- Write to `~/.ssh/`, `~/.oci/`, `~/.aws/` (no credential rotation by sub-agents).
- Run `oci os bucket delete`, `oci os object delete`, `mysql DROP`, `redis-cli FLUSHDB|FLUSHALL`, or any destructive production command not explicitly named in the plan step.
- Modify `/etc/systemd/`, `/etc/cron*`, or production VM filesystem outside paths the plan step explicitly modifies.
- Push to git remote, force-push, or create release tags.

### OAuth automation escape hatch

Tasks 2 (host smoke against production) and 5 (full OAuth happy path) require a real Google login. Google reliably blocks automated browsers (CAPTCHA, device-trust, suspicious-login warnings, OAuth consent screen detection). Sub-agents MUST:

1. Attempt Playwright MCP first with `headless: false` if the production smoke step calls for visual verification. Detect block signals: `accounts.google.com/signin/v2/challenge`, `captcha-form`, "이 브라우저를 신뢰할 수 없습니다", "확인할 수 없는 시도", or any redirect that does not land on `readmates.pages.dev` within 60s.
2. On block detection: do NOT retry past 1 attempt. Emit `ESCALATE type=ENV_BLOCKER blocker="Google OAuth automation blocked at <challenge URL>"` so the orchestrator records the task as SKIPPED.
3. SKIPPED tasks MUST result in a TODO entry in `docs/development/release-readiness-review.md` under "v1.11.0 post-release smoke" subsection: `- [ ] [MANUAL REQUIRED] <task name> — automation blocked at <step>. Owner: kws. Target: within 7 days.`

This converts a hard halt into a tracked manual TODO without burning escalation cycles.

### Idempotency and dry-run posture

- All SSH read commands (`redis-cli --scan`, `systemctl list-timers`, `ls`, `cat`) are safe to re-run.
- `backup-mysql-to-object-storage.sh` upload of an existing object: re-runs as a no-op (OCI object names are content-addressed via the timestamp embedded in the filename). Sub-agent confirms idempotency via `oci os object head` before/after.
- Systemd timer install: sub-agent generates files locally, copies via `scp`, runs `systemctl daemon-reload` + `systemctl enable --now`. Re-runs idempotent (overwriting unit files + reloading).
- Local file edits (Tasks 4, 6): standard Edit tool — safe under git.

### Verification artifacts

Each task ending writes one machine-readable artifact under `.tmp/v1.11.0-followups/`:

- Task 1: `aigen-residual-keys.txt` + appended deploy-attempts ledger line.
- Task 2: `playwright-e2e-output.log` + `production-smoke-results.json`.
- Task 3: `oci-object-head.json` + systemd timer status excerpt.
- Task 4: standard git diff (no separate artifact).
- Task 5: `oauth-flow-results.json`.
- Task 6: standard git diff.

These are NOT committed (gitignored under `.tmp/`); they are inputs for the release-readiness-review note that IS committed.

## Findings To Close

(Findings P1–P3 are identical to the original spec; reproduced here for self-contained execution context.)

### P1: In-flight AI 생성 job이 v1.10.1 schema로 Redis에 잔존 가능

Evidence:

- v1.11.0은 `AiGenerationJobTransitionPolicy`를 추가하고 `SUCCEEDED -> COMMITTING -> COMMITTED` terminal path를 도입.
- Redis CAS 강제가 v1.10.1에는 없었고, 같은 job key는 정의되지 않은 상태로 새 코드에 진입 가능.
- v1.10.1 → v1.11.0 컨테이너 recreation은 2026-05-18 11:37:51Z. `aigen:job:*` key의 default TTL은 1시간.

Decision: 잔여 key 검증을 verification 단계로 명시. 1시간 TTL 후에도 non-terminal 잔여가 있으면 ledger에 `MANUAL_REDIS_CLEANUP` 이벤트 한 줄 남기고 `DEL`.

Acceptance criteria:

- `redis-cli --scan --pattern 'aigen:job:*'`가 0건 OR 전부 terminal status.
- `AIGEN_RESIDUAL_VERIFIED` 이벤트가 ledger에 한 줄.

### P1: 새 사용자 경로의 live 검증 부재

Decision: 본인 호스트 계정으로 1회 manual smoke 의무화. release-readiness-review.md에 기록.

Acceptance criteria:

- AI 생성 5단계(start, generate, regenerate, commit, cancel) 각 1회 실행 결과 기록.
- `/admin` 진입 시 onboarding queue + club directory + support-access panel 정상.
- OAuth login/logout cycle 결과 기록.
- release-readiness-review.md의 "v1.11.0 post-release smoke" 섹션이 실행자/일시/결과/이슈 링크.

### P2: Pre-v1.11.0 DB 백업이 VM 디스크에만 존재

Decision: OCI Object Storage 버킷에 즉시 업로드 + 일일 systemd timer 활성화 + db-backup.md 신규.

Acceptance criteria:

- `readmates-pre-v1.11.0-20260518T113652Z.sql.gz`가 OCI bucket에 존재, sha256 메타데이터 일치.
- 일일 자동 업로드 메커니즘 활성.
- `docs/operations/runbooks/db-backup.md`에 manual restore 절차 명문화.

### P2: Deploy ledger `attemptId == "unknown"` 라인 존재

Decision: `05-deploy-compose-stack.sh`에 `READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID"` env 추가, `watch-compose-post-deploy.sh`가 `${READMATES_DEPLOY_ATTEMPT_ID:-${ATTEMPT_ID:-unknown}}` 패턴으로 부모 id 우선 사용. `docs/operations/runbooks/deploy-attempts.md`에 fix 시점 명시.

Acceptance criteria:

- 다음 release 이후 모든 deploy ledger 라인이 동일 attempt id.
- `jq 'select(.attemptId == "unknown")'` 0건 (post-fix ledger).

### P2: OAuth 전체 흐름 live 검증 부재

Decision: private/incognito 브라우저로 1회 login + logout cycle. Playwright MCP automation 시도 → Google 차단 시 ENV_BLOCKER SKIP + manual TODO.

Acceptance criteria:

- redirect chain의 각 hop이 302 → 200/302로 정상.
- `auth/me`가 `authenticated=true`, `approvalState=ACTIVE`.
- session cookie 속성(`HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=readmates.pages.dev`) 검증.

### P3: Branch protection bypass 정책 부재 + CHANGELOG Unreleased 가드 부재

Decision:

- `docs/development/release-management.md`에 bypass 정책 subsection.
- `scripts/pre-push-check.sh`에 tag push 시 Unreleased 가드.
- `--no-changelog-check` flag로 emergency override 가능.

Acceptance criteria:

- release-management.md에 bypass 정책 subsection 존재 + release-publish-runbook.md cross-link.
- `scripts/pre-push-check.sh`가 tag push 시 Unreleased 가드 실행.
- `scripts/README.md`가 새 가드 문서화.

## Non-Goals

- Secret rotation, AI 생성 추가 기능, frontend 시각 회귀 인프라, backend integration test 자동화 강화, backup script 리팩토링, v1.10.x 이전 ledger backfill 모두 별도 트랙.

## Verification Matrix

| Finding | 검증 명령 / 측정 | 통과 기준 |
| --- | --- | --- |
| P1 AI job 호환성 | `redis-cli --scan --pattern 'aigen:job:*'` + 각 key의 `status` field | 0건 OR 전부 terminal status |
| P1 Live 검증 | `release-readiness-review.md`의 v1.11.0 smoke 섹션 | AI 5단계 + admin + OAuth 결과 기록 (자동/수동 무관) |
| P2 Object Storage 백업 | `oci os object head -bn <bucket> --name <key>` sha256 | sidecar 일치, 일일 timer 활성 |
| P2 Ledger attemptId | `jq 'select(.attemptId == "unknown")'` on next deploy ledger | 0건 |
| P2 OAuth 흐름 | DevTools/Playwright redirect chain + cookie inspector | 모든 hop 정상, cookie invariants 만족 OR ENV_BLOCKER SKIP + manual TODO |
| P3 Release process | `release-management.md` subsection + pre-push manual test | 정책 명문화 + 가드 동작 확인 |

## Open Questions

- OCI Object Storage 버킷 존재/lifecycle rule 설정 — Task 3 sub-agent가 `oci os bucket list`로 확인 후 결정.
- `STALE_COMPLETION_IGNORED` 메트릭이 노출되어 있는지 — 없으면 P1 task의 acceptance criterion을 "redis scan만"으로 약화.
- `scripts/pre-push-check.sh`의 tag push 감지 방식 — `--release` flag로 명시적 opt-in 권장.
- v1.11.1 patch tag 배포 시점 — Task 4 fix 후 본인 결정.
