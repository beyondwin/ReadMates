# OCI 백엔드 배포

백엔드는 OCI Compute VM에서 Spring Boot JAR로 실행되고 systemd가 프로세스를 관리합니다. Caddy가 운영 HTTPS endpoint를 받아 로컬 Spring `127.0.0.1:8080`으로 reverse proxy합니다.

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
```

Git에는 변수 이름과 placeholder만 둡니다. 프로덕션 secret 실제 값은 VM, Cloudflare, Google Cloud, OCI 콘솔, 또는 로컬 ignored 파일에만 둡니다.

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

`CADDY_SITE`는 운영 HTTPS 사이트 주소여야 합니다. `:80`, `http://...`, plaintext Spring origin은 사용할 수 없습니다.

`02-configure.sh`가 수행하는 일:

- `/etc/readmates/readmates.env` 생성, 권한 `600`
- `/etc/systemd/system/readmates-server.service` 등록
- `readmates-server` 서비스 enable
- Caddy reverse proxy 설정, `${CADDY_SITE} -> 127.0.0.1:8080`

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

## 운영 메모

- Spring `prod` profile에서는 `READMATES_BFF_SECRET_REQUIRED=true`가 기본 운영 기준입니다. secret이 비면 시작 실패가 맞습니다.
- DB migration은 Spring 시작 시 Flyway가 `db/mysql/migration`을 적용합니다.
- 백엔드 배포는 현재 수동입니다. GitHub Actions 기반 프로덕션 배포 자격 증명이나 자동 배포 runner는 유료 전환 또는 별도 운영 결정 전까지 추가하지 않습니다.
- Caddy 로그는 `/var/log/caddy/readmates.log`에 남습니다.
