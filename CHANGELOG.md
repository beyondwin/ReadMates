# CHANGELOG

ReadMates는 Git tag와 GitHub Releases를 함께 사용합니다. 이 파일은 저장소 안에 남는 릴리즈 기록이고, GitHub Releases는 태그별 공개 릴리즈 노트로 사용합니다.

버전 규칙과 릴리즈 절차는 [docs/development/release-management.md](docs/development/release-management.md)를 기준으로 합니다.

## v1.1.0 - 2026-04-25

### Highlights

ReadMates v1.1.0은 세션 공개 범위와 예정 세션 운영 흐름을 추가한 릴리즈입니다. 호스트는 미래 모임을 미리 준비하고, 기록을 호스트 전용, 멤버 공개, 외부 공개로 나눠 관리할 수 있습니다. 멤버와 둘러보기 멤버는 공개 범위가 허용된 예정 세션만 볼 수 있습니다.

### Added

- 세션 기록 공개 범위(`HOST_ONLY`, `MEMBER`, `PUBLIC`)를 저장하는 서버/DB 흐름을 추가했습니다.
- 호스트가 세션 기록 공개 범위를 저장하고 수정할 수 있는 API와 화면 모델을 추가했습니다.
- 예정 세션(`DRAFT`)을 만들고 수정하고 현재 세션으로 시작하는 호스트 흐름을 추가했습니다.
- 멤버 홈에서 멤버 공개 또는 외부 공개 예정 세션을 볼 수 있게 했습니다.
- `/api/sessions/upcoming`, `/api/host/sessions` 계열 API contract와 테스트를 추가했습니다.
- MySQL migration `V14__session_record_visibility.sql`, `V15__session_visibility.sql`을 추가했습니다.

### Changed

- 공개 기록 노출 기준을 단순한 세션 상태가 아니라 `public_session_publications.visibility=PUBLIC` 기준으로 정리했습니다.
- 아카이브와 노트 조회에서 호스트 전용 기록이 멤버/공개 표면으로 새지 않도록 정리했습니다.
- 호스트 세션 편집 화면의 섹션 문구와 기본값을 정리했습니다.
- 공개 홈, 공개 세션, 소개, 로그인 CTA 문구를 초대 기반 독서모임 톤에 맞게 다듬었습니다.
- 공개 기록 페이지의 모바일 레이아웃과 문구를 조정했습니다.
- README와 개발/배포 문서가 세션 공개 범위와 예정 세션 운영 방식을 설명하도록 갱신했습니다.

### Fixed

- draft 또는 host-only 기록이 멤버/공개 조회에 섞일 수 있는 경계를 수정했습니다.
- dev seed의 공개 기록 visibility가 실제 공개 API 정책과 맞도록 수정했습니다.
- 호스트 예정 세션 화면의 상단 구분선과 stale test copy를 정리했습니다.
- 떠난 멤버 로그인 오류와 표시 이름 노출 관련 UX를 보완했습니다.

### Deployment Notes

이 릴리즈는 서버 API와 DB migration을 포함합니다. 프론트엔드만 배포하면 새 화면이 이전 서버 API를 호출하면서 `404` 또는 `405`를 볼 수 있습니다.

권장 순서:

1. 서버 테스트를 실행합니다.
2. Spring Boot JAR를 빌드하고 운영 VM에 배포합니다.
3. 서버 로그에서 Flyway가 `v15`까지 적용됐는지 확인합니다.
4. Cloudflare Pages frontend와 Pages Functions를 배포합니다.
5. 공개, 멤버, 호스트 route를 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

비로그인 smoke에서 새 API가 `404` 또는 `405`를 반환하면 frontend/backend version skew를 의심합니다. 정상적인 비로그인 보호 응답은 `401` 또는 변경 요청의 경우 `403`일 수 있습니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- fresh E2E DB 기준 `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.0.0 - 2026-04-25

### Highlights

ReadMates v1.0.0은 초대 기반 독서모임 앱의 첫 공개 기준선입니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, Google OAuth 로그인, Cloudflare Pages BFF, Spring Boot API, MySQL/Flyway persistence, 공개 릴리즈 안전 검사를 포함합니다.

### Core Features

- 공개 홈, 클럽 소개, 공개 기록, 공개 세션 상세 화면을 제공합니다.
- Google OAuth와 서버 측 `readmates_session` cookie 기반 로그인을 사용합니다.
- Cloudflare Pages Functions가 같은 origin BFF로 `/api/bff/**`, OAuth 시작, OAuth callback을 Spring으로 전달합니다.
- 게스트, 둘러보기 멤버, 정식 멤버, 호스트 권한 경계를 제공합니다.
- 멤버 앱에서 현재 세션, RSVP, 읽은 분량, 질문, 한줄평, 장문 서평, 아카이브, 노트, 본인 표시 이름을 다룹니다.
- 호스트 앱에서 멤버 관리, 초대 관리, 현재 세션 운영, 참석 확정, 기록 발행, 피드백 문서 업로드를 다룹니다.
- 피드백 문서는 호스트 또는 참석한 정식 멤버에게만 노출합니다.
- Spring Boot API는 MySQL과 Flyway migration을 사용합니다.
- Playwright E2E와 public release candidate scanner를 포함합니다.

### Deployment Notes

v1.0.0은 운영 구조의 기준선입니다.

- Frontend SPA와 Pages Functions는 Cloudflare Pages에서 실행합니다.
- Spring Boot API는 HTTPS reverse proxy 뒤의 VM에서 실행합니다.
- MySQL schema는 Spring 시작 시 Flyway가 적용합니다.
- 운영 secret은 Git에 넣지 않고 Cloudflare, VM runtime env, provider console, ignored local files에만 둡니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
