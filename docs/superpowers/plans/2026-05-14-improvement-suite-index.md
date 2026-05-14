# ReadMates Improvement Suite — Index

> 2026-05-14 분석 기반 개선 제안 묶음. 각 플랜은 단독 PR로 머지 가능하도록 분리되어 있습니다.

## 컨텍스트

- React 19 + Vite 8 (rolldown) + TypeScript 5.8 SPA
- Cloudflare Pages Functions BFF
- Kotlin 2.2 + Spring Boot 4.0 + Java 21 + MySQL + Flyway
- Outbox + Kafka 알림 파이프라인, 선택적 Redis
- 서버 테스트 131개, 프론트 unit 테스트 30+개 (모두 `front/tests/unit/`)

## 플랜 목록

| 순번 | 파일 | 우선순위 | 추정 | 의존성 |
|---|---|---|---|---|
| 1 | [front-tsconfig-modernize](./2026-05-14-front-tsconfig-modernize.md) | P0 | 0.5d | 없음 |
| 2 | [server-architecture-cqrs-documentation](./2026-05-14-server-architecture-cqrs-documentation.md) | P1 | 1d | 없음 |
| 3 | [front-server-state-tanstack-query](./2026-05-14-front-server-state-tanstack-query.md) | P1 | 5–8d | (5) coverage gate 이후 권장 |
| 4 | [front-router-split](./2026-05-14-front-router-split.md) | P2 | 0.5d | 없음 |
| 5 | [front-coverage-and-colocation](./2026-05-14-front-coverage-and-colocation.md) | P0 | 1d | 없음 |
| 6 | [server-static-analysis-gates](./2026-05-14-server-static-analysis-gates.md) | P1 | 1d | 없음 |
| 7 | [env-example-grouping](./2026-05-14-env-example-grouping.md) | P3 | 0.25d | 없음 |

## 권장 실행 순서

1. **P0 동시 진행:** (1) tsconfig, (5) coverage gate, (7) env 그룹화 — 모두 격리된 변경.
2. **P1 직렬:** (6) detekt/ktlint 게이트 → (2) CQRS 문서화/ArchUnit 보강 → (3) TanStack Query.
3. **P2 마지막:** (4) router split — (3) 도입 시 자연스럽게 함께 가는 변경.

## 머지 안전 원칙

- 각 플랜은 main에 단독 머지 가능. (3) TanStack 마이그레이션은 feature-by-feature 점진 PR.
- 모든 플랜은 `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build` 또는 서버 `./gradlew unitTest architectureTest` 통과를 마지막 단계로 강제.
- public 저장소이므로 secret/내부 OCID/도메인 노출 금지.
