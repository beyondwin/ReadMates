# DB Backup & Restore

Readmates production MySQL backup은 OCI MySQL HeatWave에서 `mysqldump`로 추출한 `*.sql.gz`를 OCI Object Storage private bucket에 업로드합니다. 본 runbook은 (1) 자동 일일 백업 운용, (2) 릴리스 전 수동 백업, (3) 객체 검증, (4) 복구 (restore) 절차를 다룹니다.

## 환경 변수와 bucket

자동 백업은 `/etc/readmates/backup-mysql.env`(chmod 600, root:root)에서 환경 변수를 읽습니다. systemd unit 파일(`deploy/oci/backup-mysql.service`)이 `EnvironmentFile=` 지시자로 로드합니다.

필수:
- `READMATES_EXPORT_BUCKET` — 예: `readmates-db-exports`
- `OCI_NAMESPACE` — 예: `ax5hfpscso8v`
- `READMATES_DB_HOST` — HeatWave private endpoint hostname

선택:
- `READMATES_DB_NAME` (기본 `readmates`)
- `READMATES_DB_USER` (기본 `readmates`)
- `READMATES_EXPORT_DIR` (기본 `/var/backups/readmates/mysql`)
- `READMATES_MYSQL_DEFAULTS_FILE` (기본 `/etc/readmates/mysql-backup.cnf`, chmod 600)
- `READMATES_BACKUP_OBJECT_PREFIX` (기본 `mysql`)

OCI CLI는 root 권한으로 실행되며 `/root/.oci/config`의 자격을 사용합니다. 인스턴스 principal 인증으로 전환할 경우 환경 변수 `OCI_CLI_AUTH=instance_principal`을 같은 env 파일에 추가합니다.

## 보관 정책 (retention)

OCI Object Storage Lifecycle Policy로 관리합니다.

- 일일 백업: 최근 **30일**까지 보관 후 자동 삭제
- 주간 백업 (매주 일요일 04:15 UTC 실행): 최근 **6주**까지 archive tier로 이동 후 삭제
- 월간 백업 (매월 1일 04:15 UTC 실행): 최근 **1개월**(1회 분량)을 archive tier에 영구 보관

릴리스 직전 수동 업로드 객체(`readmates-pre-v*.sql.gz`)는 prefix 기반 lifecycle rule에서 제외되며 영구 보관됩니다. 모든 객체는 SSE-S3 (server-side encryption with managed keys) 기본값을 사용합니다.

> Lifecycle rule은 OCI Console → Bucket → Lifecycle Policy Rules에서 prefix 기준으로 구성합니다. CLI 자동화는 `oci os object-lifecycle-policy put`을 사용합니다.

## 일일 자동 백업

`deploy/oci/backup-mysql.service` + `deploy/oci/backup-mysql.timer`가 매일 **04:15 UTC** (KST 13:15)에 실행됩니다. Timer는 `RandomizedDelaySec=300`으로 0~5분 jitter를 추가합니다.

### 설치 (idempotent)

```bash
scp -i ~/.ssh/readmates_oci deploy/oci/backup-mysql.service ubuntu@<VM_IP>:/tmp/
scp -i ~/.ssh/readmates_oci deploy/oci/backup-mysql.timer   ubuntu@<VM_IP>:/tmp/
ssh -i ~/.ssh/readmates_oci ubuntu@<VM_IP> '
  sudo install -m 0644 /tmp/backup-mysql.service /etc/systemd/system/backup-mysql.service
  sudo install -m 0644 /tmp/backup-mysql.timer   /etc/systemd/system/backup-mysql.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now backup-mysql.timer
'
```

### 상태 확인

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<VM_IP> '
  systemctl is-enabled backup-mysql.timer
  systemctl list-timers backup-mysql.timer
  journalctl -u backup-mysql.service -n 50 --no-pager
'
```

## 릴리스 전 수동 백업과 일일 timer 사이의 관계

릴리스 직전 manual backup은 일일 timer와 충돌하지 않습니다. 이유:

1. 객체 이름이 timestamp + tag로 unique 합니다 (`readmates-pre-vX.Y.Z-<UTC timestamp>.sql.gz`).
2. Timer는 `mysql/readmates-<UTC timestamp>.sql.gz`(태그 없음) 패턴으로만 객체를 생성합니다.
3. Lifecycle rule이 `pre-v` prefix를 예외 처리하므로 일일 retention이 manual backup을 삭제하지 않습니다.

릴리스 직전에는 timer 실행을 잠시 비활성화하지 마세요. 동일 데이터에 대한 두 번의 dump는 idempotent 합니다.

### 수동 업로드 (script가 새 dump를 생성하는 경로)

VM에서 (READMATES_DB_*, OCI_NAMESPACE, READMATES_EXPORT_BUCKET 등 env가 export 되어 있어야 함):

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@<VM_IP> '
  set -a; source /etc/readmates/backup-mysql.env; set +a
  sudo --preserve-env=READMATES_EXPORT_BUCKET,OCI_NAMESPACE,READMATES_DB_HOST,READMATES_DB_NAME,READMATES_DB_USER,READMATES_EXPORT_DIR,READMATES_MYSQL_DEFAULTS_FILE,READMATES_BACKUP_OBJECT_PREFIX \
    /opt/readmates/deploy/oci/backup-mysql-to-object-storage.sh
'
```

### 수동 업로드 (기존 dump를 그대로 올리는 경로)

VM에 OCI CLI가 없거나 이미 dump 파일이 존재하는 경우, 로컬 워크스테이션에서 객체만 업로드합니다.

```bash
# 1. VM 에서 dump 파일을 staging.
ssh -i ~/.ssh/readmates_oci ubuntu@<VM_IP> '
  sudo cp /var/backups/readmates/mysql/readmates-pre-v1.X.Y-<TS>.sql.gz /tmp/dump.sql.gz
  sudo cp /var/backups/readmates/mysql/readmates-pre-v1.X.Y-<TS>.sql.gz.sha256 /tmp/dump.sql.gz.sha256
  sudo chown ubuntu:ubuntu /tmp/dump.sql.gz /tmp/dump.sql.gz.sha256
'

# 2. 로컬로 SCP.
scp -i ~/.ssh/readmates_oci ubuntu@<VM_IP>:/tmp/dump.sql.gz \
    ./readmates-pre-v1.X.Y-<TS>.sql.gz
scp -i ~/.ssh/readmates_oci ubuntu@<VM_IP>:/tmp/dump.sql.gz.sha256 \
    ./readmates-pre-v1.X.Y-<TS>.sql.gz.sha256

# 3. SHA256 sanity check.
shasum -a 256 ./readmates-pre-v1.X.Y-<TS>.sql.gz
cat ./readmates-pre-v1.X.Y-<TS>.sql.gz.sha256

# 4. Object Storage 업로드 (sha256 + tag metadata 동봉).
SHA="$(shasum -a 256 ./readmates-pre-v1.X.Y-<TS>.sql.gz | awk '{print $1}')"
oci os object put \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz" \
  --file ./readmates-pre-v1.X.Y-<TS>.sql.gz \
  --metadata "{\"sha256\":\"$SHA\",\"tag\":\"pre-v1.X.Y\"}" \
  --force
oci os object put \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz.sha256" \
  --file ./readmates-pre-v1.X.Y-<TS>.sql.gz.sha256 \
  --force
```

## 객체 검증

```bash
oci os object list \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --prefix mysql/readmates- \
  --query 'data[*].name' --output json

oci os object head \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz"
# 응답의 opc-meta-sha256 값이 .sql.gz.sha256 파일의 hash와 일치하는지 확인.
```

## Restore (복구) 절차

> 운영 DB를 직접 덮어쓰기 전에 staging schema에서 dry-run을 먼저 수행합니다.

### 1. 객체 다운로드

```bash
oci os object get \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz" \
  --file ./restore.sql.gz

oci os object get \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz.sha256" \
  --file ./restore.sql.gz.sha256
```

### 2. 무결성 검증

```bash
EXPECTED="$(awk '{print $1}' ./restore.sql.gz.sha256)"
ACTUAL="$(shasum -a 256 ./restore.sql.gz | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "SHA256 MISMATCH"; exit 1; }
```

객체 metadata와도 교차 확인:

```bash
oci os object head \
  --namespace-name ax5hfpscso8v \
  --bucket-name readmates-db-exports \
  --name "mysql/readmates-pre-v1.X.Y-<TS>.sql.gz" \
  | jq -r '."opc-meta-sha256"'
```

### 3. Staging schema로 dry-run

```bash
gunzip -c ./restore.sql.gz | mysql \
  --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_DB_HOST" \
  --user="$READMATES_DB_USER" \
  --execute "SOURCE /dev/stdin" readmates_restore_staging
```

`readmates_restore_staging` schema에서 row count, 핵심 table 무결성, FK 제약을 검증합니다.

### 4. Production schema 복구 (운영자 승인 후)

```bash
# (선택) 현 운영 DB를 한 번 더 덤프해 두기.
ssh -i ~/.ssh/readmates_oci ubuntu@<VM_IP> '
  sudo systemctl start backup-mysql.service
'

# 운영 schema를 drop & recreate.
mysql --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_DB_HOST" \
  --user="$READMATES_DB_USER" \
  --execute "DROP DATABASE IF EXISTS readmates; CREATE DATABASE readmates CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Restore.
gunzip -c ./restore.sql.gz | mysql \
  --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_DB_HOST" \
  --user="$READMATES_DB_USER" \
  --execute "SOURCE /dev/stdin" readmates
```

### 5. 사후 검증

- BFF `/api/health/db` 또는 `/api/internal/db-stats` endpoint로 row count smoke.
- 운영 server 로그에 ledger event `DB_RESTORE_VERIFIED` 기록.
- `docs/development/release-readiness-review.md`에 restore 이력 기재.

## Troubleshooting

- **`oci: command not found` (VM)**: VM에 OCI CLI 미설치 상태. Bootstrap 절차는 별도 runbook `docs/deploy/oci-mysql-heatwave.md` 참조. Bootstrap 후 `systemctl restart backup-mysql.timer`.
- **`MySQL defaults file must have 0600 permissions`**: `sudo chmod 600 /etc/readmates/mysql-backup.cnf && sudo chown root:root /etc/readmates/mysql-backup.cnf`.
- **`NamespaceNotFound`**: `OCI_NAMESPACE` 오타이거나 OCI CLI 자격이 다른 tenancy를 가리킴. `oci os ns get`으로 확인.
- **Timer가 등록되었지만 실행되지 않음**: `journalctl -u backup-mysql.service --since '24h ago'`로 실패 원인 확인. `systemctl status backup-mysql.timer`로 next trigger 시각 확인.

## 관련 문서

- `docs/deploy/oci-mysql-heatwave.md` — 초기 bootstrap, IAM policy, defaults-file 생성.
- `docs/deploy/oci-backend.md` — VM provisioning + Docker compose 흐름.
- `deploy/oci/backup-mysql-to-object-storage.sh` — 백업 script 원본.
- `deploy/oci/export-mysql.sh` — mysqldump wrapper.
