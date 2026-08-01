# Google 로그인 복구와 카카오 인앱 브라우저 안내

작성일: 2026-08-01
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

ReadMates 로그인 화면은 정상 진입과 Google OAuth 실패 복귀를 구분한다. 정상 진입은 기존의 빠른 Google 로그인을 유지하고, `membership-left` 또는 일반 Google 인증 실패 뒤의 재시도는 Google 계정 선택 화면을 강제로 연다. 종료된 멤버십에 연결된 Google 세션이 자동 재사용되어 같은 오류로 즉시 돌아오는 반복을 끊기 위한 결정이다.

카카오톡 인앱 브라우저에서는 Google이 embedded user-agent 로그인을 제한할 수 있음을 OAuth 시작 전에 안내한다. 특정 외부 브라우저를 강제로 실행하는 비표준 스킴에는 의존하지 않는다. 사용자는 현재 로그인 주소를 복사해 외부 브라우저에서 이어갈 수 있고, 지원되는 환경을 위한 Google 로그인 시도도 보조 동작으로 유지한다.

기존 same-origin Cloudflare Pages Functions OAuth proxy, Spring Security authorization-code 흐름, 고정 callback origin, 서명된 return state, `readmates_session` 쿠키 경계는 유지한다.

## 2. 현재 문제

### 2.1 ReadMates 세션과 Google 세션의 차이

사용자가 `/login`을 보고 있다는 것은 유효한 ReadMates 세션이 없다는 뜻이다. 그러나 카카오톡이나 일반 브라우저에는 이전 Google 세션이 남아 있을 수 있다.

현재 로그인 버튼은 `/oauth2/authorization/google`을 다시 호출하지만 Google 계정 선택을 요청하지 않는다. 종료된 멤버십에 연결된 Google 계정이 자동 선택되면 서버는 다시 `membership-left`로 판단하고 `/login?error=membership-left`로 돌려보낸다. 사용자는 계정 선택 화면을 보지 못하므로 버튼을 눌러도 오류 문구만 반복된다고 인식한다.

### 2.2 인앱 브라우저 제한

Google OAuth 정책은 개발자가 통제하는 embedded user-agent에서 authorization request를 시작하는 것을 허용하지 않는다. Google은 embedded user-agent로 판단한 환경을 `disallowed_useragent`로 차단할 수 있고 외부 브라우저 또는 플랫폼이 제공하는 안전한 browser tab을 사용하도록 안내한다.

ReadMates는 현재 카카오톡 User-Agent를 구분하거나 외부 브라우저 사용법을 안내하지 않는다. 따라서 사용자는 Google 화면으로 이동한 뒤에야 환경 제한을 발견할 수 있다.

### 2.3 실패 복귀 문맥

현재 서버는 OAuth 실패를 오류 코드로 축약해 로그인 화면으로 보내지만, 실패 전의 안전한 상대 `returnTo`는 오류 URL에 보존하지 않는다. 새 계정으로 재시도하더라도 원래 열려던 멤버 화면 대신 기본 경로로 갈 수 있다.

## 3. 목표

1. 종료된 멤버십 계정 또는 일반 Google 인증 실패 뒤에 같은 Google 계정이 자동 재사용되는 반복을 끊는다.
2. 실패 뒤의 기본 action이 실제 Google 계정 선택으로 이어지게 한다.
3. 정상 로그인 사용자의 자동 계정 재사용과 빠른 진입은 유지한다.
4. 카카오톡 인앱 브라우저에서 Google OAuth 제한 가능성을 이동 전에 설명한다.
5. 외부 브라우저에서 다시 열 때 기존 로그인 route가 허용하는 안전한 상대 `returnTo`와 복구 상태를 유지한다.
6. 브라우저가 임의의 Google authorization parameter를 주입하지 못하게 한다.
7. 기존 BFF, OAuth callback, 세션 쿠키, 초대 수락과 authorization 경계를 유지한다.
8. 오류와 복사 결과를 접근 가능하게 전달하고 작은 모바일 화면에서도 조작 가능하게 한다.

## 4. 비목표

- 이메일 magic link, 비밀번호, passkey 또는 다른 identity provider 추가
- 종료된 멤버십의 재활성화 정책 변경
- 호스트 초대 또는 멤버 승인 정책 변경
- 초대 수락 OAuth 실패를 로그인 화면에서 복원하거나 invite token을 재구성하는 흐름 변경
- Google access token, refresh token 또는 ID token 저장
- 카카오 계정 로그인 추가
- 카카오톡 앱 설정이나 특정 외부 브라우저를 강제로 변경
- 비공식 카카오 URL scheme 또는 Chrome 전용 intent를 제품 계약으로 채택
- User-Agent를 인증, 권한 또는 보안 판단에 사용
- 배포, Google Cloud Console 설정 변경 또는 실제 계정으로 production 로그인 실행

## 5. 조사 근거와 선택한 방향

### 5.1 외부 정책

- Google OAuth 2.0 정책은 개발자가 통제하는 embedded user-agent로 authorization request를 보내지 못하게 한다. [Google OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)
- Google은 `disallowed_useragent` 오류에서 embedded user-agent 대신 운영체제의 기본 링크 처리기나 지원되는 browser component를 사용하도록 안내한다. [OAuth 2.0 for iOS & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- Google OpenID Connect는 `prompt=select_account`를 계정 선택 화면을 요청하는 표준 provider parameter로 정의한다. [Google OpenID Connect API Reference](https://developers.google.com/identity/openid-connect/reference)
- OAuth native-app best current practice도 embedded user-agent를 금지하고 외부 user-agent 사용을 요구한다. [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)

### 5.2 선택: 상태 기반 복구와 인앱 브라우저 안내

정상 로그인은 `prompt` 없이 시작한다. 로그인 화면이 `membership-left` 또는 `google` 오류에서 복귀한 상태라면 ReadMates 내부의 `chooseAccount=true` 의도를 OAuth 시작 endpoint에 추가한다. Spring OAuth resolver만 이 값을 Google의 `prompt=select_account`로 변환한다.

카카오톡 인앱 브라우저에서는 외부 브라우저 안내와 주소 복사를 우선 노출한다. Google 로그인을 완전히 막지는 않지만 보조 action으로 낮춘다. User-Agent 감지는 UX 힌트일 뿐이며 OAuth와 세션의 서버 보안 규칙에는 영향을 주지 않는다.

### 5.3 제외한 방향

#### 모든 로그인에서 계정 선택 강제

구현은 단순하지만 정상 사용자도 매번 계정을 다시 선택해야 한다. 종료 계정이나 실패 복구에만 필요한 마찰을 모든 사용자에게 부과하며 embedded user-agent 차단도 해결하지 못한다.

#### Google OAuth만 다시 호출

현재 동작과 같아 기존 Google 세션이 동일 계정을 자동 선택할 수 있다. 실패 원인을 제거하지 못한다.

#### 대체 인증 추가

Google provider 장애까지 우회할 수 있지만 계정 연결, 복구, 보안 운영과 데이터 모델 범위가 크게 늘어난다. 현재 재시도와 인앱 브라우저 안내 문제에 비해 과도하다.

#### 외부 브라우저 강제 실행

모바일 웹에서 iOS와 Android 모두에 안정적으로 적용되는 특정 브라우저 강제 실행 표준이 없다. `window.open`, 비공식 app scheme 또는 특정 브라우저 intent는 앱과 OS 버전에 따라 실패하거나 다른 인앱 화면을 열 수 있으므로 채택하지 않는다.

## 6. 로그인 상태 모델

로그인 route는 query string을 다음 복구 상태로 정규화한다.

| 입력 | 상태 | 안내 | 기본 OAuth action |
| --- | --- | --- | --- |
| 허용된 오류 없음 | `normal` | 기존 로그인 안내 | `Google로 시작하기` |
| `error=membership-left` | `membership-left` | 이전 멤버십이 종료된 계정임을 설명 | `다른 Google 계정으로 로그인` |
| `error=google` | `google-error` | Google 인증이 완료되지 않았음을 설명 | `Google 로그인 다시 시도` |
| 그 밖의 `error` | `normal` | 오류를 표시하지 않음 | `Google로 시작하기` |

`membership-left`와 `google-error`만 `chooseAccount=true`를 사용한다. query string의 오류 값은 UI와 계정 선택 UX만 바꿀 수 있으며 authorization 결과, 멤버십 상태 또는 권한에는 영향을 주지 않는다.

## 7. OAuth 요청과 보안 경계

### 7.1 Frontend

로그인 route는 복구 상태와 검증된 상대 `returnTo`로 OAuth 시작 URL을 만든다.

```text
정상: /oauth2/authorization/google?returnTo=%2Fclubs%2Fsample-club%2Fapp
복구: /oauth2/authorization/google?returnTo=%2Fclubs%2Fsample-club%2Fapp&chooseAccount=true
```

위 URL은 형식을 설명하는 공개 예시다. 구현은 기존 `safeRelativeReturnTo` 규칙을 재사용하며 absolute URL, protocol-relative URL, 제어 문자, login/OAuth/reset/invite 재귀 경로를 새로 허용하지 않는다.

### 7.2 BFF

Cloudflare Pages Functions OAuth proxy는 현재처럼 같은 origin의 authorization 요청과 query string을 Spring으로 전달한다. BFF secret, forwarded host/proto, cookie, User-Agent 정책과 upstream response header 정리는 변경하지 않는다.

BFF는 `chooseAccount`를 Google parameter로 직접 변환하지 않는다. provider 정책은 Spring OAuth resolver 한 곳이 소유한다.

### 7.3 Spring OAuth resolver

`PrimaryOriginOAuthAuthorizationRequestResolver`는 요청의 `chooseAccount` 값이 정확히 `true`일 때만 생성된 Google authorization request의 additional parameter에 `prompt=select_account`를 추가한다.

- 정상 요청에는 `prompt`를 추가하지 않는다.
- `chooseAccount=false`, 빈 값, 대소문자가 다른 값과 그 밖의 값은 무시한다.
- browser query의 `prompt`, `login_hint`, `hd` 또는 다른 provider parameter를 복사하지 않는다.
- 기존 primary auth origin callback URI를 유지한다.
- Spring이 생성하는 state와 authorization request 저장 계약을 유지한다.

`chooseAccount`는 인증 강도를 낮추지 않고 provider UI만 요청하므로 사용자가 직접 추가해도 권한 상승은 없다. 그래도 허용된 boolean을 provider parameter로 서버에서 변환해 parameter ownership을 명확히 한다.

## 8. 실패 후 return 문맥

OAuth 시작 시 기존 `OAuthReturnState`가 서명해 servlet session에 저장한 target을 계속 source of truth로 사용한다.

성공 handler 안에서 `membership-left` 또는 허용된 Google login domain error가 발생하면 다음 순서로 처리한다.

1. 서명된 return state를 검증한다.
2. 현재 frontend가 지원하는 안전한 상대 target이면 `membership-left` 또는 `google` 오류와 URL-encoded `returnTo`를 `/login` query에 함께 보낸다.
3. target이 없거나 안전한 상대 경로로 투영할 수 없으면 `returnTo`를 생략한다.
4. ReadMates session cookie와 servlet authentication state를 기존처럼 정리한다.

Spring authentication failure handler도 가능한 경우 같은 검증·투영 규칙을 사용한다. 로그인 화면은 raw exception message나 provider response를 받지 않는다.

재시도 성공 시 기존 return state 흐름이 새 OAuth transaction에 다시 만들어지고 원래 상대 목적지로 이동한다. 만료되거나 변조된 값은 기존 기본 app target으로 제한한다. 기존 `safeRelativeReturnTo`가 제외하는 invite route는 이번 복구 범위에 새로 포함하지 않으며, 초대 수락은 현재 invite route가 계속 소유한다.

## 9. 카카오 인앱 브라우저 UX

### 9.1 감지

frontend의 순수 model helper가 현재 User-Agent에 알려진 `KAKAOTALK` marker가 있는지만 대소문자 구분 없이 확인한다.

- marker가 있으면 카카오 안내를 표시한다.
- marker가 없으면 일반 로그인 UI를 유지한다.
- false negative는 일반 로그인으로 진행되는 것으로 제한된다.
- false positive는 안내가 추가되는 것뿐이며 인증 결과에는 영향이 없다.
- 범용 WebView 판별이나 브라우저 fingerprinting으로 확장하지 않는다.

### 9.2 표시 내용과 action

카카오 안내는 Google primary action보다 먼저 읽히는 advisory 영역에 둔다.

- 제목: `외부 브라우저에서 로그인해 주세요`
- 설명: 카카오톡 안의 브라우저에서는 Google 로그인이 제한될 수 있으며 카카오톡 메뉴의 `다른 브라우저로 열기`를 사용해야 한다고 안내한다.
- 우선 action: `로그인 주소 복사`
- 보조 action: 현재 복구 상태에 맞는 `Google 로그인 시도`

주소 복사는 현재 origin의 `/login` URL에 허용된 `error`와 안전한 `returnTo`만 포함해 만든 canonical URL을 사용한다. 다른 query parameter와 fragment는 복사하지 않으며 복사 값은 analytics, log 또는 observability event에 기록하지 않는다.

Clipboard API가 성공하면 `로그인 주소를 복사했습니다`를, 실패하면 `주소를 복사하지 못했습니다. 브라우저 메뉴에서 다른 브라우저로 열어 주세요`를 `aria-live` 상태로 전달한다. 자동으로 외부 앱을 열거나 클립보드 권한을 반복 요청하지 않는다.

### 9.3 일반 브라우저

일반 Chrome, Safari와 다른 브라우저에는 카카오 안내와 주소 복사 action을 표시하지 않는다. 정상 상태와 오류 복구 상태에 맞는 Google action만 제공한다.

## 10. Frontend 책임 분리

### 10.1 Model

순수 model은 다음을 소유한다.

- 허용된 OAuth 오류를 로그인 복구 상태로 변환
- 상태별 문구, action label과 `chooseAccount` 여부 계산
- 카카오 User-Agent marker 판별
- canonical 복사 URL에 포함할 허용된 상태 계산

React, router, fetch 또는 provider URL 조립 세부사항에 의존하지 않는다.

### 10.2 Route

`LoginRouteContent`는 다음을 담당한다.

- `location.search`와 User-Agent를 model 입력으로 전달
- 기존 safe `returnTo` 계산
- OAuth href와 canonical 복사 URL 조립
- Clipboard API 호출 결과를 UI callback으로 전달
- view props 조립

### 10.3 UI

`LoginCard`는 전달받은 상태와 callback만 렌더링한다.

- OAuth 또는 User-Agent 규칙을 직접 해석하지 않는다.
- 오류는 기존처럼 `role="alert"`로 제공한다.
- 카카오 advisory는 오류로 취급하지 않는다.
- 복사 결과는 `aria-live="polite"`로 제공한다.
- primary와 secondary action의 시각 위계를 구분한다.
- 긴 한국어 문구가 작은 viewport에서 줄바꿈되며 action의 최소 조작 영역을 유지한다.

## 11. 데이터 흐름

```text
/login
  -> query와 User-Agent를 login recovery model로 정규화
  -> normal이면 일반 OAuth href
  -> error recovery이면 chooseAccount=true OAuth href
  -> KakaoTalk이면 외부 브라우저 advisory와 canonical URL 복사 제공

/oauth2/authorization/google
  -> Pages Function OAuth proxy
  -> Spring OAuth resolver
  -> chooseAccount=true만 prompt=select_account로 변환
  -> Google authorization endpoint

Google callback
  -> Pages Function callback proxy
  -> Spring Security callback
  -> 성공: ReadMates session 발급 후 검증된 target으로 이동
  -> 실패: session 정리 후 allowlisted error와 안전한 상대 returnTo로 /login 복귀
```

## 12. 예상 변경 표면

구현 계획은 현재 코드 구조를 다시 확인한 뒤 정확한 파일 단위를 고정한다. 예상 표면은 다음과 같다.

- `front/features/auth/model/`: 로그인 복구 상태와 카카오 User-Agent 판별
- `front/features/auth/route/login-route.tsx`: query/User-Agent/clipboard orchestration
- `front/features/auth/ui/login-card.tsx`: 오류별 action과 카카오 advisory
- `front/shared/auth/login-return.ts`: 안전한 OAuth start 및 canonical login URL 조립
- `front/tests/unit/cloudflare-oauth-proxy.test.ts`: `chooseAccount` query 전달 회귀 확인
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/PrimaryOriginOAuthAuthorizationRequestResolver.kt`: allowlisted account chooser mapping
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`: 오류와 안전한 상대 return target 보존
- 관련 frontend unit, Spring OAuth integration과 E2E 테스트

BFF route source는 현재 query를 보존하므로 동작 변경이 필요하지 않을 것으로 예상한다. 구현 전 characterization test가 이를 확인하며 현재 코드가 다르면 계획에서 범위를 조정한다.

## 13. 테스트 설계

### 13.1 Frontend model과 UI

- 정상 상태는 `chooseAccount=false`와 `Google로 시작하기`를 반환한다.
- `membership-left`는 종료 안내, `다른 Google 계정으로 로그인`, `chooseAccount=true`를 반환한다.
- `google`은 일반 실패 안내, `Google 로그인 다시 시도`, `chooseAccount=true`를 반환한다.
- 알 수 없는 오류 값은 정상 상태로 정규화한다.
- 복구 OAuth href는 safe `returnTo`와 `chooseAccount=true`를 함께 보존한다.
- unsafe `returnTo`와 허용되지 않은 query는 제거한다.
- KakaoTalk User-Agent에서만 advisory와 복사 action을 표시한다.
- 일반 browser User-Agent에는 advisory를 표시하지 않는다.
- clipboard 성공과 실패 상태를 각각 전달한다.

### 13.2 BFF와 Spring OAuth

- authorization proxy가 `chooseAccount=true`와 기존 query를 그대로 Spring으로 전달한다.
- callback과 authorization proxy의 cookie, forwarded host/proto, BFF secret과 internal header stripping 계약은 유지된다.
- `chooseAccount=true`에서 생성된 Google redirect URL에 `prompt=select_account`가 있다.
- 정상, false와 잘못된 값에는 `prompt`가 없다.
- browser가 보낸 `prompt`와 `login_hint`는 Google redirect URL에 반영되지 않는다.
- primary auth origin callback URI와 OAuth state가 유지된다.

### 13.3 실패와 성공 복귀

- LEFT 계정은 ReadMates session을 발급하지 않고 `membership-left`로 복귀한다.
- 안전한 상대 `returnTo`가 오류 복귀 URL에 보존된다.
- unsafe, 변조되거나 만료된 return state는 보존하지 않는다.
- 일반 authentication failure는 raw exception을 노출하지 않는다.
- 새 계정으로 성공하면 새 ReadMates session을 발급하고 보존된 목적지로 이동한다.
- invite flow의 기존 token capture와 검증된 복귀 계약이 회귀하지 않는다.

### 13.4 사용자 흐름과 반응형

- E2E fixture에서 정상 로그인 href와 오류 복구 href를 검증한다.
- KakaoTalk User-Agent browser context에서 advisory, 주소 복사, 보조 Google action을 검증한다.
- 작은 모바일 viewport에서 문구와 action이 겹치거나 잘리지 않는지 확인한다.
- keyboard focus, `role=alert`, `aria-live` 상태를 확인한다.

## 14. 검증 명령

구현 중에는 focused test를 먼저 실행하고 최종 HEAD에서 다음 repository gate를 실행한다.

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-card.test.tsx tests/unit/login-return.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
./server/gradlew -p server integrationTest --tests '*OAuthAuthorizationControllerTest' --tests '*GoogleOAuthLoginSessionTest'
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
```

Root `package.json`의 pinned package manager를 Corepack으로 실행한다. 구현 계획에서 테스트 소유권이 달라지면 같은 검증 범위를 유지한 채 실제 생성 파일명으로 focused command를 갱신한다.

실제 Google 계정 또는 카카오톡 운영 앱을 사용하는 로그인은 자동 테스트에 포함하지 않는다. repository evidence는 Google redirect URL 생성과 상태 경계까지 검증한다. 배포 후 실제 카카오톡 iOS/Android 버전 점검은 별도 operator follow-up이며 이번 구현 완료나 배포 완료를 의미하지 않는다.

## 15. 완료 조건

1. 정상 로그인에는 불필요한 계정 선택 강제가 없다.
2. `membership-left`와 일반 Google 실패 뒤 재시도는 Google 계정 선택을 요청한다.
3. browser query의 임의 provider parameter는 Google 요청으로 전달되지 않는다.
4. 안전한 상대 `returnTo`가 실패와 재시도 사이에 유지된다.
5. 카카오톡 인앱 브라우저에서 외부 브라우저 안내와 주소 복사를 사용할 수 있다.
6. 일반 브라우저에는 카카오 전용 안내가 보이지 않는다.
7. 기존 callback origin, OAuth state, BFF header, session cookie와 invite flow 테스트가 통과한다.
8. frontend lint/test/build, server PR-level, integration과 E2E 검증이 통과하거나 실행하지 못한 명령과 이유가 명시된다.
9. 실제 provider·카카오 runtime 확인과 repository 검증의 범위가 구분된다.

## 16. 잔여 위험과 운영 후속

- 카카오톡 User-Agent marker와 메뉴 문구는 앱 버전에 따라 달라질 수 있다. 감지는 advisory에만 사용하므로 false negative가 보안 경계를 약화하지는 않는다.
- Google의 embedded user-agent 판정은 provider가 소유하므로 ReadMates가 인앱 브라우저 로그인을 보장할 수 없다.
- Clipboard API는 브라우저 권한이나 보안 context에 따라 실패할 수 있어 수동 메뉴 안내를 함께 유지한다.
- `prompt=select_account`는 계정 선택을 요청하지만 사용자가 다시 종료 계정을 고르는 것까지 막지는 않는다. 이 경우 같은 명확한 종료 안내와 재시도 action을 다시 제공한다.
- 실제 카카오톡 iOS/Android 확인은 배포와 테스트 계정 권한이 필요한 별도 작업이다.

## 17. 승인 기록

사용자는 다음 결정을 순서대로 승인했다.

1. 정상 로그인은 빠르게 유지하고 실패 상태에서 계정 선택을 강제하는 권장 접근
2. frontend 상태 모델과 Spring OAuth resolver의 책임 분리
3. 카카오 인앱 브라우저 안내, 주소 복사 우선과 Google 시도 보조 UX
4. frontend, BFF, Spring OAuth, E2E를 포함하는 검증 범위
