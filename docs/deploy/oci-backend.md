# OCI 백엔드 배포

백엔드는 OCI Compute VM에서 Spring Boot JAR로 실행되고 systemd가 프로세스를 관리합니다. Caddy가 운영 HTTPS endpoint를 받아 로컬 Spring `127.0.0.1:8080`으로 reverse proxy합니다.

상위 배포 허브는 [README.md](README.md)입니다. Cloudflare Pages와 Pages Functions 설정은 [cloudflare-pages.md](cloudflare-pages.md)를 함께 확인합니다.

## 런타임 기준

| 항목 | 값 |
| --- | --- |
| 서비스 사용자 | `readmates` |
| 작업 디렉터리 | `/opt/readmates` |
| JAR 경로 | `/opt/readmates/readmates-server.jar` |
| 환경 파일 | `/etc/readmates/readmates.env` |
| systemd 서비스 | `readmates-server` |
| 로컬 헬스체크 | `http://127.0.0.1:8080/internal/health` |

## 운영 환경 변수

`/etc/readmates/readmates.env`에는 아래 값이 들어갑니다.

```bash
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-secret-as-cloudflare>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
READMATES_NOTIFICATIONS_ENABLED=true
READMATES_NOTIFICATION_WORKER_ENABLED=true
READMATES_NOTIFICATION_SENDER_NAME=ReadMates
READMATES_NOTIFICATION_SENDER_EMAIL=no-reply@example.com
SPRING_MAIL_HOST=smtp.email.<oci-region>.oci.oraclecloud.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<oci-smtp-username>
SPRING_MAIL_PASSWORD=<oci-smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT=5000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_TIMEOUT=3000
SPRING_MAIL_PROPERTIES_MAIL_SMTP_WRITETIMEOUT=5000
READMATES_MANAGEMENT_ADDRESS=127.0.0.1
READMATES_MANAGEMENT_PORT=8081
```

Git에는 변수 이름과 placeholder만 둡니다. 프로덕션 secret 실제 값은 VM, Cloudflare, Google Cloud, OCI 콘솔, 또는 운영자가 관리하는 ignored 파일에만 둡니다.

## 최초 VM 설정

로컬에서 실행합니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'bash -s' < deploy/oci/01-vm-setup.sh
```

이 스크립트는 Ubuntu 패키지를 업데이트하고, Java 21 runtime과 Caddy를 설치하며, `readmates` 사용자와 `/opt/readmates`, `/etc/readmates` 디렉터리를 만듭니다.

## 운영 설정 적용

로컬에서 secret을 환경 변수로 주입해 실행합니다.

```bash
APP_DB_PASS='<db-password>' \
BFF_SECRET='<same-secret-as-cloudflare>' \
MYSQL_PRIVATE_IP='<mysql-private-ip>' \
READMATES_APP_BASE_URL='https://readmates.pages.dev' \
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

`02-configure.sh`는 baseline OAuth, DB, BFF 값으로 `/etc/readmates/readmates.env`를 다시 생성합니다. 알림 발송을 켜는 배포에서는 스크립트 실행 뒤 위 환경 변수 블록의 `READMATES_NOTIFICATIONS_ENABLED`, `READMATES_NOTIFICATION_WORKER_ENABLED`, `READMATES_NOTIFICATION_SENDER_*`, `SPRING_MAIL_*`, `READMATES_MANAGEMENT_*` 값을 같은 env 파일에 운영 값으로 추가한 뒤 `readmates-server`를 재시작합니다.

## JAR 배포

```bash
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

기본 SSH key는 `~/.ssh/readmates_oci`입니다. 다른 key를 쓰려면 `SSH_KEY`를 지정합니다.

```bash
SSH_KEY='~/.ssh/other_key' VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

배포 스크립트는 `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar`를 VM의 `/tmp/readmates-server.jar`로 복사한 뒤 `/opt/readmates/readmates-server.jar`로 이동하고 `readmates-server`를 재시작합니다.

## Email Notification Operations

ReadMates 알림은 먼저 MySQL `notification_outbox`에 저장되고, worker가 outbox를 claim한 뒤 SMTP로 발송합니다. MySQL이 source of truth이고 SMTP 발송은 재시도 가능한 side effect입니다.

실제 SMTP 발송은 아래 조건이 모두 맞을 때만 동작합니다.

- `READMATES_NOTIFICATIONS_ENABLED=true`
- `READMATES_NOTIFICATION_WORKER_ENABLED=true`
- `SPRING_MAIL_HOST`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`
- `READMATES_NOTIFICATION_SENDER_EMAIL`

`READMATES_NOTIFICATIONS_ENABLED=false`이면 실제 SMTP 발송 대신 logging adapter가 동작합니다. 운영 rollout에서는 먼저 `READMATES_NOTIFICATIONS_ENABLED=false`, `READMATES_NOTIFICATION_WORKER_ENABLED=false`로 outbox row 생성과 host dashboard count를 확인한 뒤, OCI Email Delivery credential을 넣고 두 값을 `true`로 바꿉니다.

알림 생성 시점:

- 호스트가 피드백 문서를 업로드하면 참석 완료(`ATTENDED`)한 활성 멤버 대상으로 `FEEDBACK_DOCUMENT_PUBLISHED` 알림을 생성합니다.
- 호스트가 예정 세션 공개 범위를 `MEMBER` 또는 `PUBLIC`으로 바꾸면 활성 멤버 대상으로 `NEXT_BOOK_PUBLISHED` 알림을 생성합니다.
- worker scheduler가 기본 `Asia/Seoul` 기준 매일 자정에 다음 날 세션 대상 `SESSION_REMINDER_DUE` 알림을 생성합니다.
- 멤버가 발행된 공개 회차에 공개 서평을 저장하면 `REVIEW_PUBLISHED` 알림을 생성합니다. 이 알림은 멤버가 직접 켜야 하는 opt-in 알림입니다.

멤버 알림 설정 기본값:

- 기존 운영 알림(`NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`)은 기본 켜짐입니다.
- 서평 공개 알림(`REVIEW_PUBLISHED`)은 기본 꺼짐입니다.

발송 처리 기준:

- worker는 기본 `READMATES_NOTIFICATION_WORKER_FIXED_DELAY_MS=30000`으로 30초마다 outbox를 처리합니다.
- 한 번에 기본 `READMATES_NOTIFICATION_WORKER_BATCH_SIZE=20`건을 claim합니다.
- 발송 성공 시 row는 `SENT`가 됩니다.
- 발송 실패 시 row는 `FAILED`가 되고, 기본 최대 `READMATES_NOTIFICATION_MAX_ATTEMPTS=5`회까지 재시도합니다.
- 최대 시도 횟수를 넘으면 row는 `DEAD`가 됩니다.

재시도 간격은 순서대로 5분, 15분, 60분, 240분입니다. SMTP credential 오류나 provider reject가 지속되면 host dashboard의 pending/failed/dead count와 `readmates_notifications_*` metrics를 함께 확인합니다.

수동 처리:

- Host dashboard의 알림 섹션에서 pending/failed/dead/sentLast24h를 확인합니다.
- Host notification operations page는 `/app/host/notifications`입니다.
- Host notification operations page에서 현재 host club의 pending/failed row를 처리하고, `DEAD` row를 retry 가능한 상태로 복구할 수 있습니다.
- Host notification operations page에서 fixed-template test mail을 보낼 수 있습니다. Test mail audit은 masked recipient email과 hash만 저장하고 raw recipient email은 저장하지 않습니다.
- Host dashboard의 수동 처리 action은 현재 host club의 pending/failed 알림만 처리합니다.
- worker가 꺼져 있거나 즉시 확인이 필요할 때만 수동 처리를 사용합니다.

## 검증

VM 내부:

```bash
sudo systemctl status readmates-server --no-pager
sudo journalctl -u readmates-server -n 120 --no-pager
curl -sS http://127.0.0.1:8080/internal/health
```

Cloudflare 경유:

```bash
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS https://readmates.pages.dev/api/bff/api/public/club
```

OAuth:

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
```

Metrics:

```bash
curl -sS http://127.0.0.1:8081/actuator/prometheus | grep readmates_notifications
```

`readmates_notifications` meter는 알림 처리 뒤 노출됩니다. 신규 배포 직후에는 먼저 `curl -sS http://127.0.0.1:8081/actuator/prometheus`로 endpoint reachability를 확인하고, 알림 처리 뒤 위 grep으로 counter 노출을 확인합니다.

VM-local scraping을 위해 management endpoint는 loopback에만 바인딩합니다. 운영 환경 파일에는 `READMATES_MANAGEMENT_ADDRESS=127.0.0.1`과 `READMATES_MANAGEMENT_PORT=8081`이 필요합니다.

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
- Caddy 로그는 `/var/log/caddy/readmates.log`에 남습니다.
