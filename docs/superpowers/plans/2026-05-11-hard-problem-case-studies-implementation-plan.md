# Hard Problem Case Studies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** README 최상단에 "Engineering Highlights" 섹션을 추가하고, `docs/case-studies/` 디렉토리에 3개 deep-dive 문서를 작성한다. Spec과 일관된 공통 구조(TL;DR / 문제 / 접근 / 구현 / 검증 / Trade-off / 다시 한다면 / 관련)를 모든 case가 가진다.

**Architecture:** 문서 작업만. 코드 변경 없음. ADR plan과 함께 실행 시 ADR 링크가 깨지지 않도록 Task 5에서 통합 검증.

**Tech Stack:** 마크다운만.

**Spec:** `docs/superpowers/specs/2026-05-11-hard-problem-case-studies-design.md`

---

## File map

신규 작성:
- `docs/case-studies/README.md`
- `docs/case-studies/01-bff-security-and-secret-rotation.md`
- `docs/case-studies/02-notification-pipeline-with-outbox.md`
- `docs/case-studies/03-multi-club-domain-platform.md`

수정:
- `README.md` (루트) — Engineering Highlights 섹션 추가

수정 금지:
- README의 다른 섹션 (구조 유지).
- ADR 파일들 (이 plan은 ADR을 *링크만* 한다).
- 기존 spec/plan 문서.

---

## Task 1: 디렉토리 + Case studies README 작성

**Files:** 신규 `docs/case-studies/README.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p docs/case-studies
```

- [ ] **Step 2: README.md 작성**

내용:

```markdown
# ReadMates Engineering Case Studies

운영 중인 ReadMates에서 풀어낸 비자명한 문제들의 deep-dive입니다. 각 case는 *문제 → 접근 → 구현 → 검증 → trade-off → 다시 한다면* 흐름을 따릅니다.

ADR(`docs/development/adr/`)이 결정의 결과 카드라면, case study는 그 결정에 도달한 사고 과정과 운영 검증 이야기입니다.

## 목록

1. [BFF 보안 경계와 무중단 secret rotation](01-bff-security-and-secret-rotation.md)
2. [Mutation과 알림 발송의 결합 분리 (transactional outbox)](02-notification-pipeline-with-outbox.md)
3. [Multi-club domain platform — host vs slug 우선순위](03-multi-club-domain-platform.md)
```

- [ ] **Step 3: 검증**

```bash
ls docs/case-studies/
```

기대: `README.md` 1개.

---

## Task 2: Case 01 — BFF 보안 경계와 secret rotation

**Files:** 신규 `docs/case-studies/01-bff-security-and-secret-rotation.md`

- [ ] **Step 1: 코드 인용 사실 확인**

```bash
grep -n "stripCookieDomain\|copyUpstreamHeaders\|clientIpFromRequest" front/functions/_shared/proxy.ts
grep -n "X-Readmates-Club-Host\|X-Readmates-Club-Slug" front/functions/api/bff/\[\[path\]\].ts
grep -rn "READMATES_BFF_SECRET\|READMATES_BFF_SECRETS\|bff_secret_rotation_audit" server/src front/functions
ls server/src/main/resources/db/mysql/migration | grep -i bff
```

라인 번호와 파일 경로를 본문 작성 시 실측치로 사용.

- [ ] **Step 2: TL;DR 단락 작성**

다음 모양 (수치는 인용 가능한 것만):

> Cloudflare Pages Functions를 단순 프록시가 아니라 보안 경계로 운영했습니다. cookie domain strip, 내부 추적 헤더 제거, client IP 정규화를 한 헬퍼에 응집시켰고, BFF↔Spring 신뢰는 multi-secret(primary + rotation candidates) + audit table로 무중단 회전 가능하게 만들었습니다. 결과적으로 운영 중 secret 회전이 분 단위 절차가 되었습니다.

- [ ] **Step 3: "문제" 섹션**

다음 항목을 포함:

- 트리거: 운영 사이트(`https://readmates.pages.dev`)는 SPA + edge function이 한 도메인. Spring API origin은 별도. browser → edge function → Spring 흐름.
- 단순 프록시일 때의 위험:
  - Spring이 보낸 `Set-Cookie: ...; Domain=spring-host`가 그대로 통과되면 frontend origin과 다른 곳에 cookie가 붙음 → cross-origin 노출/오작동.
  - 내부 추적용 `x-readmates-*` 헤더가 클라이언트로 새면 운영 디버그 정보 노출.
  - Spring은 `X-Forwarded-For`를 신뢰하는데 Cloudflare는 `CF-Connecting-IP`를 사용 → IP 정규화 필요.
- secret 회전의 비자명함: single secret으로 BFF→Spring 검증 시, 회전은 두 환경의 동시 rollout이 필요. 짧은 다운타임 또는 race.

- [ ] **Step 4: "접근" 섹션 — 대안 표 포함**

| 대안 | 기각 이유 |
|------|----------|
| BFF를 단순 fetch passthrough로 | 위 보안 처리가 누락됨. 새 멤버가 무심코 우회 가능. |
| 보안 룰을 각 route function에 분산 | 4~5개 function에서 drift. 한 룰 누락 시 invisible. |
| mTLS로 BFF↔Spring | Cloudflare Pages Functions에서 client cert 관리 부담. zero-cost 제약 위반. |
| JWT signed by edge | 자체 서명·검증 부담 + revoke 비용. 현재 규모에 과잉. |

선택: **`_shared/proxy.ts` 단일 헬퍼에 응집 + multi-secret rotation**.

- [ ] **Step 5: "구현" 섹션 — 코드 발췌**

다음 발췌를 inline code block으로 포함 (실제 라인은 Step 1에서 확인):

```ts
// front/functions/_shared/proxy.ts
export function stripCookieDomain(setCookie: string): string {
  return setCookie.replace(/;\s*Domain=[^;]+/i, '');
}
export function copyUpstreamHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of upstream) {
    if (k.toLowerCase().startsWith('x-readmates-')) continue;
    out.set(k, v);
  }
  return out;
}
```

(실제 코드와 정확히 일치하도록 grep으로 가져와 다듬는다. 만약 시그니처가 다르면 실측 코드를 그대로 인용.)

```sql
-- db/mysql/migration/V<NN>__create_bff_secret_rotation_audit.sql
-- (Step 1 grep 결과로 실측 버전·파일명 확인)
```

```kotlin
// server/.../BffSecretAuthenticator.kt
// secret 검증이 primary + candidates 모두에 대해 동작
```

- [ ] **Step 6: "검증" 섹션**

- 단위 테스트:
  - `front/tests/unit/cloudflare-bff.test.ts`
  - `front/tests/unit/cloudflare-oauth-proxy.test.ts`
- 통합 smoke: `scripts/smoke-production-integrations.sh` (BFF 응답 모양과 헤더 정책 점검).
- 운영: `bff_secret_rotation_audit` row count로 회전 이력 확인 가능.

- [ ] **Step 7: "Trade-off와 한계" 섹션**

- BFF 룰이 한 헬퍼에 모이는 만큼, 그 헬퍼의 회귀가 *모든 API 호출에 영향*. 단위 테스트 비중을 높이는 것이 비용.
- multi-secret은 두 환경 변수 동기화 책임 (Cloudflare 환경 설정 + Spring 배포) — runbook 필요.
- shared fallback domain (`readmates.pages.dev`)에도 host 헤더가 항상 전송됨 → multi-club case 3과 연결되는 잠재 이슈.

- [ ] **Step 8: "다시 한다면" 섹션**

- secret 회전을 자동 90일 주기로 (현재는 수동 트리거).
- BFF 룰의 server-side contract test (현재는 client-side만 — 서버가 역으로 "Cloudflare가 어떤 헤더를 줄 것인가"를 가정함).
- shared fallback에서 host 헤더 미전송 정책 (case 3과 연동).

- [ ] **Step 9: "관련" 섹션**

- ADR-0001 (Cloudflare Pages Functions BFF)
- ADR-0005 (BFF shared secret + rotation)
- ADR-0006 (Server-side hashed session cookie)
- spec: `docs/superpowers/specs/2026-04-21-readmates-cloudflare-spa-google-auth-migration-design.md`

- [ ] **Step 10: 검증**

```bash
grep -c "^## " docs/case-studies/01-bff-security-and-secret-rotation.md
```

기대: `7` 이상 (TL;DR은 H1 다음 인용블록이라 카운트되지 않을 수 있음).

```bash
./scripts/public-release-check.sh
```

기대: 통과.

---

## Task 3: Case 02 — Notification pipeline with outbox

**Files:** 신규 `docs/case-studies/02-notification-pipeline-with-outbox.md`

- [ ] **Step 1: 코드 인용 사실 확인**

```bash
ls server/src/main/resources/db/mysql/migration | grep -i notification
grep -rn "notification_event_outbox\|NotificationDeliveryEngine\|CachedNotificationBacklogProvider" server/src/main/kotlin
ls server/src/main/kotlin/com/readmates/notification
```

- [ ] **Step 2: TL;DR**

> 세션 발행/멤버 초대 등 mutation의 side effect로 이메일과 in-app 알림이 발송됩니다. 동기 발송은 mutation latency를 SMTP에 묶고, 발송 실패가 mutation rollback을 일으킵니다. MySQL transactional outbox + Kafka relay + state machine consumer로 mutation과 발송을 분리했고, masked audit ledger와 backlog gauge로 운영 가시성을 확보했습니다.

- [ ] **Step 3: "문제" 섹션**

- 동기 발송의 두 가지 결합:
  1. mutation latency = SMTP 발송 시간을 포함 → 사용자 응답 지연.
  2. 발송 실패 = mutation rollback 또는 partial state.
- 그냥 *비동기 fire-and-forget*도 안 됨:
  - mutation은 성공했는데 알림이 못 가는 경우 = 사용자가 변경을 모름.
  - 알림은 가는데 mutation rollback = 거짓 정보 발송.
- 트랜잭션 일관성을 유지하면서 외부 시스템(SMTP/Kafka) 의존이 mutation path에 들어가면 안 됨.

- [ ] **Step 4: "접근" 섹션 — 대안 표**

| 대안 | 기각 이유 |
|------|----------|
| 동기 SMTP | mutation latency 묶임. SMTP 장애 → mutation 실패. |
| Kafka 직접 publish (no outbox) | publish 실패 vs commit 실패 race. 트랜잭션 경계 깨짐. |
| 별도 jobs 테이블 polling (no Kafka) | polling latency. consumer scale 어려움. |
| 외부 워커 (예: Cloud Tasks) | OCI free tier 제약. 추가 비용/외부 의존. |

선택: **MySQL outbox + Kafka relay + state machine consumer**.

- [ ] **Step 5: "구현" 섹션**

다음 다이어그램을 ASCII로 (또는 mermaid 사용 가능 시 mermaid):

```text
[Mutation TX]
  ├─ INSERT business row
  └─ INSERT notification_event_outbox row    (같은 트랜잭션 commit)
                |
                v
        [Outbox Relay]                       (Spring scheduled, idempotent)
                |
                v
            [Kafka topic]                    (readmates.notification.events.v1)
                |
                v
        [Notification Consumer]
                |
                ├── INSERT notification_deliveries (channel=EMAIL)  → SMTP
                └── INSERT notification_deliveries (channel=INBOX)  → in-app
                          |
                          v
              [State machine: PENDING → PUBLISHING → PUBLISHED | FAILED → DEAD]
```

핵심 파일 인용 (Step 1 grep 결과 기반):

- outbox 어댑터, relay, consumer, delivery engine 각 1개 발췌.

state 정의:

```kotlin
enum class NotificationDeliveryState { PENDING, PUBLISHING, PUBLISHED, FAILED, DEAD }
```

retryable 처리 (FAILED → 재시도, 임계 초과 시 DEAD).

audit 정책:
- `host_notification_audit` 또는 동등 ledger에 subject + masked recipient (`xx***@example.com`) + deep link.
- plain/HTML body는 ledger에 저장하지 않음 (privacy).
- test mail audit: hashed email + masked.

- [ ] **Step 6: "검증" 섹션**

- `./server/gradlew -p server test --tests "*Notification*"` (Testcontainers Kafka로 outbox→relay→consumer 통합 테스트).
- backlog 메트릭: `CachedNotificationBacklogProvider`가 1분 주기로 outbox count를 gauge로 export → Prometheus.
- e2e: 호스트 대시보드 audit 화면에서 last N deliveries 확인.

- [ ] **Step 7: "Trade-off와 한계"**

- Redpanda/Kafka 운영 부담 (단일 노드여도 lifecycle/마이그레이션 관리).
- backlog 자체를 모니터링해야 함. backlog가 무한히 자라면 consumer 죽었다는 신호.
- DEAD state row는 수동 audit 필요 (현재 자동 alert 없음).
- consumer는 single instance — scale-out은 partitioning 전략 필요.

- [ ] **Step 8: "다시 한다면"**

- DEAD state 자동 alert (Prometheus + alertmanager → 운영자 알림).
- email open/bounce webhook 통합으로 발송 *후* 검증 (현재는 SMTP 응답까지만 신뢰).
- consumer를 partition별 병렬 (현재 single), idempotency key는 outbox row id로 이미 만족.
- outbox table partitioning (월 단위) — 1년치 누적 후 검토.

- [ ] **Step 9: "관련"**

- ADR-0004 (transactional outbox + Kafka relay)
- ADR-0009 (Zod contract — notification payload 검증)
- spec: `docs/superpowers/specs/2026-04-29-readmates-kafka-notification-pipeline-design.md`
- plan: `docs/superpowers/plans/2026-04-29-readmates-kafka-notification-pipeline-implementation-plan.md`

- [ ] **Step 10: 검증** — Task 2 Step 10과 동일.

---

## Task 4: Case 03 — Multi-club domain platform

**Files:** 신규 `docs/case-studies/03-multi-club-domain-platform.md`

- [ ] **Step 1: 코드 인용 확인**

```bash
grep -rn "ClubContextResolver\|loadByHostname\|club_domains" server/src/main/kotlin
grep -rn "X-Readmates-Club-Slug\|X-Readmates-Club-Host" front/functions front/vite.config.ts
```

- [ ] **Step 2: TL;DR**

> 한 ReadMates 인스턴스가 여러 독서모임을 호스팅합니다. 클럽이 custom domain (`my-club.com`)을 가질 수도, path-routed shared fallback (`readmates.pages.dev/clubs/<slug>`)으로도 접근될 수 있어야 했습니다. Slug 헤더 우선 + host 헤더 fallback 정책으로 두 경로를 동일 codepath로 묶었지만, dev/prod parity가 깨진 실제 incident를 통해 BFF 호스트 정책의 한계를 학습했습니다.

- [ ] **Step 3: "문제" 섹션**

- 한 인스턴스가 N개 클럽 호스팅. 클럽별 데이터/멤버십/세션이 격리.
- 두 entry point:
  - custom domain: `my-club.com` → 클럽 owner가 자체 도메인 사용.
  - shared fallback: `readmates.pages.dev/clubs/<slug>` → 신규 클럽 프로비저닝 시 즉시 사용 가능.
- 두 경로 모두 같은 backend code를 통과해야 함. backend가 "어떤 클럽인가"를 어떻게 식별?

- [ ] **Step 4: "접근" 섹션 — 대안 표**

| 대안 | 기각 이유 |
|------|----------|
| slug only (URL path 기준만) | custom domain 경로에서 path가 어색 (`my-club.com/clubs/my-club/...`). |
| host only | shared fallback이 같은 host로 묶임 → 식별 불가. |
| Cloudflare Worker가 host→slug 변환 후 단일 채널 | edge config 운영 부담. 새 클럽 추가가 worker 배포 필요. |
| 서브도메인 (`my-club.readmates.com`) | DNS 와일드카드 + TLS 운영 부담. custom domain 사용자 요구를 만족 못 함. |

선택: **`X-Readmates-Club-Slug` (명시) > `X-Readmates-Club-Host` (DB lookup) > unscoped 우선순위**.

- [ ] **Step 5: "구현" 섹션**

```kotlin
// server/.../ClubContextResolver.kt
val slug = getHeader(ClubContextHeader.CLUB_SLUG)?.trim()?.takeIf { it.isNotEmpty() }
if (slug != null) {
  return RequestedClubContext(supplied = true, context = resolveBySlug(slug))
}
val host = getHeader(ClubContextHeader.CLUB_HOST)?.trim()?.takeIf { it.isNotEmpty() }
if (host != null) {
  return RequestedClubContext(supplied = true, context = resolveByHost(host))
}
return RequestedClubContext(supplied = false, context = null)
```

```typescript
// front/functions/api/bff/[[path]].ts (prod)
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));
if (clubSlug) headers.set("X-Readmates-Club-Slug", clubSlug);
```

```typescript
// front/vite.config.ts (dev — host 헤더 strip)
proxy.on("proxyReq", (proxyReq) => {
  proxyReq.removeHeader("X-Readmates-Club-Slug");
  proxyReq.removeHeader("X-Readmates-Club-Host");
  const clubSlug = normalizedClubSlugFromProxyPath(proxyReq.path);
  if (clubSlug) proxyReq.setHeader("X-Readmates-Club-Slug", clubSlug);
});
```

→ **dev/prod parity 차이**: dev는 host 헤더 strip, prod는 항상 전송. 이 차이가 잠재 incident 원인.

- [ ] **Step 6: "검증" 섹션**

- `./server/gradlew -p server test --tests "*ClubContext*"`.
- multi-club E2E (Playwright).
- custom domain alias health check: marker file (`/health/marker`) GET.

- [ ] **Step 7: "운영 incident — 2026-05-11" 섹션 (이 케이스만 추가)**

- 증상: `https://readmates.pages.dev/clubs/reading-sai/app/session/current`에서 멤버가 reading progress를 저장하면, 응답 200 OK + DB row 기록은 성공하지만 페이지가 "아직 열린 세션이 없습니다" 빈 상태로 collapse. 페이지 새로 들어가면 정상.
- root cause: client refresh path가 `clubSlug` 없이 `/api/auth/me`를 호출 → BFF가 `X-Readmates-Club-Host: readmates.pages.dev`를 자동 첨부 → server는 host로 club을 lookup하지만 `readmates.pages.dev`는 path-routed fallback이라 `club_domains`에 없음 → `requestedClubContext.supplied=true && context=null` → degraded auth response (membershipStatus 없음) → 클라이언트가 빈 상태로 fallback.
- 영구 수정: refresh handler에서 `useParams()`로 slug를 가져와 명시 전달. (spec: `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`)
- 후속: BFF가 shared fallback 호스트일 때 host 헤더 *미전송* 정책 (이 case study에서 권고). 별도 ADR 후보.
- 대응 시간: 발견 → 재현 → spec → 수정 → 검증 ≈ <시간> (실측치는 plan 작성자가 git log로 확인).

- [ ] **Step 8: "Trade-off와 한계"**

- BFF가 dev/prod에서 다르게 동작 → *production-only bug class* 잠재. 위 incident가 그 instance.
- club_domains.status 관리가 1인 운영자에게 수동 부담.
- host lookup이 cold path에서 DB 조회 — 캐시 후보지만 현재 trade-off 수용.

- [ ] **Step 9: "다시 한다면"**

- dev/prod parity test: Vite proxy와 Pages function이 같은 입력에 같은 헤더를 만든다는 한 테스트로 강제.
- BFF host 헤더는 *custom domain*에만 전송, shared fallback은 미전송.
- club context resolver가 `supplied=true && context=null`을 *명시적 에러 코드*로 응답하는 옵션 (현재는 degraded auth로 fallback — incident 트리거의 근본 원인).

- [ ] **Step 10: "관련"**

- ADR-0008 (multi-club domain with host resolution).
- spec: `docs/superpowers/specs/2026-04-30-readmates-multi-club-domain-platform-design.md`.
- spec/plan: `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md` 및 동명 plan.
- post-mortem: `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md` (post-mortem plan에서 작성).

- [ ] **Step 11: 검증** — Task 2 Step 10과 동일.

---

## Task 5: README "Engineering Highlights" 섹션 추가

**Files:** 수정 `README.md`

- [ ] **Step 1: 현재 README 첫 30줄 읽기**

```bash
sed -n '1,30p' README.md
```

삽입 위치 결정: 1줄 요약/데모 직후, "핵심 기능" 섹션 *이전*.

- [ ] **Step 2: 섹션 삽입**

다음을 정확히 삽입 (배지/링크 텍스트는 README 톤에 맞춤):

```markdown
## Engineering Highlights

운영 중인 서비스에서 풀어낸 비자명한 문제들입니다. 각 항목은 deep-dive로 연결됩니다.

- **BFF 보안 경계와 무중단 secret rotation** — Cloudflare Pages Functions에서 cookie domain strip, 내부 헤더 차단, multi-secret 회전을 한 곳에 응집. 분 단위 secret 회전과 audit log를 보유합니다. → [Case study](docs/case-studies/01-bff-security-and-secret-rotation.md)
- **Mutation과 알림 발송의 결합 분리** — MySQL transactional outbox + Kafka relay로 mutation 트랜잭션과 SMTP/in-app 발송을 분리. PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD state machine과 masked audit ledger를 운영합니다. → [Case study](docs/case-studies/02-notification-pipeline-with-outbox.md)
- **Multi-club domain platform** — 하나의 인스턴스에서 path-routed shared fallback과 custom domain alias를 같은 codepath로. host/slug 우선순위 설계와 dev/prod parity가 깨진 실제 incident를 post-mortem으로 보유합니다. → [Case study](docs/case-studies/03-multi-club-domain-platform.md)
```

- [ ] **Step 3: 검증**

```bash
grep -A 1 "## Engineering Highlights" README.md | head -5
grep -c "Case study" README.md
```

기대: 섹션 헤더 + 3개 "Case study" 링크.

```bash
for link in $(grep -oE "docs/case-studies/[a-z0-9-]+\.md" README.md); do
  test -f "$link" && echo "OK: $link" || echo "MISSING: $link"
done
```

기대: 모두 OK.

---

## Task 6: 통합 검증 (ADR plan과의 cross-link 점검)

**Files:** 검증만

- [ ] **Step 1: 모든 ADR 링크 유효성**

```bash
for f in docs/case-studies/*.md; do
  grep -oE "ADR-[0-9]{4}" "$f" | sort -u | while read adr; do
    num=$(echo "$adr" | sed 's/ADR-//')
    file=$(ls docs/development/adr/${num}-*.md 2>/dev/null)
    if [ -z "$file" ]; then
      echo "MISSING ADR file for $adr in $f"
    fi
  done
done
```

ADR plan이 아직 실행 전이면 일부 missing 가능. 두 plan이 함께 실행될 때 통과해야 한다.

- [ ] **Step 2: spec/plan/post-mortem cross-link 유효성**

```bash
for f in docs/case-studies/*.md; do
  grep -oE "docs/(superpowers|operations)[^)]*\.md" "$f" | while read path; do
    test -f "$path" && echo "OK: $path" || echo "MISSING: $path (in $f)"
  done
done
```

post-mortem 파일은 별도 plan에서 생성. 두 plan이 함께 실행될 때 통과 필요.

- [ ] **Step 3: 공개 release 점검**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

기대: 모두 통과.

- [ ] **Step 4: 각 case study 섹션 완비 확인**

```bash
for f in docs/case-studies/0*.md; do
  echo "=== $f ==="
  grep -E "^## (문제|접근|구현|검증|Trade|다시|관련)" "$f" | wc -l
done
```

기대: 각 파일 6 이상 (case 03은 incident 섹션 추가로 7).

---

## 위험과 완화

| 위험 | 완화 |
|------|------|
| ADR plan과 동기화 깨짐 | Task 6 Step 1으로 검출. 두 plan은 같은 PR에서 함께 머지 권고. |
| README 첫 화면이 무거워짐 | Engineering Highlights는 3 bullet, 각 1~2문장 + 링크만. 본문은 case study에. |
| Case study 본문이 ADR과 단순 중복 | 각 case는 *운영 검증* 섹션과 *다시 한다면* 섹션을 ADR과 차별화. case 03은 *incident* 서사를 추가로 보유. |
| 코드 인용 라인 drift | 인용 시 함수명/심볼 우선, 라인 보조. |

---

## 완료 조건

- [ ] `docs/case-studies/`에 4개 파일 (README + case 01/02/03).
- [ ] 각 case가 spec의 공통 섹션을 모두 포함.
- [ ] README에 Engineering Highlights 섹션 추가.
- [ ] `./scripts/public-release-check.sh` 통과.
- [ ] (ADR + post-mortem plan과 통합 시) Task 6의 모든 cross-link 유효.
