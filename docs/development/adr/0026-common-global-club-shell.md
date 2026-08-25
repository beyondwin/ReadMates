# ADR-0026: Member와 host가 공통 global club shell을 사용

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·디자인·프런트엔드
- 관련: ADR-0019, ADR-0020, `front/shared/ui/top-nav.tsx:390`

## 컨텍스트

같은 사용자가 member와 host를 겸할 수 있지만 desktop host와 member의 primary navigation 위치와 전환 방식이 다르면 역할 전환이 제품 전환처럼 느껴진다.

## 결정

Member와 host workspace는 brand, current club, 이름이 보이는 workspace selector, account를 포함한 공통 global shell을 쓴다. 두 역할의 primary navigation은 같은 breakpoint에서 동일한 위치와 interaction model을 사용하며 label은 각각 `멤버 공간`, `호스트 공간`을 명시한다. Wide/compact desktop과 tablet은 상단 horizontal navigation, mobile은 하단 4개 tab이다. Platform admin은 같은 brand/account spine을 공유하되 별도 cross-club `플랫폼 운영` scope를 사용한다.

## 근거

- 역할을 오가도 navigation memory와 club context가 유지된다.
- Host만 다른 제품처럼 보이는 visual drift를 막는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| host만 global left rail 사용 | 역할 전환 때 primary navigation 위치가 바뀐다. |
| icon-only 역할 전환 | 현재 공간과 목적지가 이름으로 드러나지 않는다. |

## 결과

긍정적:
- 역할 전환과 responsive shell을 공통 component로 검증할 수 있다.

부정적/감수한 비용:
- 기존 desktop/mobile navigation migration이 필요하다.

## 검증

- role 겸임/단일 권한, 320~1440px, 200% zoom, keyboard/screen reader에서 shell과 role 전환을 browser test한다.

## 후속 작업

- 코드·visual evidence·design guide가 일치하면 `Accepted`로 승격한다.

## 미충족 증거

- 공통 shell의 automated 320–1440px/keyboard evidence는 있으나 VoiceOver/Safari와 NVDA/Chrome 수동 role-switch 검증은 아직 `not measured`다.
