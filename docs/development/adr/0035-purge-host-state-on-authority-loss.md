# ADR-0035: Host authority 상실 시 client의 host-sensitive state를 폐기

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·보안·프런트엔드
- 관련: ADR-0019, ADR-0030, `front/src/app/route-continuity.ts:80`

## 컨텍스트

Host가 화면을 연 상태에서 role revoke, membership suspend, cross-club scope failure가 발생할 수 있다. Local draft 보존을 일반 오류 정책으로 적용하면 권한을 잃은 actor의 memory, persisted storage, query cache, Back/Forward에 host-only 내용이 남는다.

## 결정

Authoritative error code가 `HOST_AUTHORITY_REVOKED`, `MEMBERSHIP_SUSPENDED`, `CROSS_CLUB_SCOPE`이면 in-flight host request를 취소하고 해당 club의 host query cache, local draft, meeting URL/passcode, member ledger, record/history/receipt, notification preview, host-only return state를 즉시 폐기한다. 모든 host query key는 canonical `clubSlug` prefix를 사용하고 persisted/route-owned state는 mandatory sensitive-storage registry에 등록한다. Generic response parser는 public/member/archive/feedback를 위해 순수하게 유지한다. Host fetch와 수동 host response parser만 별도 boundary에서 `{clubSlug, requestKind}` context를 필수로 받아 같은 typed authority event를 발생시키며, host feature의 generic parser 직접 사용은 executable inventory로 금지한다. App composition root의 단일 security-controller extension이 `cancel → exact-club purge → safe replace → alert/focus`를 수행한다. 안전한 route-family만 남겨 member-safe 또는 club-selection route로 `replace`한다. `REVISION_CONFLICT`와 authority가 유지된 `NETWORK_RESPONSE_LOST`는 이 purge 대상이 아니다.

## 근거

- 권한 상실 뒤 client-side data remanence와 cross-club replay를 막는다.
- Concurrency recovery와 security purge를 HTTP status가 아닌 authoritative cause로 구분한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 모든 403에서 draft 보존 | Authority loss에서 민감 host state가 남을 수 있다. |
| 모든 오류에서 즉시 purge | Recoverable conflict에서 사용자의 안전한 초안까지 잃는다. |

## 결과

긍정적:
- Role revoke가 navigation뿐 아니라 client data lifecycle에도 반영된다.

부정적/감수한 비용:
- Query key inventory, persisted storage, service worker/offline path를 모두 검증해야 한다.

## 검증

- Executable query-key/storage/manual-parser inventories가 member approval/invite, notification, AI, session/record/recovery/trash, club operation을 빠짐없이 포함하는지 unit test한다.
- Open tab, in-flight mutation, Back/Forward, new tab, offline/service worker, multi-club fixture에서 authority-loss purge를 browser test한다.

## 후속 작업

- Code, tests, privacy threat model, active architecture가 일치하면 `Accepted`로 승격한다.
