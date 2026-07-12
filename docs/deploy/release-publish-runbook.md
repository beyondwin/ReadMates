# 새 버전 발행과 운영 배포 Runbook

검토일: 2026-07-12

이 문서는 ReadMates 새 제품 버전을 발행하고, 같은 tag로 Cloudflare Pages 프론트엔드와 OCI Compose 백엔드를 운영에 반영하는 절차입니다. 세부 설정 기준은 [Cloudflare Pages](cloudflare-pages.md), [OCI Compose Stack](compose-stack.md), [버저닝](../development/versioning.md)을 우선합니다.

실제 운영 domain, VM IP, SSH key path, DB host, OAuth secret, BFF secret, smoke 결과 전문은 Git에 남기지 않습니다. 문서와 release note에는 sanitized summary와 placeholder만 기록합니다.

## 완료 기준

릴리즈가 완료됐다고 보려면 아래가 모두 맞아야 합니다.

- `CHANGELOG.md`에 `vMAJOR.MINOR.PATCH - YYYY-MM-DD` 섹션, deployment notes, 실행한 verification이 있습니다.
- `main`이 release commit을 포함하고, `vMAJOR.MINOR.PATCH` annotated tag가 같은 commit을 가리킵니다.
- GitHub Release가 존재하고 body가 `CHANGELOG.md`의 같은 버전 섹션과 일치합니다.
- `Deploy Front` workflow가 같은 tag에서 성공해 Cloudflare Pages production을 배포했습니다.
- `Deploy Server Image` workflow가 같은 tag에서 성공해 GHCR `readmates-server:vMAJOR.MINOR.PATCH` 이미지를 scan/promote했습니다.
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

`main` push는 production 배포를 시작하지 않습니다. `v*` tag push가 production Cloudflare Pages 배포와 GHCR server image publish workflow를 시작합니다.

Branch protection bypass 정책은 [release-management.md#branch-protection-bypass-policy](../development/release-management.md#branch-protection-bypass-policy)를 참조합니다. `main` direct push (admin bypass) 허용 조건, release PR 강제 조건, emergency bypass ledger 기록 기준이 그 절에 정리되어 있습니다. Release tag push 직전에는 `./scripts/pre-push-check.sh --release`를 실행해 `CHANGELOG Unreleased` 가드를 통과시키고, 통과가 어려운 emergency 상황에서만 `--no-changelog-check`로 우회합니다.

## GitHub Actions 확인

Tag push 뒤 같은 tag의 배포 workflow를 확인합니다.

```bash
gh run list --workflow "Deploy Front" --branch vX.Y.Z --limit 5
gh run list --workflow "Deploy Server Image" --branch vX.Y.Z --limit 5
gh run watch <deploy-front-run-id> --exit-status
gh run watch <deploy-server-run-id> --exit-status
```

`Deploy Front`는 `front/dist`와 `front/functions`를 Cloudflare Pages production에 배포합니다. `Deploy Server Image`는 scan candidate digest를 Trivy로 검사한 뒤 같은 digest를 `ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z`로 promote합니다.

서버/API/frontend contract가 함께 바뀐 릴리스에서는 `Deploy Front` 성공만으로 final smoke를 끝내지 않습니다. `Deploy Server Image`가 같은 tag의 GHCR image를 promote하고, OCI Compose backend promotion이 끝난 뒤 frontend-facing smoke를 최종 판정으로 삼습니다. 새 frontend가 구 backend를 잠시 만날 수 있는 tag-push window는 frontend 하위호환 처리로 완화하되, release 완료 판정은 backend promotion 이후에만 내립니다.

둘 중 하나가 실패하면 운영 배포를 진행하지 않습니다. 실패 원인은 GitHub Actions log와 artifact를 보고 수정한 뒤 새 patch tag로 다시 발행합니다. 이미 push된 tag를 force update하지 않습니다.

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

Cloudflare Pages 배포 workflow가 성공한 뒤 browser-facing origin을 확인합니다.

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

스크립트는 legacy host `readmates-server`와 host `caddy`를 중지하고, compose stack의 `readmates-api` 이미지 ID가 기대 이미지와 같은지 확인한 뒤 `/internal/health`, BFF auth smoke, post-deploy watch를 실행합니다.

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

서버/API/frontend contract가 함께 바뀐 platform-admin 릴리스는 OWNER 또는 OPERATOR 권한으로 `/admin/analytics`를 열어 KPI 카드와 trend table이 렌더링되는지 확인합니다. trend `series`가 충분하지 않은 환경에서는 빈 trend 상태가 렌더링되는지 확인하고, 실제 멤버 데이터나 운영 식별자는 기록하지 않습니다.

## Rollback 기준

Frontend만 실패하면 이전 정상 tag의 Cloudflare Pages 배포를 재배포하거나 새 patch tag를 발행합니다.

서버 image만 되돌릴 때는 [compose-stack.md](compose-stack.md#rollback)의 rollback 절차를 따릅니다.

```bash
ssh -i ~/.ssh/readmates_oci ubuntu@VM_PUBLIC_IP 'cd /opt/readmates && printf "READMATES_SERVER_IMAGE=%s\n" "ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z-previous" | sudo tee .env >/dev/null && sudo docker compose -f compose.yml up -d readmates-api'
```

Rollback 후에도 BFF auth smoke와 OAuth redirect smoke를 다시 실행합니다.
