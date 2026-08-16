# 새 버전 발행과 운영 배포 Runbook

검토일: 2026-08-17

이 문서는 ReadMates 새 제품 버전을 발행하고, 같은 tag로 Cloudflare Pages 프론트엔드와 OCI Compose 백엔드를 운영에 반영하는 절차입니다. 세부 설정 기준은 [Cloudflare Pages](cloudflare-pages.md), [OCI Compose Stack](compose-stack.md), [버저닝](../development/versioning.md)을 우선합니다.

실제 운영 domain, VM IP, SSH key path, DB host, OAuth secret, BFF secret, smoke 결과 전문은 Git에 남기지 않습니다. 문서와 release note에는 sanitized summary와 placeholder만 기록합니다.

## 완료 기준

릴리즈가 완료됐다고 보려면 아래가 모두 맞아야 합니다.

- `CHANGELOG.md`에 `vMAJOR.MINOR.PATCH - YYYY-MM-DD` 섹션, deployment notes, 실행한 verification이 있습니다.
- `main`이 release commit을 포함하고, `vMAJOR.MINOR.PATCH` annotated tag가 같은 commit을 가리킵니다.
- GitHub Release가 존재하고 body가 `CHANGELOG.md`의 같은 버전 섹션과 일치합니다.
- `Deploy Front` workflow가 backend promotion 뒤 같은 `release_tag` 입력으로 성공해 Cloudflare Pages production을 배포했습니다.
- `Deploy Server Image` workflow가 같은 tag에서 성공해 GHCR `readmates-server:vMAJOR.MINOR.PATCH` 이미지를 scan/promote했습니다.
- Release에서 production runtime rendering이 바뀌면 `sync-config` workflow가 `restart_api=false`, `dry_run=false`로 성공해 다음 container start가 새 설정을 읽도록 준비했습니다.
- Major host-write contract release이면 sync된 env에 `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true`가 있고, backend-first 창의 구 client write 동결과 same-tag frontend 배포 후 재개를 확인했습니다.
- 서버 변경이나 DB migration이 있으면 OCI Compose stack이 같은 GHCR tag로 재시작됐고 `/internal/health`, BFF auth smoke, OAuth redirect smoke가 통과했습니다.
- 공개 릴리즈 후보 검사가 통과했거나, blocker와 남은 리스크가 release note에 명확히 남아 있습니다.

## 사전 점검

릴리즈 전에는 tag 이후 누적 변경과 migration 여부를 먼저 봅니다.

```bash
git status --short --branch
git tag --sort=-v:refname | head
git log --oneline <previous-tag>..HEAD
git diff --name-only <previous-tag>..HEAD
git diff --name-only <previous-tag>..HEAD -- server/src/main/resources/db/mysql/migration server/src/main/kotlin front/functions front/src front/features
```

버전 판단은 [versioning.md](../development/versioning.md)를 따릅니다. 사용자 기능, 운영 기능, DB migration, API contract 추가가 있으면 patch가 아니라 minor release를 기본으로 봅니다.

## 문서와 검증

1. `CHANGELOG.md`의 `Unreleased` 내용을 새 버전 섹션으로 승격합니다.
2. `Deployment Notes`에 DB migration, 새 환경 변수, 서버/프론트 배포 순서, 운영 smoke를 명시합니다.
3. 변경 범위에 맞는 검증을 실행하고 `Verification`에 실제 실행 결과만 적습니다.

권장 release baseline:

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

BFF, auth, frontend route, DB-backed 사용자 흐름이 바뀐 릴리즈는 가능하면 E2E도 실행합니다.

```bash
pnpm --dir front test:e2e
```

E2E를 실행하지 못하면 release note와 최종 배포 보고에 스킵 사유를 남깁니다.

## Tag 발행

릴리즈 문서 변경을 `main`에 커밋하고 push한 뒤 annotated tag를 생성합니다.

```bash
git add CHANGELOG.md docs/deploy/release-publish-runbook.md docs/deploy/README.md docs/development/release-management.md
git commit -m "docs: prepare vX.Y.Z release"
git push origin main
git tag -a vX.Y.Z -m "ReadMates vX.Y.Z"
git push origin vX.Y.Z
```

`main` push는 production 배포를 시작하지 않습니다. exact `vMAJOR.MINOR.PATCH` tag push는 GHCR server image publish workflow만 시작합니다. Server workflow는 annotated tag 자체를 checkout하고 tag가 가리키는 commit과 `HEAD`가 일치하는지 build 전에 검증합니다. Cloudflare Pages production은 server image scan/promote와 OCI backend health 확인 뒤 같은 tag를 `release_tag`로 입력해 수동 배포합니다.

Branch protection bypass 정책은 [release-management.md#branch-protection-bypass-policy](../development/release-management.md#branch-protection-bypass-policy)를 참조합니다. `main` direct push (admin bypass) 허용 조건, release PR 강제 조건, emergency bypass ledger 기록 기준이 그 절에 정리되어 있습니다. Release tag push 직전에는 `./scripts/pre-push-check.sh --release`를 실행해 `CHANGELOG Unreleased` 가드를 통과시키고, 통과가 어려운 emergency 상황에서만 `--no-changelog-check`로 우회합니다.

## GitHub Actions 확인

Tag push 뒤 먼저 같은 tag의 server image workflow를 확인합니다.

```bash
gh run list --workflow "Deploy Server Image" --branch vX.Y.Z --limit 5
gh run watch <deploy-server-run-id> --exit-status
```

`Deploy Server Image`는 scan candidate digest를 Trivy로 검사한 뒤 같은 digest를 `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z`로 promote합니다. 성공 후 [Backend OCI Promotion](#backend-oci-promotion)을 먼저 완료합니다.

같은 release tag의 server image workflow를 수동으로 다시 실행할 때도 branch source와 image tag를 섞지 않습니다. Workflow definition과 checkout source가 모두 같은 annotated tag를 가리키도록 `--ref`와 `image_tag`에 같은 값을 사용합니다.

```bash
gh workflow run "Deploy Server Image" --ref vX.Y.Z -f image_tag=vX.Y.Z
```

Workflow는 generic Docker tag, lightweight tag, tag commit과 checkout `HEAD` 불일치를 build 전에 거절합니다. Pushed tag와 manual dispatch는 같은 release-tag concurrency key를 사용하고, Trivy가 검사한 digest와 release tag로 promote하는 digest가 다르면 실패해야 합니다. 실패한 source tag는 이동하거나 덮어쓰지 않고 수정한 commit에서 새 patch tag를 발행합니다.

Backend health와 BFF contract를 확인한 뒤 frontend workflow를 같은 release tag로 수동 실행합니다.

```bash
gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
gh run list --workflow "Deploy Front" --event workflow_dispatch --limit 5
gh run watch <deploy-front-run-id> --exit-status
```

`Deploy Front`는 입력 tag 형식을 검사하고 checkout commit이 그 tag를 가리키는지 확인한 뒤 `front/dist`와 `front/functions`를 Cloudflare Pages production에 배포합니다. Server image, OCI promotion, frontend 중 하나가 실패하면 다음 단계로 진행하지 않습니다. 실패 원인은 GitHub Actions log와 artifact를 보고 수정한 뒤 새 patch tag로 다시 발행합니다. 이미 push된 tag를 force update하지 않습니다.

## GitHub Release 생성

`CHANGELOG.md`의 해당 버전 섹션을 release body로 사용합니다.

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

이미 release가 있으면 `gh release edit`로 body를 갱신합니다. Tag 존재만으로 GitHub Release가 생성됐다고 판단하지 않습니다.

## Frontend Smoke

서버 코드, API contract, DB migration, BFF/auth, 또는 frontend가 소비하는 server response shape가 바뀐 릴리스는 `Backend OCI Promotion`을 먼저 완료한 뒤 이 섹션의 frontend smoke를 final smoke로 실행합니다. frontend-only 릴리스는 Cloudflare Pages 성공 뒤 바로 이 섹션을 실행할 수 있습니다.

Backend OCI promotion 뒤 같은 tag의 Cloudflare Pages 배포 workflow가 성공하면 browser-facing origin을 확인합니다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

Registered club host를 같이 확인할 때는 실제 host를 Git 밖에서 `READMATES_SMOKE_CLUB_HOST`로 주입합니다.

## Backend OCI Promotion

서버 코드, DB migration, runtime 설정, 배포 script 변경이 포함된 릴리즈는 GHCR image workflow 성공 뒤 OCI Compose stack을 같은 제품 tag로 올립니다.

Production runtime rendering이 바뀐 릴리즈는 container를 먼저 재시작하지 않고 현재 `main`의 `sync-config`를 성공시킨 뒤 image promotion을 실행합니다.

```bash
gh workflow run sync-config.yml \
  --ref main \
  -f restart_api=false \
  -f dry_run=false
gh run list --workflow sync-config.yml --event workflow_dispatch --limit 5
gh run watch <sync-config-run-id> --exit-status
```

`restart_api=false`는 구 image를 새 설정으로 먼저 재시작하지 않기 위한 값입니다. `dry_run=false`는 검증만 하는 것이 아니라 운영 env 파일을 실제 동기화합니다. Major host-write contract release에서는 이 단계가 `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true`를 기록하고, v2 image가 시작될 때부터 구 client write를 fail closed하도록 준비합니다. Workflow가 실패하면 OCI promotion을 시작하지 않습니다.

```bash
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

실행 전 조건:

- `/etc/readmates/readmates.env`가 VM에 있고 권한이 `600`입니다.
- DB backup이 Git 밖의 운영 backup 위치에 있으며 최근 48시간 이내입니다.
- GHCR package가 private이면 VM의 registry login이 Git 밖의 credential로 준비되어 있습니다.
- `Deploy Server Image` workflow가 같은 tag에서 성공했습니다.
- Runtime rendering이 바뀌었다면 `sync-config` workflow가 `restart_api=false`, `dry_run=false`로 성공했습니다.

스크립트는 legacy host `readmates-server`와 host `caddy`를 중지하고, compose stack의 `readmates-api` 이미지 ID가 기대 이미지와 같은지 확인한 뒤 `/internal/health`, BFF auth smoke, post-deploy watch를 실행합니다.

Major host-write contract release에서는 실데이터 mutation 없이 배포 창을 확인합니다. 아래 probe는 인증 cookie를 보내지 않으므로 controller mutation에 도달하지 않습니다.

```bash
# Backend promotion 후/Frontend 배포 전: 구 BFF가 contract를 전달하지 않아 409.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST \
  -H 'Origin: https://readmates.pages.dev' \
  https://readmates.pages.dev/api/bff/api/host/notifications/process

# Frontend + Pages Functions 배포 후에도 contract 누락은 409.
# 정확한 v2 선언은 contract gate를 통과한 뒤 인증 계층에서 401이어야 합니다.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST \
  -H 'Origin: https://readmates.pages.dev' \
  -H 'X-Readmates-Client-Contract: v2' \
  https://readmates.pages.dev/api/bff/api/host/notifications/process
```

## 배포 후 확인

서버 promotion 뒤에는 최소한 아래를 확인합니다.

```bash
curl -fsS https://readmates.pages.dev/api/bff/api/auth/me
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

DB migration이 있는 릴리즈는 Spring startup log 또는 Flyway schema history를 운영자 채널에서 확인합니다. 결과 전문이나 실제 DB identifier는 Git에 남기지 않습니다.

알림/SMTP/Kafka가 바뀐 릴리즈는 호스트 알림 화면에서 preview/confirm, event ledger, pending/failed delivery 상태를 sanitized summary로 확인합니다. 실제 멤버 이메일, 알림 본문, club 운영 데이터는 release note에 쓰지 않습니다.

서버/API/frontend contract가 함께 바뀐 platform-admin 릴리스는 먼저 익명 요청이 `/api/bff/api/admin/operations/cases`에서 인증 경계를 지키는지 확인합니다. 그 뒤 OWNER 또는 OPERATOR의 읽기 전용 세션으로 `/admin/today`의 queue/detail, source status와 canonical detail link가 렌더링되는지 확인하고 SUPPORT에는 lifecycle action이 노출되지 않는지 확인합니다. 실제 acknowledge·snooze·resolve mutation은 별도 운영 승인 없이 smoke로 실행하지 않으며, 실제 멤버 데이터나 운영 식별자는 기록하지 않습니다.

## Rollback 기준

Frontend만 실패하면 이전 정상 tag의 Cloudflare Pages 배포를 재배포하거나 새 patch tag를 발행합니다.

v2 host-write gate가 켜진 backend에서 frontend만 이전 tag로 rollback하면 host mutation이 409로 동결되는 것이 정상입니다. 쓰기를 복구하려면 호환 frontend를 다시 배포하거나 backend도 schema를 보존한 호환 image로 rollback/forward-fix합니다.

서버 image만 되돌릴 때는 [compose-stack.md](compose-stack.md#rollback)의 rollback 절차를 따릅니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" "ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z-previous" | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
```

Rollback 후에도 BFF auth smoke와 OAuth redirect smoke를 다시 실행합니다.
