# Post-deploy Watch

Post-deploy watch는 backend compose 배포 직후 5-10분 동안 health, BFF/OAuth smoke, recent log error를 묶어 확인하는 절차입니다. 실패 시 자동 rollback하지 않고 운영자가 판단합니다.

## 배포 script 통합

`deploy/oci/05-deploy-compose-stack.sh`는 기본적으로 post-deploy watch를 실행합니다. 장애 대응 중 watch를 별도로 수행해야 하면 아래처럼 배포 script의 자동 watch만 끕니다.

```bash
READMATES_RUN_POST_DEPLOY_WATCH=false \
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

watch를 끈 경우 같은 release 작업 안에서 `deploy/oci/watch-compose-post-deploy.sh`를 수동 실행합니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
VM_PUBLIC_IP='<vm-public-ip>' \
SSH_KEY='<path-to-ssh-key>' \
REMOTE_USER='<remote-user>' \
./deploy/oci/watch-compose-post-deploy.sh
```

## 기본 실행

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/watch-compose-post-deploy.sh
```

Registered club host를 함께 확인할 때만 아래 값을 추가합니다.

```bash
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host>
```

## 확인 항목

1. VM에서 `readmates-stack` systemd 상태 확인.
2. `/opt/readmates/compose.yml` 기준 `docker compose ps` 확인.
3. `readmates-api` container 내부 `/internal/health` 확인.
4. Cloudflare BFF `/api/bff/api/auth/me` smoke 확인. BFF 시크릿 rotation 의심 시 `GET /api/bff/__internal/secret-status`로 configured secret count, rotation stage, primary fingerprint(SHA-256 첫 6자)를 확인합니다(raw secret 미노출).
5. `scripts/smoke-production-integrations.sh`로 Pages marker와 OAuth redirect URI 확인.
6. 최근 로그에서 `ERROR`, `Exception`, `Caused by` 패턴 확인.

## 실패 판정

- health endpoint가 timeout 또는 non-2xx를 반환한다.
- BFF auth smoke가 network 또는 5xx로 실패한다.
- OAuth redirect smoke에서 기대 auth base URL과 다른 `redirect_uri`가 나온다.
- 새 배포 이후 반복적인 `ERROR` 또는 exception chain이 발생한다.

## 실패 시 행동

1. 같은 watch를 자동 재시도하지 않습니다.
2. `docs/operations/runbooks/deploy-attempts.md`의 실패 stage 기준으로 분류합니다.
3. `deploy/oci/readmates-collect.sh`로 read-only snapshot을 수집합니다.
4. 이전 image rollback 또는 runtime env 조사를 운영자가 선택합니다.

## 결과 기록

공개 문서에는 summary만 남깁니다.

```text
Post-deploy watch: health/BFF/OAuth smoke 통과, recent ERROR 없음. 운영 출력 전문은 Git 밖에 보관.
```
