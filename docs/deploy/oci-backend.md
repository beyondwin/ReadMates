# OCI 백엔드 배포

백엔드의 최종 OCI Always Free runtime은 Docker Compose stack입니다. systemd가 compose stack을 관리하고, stack 안의 Caddy가 운영 HTTPS endpoint를 받아 internal Spring Boot API container로 reverse proxy합니다. 기존 Spring Boot JAR + host Caddy 경로는 compose cutover 전 단계와 rollback 전용으로 유지합니다.

상위 배포 허브는 [README.md](README.md)입니다. Cloudflare Pages와 Pages Functions 설정은 [cloudflare-pages.md](cloudflare-pages.md)를 함께 확인합니다. 멀티 클럽 domain alias와 OAuth origin 운영은 [multi-club-domains.md](multi-club-domains.md)를 기준으로 맞춥니다.

2026-04-30 Compose cutover와 BFF secret 처리 이슈의 사건 기록은 [OCI Compose Cutover 배포 보고서](2026-04-30-oci-compose-cutover-deployment-report.md)에 남겨 두며, 반복 가능한 현재 절차는 이 문서와 [compose-stack.md](compose-stack.md)를 기준으로 합니다.

백엔드 배포는 compose stack이 새 image로 실행되고, Flyway 결과와 `/internal/health`, Cloudflare BFF smoke, OAuth start smoke가 변경 범위에 맞게 확인됐을 때 완료입니다. DB migration, notification pipeline, mail delivery, Object Storage backup을 건드린 경우에는 해당 섹션의 targeted smoke도 함께 확인합니다.

VM IP, SSH key path, private DB host, SMTP credential, OCI resource identifiers, 운영 smoke 결과 전문은 Git에 남기지 않습니다. 실제 provider 설정이나 비용 관련 판단은 현재 OCI/Cloudflare/Google 콘솔을 확인한 뒤 실행합니다.

## 런타임 기준

| 항목 | 값 |
| --- | --- |
| 서비스 사용자 | `readmates` |
| 작업 디렉터리 | `/opt/readmates` |
| Compose 파일 | `/opt/readmates/compose.yml` |
| Compose image env | `/opt/readmates/.env` |
| Spring 환경 파일 | `/etc/readmates/readmates.env` |
| Caddy 환경 파일 | `/etc/readmates/caddy.env` |
| systemd 서비스 | `readmates-stack` |
| Container 헬스체크 | `http://127.0.0.1:8080/internal/health` |
| Legacy JAR 경로 | `/opt/readmates/readmates-server.jar` |

## Docker Compose Stack

Caddy 포함 최종 backend runtime은 [compose-stack.md](compose-stack.md)를 기준으로 운영합니다. 기존 JAR + host Caddy 방식은 compose cutover 전 단계와 rollback 경로로 유지합니다.

운영 전환 순서:

1. `04-install-docker.sh`로 VM Docker runtime을 준비합니다.
2. `bootJar`와 server test를 통과시킵니다.
3. DB backup을 만들고 최근 48시간 이내 파일이 Git 밖의 운영 backup 위치에 있음을 확인합니다.
4. `05-deploy-compose-stack.sh`로 image, compose file, Caddyfile, systemd unit을 배포합니다. 이 script는 compose 시작 전에 legacy host `readmates-server`와 host `caddy`를 중지하고 disable합니다.
5. `/internal/health`, BFF auth smoke, OAuth redirect smoke를 확인합니다.
6. Redis feature flag를 단계적으로 켭니다.
7. Kafka/notification flag는 Redis 안정화 뒤 별도 smoke로 켭니다.

## 운영 환경 변수

`/etc/readmates/readmates.env`에는 아래 값이 들어갑니다.

```bash
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}'
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-secret-as-cloudflare>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_NOTIFICATION_SENDER_NAME=ReadMates
READMATES_NOTIFICATION_SENDER_EMAIL=no-reply@example.com
READMATES_KAFKA_ENABLED=true
READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092
READMATES_KAFKA_NOTIFICATION_EVENTS_TOPIC=readmates.notification.events.v1
READMATES_KAFKA_NOTIFICATION_DLQ_TOPIC=readmates.notification.events.dlq.v1
READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP=readmates-notification-dispatcher
READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE=50
READMATES_KAFKA_NOTIFICATION_MAX_PUBLISH_ATTEMPTS=5
READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS=5
SPRING_MAIL_HOST=smtp.email.<oci-region>.oci.oraclecloud.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<oci-smtp-username>
SPRING_MAIL_PASSWORD=<oci-smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT=5000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_TIMEOUT=3000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_WRITETIMEOUT=5000
# Legacy host JAR rollback only. Compose stack overrides this to container-internal 0.0.0.0 and does not publish 8081.
READMATES_MANAGEMENT_ADDRESS=127.0.0.1
READMATES_MANAGEMENT_PORT=8081
```

Git에는 변수 이름과 placeholder만 둡니다. 프로덕션 secret 실제 값은 VM, Cloudflare, Google Cloud, OCI 콘솔, 또는 운영자가 관리하는 ignored 파일에만 둡니다. Compose stack은 `READMATES_REDIS_URL=redis://redis:6379`, `READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092`, `READMATES_MANAGEMENT_ADDRESS=0.0.0.0`을 container 환경으로 주입합니다.

## Legacy Host VM 설정

기존 JAR + host Caddy 배포를 유지하거나 rollback 기준을 만들 때 로컬에서 실행합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/01-vm-setup.sh
```

이 스크립트는 Ubuntu 패키지를 업데이트하고, Java 21 runtime과 Caddy를 설치하며, `readmates` 사용자와 `/opt/readmates`, `/etc/readmates` 디렉터리를 만듭니다. 신규 compose VM에서는 [compose-stack.md](compose-stack.md)의 Docker bootstrap을 우선합니다.

## 운영 설정 적용

로컬에서 secret을 환경 변수로 주입해 실행합니다.

```bash
APP_DB_PASS='<db-password>' \
BFF_SECRET='<same-secret-as-cloudflare>' \
MYSQL_PRIVATE_IP='<mysql-private-ip>' \
READMATES_APP_BASE_URL='https://readmates.pages.dev' \
READMATES_AUTH_BASE_URL='https://readmates.pages.dev' \
READMATES_AUTH_RETURN_STATE_SECRET='{return-state-signing-secret}' \
READMATES_ALLOWED_ORIGINS='https://readmates.pages.dev' \
CADDY_SITE='api.example.com' \
GOOGLE_CLIENT_ID='<google-oauth-client-id>' \
GOOGLE_CLIENT_SECRET='<google-oauth-client-secret>' \
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/02-configure.sh
```

`CADDY_SITE`는 `https://api.example.com` 같은 직접 API origin에 대응하는 운영 HTTPS host여야 합니다. `:80`, `http://...`, plaintext Spring origin은 사용할 수 없습니다.

`02-configure.sh`가 수행하는 일:

- `/etc/readmates/readmates.env` 생성, 권한 `600`
- `/etc/systemd/system/readmates-server.service` 등록
- `readmates-server` 서비스 enable
- Caddy reverse proxy 설정, `${CADDY_SITE} -> 127.0.0.1:8080`

`02-configure.sh`는 baseline OAuth, DB, BFF 값으로 `/etc/readmates/readmates.env`를 다시 생성합니다. Compose stack도 이 Spring env 파일을 읽습니다. 알림 발송을 켜는 배포에서는 실행 뒤 위 환경 변수 블록의 `READMATES_NOTIFICATIONS_ENABLED`, `READMATES_KAFKA_*`, `READMATES_NOTIFICATION_SENDER_*`, `READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS`, `SPRING_MAIL_*` 값을 같은 env 파일에 운영 값으로 추가하고 compose stack의 `readmates-api`를 재시작합니다.

## Redis and Kafka Rollout

최종 OCI Always Free stack은 Redis와 Redpanda를 Spring Boot API와 같은 Docker Compose stack에서 실행합니다. Redis는 MySQL을 대체하지 않는 cache/rate-limit 계층이고, Redpanda는 Kafka-compatible 알림 event outbox fan-out 계층입니다. `deploy/oci/compose.infra.yml`은 legacy host JAR 옆에서 Redis/Redpanda만 띄우는 전환용 helper로 남겨둡니다.

Compose 내부 endpoint:

```bash
READMATES_REDIS_URL=redis://redis:6379
READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092
```

OCI security list나 host firewall에서 `6379`, `9092`를 public internet에 열지 않습니다. 최종 compose stack에서는 두 포트를 host에 publish하지 않습니다.

초기 compose cutover나 새 기능 flag rollout에서는 아래처럼 모두 끈 상태로 Flyway와 기존 앱 smoke를 먼저 통과시킵니다.

```bash
READMATES_REDIS_ENABLED=false
READMATES_RATE_LIMIT_ENABLED=false
READMATES_AUTH_SESSION_CACHE_ENABLED=false
READMATES_PUBLIC_CACHE_ENABLED=false
READMATES_NOTES_CACHE_ENABLED=false
READMATES_NOTIFICATIONS_ENABLED=false
READMATES_KAFKA_ENABLED=false
```

Redis를 켤 때는 endpoint 접근성을 먼저 확인한 뒤 기능 flag를 단계적으로 켭니다.

```bash
READMATES_REDIS_ENABLED=true
READMATES_RATE_LIMIT_ENABLED=true
READMATES_AUTH_SESSION_CACHE_ENABLED=true
READMATES_PUBLIC_CACHE_ENABLED=true
READMATES_NOTES_CACHE_ENABLED=true
```

문제가 생기면 해당 기능 flag만 끕니다. Redis 장애가 반복되면 `READMATES_REDIS_ENABLED=false`로 되돌리면 MySQL-only 동작으로 복귀합니다.

Kafka 알림은 Redis와 별도 rollout로 켭니다. 알림 topic과 DLQ topic을 먼저 만들고, Spring runtime에는 아래 값이 필요합니다.

```bash
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_KAFKA_ENABLED=true
READMATES_KAFKA_NOTIFICATION_EVENTS_TOPIC=readmates.notification.events.v1
READMATES_KAFKA_NOTIFICATION_DLQ_TOPIC=readmates.notification.events.dlq.v1
READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP=readmates-notification-dispatcher
```

`READMATES_NOTIFICATIONS_ENABLED=false` 또는 `READMATES_KAFKA_ENABLED=false`이면 Kafka relay/consumer가 뜨지 않습니다. 이 상태에서도 도메인 이벤트 row는 `notification_event_outbox`에 쌓일 수 있으므로, 알림을 실제 사용자 기능으로 열기 전에는 pending row 수를 확인하고 Kafka/SMTP를 켠 뒤 처리 결과를 봅니다.

실제 이메일 발송까지 켤 때만 SMTP 값을 함께 설정합니다.

## Multi-club Origin and OAuth Settings

Spring은 OAuth callback origin과 app return origin을 분리합니다.

| 변수 | 운영 기준 |
| --- | --- |
| `READMATES_APP_BASE_URL` | 기본 app origin입니다. primary domain이 준비되지 않은 배포에서는 `https://readmates.pages.dev`를 사용합니다. |
| `READMATES_AUTH_BASE_URL` | Google OAuth `redirect_uri`에 쓰는 primary auth origin입니다. fallback-only 배포에서는 `READMATES_APP_BASE_URL`과 같게 두고, primary domain을 쓰면 `https://<primary-domain>`으로 둡니다. |
| `READMATES_AUTH_RETURN_STATE_SECRET` | OAuth return target 서명 secret입니다. 운영에서는 공개 기본값이나 짧은 샘플 문자열을 사용하지 않습니다. |
| `READMATES_ALLOWED_ORIGINS` | mutating request의 `Origin`/`Referer` 허용 목록입니다. `https://readmates.pages.dev`, primary origin, active registered club host를 comma-separated로 명시합니다. |
| `READMATES_AUTH_SESSION_COOKIE_DOMAIN` | subdomain 간 세션 공유가 필요한 경우에만 설정합니다. Cookie domain 밖의 external custom domain은 같은 platform session을 공유할 수 없으므로 OAuth return URL 허용 대상에서 제외될 수 있습니다. |

현재 allowlist는 DB-backed dynamic allowlist가 아니라 startup 시 읽는 정적 comma-separated 설정입니다. 새 club host를 `ACTIVE`로 운영하기 전에는 Spring env의 `READMATES_ALLOWED_ORIGINS`를 갱신하고 서비스를 재시작합니다. Wildcard origin이나 실제 운영 domain 목록은 공개 문서에 넣지 않습니다.

Google Cloud OAuth client에는 `READMATES_AUTH_BASE_URL`의 `/login/oauth2/code/google` callback을 등록합니다. `https://readmates.pages.dev` fallback을 계속 운영하면 fallback callback도 유지합니다.

Registered club host를 새로 추가한 뒤에는 Cloudflare Pages custom domain 연결, Spring `READMATES_ALLOWED_ORIGINS` 갱신과 재시작, Platform admin 상태 확인 action을 같은 rollout로 묶습니다. 마지막에는 `scripts/smoke-production-integrations.sh`로 Pages marker와 OAuth `redirect_uri`를 확인하고, 실제 운영 결과는 공개 문서나 Git에 붙이지 않습니다.

## Legacy JAR Rollback

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

이 경로는 compose cutover 전 검증이나 rollback 전용입니다. 정상 운영 배포는 [compose-stack.md](compose-stack.md)의 `05-deploy-compose-stack.sh`를 사용합니다.

기본 SSH key는 `~/.ssh/readmates_oci`입니다. 다른 key를 쓰려면 `SSH_KEY`를 지정합니다.

```bash
SSH_KEY='~/.ssh/other_key' VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

배포 스크립트는 `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar`를 VM의 `/tmp/readmates-server.jar`로 복사한 뒤 `/opt/readmates/readmates-server.jar`로 이동하고 `readmates-server`를 재시작합니다.

## Email Notification Operations

ReadMates 알림은 먼저 MySQL `notification_event_outbox`에 저장됩니다. MySQL event outbox가 source of truth이고, relay scheduler가 publish 가능한 row를 Kafka topic `readmates.notification.events.v1`로 발행합니다. 같은 Spring Boot 모듈의 Kafka consumer가 이벤트별 수신자를 계산하고 멤버 선호도를 적용한 뒤 `notification_deliveries`와 `member_notifications`를 만듭니다. SMTP 발송은 `notification_deliveries`의 `EMAIL` row를 기준으로 재시도 가능한 side effect이고, in-app 알림은 `member_notifications`에 남습니다.

Kafka relay/consumer와 실제 SMTP 발송은 아래 조건이 모두 맞을 때 동작합니다.

- `READMATES_NOTIFICATIONS_ENABLED=true`
- `READMATES_KAFKA_ENABLED=true`
- `READMATES_KAFKA_BOOTSTRAP_SERVERS`
- `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`
- `READMATES_NOTIFICATION_SENDER_EMAIL`

`READMATES_NOTIFICATIONS_ENABLED=false`이면 Kafka relay/consumer와 실제 SMTP 발송이 꺼집니다. 운영 rollout에서는 먼저 이 값을 `false`로 두고 `notification_event_outbox` row 생성을 확인한 뒤, Kafka bootstrap server와 OCI Email Delivery credential을 넣고 `READMATES_NOTIFICATIONS_ENABLED=true`, `READMATES_KAFKA_ENABLED=true`로 바꿉니다.

알림 생성 시점:

- 호스트가 피드백 문서를 업로드하면 참석 완료(`ATTENDED`)한 활성 멤버 대상으로 `FEEDBACK_DOCUMENT_PUBLISHED` 알림을 생성합니다.
- 호스트가 예정 세션 공개 범위를 `MEMBER` 또는 `PUBLIC`으로 바꾸면 활성 멤버 대상으로 `NEXT_BOOK_PUBLISHED` 알림을 생성합니다.
- `SESSION_REMINDER_DUE` 이벤트 타입, `recordSessionReminderDue(targetDate)` API, 기본 켜짐 선호도는 지원하지만 현재 운영 코드에는 이 이벤트를 매일 생성하는 production scheduler/caller가 없습니다.
- 멤버가 발행된 공개 회차에 공개 서평을 저장하면 `REVIEW_PUBLISHED` 알림을 생성합니다. 이 알림은 멤버가 직접 켜야 하는 opt-in 알림입니다.

멤버 알림 설정 기본값:

- 기존 운영 알림(`NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`)은 기본 켜짐입니다.
- 서평 공개 알림(`REVIEW_PUBLISHED`)은 기본 꺼짐입니다.

Relay/consumer 처리 기준:

- relay scheduler는 기본 `READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS=30000`으로 30초마다 `notification_event_outbox`의 `PENDING`/`FAILED` row를 처리합니다.
- 한 번에 기본 `READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE=50`건을 claim합니다.
- Kafka publish 성공 시 event row는 `PUBLISHED`가 됩니다.
- Kafka publish 실패 시 event row는 `FAILED`가 되고, 기본 최대 `READMATES_KAFKA_NOTIFICATION_MAX_PUBLISH_ATTEMPTS=5`회까지 재시도합니다.
- consumer는 `READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP=readmates-notification-dispatcher`로 topic을 구독합니다.
- consumer가 만드는 email delivery는 `PENDING`, `SENDING`, `SENT`, `FAILED`, `DEAD`, `SKIPPED` 상태를 사용하고, 기본 최대 `READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS=5`회까지 재시도합니다.
- in-app delivery는 `member_notifications` row 생성 뒤 `SENT`로 기록됩니다.

event publish와 email delivery 재시도 간격은 순서대로 5분, 15분, 60분, 240분입니다. Kafka publish 오류, SMTP credential 오류, provider reject가 지속되면 host dashboard의 pending/failed/dead count와 `readmates_notifications_*` metrics를 함께 확인합니다.

수동 처리:

- Host dashboard의 알림 섹션에서 pending/failed/dead/sentLast24h를 확인합니다.
- 호스트 알림 운영 페이지는 `/app/host/notifications`입니다.
- 호스트 알림 운영 페이지에서 현재 host club의 event outbox와 channel delivery ledger를 확인하고, pending/failed email delivery를 처리하며, `DEAD` email delivery를 retry 가능한 상태로 복구할 수 있습니다.
- 호스트 알림 운영 페이지에서 고정 템플릿 테스트 메일을 보낼 수 있습니다. 테스트 메일 audit은 masked recipient email과 hash만 저장하고 raw recipient email은 저장하지 않습니다.
- Host dashboard의 수동 처리 action은 현재 host club의 pending/failed 알림만 처리합니다.
- Kafka consumer retry를 기다리지 않고 즉시 확인이 필요할 때만 수동 처리를 사용합니다.

## 검증

VM 내부:

```bash
sudo systemctl status readmates-stack --no-pager
cd /opt/readmates
sudo docker compose -f compose.yml ps
sudo docker compose -f compose.yml logs --tail=120 readmates-api
sudo docker compose -f compose.yml exec -T readmates-api curl -fsS http://127.0.0.1:8080/internal/health
```

Cloudflare 경유:

```bash
CLUB_SLUG='{club-slug}'
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
```

OAuth:

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
```

Metrics:

```bash
cd /opt/readmates
sudo docker compose -f compose.yml exec -T readmates-api curl -sS http://127.0.0.1:8081/actuator/prometheus | grep readmates_notifications
```

`readmates_notifications` meter는 알림 처리 뒤 노출됩니다. 신규 배포 직후에는 먼저 compose 내부에서 `curl -sS http://127.0.0.1:8081/actuator/prometheus`로 endpoint reachability를 확인하고, 알림 처리 뒤 위 grep으로 counter 노출을 확인합니다.

Compose stack에서는 management endpoint를 container 내부 `0.0.0.0:8081`에 바인딩하지만 host port로 publish하지 않습니다. Legacy host JAR rollback에서는 `READMATES_MANAGEMENT_ADDRESS=127.0.0.1`과 `READMATES_MANAGEMENT_PORT=8081`을 사용합니다.

Operations pipeline live smoke:

```bash
READMATES_EXPORT_BUCKET=readmates-db-exports \
READMATES_OBJECT_STORAGE_SMOKE_WRITE=true \
/opt/readmates/deploy/oci/verify-operations-pipeline-live.sh
```

SMTP까지 실제 발송으로 확인할 때만 `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, `READMATES_NOTIFICATION_SENDER_EMAIL`, `READMATES_SMTP_SMOKE_TO`를 운영 VM 환경에 주입해 같은 스크립트를 실행합니다. `READMATES_SMTP_SMOKE_TO`는 운영자가 관리하는 테스트 수신 주소만 사용합니다.

## 운영 메모

- Spring `prod` profile에서는 `READMATES_BFF_SECRET_REQUIRED=true`가 기본 운영 기준입니다. secret이 비면 시작 실패가 맞습니다.
- OCI Email Delivery SMTP credential과 sender 값은 `/etc/readmates/readmates.env`에만 둡니다. Git에는 `<oci-region>`, `<oci-smtp-username>`, `<oci-smtp-password>`, `no-reply@example.com` 같은 placeholder만 기록합니다.
- DB migration은 Spring 시작 시 Flyway가 `db/mysql/migration`을 적용합니다.
- 백엔드 프로덕션 배포는 현재 수동입니다. GitHub Actions 기반 프로덕션 배포 자격 증명이나 runner가 이미 구성되어 있다고 가정하지 않습니다.
- Compose Caddy 로그는 container stdout으로 확인합니다. Legacy host Caddy rollback에서는 `/var/log/caddy/readmates.log`를 확인합니다. Caddy access log 설정은 request URI와 `Authorization`, `Cookie`, `X-Readmates-Bff-Secret` request header를 기록하지 않아야 합니다.
