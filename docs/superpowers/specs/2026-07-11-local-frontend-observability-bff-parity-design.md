# 로컬 프런트엔드 관측 이벤트 BFF 경로 일치 설계

작성일: 2026-07-11
상태: APPROVED DESIGN

## 문제

프런트엔드 관측 클라이언트는 React Router 이동 완료와 API 실패 시
`POST /api/bff/observability/frontend-events`를 전송한다. 운영 Cloudflare Pages에서는 전용
Pages Function이 이 브라우저 경로를 Spring의
`POST /api/observability/frontend-events`로 전달한다.

로컬 Vite 개발 서버는 Pages Function을 실행하지 않고 `/api/bff/**` 공통 프록시에서
`/api/bff` 접두사만 제거한다. 그 결과 관측 이벤트가 존재하지 않는
`/observability/frontend-events`로 전달되고 Spring Security에서 403을 반환한다. 화면 이동은
fail-open 정책으로 계속되지만, 모든 SPA 이동이 콘솔 오류를 남기고 로컬 관측 데이터가
수집되지 않는다. 다른 API의 실패도 `API_FAILURE` 이벤트를 추가로 만들기 때문에 동일한
403이 한 번의 이동에서 여러 건으로 증폭될 수 있다.

## 목표

- 로컬과 운영에서 동일한 브라우저 관측 경로와 Spring upstream 경로 계약을 사용한다.
- 공개, 멤버, 호스트, 플랫폼 관리자 SPA 이동에서 관측 이벤트 요청이 202를 반환한다.
- 일반 `/api/bff/api/**` 로컬 프록시 동작을 변경하지 않는다.
- BFF secret, Origin/Referer 검증, Spring authorization 정책을 완화하지 않는다.
- 경로 문자열 중복과 로컬 Vite 통합 테스트 사각지대를 제거해 같은 회귀를 방지한다.

## 선택한 설계

### 공통 경로 계약

브라우저에 공개해도 안전한 두 경로를 작은 공통 모듈에서 단일 source of truth로 관리한다.

```text
FRONTEND_OBSERVABILITY_BROWSER_PATH
  = /api/bff/observability/frontend-events

FRONTEND_OBSERVABILITY_UPSTREAM_PATH
  = /api/observability/frontend-events
```

이 모듈은 경로 상수만 소유하며 secret, origin allowlist, 배포 환경값은 포함하지 않는다.
프런트엔드 관측 클라이언트는 browser path를 사용하고, Cloudflare Pages Function과 로컬
Vite 프록시는 upstream path를 사용한다.

### 로컬 Vite rewrite

Vite 프록시는 observability browser path를 정확히 판별해 upstream path로 변환한다. 그 밖의
`/api/bff/**` 요청은 기존의 `/api/bff` 접두사 제거 규칙을 유지한다. 판별은 유사 prefix가
아니라 정확한 pathname을 기준으로 하며 query string을 보존한다.

```text
로컬
/api/bff/observability/frontend-events
  -> Vite exact rewrite
  -> /api/observability/frontend-events
  -> Spring 202

일반 로컬 API
/api/bff/api/**
  -> 기존 Vite rewrite
  -> /api/**
```

운영 Cloudflare Pages Function의 검증, payload 정규화, request id, BFF secret, Origin/Referer
전달 동작은 유지한다. Spring endpoint와 SecurityConfig도 변경하지 않는다.

## 데이터 흐름

### 운영

1. SPA가 공통 browser path로 JSON telemetry batch를 전송한다.
2. Cloudflare 전용 Pages Function이 content type, body 크기, event shape를 검증하고 정규화한다.
3. Pages Function이 공통 upstream path로 BFF secret, request id, Origin/Referer를 붙여 전달한다.
4. Spring이 BFF와 origin 경계를 검증하고 정상 batch를 202로 수락한다.

### 로컬

1. SPA가 운영과 같은 browser path로 JSON telemetry batch를 전송한다.
2. Vite가 exact rewrite로 공통 upstream path를 만든다.
3. 기존 로컬 프록시가 BFF secret과 브라우저 Origin을 포함해 Spring으로 전달한다.
4. Spring은 운영과 같은 endpoint와 보안 규칙으로 batch를 202로 수락한다.

## 오류 처리

- 기존 fail-open 정책을 유지해 telemetry 실패가 사용자 이동이나 API 결과를 바꾸지 않는다.
- telemetry 전송에 신규 retry, 사용자 알림, queue persistence를 추가하지 않는다.
- 403을 콘솔에서 숨기거나 응답을 202로 위장하지 않고 실제 upstream 경로를 바로잡는다.
- 잘못된 BFF secret이나 허용되지 않은 Origin은 계속 401 또는 403으로 실패해야 한다.
- observability 요청은 공통 `readmatesFetch`를 사용하지 않으므로 telemetry 실패가 다시
  `API_FAILURE` telemetry를 만드는 재귀 경로를 추가하지 않는다.

## 검토한 대안

### Vite 설정에 문자열 특례만 직접 추가

변경량은 가장 작지만 browser path와 upstream path가 클라이언트, Pages Function, Vite에
계속 중복된다. 이후 경로 변경 시 다시 어긋날 수 있어 제외한다.

### 개발환경의 클라이언트 endpoint만 `/api/bff/api/observability/frontend-events`로 변경

현재 일반 Vite rewrite에서는 동작하지만 환경별로 브라우저 계약이 달라진다. 로컬에서만
운영에 존재하지 않는 URL을 사용해 parity를 낮추므로 제외한다.

### 로컬 개발 서버를 Wrangler/Pages Functions로 전면 전환

운영 실행환경과 가장 비슷하지만 개발 명령, OAuth proxy, 환경변수와 E2E bootstrap을 함께
바꾸는 별도 프로젝트가 된다. 이번 경로 회귀를 해결하기에는 변경 비용과 영향 범위가
과도해 제외한다.

## 테스트 전략

### 순수 경로 계약 테스트

- observability browser path가 정확한 Spring upstream path로 변환된다.
- query string이 손실되지 않는다.
- 일반 `/api/bff/api/**` 경로는 기존처럼 `/api/**`로 변환된다.
- observability 경로와 비슷하지만 일치하지 않는 경로는 exact 특례를 타지 않는다.

### 기존 단위 테스트 정렬

- 관측 클라이언트가 공통 browser path를 사용한다.
- Cloudflare Pages Function이 공통 upstream path를 사용한다.
- JSON Blob 기반 `sendBeacon`과 fetch fallback 동작을 유지한다.
- BFF의 payload sanitization, body 크기 제한, secret/header 정리는 그대로 검증한다.

### 로컬 통합 회귀 테스트

실제 Vite 개발 서버와 Spring test server를 사용하는 focused Playwright E2E에서 다음을
검증한다.

1. 공개 홈을 연 뒤 `/records` 링크로 SPA 이동한다.
2. `POST /api/bff/observability/frontend-events` 응답을 수집한다.
3. 응답 status가 202인지 확인한다.
4. 해당 이동에서 telemetry 403이 발생하지 않았는지 확인한다.

이 테스트는 Pages Function과 Spring endpoint를 따로 호출하는 단위 테스트만으로는 잡을 수
없는 `browser -> Vite dev proxy -> Spring` 경계를 직접 검증한다.

## 변경 범위

- `front/shared/observability/`: browser/upstream 경로 계약과 클라이언트 사용처
- `front/functions/api/bff/observability/frontend-events.ts`: 공통 upstream 경로 사용
- `front/vite.config.ts` 또는 작은 로컬 프록시 helper: exact observability rewrite
- `front/shared/observability/*.test.ts`: 경로 계약과 클라이언트 회귀 테스트
- `front/tests/unit/functions/frontend-observability-bff.test.ts`: Pages Function upstream 계약
- `front/tests/e2e/`: 실제 Vite 프록시를 통과하는 focused 이동 회귀 테스트

서버 endpoint, Spring Security 규칙, DB migration, OAuth, auth cookie, Cloudflare secret 구성,
배포 workflow는 변경하지 않는다.

## 완료 조건

- 잘못된 로컬 경로 `/observability/frontend-events`가 더 이상 호출되지 않는다.
- 로컬 SPA 이동의 observability POST가 202를 반환한다.
- 공개, 멤버, 호스트, 플랫폼 관리자 이동에서 telemetry 403이 발생하지 않는다.
- 일반 BFF API, dev login, auth/me와 clubSlug 전달 동작이 회귀하지 않는다.
- 잘못된 secret과 Origin을 거절하는 기존 보안 테스트가 계속 통과한다.
- 관련 unit test, frontend lint, frontend build와 focused E2E가 통과한다.
