# ADR-0027: 현재 모임 작업은 local task navigation으로 분리

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·디자인·프런트엔드
- 관련: ADR-0003, ADR-0026, `docs/development/architecture.md:389`

## 컨텍스트

현재 모임의 개요·참석 응답·실제 출석·기록·알림·변경 내역은 cross-meeting host 메뉴가 아니라 한 객체 안의 작업이다. 이를 global menu나 순차 stepper로 표현하면 정보 구조와 lifecycle 의미가 왜곡된다.

## 결정

현재 모임 작업은 URL deep link와 1:1로 연결된 unordered local `<nav>` link 집합으로 제공한다. Desktop은 왼쪽 index, tablet은 horizontal context strip을 쓴다. Tablet에서 200% zoom·긴 label·container 폭 때문에 전 항목을 읽을 수 없으면 이름 있는 disclosure button과 anchored non-modal popover `<nav>`로 바꾼다. Mobile은 full-width `모임 작업 목차` button과 modal bottom sheet `<nav>`를 쓴다. 이들은 같은 navigation이며 global host menu가 아니다. 순번, 연결선, 완료율, 다음 단계 강제를 쓰지 않고 `미응답 5`, `확인 필요`, `초안 있음` 같은 데이터 상태만 badge로 표시한다.

## 근거

- Cross-meeting 이동과 current-resource 작업 ownership을 분리한다.
- URL, focus, Back/Forward로 현재 작업을 재현할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| global host menu에 모든 작업 추가 | 객체별 task가 primary IA를 잠식한다. |
| lifecycle stepper | 작업 순서와 완료가 실제 lifecycle과 일치하지 않는다. |

## 결과

긍정적:
- Dense desktop과 compact mobile에서 같은 task model을 유지한다.

부정적/감수한 비용:
- 기존 tab/rail 금지 문구와 새 local-nav 예외를 active architecture에 정밀하게 반영해야 한다.

## 검증

- Link active state, deep link, invalid query fallback, tablet overflow disclosure, mobile sheet focus trap/route-heading 이동/dismiss focus 복원, sticky focus visibility, keyboard/AT behavior를 browser test한다.

## 후속 작업

- 코드·tests·active architecture가 일치하면 `Accepted`로 승격한다.

## 미충족 증거

- Route, focus, mobile sheet automated evidence는 있으나 VoiceOver/Safari와 NVDA/Chrome의 전체 navigation/form/conflict 수동 검증은 아직 `not measured`다.
