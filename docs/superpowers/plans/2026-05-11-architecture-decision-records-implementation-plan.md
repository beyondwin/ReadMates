# Architecture Decision Records — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates에 `docs/development/adr/` 디렉토리를 신설하고, 인덱스/템플릿 + 초기 10개 ADR을 backfill한다. 기존 `docs/development/technical-decisions.md`는 ADR 안내 + 인덱스 표 형태로 슬림화한다. 이 작업은 코드 변경을 포함하지 않으며, 모든 ADR은 작성 시점의 코드와 일치하는 사실만 기록한다.

**Architecture:** ADR 1개 = 파일 1개. 표준 MADR 변형 템플릿을 사용하며, 한글로 작성한다. 각 ADR은 컨텍스트→결정→근거→대안→결과→검증→후속 섹션을 포함한다. 인덱스(`README.md`)는 번호/제목/상태/결정일/영향 영역 표를 유지한다.

**Tech Stack:** 마크다운만. 새 의존성 없음. `.gitleaks.toml` 통과 필수.

**Spec:** `docs/superpowers/specs/2026-05-11-architecture-decision-records-design.md`

---

## File map

신규 작성:

- `docs/development/adr/README.md` — 인덱스 + 작성 규약
- `docs/development/adr/template.md` — ADR 템플릿
- `docs/development/adr/0001-cloudflare-pages-functions-bff.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `docs/development/adr/0003-frontend-route-first-architecture.md`
- `docs/development/adr/0004-transactional-outbox-with-kafka-relay.md`
- `docs/development/adr/0005-bff-shared-secret-with-rotation.md`
- `docs/development/adr/0006-server-side-hashed-session-cookie.md`
- `docs/development/adr/0007-mysql-with-flyway-over-alternatives.md`
- `docs/development/adr/0008-multi-club-domain-with-host-resolution.md`
- `docs/development/adr/0009-frontend-backend-contract-via-zod.md`
- `docs/development/adr/0010-public-repo-safety-automation.md`

수정:

- `docs/development/technical-decisions.md` — 상단 ADR 안내 + 본문을 인덱스 표로 슬림화
- `docs/development/README.md` — ADR 디렉토리 링크 추가

수정 금지:

- `README.md`(루트)는 본 작업 범위 밖. (case study spec에서 별도로 다룸.)
- `architecture.md`, `test-guide.md` 등 다른 dev 문서는 ADR 링크가 자연스러운 위치에서만 갱신 (Task 13에서 명시).

---

## Task 1: 디렉토리와 템플릿/인덱스 골격 작성

**Files:** 신규 `docs/development/adr/README.md`, `docs/development/adr/template.md`

이 task는 다른 ADR 파일들이 의존하는 골격을 먼저 만든다. 골격이 없으면 후속 ADR들의 링크가 일관되지 않게 된다.

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p docs/development/adr
```

(이미 존재하면 무시. `ls docs/development/adr` 결과가 비었거나 없어야 다음 단계 진행.)

- [ ] **Step 2: `template.md` 작성**

`docs/development/adr/template.md`에 spec의 "ADR 템플릿" 섹션 그대로 작성. 파일 최상단은 다음 한 줄로 시작:

```markdown
> ADR 작성 시 이 파일을 다음 번호로 복사한 뒤 채우세요. 인덱스(`README.md`)도 함께 갱신합니다.
```

이후 spec의 템플릿 본문을 그대로 붙인다.

- [ ] **Step 3: `README.md` (인덱스) 골격 작성**

`docs/development/adr/README.md`에 spec의 "인덱스(README) 구성" 섹션을 기반으로 작성. 표는 ADR 0001~0010을 행으로 미리 채워두되, 각 행의 결정일은 *Task 2~11에서 ADR 본문 작성하면서 확정*한다. 이 단계에서는 placeholder `TBD`를 둔다.

- [ ] **Step 4: 검증**

```bash
ls docs/development/adr/
```

기대: `README.md`, `template.md` 두 파일이 보여야 한다. 그 외 파일은 아직 없다.

```bash
./scripts/public-release-check.sh
```

기대: 통과. (gitleaks + scanner)

---

## Task 2: ADR-0001 — Cloudflare Pages Functions BFF

**Files:** 신규 `docs/development/adr/0001-cloudflare-pages-functions-bff.md`

- [ ] **Step 1: 코드 인용 사실 확인**

다음 인용을 main 브랜치에서 grep으로 확인한다. 라인 번호가 다르면 이 step에서 보정한다.

```bash
grep -n "stripCookieDomain\|copyUpstreamHeaders\|normalizedHostFromRequest" front/functions/_shared/proxy.ts
grep -n "X-Readmates-Club-Host\|X-Readmates-Club-Slug" front/functions/api/bff/\[\[path\]\].ts
grep -rn "READMATES_BFF_SECRET" front/functions/_shared/proxy.ts server/src/main/kotlin/com/readmates/shared
```

- [ ] **Step 2: ADR 본문 작성**

다음 섹션을 채운다 (모든 ADR 공통 구조):

- **상태**: Accepted
- **결정일**: 2026-04-21 (cloudflare-spa-google-auth-migration spec 시점)
- **컨텍스트**: 운영 비용 0원 제약, OAuth callback과 API 프록시를 한 origin에서 처리해야 하는 cookie 정책, BFF가 단순 프록시가 아니라 *보안 경계*로 기능해야 한다는 요구.
- **결정**: Cloudflare Pages + Pages Functions를 BFF로 채택. SPA 정적 호스팅 + edge function이 한 도메인에 묶임. Spring Boot API는 별도 origin이고 BFF만 직접 호출.
- **근거**: edge에서 cookie domain strip(`stripCookieDomain`), 내부 헤더 제거(`copyUpstreamHeaders`), client IP 정규화(`clientIpFromRequest`)가 한 곳에서 강제됨. zero cost. 자체 reverse proxy(nginx/Caddy) 운영 회피. 로컬 dev는 Vite proxy로 같은 동작 모사.
- **대안 표**: nginx self-host / Cloudflare Workers (별도 worker) / Direct browser→Spring (no BFF) / Next.js Route Handlers — 각각의 기각 이유는 비용/이중 origin/보안경계 부재/번들 크기 trade-off로 정리.
- **결과 (긍정)**: BFF 보안 룰이 한 파일(`_shared/proxy.ts`)에 응집, dev/prod 동작 차이를 spec에서 한눈에 비교 가능, secret 회전을 edge-only로 무중단 가능.
- **결과 (감수)**: Cloudflare Pages 제약(한 요청 당 cpu time, function size). 멀티 region이 필요해지면 재평가.
- **검증**: `front/tests/unit/cloudflare-bff.test.ts`, `front/tests/unit/cloudflare-oauth-proxy.test.ts`. 운영에서 `scripts/smoke-production-integrations.sh`가 BFF 응답 모양 점검.
- **후속**: BFF host 헤더 정책 (현재 shared fallback 도메인에도 항상 host 헤더 전송) 재검토 — `2026-05-11 current-session-refresh-club-context-design`의 out-of-scope 후속 참조.

- [ ] **Step 3: 인덱스 표 갱신**

`docs/development/adr/README.md`에서 0001 행의 결정일을 `2026-04-21`로 갱신.

- [ ] **Step 4: 검증**

```bash
grep -c "^## " docs/development/adr/0001-cloudflare-pages-functions-bff.md
```

기대: `8` 이상 (컨텍스트/결정/근거/대안/결과/검증/후속, 추가 섹션 가능).

```bash
./scripts/public-release-check.sh
```

기대: 통과.

---

## Task 3: ADR-0002 — Server clean architecture + ArchUnit

**Files:** 신규 `docs/development/adr/0002-server-clean-architecture-with-archunit.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
find server/src/test -name "ServerArchitectureBoundaryTest*" -print
grep -n "JdbcTemplate\|legacy repository\|adapter" server/src/test/kotlin -r | head -20
grep -n "archunit" server/build.gradle.kts
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-22 (server-clean-architecture-design spec 시점) / restructure 2026-04-23
- **컨텍스트**: 초기 backend는 controller→service→repository 레이어가 응집되어 있었음. feature 추가 시 application logic이 Spring/HTTP 타입에 결합되는 사례 발생. 신규 멤버가 같은 패턴을 유지하도록 *컴파일 타임 강제* 필요.
- **결정**: feature별 `adapter.in.web` → `application.port.in` → `application.service` → `application.port.out` → `adapter.out.persistence/redis/mail/kafka`. ArchUnit으로 application package에서 Spring HTTP/JdbcTemplate/legacy repository import 금지.
- **근거**: 신규 feature가 같은 디렉토리 구조를 강제로 따름. controller가 persistence adapter를 직접 주입받으면 빌드 실패. application service가 Spring 타입에 의존하면 빌드 실패.
- **대안**: 단일 layered architecture / hexagonal 만 적용하고 ArchUnit 미사용 / Onion architecture / Module-per-bounded-context (Gradle subproject) — 각 trade-off 정리.
- **결과 (긍정)**: 코드 리뷰에서 "구조" 토론 거의 사라짐 (테스트가 강제). 신규 멤버 onboarding 시 디렉토리만 봐도 책임 추론 가능.
- **결과 (감수)**: 작은 feature에도 5계층. 보일러플레이트 비용은 IDE template으로 흡수.
- **검증**: `./server/gradlew -p server test --tests ServerArchitectureBoundaryTest`.
- **후속**: 일부 cross-feature 공유 추상화의 위치 (현재 `shared/`)에 대한 추가 ADR 가능.

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-22`.

- [ ] **Step 4: 검증** — Task 2 Step 4와 동일.

---

## Task 4: ADR-0003 — Frontend route-first architecture

**Files:** 신규 `docs/development/adr/0003-frontend-route-first-architecture.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
find front/tests/unit -name "frontend-boundaries*" -print
ls front/src/app front/features front/shared
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-23 (frontend-route-first-architecture spec)
- **컨텍스트**: 초기 frontend는 src/components, src/pages, src/hooks 등 기술 layer로 분리됨. 기능이 늘면서 cross-import 사슬이 추적 어려워짐. React Router 7 도입과 함께 라우트 단위 응집을 강제할 기회.
- **결정**: `src/app` (router/layout/auth) → `src/pages` (route compatibility shells) → `features/<name>` (도메인). 각 feature는 `api/model/route/ui` 하위 경계. `shared/`는 cross-cutting (api/auth/config/ui 등). `frontend-boundaries.test.ts`로 import 경계 강제.
- **근거**: 라우트가 사용자 흐름의 자연스러운 경계 → 데이터 fetching/loader/refresh가 같은 폴더에 응집. shared는 app/feature를 import 못함 (단방향). feature 간 직접 import 금지.
- **대안**: feature-sliced design (FSD) 그대로 / 기존 layered 유지 / atomic design — 각 trade-off 정리.
- **결과 (긍정)**: 한 feature가 deprecated 될 때 폴더 단위로 제거 가능 (예: `shared/api/readmates` 호환 import 제거).
- **결과 (감수)**: 라우트가 작은데도 4개 하위 폴더 생성. 신규 작은 feature는 단일 파일로 시작 후 분할 룰.
- **검증**: `pnpm --dir front test -- frontend-boundaries`.
- **후속**: feature 간 통신 패턴 (event bus vs context vs URL state) 명문화 ADR.

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-23`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 5: ADR-0004 — Transactional outbox + Kafka relay

**Files:** 신규 `docs/development/adr/0004-transactional-outbox-with-kafka-relay.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
ls server/src/main/resources/db/mysql/migration | grep -i notification
grep -rn "notification_event_outbox\|NotificationDeliveryEngine\|CachedNotificationBacklogProvider" server/src/main/kotlin
ls server/src/main/kotlin/com/readmates/notification
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-29 (kafka-notification-pipeline spec)
- **컨텍스트**: 세션 발행, 멤버 초대, 피드백 게시 등 mutation의 side effect로 이메일/in-app 알림 발송. 동기 발송은 mutation latency를 SMTP에 묶어버리고, 실패 시 mutation까지 롤백되는 결합 발생.
- **결정**: MySQL `notification_event_outbox` 테이블에 mutation과 *같은 트랜잭션*에서 이벤트 기록. 별도 relay가 outbox→Kafka로 publish. consumer가 `notification_deliveries` (channel별 row, EMAIL/INBOX) state machine으로 발송. state: PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD.
- **근거**: 트랜잭션 일관성 (mutation 성공 ⇔ 알림 큐 적재). retryable side effect를 멱등하게. masked email + hash로 audit. plain/HTML body는 단일 helper로 생성 (drift 방지).
- **대안**: 동기 SMTP / Kafka 직접 produce (no outbox) / 별도 jobs 테이블 polling — 각 trade-off.
- **결과 (긍정)**: Kafka가 죽어도 outbox에 누적. Host audit ledger에 subject + masked recipient + deep link만 노출 (privacy).
- **결과 (감수)**: 추가 인프라(Redpanda) 운영 부담. backlog gauge 모니터링 필요 (`CachedNotificationBacklogProvider`, 1분 주기).
- **검증**: `./server/gradlew -p server test --tests "*Notification*"`. Testcontainers Kafka(`KafkaTestContainer`).
- **후속**: dead letter 자동 alert. consumer scale-out 정책.

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-29`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 6: ADR-0005 — BFF shared secret + rotation

**Files:** 신규 `docs/development/adr/0005-bff-shared-secret-with-rotation.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
grep -rn "READMATES_BFF_SECRET\|READMATES_BFF_SECRETS\|bff_secret_rotation_audit" server/src front/functions
ls server/src/main/resources/db/mysql/migration | grep -i bff
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: v1.6.0 (CHANGELOG 참조)
- **컨텍스트**: BFF→Spring 신뢰는 shared secret으로 검증. 단일 secret이면 회전 시 짧은 다운타임 발생. 외부 노출 의심 시 즉시 회전 가능해야 함.
- **결정**: `READMATES_BFF_SECRET` (primary) + `READMATES_BFF_SECRETS` (rotation candidates, comma-separated). Spring 측은 두 값 모두 허용. 회전 절차: candidates에 새 값 추가 → BFF rollout → primary 교체 → 구 값 candidates에서 제거. 모든 회전은 `bff_secret_rotation_audit` row.
- **근거**: 무중단 회전. 회전 이력 audit. 외부 의심 시 분 단위 대응.
- **대안**: 단일 secret + maintenance window / mTLS / JWT signed by Cloudflare Worker — 각 trade-off (운영 비용, KMS 의존, 인증서 회전 부담).
- **결과 (긍정)**: 운영 incident 시 분 단위 회전 가능. audit row로 회전 이력 추적.
- **결과 (감수)**: 두 환경 변수 동기화 책임 (Cloudflare + Spring). runbook 필요.
- **검증**: `./server/gradlew -p server test --tests "*BffSecret*"` (테스트가 있다면 인용, 없으면 후속에 추가).
- **후속**: secret rotation runbook 별도 문서. 자동 회전 (계획된 90일 주기) 도입.

- [ ] **Step 3: 인덱스 갱신** — 결정일 v1.6.0 시점 (CHANGELOG에서 추출).

- [ ] **Step 4: 검증** — 동일.

---

## Task 7: ADR-0006 — Server-side hashed session cookie

**Files:** 신규 `docs/development/adr/0006-server-side-hashed-session-cookie.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
grep -rn "readmates_session\|HttpOnly\|sessionHash" server/src/main/kotlin/com/readmates/auth
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-21 (cloudflare-spa-google-auth-migration spec)
- **컨텍스트**: Google OAuth login 후 세션 표현 방식 선택. JWT vs 서버 측 세션 vs OAuth raw token cookie.
- **결정**: HttpOnly `readmates_session` cookie + 서버 측 hash 저장. raw OAuth token은 저장하지 않음.
- **근거**: 즉시 revoke 가능. cookie 노출 시 hash 비교 실패. 짧은 TTL/rotation 운영 부담 작음. JWT 채택 시 revoke 비용·token leak 대응 부담.
- **대안**: JWT (stateless) / OAuth raw token cookie / Spring Session + Redis 처음부터 — 각 trade-off (Redis는 v1.6.0 시점에야 optional 적용).
- **결과 (긍정)**: incident 시 단일 row 삭제로 세션 무효화. raw token 저장 안 하므로 token leak risk 0.
- **결과 (감수)**: stateful. read당 DB 조회 (현재 부하에서 무시 가능, future cache 후보).
- **검증**: `./server/gradlew -p server test --tests "*Session*Auth*"`.
- **후속**: Redis 기반 세션 캐시 (현재 optional Redis가 도입되면 검토).

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-21`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 8: ADR-0007 — MySQL + Flyway over alternatives

**Files:** 신규 `docs/development/adr/0007-mysql-with-flyway-over-alternatives.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
ls server/src/main/resources/db/mysql/migration | wc -l
ls server/src/main/resources/db/mysql/migration | head -3
ls server/src/main/resources/db/mysql/migration | tail -3
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-19 (초기 설계)
- **컨텍스트**: zero-cost 운영 + free tier managed DB 가능성. 명시적 forward-only migration 필요. ORM의 implicit DDL 회피.
- **결정**: MySQL 8 + Flyway. OCI MySQL HeatWave free tier. 26개 incremental migration 버전 (V1~V26). reversible pair 패턴 (V24 column rename + V25 drop 함께 배포).
- **근거**: SQL이 source of truth. 코드 리뷰에서 schema 변경이 명확히 보임. PostgreSQL 대비 OCI free tier 호환 더 좋음(시점 기준). Liquibase의 XML/changeset 추상화는 이 규모에 과잉.
- **대안**: PostgreSQL + Flyway / MySQL + Liquibase / Prisma migrate / Drizzle — 각 trade-off.
- **결과 (긍정)**: schema 진화가 git diff로 자명. `MySqlFlywayMigrationTest`로 마이그레이션 자체 검증. 테스트 환경에서 Testcontainers로 동일 버전.
- **결과 (감수)**: forward-only. rollback은 새 migration으로 (V24 rename + V25 drop 패턴).
- **검증**: `./server/gradlew -p server test --tests "*Flyway*"`. 모든 PR이 새 migration 추가 시 commit description에 forward 전략 명시.
- **후속**: zero-downtime schema change 패턴 명문화 (rename column 등).

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-19`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 9: ADR-0008 — Multi-club domain with host resolution

**Files:** 신규 `docs/development/adr/0008-multi-club-domain-with-host-resolution.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
grep -rn "ClubContextResolver\|loadByHostname\|club_domains" server/src/main/kotlin
grep -rn "X-Readmates-Club-Slug\|X-Readmates-Club-Host" front/functions front/vite.config.ts
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-30 (multi-club-domain-platform spec)
- **컨텍스트**: 한 인스턴스에 여러 독서모임이 존재. 각 클럽이 자체 도메인을 가질 수 있어야 함 (예: `club-a.com`). 동시에 path-routed 공유 fallback (`readmates.pages.dev/clubs/<slug>`)도 지원.
- **결정**: club context 우선순위 — `X-Readmates-Club-Slug` (명시) > `X-Readmates-Club-Host` (도메인 alias 조회) > unscoped. custom domain은 `club_domains` 테이블 (`status = ACTIVE`) + marker file로 health check.
- **근거**: slug는 path-routed에 자연스러움. host는 custom domain 사용자에게 자연스러움. 두 채널을 하나로 강제하면 한쪽 UX 깨짐.
- **대안**: slug-only / host-only / Cloudflare Worker에서 host→slug 변환 후 단일 채널 — 각 trade-off.
- **결과 (긍정)**: 신규 클럽 도메인 등록이 row 추가 + DNS만으로 가능. 공유 fallback과 custom domain이 동일 codepath.
- **결과 (감수)**: refresh path 등에서 *implicit context*가 dev/prod 차이를 만들 수 있음 (실제 인시던트: `2026-05-11 current-session-refresh-club-context`). BFF 호스트 헤더 정책 재검토 필요 (후속).
- **검증**: `./server/gradlew -p server test --tests "*ClubContext*"`. multi-club E2E (Playwright).
- **후속**: shared fallback domain일 때 host 헤더 미전송 정책 (후속 ADR).

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-30`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 10: ADR-0009 — Frontend-backend contract via Zod

**Files:** 신규 `docs/development/adr/0009-frontend-backend-contract-via-zod.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
find server/src/test -name "FrontendZodSchemaContractTest*" -print
find front/tests -name "zod-schemas" -type d -print
grep -rn "zod:export-fixtures" front/package.json .github/workflows
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-05-06 (error-boundary-contract spec 전후)
- **컨텍스트**: BFF→Spring→FE 계약이 깨질 때 production에서만 발견되는 패턴 발생. OpenAPI 스펙 도입은 무거움 (Spring + Vite + Zod 모두에 ide 지원 필요). 작은 schema drift도 zero downtime로 잡고 싶음.
- **결정**: front은 모든 API response를 Zod schema로 검증. fixture는 `front/tests/unit/__fixtures__/zod-schemas/`에 자동 export. 서버는 `FrontendZodSchemaContractTest`로 schema가 actual response shape와 일치함을 검증. CI에서 `pnpm zod:export-fixtures && git diff --exit-code`로 fixture drift 차단.
- **근거**: Schema-first 계약을 *server 코드와 client 코드 양쪽에서 강제*. JSON 응답 파싱 시 invalid → ReadmatesApiError로 fallback. 운영 중 오류 표면을 클라이언트 단계에서 잡음.
- **대안**: OpenAPI + 코드 생성 / tRPC / GraphQL — 각 trade-off (런타임 추가 의존, 빌드 파이프라인 무게).
- **결과 (긍정)**: schema 변경이 양쪽에서 명시적으로 보임. CI가 drift를 차단.
- **결과 (감수)**: schema 정의가 frontend에 위치 (server는 Kotlin). 한쪽에서 정의·다른 한쪽에서 검증.
- **검증**: `./server/gradlew -p server test --tests "*Contract*"`. `pnpm --dir front test`.
- **후속**: schema를 OpenAPI로 양방향 export하는 자동화 (해외 협업 시).

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-05-06`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 11: ADR-0010 — Public repo safety automation

**Files:** 신규 `docs/development/adr/0010-public-repo-safety-automation.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
ls scripts/ | grep -i public-release
cat .gitleaks.toml | head -20
```

- [ ] **Step 2: 본문 작성**

- **상태**: Accepted
- **결정일**: 2026-04-22 (public-repo-readiness spec)
- **컨텍스트**: 운영 중인 서비스 코드를 포트폴리오 목적으로 공개. 단순 .gitignore + push로는 secret 누출/실명 회원 정보/내부 OCID 노출 위험.
- **결정**: 3단계 검증 — (1) `build-public-release-candidate.sh` clean manifest (26개 금지 경로) → (2) `public-release-check.sh` gitleaks + targeted scanner (private key/OCID/GitHub token/real secret/Gmail/local path) → (3) `verify-public-release-fixtures.sh` scanner pattern 자체 검증. 모든 PR/release에서 통과 강제.
- **근거**: secret 누락 검출은 deny-list가 아니라 *fixture-driven validation*. 새 secret 패턴 발견 시 fixture에 추가 → scanner가 잡는지 verify → release.
- **대안**: gitleaks 단독 / GitHub secret scanning만 / 수동 리뷰 — 각 trade-off (false negative, blast radius).
- **결과 (긍정)**: 스크립트 자체가 공개 → 다른 팀이 fork. allowlist와 placeholder가 명시적이고 코드와 분리.
- **결과 (감수)**: 새 환경 변수 추가 시마다 scanner allowlist 동기화 필요. 잘못된 합의 시 false positive로 release 차단.
- **검증**: `./scripts/public-release-check.sh`, `./scripts/verify-public-release-fixtures.sh`. CI에서 release tag 시 강제.
- **후속**: scanner를 SARIF로 export → GitHub code scanning 통합.

- [ ] **Step 3: 인덱스 갱신** — 결정일 `2026-04-22`.

- [ ] **Step 4: 검증** — 동일.

---

## Task 12: `technical-decisions.md` 슬림화

**Files:** 수정 `docs/development/technical-decisions.md`

- [ ] **Step 1: 현재 내용 백업 확인**

git이 백업이므로 별도 작업 없음. 단 다음 명령으로 변경 전 상태를 readable diff로 보유:

```bash
git log -1 --pretty=format:%H -- docs/development/technical-decisions.md
```

- [ ] **Step 2: 상단 안내 추가**

파일 최상단에 다음을 삽입 (기존 첫 헤더 위에):

```markdown
> 📌 이 문서의 결정은 ADR로 이관되었습니다. 새 결정은 `docs/development/adr/`에 ADR로 추가합니다.
> 인덱스: [docs/development/adr/README.md](./adr/README.md)
```

- [ ] **Step 3: 본문을 인덱스 표로 슬림화**

기존 산문 결정 내용을 다음 표로 대체:

```markdown
## 결정 인덱스

| ADR | 제목 | 상태 |
|-----|------|------|
| 0001 | Cloudflare Pages Functions BFF | Accepted |
| 0002 | Server clean architecture + ArchUnit | Accepted |
| 0003 | Frontend route-first architecture | Accepted |
| 0004 | Transactional outbox + Kafka relay | Accepted |
| 0005 | BFF shared secret + rotation | Accepted |
| 0006 | Server-side hashed session cookie | Accepted |
| 0007 | MySQL + Flyway | Accepted |
| 0008 | Multi-club domain with host resolution | Accepted |
| 0009 | Frontend-backend contract via Zod | Accepted |
| 0010 | Public repo safety automation | Accepted |
```

기존 본문에서 ADR로 이관되지 않은 내용이 있는지 확인 — 있다면 *별도 ADR을 만들어 이관하거나*, 산문이 적절한 부가 컨텍스트면 표 아래 "보완 메모" 섹션에 보존.

- [ ] **Step 4: 검증**

```bash
wc -l docs/development/technical-decisions.md
```

기대: 100라인 미만 (인덱스 + 안내 + 보완 메모 정도).

```bash
grep "ADR" docs/development/technical-decisions.md | wc -l
```

기대: 11 이상 (인덱스 표 헤더 + 10개 행).

---

## Task 13: dev README + 다른 문서의 ADR 참조 갱신

**Files:** 수정 `docs/development/README.md`, (필요 시) `docs/development/architecture.md`

- [ ] **Step 1: dev README에 ADR 링크 추가**

`docs/development/README.md`의 문서 허브 섹션에 ADR 디렉토리 entry 추가:

```markdown
- [Architecture Decision Records](./adr/README.md) — 핵심 기술 의사결정 기록 (ADR 0001~).
```

- [ ] **Step 2: architecture.md에서 결정 산문 ↔ ADR 링크 보강**

`architecture.md`에서 다음 표현이 있으면 해당 ADR 링크를 inline으로 추가:

- "BFF" 첫 등장 → `(ADR-0001)`
- "ArchUnit" 또는 "ServerArchitectureBoundaryTest" → `(ADR-0002)`
- "frontend-boundaries" → `(ADR-0003)`
- "transactional outbox" 또는 "notification_event_outbox" → `(ADR-0004)`
- "BFF secret" → `(ADR-0005)`
- "session cookie" → `(ADR-0006)`
- "Flyway" → `(ADR-0007)`
- "club context" → `(ADR-0008)`
- "Zod schema" → `(ADR-0009)`

원문 표현은 *건드리지 않고* 괄호 인용만 추가. 이미 충분히 명시되어 있으면 추가 안 해도 됨.

- [ ] **Step 3: 검증 — 깨진 링크 없음**

```bash
grep -rn "adr/" docs/ | grep -v "node_modules"
```

기대: 모든 경로가 실재. 각 링크 클릭 가능 (relative path 정확).

---

## Task 14: 최종 검증

**Files:** 변경 없음 (검증만)

- [ ] **Step 1: 파일 개수 확인**

```bash
ls docs/development/adr/ | wc -l
```

기대: `12` (README + template + 0001~0010).

- [ ] **Step 2: 모든 ADR 섹션 완비 확인**

```bash
for f in docs/development/adr/0*.md; do
  echo "=== $f ==="
  grep -c "^## " "$f"
done
```

각 ADR이 7개 이상 섹션을 가져야 한다.

- [ ] **Step 3: 인덱스 행 수 확인**

```bash
grep -c "^| 00" docs/development/adr/README.md
```

기대: `10`.

- [ ] **Step 4: public release 검증**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

기대: 모두 통과.

- [ ] **Step 5: 인용 라인 stale 여부 sample check**

각 ADR에서 `:line` 인용 한두 개씩 임의 추출하여 grep으로 실재 확인.

- [ ] **Step 6: 커밋 분리 확인**

ADR 작성과 코드 변경은 **같은 커밋에 섞지 않는다**. 본 plan은 코드 변경 0이므로 단일 docs 커밋:

```text
docs(adr): introduce architecture decision records — backfill 0001..0010
```

(실제 커밋은 사용자 요청 시에만 수행.)

---

## 위험과 완화 (실행 시점)

| 위험 | 완화 |
|------|------|
| 인용 라인이 작성 중 코드 변경으로 drift | 라인보다 *함수명/심볼*을 우선 인용. 라인은 보조. |
| 기존 `technical-decisions.md`에 ADR로 이관되지 않은 내용 누락 | Task 12 Step 3에서 명시적으로 확인 단계 둠. |
| ADR 본문이 너무 짧아 *깊이 없어 보임* | 각 ADR 최소 200라인 목표. 컨텍스트와 대안 표가 풍부해야 함. |
| 일부 ADR(0005 BFF rotation 등)에서 secret 단서 노출 | spec 작성 후 `.gitleaks.toml` 통과 확인. 모든 secret은 placeholder. |
| ADR 인덱스 표가 ADR 본문과 어긋남 (제목/상태 drift) | Task 14 Step 3에서 sample 비교. 추후 ADR linter 도입 (후속). |

---

## 완료 조건

- [ ] 모든 Task의 모든 Step이 완료되었다.
- [ ] `./scripts/public-release-check.sh` 통과.
- [ ] `docs/development/adr/`에 12개 파일 존재.
- [ ] `docs/development/technical-decisions.md`가 인덱스 안내 형태로 슬림화되었다.
- [ ] `docs/development/README.md`에 ADR 링크가 추가되었다.
- [ ] (선택) `architecture.md`의 핵심 표현 옆에 ADR 인용이 추가되었다.
