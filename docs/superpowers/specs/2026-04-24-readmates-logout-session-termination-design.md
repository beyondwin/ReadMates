# ReadMates 로그아웃 세션 종료 설계

## 배경

로그아웃 버튼은 사용자를 `/login`으로 이동시키지만, 로컬과 배포 유사 환경에서 로그아웃 뒤에도 공개 탑바가 `멤버 화면`을 보여 주거나 `/app`으로 다시 진입되는 증상이 있다. 이전 수정은 프런트 `AuthProvider` 상태를 익명으로 바꾸는 데 초점을 맞췄지만, 실제 판정 기준은 로그아웃 뒤 `/api/bff/api/auth/me`가 `authenticated: false`를 반환하는지다.

로컬 Vite 개발 서버는 `/api/bff/**`를 Spring API로 직접 rewrite한다. 따라서 로컬에서도 재현되는 문제는 Cloudflare Pages Function의 `Set-Cookie` 전달만으로 설명할 수 없고, Spring 로그아웃 endpoint가 브라우저와 서버의 인증 상태를 끝까지 정리하는지 확인해야 한다.

## 목표

- `POST /api/bff/api/auth/logout` 성공 뒤 custom `readmates_session`이 revoke되고 브라우저에서 만료된다.
- Spring servlet session과 security context도 로그아웃 시 정리된다.
- 필요한 경우 `JSESSIONID`도 명시적으로 만료해 OAuth/Spring Security 잔여 세션이 인증 복구 경로가 되지 않게 한다.
- 로그아웃 직후 공개 탑바는 `로그인`만 보여 주고 `멤버 화면`을 보여 주지 않는다.
- 로그아웃 뒤 `/app` 직접 접근은 `/login`으로 redirect된다.
- 로그아웃 뒤 `/api/bff/api/auth/me`는 `authenticated: false`를 반환한다.

## 비목표

- Google OAuth 로그인 흐름 자체를 재설계하지 않는다.
- 회원 상태 모델이나 role 정책을 바꾸지 않는다.
- VIEWER, ACTIVE MEMBER, HOST, SUSPENDED의 기존 접근 정책을 이 작업에서 확장하지 않는다.
- 공개 탑바의 전역 auth 상태 우선 사용은 UI 불일치 완화책이며, 서버 세션 종료를 대체하지 않는다.

## 설계

### 서버 로그아웃

`PasswordAuthController.logout`는 현재 `readmates_session` raw token을 찾아 `LogoutAuthSessionUseCase.logout`에 넘기고 clearing cookie를 내려 준다. 여기에 다음 처리를 추가한다.

- 요청의 servlet session이 있으면 invalidate한다.
- `SecurityContextHolder.clearContext()`를 호출한다.
- `readmates_session` clearing cookie와 함께 `JSESSIONID` clearing cookie를 응답에 추가한다.

`readmates_session` clearing cookie는 `AuthSessionService`가 계속 소유한다. `JSESSIONID` clearing cookie는 servlet session cookie의 일반 browser deletion contract인 `Path=/`, `Max-Age=0`, `HttpOnly`, 같은 secure posture를 사용한다. secure 여부는 기존 `readmates.auth.session-cookie-secure` 설정과 맞춘다.

### BFF와 로컬 proxy

Cloudflare Pages Function은 upstream response의 `Set-Cookie`를 모두 브라우저로 전달해야 한다. 기존 `copyUpstreamHeaders`는 `getSetCookie()`가 있으면 여러 cookie를 append한다. 이 behavior를 logout 관련 단위 테스트로 고정한다.

로컬 Vite proxy는 Spring 응답을 직접 브라우저에 전달하므로, 서버 로그아웃 수정이 로컬 재현을 직접 해결해야 한다. Vite proxy 설정은 수정하지 않는다.

### 프런트 상태

로그아웃 버튼은 API 성공 뒤 `AuthProvider.markLoggedOut()`를 호출하고 `/login`으로 이동한다. 공개 탑바는 전역 `AuthProvider` 상태가 준비되어 있으면 그 값을 우선 사용하고, override가 없을 때만 자체 probe를 수행한다. 이 처리는 로그아웃 직후 UI stale 상태를 줄이지만, `/api/auth/me`가 true를 반환하면 실패로 간주한다.

### 테스트

서버 테스트는 다음을 검증한다.

- 로그아웃은 auth session row를 revoked 상태로 만든다.
- 응답은 `readmates_session` 만료 cookie를 포함한다.
- 응답은 `JSESSIONID` 만료 cookie를 포함한다.

프런트/BFF 단위 테스트는 다음을 검증한다.

- BFF가 upstream의 여러 `Set-Cookie` 값을 보존한다.
- 공개 탑바는 anonymous `AuthProvider` 상태를 우선해 `로그인` 링크를 보여 준다.

E2E 테스트는 다음을 검증한다.

- `/app/me`에서 로그아웃하면 `/login`으로 이동한다.
- 로그아웃 직후 `/api/bff/api/auth/me`는 `authenticated: false`를 반환한다.
- `/login` 상단 탑바는 `로그인`만 보여 주고 `멤버 화면`은 없다.
- `/app` 직접 진입은 `/login`으로 돌아간다.

## 오류 처리

로그아웃 API가 204 또는 이미 인증이 없는 상태에서의 401을 반환하면 프런트는 anonymous 상태로 전환할 수 있다. 네트워크 실패나 5xx는 기존처럼 실패 메시지를 보여 주고, 사용자를 임의로 로그인 해제된 것처럼 표시하지 않는다.

## 검증 명령

- `./server/gradlew -p server clean test`
- `pnpm --dir front test`
- `pnpm --dir front test:e2e`

작업이 auth/BFF/user-flow에 걸쳐 있으므로 서버와 프런트 단위 테스트, E2E를 모두 실행한다.
