# ADR-0034: Client contract generation을 모든 host mutation에 적용

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 서버·BFF·프런트엔드
- 관련: ADR-0009, ADR-0023, ADR-0028, `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt:168`, `front/functions/api/bff/[[path]].ts:106`

## 컨텍스트

현재 host-write client contract 검사는 mutating `/api/host/**` 전체에 적용된다(`BffSecretFilter.kt:168-174`, `[[path]].ts:106-115`). Session mutation만 새 revision/idempotency 계약으로 올리더라도 같은 browser generation은 member approval, invite, notification 등 non-session host mutation에도 전달된다.

## 결정

`X-Readmates-Client-Contract: v3`는 endpoint-family capability가 아니라 모든 mutating `/api/host/**`에 적용하는 global host-client generation으로 정의한다. Browser, BFF, backend가 v3를 모두 지원할 때만 v3 host write를 허용하며 header를 downgrade하거나 의미 변환하지 않는다. Session-management endpoint는 v3에서 ADR-0023/0028의 새 envelope을 적용하고, non-session host mutation은 기존 의미를 회귀 없이 유지한다.

Browser preflight는 secret diagnostics와 분리된 `GET /api/bff/__internal/client-contract-status`만 사용한다. 이 response는 schema version과 supported generation allowlist만 반환하고 `Cache-Control: no-store`이며 secret presence, environment, deployment/config metadata를 노출하지 않는다. Rollout은 서로 다른 immutable artifact인 R1(BFF v2/v3, browser v2), R2a(A7+C1 safety backend/cache policy, browser v2), R2b(BFF v2/v3, browser v3), named 24-hour residue-zero observation, R3 backend v3 enforcement 순이다. R2a 뒤 이전 720초 browser policy와 별도 cache-safety manifest가 통과해야 한다. Pages-only R2b의 compatibility/security manifest는 실제 배포된 R2a backend digest와의 동일성을 증명하고 같은 R2b Pages candidate에 묶인다. Backend를 바꾸려면 별도 live 승인·배포·health·provenance stage가 선행한다. 세 manifest의 암호학적 신뢰는 checksum으로 고정한 공식 `gh attestation verify`가 명시적으로 전달된 manifest/bundle, repository, signer workflow, source digest/ref를 검증하고 Python은 그 성공 결과에 schema/case/policy만 적용하는 경계로 둔다. 실제 digest/run/deployment state는 tracked docs에 저장하지 않는다. 각 live stage는 repository 구현 승인과 별개의 fresh deployment authority가 없으면 artifact/runbook-ready에서 멈춘다.

## 근거

- 현재 global enforcement 경계와 deployment generation을 일치시킨다.
- 열린 구 browser와 혼합 BFF/backend 배포를 fail closed한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Session endpoint만 v3 | 현재 global host-write enforcement와 충돌한다. |
| BFF가 v3를 v2로 변환 | Browser와 backend가 다른 계약을 사용한 사실을 숨긴다. |

## 결과

긍정적:
- Host write의 rolling-deploy 판단이 한 generation으로 단순해진다.

부정적/감수한 비용:
- 모든 non-session host mutation의 v3 regression evidence가 필요하다.

## 검증

- v2/v3 browser × BFF × backend 3축 matrix와 session/non-session host mutation을 integration/E2E test한다.
- 별도 no-store capability endpoint가 exact schema만 반환하고 secret-status metadata를 재사용하지 않는지 검증한다.
- R1/R2a/R2b immutable tag 분리, 720초 cache gate, R2a cache manifest와 R2b compatibility/security manifest, R2a/R2b backend digest 동일성, explicit manifest/bundle attestation, residue gate, R3 enforcement와 stage별 live-authority checkpoint를 deploy checker로 검증한다.

## 후속 작업

- Backend/BFF support, v3 frontend adoption, enforcement 순서와 metric이 일치하면 `Accepted`로 승격한다.
