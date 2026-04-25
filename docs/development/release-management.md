# 릴리즈 관리

ReadMates는 Git tag, GitHub Releases, `CHANGELOG.md`를 함께 사용합니다. GitHub Releases는 사용자와 공개 방문자가 보는 태그별 릴리즈 노트이고, `CHANGELOG.md`는 저장소 안에 남는 같은 내용의 장기 기록입니다.

## 원칙

- 릴리즈 노트는 커밋 목록이 아니라 사용자와 운영자 관점으로 작성합니다.
- 기능 변경, 권한 경계, DB migration, 배포 순서, 검증 결과를 분리해 적습니다.
- 실제 VM IP, private DB host, OAuth secret, BFF secret, DB password, OCID, 실명 멤버 데이터는 쓰지 않습니다.
- GitHub 자동 생성 노트는 초안으로만 사용하고, 최종 노트는 사람이 읽기 좋게 정리합니다.
- 서버 API나 DB migration이 포함된 릴리즈는 `Deployment Notes`를 반드시 둡니다.

## 버전 규칙

ReadMates는 `vMAJOR.MINOR.PATCH` 형식의 semantic version을 사용합니다.

| 변경 종류 | 예시 | 버전 |
| --- | --- | --- |
| 첫 공개 기준선 | 공개 사이트, 멤버 앱, 호스트 앱, OAuth, BFF, MySQL 운영 기준선 | `v1.0.0` |
| 사용자 기능 추가 | 예정 세션, 세션 공개 범위, 새 호스트 운영 흐름 | `v1.1.0` |
| 버그 수정 또는 문서 보강 | 배포 불일치 리포트, stale copy 수정, 작은 UX 수정 | `v1.1.1` |
| 호환성 깨지는 변경 | auth model, URL 구조, API contract, DB 운영 구조 대규모 변경 | `v2.0.0` |

## 릴리즈 노트 구조

```markdown
## v1.1.0 - YYYY-MM-DD

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
   git commit -m "docs: add v1.1.0 release notes"
   ```

6. 태그를 만듭니다.

   ```bash
   git tag -a v1.1.0 -m "ReadMates v1.1.0"
   ```

7. `main`과 tag를 push합니다.

   ```bash
   git push origin main
   git push origin v1.1.0
   ```

8. GitHub Release를 만듭니다.

   ```bash
   gh release create v1.1.0 \
     --title "v1.1.0" \
     --notes-file <release-note-file>
   ```

   기존 tag에 release만 없으면 `gh release create`를 사용합니다. 이미 release가 있으면 `gh release edit`로 본문을 갱신합니다.

## 운영 배포와 릴리즈 노트

서버 API 또는 DB migration이 있는 릴리즈는 아래 내용을 `Deployment Notes`에 반드시 적습니다.

- 서버 JAR 배포가 필요한지
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

- release title은 tag와 동일하게 둡니다. 예: `v1.1.0`
- release body는 `CHANGELOG.md`의 해당 버전 섹션과 같은 내용을 사용합니다.
- GitHub의 자동 생성 `What's Changed`는 참고만 하고, 최종 body에는 사용자/운영자 관점 요약을 넣습니다.
- dependency-only 변경이 많은 프로젝트처럼 PR 목록만 나열하지 않습니다.
- DB migration, 배포 순서, smoke check는 GitHub Release에도 반드시 남깁니다.

## 다음 버전 판단

현재 태그 이후의 문서 보강이나 배포 리포트는 patch release 후보입니다.

예시:

- `v1.1.1`: 운영 배포 불일치 리포트, 릴리즈 관리 문서, 작은 문서/테스트 수정
- `v1.2.0`: 사용자가 체감하는 새 기능 추가
- `v2.0.0`: 기존 운영자가 배포 순서, DB, API client, URL을 다시 맞춰야 하는 변경
