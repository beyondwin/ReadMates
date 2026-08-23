# ADR-0036: Public projection 원자성과 cache convergence를 분리

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 서버·BFF·운영·제품
- 관련: ADR-0022, ADR-0028, `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt:22`

## 컨텍스트

현재 public response는 `max-age=120, stale-while-revalidate=600`이다(`PublicController.kt:22`). Database transaction과 origin projection은 원자적으로 바꿀 수 있지만, 이미 fresh cache를 가진 browser와 CDN은 같은 순간에 바뀌지 않는다. CDN purge도 이미 렌더링되거나 offline으로 저장된 내용을 원격 삭제하지 못한다.

## 결정

Publication/revoke transaction은 DB와 origin projection, cache generation을 원자적으로 바꾸고 immutable mutation receipt에 origin result, generation, actor, request identity, `convergenceId`를 남긴다. CDN purge attempt는 별도 append-only convergence ledger에 `PENDING|SUCCEEDED|FAILED`, provider attempt, observed time을 추가하고 current projection은 ledger에서 계산한다. Mutation receipt를 상태 갱신 용도로 수정하지 않는다. 일반 수정·visibility revoke는 새 navigation/read가 120초 안에 수렴해야 한다. 민감 정보 긴급 takedown은 origin을 즉시 deny하고 관련 public response의 browser freshness를 60초 이하로 낮춰 새 navigation/read가 60초 안에 deny를 관찰하게 한다. 이 정책을 활성화하기 전에는 기존 `max-age=120 + stale-while-revalidate=600` browser lifetime 전체인 720초를 기다린다. CDN/BFF purge는 이미 이전 header로 저장된 browser cache를 지우지 못하므로 이 대기 증거를 대체하지 않는다. R2a는 이 시간 순서와 origin/BFF/CDN/old-browser 결과를 별도 attested cache-safety manifest로 고정하고, R2b는 동일 C1 source set을 새 Pages candidate에서 결정론적으로 재실행한다. 이미 렌더링·저장·offline인 copy는 SLA 밖임을 confirmation과 runbook에 명시한다. 긴급 takedown command authorization과 idempotency는 ADR-0037을 따른다.

Operational lease/work row는 retention에 따라 제거할 수 있다. Immutable receipt/convergence event는 삭제 가능한 session/publication content에 destructive FK를 두지 않고 redacted resource UUID snapshot을 보존한다. 기존 7일 hard delete는 계속 성공해야 하며, immutable bytes는 authorized audit 경로에서만 조회한다.

## 근거

- DB atomicity와 distributed cache의 관찰 가능성을 정직하게 구분한다.
- Emergency SLA를 실제 browser cache header와 연결한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| DB commit 즉시 모든 reader가 전환됐다고 간주 | Browser/CDN cache 현실과 맞지 않는다. |
| CDN purge만으로 60초 보장 | 이미 fresh browser cache에는 영향을 주지 못한다. |

## 결과

긍정적:
- Host와 operator가 origin 성공과 convergence 실패를 구분한다.

부정적/감수한 비용:
- Cache header 변경, provider purge tracking, browser-level timing test가 필요하다.

## 검증

- Origin/CDN/browser fresh·stale boundary에서 일반 120초, 긴급 60초 목표, 기존 720초 policy 소진 gate와 purge failure receipt를 integration/browser test한다.
- 만료된 synthetic session/publication hard delete가 성공하고 operational row는 retention대로 정리되며 redacted immutable convergence bytes는 남는지 검증한다.
- 2026-08-24 server service/API subset은 claim lease와 `PENDING` commit, transaction 밖 provider 호출, 별도 terminal commit, deterministic attempt token, bounded retry/backoff, host-authorized bounded status query를 구현했다. Scheduler와 HTTP provider는 명시적 삼중 opt-in 이전에는 활성화되지 않는다. Cache header/browser/CDN evidence와 emergency control plane은 아직 후속 작업이므로 이 ADR은 `Proposed`를 유지한다.

## 후속 작업

- Cache strategy, incident runbook, metrics, tests가 일치하면 `Accepted`로 승격한다.
