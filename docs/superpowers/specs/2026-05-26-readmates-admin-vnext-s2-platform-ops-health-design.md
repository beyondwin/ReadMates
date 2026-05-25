# Admin vNext S2 — Platform Ops Health (+ Deploy ledger) Design

**Status:** draft (brainstorm 통과, user review 대기)
**Parent roadmap:** [`2026-05-25-readmates-admin-vnext-roadmap-design.md`](2026-05-25-readmates-admin-vnext-roadmap-design.md) — S2
**Depends on:** S1 IA Foundation (라우트 카탈로그, 권한 매트릭스, shell layout, 코밍순 placeholder), Observability Foundation (Prometheus + Alertmanager + SLO/alert SSOT)

## 1. 배경

S1으로 `/admin` 가 9-라우트 lazy-split shell로 분해됐고, `/admin/health` 는 현재 COMING-SOON 상태. 별도 트랙으로 머지된 Observability Foundation(sequence O)이 Prometheus + Alertmanager + 6 SLO SSOT + 6 alert rule group을 깔았다. 즉 운영자가 인프라/도메인 신호를 한 자리에서 볼 수 있는 데이터 소스는 이미 존재하지만, 운영자가 그것을 보려면 OCI VM에 ssh로 들어가 Prometheus expression browser나 Alertmanager UI를 직접 열어야 한다. 운영자 페르소나의 1차 가치(빠른 상황 인식 + 책임 자리로의 drill)가 닫히지 않은 상태.

S2는 그 갭을 닫는다. `/admin/health` 를 ready 라우트로 전환하고, 7개 카드(DB pool / Redis / Kafka consumer lag / AI provider 가용성 / outbox backlog / 알림 발송 성공률 / 최근 deploy attempt 5건 strip)를 단일 페이지에서 보여준다. 카드 단위 status + last-checked + drill 링크. 데이터 소스는 in-process Micrometer + 로컬 Prometheus HTTP 질의 하이브리드. 외부 도구(Grafana 등)는 미배포 상태라 slice H follow-up으로 미룬다.

## 2. 페르소나 및 사용 시나리오

- **운영자 (1차)**: 알림 fire 또는 사용자 보고 시점에 `/admin/health` 를 열어 "어떤 카드가 빨갛지?" 한 눈에 식별. outbox backlog 빨갛다 → outbox 카드 drill → `/admin/notifications` (현재 COMING-SOON, S5에서 ready). AI provider critical → AI ops 카드 drill → `/admin/ai-ops` (S1에서 이미 ready).
- **리뷰어 (2차)**: 사고 회고 시 deploy attempt strip에서 최근 배포 시간/결과를 빠르게 확인. 사고-배포 인과를 분초 단위로 매핑.
- **OWNER (관찰자)**: 직접 진단하지는 않지만 카드 색만 보고 안심 또는 escalate 의사결정.

## 3. 비목표

- Grafana 배포(slice H), Alertmanager webhook 자동화, dead-man's-switch, SLO monthly 자동화는 별도 slice.
- SSE/WebSocket 라이브 푸시는 S2 scope 밖. 프론트는 10~15s 폴링.
- 임계값 편집 UI, 카드 customize per-role, 시계열 차트(미니 sparkline) 모두 후속.
- 알림 fire 자체는 Alertmanager가 한다. `/admin/health` 는 fire의 동등 채널이 아니라 "지금 이 순간"의 visualizer.
- 카드별 historic timeline view는 후속. 현재 값 + 임계 기준 + last-checked만 표시.

## 4. 아키텍처

### 4.1 데이터 소스 (하이브리드)

| 카드 | source | 데이터 |
|------|--------|--------|
| DB pool | in-process | `HikariPoolMXBean` (active, idle, total, pending) via Micrometer `hikaricp_*` 메트릭 |
| Redis | in-process | `RedisConnectionFactory` ping + 최근 5분 `readmates_redis_operation_errors_total` 카운터 (Micrometer) |
| Kafka consumer lag | prometheus | `sum by (topic) (kafka_consumer_records_lag{consumer_group="readmates-aigen-worker"})` (Spring Kafka가 Micrometer로 노출하는 표준 메트릭) |
| AI provider 가용성 | prometheus | provider별 최근 5분 성공 비율: `sum by (provider) (rate(readmates_aigen_jobs_completed_total{status="SUCCEEDED"}[5m])) / clamp_min(sum by (provider) (rate(readmates_aigen_jobs_completed_total[5m])), 1)` |
| Outbox backlog | in-process | `readmates.notifications.outbox.backlog{status="pending"}` gauge 값을 `MeterRegistry.find().tag("status","pending").gauge().value()` 로 직접 read |
| 알림 발송 성공률 | prometheus | `notification_dispatch_success_ratio` SLO와 동일 식 (`sum(rate(readmates_outbox_publish_total{result="success"}[5m])) / clamp_min(sum(rate(readmates_outbox_publish_total[5m])), 1)`) |
| Deploy attempts (최근 5건) | in-process(file) | `/var/log/readmates/deploy-attempts.jsonl` 또는 `READMATES_DEPLOY_LEDGER` env, tail 최근 N 엔트리 |

원칙: "in-process로 정확히 알 수 있고 SLO/alert와 의미가 같지 않은" 값은 in-process. "SLO 카탈로그/alert 룰과 같은 식으로 계산되어야 하는" 값은 Prometheus 질의(SSOT 재사용). Prometheus down 시 그 카드만 `status=unknown` + `reason="prometheus_unreachable"` 으로 떨어지고 in-process 카드는 정상 동작 → 운영자가 인프라 자체 문제도 페이지에서 즉시 식별.

### 4.2 임계값 정책

OK / WARN / CRIT 임계는 가능한 한 **`ops/prometheus/alerts/*.yml` 의 alert rule 임계와 동일**하게 둔다. 즉:

| 카드 | OK | WARN | CRIT | alert rule 출처 |
|------|----|------|------|----------------|
| Outbox backlog (pending) | <100 | ≥100 | ≥1000 | `NotificationOutboxBacklogHigh` / `NotificationOutboxBacklogCritical` |
| 알림 발송 성공률 | ≥99% | <99% | <95% | `NotificationFailRateHigh` 변형 |
| Kafka lag | <50/partition | ≥50 | ≥500 | (alert는 별도 없음, S2에서 기본 임계 정의) |
| AI provider success | ≥99% | <99% | <95% | (alert는 별도 없음, S2 정의) |
| DB pool pending | =0 | ≥1 | ≥5 | `HikariConnectionPoolPending` (alert는 2분 sustained; S2 snapshot은 point-in-time) |
| Redis error rate | <0.05/s | ≥0.05 | ≥0.5 | `RedisOperationErrors` |
| Deploy strip | 정보 카드 (status 없음, attempt 5건 listing) | — | — | n/a |

S2에서 새로 정의한 임계(Kafka lag, AI provider)는 spec 본문에 명시하고, 후속 slice가 alert rule 파일을 만들 때 같은 숫자를 재사용한다 (SSOT 방향성 유지).

Status가 `unknown` 인 경우:
- 데이터 fetch 실패 (Prometheus down, ledger file missing)
- 최근 N분 동안 메트릭 부재 (e.g., AI 호출이 5분 동안 0건이라 ratio 계산 불가)
이 두 경우 모두 `status=unknown` + `reason` 필드로 표현. 색상은 회색.

### 4.3 컴포넌트

```
front/features/platform-admin/route/
  admin-health-route.tsx          (NEW — coming-soon → ready 토글)
  admin-health-data.ts            (NEW — loader가 /api/admin/health/snapshot fetch)

front/features/platform-admin/ui/
  admin-health-grid.tsx           (NEW — 7 카드 그리드 + 새로고침 버튼)
  admin-health-card.tsx           (NEW — 단일 카드 컴포넌트: title, status pill, value, threshold, last-checked, drill link)

server/src/main/kotlin/com/readmates/admin/health/
  adapter/in/web/
    PlatformAdminHealthController.kt          (NEW — @GetMapping("/api/admin/health/snapshot"))
  application/service/
    PlatformAdminHealthService.kt             (NEW — composes 7 cards, owns 10s TTL cache)
    HealthCardProvider.kt                     (NEW — interface: id, compute(): HealthCard)
    providers/
      DbPoolHealthCardProvider.kt             (NEW — Hikari)
      RedisHealthCardProvider.kt              (NEW)
      KafkaLagHealthCardProvider.kt           (NEW — Prometheus)
      AiProviderAvailabilityCardProvider.kt   (NEW — Prometheus)
      OutboxBacklogHealthCardProvider.kt      (NEW — in-process backlog gauge value)
      NotificationDispatchSuccessCardProvider.kt (NEW — Prometheus)
      DeployAttemptsStripCardProvider.kt      (NEW — JSONL tail)
  application/model/
    HealthCard.kt                             (NEW — data class)
    HealthCardStatus.kt                       (NEW — enum)
    PlatformHealthSnapshot.kt                 (NEW — generated_at + List<HealthCard>)
  application/port/out/
    PrometheusQueryPort.kt                    (NEW — query(promql): PromQueryResult)
    DeployLedgerPort.kt                       (NEW — tailLatest(n): List<DeployAttempt>)
  adapter/out/prometheus/
    HttpPrometheusQueryAdapter.kt             (NEW — RestClient -> prometheus:9090)
  adapter/out/persistence/
    JsonlDeployLedgerAdapter.kt               (NEW — reads file with offset-aware tail)
```

새 패키지 `com.readmates.admin.health` 를 도입한다. 기존 `club.adapter.in.web.PlatformAdminController` 는 club ops 책임이므로 분리.

ArchUnit baseline에 새 패키지가 들어가도록 1줄 추가가 필요할 수 있다 (admin → application → adapter 방향성은 기존 룰과 동일).

### 4.4 캐시

`PlatformAdminHealthService` 가 `AtomicReference<PlatformHealthSnapshot>` 1개를 보유. `@Scheduled(fixedRate = 10_000)` 가 모든 provider를 병렬(`CompletableFuture.supplyAsync` × 7 + `allOf`)로 호출해 snapshot 갱신.

- 초기 부팅 직후 첫 요청은 `null` 가능 → 동기 lazy compute로 fall back (단발성).
- 어떤 provider가 실패해도(Prometheus down 등) 그 카드만 `status=unknown` + `reason` 으로 채워지고 나머지는 정상.
- 카드별 `last_checked_at` 은 그 카드의 마지막 성공 시각(Prometheus 응답 timestamp 또는 in-process compute 시각). snapshot 전체의 `generated_at` 은 scheduler tick 시각.

10초는 Prometheus scrape interval(30s)의 1/3이므로 캐시가 scrape보다 fresh해질 여지는 없음 — 부하 대비 최적 지점.

### 4.5 API 계약

`GET /api/admin/health/snapshot`

```json
{
  "schema": "platform.health_snapshot.v1",
  "generated_at": "2026-05-26T03:14:15Z",
  "cards": [
    {
      "id": "outbox_backlog",
      "title": "Outbox backlog",
      "status": "warn",
      "metric": { "value": 137, "unit": "rows", "label": "pending" },
      "thresholds": { "warn": 100, "crit": 1000 },
      "last_checked_at": "2026-05-26T03:14:15Z",
      "source": "in_process",
      "drill": { "kind": "admin_route", "target": "/admin/notifications" },
      "reason": null
    },
    {
      "id": "kafka_consumer_lag",
      "title": "Kafka consumer lag",
      "status": "unknown",
      "metric": null,
      "thresholds": { "warn": 50, "crit": 500 },
      "last_checked_at": "2026-05-26T03:13:45Z",
      "source": "prometheus",
      "drill": null,
      "reason": "prometheus_unreachable"
    }
  ]
}
```

응답 schema 버전(`platform.health_snapshot.v1`)은 후속 slice가 카드 모델을 진화시킬 때 명시적 versioning에 사용. JSON Schema 또는 contract test는 S2 범위가 아니나 필드는 stable로 본다.

권한 가드:
- `SecurityConfig` 의 기존 `/api/admin/**` 보호 규칙 재사용.
- S1 권한 매트릭스의 `platform_ops_health.read` 권한(없으면 신설)을 controller method security로 강제.
- OWNER 페르소나는 default `platform_ops_health.read` = true (admin/SUPPORT/OWNER 모두 view 허용). 권한 매트릭스 수정은 1줄.

### 4.6 Drill 동작

| 카드 | drill target | 작동 상태 |
|------|-------------|-----------|
| DB pool | none (S2에서는 drill 없음) | n/a |
| Redis | none | n/a |
| Kafka lag | none | n/a |
| AI provider | `/admin/ai-ops` | 작동 (S1에서 ready) |
| Outbox backlog | `/admin/notifications` | COMING-SOON (S5에서 ready) |
| 알림 발송 성공률 | `/admin/notifications` | COMING-SOON (S5에서 ready) |
| Deploy strip | (카드 내 expand, 외부 링크 없음) | n/a |

Drill 링크가 COMING-SOON으로 가는 것은 의도. 운영자에게 "이 카드의 상세 표면은 곧 여기에 생긴다"는 정보가 명확. S5 ship 후 자동으로 ready 화면이 열림.

외부 도구(Grafana 등) drill은 카드 모델의 `drill.kind = "external"` + `drill.url` 필드로 후속 slice H에서 확장 가능. S2 응답에는 절대 포함되지 않는다 (Grafana 미배포 + URL은 env 주입 패턴 미정).

### 4.7 Deploy attempt strip

`/var/log/readmates/deploy-attempts.jsonl` 의 마지막 5엔트리를 `JsonlDeployLedgerAdapter` 가 읽음. 파일 형식:

```jsonl
{"ts":"...","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v1.12.0","attemptId":"abc","durationSeconds":0}
{"ts":"...","stage":"post-deploy-watch","event":"WATCH_OK","status":"SUCCEEDED","detail":"...","attemptId":"abc","durationSeconds":42}
```

표시 단위는 **attempt 단위로 그룹핑**(같은 attemptId의 이벤트를 묶고, 최종 status를 SUCCEEDED/FAILED/RUNNING로 판정). 최근 5개 attempt(시간 역순)를 strip으로 노출.

엔트리 schema는 `{attemptId, started_at, ended_at?, final_status, image_tag?, duration_seconds?}` 로 정규화. UI는 라벨 + 시각 + 색상 dot(green/red/gray).

파일이 없거나 비어 있으면 strip card status=unknown + reason="ledger_unavailable". 운영자가 처음 배포한 환경에서 자연스럽게 처리.

권한: ledger 파일은 운영 VM 안에 있고 서버 프로세스가 read 가능. 별도 path traversal 위험 없음(`READMATES_DEPLOY_LEDGER` env가 운영 책임).

### 4.8 프론트엔드 UI

- 그리드: 모바일 1열, 태블릿 2열, 데스크톱 3열 (admin shell 기존 breakpoint 재사용).
- 카드 컴포넌트: `<header>` (title + status pill) + `<body>` (metric value + 단위 + threshold 텍스트) + `<footer>` (last-checked relative time + drill 링크).
- Status pill 색상: ok=green, warn=amber, crit=red, unknown=gray.
- 새로고침 버튼: 우상단. 클릭 시 query invalidate → loader refetch. `refetchInterval` 은 15초.
- Deploy strip: 1열 가로 strip 형태로 그리드 하단에 통째로 배치(7번째 카드 자리 + 좌우 spans).
- 빈 상태/오류: 카드 단위로 unknown 표시. 페이지 전체 fallback은 query loader가 기존 `AdminComingSoon` 또는 error boundary로 처리.

### 4.9 권한 + 라우트 카탈로그 통합

`admin-route-catalog.ts` 의 `health` 항목을 `coming_soon → ready` 로 토글. S1 권한 매트릭스(`platform-admin-permissions.ts`)에 `platform_ops_health.read` 권한 한 줄 추가(default true for admin/SUPPORT/OWNER, false for member/guest).

라우트 가드는 S1의 `AdminShellLayout` loader에서 이미 동작 — 토글만 하면 됨.

## 5. 데이터 흐름

```
@Scheduled(10s)            HealthCardProvider × 7 (parallel)
       │                          │
       ▼                          ▼
PlatformAdminHealthService ──► AtomicReference<Snapshot>
       ▲                          │
       │ (sync lazy on first GET) │
       │                          ▼
GET /api/admin/health/snapshot ──► JSON
       ▲                          │
       │                          ▼
Frontend loader (15s refetch) ──► <AdminHealthGrid>
```

## 6. 오류 처리

- Provider compute 실패: 그 카드만 status=unknown + reason 문자열. snapshot은 항상 7 카드 반환.
- Scheduler thread 예외: 다음 tick에 재시도. 마지막 성공 snapshot은 그대로 유지. 60s 이상 갱신 안 되면 snapshot의 `generated_at` 이 과거 → 운영자가 stale을 직접 인식.
- Prometheus client는 5초 timeout. 5초 안에 못 끌어오면 unknown.
- Ledger file read 실패: unknown, reason=`ledger_unavailable`.
- AuthZ 실패: 401/403. shell layout이 이미 처리.

## 7. 테스트 계획

- **Unit (per provider)**: 각 `HealthCardProvider` 는 collaborator(`HikariDataSource`, `PrometheusQueryPort`, `DeployLedgerPort`)를 FakeXxxPort로 주입받아 격리 테스트. 정상/임계 경계/unknown 3분기.
- **Unit (service)**: `PlatformAdminHealthService` 가 7 provider 결과를 어떻게 합치는지, 일부가 던져도 다른 카드는 살아남는지.
- **Unit (web)**: `PlatformAdminHealthController` MockMvc + 권한 가드(403 for member/guest).
- **Unit (캐시)**: scheduler가 10초마다 갱신하는지 + 동시 요청이 lock-free으로 동일 snapshot 보는지 (Awaitility + `@SpringBootTest(webEnvironment=NONE)` 또는 service unit 단위).
- **Architecture**: ArchUnit baseline에 새 패키지가 들어가는지 확인. 위반 시 baseline 갱신 사유 commit.
- **Frontend unit**: `admin-health-card.test.tsx` 의 status pill 매핑(value vs threshold) + drill 링크 노출 조건, `admin-health-route.test.tsx` 의 loader 매핑.
- **E2E (Playwright, 1개 happy path)**: admin dev-login → `/admin/health` → 7 카드 grid 렌더 + 새로고침 버튼 → 응답 mock으로 카드 색상 변화 검증.

`./server/gradlew -p server unitTest` 와 `pnpm --dir front test` 에서 모두 PASS. `./server/gradlew -p server integrationTest` 는 Testcontainers 필요로 환경 갖춰진 경우 별도.

## 8. 위험

- **Prometheus client 부하**: 7 카드 × 10초 = 분당 42 query. 단일 인스턴스 Prometheus에는 미미. 다중 admin 동시 접속해도 캐시가 막아줌.
- **Hikari pool 메트릭 의존**: Hikari 버전이 노출하지 않는 환경 있으면 카드 unknown 처리. fallback OK.
- **Deploy ledger 파일 권한**: 서버 컨테이너가 mount하지 않으면 unknown. 운영자가 처음 보면 reason 메시지로 안내.
- **드릴 링크가 코밍순으로**: 의도된 동작이지만 사용자에게 "준비 중" 화면이 노출 — copy를 명확히 ("S5 알림 운영 슬라이스에서 상세가 추가됩니다") 한 줄 보강.
- **PromQL 식 재발급**: SLO 카탈로그의 식과 100% 일치하지 않으면 dashboard와 alert 사이 미세 괴리. 식은 spec 본문에 명시(섹션 4.1), 후속 차이 발생 시 alert rule을 spec에 맞추도록 명시.

## 9. 수용 게이트 (Slice acceptance)

공통 게이트 + S2 고유:
- `/admin/health` 가 default page에서 도달 가능. admin/SUPPORT/OWNER 모두 200, member/guest 403.
- 7 카드 모두 schema 적합한 JSON 반환. 한 카드가 실패해도 나머지 6 카드는 ok/warn/crit/unknown 중 하나로 표시.
- E2E happy path 1개 통과.
- CHANGELOG `## Unreleased` → `### Engineering` 에 1줄: `platform-admin: introduce health snapshot route covering service, queue, AI, outbox, deploy signals`.
- `./scripts/pre-push-check.sh` standard green (ktlint + detekt + unitTest + architectureTest + public-release-candidate + gitleaks).
- public-release scan: 새 `admin/health` 디렉토리에 real IP/email/path 없음.
- README "역할별 기능" 표 또는 `docs/operations/observability/README.md` 에 `/admin/health` 줄 추가.

## 10. 후속 (Out of scope)

- Grafana 배포 + 카드 외부 drill 링크(`drill.kind="external"`) — slice H.
- Alertmanager webhook → `/admin/health` 페이지 인앱 토스트 — 별도 알림 채널 slice.
- 시계열 sparkline / historic view — 별도 design doc.
- 카드 customize per-role (예: OWNER 화면에서 일부 카드 hide) — 사용자 가치 입증 후.
- Mobile-first 압축 모드 — 운영자는 데스크톱 중심이라 후순위.
- Manual provider probe (e.g., "AI 호출 1건 가짜로 보내 응답 시간 측정") — risk가 커서 별도 spec.

## 11. 변경 요약

- Backend: 새 패키지 `com.readmates.admin.health` (1 controller + 1 service + 1 interface + 7 provider + 2 port + 2 adapter + 3 model). 예상 ~14 파일.
- Frontend: 3 신규 파일(route, loader, grid+card UI) + 카탈로그/permission 매트릭스 토글 + 테스트.
- 문서: 본 spec + 후속 implementation plan + CHANGELOG + 운영 README 1줄.
- 예상 commits: 4~6 (로드맵 추산과 일치).
