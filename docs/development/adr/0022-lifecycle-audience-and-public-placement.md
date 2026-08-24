# ADR-0022: 모임 lifecycle, app audience, 공개 사이트 배치를 독립 축으로 유지

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 제품·서버·프런트엔드
- 관련: `server/src/main/kotlin/com/readmates/session/domain/SessionState.kt:3`,
  `server/src/main/kotlin/com/readmates/session/domain/SessionExposure.kt:3`,
  `docs/development/architecture.md:356`

## 컨텍스트

모임 운영 단계, guest/member가 app에서 읽을 수 있는지, 공개 사이트에 게시되는지는 서로 다른 질문이다. 현재 domain은 `DRAFT/OPEN/CLOSED/PUBLISHED`, `HOST_ONLY/GUEST_READABLE`, `HIDDEN/PUBLIC_RECORD`를 분리한다(`SessionState.kt:3-8`, `SessionExposure.kt:3-15`). 공개 query는 `PUBLISHED + PUBLIC_RECORD`만 반환하고, `CLOSED + GUEST_READABLE`은 archive에는 보이지만 notes/public site에는 나오지 않는다(`architecture.md:356-375`).

## 결정

다음 세 축을 합치지 않는다.

1. lifecycle: `DRAFT → OPEN → CLOSED → PUBLISHED`
2. app audience: `HOST_ONLY | GUEST_READABLE`
3. public-site placement: `HIDDEN | PUBLIC_RECORD`

`PUBLISHED`를 인터넷 전체 공개의 동의어로 사용하지 않는다. `HOST_ONLY + PUBLIC_RECORD`와 `DRAFT/OPEN + PUBLIC_RECORD`는 fail closed한다. 사용자 action copy는 이 데이터 결정과 별도로 ADR-0018을 따른다.

## 근거

- guest/member app과 public marketing site의 privacy boundary를 분리한다.
- 기록 검토·발행과 public-site editorial placement를 독립적으로 되돌릴 수 있다.
- 모든 forward/reverse transition에서 reader projection을 계산하고 검증할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| `PUBLISHED = 인터넷 공개` | guest/member 발행과 public-site placement를 구분할 수 없다. |
| 단일 `visibility` enum | lifecycle과 audience 조합이 늘수록 의미가 모호하고 잘못된 조합을 만들기 쉽다. |
| 화면별 자체 visibility 계산 | host preview와 실제 reader query가 drift할 수 있다. |

## 결과

긍정적:
- Host/guest/member/public projection을 하나의 server policy로 검증할 수 있다.
- public-site 게시 취소가 member archive history를 지우지 않는다.

부정적/감수한 비용:
- host UI가 세 표면 결과를 action 전에 설명해야 한다.
- cache invalidation과 rolling-deploy compatibility dual-write를 함께 유지해야 한다.

## 검증

- lifecycle × access scope × site visibility matrix를 server integration test한다.
- public/guest/member DTO가 허용된 조합만 반환하는지 contract test한다.
- publish/unpublish/reopen/return-to-draft에서 실제 reader projection과 cache 결과를 검증한다.

## 후속 작업

- ADR-0018의 audience-specific copy를 UI·template에 적용한다.
- public visibility revoke와 긴급 takedown SLA는 ADR-0036, idempotent receipt는 ADR-0028을 따른다.
