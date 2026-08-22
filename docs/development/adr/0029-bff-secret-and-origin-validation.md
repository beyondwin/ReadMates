# ADR-0029: Mutating API에 BFF secret과 Origin/Referer를 함께 검증

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·보안
- 관련: ADR-0005, `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt:74`

## 컨텍스트

브라우저 요청은 Cloudflare Pages Functions BFF를 거쳐 Spring API에 도달한다. BFF 통과 여부만으로는 state-changing request의 browser origin을 확인할 수 없다.

## 결정

Spring `/api/**`는 설정된 BFF secret을 검증하고, `POST|PUT|PATCH|DELETE`에는 allowlist에 든 `Origin` 또는 `Referer`를 추가로 요구한다(`BffSecretFilter.kt:74-99`, `BffSecretFilter.kt:157-166`). BFF secret은 server-side runtime에만 두고 public frontend environment에 노출하지 않는다.

## 근거

- Trusted proxy 경계와 browser-origin 경계를 함께 검증한다.
- Mutation은 origin 정보가 없거나 허용되지 않으면 fail closed한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| BFF secret만 검증 | Browser-origin 의미를 확인하지 못한다. |
| Origin만 검증 | Direct API와 trusted proxy 경계를 구분하지 못한다. |

## 결과

긍정적:
- Mutating request의 두 신뢰 조건이 한 filter에서 강제된다.

부정적/감수한 비용:
- 환경별 allowed origin과 secret rotation을 함께 운영해야 한다.

## 검증

- BFF secret/Origin/Referer의 valid, missing, invalid matrix를 filter와 E2E test한다.

## 후속 작업

- 검증 순서나 trust boundary를 바꾸면 이 ADR을 supersede한다.
