# OCI MySQL HeatWave와 백업 참고

현재 기준 문서는 [README.md](README.md)와 [oci-backend.md](oci-backend.md)입니다. 이 문서는 OCI MySQL HeatWave, 논리 export, 복구 rehearsal을 위한 하위 참고 문서입니다.

## 리소스 기준

- Cloudflare Pages: `front/` SPA와 Pages Functions
- OCI Compute: Spring Boot API
- OCI MySQL HeatWave: Always Free `MySQL.Free`
- 백업 스크립트: `deploy/oci/export-mysql.sh`
- Object Storage bucket: 운영에서 실제 생성과 lifecycle rule을 확인한 뒤 사용합니다. 확인 전에는 planned 상태로 봅니다.

가능하면 MySQL은 OCI private network 안에 둡니다. 공개 entry point는 Cloudflare Pages URL과 HTTPS API endpoint입니다. Spring의 `127.0.0.1:8080` listener를 운영에서 직접 공개하지 않습니다.

## 필수 환경

### Cloudflare Pages

```bash
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<pages-function-secret>
```

`READMATES_API_BASE_URL`은 운영 HTTPS origin이어야 합니다. Caddy, Nginx, OCI Load Balancer, 또는 Cloudflare proxy로 TLS를 종료하고 Spring local service로 전달합니다.

### Spring

```bash
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<secret>
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
READMATES_BFF_SECRET=<same-pages-function-secret>
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile
```

현재 Spring은 `readmates.auth.session-cookie-secure` property를 읽으므로 운영 환경 변수는 `READMATES_AUTH_SESSION_COOKIE_SECURE`입니다.

프로덕션 secret 실제 값은 Git 밖에 둡니다. 이 문서에는 변수 이름과 placeholder만 기록합니다.

## MySQL HeatWave Always Free

초기 운영 DB는 OCI MySQL HeatWave Always Free DB system을 사용합니다.

권장 기준:

- Database name: `readmates`
- Application user: `readmates`
- Character set/collation: MySQL 8 기본값 사용, 별도 한국어 collation 요구가 생기면 재검토
- Time zone: UTC, 백엔드 Hikari `set time_zone = '+00:00'`와 일치
- Network: private endpoint 또는 Spring Compute VM에서만 접근 가능한 security list
- Schema migration: Spring 시작 시 `server/src/main/resources/db/mysql/migration`의 Flyway migration 적용

## 논리 export

`deploy/oci/export-mysql.sh`는 `mysqldump` 결과를 gzip으로 압축해 `readmates-YYYYMMDDTHHMMSSZ.sql.gz` 파일을 만듭니다. MySQL credential은 권한 `0600`인 defaults file로만 읽습니다.

VM에 백업 디렉터리와 defaults file을 준비합니다.

```bash
sudo install -d -o readmates -g readmates -m 700 /var/backups/readmates/mysql
sudo install -o readmates -g readmates -m 600 /dev/null /etc/readmates/mysql-backup.cnf
sudo editor /etc/readmates/mysql-backup.cnf
sudo chmod 600 /etc/readmates/mysql-backup.cnf
```

`/etc/readmates/mysql-backup.cnf` 예시:

```ini
[client]
password=<readmates-db-password>
ssl-mode=REQUIRED
```

수동 export:

```bash
READMATES_DB_HOST=<mysql-private-host> \
READMATES_DB_NAME=readmates \
READMATES_DB_USER=readmates \
READMATES_EXPORT_DIR=/var/backups/readmates/mysql \
READMATES_MYSQL_DEFAULTS_FILE=/etc/readmates/mysql-backup.cnf \
/opt/readmates/deploy/oci/export-mysql.sh
```

권장 운영:

- 위험한 schema 작업 전 수동 export를 만듭니다.
- daily export를 스케줄러에서 실행합니다.
- VM local에는 최신 3개 정도만 남깁니다.
- Object Storage bucket이 확인되면 14-30일 daily export를 보관하고 lifecycle rule로 만료시킵니다.
- 월 1회 비운영 DB로 restore rehearsal을 실행합니다.

## Object Storage 업로드 예시

bucket이 생성되어 있고 Free tier 범위에 있음을 확인한 뒤 사용합니다.

```bash
export OCI_NAMESPACE=<object-storage-namespace>
export READMATES_EXPORT_BUCKET=readmates-db-exports
export_path="$(READMATES_DB_HOST=<mysql-private-host> READMATES_DB_NAME=readmates READMATES_DB_USER=readmates READMATES_EXPORT_DIR=/var/backups/readmates/mysql READMATES_MYSQL_DEFAULTS_FILE=/etc/readmates/mysql-backup.cnf /opt/readmates/deploy/oci/export-mysql.sh)"

oci os object put \
  --namespace-name "$OCI_NAMESPACE" \
  --bucket-name "$READMATES_EXPORT_BUCKET" \
  --name "mysql/$(basename "$export_path")" \
  --file "$export_path"
```

## 복구 rehearsal

운영 DB가 아닌 별도 schema 또는 별도 DB system에 복구합니다.

```bash
gunzip -c readmates-20260420T000000Z.sql.gz | mysql \
  --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_RESTORE_DB_HOST" \
  --user="$READMATES_RESTORE_DB_USER" \
  "$READMATES_RESTORE_DB_NAME"
```

복구 credential이 백업 credential과 다르면 별도 `0600` defaults file을 사용합니다.

## 점검 목록

- Spring이 `SPRING_PROFILES_ACTIVE=prod`로 시작하는지 확인합니다.
- Cloudflare Pages와 Spring의 `READMATES_BFF_SECRET`이 같은지 확인합니다.
- `READMATES_ALLOWED_ORIGINS`가 운영 Cloudflare Pages origin으로 제한되어 있는지 확인합니다.
- `READMATES_AUTH_SESSION_COOKIE_SECURE=true`로 세션 cookie가 Secure로 나가는지 확인합니다.
- Google OAuth client 변수와 redirect URI가 운영 Pages origin과 맞는지 확인합니다.
- export script가 dump를 생성하는지 확인합니다.
- Object Storage를 사용 중이면 최신 export를 비운영 DB로 복구할 수 있는지 확인합니다.
