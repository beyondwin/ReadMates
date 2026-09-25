# OCI 백엔드 배포

OCI backend는 Docker Compose stack으로 운영합니다. systemd(`readmates-stack`)가 compose를 관리하고, compose 안의 Caddy가 HTTPS를 받아 Spring API container로 넘깁니다. 예전 Spring Boot JAR + host Caddy 경로는 전환 검증과 rollback 전용입니다.

관련 문서: [README.md](README.md), [compose-stack.md](compose-stack.md)(배포·rollback 절차), [cloudflare-pages.md](cloudflare-pages.md), [multi-club-domains.md](multi-club-domains.md). 2026-04-30 Compose 전환 사건 기록은 [OCI Compose Cutover 보고서](../reports/2026-04-30-oci-compose-cutover.md)에 있습니다.

완료 기준: compose stack이 새 image로 뜨고, Flyway 결과, `/internal/health`, BFF smoke, OAuth start smoke가 변경 범위에 맞게 확인됩니다. migration, 알림, 메일, Object Storage backup을 건드렸다면 해당 섹션의 확인도 합니다.

운영 진단은 read-only diagnostics collector부터 씁니다: [Read-only Diagnostics](../operations/runbooks/read-only-diagnostics.md). 출력 전문은 Git에 넣지 않고 health/log/error count 같은 요약만 남깁니다.

VM IP, SSH key 경로, DB host, SMTP credential, OCI resource id, smoke 결과 전문은 Git에 남기지 않습니다.

## Health check contract

| 종류 | 요청 | 쓰는 곳 |
| --- | --- | --- |
| liveness | `GET :8080/internal/health` → `{ "status": "UP", "kind": "liveness" }` | compose `readmates-api` healthcheck(`/app/bin/readmates-http-get 127.0.0.1 8080 /internal/health`), `05` script health 단계 |
| readiness | `GET :8081/actuator/health/readiness` | 수동 진단용. DB/Redis 등 의존성 상태를 봅니다. |

- liveness는 process가 살아 있으면 항상 UP입니다.
- 8081 management port는 compose 안에서만 열리고 host에 publish하지 않습니다. Caddy도 8080만 proxy합니다.

## 런타임 기준

| 항목 | 값 |
| --- | --- |
| 작업 디렉터리 | `/opt/readmates` |
| Compose 파일 | `/opt/readmates/compose.yml` |
| Compose image env | `/opt/readmates/.env` (`READMATES_SERVER_IMAGE`) |
| Spring 환경 파일 | `/etc/readmates/readmates.env` |
| Caddy 환경 파일 | `/etc/readmates/caddy.env` (`CADDY_SITE`) |
| systemd 서비스 | `readmates-stack` |
| Container 헬스체크 | `http://127.0.0.1:8080/internal/health` |
| Legacy JAR 경로 | `/opt/readmates/readmates-server.jar` |

## Docker Compose Stack

배포 절차는 [compose-stack.md](compose-stack.md)가 기준입니다.

- 운영 image는 release tag와 같은 tag로 GHCR에 게시합니다: `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z`. 운영 VM에서 image를 다시 빌드하지 않습니다.
- `server/Dockerfile.release`: `Deploy Server Image`가 `clean check bootJar`를 통과한 jar로 image를 만듭니다. scan한 digest가 CI에서 검증된 jar와 같게 하기 위해서입니다.
- `server/Dockerfile`: 로컬에서 만든 `bootJar`를 포장합니다(전환 검증용).
- 두 Dockerfile의 runtime 설정(Java 25, native access 허용 범위 등)은 서로 맞아야 합니다.

배포 순서:

1. `04-install-docker.sh`로 VM Docker를 준비합니다(최초 1회).
2. 서버 테스트를 통과시키고, 릴리즈라면 `Deploy Server Image` 성공을 확인합니다.
3. 최근 2일 안의 DB backup이 있는지 확인합니다.
4. migration이 있으면 `server/src/main/resources/db/mysql/migration` diff와 호환성을 확인합니다. 별도 migration job은 없고 Spring 시작 시 Flyway가 적용합니다. Flyway가 실패한 container는 승격하지 않습니다.
5. `05-deploy-compose-stack.sh`를 실행합니다. legacy host 서비스는 script가 중지합니다.
6. Flyway history, `/internal/health`, BFF auth smoke, OAuth redirect smoke를 확인합니다.
7. Redis flag를 단계적으로 켭니다. Kafka/알림 flag는 Redis가 안정된 뒤 따로 켭니다.

## 운영 환경 변수

`/etc/readmates/readmates.env`는 `sync-config` workflow가 GitHub Secrets/Variables로 렌더링합니다. 렌더링되는 키 목록과 추가/회전 절차는 [secrets management runbook](../operations/runbooks/secrets-management.md)이 기준입니다. 아래는 주요 키와 placeholder 예시입니다.

```bash
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://app.example.com
READMATES_AUTH_BASE_URL=https://app.example.com
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://app.example.com
READMATES_BFF_SECRET=<shared-bff-secret>
# 무중단 rotation 중에만 설정. 있으면 READMATES_BFF_SECRET보다 우선합니다.
READMATES_BFF_SECRETS=<new-secret>,<old-secret>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
READMATES_IP_HASH_BASE_SECRET=<openssl rand -base64 32으로 생성>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
# 알림
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_NOTIFICATION_SENDER_NAME=ReadMates
READMATES_NOTIFICATION_SENDER_EMAIL=no-reply@example.com
READMATES_KAFKA_ENABLED=true
READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE=50
READMATES_KAFKA_NOTIFICATION_MAX_PUBLISH_ATTEMPTS=5
READMATES_KAFKA_NOTIFICATION_SEND_TIMEOUT=10s
READMATES_NOTIFICATION_RETRY_DELAY_MINUTES=5,15,60,240
READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS=5
READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS=30s
READMATES_NOTIFICATION_CLAIM_LEASE=15m
READMATES_NOTIFICATION_EVENT_MAX_AGE=24h
READMATES_NOTIFICATION_DELIVERY_MAX_AGE=24h
READMATES_NOTIFICATION_BACKLOG_REFRESH_INTERVAL=60s
READMATES_NOTIFICATION_BACKLOG_INITIAL_DELAY=5s
READMATES_NOTIFICATION_ADMIN_REPLAY_PREVIEW_TTL=10m
READMATES_NOTIFICATION_ADMIN_REPLAY_MAX_TARGETS=1000
# 메일 (OCI Email Delivery)
SPRING_MAIL_HOST=smtp.email.<oci-region>.oci.oraclecloud.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<oci-smtp-username>
SPRING_MAIL_PASSWORD=<oci-smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT=5000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_TIMEOUT=5000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_WRITETIMEOUT=5000
```

- Compose가 container에 직접 주입하는 값: `READMATES_REDIS_URL=redis://redis:6379`, `READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092`, `READMATES_OTLP_TRACES_ENDPOINT=http://tempo:4318/v1/traces`, `READMATES_MANAGEMENT_ADDRESS=0.0.0.0`, `READMATES_MANAGEMENT_PORT=8081`.
- 알림 topic/consumer group은 기본값(`readmates.notification.events.v1`, `readmates.notification.events.dlq.v1`, `readmates-notification-dispatcher`)을 씁니다. 바꿀 때만 `READMATES_KAFKA_NOTIFICATION_*` 키를 추가합니다.
- `READMATES_SECURITY_BFF_AUDIT_MODE`는 기본 `rotation-only`입니다([BFF Secret Audit Volume](#bff-secret-audit-volume)).
- AI 세션 생성 키(`READMATES_AIGEN_*`)는 [AI session generation runbook](../operations/runbooks/ai-session-generation.md)을 따릅니다.

## Legacy Host VM 설정

legacy JAR + host Caddy 경로를 유지하거나 rollback 기준을 만들 때만 씁니다. 새 VM은 [compose-stack.md](compose-stack.md#first-setup)를 따릅니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/01-vm-setup.sh
```

패키지를 업데이트하고 Temurin Java 25 runtime, Caddy, `jq`를 설치하며 `readmates` 사용자와 `/opt/readmates`, `/etc/readmates`를 만듭니다.

## 운영 설정 적용

`02-configure.sh`는 legacy host Caddy용 VM 인프라를 1회 세팅합니다. 운영 secret은 만들지 않습니다.

```bash
CADDY_SITE='api.example.com' \
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/02-configure.sh
```

하는 일:

- `CADDY_SITE`가 `:80`, `http://...`면 거절합니다. HTTPS host여야 합니다.
- `/etc/readmates`(권한 `750`)와 `/opt/readmates`를 만들고, `deploy` 사용자가 있으면 소유자로 둡니다.
- `readmates.env`가 없으면 `sync-config`를 먼저 실행하라고 안내합니다.
- host Caddy를 `${CADDY_SITE} -> 127.0.0.1:8080`으로 설정하고 재시작합니다.

파일별 책임:

- `/etc/readmates/readmates.env`: `sync-config` workflow가 만듭니다. deploy key 준비는 [VM deploy key bootstrap](../operations/runbooks/vm-deploy-key-bootstrap.md)을 봅니다.
- `/etc/readmates/caddy.env`, `/opt/readmates/.env`: `05-deploy-compose-stack.sh`가 만듭니다.

알림, 메일, AI 생성, BFF secret 등 env 값을 바꾸는 배포:

1. GitHub Secrets/Variables를 고칩니다.
2. `sync-config`를 실행합니다. 바로 적용하려면 `restart_api=true`, 다음 image promotion 때 적용하려면 `restart_api=false`.
3. `restart_api=false`였다면 promotion이나 수동 재시작 때 `readmates-api`가 새 값을 읽습니다.

## Redis and Kafka Rollout

Redis(cache/rate limit)와 Redpanda(Kafka 호환 알림 fan-out)는 Spring API와 같은 compose stack에서 돕니다. MySQL을 대체하지 않습니다. `deploy/oci/compose.infra.yml`은 같은 Compose project에 붙는 보조 파일로, 전환용 Redis/Redpanda와 관측 서비스(Prometheus, Tempo, Alertmanager, Grafana)를 정의합니다. 관측 stack은 `06-deploy-observability-stack.sh`로 올립니다.

- `6379`, `9092`는 host에 publish하지 않고, OCI security list나 firewall에서도 열지 않습니다.
- 첫 전환이나 새 flag rollout 때는 모두 끈 상태로 Flyway와 기존 smoke를 먼저 통과시킵니다.

  ```bash
  READMATES_REDIS_ENABLED=false
  READMATES_RATE_LIMIT_ENABLED=false
  READMATES_AUTH_SESSION_CACHE_ENABLED=false
  READMATES_PUBLIC_CACHE_ENABLED=false
  READMATES_NOTES_CACHE_ENABLED=false
  READMATES_NOTIFICATIONS_ENABLED=false
  READMATES_KAFKA_ENABLED=false
  ```

- Redis는 [README.md](README.md#redis-feature-flags)의 순서대로 켭니다. 문제가 생기면 해당 flag만 끄고, 반복되면 `READMATES_REDIS_ENABLED=false`로 MySQL-only 동작으로 돌아갑니다.
- Kafka 알림은 Redis와 따로 켭니다: `READMATES_NOTIFICATIONS_ENABLED=true`, `READMATES_KAFKA_ENABLED=true`.
- 둘 중 하나라도 `false`면 relay/consumer가 뜨지 않습니다. 그래도 도메인 이벤트는 `notification_event_outbox`에 쌓일 수 있으니, 켜기 전에 pending row 수를 보고 켠 뒤 처리 결과를 확인합니다.
- 실제 이메일 발송까지 켤 때만 SMTP 값을 넣습니다.

## Multi-club Origin and OAuth Settings

| 변수 | 운영 기준 |
| --- | --- |
| `READMATES_APP_BASE_URL` | 기본 앱 origin. primary domain이 없으면 Pages 운영 origin을 씁니다. |
| `READMATES_AUTH_BASE_URL` | Google OAuth `redirect_uri`의 origin. fallback-only면 `READMATES_APP_BASE_URL`과 같게, primary domain이 있으면 `https://<primary-domain>`. |
| `READMATES_AUTH_RETURN_STATE_SECRET` | OAuth return target 서명 secret. 짧은 샘플 값을 쓰지 않습니다. |
| `READMATES_ALLOWED_ORIGINS` | 변경 요청 `Origin`/`Referer`의 정적 허용 목록. |
| `READMATES_AUTH_SESSION_COOKIE_DOMAIN` | subdomain 간 세션 공유가 필요할 때만 설정합니다. |

- 허용 origin은 정적 목록 + DB의 `ACTIVE` club domain(60초 캐시)입니다. 새 club host는 `ACTIVE`가 되면 재시작 없이 1분 안에 반영됩니다. 정적 목록을 바꿀 때만 `sync-config`와 재시작이 필요합니다. 자세한 순서는 [multi-club-domains.md](multi-club-domains.md#allowed-origins)입니다.
- Google OAuth client에는 `READMATES_AUTH_BASE_URL`의 `/login/oauth2/code/google`을 등록합니다. Pages fallback origin으로도 로그인을 받는다면 그 callback도 유지합니다.
- 새 club host를 넣은 뒤에는 `scripts/smoke-production-integrations.sh`로 Pages marker와 `redirect_uri`를 확인합니다.

## Emergency support access flow

플랫폼 관리자가 특정 클럽에 임시로 호스트 지원 권한을 받아야 할 때(고객 에스컬레이션 등) 씁니다.

### 권한 생성

플랫폼 관리 화면 `/admin/support`에서 만듭니다.

1. 이름 또는 이메일로 지원 대상을 검색하고 선택합니다.
2. 위험 요약을 확인하고 사유(프리셋 또는 직접 입력)와 만료 시각을 넣습니다.
3. `발급`을 누릅니다. 현재 역할에 발급 권한이 없으면 버튼이 막힙니다.

직접 API로 만들 때는 아래처럼 호출합니다.

```bash
curl -X POST https://<api-origin>/api/admin/support-access-grants \
  -H 'Content-Type: application/json' \
  -b '<session-cookie>' \
  -d '{
    "clubId": "<club-uuid>",
    "granteeUserId": "<grantee-user-uuid>",
    "scope": "HOST_SUPPORT_READ",
    "reason": "고객 에스컬레이션 티켓 #1234",
    "expiresAt": "2026-05-09T13:00:00Z"
  }'
```

### 권한 취소

```bash
curl -X DELETE https://<api-origin>/api/admin/support-access-grants/<grant-uuid> \
  -b '<session-cookie>'
```

`/admin/support`의 grant ledger에서 `ACTIVE` 항목의 "권한 취소" 버튼으로도 취소합니다.

### 활성 권한 조회

```bash
# club 기준
curl "https://<api-origin>/api/admin/support-access-grants?clubId=<club-uuid>" -b '<session-cookie>'

# grantee 기준
curl "https://<api-origin>/api/admin/support-access-grants?granteeUserId=<user-uuid>" -b '<session-cookie>'
```

### 감사 로그 확인

생성과 취소는 `platform_audit_events`에 기록됩니다.

```sql
SELECT actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at
FROM platform_audit_events
WHERE event_type IN ('SUPPORT_ACCESS_GRANT_CREATED', 'SUPPORT_ACCESS_GRANT_REVOKED')
ORDER BY created_at DESC
LIMIT 20;
```

### 주의사항

- 권한은 만료(`expires_at`)나 취소(`revoked_at`) 시 자동으로 꺼집니다.
- 필요 없어진 권한은 바로 취소하고, 활성 목록을 정기적으로 확인합니다.

## Legacy JAR Rollback

compose 전환 전 검증이나 rollback 전용입니다. 정상 배포는 `05-deploy-compose-stack.sh`입니다.

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

- 기본 SSH key는 `~/.ssh/readmates_oci`이고 `SSH_KEY`로 바꿀 수 있습니다.
- `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar`를 VM의 `/opt/readmates/readmates-server.jar`로 옮기고 `readmates-server`를 재시작합니다. 이 systemd unit은 저장소에 없으므로 VM에 남아 있어야 합니다.
- 전체 되돌리기 순서는 [compose-stack.md](compose-stack.md#rollback)를 봅니다.

## Email Notification Operations

### 흐름

```text
도메인 이벤트 → MySQL notification_event_outbox (source of truth)
  → relay scheduler → Kafka topic readmates.notification.events.v1
  → consumer: 수신자 계산 + 멤버 선호도 적용
  → notification_deliveries (EMAIL, SMTP 재시도 대상) + member_notifications (in-app)
```

이메일은 서버 템플릿 helper가 subject, plain text, HTML, CTA/deep link를 함께 만들고, SMTP adapter는 HTML이 있으면 plain text fallback을 포함한 MIME 메시지로 보냅니다.

동작 조건(모두 필요): `READMATES_NOTIFICATIONS_ENABLED=true`, `READMATES_KAFKA_ENABLED=true`, Kafka bootstrap server, `SPRING_MAIL_HOST`/`USERNAME`/`PASSWORD`, `READMATES_NOTIFICATION_SENDER_EMAIL`. 처음 켤 때는 `false`로 두고 outbox row 생성을 확인한 뒤 켭니다.

### 알림이 만들어지는 때

- 호스트가 `/app/host/notifications` 또는 콘텐츠 변경 직후 열린 composer에서 발송을 확정할 때: `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`, `SESSION_RECORD_UPDATED`.
- 클럽의 `sessionReminderEnabled`를 호스트가 켰을 때만 daily scheduler가 `SESSION_REMINDER_DUE`를 만듭니다(기본 꺼짐, 같은 날짜 재실행은 dedupe).
- 멤버가 발행된 공개 회차에 공개 서평을 저장할 때: `REVIEW_PUBLISHED`(멤버 opt-in).
- 다음 책 공개 범위 변경, 피드백 문서·세션 기록의 final live apply, 외부 JSON import, AI commit은 알림을 자동으로 만들지 않습니다.

멤버 선호도 기본값: 운영 알림 4종은 켜짐(`FEEDBACK_DOCUMENT_PUBLISHED`와 `SESSION_RECORD_UPDATED`는 같은 선호도 공유), `REVIEW_PUBLISHED`는 꺼짐.

### 처리 기준

| 단계 | 기본값 |
| --- | --- |
| relay 주기 | 30초(`READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS`), 한 번에 50건 |
| relay 결과 | 성공 `PUBLISHED`, 실패 `FAILED` → 최대 5회 publish |
| delivery 상태 | `PENDING`, `SENDING`, `SENT`, `FAILED`, `DEAD`, `SKIPPED`, 최대 5회 |
| 재시도 간격 | 5, 15, 60, 240분 (relay와 delivery 공유) |
| 최대 수명 | event 24h, delivery 24h (횟수와 수명 중 먼저 닿는 쪽에서 종료) |

in-app delivery는 `member_notifications` row를 만든 뒤 `SENT`가 됩니다.

### 수동 처리

원칙: 원인을 먼저 없애고, 정확한 대상 evidence가 있을 때만 실행합니다. DB row를 직접 고치지 않습니다.

- Relay 장애: `readmates_outbox_publish_total`, outbox `pending|failed|dead|publishing`, `attempt_count`, `next_attempt_at`, `locked_at`, `last_error`, `created_at`을 봅니다. event 만료는 `created_at + READMATES_NOTIFICATION_EVENT_MAX_AGE`(같으면 만료)입니다. relay 원인이 남아 있는 동안 delivery replay나 새 event로 복구하지 않습니다.
- SMTP 장애: delivery `pending|failed|dead|sending`과 provider/recipient 수락 evidence를 봅니다. delivery 만료는 `created_at + READMATES_NOTIFICATION_DELIVERY_MAX_AGE`, 오래된 lease는 `locked_at + READMATES_NOTIFICATION_CLAIM_LEASE`로 판단합니다. `next_attempt_at`은 만료 시각이 아닙니다.
- 호스트 대시보드의 pending/failed/dead/sentLast24h가 relay와 delivery 중 어느 단계인지 ledger로 확정합니다.
- `DEAD` EMAIL delivery 한 건 복구: 호스트가 `/app/host/notifications`에서 `POST /api/host/notifications/items/{id}/restore`를 실행합니다. 해당 delivery를 `PENDING`으로 되돌리고 새 event는 만들지 않습니다. `AMBIGUOUS`는 미수락이 확인되지 않으면 복구하지 않습니다.
- Composer preview/confirm은 새 event를 만드는 발송이지 복구가 아닙니다. 기본 대상은 `NEXT_BOOK_PUBLISHED`·`SESSION_REMINDER_DUE`는 `ALL_ACTIVE_MEMBERS`, `FEEDBACK_DOCUMENT_PUBLISHED`·`SESSION_RECORD_UPDATED`는 `CONFIRMED_ATTENDEES`, 채널은 `BOTH`입니다. preview는 `contentRevision`과 함께 10분 저장되고, stale revision이나 최근 같은 발송은 재확인을 요구합니다.
- Platform admin replay(OWNER/OPERATOR): `EMAIL` + `FAILED|DEAD` + `MAIL_RETRYABLE|MAIL_PERMANENT` delivery만, preview snapshot과 selection hash로 고정해 최대 1,000건(설정 `1..5000`) 되돌립니다. confirm 시 snapshot 이후 바뀐 대상이나 lease가 있는 대상은 건너뛰고, 새 event는 만들지 않습니다. 같은 actor/hash 재시도는 저장된 receipt를 돌려줍니다. `MAIL_AMBIGUOUS`는 제외합니다.
- SMTP 수락 뒤 `SENT` 기록 전에 중단되면 lease 회수 후 중복 발송될 수 있습니다(at-least-once).
- 호스트 테스트 메일은 별도 문구를 쓰고 CTA가 없으며, audit에는 마스킹된 수신자와 hash만 남깁니다.

Host 알림 detail API는 subject, masked recipient, deep link, 상태만 보여주고 이메일 본문은 내보내지 않습니다. 수동 발송 원장은 `notification_manual_dispatch_previews`, `notification_manual_dispatches`입니다.

## 검증

VM 안:

```bash
sudo systemctl status readmates-stack --no-pager
cd /opt/readmates
sudo docker compose -f compose.yml ps
sudo docker compose -f compose.yml logs --tail=120 readmates-api
sudo docker compose -f compose.yml exec -T readmates-api /app/bin/readmates-http-get 127.0.0.1 8080 /internal/health
```

Cloudflare 경유:

```bash
APP_ORIGIN='https://app.example.com'
CLUB_SLUG='{club-slug}'
curl -sS "$APP_ORIGIN/api/bff/api/auth/me"
curl -sS "$APP_ORIGIN/api/bff/api/public/clubs/${CLUB_SLUG}"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP_ORIGIN/oauth2/authorization/google"
```

Metrics(알림 처리 뒤에 `readmates_notifications` meter가 보입니다):

```bash
cd /opt/readmates
sudo docker compose -f compose.yml exec -T readmates-api /app/bin/readmates-http-get 127.0.0.1 8081 /actuator/prometheus | grep readmates_notifications
```

Operations pipeline live smoke(Object Storage 임시 object 업로드/삭제):

```bash
READMATES_EXPORT_BUCKET=readmates-db-exports \
READMATES_OBJECT_STORAGE_SMOKE_WRITE=true \
/opt/readmates/deploy/oci/verify-operations-pipeline-live.sh
```

실제 SMTP 발송까지 볼 때만 `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, `READMATES_NOTIFICATION_SENDER_EMAIL`, `READMATES_SMTP_SMOKE_TO`를 넣어 같은 script를 실행합니다. `READMATES_SMTP_SMOKE_TO`는 운영자가 관리하는 테스트 주소만 씁니다.

## 운영 메모

- `prod` profile에서는 `READMATES_BFF_SECRET_REQUIRED=true`가 기준입니다. BFF secret이 모두 비면 시작에 실패합니다.
- SMTP credential과 sender 값은 `/etc/readmates/readmates.env`에만 둡니다.
- Flyway는 Spring 시작 시 `classpath:db/mysql/migration`을 적용합니다. 배포 전 diff는 `server/src/main/resources/db/mysql/migration`만 봅니다.
- 이미 적용된 migration 파일은 고치지 않습니다(forward-only, downgrade 없음). 호환이 깨지면 schema를 보존한 호환 image나 새 forward-fix tag로 복구합니다.
- `readmates.host-action-confirmation.required`는 staged session-record 기능 노출만 제어하고, 알림 발송 여부는 제어하지 않습니다.
- Release image는 `Deploy Server Image`가 만들고, OCI promotion은 운영자가 `05-deploy-compose-stack.sh`로 직접 합니다.
- Compose Caddy 로그는 container stdout으로 봅니다(legacy host Caddy는 `/var/log/caddy/readmates.log`). 로그에는 request URI, `Authorization`, `Cookie`, `X-Readmates-Bff-Secret`을 남기지 않습니다.

### BFF Secret Rotation

`READMATES_BFF_SECRETS`에 쉼표 구분 목록을 넣으면 중단 없이 BFF secret을 바꿀 수 있습니다. 서버는 목록의 모든 값을 timing-safe로 검증합니다. Spring 목록 변경에는 재시작, Pages primary 변경에는 Pages 재배포가 필요합니다.

1. GitHub Secrets `READMATES_BFF_SECRETS`를 `<new-secret>,<old-secret>`으로 바꾸고 `sync-config`를 `restart_api=true`로 실행합니다. 자세한 절차는 [secrets management runbook](../operations/runbooks/secrets-management.md)입니다.
2. Cloudflare Pages에도 `READMATES_BFF_SECRETS=<new-secret>,<old-secret>`을 설정하고 재배포합니다.
3. `/api/bff/api/auth/me` smoke로 확인합니다.
4. old-secret 트래픽이 0이 됐는지 봅니다. `/api/bff/__internal/secret-status`도 참고합니다.

   ```sql
   SELECT secret_alias, COUNT(*) AS cnt, MAX(used_at) AS last_seen
   FROM bff_secret_rotation_audit
   WHERE used_at > NOW() - INTERVAL 10 MINUTE
   GROUP BY secret_alias
   ORDER BY last_seen DESC;
   ```

5. GitHub Secrets에서 old secret을 빼고(`READMATES_BFF_SECRETS=<new-secret>` 또는 `READMATES_BFF_SECRET`만) `sync-config`를 다시 실행합니다. Pages도 같은 값으로 맞춥니다.

`READMATES_BFF_SECRETS`가 있으면 `READMATES_BFF_SECRET`은 fallback으로만 쓰입니다.

### BFF Secret Audit Volume

`READMATES_SECURITY_BFF_AUDIT_MODE`(`readmates.security.bff.audit-mode`)는 성공한 BFF 요청을 audit table에 얼마나 남길지 정합니다.

| 값 | 의미 |
| --- | --- |
| `rotation-only` (기본) | non-primary alias(`secondary`, `index_N`) 사용만 기록합니다. 평소 적재량은 거의 0입니다. |
| `all` | 짧은 incident 기간에만 씁니다. |
| `off` | DB 부담이 크고 다른 로그로 확인 가능할 때만 임시로 씁니다. |

보관 기간은 DB 예약 작업으로 관리할 수 있습니다.

```sql
delete from bff_secret_rotation_audit
where used_at < utc_timestamp() - interval 30 day;
```

### IP hash base secret

`READMATES_IP_HASH_BASE_SECRET`은 client IP hash의 주간 salt rotation에 쓰는 base secret입니다. 한 번 만들면 수동 회전 대상이 아닙니다.

1. `openssl rand -base64 32`로 만듭니다.
2. Git 밖 비밀 저장소에 보관하고 GitHub Secrets `READMATES_IP_HASH_BASE_SECRET`에 등록합니다.
3. `sync-config`로 `/etc/readmates/readmates.env`에 반영합니다.

active profile이 없거나 `production`을 포함하는 production 계열 환경에서 값이 비면 시작에 실패합니다. 다른 profile도 기본은 실패이고, `readmates.security.ip-hash.allow-empty-secret=true`를 명시했을 때만 WARN과 함께 시작합니다.

## Notification runtime contract

- 기본값: Kafka send timeout `10s`, claim lease `15m`, event/delivery max age `24h`, SMTP connection/read/write timeout 각 `5s`.
- 시작 시 모든 값과 retry schedule을 검증합니다. claim lease가 `24h`를 넘거나, event/delivery max age보다 짧지 않거나, Kafka timeout + SMTP timeout 합계보다 길지 않으면 시작에 실패합니다.
- 관리자 replay: preview TTL `10m`(허용 `1m..1h`), 대상 상한 `1000`(허용 `1..5000`). 잘못된 값은 서버 시작을 실패시킵니다. 상한을 넘는 preview는 저장하지 않으니 범위를 좁혀 다시 요청합니다.
