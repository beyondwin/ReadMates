# ReadMates OAuth 및 공통 오류 경험 설계

작성일: 2026-08-05

상태: USER-APPROVED

대상 표면: auth, BFF, frontend route error, responsive UI

## 1. 배경과 현재 원인

게스트가 클럽 화면에서 `멤버로 시작`을 누르면 브라우저는 같은 출처의 `/oauth2/authorization/google`로 직접 이동한다. 로컬 Vite와 Cloudflare Pages Functions는 이 경로를 Spring Boot API로 프록시한다.

Spring Security는 `ClientRegistrationRepository`가 있을 때만 `oauth2Login`을 활성화한다. Google OAuth client registration이 로드되지 않은 환경에서는 Spring이 `/oauth2/authorization/google`을 등록하지 않으므로 JSON `404 Not Found`를 반환한다. 현재 프록시는 그 응답을 그대로 브라우저에 전달한다. 따라서 사용자는 ReadMates UI가 아닌 서버 JSON 오류를 보게 된다.

이 문제는 `joinClub`, `joinIntent`, `returnTo` 값의 형식 때문에 생기는 것이 아니다. 직접 내비게이션하는 OAuth 경로가 실패했을 때 프록시 응답을 사용자용 화면으로 번역하는 경계가 없는 것이 UX 원인이다.

SPA 내부에는 이미 403, 404, 409, 410, 429 및 일반 5xx 상태를 분류하는 `RouteErrorPage`가 있다. 그러나 OAuth 시작·콜백은 SPA 라우터에 들어가기 전에 처리되므로 이 화면을 사용하지 못한다. 기존 오류 화면도 기능은 갖췄지만, 일반적인 surface card에 머물러 ReadMates의 인증·공개 화면 톤과 다음 행동 위계가 충분히 구체적이지 않다.

## 2. 목표

- OAuth 시작 또는 콜백의 비정상 응답이 서버 JSON이나 기본 플랫폼 오류 페이지로 노출되지 않게 한다.
- upstream 404를 무조건 “없는 페이지”로 표시하지 않고 실제 사용자 의미에 맞게 번역한다.
- 일반 route 404, 인증·권한, 만료·충돌, 요청 제한, 5xx 장애를 하나의 시각·문구 체계로 정돈한다.
- 오류 화면에서도 현재 클럽 문맥과 안전한 복귀 경로를 최대한 유지한다.
- 정상 Google OAuth redirect, 쿠키, callback, one-time join intent 계약은 변경하지 않는다.
- 데스크톱과 모바일에서 ReadMates의 차분한 문학적 정체성, 명확한 행동, 접근성을 함께 유지한다.

## 3. 검토한 접근

### 3.1 같은 출처 오류 route로 변환 — 선택

Vite OAuth proxy와 Cloudflare OAuth Functions가 HTML 문서 내비게이션의 비정상 응답을 allowlist된 오류 유형으로 분류하고 `/auth/error`로 redirect한다. React route는 기존 공통 오류 모델을 확장한 인증 오류 화면을 렌더링한다.

장점은 프론트 디자인과 접근성을 한 곳에서 유지하고, Spring의 API 오류 계약을 변경하지 않으며, 로컬과 Cloudflare 환경을 같은 사용자 흐름으로 맞출 수 있다는 점이다. 정상 3xx 응답은 현재처럼 header와 cookie를 보존해 전달한다.

### 3.2 Spring이 HTML 오류 문서를 직접 반환

실제 HTTP 오류 상태를 최종 문서에 유지하기는 쉽다. 그러나 서버에 프론트 시각 체계를 복제해야 하고, API JSON과 브라우저 HTML 협상 책임이 Spring auth에 추가된다. Vite·Cloudflare SPA 경계와 중복되므로 채택하지 않는다.

### 3.3 OAuth 시작 전 가용성 preflight

멤버 시작 CTA가 OAuth provider 가용성을 먼저 확인한 뒤 이동한다. 일부 설정 누락은 일찍 알 수 있지만 네트워크 요청이 늘고, 확인 직후 장애가 발생하는 경쟁 조건을 해결하지 못한다. 기존 one-time join intent 흐름도 불필요하게 복잡해지므로 채택하지 않는다.

## 4. 선택한 아키텍처

### 4.1 공통 분류 모델

OAuth 프록시와 React route가 공유할 수 있는 순수 분류 모델을 `front/shared/auth` 경계에 둔다. 외부에서 받은 임의 문자열을 화면 copy나 redirect query로 전달하지 않고, 다음과 같은 고정된 오류 종류만 사용한다.

| 오류 종류 | 입력 예시 | 사용자 의미 |
| --- | --- | --- |
| `oauth_unavailable` | Google authorization start의 upstream 404 | 현재 로그인 제공자를 시작할 수 없음 |
| `request_invalid` | 400 또는 지원하지 않는 OAuth 시작 경로 | 요청을 확인할 수 없음 |
| `session_required` | 401 | 로그인 또는 인증 흐름을 다시 시작해야 함 |
| `access_denied` | 403 | 현재 상태에서 요청을 수행할 수 없음 |
| `request_expired` | 409 또는 410 | 인증 요청의 상태가 바뀌었거나 만료됨 |
| `rate_limited` | 429 | 잠시 후 다시 시도해야 함 |
| `internal_error` | 500 | 요청을 처리하는 중 내부 오류가 발생함 |
| `service_unavailable` | network failure, 502, 503, 504 및 그 밖의 5xx | 로그인 서비스 연결이 일시적으로 불안정함 |
| `unexpected` | 그 밖의 비정상 응답 | 안전한 일반 오류 안내가 필요함 |

일반 SPA route의 404는 계속 `page_not_found` 의미를 사용한다. Google authorization endpoint의 404는 route 404가 아니므로 `oauth_unavailable`로 번역한다.

### 4.2 프록시 동작

Vite 개발 proxy와 Cloudflare Pages authorization/callback Functions는 다음 계약을 공유한다.

1. 정상 3xx OAuth 응답은 현재처럼 `Location`, 허용된 cookie, 공개 가능한 header를 보존한다.
2. HTML 문서 내비게이션에서 발생한 비정상 응답만 같은 출처 `/auth/error`로 redirect한다.
3. JSON 또는 프로그램 호출은 기존 상태·본문 계약을 유지해 진단과 자동화가 깨지지 않게 한다.
4. Google authorization start의 404는 `oauth_unavailable`로 분류한다.
5. upstream 500은 `internal_error`, 연결 실패와 502·503·504 및 그 밖의 5xx는 `service_unavailable`로 분류한다.
6. callback의 query나 opaque state를 BFF에서 해석하지 않는다.
7. redirect에는 allowlist된 오류 종류와 검증된 상대 `returnTo`만 포함한다.

`joinIntent`, invite token, OAuth `state`, provider error 본문, upstream URL, stack trace, 내부 header, secret, raw query는 오류 route로 복사하지 않는다. 클럽으로 돌아가 재시도하면 기존 CTA가 새로운 one-time join intent를 발급한다.

### 4.3 React route와 구성요소

- `/auth/error`는 인증을 요구하지 않는 auth route다.
- route 계층이 query의 오류 종류와 `returnTo`를 파싱하고 allowlist 및 `safeRelativeReturnTo` 검증을 수행한다.
- 순수 모델이 오류 종류, 제목, 본문, 안심 문구, primary/secondary action을 결정한다.
- UI는 계산된 view model만 렌더링하며 proxy, API client 또는 router parsing 책임을 갖지 않는다.
- 기존 `RouteErrorPage`의 상태 분류와 시각 primitive를 재사용·확장해 일반 route 오류와 OAuth 오류가 같은 경험으로 보이게 한다.
- 오류 route는 raw 기술 오류를 렌더링하지 않고, observability에는 고정된 분류만 한 번 기록한다.

## 5. 오류별 UX와 문구 원칙

| 상황 | eyebrow | 제목 | 핵심 안내 | 기본 행동 |
| --- | --- | --- | --- | --- |
| 일반 404 | 찾을 수 없음 | 페이지를 찾을 수 없습니다. | 주소가 바뀌었거나 현재 범위에서 열 수 없는 페이지임 | 공개 홈 또는 현재 클럽 |
| OAuth 설정 누락 | 로그인 안내 | 로그인을 시작할 수 없습니다. | 현재 Google 로그인을 열 수 없으며 사용자가 변경한 내용은 없음 | 클럽으로 돌아가기 |
| 401 | 로그인 필요 | 로그인을 다시 시작해 주세요. | 인증 흐름이 끝났거나 세션을 확인할 수 없음 | 로그인으로 |
| 403 | 권한 필요 | 이 요청을 계속할 수 없습니다. | 현재 계정 또는 클럽 상태로 수행할 수 없음 | 현재 클럽으로 |
| 409·410 | 요청 만료 | 로그인 요청이 만료되었습니다. | 이전 요청을 재사용하지 말고 새로 시작해야 함 | 클럽으로 돌아가기 |
| 429 | 잠시 후 다시 | 요청이 잠시 많습니다. | 잠시 기다린 뒤 새 요청으로 다시 시도해야 함 | 돌아가기 |
| 500 | 서비스 오류 | 요청을 마치지 못했습니다. | 서비스 내부에서 문제가 발생했으며 입력·가입 상태가 바뀌지 않음 | 다시 시작하기 |
| 502·503·504 | 연결 지연 | 로그인 서비스 연결이 원활하지 않습니다. | 일시적인 연결 문제일 수 있음 | 잠시 후 다시 시도 |

문구는 오류 코드를 설명하기보다 다음 순서로 읽히게 한다.

1. 지금 할 수 없는 일
2. 사용자의 입력이나 가입 상태가 임의로 변경되지 않았다는 안심
3. 가장 안전한 다음 행동

사용자 화면에는 404, 500 같은 숫자를 주제목으로 노출하지 않는다. 필요하면 개발자 도구와 관측 로그에서 원래 upstream 상태를 확인한다.

## 6. 시각·상호작용 설계

이 화면의 visitor mode는 복구 행동을 수행하는 `Operate`다. 사용자는 멤버 참여 또는 로그인 의도가 끊긴 상태로 도착하므로 표현력보다 이해 속도, 안심, 안전한 다음 행동을 우선한다.

### 6.1 시각 방향

- 기존 `Modern editorial · warm neutral · ink blue` 체계를 그대로 확장한다.
- warm paper canvas 위에 좁은 reading column을 두고, 하나의 calm surface 또는 경계선으로 내용 영역을 구분한다.
- 제목에만 editorial type을 사용하고 본문, 상태, 행동은 읽기 쉬운 sans hierarchy를 유지한다.
- 작은 folio 번호, 짧은 구획선 또는 절제된 책갈피 형태처럼 기록물의 맥락을 보조하는 장식만 허용한다.
- 오류를 빨간 경고 면으로 만들지 않는다. danger 색은 꼭 필요한 작은 상태 표식에만 사용하고, 상태는 label과 문구로 함께 설명한다.
- gradient, glow, glassmorphism, 큰 경고 아이콘, stock illustration, 과도한 card nesting, 흔한 SaaS empty-state 장식은 사용하지 않는다.

### 6.2 정보 위계

첫 viewport에서 다음 순서가 한 번에 보인다.

1. ReadMates 또는 현재 클럽으로 돌아갈 수 있는 최소한의 맥락
2. 짧은 eyebrow와 구체적인 오류 제목
3. 한 문단의 원인·안심 문구
4. primary action과 secondary action
5. 필요한 경우에만 작고 절제된 도움말

primary action은 상태를 악화시키지 않는 복귀 행동이다. 임시 장애일 때만 명시적인 재시도를 제공하며, 자동 반복 요청은 하지 않는다. secondary action은 로그인 또는 공개 홈처럼 사용자가 다른 안전한 경로를 선택할 때만 나타난다.

### 6.3 반응형과 접근성

- 데스크톱은 넓은 빈 공간과 좁은 reading measure로 차분한 리듬을 만든다.
- 모바일은 단순 축소가 아니라 여백과 계층을 재조정하며, action을 세로 전체 폭으로 배치한다.
- 모든 action은 최소 44px 터치 영역과 가시적인 keyboard focus를 갖는다.
- heading 구조, landmark, alert/status 의미를 상태에 맞게 사용한다.
- 한국어와 영어가 320px 폭에서도 겹치거나 잘리지 않게 한다.
- 상태를 색상에만 의존하지 않고 WCAG AA 대비와 reduced-motion을 지킨다.
- 오류 화면 진입 시 제목으로 focus를 강제 이동해 브라우저 탐색을 깨지 않는다. 문서 제목과 첫 heading으로 화면 목적을 명확히 전달한다.

## 7. 데이터 흐름

```text
멤버로 시작
  -> POST-issued one-time join intent
  -> /oauth2/authorization/google 문서 이동
  -> Vite 또는 Cloudflare OAuth proxy
      -> 정상 3xx: Google/provider로 그대로 이동
      -> HTML 비정상 응답: 안전한 오류 종류로 분류
          -> /auth/error?kind=<allowlisted-kind>&returnTo=<safe-relative-path>
          -> React auth error route
          -> 사용자 안내와 안전한 복귀 행동
```

오류 화면에서 클럽으로 돌아간 사용자가 다시 `멤버로 시작`을 누르면 기존 흐름이 새 join intent를 발급한다. 실패한 intent를 오류 URL이나 재시도 link에 보존하지 않는다.

## 8. 테스트와 검증

### 8.1 단위·route 테스트

- 상태와 오류 종류가 올바른 사용자 문구·행동으로 분류되는지 확인한다.
- unknown kind는 `unexpected`로 안전하게 축소되는지 확인한다.
- 안전하지 않은 `returnTo`가 무시되는지 확인한다.
- raw query, join intent, OAuth state, upstream body가 렌더링되거나 redirect에 포함되지 않는지 확인한다.
- 일반 public/member/host/auth 401, 403, 404, 409, 410, 429, 5xx 화면이 올바른 fallback action을 갖는지 확인한다.
- semantic heading, action label, focus style hook, wrapping class를 확인한다.

### 8.2 Vite·Cloudflare proxy 테스트

- Google authorization 302와 callback 302가 현재 cookie/header/Location 계약을 보존하는지 확인한다.
- HTML 문서 요청의 Google authorization 404가 `oauth_unavailable` 오류 route로 이동하는지 확인한다.
- 429와 5xx 및 upstream 연결 실패가 각각 안전한 오류 종류로 이동하는지 확인한다.
- JSON 호출은 기존 상태와 sanitized response를 유지하는지 확인한다.
- 내부 header, secret, token-shaped query가 outbound 오류 URL에 포함되지 않는지 확인한다.

### 8.3 E2E·시각 검증

- 게스트 클럽 화면에서 `멤버로 시작`을 누르고 upstream 404를 fixture로 반환해 JSON 대신 ReadMates 오류 화면이 나타나는지 확인한다.
- 정상 OAuth 시작 fixture가 계속 provider redirect URL을 받는지 확인한다.
- desktop과 mobile에서 404, OAuth unavailable, 500/503 대표 화면을 한 번의 batched screenshot pass로 확인한다.
- action hierarchy, 320px wrapping, 44px target, visible focus, public/member 문맥을 확인하고 한 번의 수정 batch와 최종 확인 pass로 끝낸다.

최종 구현 검증은 다음을 포함한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

## 9. Acceptance Matrix

- `BFF or OAuth`: same-origin proxy, 정상 redirect/cookie 보존, 안전한 오류 redirect, raw state와 join intent 비노출을 BFF unit 및 E2E로 확인한다.
- `UI or runtime state`: 401, 403, 404, 409/410, 429, 500/503 상태와 desktop/mobile, wrapping, focus, action hierarchy를 component/route/browser evidence로 확인한다.
- `Club context`: 검증된 상대 `returnTo`만 복귀에 사용하고 현재 club 범위를 벗어나는 값은 무시하는지 route/model 테스트로 확인한다.
- Actor authorization, persistence/migration, guest DTO, cursor, async provider side effect 행은 권한·schema·공개 DTO·collection·실제 provider 호출을 변경하지 않으므로 제외한다.

## 10. 비목표와 경계

- Google OAuth credential을 코드, 문서, 브라우저 환경 또는 테스트 fixture에 추가하지 않는다.
- Spring OAuth registration, success/failure handler, membership, join-intent 발급·소비 계약을 변경하지 않는다.
- 실제 Google provider 호출, 실제 멤버 가입, 운영 배포를 검증에 사용하지 않는다.
- 오류 화면에서 자동 재시도, countdown, support chat, telemetry identifier 노출을 추가하지 않는다.
- ReadMates의 전역 visual identity를 교체하거나 별도 오류 전용 디자인 시스템을 만들지 않는다.
- unrelated route, auth copy, public page layout을 함께 재설계하지 않는다.

## 11. 완료 조건

- OAuth 직접 내비게이션의 404·5xx·연결 실패가 ReadMates 오류 화면으로 안전하게 연결된다.
- 정상 OAuth redirect와 callback 계약이 회귀하지 않는다.
- 일반 404와 OAuth unavailable이 서로 다른 의미와 문구를 사용한다.
- 오류 화면은 ReadMates의 warm paper, ink hierarchy, restrained editorial identity를 유지하면서 다음 행동을 명확히 제공한다.
- desktop/mobile, keyboard, wrapping, proxy security와 frontend checks가 모두 실제 증거로 확인된다.
