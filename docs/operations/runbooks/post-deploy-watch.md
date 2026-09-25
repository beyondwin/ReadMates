# Post-deploy Watch

backend compose 배포 직후 health, BFF/OAuth smoke, 최근 ERROR 로그를 한 번에 확인하는 절차입니다. 실패해도 자동 rollback은 없습니다. 운영자가 판단합니다.

## 언제 쓰나

- `deploy/oci/05-deploy-compose-stack.sh`는 기본으로 watch를 실행합니다(`READMATES_RUN_POST_DEPLOY_WATCH=true`). 보통은 따로 할 일이 없습니다.
- 장애 대응 중 watch를 따로 돌려야 하면 배포 스크립트의 자동 watch만 끄고, 같은 release 작업 안에서 수동으로 실행합니다.

## 1. 자동 watch 끄고 배포 (선택)

```bash
READMATES_RUN_POST_DEPLOY_WATCH=false \
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

## 2. 수동 실행

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
VM_PUBLIC_IP='<vm-public-ip>' \
SSH_KEY='<path-to-ssh-key>' \
REMOTE_USER='<remote-user>' \
./deploy/oci/watch-compose-post-deploy.sh
```

- `SSH_KEY`, `REMOTE_USER`를 생략하면 스크립트 기본값을 씁니다.
- 등록된 club host도 확인하려면 `READMATES_SMOKE_CLUB_HOST=https://<registered-club-host>`를 추가합니다.
- 배포 스크립트 안에서 실행되면 부모 `attemptId`를 이어받습니다. 수동 실행 때 같은 attempt로 묶으려면 `READMATES_DEPLOY_ATTEMPT_ID=<attempt-id>`를 넘깁니다.

## 확인 항목

스크립트는 아래 순서로 확인하고 단계마다 [deploy ledger](deploy-attempts.md)에 event를 남깁니다.

1. VM의 `readmates-stack` systemd 상태와 `/opt/readmates/compose.yml` 기준 `docker compose ps`.
2. `readmates-api` 컨테이너 안에서 `/internal/health`.
3. Cloudflare BFF `GET /api/bff/api/auth/me`.
4. `scripts/smoke-production-integrations.sh`로 Pages marker와 OAuth `redirect_uri`.
5. 최근 10분 `readmates-api` 로그에서 `ERROR` 줄 grep.

## 실패 판정

- health가 timeout이거나 2xx가 아니다.
- BFF auth smoke가 network 오류나 5xx로 실패한다.
- OAuth smoke의 `redirect_uri`가 기대한 auth base URL과 다르다.
- 최근 10분 로그에 `ERROR` 줄이 있다 (ledger: `CHECK_FAILED reason=error-grep`).

## 실패하면

1. 같은 watch를 자동 재시도하지 않습니다.
2. [Deploy attempts](deploy-attempts.md#실패-stage별-1차-확인)의 stage 표로 분류합니다.
3. `deploy/oci/readmates-collect.sh`로 읽기 전용 snapshot을 모읍니다([Read-only diagnostics](read-only-diagnostics.md)).
4. 이전 image rollback 또는 runtime env 조사를 운영자가 고릅니다. Rollback 명령은 [OCI Compose Stack](../../deploy/compose-stack.md#rollback)을 따릅니다.

## 기록

공개 문서에는 요약만 남깁니다.

```text
Post-deploy watch: health/BFF/OAuth smoke 통과, recent ERROR 없음. 운영 출력 전문은 Git 밖에 보관.
```
