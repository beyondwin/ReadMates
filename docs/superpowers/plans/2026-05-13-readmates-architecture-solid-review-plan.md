# ReadMates Architecture/SOLID Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 ReadMates 코드 기준으로 아키텍처 경계, 과도하게 큰 모듈, SOLID 위반 후보를 재점검하고 실행 가능한 개선 순서를 정한다.

**Architecture:** 프런트엔드는 `src/app -> src/pages -> features -> shared` 방향과 feature `api/model/route/ui` 책임을 유지한다. 서버는 feature-local clean architecture를 유지하되, 통과 중인 ArchUnit 경계 밖에 남은 fat port와 대형 persistence/helper를 더 작은 use-case별 계약으로 나눈다.

**Tech Stack:** React 19, Vite 8, React Router 7, TypeScript, Cloudflare Pages Functions, Kotlin 2.2, Spring Boot 4.0, JDBC, MySQL/Flyway, Redis optional, Kafka/Redpanda, Vitest, JUnit 5, ArchUnit.

---

## 검토 기준

검토일: 2026-05-13

검토한 source of truth:

- `docs/development/architecture.md`
- `docs/agents/front.md`
- `docs/agents/server.md`
- `docs/agents/design.md`
- `docs/agents/docs.md`
- 현재 `front/`, `server/`, `.github/workflows`, `scripts/` 코드
- 이전 개선 기록: `docs/superpowers/plans/2026-05-05-readmates-improvement-analysis-review-plan.md`, `docs/superpowers/plans/2026-05-05-readmates-improvement-analysis-detailed-implementation.md`

실행한 빠른 검증:

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

결과:

- Frontend boundary test: PASS, 6 tests.
- Server architecture boundary test: PASS, build successful.

보조 정적 확인:

```bash
rg -n 'use client' front -g '*.{ts,tsx}' -g '!node_modules/**' -g '!dist/**'
find server/src/main/resources/db/migration -type f 2>/dev/null | sort
rg -n 'ObjectProvider<JdbcTemplate>|ObjectProvider<.*JdbcTemplate' server/src/main/kotlin server/src/test/kotlin -g '*.kt'
rg -n 'spring-boot-starter-data-jpa|jakarta.persistence|javax.persistence|@Entity' server -g '*.{kts,yml,kt}'
```

결과 요약:

- Vite source의 `"use client"` 잔재 없음.
- dead Flyway path인 `server/src/main/resources/db/migration` 운영 SQL 없음.
- production source의 `ObjectProvider<JdbcTemplate>` fail-open 없음.
- JPA starter/entity 사용 없음. 다만 test property에 `spring.jpa.hibernate.ddl-auto=validate` 문자열이 2곳 남아 있어 P3 문서/테스트 위생 후보로 남긴다.

## 결론

현재 코드에는 즉시 깨진 P0 아키텍처 위반은 보이지 않는다. 기존 frontend boundary test와 server ArchUnit test는 통과하고, 2026-05-05 개선 계획에서 지적했던 dead Flyway path, JPA dependency, `ObjectProvider<JdbcTemplate>`, `"use client"` 같은 큰 위생 항목은 대부분 처리되어 있다.

남은 핵심 리스크는 guardrail 밖에 있다.

1. 프런트 host feature에서 `model`이 `ui` 타입을 import하고, UI용 타입 파일이 API response contract와 중복된다.
2. `member-home`만 아직 `ui`가 아니라 legacy `components` public surface를 쓰며, presentation component가 API contract를 직접 import한다.
3. 서버 application outbound port가 use case별로 충분히 쪼개지지 않아 ISP/DIP 관점의 변경 폭이 커져 있다.
4. notification/session persistence helper가 400-600라인대로 커져 SQL query, state transition, host ledger, worker claim 책임이 한 파일에 모인다.
5. 몇몇 프런트 화면 파일은 이미 하위 컴포넌트가 있어도 700-1,000라인대를 유지해 review와 테스트 초점이 흐려진다.

## 판정표

| ID | 우선순위 | 표면 | 증거 | 문제 | 결정 |
| --- | --- | --- | --- | --- | --- |
| F1 | P1 | Front host | `front/features/host/model/host-session-editor-form-state.ts:1`이 `features/host/ui/host-ui-types`를 import한다. `front/tests/unit/frontend-boundaries.test.ts:320-338`은 model의 `ui` import를 금지하지 않는다. | route-first 경계상 `model`은 UI에 의존하면 안 된다. 현재 test가 PASS라서 새 회귀도 통과할 수 있다. | host view type을 `model`로 옮기고 boundary test에 `model -> ui/route` 금지를 추가한다. |
| F2 | P1 | Front host | `front/features/host/ui/host-ui-types.ts`가 `HostSessionDetailResponse`, `HostDashboardResponse`, `HostMemberListItem` 등을 정의하고 `front/features/host/api/host-contracts.ts`에도 같은 계열 타입이 있다. | API contract와 UI view contract가 암묵적으로 같은 shape라고 가정한다. 계약 변경 시 한쪽만 바뀌어도 타입 드리프트가 생긴다. | API contract는 `api`, view type은 `model`, UI는 view type만 import하게 한다. route/data layer에서 mapping 책임을 가진다. |
| F3 | P1 | Front member home | `front/features/member-home/components/member-home.tsx:15-20`이 API contract를 import하고, `front/src/pages/app-home.tsx`가 `features/member-home/components/member-home`을 public surface로 import한다. | `components`는 boundary test의 `ui` 금지를 우회한다. presentation component가 API shape에 결합한다. | `member-home/ui`와 `member-home/model`을 만들고 legacy `components` public surface를 제거한다. |
| S1 | P1 | Server auth | `MemberAccountStorePort`가 `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAccountStorePort.kt:12-50`에 18개 메서드를 가진다. | Google login, current member lookup, platform admin lookup, joined club list, dev-login이 하나의 outbound port에 묶여 ISP를 위반한다. | 작은 outbound port로 분리하고 application service가 필요한 최소 port만 주입받게 한다. |
| S2 | P2 | Server session | `HostSessionWritePort`가 `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt:27-42`에서 list/detail/dashboard/upcoming/create/update/lifecycle/attendance/publication/delete를 모두 소유한다. | 이름은 WritePort지만 query와 dashboard까지 포함한다. `HostSessionCommandService`도 여러 inbound use case를 한 class에서 구현한다. | port와 service를 read/draft/lifecycle/publication/attendance/deletion 단위로 분리한다. |
| S3 | P2 | Server notification | `NotificationDeliveryPort`가 `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryPort.kt:19-60`에서 planning, claiming, status mutation, backlog, host ledger를 모두 소유하고 default `error(...)` method를 가진다. | port implementer가 사용하지 않는 메서드까지 알아야 하고, 기본 실패 구현이 런타임까지 남는다. | delivery planning/claim/status/backlog/host-ledger port를 분리하고 default failure method를 제거한다. |
| S4 | P2 | Server notification persistence | `NotificationDeliveryQueries.kt` 574라인, `NotificationDeliveryWriteOperations.kt` 425라인. | host ledger read, worker claim, recipient planning, backlog count, row mapping 협업이 한 helper cluster에 모여 변경 이유가 많다. | S3 이후 SQL helper를 port 책임별 파일로 나눈다. |
| U1 | P3 | Front UI size | 큰 파일: `archive-page.tsx` 1,074라인, `host-session-editor.tsx` 952라인, `host-notifications-page.tsx` 856라인, `current-session-mobile.tsx` 798라인, `member-session-detail-page.tsx` 776라인. | 기능 버그는 아니지만 review 단위가 크고 UI 상태/markup/helper가 섞인다. | P1 boundary cleanup 후 화면별 split plan을 작은 PR로 실행한다. |
| D1 | P3 | Docs/test hygiene | `spring.jpa.hibernate.ddl-auto=validate`가 `MySqlFlywayMigrationTest.kt`, `ReadmatesMySqlSeedTest.kt`에 남아 있으나 JPA starter/entity는 없다. | 동작 위험은 낮지만 ORM을 쓰는 것처럼 오해를 만든다. | test property 제거 후 migration/seed tests로 확인한다. |
| D2 | P3 | Docker maintenance | `server/Dockerfile`과 `server/Dockerfile.release`가 runtime stage를 중복 정의한다. `deploy-server.yml`은 CI에서 `bootJar` 후 `Dockerfile.release`로 image를 만든다. | 배포 재현성은 CI에 의해 확보되지만 runtime image instruction이 두 파일에서 드리프트할 수 있다. | Dockerfile runtime stage를 하나로 수렴하거나 release Dockerfile 생성 이유를 문서화한다. |

## 제외 또는 이미 해소된 항목

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 기존 frontend route-first boundary 붕괴 | 제외 | `frontend-boundaries.test.ts` PASS. 단, F1/F3처럼 test 밖의 구멍은 남아 있다. |
| 서버 application이 Spring Web/HTTP/Security type에 의존 | 제외 | `ServerArchitectureBoundaryTest` PASS. 정적 검색에서 application package의 Spring Security 직접 import는 KDoc 링크 1건뿐이다. |
| dead Flyway `db/migration` 운영 경로 | 해소 | `server/src/main/resources/db/migration`에 운영 SQL 없음. 운영 path는 `db/mysql/migration`. |
| `ObjectProvider<JdbcTemplate>` fail-open | 해소 | production source에는 없음. ArchUnit test가 guard한다. |
| JPA starter 사용 | 해소 | `server/build.gradle.kts`는 JDBC starter만 사용한다. |
| Vite source `"use client"` 잔재 | 해소 | 정적 검색 결과 없음. |
| Public repo safety에 즉시 위험한 token-shaped 예시 | 이번 범위 제외 | 본 검토는 구조/SOLID 중심이다. 공개 릴리즈 전에는 별도 release candidate scanner를 계속 사용한다. |

## 실행 순서

### Wave 1: Guardrail 밖의 boundary hole 닫기

1. F1/F2: host view type을 `model`로 이동하고 `model -> ui/route` 금지를 frontend boundary test에 추가한다.
2. F3: `member-home`을 `api/model/route/ui`로 맞추고 legacy `components` surface를 제거한다.

이 wave는 서버 변경 없이 프런트 경계를 명확히 한다. 검증은 frontend boundary test, 관련 unit test, lint/test/build를 사용한다.

### Wave 2: 서버 outbound port ISP 개선

1. S1: auth account/member/platform/dev-login port를 분리한다.
2. S2: session host read/write/lifecycle/attendance/publication/delete port와 service를 분리한다.
3. S3: notification delivery port를 planning/claim/status/backlog/host-ledger로 분리한다.

이 wave는 runtime behavior를 바꾸지 않는 구조 개선이 목표다. 각 PR은 기존 controller/API 테스트와 `ServerArchitectureBoundaryTest`를 통과해야 한다.

### Wave 3: 대형 파일과 유지보수 위생

1. S4: notification persistence helper를 port 책임별 SQL helper로 나눈다.
2. U1: archive/current-session/host-notifications/host-session-editor 화면 split을 진행한다.
3. D1/D2: test property와 Dockerfile runtime 중복을 정리한다.

이 wave는 결함 수정이 아니라 reviewability와 drift 방지를 위한 정리다. 제품 동작 변경을 섞지 않는다.

## 릴리즈 리스크

- 현재 검토만으로 release blocker는 확인하지 않았다. release readiness 질문이면 `origin/main..HEAD` 기준으로 `docs/development/release-readiness-review.md`를 별도로 따라야 한다.
- Wave 1은 프런트 import surface를 크게 바꾸므로 unit test import 경로와 lazy route import를 함께 확인해야 한다.
- Wave 2는 Spring DI bean 수가 늘어난다. adapter class를 먼저 multi-port implementer로 두면 runtime SQL 변경 없이 DI risk를 줄일 수 있다.
- Wave 3 UI split은 visual regression을 낼 수 있다. 관련 unit test만으로 충분하지 않으므로 최소 desktop/mobile manual 또는 browser screenshot 확인을 붙인다.

## 구현 문서

상세 구현 절차는 `docs/superpowers/plans/2026-05-13-readmates-architecture-solid-detailed-implementation.md`를 따른다.
