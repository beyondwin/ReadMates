# 릴리즈 관리

ReadMates는 Git tag, GitHub Releases, `CHANGELOG.md`를 함께 사용합니다. GitHub Releases는 사용자와 공개 방문자가 보는 태그별 릴리즈 노트이고, `CHANGELOG.md`는 저장소 안에 남는 같은 내용의 장기 기록입니다. 제품 버전 source of truth와 server/frontend 공통 tag 기준은 [versioning.md](versioning.md)를 우선합니다.

## 원칙

- 릴리즈 노트는 커밋 목록이 아니라 사용자와 운영자 관점으로 작성합니다.
- 기능 변경, 권한 경계, DB migration, 배포 순서, 검증 결과를 분리해 적습니다.
- 실제 VM IP, private DB host, OAuth secret, BFF secret, DB password, OCID, 실명 멤버 데이터는 쓰지 않습니다.
- GitHub 자동 생성 노트는 초안으로만 사용하고, 최종 노트는 사람이 읽기 좋게 정리합니다.
- 서버 API나 DB migration이 포함된 릴리즈는 `Deployment Notes`를 반드시 둡니다.

릴리즈 문서가 완료되려면 변경 범위, 배포 순서, DB migration 여부, 실행한 검증, 공개 릴리즈 후보 검사 결과가 서로 맞아야 합니다. 실행하지 못한 검증은 `Verification`에 성공처럼 쓰지 않고 스킵 사유와 남은 리스크를 적습니다.

Tag push, GitHub Release 생성, production 배포, secret rotation은 문서 편집보다 영향이 큰 운영 작업입니다. 사용자가 명시적으로 요청하지 않았으면 절차를 문서화하거나 준비만 하고 실행하지 않습니다.

## 버전 규칙

ReadMates는 `vMAJOR.MINOR.PATCH` 형식의 semantic version을 사용합니다.

| 변경 종류 | 예시 | 버전 |
| --- | --- | --- |
| 첫 공개 기준선 | 공개 사이트, 멤버 앱, 호스트 앱, OAuth, BFF, MySQL 운영 기준선 | `v1.0.0` |
| 사용자 기능 추가 | 예정 세션, 세션 공개 범위, 세션 닫기/기록 발행 lifecycle, 새 호스트 운영 흐름 | `v1.2.0` |
| 버그 수정 또는 문서 보강 | 배포 불일치 리포트, stale copy 수정, 작은 UX 수정 | `v1.2.1` |
| 호환성 깨지는 변경 | auth model, URL 구조, API contract, DB 운영 구조 대규모 변경 | `v2.0.0` |

## 릴리즈 노트 구조

```markdown
## v1.2.0 - YYYY-MM-DD

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

`v1.0.0`처럼 첫 기준선인 경우에는 `Added`보다 `Core Features`가 더 읽기 좋습니다.

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

3. `CHANGELOG.md`에 새 버전 섹션을 추가합니다.

4. 필요한 검증을 실행합니다.

   Frontend:

   ```bash
   pnpm --dir front lint
   pnpm --dir front test
   pnpm --dir front build
   ```

   Server:

   ```bash
   ./server/gradlew -p server clean test
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

5. 릴리즈 문서 변경을 커밋합니다.

   ```bash
   git add CHANGELOG.md docs/development/release-management.md
   git commit -m "docs: add v1.2.0 release notes"
   ```

6. 태그를 만듭니다.

   ```bash
   git tag -a v1.2.0 -m "ReadMates v1.2.0"
   ```

7. `main`과 release tag를 push합니다.

   ```bash
   git push origin main
   git push origin v1.2.0
   ```

   `main` push는 CI만 실행하고 production 배포를 시작하지 않습니다. `v*` release tag push가 Cloudflare Pages 프론트 배포 workflow와 GHCR server image scan/promote workflow를 시작합니다.

   새 버전 발행과 운영 배포를 한 번에 진행할 때는 [새 버전 발행과 운영 배포 Runbook](../deploy/release-publish-runbook.md)을 함께 사용합니다. 이 runbook은 tag push 뒤 `Deploy Front`, `Deploy Server Image`, GitHub Release, OCI Compose promotion, smoke 확인이 같은 제품 tag를 바라보는지 점검하는 순서를 정리합니다.

   서버 변경이 포함된 release tag는 `Deploy Server Image` workflow가 scan-candidate digest를 Trivy로 검사한 뒤 같은 digest를 release tag로 promote했는지 확인합니다. 수동 실행할 때는 release tag/ref에서 실행하고 workflow input `image_tag`에도 같은 release tag를 넣습니다. OCI backend는 그 release artifact를 같은 제품 버전 image tag로 배포합니다.

   ```bash
   READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:v1.2.0' \
   VM_PUBLIC_IP='<vm-public-ip>' \
   CADDY_SITE=api.example.com \
   ./deploy/oci/05-deploy-compose-stack.sh
   ```

8. GitHub Release를 만듭니다.

   ```bash
   gh release create v1.2.0 \
     --title "ReadMates v1.2.0" \
     --notes-file <release-note-file>
   ```

   기존 tag에 release만 없으면 `gh release create`를 사용합니다. 이미 release가 있으면 `gh release edit`로 본문을 갱신합니다.

   Release 작업이 끝났는지는 tag 존재만으로 판단하지 않습니다. 아래 명령이 release URL을 출력해야 GitHub의 릴리즈 노트가 공개 화면에서 보입니다.

   ```bash
   gh release view v1.2.0 --json tagName,name,url,publishedAt
   ```

   tag는 이미 push됐지만 release가 없으면 `CHANGELOG.md`의 해당 버전 섹션을 파일로 추출한 뒤 release만 생성합니다.

   ```bash
   awk '
     /^## v1[.]2[.]0 - / { capture=1; next }
     capture && /^## / { exit }
     capture { print }
   ' CHANGELOG.md > .tmp/release-notes-v1.2.0.md

   gh release create v1.2.0 \
     --title "ReadMates v1.2.0" \
     --notes-file .tmp/release-notes-v1.2.0.md
   ```

   release body를 고친 뒤에는 `gh release view v1.2.0 --json body`로 공개 본문이 `CHANGELOG.md`의 같은 버전 섹션과 맞는지 확인합니다.

## Branch protection bypass policy

ReadMates `main` branch는 GitHub branch protection 대상입니다. 이 저장소는 단독 운영(solo admin)을 기본 운영 형태로 두므로, branch protection이 실제 reviewer가 없는 self-review를 요구하면 release PR이 구조적으로 막힐 수 있습니다. 정책의 목표는 review 요구를 형식적으로 유지하는 것이 아니라, CI와 release-readiness 증거를 통해 DB/API/auth/deploy 리스크를 추적 가능하게 닫는 것입니다.

### 기본 원칙

- `main`의 필수 CI status check는 유지합니다.
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

- release title은 제품명과 tag를 함께 둡니다. 예: `ReadMates v1.2.0`
- release body는 `CHANGELOG.md`의 해당 버전 섹션과 같은 내용을 사용합니다.
- GitHub의 자동 생성 `What's Changed`는 참고만 하고, 최종 body에는 사용자/운영자 관점 요약을 넣습니다.
- dependency-only 변경이 많은 프로젝트처럼 PR 목록만 나열하지 않습니다.
- DB migration, 배포 순서, smoke check는 GitHub Release에도 반드시 남깁니다.
- 배포 후 GitHub release notes가 보이지 않으면 먼저 `gh release view <tag>`로 release 객체가 있는지 확인합니다. `release not found`이면 tag push는 되었지만 GitHub Release 생성 단계가 빠진 상태입니다.

## 다음 버전 판단

현재 태그 이후의 문서 보강이나 배포 리포트는 patch release 후보입니다.

예시:

- `v1.2.1`: 운영 배포 불일치 리포트, 릴리즈 관리 문서, 작은 문서/테스트 수정
- `v1.3.0`: 사용자가 체감하는 새 기능 추가
- `v2.0.0`: 기존 운영자가 배포 순서, DB, API client, URL을 다시 맞춰야 하는 변경
