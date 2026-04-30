# 버저닝

ReadMates의 제품 릴리즈 버전은 Git tag와 `CHANGELOG.md`, GitHub Release가 source of truth입니다. 서버 Gradle `version = "0.0.1-SNAPSHOT"`과 `front/package.json`은 빌드 도구 metadata이며 제품 릴리즈 번호로 쓰지 않습니다.

## Source of Truth

| 항목 | 역할 |
| --- | --- |
| Git tag `vMAJOR.MINOR.PATCH` | 배포 가능한 제품 버전과 Cloudflare Pages frontend deployment trigger |
| `CHANGELOG.md` | 저장소에 남는 버전별 릴리즈 노트 |
| GitHub Release | 공개 사용자와 운영자가 보는 tag별 릴리즈 노트 |
| OCI compose image tag | 서버 배포 시 운영 VM에 올리는 container image 식별자. 제품 tag와 맞춰 `readmates-server:vMAJOR.MINOR.PATCH`를 권장 |

제품 버전은 하나만 올립니다. Server와 frontend를 각각 다른 semantic version으로 관리하지 않고, 같은 Git tag가 backend code, frontend code, Pages Functions, deployment scripts, docs를 함께 가리킵니다.

## Version Bump Rules

ReadMates는 `vMAJOR.MINOR.PATCH` 형식을 사용합니다.

| 변경 | 예시 | Bump |
| --- | --- | --- |
| 호환성 깨짐 | URL/API/auth/session model을 운영자가 다시 맞춰야 하는 변경 | Major |
| 사용자 기능 또는 운영 기능 추가 | 새 알림 템플릿, 새 호스트 운영 흐름, 새 배포 runtime | Minor |
| 버그 수정, 문서 보강, 작은 UX 수정 | 배포 runbook 보강, regression fix, copy fix | Patch |

하나의 릴리즈에 minor와 patch 성격이 섞이면 더 큰 bump를 선택합니다. DB migration이나 서버 API 변경이 있으면 `CHANGELOG.md`의 `Deployment Notes`에 서버 배포 순서와 Flyway 기대 상태를 남깁니다.

## Release Flow

1. `CHANGELOG.md`의 `Unreleased` 내용을 새 `## vX.Y.Z - YYYY-MM-DD` 섹션으로 옮깁니다.
2. `docs/development/release-management.md`와 이 문서가 현재 절차와 맞는지 확인합니다.
3. 변경 범위에 맞는 검증을 실행합니다.
4. 릴리즈 문서 변경을 `main`에 커밋하고 push합니다.
5. 서버 변경이 있으면 먼저 OCI backend를 같은 버전 image tag로 배포합니다.
6. `git tag -a vX.Y.Z -m "ReadMates vX.Y.Z"`를 만들고 push합니다.
7. Tag push가 `.github/workflows/deploy-front.yml`을 통해 Cloudflare Pages frontend와 Pages Functions를 배포합니다.
8. GitHub Release body는 `CHANGELOG.md`의 해당 버전 섹션과 맞춥니다.

`main` push만으로는 frontend production 배포가 시작되지 않습니다. Production frontend 배포 기준은 `v*` tag push입니다.

## Server Image Tags

OCI compose 배포 script는 `READMATES_SERVER_IMAGE`가 없으면 `readmates-server:local`을 사용합니다. 릴리즈 배포에서는 아래처럼 제품 tag와 같은 image tag를 명시합니다.

```bash
READMATES_SERVER_IMAGE=readmates-server:vX.Y.Z \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

Rollback은 `/opt/readmates/.env`의 `READMATES_SERVER_IMAGE`를 이전 검증 tag로 되돌린 뒤 `readmates-api`를 다시 올리는 방식입니다. 실제 VM IP, private host, secret, smoke 결과 전문은 Git에 남기지 않습니다.

## Done Criteria

릴리즈 버전 작업은 아래가 맞을 때 완료입니다.

- `CHANGELOG.md`에 새 버전 섹션, deployment notes, verification 결과가 있습니다.
- Git tag, GitHub Release title, 서버 image tag가 같은 `vX.Y.Z`를 사용합니다.
- 서버 변경이 있으면 backend 배포와 `/internal/health` smoke가 통과했거나, 배포 blocker가 명확히 기록되어 있습니다.
- Frontend tag deployment workflow가 성공했거나, GitHub Actions blocker가 명확히 기록되어 있습니다.
- 공개 릴리즈 후보 scan이 통과했거나, 실행하지 못한 사유가 남아 있습니다.
