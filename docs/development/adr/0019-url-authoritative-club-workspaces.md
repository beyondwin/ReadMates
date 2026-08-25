# ADR-0019: URL이 소유하는 club-scoped workspace identity

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 제품·프런트엔드
- 관련: ADR-0003, ADR-0008,
  `front/src/app/layouts/app-route-layout.tsx:255`,
  `front/src/app/route-continuity.ts:80`,
  `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

## 컨텍스트

같은 사람은 한 클럽에서 member이면서 host일 수 있다. 현재 mobile 공유 route는 route state와 `sessionStorage`의 `readmates:mobile-workspace`로 chrome을 추론한다(`app-route-layout.tsx:255-268`, `route-continuity.ts:80-116`). 같은 URL이 새 탭, Back/Forward, viewport에 따라 다른 workspace처럼 보일 수 있다.

## 결정

Workspace identity는 scoped canonical URL이 소유한다. `/clubs/:slug/app/**`는 member, `/clubs/:slug/app/host/**`는 host workspace이며, render authority는 pathname과 authoritative club loader다. `/app/**`는 current club을 해석한 뒤 scoped URL로 `replace`하는 compatibility entry일 뿐 workspace authority가 아니다. Club을 바꿀 때는 route-family allowlist만 보존하고 source club의 entity ID, cursor, query를 목적지에 재사용하지 않는다.

## 근거

- URL만으로 새 탭, reload, Back/Forward, viewport 변경을 재현할 수 있다.
- club switch에서 source club entity ID와 cursor를 목적지로 누출하지 않게 route-family allowlist를 적용할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| `sessionStorage`로 마지막 workspace 추론 | URL 의미가 history와 tab-local 상태에 따라 바뀐다. |
| route state만으로 workspace를 지정 | reload와 direct entry에서 authority를 복원할 수 없다. |

## 결과

긍정적:
- deep link, club switch를 pure route model로 검증할 수 있다.
- desktop/mobile이 같은 URL 의미를 공유한다.

부정적/감수한 비용:
- shared record route, compatibility entry, mobile tab 추론을 migration해야 한다.
- compatibility redirect와 club 전환 allowlist를 구현해야 한다.

## 검증

- member↔host 후 Back/Forward, direct entry, new tab, reload, resize를 route integration test로 확인한다.
- host-club↔member-only-club 전환에서 entity ID/query/cursor가 이동하지 않는지 확인한다.
- role revoked 시 host cache와 return state가 폐기되고 scoped safe route로 `replace`되는지 browser test한다.

## 후속 작업

- ADR-0026은 공통 global shell, ADR-0027은 current-meeting local navigation을 별도로 결정한다.
- 코드·테스트·active architecture가 URL authority를 반영하면 `Accepted`로 승격한다.
