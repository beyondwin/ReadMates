# ReadMates v2.3.0 Release Readiness Evidence

이 문서는 `v2.2.0..v2.3.0` 전체의 릴리스 검토와 실제 배포 증거를 보관하는 시점별 snapshot입니다. 현재 절차와 완료 기준은 [release-readiness-review.md](../development/release-readiness-review.md)와 [release publish runbook](../deploy/release-publish-runbook.md)을 우선합니다.

## 범위와 버전 결정

- 검토 범위는 `v2.2.0..HEAD` 전체입니다. Guest notes pagination, platform-admin durable operation cases와 Flyway V47, OAuth/BFF navigation error recovery, 멤버 최근 독서·호스트 AI 기본값, 모바일 호스트 대시보드·세션 편집, 관련 active docs를 포함합니다.
- Release class는 **minor**입니다. 새 admin operations API·영속 lifecycle, additive migration V47과 새 운영 UI가 추가되므로 patch로 축소하지 않고 `v2.3.0`을 사용합니다.
- 기존 `v2.2.0` tag는 이동하거나 덮어쓰지 않습니다. Tag image, backend promotion 또는 frontend deployment가 실패하면 원인을 수정한 새 patch tag로 forward-fix합니다.

## Migration, API와 호환 배포

- V47은 `admin_operation_cases`, immutable `admin_operation_case_events`, `admin_operation_source_status`를 additive하게 추가합니다. Migration rollback 대신 V47 schema를 보존한 compatible image 또는 forward-fix를 사용합니다.
- 새 admin operations contract는 `GET /api/admin/operations/cases`, `GET /api/admin/operations/cases/{caseId}`, `POST` acknowledge·snooze·resolve입니다. OWNER와 OPERATOR만 lifecycle mutation을 수행하고 SUPPORT는 safe projection만 읽습니다. Mutation은 expected version을 요구하고 resolve는 exact source identity가 사라졌음을 authoritative하게 재검증합니다.
- Guest notes feed는 optional `sessionId` query를 추가합니다. Query가 없으면 기존 전체 feed contract를 유지하고, 있을 때는 club·session 범위의 opaque cursor로 선택 회차만 pagination합니다.
- OAuth start/callback의 document navigation failure는 public-safe `/auth/error`로 전환합니다. Non-HTML 요청은 기존 JSON/status contract를 유지하고, safe relative `returnTo` 외의 값과 recursive error target은 거절합니다.
- 배포 순서는 release commit의 `main` CI → annotated `v2.3.0` tag → `Deploy Server Image` scan/promote → 최근 backup 확인 → OCI Compose backend/Flyway V47/health → `Deploy Front(release_tag=v2.3.0)` → GitHub Release → final production smoke입니다. Runtime env rendering과 host-write client contract는 바뀌지 않아 `sync-config` mutation은 생략합니다.

## Release risk review

- **CHANGELOG/운영 문서:** 사용자·운영자 변화, V47, backend-first 순서, forward-only rollback과 no-send smoke 범위를 `CHANGELOG.md`, architecture, deploy README와 runbook에 반영했습니다.
- **CI/deploy artifact:** `.github/workflows`와 deploy script는 이 범위에서 바뀌지 않았습니다. 기존 exact annotated tag checkout, tag commit/HEAD 일치, scan-candidate와 promoted digest 동일성 계약을 repository checker로 재검증합니다.
- **Security-code hygiene:** OAuth 오류는 allowlist kind와 safe relative `returnTo`만 사용하고 upstream body를 노출하지 않습니다. Admin operation projection은 raw provider error, email, recipient, transcript와 private member content를 제외합니다. Tag 전 GitHub가 새로 공개한 HIGH advisory를 반영해 `brace-expansion`은 `5.0.9`, `nanoid`는 `3.3.17`로 고정합니다.
- **Architecture baseline:** `admin.operations`를 기존 port/adapter 경계와 architecture test registry에 포함했고 baseline·exception list를 늘리지 않았습니다.
- **Public release safety:** 실제 member data, private deployment state, local absolute path, secret/token-shaped 값을 문서와 release note에 기록하지 않습니다. 실제 AI provider 호출, 이메일 발송, OAuth 완료와 production mutation은 release smoke에서 제외합니다.
- **Branch policy:** GitHub ruleset은 비어 있고 `main` protection에는 required status check/review와 admin enforcement가 없습니다. 이를 `POLICY_MISMATCH`로 기록하고 release commit의 로컬 full gate와 원격 `main` CI 성공을 tag 전 수동으로 강제합니다.

## Acceptance evidence 선택

- **Actor/authorization:** admin operations의 OWNER·OPERATOR mutation과 SUPPORT read-only/denied path가 새 contract이므로 server/API/E2E evidence를 선택합니다.
- **BFF/OAuth:** Pages Functions와 Vite proxy의 document/non-document 실패 분기, safe return target과 no-store가 바뀌어 BFF unit/E2E evidence를 선택합니다.
- **Cursor collection:** guest notes에 selected-session pagination이 추가되어 first/continuation/last와 scope mismatch evidence를 선택합니다.
- **Persistence/migration:** V47과 JDBC reconciliation/lifecycle이 추가되어 full Testcontainers integration을 선택합니다.
- **UI/runtime state:** admin command center, auth error surface와 host mobile UI가 바뀌어 unit, responsive E2E와 production read-only smoke를 선택합니다.
- Guest DTO privacy와 notification/provider side effect contract는 wire field나 발송 정책을 바꾸지 않았습니다. Public-safe projection scan과 기존 regression은 유지하되 live send/provider call은 실행하지 않습니다.

## Verification evidence

| Evidence | Result |
| --- | --- |
| `./scripts/pre-push-check.sh --full --release` | **PASS** — pinned `pnpm@11.13.1`, frontend lint, build, Zod fixture freshness, server quality, Testcontainers integration, public release candidate, AI config와 observability config를 포함한 전체 gate |
| Frontend unit/coverage | **PASS** — 274 files / 2,153 tests; 84.50% statements, 79.63% branches, 84.30% functions, 85.25% lines |
| Server unit/architecture | **PASS** — unit 1,091 tests(1 skipped), architecture 28 tests; failure/error 0 |
| Server integration | **PASS** — MySQL/Testcontainers 872 tests; failure/error 0 |
| Chromium E2E | **PASS** — 146/146 |
| Dependency audit | **PASS** — `corepack pnpm audit --audit-level high`; known vulnerability 0 |
| Public/deploy safety | **PASS** — deploy workflow contract, scanned-image promotion invariant, gitleaks/public candidate, production AI config와 Prometheus/Tempo/Grafana/Alertmanager validation |

첫 full gate는 모바일 세션 편집기의 5개 탭이 실제로 viewport 안에 들어가는데도 overflow를 요구하던 stale E2E assertion 1건을 검출했습니다. 현행 반응형 계약과 같은 suite의 인접 검증을 기준으로 기대값을 수정했고, 해당 focused E2E 1/1과 전체 release gate를 새로 실행해 통과했습니다.

Tag 후 원격 `main` CI, server image scan/promote, OCI Flyway/health, frontend deployment와 production smoke 결과는 배포 완료 뒤 workflow ID와 공개 가능한 상태만 추가합니다.

## Production boundary

- OCI backend와 frontend는 같은 `v2.3.0` tag를 사용합니다.
- Backend promotion 전 최근 48시간 DB backup과 tag image scan/promote 성공을 확인합니다.
- Backend promotion 뒤 Flyway V47, `/internal/health`, anonymous BFF auth와 OAuth redirect를 확인한 뒤에만 frontend를 dispatch합니다.
- Final smoke는 read-only/no-send 경로만 사용합니다. 실제 OAuth provider 완료, AI generation, email dispatch, member/admin lifecycle mutation은 별도 승인 없이는 실행하지 않습니다.
