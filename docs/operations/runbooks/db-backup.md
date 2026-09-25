# DB Backup & Restore

production MySQL(OCI MySQL HeatWave)을 `mysqldump`로 떠서 `*.sql.gz`와 `.sha256`을 OCI Object Storage private bucket에 올립니다. 이 문서는 (1) 일일 자동 백업, (2) 릴리스 전 수동 백업, (3) 객체 검증, (4) 복구를 다룹니다.

- 백업 스크립트: `deploy/oci/backup-mysql-to-object-storage.sh` (내부에서 `deploy/oci/export-mysql.sh` 호출)
- systemd: `deploy/oci/backup-mysql.service`, `deploy/oci/backup-mysql.timer`
- 초기 설정(IAM, defaults file, OCI CLI): [OCI MySQL HeatWave](../../deploy/oci-mysql-heatwave.md)

아래 명령의 `<deploy-ssh-key>`, `<vm-public-ip>`, `<object-storage-namespace>`, `<backup-bucket>`은 placeholder입니다.

## 환경 변수와 bucket

자동 백업은 `/etc/readmates/backup-mysql.env`(`chmod 600`, `root:root`)를 `EnvironmentFile=`로 읽습니다.

| 변수 | 필수 | 기본값 |
| --- | --- | --- |
| `READMATES_EXPORT_BUCKET` | 예 | — (private bucket 이름) |
| `OCI_NAMESPACE` | 예 | — (Object Storage namespace) |
| `READMATES_DB_HOST` | 예 | — (HeatWave private endpoint) |
| `READMATES_DB_NAME` | | `readmates` |
| `READMATES_DB_USER` | | `readmates` |
| `READMATES_EXPORT_DIR` | | `/var/backups/readmates/mysql` |
| `READMATES_MYSQL_DEFAULTS_FILE` | | `/etc/readmates/mysql-backup.cnf` (반드시 `0600`) |
| `READMATES_BACKUP_OBJECT_PREFIX` | | `mysql` |

- OCI CLI는 root로 실행되고 `/root/.oci/config`를 씁니다. instance principal을 쓰려면 같은 env 파일에 `OCI_CLI_AUTH=instance_principal`을 넣습니다.
- 스크립트는 VM의 `/opt/readmates/deploy/oci/`에 있어야 합니다. `05-deploy-compose-stack.sh`는 이 스크립트를 복사하지 않으므로 처음 한 번 직접 올립니다.

## 보관 정책 (retention)

보관 기간은 저장소가 아니라 **OCI Console → Bucket → Lifecycle Policy Rules**에서 운영자가 정합니다. Git에서는 실제 설정을 확인할 수 없습니다.

- 권장: 일일 백업(`mysql/readmates-<UTC timestamp>.sql.gz`)은 14–30일 후 만료.
- 릴리스 전 수동 백업(`mysql/readmates-pre-vX.Y.Z-...`)은 prefix로 구분해 일일 만료 규칙에서 빼 둡니다.
- 규칙을 바꾸면 `oci os object-lifecycle-policy get --namespace-name <object-storage-namespace> --bucket-name <backup-bucket>`으로 결과를 확인합니다.

## 일일 자동 백업

timer가 매일 **04:15 UTC**(KST 13:15)에 실행합니다. `RandomizedDelaySec=300`(0–5분 지연), `Persistent=true`(VM이 꺼져 놓친 실행은 켜진 뒤 한 번 실행)입니다.

### 설치 (다시 실행해도 안전)

```bash
scp -i <deploy-ssh-key> deploy/oci/backup-mysql.service deploy/oci/backup-mysql.timer ubuntu@<vm-public-ip>:/tmp/
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> '
  sudo install -m 0644 /tmp/backup-mysql.service /etc/systemd/system/backup-mysql.service
  sudo install -m 0644 /tmp/backup-mysql.timer   /etc/systemd/system/backup-mysql.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now backup-mysql.timer
'
```

### 상태 확인

```bash
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> '
  systemctl is-enabled backup-mysql.timer
  systemctl list-timers backup-mysql.timer
  sudo journalctl -u backup-mysql.service -n 50 --no-pager
'
```

성공하면 로그에 `UPLOADED: mysql/readmates-<timestamp>.sql.gz`와 `.sha256` 두 줄이 보입니다.

## 릴리스 전 수동 백업과 일일 timer 사이의 관계

두 백업은 충돌하지 않습니다. timer를 멈출 필요도 없습니다.

- timer와 스크립트는 항상 `readmates-<UTC timestamp>.sql.gz`로 만듭니다. 이름에 시각이 들어가 겹치지 않습니다.
- 릴리스 태그를 붙인 이름(`readmates-pre-vX.Y.Z-<timestamp>.sql.gz`)은 운영자가 아래 "태그 이름으로 올리기"에서 직접 붙입니다.

### 바로 한 번 백업 (timer와 같은 경로)

```bash
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> 'sudo systemctl start backup-mysql.service'
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> 'sudo journalctl -u backup-mysql.service -n 20 --no-pager'
```

### 태그 이름으로 올리기 (선택)

방금 만든 dump를 릴리스 태그 이름으로 한 벌 더 올립니다. OCI CLI가 있는 곳(VM 또는 운영자 워크스테이션)에서 실행합니다. 워크스테이션에서 한다면 먼저 VM의 `/var/backups/readmates/mysql/`에서 dump와 `.sha256`을 가져옵니다.

```bash
TS='<UTC timestamp>'          # 예: 20260925T041500Z
TAG='vX.Y.Z'
SRC="readmates-${TS}.sql.gz"
DST="mysql/readmates-pre-${TAG}-${TS}.sql.gz"

sha256sum -c "${SRC}.sha256"   # macOS: shasum -a 256 -c
SHA="$(awk '{print $1}' "${SRC}.sha256")"

oci os object put --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --name "$DST" --file "$SRC" \
  --metadata "{\"sha256\":\"$SHA\",\"tag\":\"pre-${TAG}\"}"
oci os object put --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --name "${DST}.sha256" --file "${SRC}.sha256"
```

## 객체 검증

```bash
oci os object list --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --prefix mysql/readmates- --query 'data[*].name' --output json

oci os object head --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --name "mysql/readmates-<timestamp>.sql.gz"
```

- 같은 이름의 `.sha256` 객체가 함께 있어야 합니다.
- 태그 이름으로 올린 객체는 `opc-meta-sha256` 값이 `.sha256` 파일의 hash와 같아야 합니다. 스크립트가 올린 일일 객체에는 이 metadata가 없습니다.

## Restore (복구) 절차

> production을 덮어쓰기 전에 반드시 staging schema에서 먼저 복구해 봅니다. production 복구는 운영 책임자 승인 후에만 합니다.

### 1. 객체 다운로드

```bash
OBJ='mysql/readmates-<timestamp>.sql.gz'
oci os object get --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --name "$OBJ" --file ./restore.sql.gz
oci os object get --namespace-name <object-storage-namespace> --bucket-name <backup-bucket> \
  --name "${OBJ}.sha256" --file ./restore.sql.gz.sha256
```

### 2. 무결성 검증

```bash
EXPECTED="$(awk '{print $1}' ./restore.sql.gz.sha256)"
ACTUAL="$(shasum -a 256 ./restore.sql.gz | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "SHA256 MISMATCH"; exit 1; }
```

### 3. Staging schema로 dry-run

DB에 닿는 곳(VM)에서 root로 실행합니다. 먼저 백업 env를 불러옵니다.

```bash
sudo -i
set -a; . /etc/readmates/backup-mysql.env; set +a
: "${READMATES_DB_USER:=readmates}"

mysql --defaults-extra-file=/etc/readmates/mysql-backup.cnf --host="$READMATES_DB_HOST" --user="$READMATES_DB_USER" \
  --execute "CREATE DATABASE IF NOT EXISTS readmates_restore_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gunzip -c ./restore.sql.gz | mysql --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_DB_HOST" --user="$READMATES_DB_USER" readmates_restore_staging
```

`readmates_restore_staging`에서 주요 table row count, `flyway_schema_history` 최신 version, FK 제약을 확인합니다.

### 4. Production schema 복구 (운영자 승인 후)

1. 쓰기를 멈춥니다: `sudo docker compose -f /opt/readmates/compose.yml stop readmates-api`
2. 현재 상태를 한 번 더 백업합니다: `sudo systemctl start backup-mysql.service` 후 로그에서 `UPLOADED` 확인.
3. schema를 다시 만들고 복구합니다.

```bash
mysql --defaults-extra-file=/etc/readmates/mysql-backup.cnf --host="$READMATES_DB_HOST" --user="$READMATES_DB_USER" \
  --execute "DROP DATABASE IF EXISTS readmates; CREATE DATABASE readmates CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gunzip -c ./restore.sql.gz | mysql --defaults-extra-file=/etc/readmates/mysql-backup.cnf \
  --host="$READMATES_DB_HOST" --user="$READMATES_DB_USER" readmates
```

4. 서버를 다시 올립니다: `sudo docker compose -f /opt/readmates/compose.yml up -d readmates-api`

### 5. 사후 검증

- `sudo docker compose -f /opt/readmates/compose.yml ps`에서 `readmates-api`가 healthy인지 확인합니다.
- 서버 로그에 Flyway 오류가 없는지 봅니다: `sudo docker compose -f /opt/readmates/compose.yml logs --since 10m readmates-api | grep -i flyway`
- BFF smoke와 [Post-deploy watch](post-deploy-watch.md)를 실행합니다.
- 복구 이력(시각, 사용한 객체 이름, 승인자)은 Git 밖 운영 기록에 남기고, 공개 기록에는 요약만 씁니다.

## Troubleshooting

- **`oci: command not found`**: VM에 OCI CLI가 없습니다. [OCI MySQL HeatWave](../../deploy/oci-mysql-heatwave.md)로 설치한 뒤 `sudo systemctl start backup-mysql.service`로 다시 실행합니다.
- **`MySQL defaults file must have 0600 permissions`**: `sudo chmod 600 /etc/readmates/mysql-backup.cnf && sudo chown root:root /etc/readmates/mysql-backup.cnf`
- **`NamespaceNotFound`**: `OCI_NAMESPACE` 오타이거나 OCI CLI 자격이 다른 tenancy를 가리킵니다. `oci os ns get`으로 확인합니다.
- **timer는 있는데 실행 흔적이 없음**: `systemctl status backup-mysql.timer`로 다음 실행 시각을, `sudo journalctl -u backup-mysql.service --since '24h ago'`로 실패 원인을 봅니다.

## 관련 문서

- [OCI MySQL HeatWave](../../deploy/oci-mysql-heatwave.md) — 초기 bootstrap, IAM policy, defaults file.
- [OCI backend](../../deploy/oci-backend.md) — VM과 Docker compose 흐름.
- `deploy/oci/backup-mysql-to-object-storage.sh` — 백업과 업로드.
- `deploy/oci/export-mysql.sh` — `mysqldump` wrapper.
