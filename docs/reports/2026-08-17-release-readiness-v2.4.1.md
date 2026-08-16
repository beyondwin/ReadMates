# ReadMates v2.4.1 Release Readiness Evidence

이 문서는 `v2.3.0..v2.4.1` 전체의 릴리스 검토와 실제 배포 증거를 보관하는 시점별 snapshot입니다. 현재 절차와 완료 기준은 [release-readiness-review.md](../development/release-readiness-review.md)와 [release publish runbook](../deploy/release-publish-runbook.md)을 우선합니다.

## 범위와 버전 결정

- 검토 범위는 `v2.3.0..HEAD` 전체입니다. Backend quality hardening Phase 0–2, platform health failure containment, notification runtime/replay reliability, AI Kafka·Redis recovery, Flyway immutability, Living Archive 격리 preview와 릴리즈 CI 복구를 포함합니다.
- Product change class는 **minor**입니다. 새 운영 복구·관측 동작, additive Flyway V48, production runtime rendering과 사용자 확인용 preview route가 추가됩니다. 최초 `v2.4.0` tag의 image scan이 HttpComponents Core HIGH CVE 2건을 차단했으므로 image를 promote·배포하지 않았고, source를 수정한 immutable forward-fix `v2.4.1`을 사용합니다.
- 기존 `v2.3.0`과 실패한 `v2.4.0` tag는 이동하거나 덮어쓰지 않습니다. 이후 tag image, backend promotion 또는 frontend deployment가 실패해도 원인을 수정한 새 patch tag로 forward-fix합니다.

## Migration, runtime과 호환 배포

- V48은 versioned admin notification replay preview에 immutable target rows와 confirmation receipt를 additive하게 추가합니다. 기존 v1 preview는 다시 preview해야 하며 schema rollback 대신 V48-compatible image 또는 더 높은 migration을 사용합니다.
- Notification relay/SMTP deadline·claim lease·retry schedule과 AI Kafka/Redis recovery scheduler·repair/probe 값이 runtime rendering에 추가됐습니다. `sync-config`를 `restart_api=false`, `dry_run=false`로 먼저 성공시켜 구 image를 새 설정으로 재시작하지 않고 다음 v2.4.1 container가 값을 읽게 합니다.
- 기존 public REST/BFF success shape와 authorization 의미는 유지됩니다. Platform health snapshot은 refresh metadata를 additive하게 제공하고 frontend는 서버의 `FRESH`/`REFRESHING`/`STALE`/`UNAVAILABLE` 상태를 표시합니다.
- 배포 순서는 release commit의 `main` CI → annotated `v2.4.1` tag → `Deploy Server Image` scan/promote → `sync-config(restart_api=false, dry_run=false)` → 최근 backup 확인 → OCI Compose backend/Flyway V48/health → `Deploy Front(release_tag=v2.4.1)` → GitHub Release → final production smoke입니다.

## Release risk review

- **CHANGELOG/운영 문서:** 사용자·운영자 변화, V48, runtime sync, backend-first 순서, forward-only 복구와 no-send smoke 범위를 `CHANGELOG.md`, deploy hub/runbook과 운영 runbook에 반영했습니다.
- **CI/deploy artifact:** exact annotated tag checkout, tag commit/HEAD 일치, scan-candidate와 promoted digest 동일성 계약을 유지합니다. Flyway checker는 complete history에서 기존 migration 수정·삭제·rename을 fail closed로 차단합니다.
- **Security-code hygiene:** AI PII guard는 현재 Redis keyspace와 application-owned Kafka routing model을 검사합니다. Tag 전 open HIGH `nanoid` advisory를 반영해 workspace override를 `3.3.18`로 올렸습니다.
- **Architecture baseline:** Phase 2는 boundary partition `0 current + 39 retired = 39 approved`, feature partition `37 + 4 = 41`, cyclic component 0으로 닫혔습니다. 새 baseline/config exception이나 대체 Detekt identity를 추가하지 않았습니다.
- **Public release safety:** 실제 member data, private deployment state, local absolute path, secret/token-shaped 값을 문서와 release note에 기록하지 않습니다. 실제 AI provider 호출, 이메일 발송, OAuth 완료와 production mutation은 smoke에서 제외합니다.
- **Branch policy:** tag 전 로컬 full release gate와 원격 `main` CI 성공을 수동 강제합니다. 실패한 gate, image 또는 deploy는 tag 이동 없이 새 commit과 patch tag로 처리합니다.

## Acceptance evidence 선택

- **Persistence/migration:** V48과 replay target/confirmation transaction이 추가되어 full Testcontainers integration과 Flyway immutability evidence를 선택합니다.
- **Async, cache, provider:** notification relay/SMTP와 AI Kafka·Redis recovery 동작이 바뀌어 retry, timeout, exhausted recovery, unavailable/repair와 no-send operator evidence를 선택합니다.
- **Actor/authorization:** replay confirm은 OWNER/OPERATOR만 허용하고 actor/club snapshot을 고정하므로 focused authorization/API regression을 선택합니다.
- **UI/runtime state:** platform health refresh 상태와 Living Archive preview가 추가되어 frontend unit, CT, Chromium E2E와 production read-only smoke를 선택합니다.
- BFF/OAuth contract와 guest DTO field는 바뀌지 않았습니다. 전체 E2E와 final production smoke로 adjacent regression을 확인하되 live OAuth 완료나 private payload 확인은 하지 않습니다.

## Verification evidence

| Evidence | Result |
| --- | --- |
| CI blocker reproduction | **PASS after fix** — remote failed run에서 CT focus width, platform health pool setup/timeout, ShellCheck/AI PII path drift를 분리했고 CT 60/60, 최종 2-core equivalent focused backend 10회와 server PR gate, tracked shell/PII 검사를 로컬에서 재검증했습니다. |
| Dependency audit | **PASS** — repository-pinned `pnpm@11.13.1`에서 HIGH known vulnerability 0건입니다. |
| Full release gate | **PASS** — `./scripts/pre-push-check.sh --full --release`: frontend 279 files / 2,181 tests, CT 60/60, unit 1,452(1 skipped), architecture 94, integration 1,005, Chromium E2E 150/150, build/fixtures, deploy/Flyway contracts, public candidate/gitleaks와 observability config가 통과했습니다. |
| Remote main CI | Release commit push 뒤 run ID와 결론을 기록합니다. |
| Server image / runtime config | **FORWARD-FIX IN PROGRESS** — `v2.4.0` scan이 `httpcore5`/`httpcore5-h2` 5.3.6의 HIGH CVE 2건을 차단해 promote하지 않았습니다. 두 모듈을 fixed 5.4.3으로 고정하고 boot JAR 확인과 Trivy 0.70.0 local image scan 0건을 통과했으며 `v2.4.1` 원격 결과를 기록합니다. |
| OCI backend / Flyway | Exact digest, restart count, health, deploy ledger와 Flyway V48 결과를 기록합니다. |
| Cloudflare frontend / smoke | Same-tag deployment와 sanitized read-only/no-send smoke 결과를 기록합니다. |

## Production boundary

- OCI backend와 frontend는 같은 `v2.4.1` tag를 사용합니다.
- Backend promotion 전 scanned image와 runtime config sync, 최근 48시간 DB backup을 확인합니다.
- Backend promotion 뒤 Flyway V48, `/internal/health`, anonymous BFF auth와 deploy ledger를 확인한 뒤에만 frontend를 dispatch합니다.
- Final smoke는 read-only/no-send 경로만 사용합니다. 실제 OAuth provider 완료, AI generation, email dispatch, member/admin mutation은 별도 승인 없이는 실행하지 않습니다.
