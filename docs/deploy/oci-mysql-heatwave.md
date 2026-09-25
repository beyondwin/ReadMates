# OCI MySQL HeatWave와 백업 참고

OCI MySQL HeatWave, 논리 export, Object Storage 백업, 복구 rehearsal을 다룹니다. 운영 환경 변수의 기준은 [oci-backend.md](oci-backend.md), 자동 백업 운영은 [DB backup runbook](../operations/runbooks/db-backup.md)입니다.

백업은 dump 생성, checksum, private Object Storage 업로드, 비운영 restore rehearsal까지 확인해야 믿을 수 있습니다. export가 한 번 성공했다고 복구가 보장되지는 않습니다.

OCI 한도는 바뀔 수 있으니 리소스를 만들기 전에 현재 콘솔이나 공식 문서를 확인합니다. Bucket 이름, namespace, private host, OCID, backup object 목록은 공개 문서에 남기지 않습니다.

## 리소스 기준

- Cloudflare Pages: `front/` SPA와 Pages Functions
- OCI Compute: Spring Boot API (Compose stack)
- OCI MySQL HeatWave: Always Free `MySQL.Free`
- 백업 스크립트: `deploy/oci/export-mysql.sh`, `deploy/oci/backup-mysql-to-object-storage.sh`
- 자동 백업 unit: `deploy/oci/backup-mysql.service`, `deploy/oci/backup-mysql.timer`
- Object Storage: private bucket. 이 문서의 `readmates-db-exports`는 placeholder 이름입니다.

MySQL은 가능하면 OCI private network 안에 둡니다. 공개 진입점은 Cloudflare Pages와 HTTPS API endpoint뿐입니다.

## 필수 환경

### Cloudflare Pages

```bash
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=<shared-bff-secret>
# 무중단 rotation 중에는 primary first 목록을 사용합니다.
# READMATES_BFF_SECRETS=<new-secret>,<old-secret>
```

### Spring

DB 관련 핵심 값입니다. 전체 목록은 [oci-backend.md](oci-backend.md#운영-환경-변수)를 봅니다.

```bash
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_APP_BASE_URL=https://app.example.com
READMATES_AUTH_BASE_URL=https://app.example.com
READMATES_ALLOWED_ORIGINS=https://app.example.com
READMATES_BFF_SECRET_REQUIRED=true
READMATES_AUTH_SESSION_COOKIE_SECURE=true
```

세션 cookie Secure 설정의 property는 `readmates.auth.session-cookie-secure`이고, 운영 환경 변수는 `READMATES_AUTH_SESSION_COOKIE_SECURE`입니다.

## MySQL HeatWave Always Free

권장 기준:

- Database name / application user: `readmates`
- Character set/collation: MySQL 8 기본값
- Time zone: UTC (backend Hikari `set time_zone = '+00:00'`과 일치)
- Network: private endpoint 또는 Spring VM에서만 접근 가능한 security list
- Schema migration: Spring 시작 시 `server/src/main/resources/db/mysql/migration`의 Flyway 적용

## 논리 export

`deploy/oci/export-mysql.sh`는 `mysqldump` 결과를 gzip으로 묶어 `readmates-YYYYMMDDTHHMMSSZ.sql.gz`를 만듭니다.

- MySQL credential은 권한 `0600`인 defaults file로만 읽습니다. 권한이 다르면 실패합니다.
- GTID가 켜진 OCI MySQL에서도 일반 앱 계정으로 일관된 dump를 만들도록 `--single-transaction --set-gtid-purged=OFF --no-tablespaces`를 씁니다.
- 필수 환경 변수: `READMATES_DB_HOST`, `READMATES_DB_NAME`, `READMATES_DB_USER`, `READMATES_EXPORT_DIR`, `READMATES_MYSQL_DEFAULTS_FILE`.

1. VM에 백업 디렉터리와 defaults file을 준비합니다.

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

2. 수동 export를 실행합니다.

   ```bash
   READMATES_DB_HOST=<mysql-private-host> \
   READMATES_DB_NAME=readmates \
   READMATES_DB_USER=readmates \
   READMATES_EXPORT_DIR=/var/backups/readmates/mysql \
   READMATES_MYSQL_DEFAULTS_FILE=/etc/readmates/mysql-backup.cnf \
   /opt/readmates/deploy/oci/export-mysql.sh
   ```

권장 운영:

- 위험한 schema 작업 전에는 수동 export를 만듭니다.
- `05-deploy-compose-stack.sh`는 `/var/backups/readmates/mysql`에 최근 2일 안의 `*.sql.gz`가 없으면 배포를 멈춥니다.
- VM local에는 최신 몇 개만 두고, Object Storage에는 14-30일 보관 후 lifecycle rule로 만료시킵니다.
- 월 1회 비운영 DB로 restore rehearsal을 합니다.

## Object Storage 업로드

bucket은 private으로만 만듭니다. 공개 bucket, pre-authenticated request, public URL로 백업을 공유하지 않습니다.

`backup-mysql-to-object-storage.sh`는 export → sha256 checksum → `oci os object put` 두 번(dump, checksum) 순서로 실행합니다.

| 변수 | 필수 | 기본값 |
| --- | --- | --- |
| `READMATES_EXPORT_BUCKET` | 예 | - |
| `OCI_NAMESPACE` | 예 | - |
| `READMATES_DB_HOST` | 예 | - |
| `READMATES_DB_NAME` | 아니요 | `readmates` |
| `READMATES_DB_USER` | 아니요 | `readmates` |
| `READMATES_EXPORT_DIR` | 아니요 | `/var/backups/readmates/mysql` |
| `READMATES_MYSQL_DEFAULTS_FILE` | 아니요 | `/etc/readmates/mysql-backup.cnf` |
| `READMATES_BACKUP_OBJECT_PREFIX` | 아니요 | `mysql` |

수동 실행:

```bash
export OCI_NAMESPACE=<object-storage-namespace>
export READMATES_EXPORT_BUCKET=readmates-db-exports
export READMATES_DB_HOST=<mysql-private-host>

/opt/readmates/deploy/oci/backup-mysql-to-object-storage.sh
```

자동 실행: `backup-mysql.timer`가 매일 04:15 UTC(최대 5분 jitter)에 `backup-mysql.service`를 실행합니다. service는 `/etc/readmates/backup-mysql.env`(root 소유, `600`)에서 위 변수를 읽습니다. 설치 절차는 [DB backup runbook](../operations/runbooks/db-backup.md)을 따릅니다.

업로드 권한만 먼저 볼 때는 DB dump 없이 임시 object를 올렸다 지우는 smoke를 씁니다.

```bash
READMATES_EXPORT_BUCKET=readmates-db-exports \
READMATES_OBJECT_STORAGE_SMOKE_WRITE=true \
/opt/readmates/deploy/oci/verify-operations-pipeline-live.sh
```

실제 dump와 업로드까지 보려면 `READMATES_DB_HOST`, `READMATES_DB_NAME`, `READMATES_DB_USER`, `READMATES_MYSQL_DEFAULTS_FILE`을 넣고, 의도가 있을 때만 `READMATES_BACKUP_UPLOAD_SMOKE=true`를 추가합니다.

확인: 같은 prefix에 dump와 checksum이 함께 있어야 합니다.

```text
mysql/readmates-YYYYMMDDTHHMMSSZ.sql.gz
mysql/readmates-YYYYMMDDTHHMMSSZ.sql.gz.sha256
```

## 복구 rehearsal

운영 DB가 아닌 별도 schema나 별도 DB system에 복구합니다. 복구 credential이 다르면 별도 `0600` defaults file을 씁니다.

```bash
sha256sum -c readmates-YYYYMMDDTHHMMSSZ.sql.gz.sha256

gunzip -c readmates-YYYYMMDDTHHMMSSZ.sql.gz | mysql \
  --defaults-extra-file=/etc/readmates/mysql-restore-rehearsal.cnf \
  --host="$READMATES_RESTORE_DB_HOST" \
  --user="$READMATES_RESTORE_DB_USER" \
  "$READMATES_RESTORE_DB_NAME"
```

## 점검 목록

- Spring이 `SPRING_PROFILES_ACTIVE=prod`로 시작합니다.
- Cloudflare Pages와 Spring의 BFF secret(primary 또는 fallback)이 같습니다.
- `READMATES_ALLOWED_ORIGINS`가 운영 Pages origin과 실제로 쓰는 origin으로만 제한되어 있습니다.
- `READMATES_AUTH_BASE_URL`의 `/login/oauth2/code/google`이 Google OAuth redirect URI와 같습니다.
- `READMATES_AUTH_RETURN_STATE_SECRET`이 짧은 샘플 값이 아닙니다.
- `READMATES_AUTH_SESSION_COOKIE_SECURE=true`로 세션 cookie가 Secure입니다.
- export가 dump를 만들고, `backup-mysql.timer`가 active입니다.
- 최신 export를 비운영 DB로 복구할 수 있습니다.
