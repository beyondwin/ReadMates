# 2026-04-25 운영 배포 불일치 리포트

작성일: 2026-04-25

이 문서는 2026-04-25 운영 배포 중 `https://readmates.pages.dev/app/host`에서 새 호스트 기능이 동작하지 않았던 문제의 원인, 진단 과정, 해결 방법, 재발 방지 항목을 정리합니다. 공개 저장소에 남길 수 있도록 실제 VM IP, private DB host, secret, OAuth secret, OCI 계정 값은 기록하지 않습니다.

## 요약

운영 프론트엔드는 최신 코드로 배포됐지만, 운영 Spring Boot 서버 JAR는 이전 버전으로 남아 있었습니다. 새 프론트엔드는 예정 세션과 호스트 세션 목록 API를 호출했지만, 이전 서버는 해당 route 또는 HTTP method를 아직 지원하지 않았습니다.

그 결과 호스트 화면에서 아래 요청이 실패했습니다.

```text
GET /api/bff/api/sessions/upcoming -> 404
GET /api/bff/api/host/sessions -> 405
```

해결은 최신 서버 JAR를 운영 VM에 배포하고 `readmates-server` systemd 서비스를 재시작하는 것이었습니다. 서버 시작 과정에서 Flyway가 운영 DB schema를 `v13`에서 `v15`로 올렸고, 이후 새 API route가 운영에서 정상 동작했습니다.

## 영향

영향받은 화면:

- `/app/host`
- 새 호스트 세션 목록과 예정 세션 표시 흐름
- 새 프론트엔드가 호출하는 `/api/sessions/upcoming`
- 새 프론트엔드가 호출하는 `/api/host/sessions`

영향받지 않은 흐름:

- 공개 홈과 공개 기록
- `/api/auth/me` anonymous 상태 조회
- `/api/public/club`
- Google OAuth 시작 redirect

## 배경

ReadMates 운영 구조는 프론트와 서버가 분리되어 있습니다.

```text
Browser
  -> Cloudflare Pages SPA
  -> Cloudflare Pages Functions /api/bff/**
  -> Spring Boot /api/**
  -> MySQL
```

프론트엔드 배포는 Cloudflare Pages에 정적 asset과 Pages Functions를 올립니다. 서버 배포는 별도로 Spring Boot JAR를 빌드한 뒤 운영 VM의 `/opt/readmates/readmates-server.jar`를 교체하고 systemd 서비스를 재시작합니다.

DB migration은 Spring 시작 시 Flyway가 적용합니다. 따라서 DB migration이 포함된 서버 변경은 "서버 JAR 배포와 Spring 재시작"까지 끝나야 운영 DB가 새 schema로 올라갑니다.

## 원인

직접 원인은 frontend/backend version skew입니다. frontend/backend version skew는 브라우저에 배포된 프론트 코드와 서버에 배포된 백엔드 코드 버전이 서로 맞지 않는 상태입니다.

이번 변경 묶음에는 프론트 UI만 있는 것처럼 보이는 커밋도 있었지만, 운영 서버 기준으로는 이전 작업에서 추가된 API와 DB migration도 필요했습니다.

최신 프론트엔드는 아래 API를 기대했습니다.

```text
GET /api/sessions/upcoming
GET /api/host/sessions
POST /api/host/sessions
```

하지만 운영 서버는 아직 이전 JAR였고, DB schema도 migration `v13` 상태였습니다. 새 기능에 필요한 migration `v14`, `v15`가 운영 DB에 적용되지 않은 상태였습니다.

운영 장애의 핵심은 다음 두 가지였습니다.

- 프론트는 최신 asset으로 바뀌었습니다.
- 서버와 DB migration은 아직 최신 상태가 아니었습니다.

## 관측 증상

브라우저 개발자 도구에서 다음 실패가 보였습니다.

```text
Failed to load resource: the server responded with a status of 404
/api/bff/api/sessions/upcoming

Failed to load resource: the server responded with a status of 405
/api/bff/api/host/sessions
```

`/api/bff/api/...`는 Cloudflare Pages Functions BFF 경유 path입니다. Spring에는 `/api/...` 형태로 전달됩니다.

```text
/api/bff/api/sessions/upcoming -> Spring /api/sessions/upcoming
/api/bff/api/host/sessions -> Spring /api/host/sessions
```

404는 route가 없거나 현재 인증/권한/route 조합에서 처리 가능한 endpoint가 없다는 뜻입니다. 405는 path는 맞지만 요청한 HTTP method를 서버가 지원하지 않는다는 뜻입니다. 이번 경우에는 기존 서버가 새 프론트가 기대한 호스트 세션 목록 조회 method를 아직 지원하지 않았습니다.

## 원인 파악 과정

1. 브라우저 콘솔의 실패 path를 BFF path에서 Spring path로 변환했습니다.

   ```text
   /api/bff/api/sessions/upcoming -> /api/sessions/upcoming
   /api/bff/api/host/sessions -> /api/host/sessions
   ```

2. 로컬 최신 서버 코드에 해당 route가 있는지 확인했습니다.

   확인된 최신 코드:

   ```text
   server/src/main/kotlin/com/readmates/session/adapter/in/web/UpcomingSessionController.kt
   @RequestMapping("/api/sessions/upcoming")
   @GetMapping

   server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt
   @RequestMapping("/api/host/sessions")
   @GetMapping
   @PostMapping
   ```

   최신 코드에는 endpoint가 있었습니다. 따라서 "코드에 route가 없다"가 아니라 "운영 서버가 최신 JAR가 아니다"가 1차 가설이 됐습니다.

3. 운영 서버 로그를 확인했습니다.

   서버 재배포 전 로그에는 `GET /api/host/sessions` 계열 요청에서 method mismatch가 기록됐습니다. 이는 운영 서버가 새 route/method 조합을 아직 모른다는 증거였습니다.

4. 익명 `curl` smoke 결과를 해석할 때 주의했습니다.

   익명 요청에서는 Spring Security가 먼저 `401`을 반환할 수 있습니다. 이 경우 route mismatch가 가려질 수 있습니다. 실제 사용자는 로그인된 호스트였기 때문에 security boundary를 통과한 뒤 controller mapping 문제인 404/405를 보았습니다.

   따라서 이번 문제에서는 anonymous smoke만으로 충분하지 않았습니다. 호스트 인증 상태의 브라우저 콘솔이 더 정확한 증상이었습니다.

5. 배포 로그에서 DB migration 상태를 확인했습니다.

   서버 재배포 직후 Flyway 로그가 아래 흐름을 보여줬습니다.

   ```text
   Current version of schema `readmates`: 13
   Migrating schema `readmates` to version "14 - session record visibility"
   Migrating schema `readmates` to version "15 - session visibility"
   Successfully applied 2 migrations to schema `readmates`, now at version v15
   ```

   이 로그는 운영 DB가 서버 재배포 전에는 새 기능 schema까지 올라가지 않았다는 사실도 확인해 줍니다.

## 해결 방법

1. 최신 서버 JAR를 빌드했습니다.

   ```bash
   ./server/gradlew -p server bootJar
   ```

2. 운영 VM의 로컬 헬스체크가 살아 있는 배포 대상을 확인했습니다.

   실제 VM IP는 public-safe 문서에 기록하지 않습니다. 확인은 SSH와 VM 내부 health endpoint로 했습니다.

   ```bash
   curl -fsS http://127.0.0.1:8080/internal/health
   ```

3. 서버 배포 스크립트를 실행했습니다.

   ```bash
   VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
   ```

   이 스크립트가 수행한 일:

   - `server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar`를 VM으로 전송
   - `/opt/readmates/readmates-server.jar`로 배치
   - 파일 소유권을 `readmates:readmates`로 설정
   - `readmates-server` systemd 서비스 재시작

4. 서버 시작 중 Flyway가 운영 DB migration을 적용했습니다.

   적용된 migration:

   ```text
   V14__session_record_visibility.sql
   V15__session_visibility.sql
   ```

5. 재시작 완료 후 systemd 상태와 health endpoint를 확인했습니다.

   확인 결과:

   ```text
   readmates-server.service active (running)
   /internal/health -> {"service":"readmates-server","status":"UP"}
   ```

## 해결 후 검증

서버 배포 후 public-safe smoke check를 다시 실행했습니다.

```text
GET /api/bff/api/auth/me -> 200
GET /api/bff/api/public/club -> 200
GET /api/bff/api/sessions/upcoming -> 401 when anonymous
GET /api/bff/api/host/sessions -> 401 when anonymous
POST /api/bff/api/host/sessions -> 403 when anonymous or without allowed mutating request context
```

`401`과 `403`은 비로그인 또는 mutating request guard 기준에서 기대 가능한 응답입니다. 중요한 점은 더 이상 새 endpoint가 `404` 또는 `405`로 실패하지 않는다는 것입니다.

또한 서버 로그에서 Tomcat started와 Spring started 로그를 확인했습니다.

```text
Tomcat started on port 8080
Started ReadmatesApplicationKt
```

## 왜 최초 배포 확인에서 놓쳤나

초기 확인은 공개 페이지, anonymous auth, public API, OAuth redirect 중심이었습니다.

확인했던 항목:

```text
/app
/api/bff/api/auth/me
/api/bff/api/public/club
/oauth2/authorization/google
/records browser render
/app anonymous redirect
```

이 항목들은 공개/비로그인 경로가 정상인지 보는 데는 충분했지만, 로그인된 호스트가 접근하는 새 API surface를 검증하지 못했습니다.

특히 이번 문제는 "프론트가 최신이고 서버가 이전 버전"인 상태였기 때문에 공개 smoke는 통과할 수 있었습니다. 공개 API는 이전 서버에도 있었고, 새로 깨진 부분은 호스트 앱의 새 route였습니다.

## 재발 방지

프론트와 서버가 함께 바뀌는 배포에서는 아래 순서를 지켜야 합니다.

1. 변경 범위에서 `server/src/main/resources/db/mysql/migration` 변경 여부를 확인합니다.

   ```bash
   git diff --name-only origin/main..HEAD -- server/src/main/resources/db/mysql/migration
   ```

2. server/API 변경이 있으면 프론트만 먼저 production에 올리지 않습니다.

3. 서버를 먼저 또는 거의 동시에 배포합니다.

   ```bash
   ./server/gradlew -p server clean test
   ./server/gradlew -p server bootJar
   VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
   ```

4. 서버 재시작 로그에서 Flyway 결과를 확인합니다.

   ```bash
   sudo journalctl -u readmates-server -n 120 --no-pager
   ```

   확인할 문구:

   ```text
   Successfully applied
   now at version
   Started ReadmatesApplicationKt
   ```

5. 프론트 배포 후 공개 smoke만 보지 말고 새 기능 API도 직접 확인합니다.

   Anonymous smoke:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/sessions/upcoming
   curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/host/sessions
   ```

   이 값은 비로그인 기준으로 `401`일 수 있습니다. `404` 또는 `405`면 배포 불일치를 의심합니다.

6. 호스트 인증 상태의 브라우저로 `/app/host`를 확인합니다.

   확인할 것:

   - 콘솔에 `/api/bff/api/sessions/upcoming` 404가 없어야 합니다.
   - 콘솔에 `/api/bff/api/host/sessions` 405가 없어야 합니다.
   - 호스트 대시보드와 예정 세션 UI가 렌더링되어야 합니다.

## 개선 제안

현재 백엔드 프로덕션 배포는 수동입니다. 이 구조에서는 frontend-only 배포가 backend/API 변경보다 먼저 나가면 같은 문제가 다시 생길 수 있습니다.

권장 개선:

- release tag 배포 전 변경 파일을 보고 server migration/API 변경이 있으면 서버 배포 체크리스트를 강제합니다.
- 운영 smoke check에 새 기능 endpoint를 추가합니다.
- 호스트 인증 smoke를 별도 수동 체크리스트로 둡니다.
- 가능하면 GitHub Actions 또는 deploy runbook에서 "서버 배포 완료 후 프론트 배포" 순서를 명시합니다.
- Cloudflare Pages 직접 배포를 사용한 경우, 배포한 commit과 서버 JAR 배포 여부를 같은 메모에 남깁니다.

## 최종 상태

2026-04-25 기준 최종 상태:

- Cloudflare Pages 프론트 배포 완료
- Pages Functions BFF 배포 완료
- Spring Boot 서버 JAR 운영 VM 배포 완료
- `readmates-server` systemd 서비스 재시작 완료
- 운영 DB Flyway schema `v15` 적용 완료
- 운영 health check `UP`
- 공개 API smoke 정상
- 새 API route는 더 이상 404/405로 실패하지 않음
