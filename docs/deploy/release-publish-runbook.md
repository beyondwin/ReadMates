# 새 버전 발행과 운영 배포 Runbook

검토일: 2026-09-25 (기준: `main` = `v2.5.1`)

새 제품 버전을 발행하고, 같은 tag로 OCI Compose 백엔드와 Cloudflare Pages 프론트엔드를 운영에 올리는 절차입니다. 세부 설정은 [Cloudflare Pages](cloudflare-pages.md), [OCI Compose Stack](compose-stack.md), [버저닝](../development/versioning.md)을 따릅니다.

실제 domain, VM IP, SSH key 경로, DB host, secret, smoke 결과 전문은 Git에 남기지 않습니다. 예시는 `https://app.example.com`(Pages 운영 origin), `api.example.com`(직접 API host), `<vm-public-ip>` placeholder를 씁니다.

## 한눈에 보기

| 순서 | 할 일 | 실행 주체 |
| --- | --- | --- |
| 1 | 검증, `CHANGELOG.md` 정리, release commit을 `main`에 반영 | 로컬 |
| 2 | annotated tag `vX.Y.Z` push | 로컬 |
| 3 | `Deploy Server Image` 성공 확인 (GHCR scan → promote) | GitHub Actions (tag push로 자동 시작) |
| 4 | runtime 설정이 바뀌었으면 `sync-config` (`restart_api=false`, `dry_run=false`) | GitHub Actions (수동) |
| 5 | `./deploy/oci/05-deploy-compose-stack.sh`로 OCI backend promotion | 로컬 → VM |
| 6 | `Deploy Front`를 `release_tag=vX.Y.Z`로 실행 | GitHub Actions (수동) |
| 7 | Smoke 확인 | 로컬 |
| 8 | GitHub Release 생성 | 로컬 |

한 단계라도 실패하면 다음 단계로 가지 않습니다. 이미 push한 tag는 옮기거나 덮어쓰지 않고, 고친 commit에서 새 patch tag를 발행합니다.

`Deploy Server Image`, `Deploy Front`, `sync-config` job은 모두 `production` environment를 씁니다. 저장소에 environment 보호 규칙이 있으면 GitHub Actions 화면에서 승인해야 진행됩니다.

## 완료 기준

- `CHANGELOG.md`에 `vMAJOR.MINOR.PATCH - YYYY-MM-DD` 섹션, Deployment Notes, 실제로 실행한 Verification이 있습니다.
- `main`이 release commit을 포함하고, annotated tag가 같은 commit을 가리킵니다.
- `Deploy Server Image`가 같은 tag에서 성공해 `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z`를 scan/promote했습니다.
- runtime 설정이 바뀐 릴리즈라면 `sync-config`가 `restart_api=false`, `dry_run=false`로 성공했습니다.
- 서버 변경이나 migration이 있으면 OCI Compose stack이 같은 tag로 재시작됐고 `/internal/health`, BFF auth smoke, OAuth redirect smoke가 통과했습니다.
- `Deploy Front`가 backend promotion 뒤 같은 `release_tag`로 성공했습니다.
- Major host-write contract 릴리즈라면 sync된 env에 `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true`가 있고, backend-first 구간의 구 client write 동결과 frontend 배포 후 재개를 확인했습니다.
- GitHub Release가 있고 body가 `CHANGELOG.md`의 같은 버전 섹션과 같습니다.
- 공개 릴리즈 후보 검사가 통과했거나, blocker와 남은 리스크가 release note에 적혀 있습니다.

## 사전 점검

지난 tag 이후 변경과 migration 여부를 봅니다.

```bash
git status --short --branch
git tag --sort=-v:refname | head
git log --oneline <previous-tag>..HEAD
git diff --name-only <previous-tag>..HEAD
git diff --name-only <previous-tag>..HEAD -- server/src/main/resources/db/mysql/migration server/src/main/kotlin front/functions front/src front/features
```

버전은 [versioning.md](../development/versioning.md)로 정합니다. 사용자 기능, 운영 기능, DB migration, API contract 추가가 있으면 기본은 minor입니다.

## 문서와 검증

1. `CHANGELOG.md`의 `Unreleased` 내용을 새 버전 섹션으로 옮깁니다.
2. `Deployment Notes`에 migration, 새 환경 변수, `sync-config` 필요 여부, 배포 순서, smoke를 적습니다.
3. 변경 범위에 맞는 검증을 실행하고, 실제 실행 결과만 `Verification`에 적습니다.

기본 release 검증:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
python3 -B scripts/check-deploy-workflow-contract.py --self-test
python3 -B scripts/check-deploy-workflow-contract.py
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

로컬 `pnpm` 버전이 루트 `package.json`의 `packageManager`와 다르면 `corepack pnpm ...`(또는 `npx --yes corepack@0.35.0 pnpm ...`)으로 실행합니다.

BFF, auth, frontend route, DB 기반 사용자 흐름이 바뀌었으면 E2E도 실행합니다. 못 했으면 이유를 release note에 남깁니다.

```bash
pnpm --dir front test:e2e
```

## Tag 발행

1. release 변경을 commit하고 `main`에 push합니다.

   ```bash
   git add CHANGELOG.md <changed-release-docs>
   git commit -m "chore(release): prepare vX.Y.Z"
   git push origin main
   ```

2. `CHANGELOG` Unreleased 가드를 포함한 release 점검을 실행합니다.

   ```bash
   ./scripts/pre-push-check.sh --release
   ```

3. annotated tag를 만들고 push합니다. lightweight tag는 workflow가 거절합니다.

   ```bash
   git tag -a vX.Y.Z -m "ReadMates vX.Y.Z"
   git push origin vX.Y.Z
   ```

- `main` push는 production 배포를 시작하지 않습니다.
- `v*` tag push는 `Deploy Server Image`만 시작합니다. 프론트엔드는 자동 배포되지 않습니다.
- `main` 직접 push(admin bypass)와 emergency bypass 기준은 [release-management.md](../development/release-management.md#branch-protection-bypass-policy)를 따릅니다. `--no-changelog-check`는 emergency에만 씁니다.

## GitHub Actions 확인

Tag push 뒤 server image workflow를 확인합니다.

```bash
gh run list --workflow "Deploy Server Image" --branch vX.Y.Z --limit 5
gh run watch <deploy-server-run-id> --exit-status
```

`Deploy Server Image`가 하는 일:

1. tag를 checkout하고 exact `vMAJOR.MINOR.PATCH`, annotated tag, tag commit = `HEAD`를 확인합니다.
2. `./server/gradlew -p server clean check bootJar`를 실행합니다.
3. `server/Dockerfile.release`로 `linux/arm64` scan 후보 image를 push합니다.
4. Trivy로 HIGH/CRITICAL 취약점을 검사합니다(수정 가능한 것만, 발견 시 실패).
5. 검사한 digest 그대로 `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z`로 promote하고 digest를 step summary에 남깁니다.

같은 tag로 다시 실행할 때는 `--ref`와 `image_tag`에 같은 tag를 넣습니다.

```bash
gh workflow run "Deploy Server Image" --ref vX.Y.Z -f image_tag=vX.Y.Z
```

성공하면 [Backend OCI Promotion](#backend-oci-promotion)으로 갑니다. 프론트엔드만 바뀐 릴리즈는 [Frontend 배포](#frontend-배포)로 바로 가도 됩니다.

## Backend OCI Promotion

서버 코드, migration, runtime 설정, 배포 script가 바뀐 릴리즈는 GHCR image 성공 뒤 OCI Compose stack을 같은 tag로 올립니다.

### 1. (필요 시) 운영 설정 동기화

runtime 렌더링 결과(환경 변수)가 바뀐 릴리즈만 실행합니다. 바뀌지 않았으면 건너뜁니다.

```bash
gh workflow run sync-config.yml --ref main -f restart_api=false -f dry_run=false
gh run list --workflow sync-config.yml --event workflow_dispatch --limit 5
gh run watch <sync-config-run-id> --exit-status
```

- `restart_api=false`: 구 image를 새 설정으로 먼저 재시작하지 않습니다. 새 설정은 다음 container 시작(= 아래 promotion)에서 읽힙니다.
- `dry_run=false`: VM의 `/etc/readmates/readmates.env`를 실제로 갱신합니다.
- 실패하면 promotion을 시작하지 않습니다.

### 2. 실행 전 확인

- VM의 `/etc/readmates/readmates.env`가 있고 권한이 `600`입니다.
- VM의 `/var/backups/readmates/mysql`에 최근 2일 안의 `*.sql.gz` backup이 있습니다. 없으면 script가 멈춥니다.
- GHCR package가 private이면 VM에서 registry login이 되어 있습니다.
- `Deploy Server Image`가 같은 tag에서 성공했습니다.

### 3. Promotion 실행

```bash
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
READMATES_APP_BASE_URL=https://app.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

`READMATES_APP_BASE_URL`은 BFF smoke와 post-deploy watch가 호출할 브라우저 origin입니다. 생략하면 script 안의 기본값을 쓰므로 운영 origin을 명시하는 편이 안전합니다.

Script가 하는 일(11단계): 로컬 파일 확인 → image source 결정(`ghcr.io/`가 아니면 로컬 build) → VM Docker 확인 → backup 확인 → 파일 전송 → compose/Caddyfile/systemd unit·`caddy.env`·`.env` 설치 → image pull(또는 load) → `compose config` 검증 → legacy host `readmates-server`·`caddy` 중지/disable → compose 시작과 `readmates-api` image ID 대조 → `/internal/health`. 이어서 BFF auth smoke와 post-deploy watch를 실행합니다. 자세한 내용은 [compose-stack.md](compose-stack.md)입니다.

### 4. Major host-write contract 릴리즈 확인

실데이터를 바꾸지 않고 배포 구간을 확인합니다. 아래 요청은 인증 cookie를 보내지 않으므로 mutation에 도달하지 않습니다.

```bash
APP_ORIGIN='https://app.example.com'

# Backend promotion 후, frontend 배포 전: 구 BFF가 contract를 보내지 않아 409.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Origin: $APP_ORIGIN" \
  "$APP_ORIGIN/api/bff/api/host/notifications/process"

# Frontend 배포 후: contract 누락은 여전히 409, 정확한 v2 선언은 인증 단계에서 401.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Origin: $APP_ORIGIN" \
  -H 'X-Readmates-Client-Contract: v2' \
  "$APP_ORIGIN/api/bff/api/host/notifications/process"
```

## Frontend 배포

Backend health와 BFF가 정상이면 같은 tag로 프론트엔드를 배포합니다.

```bash
gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
gh run list --workflow "Deploy Front" --event workflow_dispatch --limit 5
gh run watch <deploy-front-run-id> --exit-status
```

`Deploy Front`는 tag 형식과 checkout commit을 검사하고, lint/test/build 뒤 `front/dist`와 `front/functions`를 Cloudflare Pages production에 올립니다. 자세한 내용은 [Cloudflare 프론트 배포 보조 절차](../../deploy/cloudflare/README.md)입니다.

## Frontend Smoke

서버·API contract·migration·BFF/auth가 바뀐 릴리즈는 backend promotion과 frontend 배포가 모두 끝난 뒤 이 smoke를 최종 확인으로 씁니다. 프론트엔드만 바뀐 릴리즈는 Pages 배포 직후 실행합니다.

```bash
APP_ORIGIN='https://app.example.com'
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/app"
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/api/bff/api/auth/me"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP_ORIGIN/oauth2/authorization/google"
READMATES_SMOKE_BASE_URL="$APP_ORIGIN" \
READMATES_SMOKE_AUTH_BASE_URL="$APP_ORIGIN" \
./scripts/smoke-production-integrations.sh
```

등록된 club host도 볼 때는 실제 host를 Git 밖에서 `READMATES_SMOKE_CLUB_HOST`로 넘깁니다.

## 배포 후 확인

- migration이 있으면 Spring startup log나 Flyway schema history를 운영 채널에서 확인합니다.
- 알림/SMTP/Kafka가 바뀌었으면 호스트 알림 화면에서 preview/confirm, event ledger, pending/failed delivery를 sanitized summary로 확인합니다.
- Platform admin 화면이 바뀌었으면 익명 요청이 `/api/bff/api/admin/operations/cases`에서 막히는지 먼저 보고, OWNER/OPERATOR 읽기 전용 세션으로 `/admin/today`가 렌더링되는지 확인합니다. acknowledge·snooze·resolve 같은 실제 mutation은 별도 승인 없이 smoke로 실행하지 않습니다.
- 실제 멤버 이메일, 알림 본문, 운영 식별자는 release note에 쓰지 않습니다.

## GitHub Release 생성

`CHANGELOG.md`의 해당 버전 섹션을 release body로 씁니다.

```bash
awk '
  /^## vX[.]Y[.]Z - / { capture=1; next }
  capture && /^## / { exit }
  capture { print }
' CHANGELOG.md > .tmp/release-notes-vX.Y.Z.md

gh release create vX.Y.Z \
  --title "ReadMates vX.Y.Z" \
  --notes-file .tmp/release-notes-vX.Y.Z.md

gh release view vX.Y.Z --json tagName,name,url,publishedAt
```

이미 release가 있으면 `gh release edit`로 body를 고칩니다. tag가 있다고 Release가 있는 것은 아닙니다.

## Rollback 기준

- Frontend만 실패: 이전 정상 tag로 `Deploy Front`를 다시 실행하거나 새 patch tag를 발행합니다.
- v2 host-write gate가 켜진 backend에서 frontend만 이전 tag로 되돌리면 host 쓰기는 409로 계속 막힙니다. 정상입니다. 쓰기를 살리려면 호환 frontend를 다시 배포하거나 backend를 호환 image로 rollback/forward-fix합니다.
- Server image만 되돌리기: [compose-stack.md](compose-stack.md#rollback) 절차를 따릅니다.

  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@<vm-public-ip> 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" "ghcr.io/<owner>/<repo>/readmates-server:<previous-tag>" | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
  ```

- Rollback 뒤에도 BFF auth smoke와 OAuth redirect smoke를 다시 실행합니다.
