# Architecture Decision Records

ReadMates의 주요 기술 의사결정을 기록한다. 새 결정을 내릴 때는 `template.md`를 복사해 다음 번호로 추가하고, 이 인덱스를 갱신한다.

## 작성 규약

- **한 ADR = 한 결정.** 여러 결정을 묶는 ADR은 만들지 않는다. 인덱스가 ADR 그룹화 역할을 한다.
- **Superseded never deleted.** 결정이 뒤집히면 새 ADR을 만들고 기존 ADR의 상태를 `Superseded by ADR-NNNN`으로 갱신한다. 본문은 수정하지 않는다(당시 맥락 보존).
- **사실만 기록.** 미정 의견, 토론 중 사항, 향후 가설은 들어가지 않는다. 그건 `docs/superpowers/specs/`, `docs/superpowers/plans/`의 영역이다.
- **코드 인용은 `path:line`.** 인용한 라인은 작성 시점의 commit에서 검증되어야 한다. 심볼 이름을 함께 적어 라인 drift 후에도 의미 추적이 가능하게 한다.
- **Public-repo safety.** 실제 secret, OCI OCID, 실명 회원 정보, 내부 호스트는 ADR에 적지 않는다. `.gitleaks.toml`이 통과해야 한다. 예시 URL은 `https://api.example.com` 같은 placeholder를 사용한다.

## 인덱스

| # | 제목 | 상태 | 결정일 | 영향 영역 |
|---|------|------|--------|----------|
| [0001](0001-cloudflare-pages-functions-bff.md) | Cloudflare Pages Functions BFF 채택 | Accepted | 2026-04-21 | front, security |
| [0002](0002-server-clean-architecture-with-archunit.md) | Server clean architecture + ArchUnit 강제 | Accepted | 2026-04-22 | server |
| [0003](0003-frontend-route-first-architecture.md) | Frontend route-first architecture | Accepted | 2026-04-23 | front |
| [0004](0004-transactional-outbox-with-kafka-relay.md) | Transactional outbox + Kafka relay (notification) | Accepted | 2026-04-29 | server, infra |
| [0005](0005-bff-shared-secret-with-rotation.md) | BFF shared secret + multi-secret rotation | Accepted | 2026-05-09 | front, server, security |
| [0006](0006-server-side-hashed-session-cookie.md) | 서버 측 hashed session cookie (raw token 미저장) | Accepted | 2026-04-21 | server, security |
| [0007](0007-mysql-with-flyway-over-alternatives.md) | MySQL 8 + Flyway (Liquibase/Prisma migrate 기각) | Accepted | 2026-04-19 | server, data |
| [0008](0008-multi-club-domain-with-host-resolution.md) | Multi-club domain — host header + slug 우선순위 | Accepted | 2026-04-30 | server, front |
| [0009](0009-frontend-backend-contract-via-zod.md) | Frontend-backend contract test (Zod schema) | Accepted | 2026-05-06 | front, server |
| [0010](0010-public-repo-safety-automation.md) | 공개 저장소 안전 자동화 (gitleaks + custom scanner) | Accepted | 2026-04-22 | ops, security |
| [0013](0013-bff-host-header-policy.md) | BFF host 헤더 정책 — slug 명시 누락 vs host fallback 분기 | Accepted | 2026-05-11 | server, security |
| [0015](0015-notification-outbox-dedupe-policy.md) | Notification Outbox dedupeKey 정책 | Accepted | 2026-05-12 | server |

## 상태 범례

- **Accepted** — 현재 코드/운영의 기준.
- **Proposed** — 작성 중. 코드 반영 전.
- **Superseded by ADR-NNNN** — 새 결정으로 대체. 본문은 보존.
- **Deprecated** — 더 이상 사용하지 않음. 후속 ADR 없음 (단순 폐기).

## ADR 후보 (follow-up)

다음 결정들은 별도 ADR로 분리를 검토 중이다.

- ADR-0011: jOOQ write adapter migration (현재 JdbcTemplate 직접 사용 → 빌드 타임 타입 안전)
- ADR-0012: Redis 정식 도입 (현재 optional 보조 계층 → 세션 캐시 필수 계층)
- ADR-0014: OCI Compute 선택 (Cloud Run 대비)
- ADR-0016: Worker process 분리 운영 (web replica + notification worker)
