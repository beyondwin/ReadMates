# 릴리즈 관리

ReadMates는 Git tag, GitHub Releases, `CHANGELOG.md`를 함께 씁니다.

- GitHub Release: 태그별 공개 릴리즈 노트
- `CHANGELOG.md`: 저장소에 남는 같은 내용의 기록
- 제품 버전 기준(`vMAJOR.MINOR.PATCH` tag, server/frontend 공통)은 [versioning.md](versioning.md)를 따릅니다.

## 원칙

- 릴리즈 노트는 커밋 목록이 아니라 사용자와 운영자 관점으로 작성합니다.
- 기능 변경, 권한 경계, DB migration, 배포 순서, 검증 결과를 분리해 적습니다.
- 실제 VM IP, private DB host, OAuth secret, BFF secret, DB password, OCID, 실명 멤버 데이터는 쓰지 않습니다.
- GitHub 자동 생성 노트는 초안으로만 사용하고, 최종 노트는 사람이 읽기 좋게 정리합니다.
- 서버 API나 DB migration이 포함된 릴리즈는 `Deployment Notes`를 반드시 둡니다.

- 변경 범위, 배포 순서, DB migration 여부, 실행한 검증, 공개 후보 검사 결과가 서로 맞아야 합니다.
- 실행하지 못한 검증은 성공처럼 쓰지 않고 스킵 사유와 남은 리스크를 적습니다.
- Tag push, GitHub Release 생성, production 배포, secret rotation은 명시적 요청이 있을 때만 실행합니다.

## 버전 규칙

ReadMates는 `vMAJOR.MINOR.PATCH` 형식의 semantic version을 사용합니다.

| 변경 종류 | 예시 | 버전 |
| --- | --- | --- |
| 사용자 기능 추가 | 피드백 문서 템플릿 v2 같은 새 기능 | MINOR (예: `v2.4.1` → `v2.5.0`) |
| 버그 수정, 보안 patch, 문서 보강 | 취약 의존성 고정, stale copy 수정 | PATCH (예: `v2.4.0` → `v2.4.1`) |
| 호환성 깨지는 변경 | 운영자가 배포 순서, DB, API client, URL을 다시 맞춰야 하는 변경 | MAJOR |

## 릴리즈 노트 구조

```markdown
## vX.Y.Z - YYYY-MM-DD

### Highlights

사용자가 체감하는 핵심 변화 2-3문장.

### Added

- 새 기능

### Changed

- 기존 동작 변경

### Fixed

- 버그 수정

### Deployment Notes

- DB migration 필요 여부
- 서버와 프론트 배포 순서
- 운영 smoke check 기대값

### Verification

- 실행한 검증 명령
```

빈 섹션은 뺍니다. 현재 `CHANGELOG.md`처럼 `Highlights`에 기능 설명을 모으고 `Changed`, `Fixed`, `Deployment Notes`, `Verification`을 필요한 만큼 둬도 됩니다.

## 릴리즈 절차

1. 변경 범위를 확인합니다.

   ```bash
   git status --short --branch
   git log --oneline <previous-tag>..HEAD
   git diff --name-only <previous-tag>..HEAD
   ```

2. DB migration과 서버 API 변경 여부를 확인합니다.

   ```bash
   git diff --name-only <previous-tag>..HEAD -- server/src/main/resources/db/mysql/migration server/src/main/kotlin
   ```

3. `CHANGELOG.md`의 `## Unreleased` 내용을 새 버전 섹션으로 옮깁니다.

4. 필요한 검증을 실행합니다.

   Frontend:

   ```bash
   pnpm --dir front lint
   pnpm --dir front test
   pnpm --dir front build
   ```

   Server:

   ```bash
   ./scripts/server-ci-check.sh
   ./server/gradlew -p server integrationTest
   ```

   API, auth, BFF, DB migration, 사용자 흐름 변경:

   ```bash
   pnpm --dir front test:e2e
   ```

   Public release safety:

   ```bash
   ./scripts/build-public-release-candidate.sh
   ./scripts/public-release-check.sh .tmp/public-release-candidate
   ```

5. 릴리즈 노트를 커밋합니다.

   ```bash
   git add CHANGELOG.md
   git commit -m "chore(release): prepare vX.Y.Z"
   ```

6. 태그를 만듭니다.

   ```bash
   git tag -a vX.Y.Z -m "ReadMates vX.Y.Z"
   ```

7. `main`과 release tag를 push합니다.

   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

   - `main` push는 CI만 실행합니다. production 배포는 시작하지 않습니다.
   - `v*` tag push는 `Deploy Server Image`(GHCR image scan/promote)만 시작합니다. Trivy가 scan한 digest를 같은 tag로 promote했는지 확인합니다. 수동 실행 시 release tag/ref에서 실행하고 input `image_tag`에도 같은 tag를 넣습니다.
   - Cloudflare Pages 배포는 backend promotion과 health 확인 뒤 같은 tag로 수동 실행합니다. 새 frontend가 구 backend를 먼저 호출하지 않게 하기 위해서입니다.
   - 발행과 배포를 한 번에 할 때는 [새 버전 발행과 운영 배포 Runbook](../deploy/release-publish-runbook.md)을 따릅니다.

   ```bash
   READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:vX.Y.Z' \
   VM_PUBLIC_IP='<vm-public-ip>' \
   CADDY_SITE=api.example.com \
   ./deploy/oci/05-deploy-compose-stack.sh
   ```

   Backend health와 BFF contract를 확인한 다음 frontend를 같은 tag에서 배포합니다.

   Host-write client contract를 바꾸는 release는 backend promotion 전에 `sync-config`가 `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true`를 렌더링했는지 확인합니다. Backend가 먼저 올라간 동안 구 browser/BFF의 host mutation은 409로 멈추고, 같은 tag의 frontend가 올라와야 풀립니다. Frontend rollback만으로는 복구되지 않습니다.

   ```bash
   gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
   ```

8. GitHub Release를 만듭니다.

   ```bash
   gh release create vX.Y.Z \
     --title "ReadMates vX.Y.Z" \
     --notes-file <release-note-file>
   ```

   기존 tag에 release만 없으면 `gh release create`를 사용합니다. 이미 release가 있으면 `gh release edit`로 본문을 갱신합니다.

   Release 작업이 끝났는지는 tag 존재만으로 판단하지 않습니다. 아래 명령이 release URL을 출력해야 GitHub의 릴리즈 노트가 공개 화면에서 보입니다.

   ```bash
   gh release view vX.Y.Z --json tagName,name,url,publishedAt
   ```

   tag는 이미 push됐지만 release가 없으면 `CHANGELOG.md`의 해당 버전 섹션을 파일로 추출한 뒤 release만 생성합니다. `X`, `Y`, `Z`는 실제 숫자로 바꿉니다.

   ```bash
   awk '
     /^## vX[.]Y[.]Z - / { capture=1; next }
     capture && /^## / { exit }
     capture { print }
   ' CHANGELOG.md > .tmp/release-notes-vX.Y.Z.md

   gh release create vX.Y.Z \
     --title "ReadMates vX.Y.Z" \
     --notes-file .tmp/release-notes-vX.Y.Z.md
   ```

   release body를 고친 뒤에는 `gh release view vX.Y.Z --json body`로 공개 본문이 `CHANGELOG.md`의 같은 버전 섹션과 맞는지 확인합니다.

## Branch protection bypass policy

ReadMates `main` branch는 GitHub branch protection 적용을 목표 정책으로 둡니다. 릴리즈마다 GitHub API에서 현재 required check/review/enforce-admin 상태를 다시 확인하며, 설정이 비어 있으면 보호가 적용된 것처럼 가정하지 않고 `POLICY_MISMATCH`와 수동 CI 증거를 release-readiness에 기록합니다. 이 저장소는 단독 운영(solo admin)을 기본 운영 형태로 두므로, branch protection이 실제 reviewer가 없는 self-review를 요구하면 release PR이 구조적으로 막힐 수 있습니다. 정책의 목표는 review 요구를 형식적으로 유지하는 것이 아니라, CI와 release-readiness 증거를 통해 DB/API/auth/deploy 리스크를 추적 가능하게 닫는 것입니다.

### 기본 원칙

- `main`의 필수 CI status check를 설정·유지하는 것이 목표이며, 실제 설정이 없으면 release PR의 merge/tag SHA에서 CI 성공을 수동으로 확인합니다.
- solo-admin release PR은 명시적인 release-readiness 증거를 남기면 유효한 review artifact로 봅니다.
- branch protection은 실제 non-author reviewer가 없을 때 불가능한 code-owner self-review를 정상 경로로 요구하지 않습니다.
- `.github/workflows/**`, deploy scripts, auth/permission, secret/session/token handling, branch protection 정책 변경은 external-review preferred 표면으로 분류합니다.
- external reviewer가 없는 상태에서 high-control 변경을 ship해야 하면 admin bypass ledger와 release-readiness 증거를 남깁니다.

### Solo-admin evidence path

아래 조건을 모두 만족하면 solo admin이 `main`에 직접 push하거나 solo-admin release PR을 admin merge할 수 있습니다.

- 변경에 DB migration이 포함되지 않습니다 (`server/src/main/resources/db/mysql/migration/` 변경 없음).
- Public API contract(route, request/response schema, error code)가 바뀌지 않습니다.
- Auth, permission, BFF token, OAuth scope, role/visibility model, secret/session/token handling을 건드리지 않습니다.
- Deploy workflow, release automation, branch protection, CODEOWNERS 정책을 바꾸지 않습니다.
- Push 또는 merge 직전에 `./scripts/pre-push-check.sh` 또는 문서화된 release equivalent가 통과했습니다.
- `CHANGELOG.md`와 release-readiness review가 사용자-facing, operator-facing, security posture, deploy behavior 변경을 기록합니다.
- public release 또는 deploy 표면이면 public release candidate check와 post-deploy smoke 결과를 기록합니다.
- 실행하지 못한 검증은 skipped validation과 residual risk로 기록합니다.

### DB/API release PR path

DB migration 또는 public API contract 변경은 direct push 기본 경로가 아닙니다. Release PR을 만들고, CI와 release-readiness review를 통해 다음 증거를 남깁니다.

- 변경된 Flyway migration 파일과 expected direction.
- 변경된 public API route, request/response schema, error code.
- frontend/server/E2E/public-release 검증 명령과 결과.
- 서버 image, Cloudflare Pages, OCI compose promotion, post-deploy smoke 순서.
- rollback 또는 forward-fix 고려사항.
- normal review가 막혔다면 `POLICY_MISMATCH` 사유.

branch protection이 reviewer 부재만으로 막히고 위 증거가 모두 충족되면 admin merge를 허용합니다. `CHECK_FAILURE` 또는 `MISSING_EVIDENCE` 상태에서는 incident 대응을 제외하고 merge하지 않습니다.

### External-review preferred path

다음 표면은 가능한 경우 실제 non-author reviewer를 붙입니다.

- `.github/workflows/**`
- branch protection 또는 CODEOWNERS 정책
- deploy scripts와 release automation
- auth, permission, OAuth, BFF shared secret handling, token/session handling
- secret rotation과 production configuration sync

실제 reviewer가 없고 변경이 필요하면 admin bypass ledger에 사유, 우회한 검증, 후속 보강 계획, release state 검증 위치를 기록합니다.

### Emergency bypass

운영 incident 대응 등 위 조건과 무관하게 bypass가 필요한 경우, push 전 또는 직후에 [bypass ledger](../operations/runbooks/release-bypass-ledger.md) 또는 release note `Deployment Notes`에 다음을 기록합니다.

- bypass 사유와 incident 맥락.
- 실패했거나 우회한 검증 단계.
- 후속 보강 계획.
- 나중에 release state를 확인할 수 있는 위치.

`./scripts/pre-push-check.sh --release --no-changelog-check`로 emergency override 시에도 위 ledger 기록은 생략하지 않습니다.

## 운영 배포와 릴리즈 노트

서버 API 또는 DB migration이 있는 릴리즈는 아래 내용을 `Deployment Notes`에 반드시 적습니다.

- 서버 image/OCI compose 배포가 필요한지
- Flyway가 몇 버전까지 올라가야 하는지
- Cloudflare Pages 배포만으로 충분하지 않은지
- 비로그인 smoke에서 기대되는 HTTP status
- 로그인된 호스트/멤버 화면에서 확인할 route

예시:

```text
GET /api/bff/api/auth/me -> 200
GET /api/bff/api/public/club -> 200
GET /api/bff/api/sessions/upcoming -> 401 when anonymous
GET /api/bff/api/host/sessions -> 401 when anonymous
```

새 API가 비로그인 기준으로 `401`을 반환하는 것은 정상일 수 있습니다. 같은 endpoint가 `404` 또는 `405`를 반환하면 프론트와 서버 배포 버전이 맞지 않는지 확인합니다.

## GitHub Releases 사용 방식

GitHub Releases는 태그별 public-facing 기록입니다.

ReadMates에서는 아래 방식으로 관리합니다.

- release title은 제품명과 tag를 함께 둡니다. 예: `ReadMates vX.Y.Z`
- release body는 `CHANGELOG.md`의 해당 버전 섹션과 같은 내용을 사용합니다.
- GitHub의 자동 생성 `What's Changed`는 참고만 하고, 최종 body에는 사용자/운영자 관점 요약을 넣습니다.
- dependency-only 변경이 많은 프로젝트처럼 PR 목록만 나열하지 않습니다.
- DB migration, 배포 순서, smoke check는 GitHub Release에도 반드시 남깁니다.
- 배포 후 GitHub release notes가 보이지 않으면 먼저 `gh release view <tag>`로 release 객체가 있는지 확인합니다. `release not found`이면 tag push는 되었지만 GitHub Release 생성 단계가 빠진 상태입니다.

## 다음 버전 판단

[버전 규칙](#버전-규칙) 표를 따릅니다. 문서 보강과 배포 리포트만 있으면 PATCH 후보입니다.
