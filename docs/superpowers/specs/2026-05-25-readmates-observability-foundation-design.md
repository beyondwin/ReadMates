# ReadMates Observability Foundation (Slice O) Design

작성일: 2026-05-25
상태: DRAFT — sub-spec (admin vNext 시퀀스 옵션 2의 1번 슬라이스 "O")
범위: 서버 관찰성/SLO 파이프라인 wire-up (Prometheus + Alertmanager). Grafana는 후속 슬라이스 H로 위임.

## 배경

ReadMates는 이미 풍부한 관찰성 *자재*를 보유하고 있다.

- `server/src/main/resources/application.yml`은 `/actuator/prometheus`를 `READMATES_MANAGEMENT_ADDRESS`(prod: `0.0.0.0`) / `READMATES_MANAGEMENT_PORT`(8081)로 노출한다.
- `server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalogLoader.kt`가 `server/src/main/resources/slo/slos.yaml`을 로드한다(`notification_dispatch_success_ratio`, `bff_api_p95`, `login_success_ratio` 3건).
- `docs/operations/observability/{slos,alerts,dashboards,metrics-catalog}.md` 4개 문서가 SLO 정의·alert 후보·dashboard PromQL·metric 카탈로그를 갖고 있다.
- `ops/prometheus/alerts/aigen-rules.yml`이 AI 세션 생성 alert 5개를 파일로 보유한다.
- `ops/grafana/dashboards/{bff-api-latency,notification-dispatch,aigen}.json`이 3개 Grafana dashboard를 JSON으로 보유한다.
- ReadmatesOperationalMetrics·AiGenerationMetrics·RedisCacheMetrics를 통해 outbox/sent/failed/dead, AI gen jobs/latency/tokens/cost, Redis cache hit/miss/evict/fallback, rate limit, BFF audit, dispatch unknown_status가 PII-safe tag policy로 계측되어 있다.

그러나 *파이프라인이 운영 환경에서 실행되지 않는다*. `docs/operations/observability/slos.md`의 3개 SLO 모두 "현재: 미측정 (Prometheus 스크래퍼 미배포)"로 표시되어 있고, alert receiver가 정의되지 않아 `aigen-rules.yml`은 평가만 가능할 뿐 실제 전파 경로가 없다. 결과적으로 SLO 위반·incident가 사람의 인지에 100% 의존한다.

이 슬라이스는 그 격차를 닫는다. 관찰성 자재가 이미 완비되어 있다는 사실이 본 슬라이스의 wedge를 *깊이*가 아니라 *deploy + reconcile*로 좁힌다.

## 목적

다음 4가지 결과를 슬라이스가 끝나는 시점에 동시에 만족시킨다.

1. **SLO가 실측치를 갖는다.** `slos.md`의 모든 SLO에 "현재: 측정 중" 또는 첫 측정 결과가 기입된다.
2. **Alert이 실제 receiver로 흘러간다.** SMTP 단일 채널로 운영자 이메일(env 주입)에 전달된다.
3. **SLO catalog YAML과 docs SLO 정의가 일치한다.** `slos.yaml`과 `slos.md`가 동일 SLO를 동일 ID로 가리키며, 테스트가 이를 강제한다.
4. **placeholder 메트릭이 실측 wiring된다.** `readmates.aigen.queue.depth` gauge가 Redis job state(PENDING+RUNNING) 실측치를 반영하고(자세한 근거는 §3.2), notification delivery latency가 직접 histogram으로 노출된다.

## Non-Goals (이 슬라이스 밖)

- Grafana 배포 — 슬라이스 H(`/admin/health`)가 actuator/prometheus query를 직접 paneling. `ops/grafana/dashboards/*.json`은 별도 도구로 import할 수 있도록 git 보관만 유지.
- 자동 post-mortem trigger — 슬라이스 후속 follow-up. 이번 슬라이스는 SLO 위반 시 *runbook* 항목만 추가.
- Frontend SLO(RUM) — 슬라이스 외부, 별도 spec.
- Per-club cost cap의 alert 표현 — `club_id`가 metric label에 없는 정책 유지. 운영 SQL drill-down(`ai_generation_audit_log`)을 그대로 사용.
- 다중 alert receiver(Slack/Discord/GitHub Issue) — 이번 슬라이스는 SMTP 1개로 끝낸다. SEV 분기 routing은 Components §2(Alertmanager)에서 채널 단일임에도 *group_wait/repeat* 정책으로 분리.

## 페르소나와 wedge

- **개발자 운영자(본인 1인)**: 이메일로 critical alert을 받는다. SLO 위반 trend는 월 1회 SLO report에서 본다.
- **OWNER 위임 대상**: 이번 슬라이스 직접 영향 없음(어드민 UI 변경 없음).
- **리뷰어/포트폴리오**: `slos.md`의 "미측정" 표기가 "측정 중" + 실측치로 전환된 PR 한 줄로 가치가 전달된다.

## 의존성

- 선행: 없음. Admin vNext S1(IA Foundation)이 이미 끝났으므로 어드민 표면 충돌 없음.
- 후속: 슬라이스 H의 `/admin/health` 카드들이 본 슬라이스가 깐 Prometheus를 query 대상으로 쓰거나, 또는 actuator 직접 폴링과 병행하는 결정을 슬라이스 H에서 내림. 본 슬라이스는 H가 둘 중 어느 길을 가도 무방하도록 *데이터 소스*만 단단히 만든다.

## Architecture

```text
                              ┌─────────────────────┐
                              │ OCI VM (compose)    │
                              │                     │
   Spring App (8080, 8081) ──►│ actuator/prometheus │
        │                     │   loopback for ops, │
        │                     │   0.0.0.0 binding   │
        │                     │   on docker network │
        ▼                     │                     │
   MySQL / Redis / Redpanda   │                     │
        ▲                     │                     │
        │ scrape every 30s    │                     │
   ┌────┴────┐                │                     │
   │Prometheus│ ◄──── alert rules                   │
   │  (9090) │       (file_sd from ops/prometheus/) │
   └────┬────┘                │                     │
        │ alertmanager_config │                     │
        ▼                     │                     │
   ┌──────────────┐           │                     │
   │ Alertmanager │ ──SMTP──► (env-injected         │
   │   (9093)     │            recipient inbox)     │
   └──────────────┘           │                     │
                              └─────────────────────┘
```

- Prometheus와 Alertmanager는 `deploy/oci/compose.infra.yml`에 새 서비스로 추가된다(app stack과 같은 docker network를 공유). 두 컨테이너 모두 외부 포트 publish를 *하지 않는다* — actuator·prometheus·alertmanager 어느 것도 host의 public interface로 노출되지 않고, Caddy를 통해서도 외부에 노출되지 않는다. 운영자가 직접 보려면 SSH tunnel 또는 OCI bastion을 거친다.
- 본 슬라이스는 Prometheus와 Alertmanager *서비스 정의*와 *환경 변수 계약*만 정의한다. OCI VM에 systemd로 띄우는 절차는 `docs/operations/runbooks/observability-bootstrap.md`(신규)에 기술한다.

## Components

### 1. Prometheus 컨테이너 (신규)

- Image: `prom/prometheus:v2.55.0`(pinned, LTS lineage)
- Volumes:
  - `/etc/prometheus/prometheus.yml` ← `deploy/oci/prometheus/prometheus.yml`(신규, git 보관)
  - `/etc/prometheus/rules/` ← `ops/prometheus/alerts/`(git 보관, bind mount)
  - `/prometheus/data` ← host named volume `readmates_prom_data` (retention 30일, SLO window와 일치)
- Scrape config (`prometheus.yml`):
  - `job_name: readmates-server`, `static_configs: targets: ['server:8081']`(docker network DNS), `metrics_path: /actuator/prometheus`, `scrape_interval: 30s`, `scrape_timeout: 10s`.
  - `job_name: alertmanager`, target `alertmanager:9093`, `/metrics`.
- Rule files:
  - `ops/prometheus/alerts/aigen-rules.yml` (기존, 그대로)
  - `ops/prometheus/alerts/notification-rules.yml` (신규, `alerts.md` §룰의 readmates.notification 그룹 이전)
  - `ops/prometheus/alerts/http-rules.yml` (신규, readmates.http 그룹 이전)
  - `ops/prometheus/alerts/jvm-rules.yml` (신규, readmates.jvm 그룹 이전)
  - `ops/prometheus/alerts/security-rules.yml` (신규, readmates.security 그룹 이전)
  - `ops/prometheus/alerts/redis-rules.yml` (신규, readmates.redis 그룹 이전)
- 외부 노출: **없음**. Docker network 내부에서만 접근. host port publish 없음.

### 2. Alertmanager 컨테이너 (신규)

- Image: `prom/alertmanager:v0.27.0`(pinned).
- Volumes:
  - `/etc/alertmanager/alertmanager.yml` ← `deploy/oci/alertmanager/alertmanager.yml`(신규, env 치환 사용)
  - `/alertmanager` ← host named volume `readmates_alertmanager_data` (silence/notification log)
- 환경 변수(env_file의 `.env` 또는 OCI 환경에서 주입):
  - `READMATES_ALERT_SMTP_HOST` — SMTP server host
  - `READMATES_ALERT_SMTP_PORT` — SMTP port (587 권장)
  - `READMATES_ALERT_SMTP_USER` — SMTP user
  - `READMATES_ALERT_SMTP_PASSWORD` — SMTP password
  - `READMATES_ALERT_SMTP_FROM` — alert sender address
  - `READMATES_ALERT_EMAIL_TO` — operator recipient(들 — alertmanager는 comma 분리 지원)
- Routing tree (`alertmanager.yml`):

  ```yaml
  route:
    receiver: ops-email
    group_by: ['alertname', 'severity']
    group_wait: 30s        # 동일 그룹 spike 묶음
    group_interval: 5m
    repeat_interval: 4h    # critical/warning 공통 — 너무 시끄럽지 않게
    routes:
      - matchers: [severity = "critical"]
        receiver: ops-email
        group_wait: 10s    # critical은 더 빨리
        repeat_interval: 1h
      - matchers: [severity =~ "warn|warning"]
        receiver: ops-email
        group_wait: 2m
        repeat_interval: 12h
      - matchers: [severity = "info"]
        receiver: ops-email
        group_wait: 10m
        repeat_interval: 24h

  receivers:
    - name: ops-email
      email_configs:
        - to: ${READMATES_ALERT_EMAIL_TO}
          from: ${READMATES_ALERT_SMTP_FROM}
          smarthost: ${READMATES_ALERT_SMTP_HOST}:${READMATES_ALERT_SMTP_PORT}
          auth_username: ${READMATES_ALERT_SMTP_USER}
          auth_password: ${READMATES_ALERT_SMTP_PASSWORD}
          require_tls: true
          send_resolved: true
          headers:
            Subject: '[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonLabels.alertname }} ({{ .CommonLabels.severity }})'
  ```

  - 단일 receiver이지만 severity별 route를 두는 이유: group_wait/repeat 정책을 SEV별로 다르게 두면, 같은 inbox로 와도 *늦게 와도 되는 알림이 critical을 묻지 않는다*.
  - `send_resolved: true` — 자동 회복 시 "Resolved" 이메일도 받아 SLO 회복 인지 가능.
- 외부 노출: **없음**.

### 3. Spring App 코드 변경

#### 3.1 Notification delivery latency histogram (신규)

- 위치: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
- 신규 메트릭: `readmates.notifications.delivery.latency` — Micrometer `Timer`(`publishPercentileHistogram(true)` + `serviceLevelObjectives` 설정으로 Prometheus histogram bucket 노출), 단위 seconds.
- 태그: `event_type` (NotificationEventType enum, 기존 metrics와 동일 정책 — low cardinality).
- 기록 시점: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt:194`의 `PUBLISHED` 전이 시점에서 `published_at - created_at` 차이를 timer로 기록. 트랜잭션 커밋 후 metric 갱신(기존 sent counter와 동일 정책).
- SLO 갱신: `slos.md` §SLO-3가 SQL approximation 대신 본 histogram을 PromQL `histogram_quantile`로 측정하도록 measurement section 갱신. SQL 근거 블록은 fallback으로 유지(MySQL drill-down 절차).

#### 3.2 AI gen queue depth real wiring (신규)

- 현재: `AiGenerationMetrics.registerQueueDepthGauge`가 placeholder supplier(상수 0) 채로 등록되어 있다.
- 추가: AI generation 작업 큐의 *backlog* 측정 가능 채널 선택. Kafka consumer lag을 직접 가져오는 대신, 본 슬라이스에서는 *Redis job state*에서 PENDING + RUNNING 카운트를 polling하는 supplier를 등록(60초 캐시). 이유:
  1. AI generation의 진짜 queue는 Redis job state machine(`AiGenerationJobTransitionPolicy`)임. Kafka는 transport이지 queue가 아님.
  2. Kafka AdminClient 추가는 새 의존성/권한. Redis는 이미 있다.
  3. 60초 캐시면 Prometheus 30s scrape에 대해 부하 무시 가능.
- 위치: `server/src/main/kotlin/com/readmates/aigen/application/service/`에 `AiGenerationQueueDepthGaugeBinder.kt` 신규 — `@PostConstruct`에서 `AiGenerationMetrics.registerQueueDepthGauge { redisJobStore.countByStatus(PENDING) + countByStatus(RUNNING) }`.
- 결과: `readmates_aigen_queue_depth` gauge가 실측치로 전환되어 `AiGenQueueLagHigh` alert이 의미를 가진다.

#### 3.3 SLO catalog ↔ docs 정합화

- 현재 불일치:
  - `slos.yaml`: `notification_dispatch_success_ratio`, `bff_api_p95`, `login_success_ratio`
  - `slos.md`: API availability(5xx ratio), Read latency(p95), Notification delivery latency
- 결정: **`slos.yaml`을 SSOT로 삼고, `slos.md`를 catalog의 사람 읽기용 view로 정합화**.
  - 이유: catalog는 코드가 로드하므로 drift 시 fail-fast 가능(`SloCatalogLoaderTest` 이미 존재). 문서는 drift해도 컴파일 못 잡음.
- 통합 SLO 6건 (확장):
  | ID                                    | 정의                                                      | window | objective       |
  |---------------------------------------|-----------------------------------------------------------|--------|-----------------|
  | `api_availability`                    | `/api/**` 5xx ratio                                       | 30d    | < 1%            |
  | `api_read_latency_p95`                | `GET /api/**` p95                                         | 30d    | < 500ms         |
  | `bff_api_p95`                         | BFF→Spring p95 (커스텀 메트릭)                            | 7d     | < 800ms         |
  | `login_success_ratio`                 | OAuth 로그인 성공률                                       | 7d     | > 99%           |
  | `notification_dispatch_success_ratio` | outbox publish 성공률(DEAD 미포함)                        | 7d     | > 99%           |
  | `notification_delivery_latency_p95`   | outbox row 생성→PUBLISHED 전이 p95 (신규 histogram 기준) | 30d    | < 5분           |
- 신규 테스트: `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogDocsConsistencyTest.kt` — `slos.yaml`의 모든 SLO id가 `docs/operations/observability/slos.md`의 어딘가에 그대로 등장하는지, objective/window 표기와 yaml 값이 일치하는지 검증.

### 4. Public Release Safety

- `prometheus.yml`은 target host로 docker DNS 이름(`server`, `alertmanager`)만 사용. 실제 OCI 호스트명/IP 노출 없음.
- `alertmanager.yml`은 모든 SMTP 자격증명·recipient를 `${...}` env 치환으로만 처리. 평문 이메일/패스워드 git에 들어가지 않음.
- 신규 디렉토리: `deploy/oci/prometheus/`, `deploy/oci/alertmanager/` — 두 디렉토리의 모든 파일은 placeholder/templated. `scripts/build-public-release-candidate.sh` + `scripts/public-release-check.sh`가 잡을 수 있는 신호:
  - 실 이메일 도메인 문자열
  - 실 SMTP host 문자열
  - 실 OCI hostname/IP
- `scripts/public-release-check.sh`에 추가 점검: `deploy/oci/{prometheus,alertmanager}/**`에 ASCII 이메일 패턴(`@(?!example\.com|localhost)`)이나 IP literal이 들어가면 fail.
- `docs/deploy/security-public-repo.md`에 "Observability secrets" 절을 추가하여 위 env 변수와 placeholder 정책을 명문화.

### 5. Operational documentation

- 신규: `docs/operations/runbooks/observability-bootstrap.md` — 운영자가 prometheus/alertmanager를 OCI VM에 처음 띄울 때 따라가는 step. env 채우기, `docker compose -f compose.infra.yml up -d prometheus alertmanager`, smoke check, alert silence 추가 절차.
- 신규: `docs/operations/runbooks/slo-monthly-report.md` — 매월 SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`로 떨궈내는 절차(수동, 한 번에 PromQL 실행 → 결과 붙여넣기). 자동화는 follow-up.
- 갱신: `docs/operations/observability/slos.md` — 각 SLO에 "현재: 측정 중" + `slos.yaml` 참조 링크.
- 갱신: `docs/operations/observability/alerts.md` — 후보 룰들이 `ops/prometheus/alerts/*-rules.yml`로 실제 파일화되었음을 표기.
- 갱신: `docs/operations/README.md` — observability bootstrap runbook과 SLO 월간 리포트 runbook 링크 추가.

### 6. Failure Modes

- **Prometheus 컨테이너 down**: 영향 = SLO 측정 단절 + alert 평가 정지. 운영자가 `compose ps`에서 unhealthy 발견. Alertmanager는 받는 게 없으니 침묵. 별도 dead-man's-switch alert은 *이번 슬라이스에 도입하지 않는다*(외부 ping 의존). follow-up.
- **Alertmanager 컨테이너 down**: Prometheus alert 전송 실패 → Prometheus 내부 `notifications_failed_total` counter 증가. 본 슬라이스에서는 sniff하지 않음 — follow-up(meta-alert).
- **SMTP 자격증명 만료/오류**: Alertmanager 로그에 `failed to send email`. operator inbox에는 안 옴. systemd journald에 alertmanager 로그 보존(이미 OCI compose의 journald 정책). follow-up 후보: SMTP 실패 시 *fallback* 로컬 파일 sink.
- **Prometheus retention 채워짐**: 30일 도달 시 자동 삭제. host volume 용량 모니터링은 follow-up. 초기 size budget: 30일 × 30s scrape × ~500 series ≈ < 1GB (Prometheus TSDB 압축 기준).
- **scrape 실패**: app actuator unreachable → `up{job="readmates-server"} == 0`. 본 슬라이스의 alert 룰 중 `RedisDown`/`PrometheusTargetDown` 패턴은 *최소 1개*는 추가한다(`readmates-rules.yml`에 `targets-down` 그룹 신설).

## Data Flow

1. Spring app이 actuator/prometheus 엔드포인트로 metric을 노출 (이미 동작 중).
2. Prometheus가 docker network 안에서 30초 주기로 scrape.
3. rule 파일이 로드되어 매 30초 평가. 임계 hit → pending alert 생성, `for:` 경과 → firing.
4. firing alert → Alertmanager 전달.
5. Alertmanager가 severity 기반 routing → SMTP receiver → 운영자 inbox.
6. 회복 시 `send_resolved: true`로 resolved 이메일 전달.

## Testing Strategy

- **Unit**:
  - `SloCatalogDocsConsistencyTest` (신규) — yaml id가 docs에 등장, objective/window 일치.
  - `ReadmatesOperationalMetricsTest`(기존) 확장 — `delivery.latency` histogram 기록 확인.
  - `AiGenerationQueueDepthGaugeBinderTest`(신규) — gauge가 redis job count를 반환.
- **Integration**:
  - actuator smoke (기존) — `/actuator/prometheus`가 신규 metric 이름을 노출.
  - `JdbcNotificationEventOutboxAdapterTest`(기존) 확장 — PUBLISHED 전이 시 timer 기록.
- **Architecture (ArchUnit)**:
  - 신규 metric이 PII-safe tag policy를 위반하지 않는지(`ReadmatesOperationalMetrics`에 추가하는 만큼 기존 정책 자동 적용 — 별도 테스트 불요).
- **Config validation (스크립트)**:
  - `scripts/validate-prometheus-config.sh`(신규) — `promtool check config` + `promtool check rules`를 `ops/prometheus/alerts/*.yml` 전체에 실행. CI에서 호출 가능하도록 docker-based.
  - `scripts/validate-alertmanager-config.sh`(신규) — `amtool check-config`.
  - 위 두 스크립트는 `scripts/pre-push-check.sh`의 `--full` 모드에 옵션 추가.
- **Public release scan**:
  - `scripts/public-release-check.sh` 신규 규칙: `deploy/oci/{prometheus,alertmanager}/`와 `ops/prometheus/alerts/`에 placeholder가 아닌 이메일/SMTP host/IP가 들어가면 fail.
- **수동 검증** (operational runbook 기반):
  - OCI VM에서 `compose up`, `/actuator/prometheus`가 200, prometheus targets healthy, alertmanager가 test alert 수신 시 SMTP 발송.

## Rollout

1. PR 1 (이 슬라이스): server 코드(neighborhood 1, 2), config 파일(prometheus·alertmanager), rules 파일 신규, docs 갱신, scripts 신규, test 신규.
2. Merge 후 환경 변수 6개를 OCI 환경에 주입(README/runbook에 명시).
3. 운영자가 `observability-bootstrap.md` runbook에 따라 `compose up -d prometheus alertmanager` 1회 실행.
4. 1주 후 첫 SLO 측정치를 `docs/operations/slo-reports/2026-06.md`에 기록(`slo-monthly-report.md` 절차).
5. 운영 부담/오탐 trend 보고 alert threshold 1회 재조정(별도 PR — out of scope of this slice).

### Rollback

- `prometheus`/`alertmanager` 서비스만 stop. 앱 동작에 영향 0(actuator는 항상 노출되어 있고 누구든 scrape하지 않을 뿐).
- 신규 metric(`delivery.latency`, `queue.depth` real wiring)은 정상 동작 중에도 무해 — Prometheus 없어도 Micrometer registry에만 머무름.
- env 변수 미설정 시 alertmanager 컨테이너가 start 실패하므로, env 부재가 정상 운영을 깨트리지 않도록 compose에 `restart: on-failure:3` (무한 재시작 금지).

## CHANGELOG (Unreleased Engineering)

```
- **observability:** wire Prometheus + Alertmanager into OCI compose with SMTP routing.
  Adds `deploy/oci/prometheus/`, `deploy/oci/alertmanager/`, rule files mirroring
  `docs/operations/observability/alerts.md`. Introduces `readmates.notifications.delivery.latency`
  histogram at the outbox PUBLISHED transition and wires `readmates.aigen.queue.depth`
  to the Redis job store. Reconciles `slos.yaml` as SSOT with `slos.md` enforced
  by `SloCatalogDocsConsistencyTest`. Adds `observability-bootstrap` and
  `slo-monthly-report` runbooks.
```

## 후속 (이 슬라이스 밖)

- 자동 post-mortem trigger (alertmanager webhook → script).
- Dead-man's-switch + Prometheus self-monitoring (`notifications_failed_total` watch).
- SMTP 실패 시 로컬 파일 sink fallback.
- AI gen queue depth를 Kafka consumer lag 기반으로 보강(현재는 Redis job count로 충분).
- SLO 월간 리포트 자동 생성 스크립트.
- Frontend SLO(RUM 도입 후).

## 결정 로그 (이 spec 내 결정)

| ID | 결정 | 이유 |
|----|------|------|
| D1 | scope = O-β (Prometheus + Alertmanager, Grafana 보류) | Grafana는 슬라이스 H의 `/admin/health`와 영역 중복. 자재(JSON)는 git 보관만. |
| D2 | alert receiver = SMTP 단일 채널, env 주입 | 기존 SMTP 인프라 재사용, 외부 의존 0, public-repo 안전. |
| D3 | SLO SSOT = `slos.yaml` | 코드가 로드 → drift fail-fast 가능. docs는 view. |
| D4 | AI gen queue depth = Redis job state count | 실제 queue는 Redis job state. Kafka AdminClient 신규 의존 회피. |
| D5 | Prometheus retention = 30일 | 가장 긴 SLO window와 일치. |
| D6 | external port publish 없음 | actuator/prometheus/alertmanager 모두 docker network 내부. 운영자 접근은 SSH tunnel. |
| D7 | severity 단일 receiver + 분기 routing | inbox는 하나, group_wait/repeat만 분리. critical이 warning에 묻히지 않음. |
