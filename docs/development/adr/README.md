# Architecture Decision Records

ReadMates의 주요 기술 의사결정을 기록한다. 새 결정을 내릴 때는 `template.md`를 복사해 다음 번호로 추가하고, 이 인덱스를 갱신한다.

## 작성 규약

- **한 ADR = 한 결정.** 여러 결정을 묶는 ADR은 만들지 않는다. 인덱스가 ADR 그룹화 역할을 한다.
- **번호와 파일명은 영구 식별자.** 생성 뒤 ADR 번호를 바꾸거나 파일명을 rename/delete하지 않는다.
- **Superseded never deleted.** 결정이 뒤집히면 새 ADR을 만들고 기존 ADR의 상태를 `Superseded by ADR-NNNN`으로 갱신한다. 본문은 수정하지 않는다(당시 맥락 보존).
- **승인된 결정만 기록.** 미정 의견, 토론 중 사항, 향후 가설은 들어가지 않는다. 승인됐지만 아직 구현되지 않은 결정은 `Proposed`, 현재 코드·테스트·active architecture와 일치하는 결정은 `Accepted`다. 토론과 대안 탐색은 `docs/superpowers/specs/`, `docs/superpowers/plans/`의 영역이다.
- **코드 인용은 `path:line`.** 인용한 라인은 작성 시점의 commit에서 검증되어야 한다. 심볼 이름을 함께 적어 라인 drift 후에도 의미 추적이 가능하게 한다.
- **Public-repo safety.** 실제 secret, OCI OCID, 실명 회원 정보, 내부 호스트는 ADR에 적지 않는다. `.gitleaks.toml`이 통과해야 한다. 예시 URL은 `https://api.example.com` 같은 placeholder를 사용한다.

## 작업 중 관리 절차

1. Spec·implementation plan·direct implementation 시작 전에 이 인덱스를 읽고 ADR impact를 `none`, `update`, `new`, `supersede`로 기록한다. Non-`none` spec/plan과 pull request는 실제 `ADR-NNNN` reference를 함께 적는다.
2. 표면 수와 무관하게 앞으로의 product·technical·design·operational 판단을 제약하는 durable decision은 direct implementation을 시작하기 전 한 결정당 한 `Proposed` ADR로 만든다.
3. Executor는 관련 ADR을 task 근거로 사용하고 accepted ADR과의 충돌을 먼저 해소한다.
4. 코드, tests, `docs/development/architecture.md`, 관련 guide가 같은 계약을 설명할 때만 `Accepted`로 승격한다.
5. 결정을 바꾸면 기존 본문을 고치지 않고 새 ADR로 supersede한다. 두 인덱스와 기존 ADR 상태를 함께 갱신한다.
6. 최종 handoff와 pull request body는 ADR impact, ADR reference, 남은 `Proposed` ADR을 적는다. CI registry checker는 direct implementation pull request에도 이 선언을 요구한다. Proposed는 완료 증거가 아니라 남은 구현 의무다.

Routine refactor, component-local layout, reversible implementation detail은 ADR 대상이 아니다. ADR 수를 늘리는 것보다 미래 판단에 실제 제약을 주는 결정을 빠뜨리지 않는 것이 목적이다.

## 인덱스

| # | 제목 | 상태 | 결정일 | 영향 영역 |
|---|------|------|--------|----------|
| [0001](0001-cloudflare-pages-functions-bff.md) | Cloudflare Pages Functions를 BFF로 채택 | Accepted | 2026-04-21 | front, security |
| [0002](0002-server-clean-architecture-with-archunit.md) | Server clean architecture + ArchUnit 강제 | Accepted | 2026-04-22 | server |
| [0003](0003-frontend-route-first-architecture.md) | Frontend route-first architecture | Accepted | 2026-04-23 | front |
| [0004](0004-transactional-outbox-with-kafka-relay.md) | Transactional outbox + Kafka relay (notification) | Accepted | 2026-04-29 | server, infra |
| [0005](0005-bff-shared-secret-with-rotation.md) | BFF shared secret + multi-secret rotation | Accepted | 2026-05-09 | front, server, security |
| [0006](0006-server-side-hashed-session-cookie.md) | 서버 측 hashed session cookie (raw token 미저장) | Accepted | 2026-04-21 | server, security |
| [0007](0007-mysql-with-flyway-over-alternatives.md) | MySQL 8 + Flyway (Liquibase/Prisma migrate 기각) | Accepted | 2026-04-19 | server, data |
| [0008](0008-multi-club-domain-with-host-resolution.md) | Multi-club domain — host header + slug 우선순위 | Accepted | 2026-04-30 | server, front |
| [0009](0009-frontend-backend-contract-via-zod.md) | Frontend-backend contract test (Zod schema) | Accepted | 2026-05-06 | front, server |
| [0010](0010-public-repo-safety-automation.md) | 공개 저장소 안전 자동화 (gitleaks + custom scanner) | Accepted | 2026-04-22 | ops, security |
| [0012](0012-redis-as-optional-auxiliary-state.md) | Redis를 선택적 보조 상태로 제한 | Accepted | 2026-08-22 | server, data, ops |
| [0013](0013-bff-host-header-policy.md) | BFF host 헤더 정책 — slug 명시 누락 vs host fallback 분기 | Accepted | 2026-05-11 | server, security |
| [0014](0014-bff-secret-rotation-lifecycle.md) | BFF secret rotation lifecycle — 4단계 절차 + preflight 진단 엔드포인트 | Accepted | 2026-05-12 | front, security |
| [0015](0015-notification-outbox-dedupe-policy.md) | Notification Outbox dedupeKey 정책 | Accepted | 2026-05-12 | server |
| [0016](0016-deploy-ledger-event-schema.md) | Deploy ledger NDJSON event schema + dual-format writer | Accepted | 2026-05-12 | ops |
| [0017](0017-separate-web-and-notification-worker-processes.md) | Web과 notification worker process를 분리 운영 | Proposed | 2026-08-22 | server, ops |
| [0018](0018-canonical-meeting-product-language.md) | 사용자 핵심 객체를 `모임`과 `기록`으로 통일 | Accepted | 2026-08-22 | product, front, content |
| [0019](0019-url-authoritative-club-workspaces.md) | URL이 소유하는 club-scoped workspace identity | Accepted | 2026-08-22 | front, product |
| [0020](0020-shared-brand-role-composition.md) | 하나의 브랜드 시스템과 역할별 composition grammar | Superseded by ADR-0045 | 2026-08-22 | design, front |
| [0021](0021-response-and-attendance-as-separate-facts.md) | 참석 응답과 실제 출석을 별도 사실로 유지 | Accepted | 2026-08-22 | product, server, front |
| [0022](0022-lifecycle-audience-and-public-placement.md) | 모임 lifecycle, app audience, 공개 사이트 배치를 독립 축으로 유지 | Accepted | 2026-08-22 | product, server, front |
| [0023](0023-revision-guarded-host-mutations.md) | Domain revision으로 host mutation을 조건부 실행 | Accepted | 2026-08-22 | server, front |
| [0024](0024-explicit-unknown-actual-attendance.md) | 실제 출석에 명시적 `UNKNOWN` correction 상태 제공 | Accepted | 2026-08-22 | product, server, front |
| [0025](0025-session-participant-snapshot-owns-response-denominator.md) | 모임 참여자 snapshot이 응답 분모를 소유 | Accepted | 2026-08-22 | product, server |
| [0026](0026-common-global-club-shell.md) | Member와 host가 공통 global club shell을 사용 | Superseded by ADR-0051 | 2026-08-22 | product, design, front |
| [0027](0027-current-meeting-local-task-navigation.md) | 현재 모임 작업은 local task navigation으로 분리 | Superseded by ADR-0044 | 2026-08-22 | product, design, front |
| [0028](0028-idempotent-host-mutation-receipts.md) | Host mutation을 idempotency receipt로 재조정 | Accepted | 2026-08-22 | server, front |
| [0029](0029-bff-secret-and-origin-validation.md) | Mutating API에 BFF secret과 Origin/Referer를 함께 검증 | Accepted | 2026-08-22 | server, security |
| [0030](0030-role-and-sensitive-document-access.md) | 역할 권한과 민감 문서 접근 권한을 분리 | Accepted | 2026-08-22 | server, product, security |
| [0031](0031-low-cardinality-metric-tags.md) | Notification 운영 metric tag를 low-cardinality 값으로 제한 | Accepted | 2026-08-22 | server, ops |
| [0032](0032-weekly-client-ip-hash-salt.md) | Client IP hash salt를 ISO 주 단위로 회전 | Accepted | 2026-08-22 | server, security |
| [0033](0033-application-service-transaction-boundaries.md) | Business orchestration owner가 transaction boundary를 소유 | Accepted | 2026-08-22 | server |
| [0034](0034-global-host-client-contract-generation.md) | Client contract generation을 모든 host mutation에 적용 | Proposed | 2026-08-22 | server, BFF, front |
| [0035](0035-purge-host-state-on-authority-loss.md) | Host authority 상실 시 client의 host-sensitive state를 폐기 | Accepted | 2026-08-22 | product, security, front |
| [0036](0036-public-projection-cache-convergence.md) | Public projection 원자성과 cache convergence를 분리 | Proposed | 2026-08-22 | server, BFF, ops, product |
| [0037](0037-platform-admin-emergency-public-takedown.md) | 긴급 public takedown을 platform-admin 전용 command로 실행 | Proposed | 2026-08-22 | platform ops, security, server |
| [0038](0038-server-owned-host-list-cursor-epochs.md) | Host 모임·기록 목록을 server-owned cursor epoch로 제공 | Accepted | 2026-08-22 | server, front, product |
| [0039](0039-platform-admin-task-centered-service-spine.md) | 플랫폼 어드민을 task-centered Service Spine으로 구성 | Accepted | 2026-08-22 | product, design, platform ops |
| [0040](0040-domain-owned-admin-safe-command-protocol.md) | 플랫폼 어드민 mutation을 도메인 소유 safe-command protocol로 실행 | Accepted | 2026-08-22 | platform ops, security, server |
| [0041](0041-domain-separated-platform-admin-invitation-delivery-token.md) | 플랫폼 어드민 초대 전달 토큰을 도메인 분리 HMAC으로 재생성 | Accepted | 2026-08-24 | platform ops, security, server |
| [0042](0042-purpose-separated-platform-admin-audit-cursors.md) | 플랫폼 어드민 audit cursor를 V57 digest key로 서명 | Accepted | 2026-08-24 | platform ops, security, server |
| [0043](0043-minimize-platform-admin-support-reason-evidence.md) | 플랫폼 어드민 support access 사유 evidence를 최소화 | Accepted | 2026-08-24 | platform ops, security, server, front |
| [0044](0044-host-focus-deck-primary-action-composition.md) | 호스트 현재 모임을 Focus Deck 단일 주 행동으로 구성 | Superseded by ADR-0046 | 2026-08-26 | product, design, front |
| [0045](0045-host-admin-focus-deck-editorial-ledger-composition.md) | 호스트·플랫폼 관리자 composition을 Focus Deck·Editorial Operations Ledger로 고정 | Accepted | 2026-08-26 | product, design, platform ops, front |
| [0046](0046-host-triage-home-meeting-diary-composition.md) | 호스트 워크스페이스를 오늘 트리아지 + 모임 다이어리로 재구성 | Superseded by ADR-0048 | 2026-08-27 | product, design, front |
| [0047](0047-admin-case-desk-narrative-composition.md) | 플랫폼 어드민을 케이스 데스크 + 운영 서사로 재구성 | Superseded by ADR-0050 | 2026-08-27 | product, design, platform ops, front |
| [0048](0048-host-lifecycle-operating-room-composition.md) | 호스트 워크스페이스를 모임 생애주기 운영실 + 작업함으로 구성 | Proposed | 2026-08-29 | product, design, front |
| [0049](0049-schedule-revision-seen-state.md) | 일정 revision 확인을 접속·참석 응답·실제 출석과 분리 | Proposed | 2026-08-29 | product, server, front, privacy |
| [0050](0050-platform-admin-today-operations-desk.md) | 플랫폼 어드민을 오늘 할 일 중심 운영 데스크로 재구성 | Proposed | 2026-08-30 | product, design, platform ops, front |
| [0051](0051-global-platform-and-club-space-transition.md) | 전역 공간을 플랫폼 운영·내 클럽 두 축으로 고정 | Proposed | 2026-08-30 | product, front, server, security |

## 상태 범례

- **Accepted** — 현재 코드/운영의 기준.
- **Proposed** — 승인됐지만 아직 코드·테스트·active architecture에 완전히 반영되지 않은 결정. 초안이나 토론 중 상태가 아니다.
- **Superseded by ADR-NNNN** — 새 결정으로 대체. 본문은 보존.
- **Deprecated** — 더 이상 사용하지 않음. 후속 ADR 없음 (단순 폐기).

## ADR 후보 (follow-up)

다음 결정들은 별도 ADR로 분리를 검토 중이다.

- ADR-0011: jOOQ write adapter migration (현재 JdbcTemplate 직접 사용 → 빌드 타임 타입 안전)
- OCI Compute 선택 (Cloud Run 대비)
