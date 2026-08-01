# 로컬 Google OAuth 테스트 하네스

작성일: 2026-08-01
상태: 디자인 승인 완료

## 1. 요약

ReadMates의 실제 Google OAuth 로컬 검증을 `한 명령으로 실행하고 한 명령으로 점검`할 수 있게 한다. 기존 `scripts/run-local-google-oauth.sh`는 macOS Keychain credential을 Spring backend에만 주입하는 저수준 실행기로 유지하고, 그 위에 격리된 frontend/backend를 함께 관리하는 stack 실행기와 credential을 노출하지 않는 smoke 검증기를 추가한다.

공개 GitHub 저장소에는 실행 로직, localhost callback, Keychain service name과 합성 fixture만 둔다. 실제 OAuth client ID, client secret, Google Cloud project identifier, 테스트 사용자 계정과 공급자 응답 전문은 코드, 문서, 로그, fixture 또는 Git history에 남기지 않는다.

## 2. 현재 상태와 문제

현재 저장소에는 다음 기반이 있다.

- `scripts/run-local-google-oauth.sh`: Keychain에서 client ID와 secret을 읽어 Spring backend에 주입한다.
- `scripts/verify-local-google-oauth-keychain-fixtures.sh`: 실제 Keychain이나 Google을 호출하지 않고 credential 누락, placeholder 거부와 출력 비노출을 확인한다.
- `docs/development/local-setup.md`: Keychain 등록과 backend/frontend의 수동 실행 절차를 설명한다.

보안 경계는 준비됐지만 실제 확인에는 두 터미널이 필요하고, 사용자가 포트와 backend readiness, frontend proxy target, 종료 순서를 직접 맞춰야 한다. 이 과정에서 다음 문제가 생길 수 있다.

1. 이미 실행 중인 개발 서버와 포트가 충돌한다.
2. backend가 준비되기 전에 frontend에서 OAuth를 시작해 원인 불명의 proxy 오류를 본다.
3. 한 프로세스만 종료되어 로컬에 고아 프로세스가 남는다.
4. redirect를 조사하다가 client ID가 포함된 전체 URL을 로그나 이슈에 복사한다.
5. 실제 Google 계정 로그인과 자동화 가능한 로컬 계약 검증의 경계가 불명확하다.

## 3. 목표

1. Keychain 설정 이후 단일 명령으로 격리된 Google OAuth 로컬 stack을 실행한다.
2. 기존 worktree, 서버, 컨테이너, 포트와 cache를 종료하거나 변경하지 않는다.
3. backend readiness를 확인한 뒤 frontend를 시작한다.
4. `Ctrl+C` 또는 자식 프로세스 실패 시 실행기가 시작한 프로세스만 정리한다.
5. 별도 명령으로 frontend, backend와 OAuth redirect 계약을 자동 검증한다.
6. credential과 provider URL 전문이 stdout, stderr, 명령행, 저장소 파일과 fixture에 노출되지 않게 한다.
7. 신규 개발자가 active local setup 문서만 보고 실행, 검증, 종료와 장애 진단을 수행할 수 있게 한다.
8. 공개 릴리즈 검사와 secret-shaped 문자열 검사를 통과한다.

## 4. 비목표

- Google Cloud OAuth client 생성, callback 등록, secret 회전 또는 테스트 사용자 등록 자동화
- 실제 Google 계정 입력, 동의 화면 조작 또는 공급자 callback 성공을 CI에서 자동화
- 운영 OAuth client 또는 운영 credential 재사용
- macOS 외 운영체제의 secret manager 구현
- Docker Compose에 OAuth secret을 전달하는 경로 추가
- 기존 dev-login, 일반 frontend 개발 실행 또는 production 배포 절차 변경
- 기존 포트를 점유한 프로세스의 자동 종료
- daemon, launch agent 또는 로그인 시 자동 시작 기능

## 5. 검토한 접근

### 5.1 선택: 저수준 credential 실행기 + stack supervisor + smoke verifier

기존 credential 실행기를 유지하고 다음 두 스크립트를 추가한다.

- `scripts/run-local-google-oauth-stack.sh`: backend와 frontend lifecycle을 소유한다.
- `scripts/verify-local-google-oauth-stack.sh`: 실행 중인 stack의 공개 가능한 계약만 점검한다.

credential 접근과 프로세스 orchestration을 분리해 기존 fixture를 재사용할 수 있고, smoke는 credential 없이 HTTP 계약만 관찰할 수 있다. foreground supervisor가 lifecycle을 소유하므로 PID 파일이나 장기 실행 daemon이 필요하지 않다.

### 5.2 제외: `package.json` script 조합만 사용

명령 별칭은 짧지만 Keychain preflight, backend readiness 대기, 포트 충돌 설명과 두 자식 프로세스의 정확한 cleanup을 표현하기 어렵다. macOS 전용 credential 경계도 Node package script 안에 숨게 된다.

### 5.3 제외: Docker Compose profile

프로세스 격리는 좋지만 host Keychain credential을 컨테이너에 안전하게 전달하는 추가 경계가 필요하다. 이번 목표보다 복잡하고 전체 로컬 infrastructure를 요구하므로 채택하지 않는다.

## 6. 실행 계약

### 6.1 기본 명령

저장소 루트에서 다음 명령으로 foreground stack을 실행한다.

```bash
./scripts/run-local-google-oauth-stack.sh
```

기본 격리 주소는 공개 가능한 localhost 값으로 고정한다.

| 역할 | 기본값 |
| --- | --- |
| Frontend | `http://localhost:5174` |
| Backend API | `http://127.0.0.1:28080` |
| Backend management | `http://127.0.0.1:28081` |
| OAuth callback | `http://localhost:5174/login/oauth2/code/google` |

Frontend origin은 Google Cloud callback과 browser origin이 정확히 일치하도록 `localhost`를 사용한다. 내부 proxy와 health probe는 loopback interface를 명확히 하기 위해 `127.0.0.1`을 사용한다.

### 6.2 시작 순서

stack 실행기는 다음 순서를 지킨다.

1. macOS, `security`, `curl`, Java/Gradle wrapper와 repository-defined Corepack launcher 사용 가능 여부를 확인한다.
2. 기존 runner의 dry-run을 호출해 Keychain credential 존재와 형식을 확인한다. 값은 읽거나 출력하지 않는다.
3. frontend, backend와 management 기본 포트가 비어 있는지 확인한다.
4. 포트가 사용 중이면 PID를 종료하지 않고 충돌한 포트와 override 방법만 출력하고 실패한다.
5. 격리 origin과 포트를 환경 변수로 전달해 기존 backend runner를 자식 프로세스로 시작한다.
6. 제한된 시간 동안 management health를 polling한다. timeout 또는 조기 종료 시 수집한 안전한 로그 위치를 안내하고 자신이 시작한 프로세스를 정리한다.
7. backend가 준비된 뒤 `VITE_ENABLE_GOOGLE_LOGIN=true`와 backend proxy origin만 전달해 Vite를 시작한다.
8. frontend HTTP 응답을 확인한 뒤 브라우저 URL과 smoke 명령을 출력한다.
9. foreground에서 두 자식 프로세스를 감시한다.

포트와 readiness timeout은 다음 비민감 환경 변수로만 override한다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT` | `5174` | Vite와 callback frontend port |
| `READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT` | `28080` | Spring API port |
| `READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT` | `28081` | Spring management port |
| `READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS` | `180` | backend/frontend readiness 공통 상한 |
| `READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER` | `false` | `true`일 때 readiness 완료 후 login URL 열기 |

각 port는 숫자와 허용 범위를 검증하고 세 값이 서로 달라야 한다. timeout은 양의 정수와 bounded maximum을 검증한다. 실제 credential override는 stack 실행기 인터페이스로 추가하지 않는다.

### 6.3 종료와 실패 처리

- `INT`, `TERM`, `EXIT` trap은 실행기가 기록한 두 child PID만 종료한다.
- 기존에 실행 중이던 프로세스, port listener, Docker container와 다른 worktree는 종료하지 않는다.
- 한 child가 비정상 종료하면 다른 child도 정리하고 non-zero로 종료한다.
- 정상 `Ctrl+C`는 cleanup 결과를 짧게 출력한다.
- 강제 종료 전 bounded wait를 두고, 필요한 경우에만 자신이 시작한 child에 후속 signal을 보낸다.
- repository root, broad process-name match 또는 unresolved environment variable을 대상으로 kill하지 않는다.

## 7. 로그와 credential 보안

### 7.1 공개 저장소 경계

tracked 파일에 허용되는 값은 다음뿐이다.

- Keychain service name
- localhost/loopback URL과 포트
- `example.com` 또는 명백한 합성 fixture
- OAuth parameter 이름과 예상 boolean/host/path

다음 값은 tracked/untracked repository 파일 모두에 기록하지 않는다.

- 실제 OAuth client ID와 client secret
- Google Cloud project identifier
- 실제 Google 계정 이메일
- authorization code, state, session cookie 또는 provider 응답 전문

OAuth client ID는 브라우저 authorization request에서 관찰 가능한 식별자지만 ReadMates 공개 저장소의 deployment identifier 금지 정책에 따라 hard-code하거나 문서화하지 않는다.

### 7.2 런타임 전달

기존 backend runner만 Keychain에서 credential을 읽는다. stack supervisor는 credential 값을 변수로 받거나 재출력하지 않으며 frontend에는 어떤 credential도 전달하지 않는다. Spring이 요구하는 environment injection은 자식 backend process에 한정하고 명령행 인자로 전달하지 않는다.

### 7.3 로그

로그가 필요하면 repository 밖의 운영체제 임시 디렉터리에 이번 실행 전용 디렉터리를 만든다. tracked 또는 ignored repository path에 runtime 로그를 만들지 않는다. clean 종료에서는 임시 로그를 삭제하고, 시작 실패에서는 credential과 전체 redirect URL을 출력하지 않는 제한된 diagnostic만 terminal에 보여 준 뒤 임시 디렉터리를 정리한다. 로그 경로에는 사용자명이나 절대 home 경로를 문서 예시로 남기지 않는다.

smoke verifier는 Google redirect의 전체 `Location`을 출력하지 않는다. URL을 process memory에서 파싱해 다음 boolean/정규화 결과만 출력한다.

- Google authorization host 일치 여부
- callback scheme, host, port와 path 일치 여부
- account-selection parameter 존재 여부
- HTTP status와 local health 상태

실패 메시지도 실제 query value, cookie 또는 response body 전문을 포함하지 않는다.

## 8. Smoke 검증 계약

실행 중인 stack에 대해 다음 명령을 제공한다.

```bash
./scripts/verify-local-google-oauth-stack.sh
```

검증기는 기본적으로 다음을 확인한다.

1. backend management의 `/actuator/health`가 성공한다.
2. frontend root 또는 login route가 성공한다.
3. 정상 OAuth 시작이 Google authorization host로 redirect된다.
4. redirect callback이 등록된 localhost callback과 일치한다.
5. 정상 시작에는 강제 account-selection parameter가 없다.
6. `chooseAccount=true` 복구 시작에는 `prompt=select_account`가 있다.
7. 허용되지 않은 `chooseAccount` 값은 account selection을 강제하지 않는다.
8. 검사 출력에 credential, authorization code, state와 cookie가 없다.

검증기는 실제 Google 로그인, 사용자 선택, callback code 교환이나 ReadMates session 발급 성공을 주장하지 않는다. 실제 공급자 확인은 브라우저에서 테스트 사용자로 수행하는 수동 체크리스트로 남긴다.

## 9. Fixture와 회귀 테스트

기존 Keychain fixture를 유지하고 stack/smoke 전용 fixture를 추가하거나 하나의 공개 fixture driver로 확장한다. 테스트는 실제 Keychain, Google, browser와 네트워크 provider를 호출하지 않는다.

필수 case는 다음과 같다.

- credential dry-run 실패 시 child를 시작하지 않는다.
- 각 기본 포트 충돌 시 기존 listener를 종료하지 않는다.
- backend readiness timeout 시 backend child만 정리한다.
- frontend 조기 종료 시 backend child도 정리한다.
- `INT` 처리 시 실행기가 시작한 child만 정리한다.
- mock redirect의 정상/복구/허용되지 않은 chooser 값을 정확히 판정한다.
- mock redirect 전체와 합성 credential이 결과에 출력되지 않는다.
- 임시 디렉터리는 성공과 실패 모두에서 정리되거나 ignored diagnostic log 정책을 따른다.

Shell script는 최소한 `bash -n`과 fixture suite로 검증한다. fixture는 플랫폼 명령을 mock할 수 있게 dependency path를 좁게 override하되 production 실행 경로가 임의 credential command를 허용하지 않게 한다.

## 10. 문서 구조

Active source of truth인 `docs/development/local-setup.md`의 Google OAuth 절을 다음 순서로 정리한다.

1. Google Cloud에서 최초 1회 등록할 localhost callback
2. Keychain에 credential을 대화형으로 저장하는 명령
3. one-command stack Quick Start
4. 자동 smoke 명령과 성공 범위
5. 실제 브라우저 수동 확인 체크리스트
6. `Ctrl+C` 종료와 포트 override
7. `invalid_client`, `redirect_uri_mismatch`, Keychain 누락, port conflict와 health timeout 진단
8. credential을 `.env`, `VITE_*`, shell history와 Git에 넣지 않는 경고

`scripts/README.md`에는 스크립트의 입력, 출력, 종료 의미와 fixture 명령만 요약하고 상세 운영 절차는 active local setup 문서로 연결한다. 루트 README에는 새 명령을 중복하지 않는다.

## 11. 예상 변경 표면

- `scripts/run-local-google-oauth-stack.sh`: foreground lifecycle supervisor
- `scripts/verify-local-google-oauth-stack.sh`: redacted local contract smoke
- `scripts/verify-local-google-oauth-stack-fixtures.sh`: port, lifecycle, redirect와 출력 안전 fixture
- `scripts/run-local-google-oauth.sh`: 필요한 경우에만 supervisor가 안전하게 호출할 수 있는 작은 호환성 보완
- `scripts/README.md`: script reference
- `docs/development/local-setup.md`: canonical quick start와 troubleshooting
- `scripts/build-public-release-candidate.sh`와 `scripts/verify-public-release-fixtures.sh`: 공개 후보에 새 helper와 fixture를 포함하고 manifest 회귀를 검증

제품 frontend, BFF, server auth 로직, database migration과 production deploy 설정은 변경하지 않는다.

## 12. 검증과 승인 기준

### 12.1 Focused

```bash
bash -n scripts/run-local-google-oauth.sh
bash -n scripts/run-local-google-oauth-stack.sh
bash -n scripts/verify-local-google-oauth-stack.sh
bash -n scripts/verify-local-google-oauth-keychain-fixtures.sh
bash -n scripts/verify-local-google-oauth-stack-fixtures.sh
./scripts/verify-local-google-oauth-keychain-fixtures.sh
./scripts/verify-local-google-oauth-stack-fixtures.sh
```

### 12.2 공개 저장소 안전

```bash
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

변경 파일을 대상으로 실제 이메일, OAuth credential/client 식별자, Google project identifier, token/private-key 형태와 로컬 절대경로 targeted scan을 추가한다. scanner 결과는 실제 노출과 명백한 합성 fixture를 구분하되 실패를 단순 경고로 완화하지 않는다.

### 12.3 실제 로컬 runtime

기존 서비스가 실행 중인 상태에서 기본 격리 포트로 stack을 시작한다. 기존 서비스의 health가 유지되는지 확인하고, 새 stack에 smoke를 실행한 뒤 브라우저에서 다음을 수동 확인한다.

- Google 로그인 화면 진입
- 테스트 사용자 로그인 후 ReadMates session 복귀
- 실패 복구 상태에서 account chooser 표시
- `Ctrl+C` 뒤 신규 포트만 닫히고 기존 서비스는 유지

실제 Google 공급자 검증은 로컬 수동 evidence이며 공개 로그나 커밋에 계정, client identifier, callback query 또는 cookie를 남기지 않는다.

## 13. Acceptance matrix 선택

- `auth/BFF/user-flow`: OAuth redirect와 callback contract를 관찰하므로 local smoke와 기존 auth E2E 경계를 확인한다. 제품 auth 코드를 변경하지 않으면 전체 auth E2E 재실행 여부는 implementation diff를 기준으로 결정한다.
- `local-runtime isolation`: 기존 서비스, port와 worktree 보존을 실제 runtime으로 증명한다.
- `public-release/security`: 새 tracked script와 active docs가 공개 후보와 scanner 경계를 지키는지 확인한다.
- 제외: database/Flyway, membership authorization, persistence, Kafka/Redis/SMTP는 변경하지 않으므로 관련 integration lane을 요구하지 않는다.

## 14. 완료 조건

다음이 모두 충족되면 완료다.

1. Keychain 설정이 완료된 개발자는 한 명령으로 격리 stack을 시작할 수 있다.
2. 한 명령 smoke가 local health와 OAuth redirect/account chooser 계약을 credential 비노출 상태로 검증한다.
3. 실패와 종료 시 실행기가 시작한 프로세스만 정리된다.
4. 기존 개발 서비스는 실행 전후 동일하게 유지된다.
5. active local setup 문서가 최초 설정, 반복 실행, 검증, 종료와 troubleshooting을 설명한다.
6. 실제 credential, project identifier, 테스트 계정과 provider 응답 전문이 Git diff와 검사 출력에 없다.
7. focused fixture, syntax, public-release와 실제 격리 runtime 검증 결과가 기록된다.
