# 주요 기술적 의사결정

ReadMates의 durable product·technical·design·operational decision은 [ADR 인덱스](adr/README.md)가 유일한 canonical registry다. 이 문서는 기존 링크 호환을 위한 파생 인덱스이며 별도 결정 산문을 두지 않는다. `Accepted`는 현재 코드·테스트·active architecture와 일치하는 판단 근거이고, `Proposed`는 승인됐지만 아직 구현되지 않은 의무다.

| ADR | 제목 | 상태 |
|-----|------|------|
| [ADR-0001](adr/0001-cloudflare-pages-functions-bff.md) | Cloudflare Pages Functions를 BFF로 채택 | Accepted |
| [ADR-0002](adr/0002-server-clean-architecture-with-archunit.md) | Server clean architecture + ArchUnit 강제 | Accepted |
| [ADR-0003](adr/0003-frontend-route-first-architecture.md) | Frontend route-first architecture | Accepted |
| [ADR-0004](adr/0004-transactional-outbox-with-kafka-relay.md) | Transactional outbox + Kafka relay (notification) | Accepted |
| [ADR-0005](adr/0005-bff-shared-secret-with-rotation.md) | BFF shared secret + multi-secret rotation | Accepted |
| [ADR-0006](adr/0006-server-side-hashed-session-cookie.md) | 서버 측 hashed session cookie (raw token 미저장) | Accepted |
| [ADR-0007](adr/0007-mysql-with-flyway-over-alternatives.md) | MySQL 8 + Flyway (Liquibase/Prisma migrate 기각) | Accepted |
| [ADR-0008](adr/0008-multi-club-domain-with-host-resolution.md) | Multi-club domain — host header + slug 우선순위 | Accepted |
| [ADR-0009](adr/0009-frontend-backend-contract-via-zod.md) | Frontend-backend contract test (Zod schema) | Accepted |
| [ADR-0010](adr/0010-public-repo-safety-automation.md) | 공개 저장소 안전 자동화 (gitleaks + custom scanner) | Accepted |
| [ADR-0012](adr/0012-redis-as-optional-auxiliary-state.md) | Redis를 선택적 보조 상태로 제한 | Accepted |
| [ADR-0013](adr/0013-bff-host-header-policy.md) | BFF host 헤더 정책 — slug 명시 누락 vs host fallback 분기 | Accepted |
| [ADR-0014](adr/0014-bff-secret-rotation-lifecycle.md) | BFF secret rotation lifecycle — 4단계 절차 + preflight 진단 엔드포인트 | Accepted |
| [ADR-0015](adr/0015-notification-outbox-dedupe-policy.md) | Notification Outbox dedupeKey 정책 | Accepted |
| [ADR-0016](adr/0016-deploy-ledger-event-schema.md) | Deploy ledger NDJSON event schema + dual-format writer | Accepted |
| [ADR-0017](adr/0017-separate-web-and-notification-worker-processes.md) | Web과 notification worker process를 분리 운영 | Proposed |
| [ADR-0018](adr/0018-canonical-meeting-product-language.md) | 사용자 핵심 객체를 `모임`과 `기록`으로 통일 | Accepted |
| [ADR-0019](adr/0019-url-authoritative-club-workspaces.md) | URL이 소유하는 club-scoped workspace identity | Accepted |
| [ADR-0020](adr/0020-shared-brand-role-composition.md) | 하나의 브랜드 시스템과 역할별 composition grammar | Superseded by ADR-0045 |
| [ADR-0021](adr/0021-response-and-attendance-as-separate-facts.md) | 참석 응답과 실제 출석을 별도 사실로 유지 | Accepted |
| [ADR-0022](adr/0022-lifecycle-audience-and-public-placement.md) | 모임 lifecycle, app audience, 공개 사이트 배치를 독립 축으로 유지 | Accepted |
| [ADR-0023](adr/0023-revision-guarded-host-mutations.md) | Domain revision으로 host mutation을 조건부 실행 | Accepted |
| [ADR-0024](adr/0024-explicit-unknown-actual-attendance.md) | 실제 출석에 명시적 `UNKNOWN` correction 상태 제공 | Accepted |
| [ADR-0025](adr/0025-session-participant-snapshot-owns-response-denominator.md) | 모임 참여자 snapshot이 응답 분모를 소유 | Accepted |
| [ADR-0026](adr/0026-common-global-club-shell.md) | Member와 host가 공통 global club shell을 사용 | Superseded by ADR-0051 |
| [ADR-0027](adr/0027-current-meeting-local-task-navigation.md) | 현재 모임 작업은 local task navigation으로 분리 | Superseded by ADR-0044 |
| [ADR-0028](adr/0028-idempotent-host-mutation-receipts.md) | Host mutation을 idempotency receipt로 재조정 | Accepted |
| [ADR-0029](adr/0029-bff-secret-and-origin-validation.md) | Mutating API에 BFF secret과 Origin/Referer를 함께 검증 | Accepted |
| [ADR-0030](adr/0030-role-and-sensitive-document-access.md) | 역할 권한과 민감 문서 접근 권한을 분리 | Accepted |
| [ADR-0031](adr/0031-low-cardinality-metric-tags.md) | Notification 운영 metric tag를 low-cardinality 값으로 제한 | Accepted |
| [ADR-0032](adr/0032-weekly-client-ip-hash-salt.md) | Client IP hash salt를 ISO 주 단위로 회전 | Accepted |
| [ADR-0033](adr/0033-application-service-transaction-boundaries.md) | Business orchestration owner가 transaction boundary를 소유 | Accepted |
| [ADR-0034](adr/0034-global-host-client-contract-generation.md) | Client contract generation을 모든 host mutation에 적용 | Proposed |
| [ADR-0035](adr/0035-purge-host-state-on-authority-loss.md) | Host authority 상실 시 client의 host-sensitive state를 폐기 | Accepted |
| [ADR-0036](adr/0036-public-projection-cache-convergence.md) | Public projection 원자성과 cache convergence를 분리 | Proposed |
| [ADR-0037](adr/0037-platform-admin-emergency-public-takedown.md) | 긴급 public takedown을 platform-admin 전용 command로 실행 | Proposed |
| [ADR-0038](adr/0038-server-owned-host-list-cursor-epochs.md) | Host 모임·기록 목록을 server-owned cursor epoch로 제공 | Accepted |
| [ADR-0039](adr/0039-platform-admin-task-centered-service-spine.md) | 플랫폼 어드민을 task-centered Service Spine으로 구성 | Accepted |
| [ADR-0040](adr/0040-domain-owned-admin-safe-command-protocol.md) | 플랫폼 어드민 mutation을 도메인 소유 safe-command protocol로 실행 | Accepted |
| [ADR-0041](adr/0041-domain-separated-platform-admin-invitation-delivery-token.md) | 플랫폼 어드민 초대 전달 토큰을 도메인 분리 HMAC으로 재생성 | Accepted |
| [ADR-0042](adr/0042-purpose-separated-platform-admin-audit-cursors.md) | 플랫폼 어드민 audit cursor를 V57 digest key로 서명 | Accepted |
| [ADR-0043](adr/0043-minimize-platform-admin-support-reason-evidence.md) | 플랫폼 어드민 support access 사유 evidence를 최소화 | Accepted |
| [ADR-0044](adr/0044-host-focus-deck-primary-action-composition.md) | 호스트 현재 모임을 Focus Deck 단일 주 행동으로 구성 | Superseded by ADR-0046 |
| [ADR-0045](adr/0045-host-admin-focus-deck-editorial-ledger-composition.md) | 호스트·플랫폼 관리자 composition을 Focus Deck·Editorial Operations Ledger로 고정 | Accepted |
| [ADR-0046](adr/0046-host-triage-home-meeting-diary-composition.md) | 호스트 워크스페이스를 오늘 트리아지 + 모임 다이어리로 재구성 | Superseded by ADR-0048 |
| [ADR-0047](adr/0047-admin-case-desk-narrative-composition.md) | 플랫폼 어드민을 케이스 데스크 + 운영 서사로 재구성 | Superseded by ADR-0050 |
| [ADR-0048](adr/0048-host-lifecycle-operating-room-composition.md) | 호스트 워크스페이스를 모임 생애주기 운영실 + 작업함으로 구성 | Proposed |
| [ADR-0049](adr/0049-schedule-revision-seen-state.md) | 일정 revision 확인을 접속·참석 응답·실제 출석과 분리 | Proposed |
| [ADR-0050](adr/0050-platform-admin-today-operations-desk.md) | 플랫폼 어드민을 오늘 할 일 중심 운영 데스크로 재구성 | Proposed |
| [ADR-0051](adr/0051-global-platform-and-club-space-transition.md) | 전역 공간을 플랫폼 운영·내 클럽 두 축으로 고정 | Proposed |

Active architecture는 [architecture.md](architecture.md), 검증 경로는 [test-guide.md](test-guide.md)와 각 ADR의 `검증` 절을 따른다. Server의 canonical PR gate는 `./scripts/server-ci-check.sh`다. 외부 서비스의 가격·한도·API 동작처럼 변할 수 있는 사실은 운영 판단 직전에 공식 source로 다시 확인한다.
