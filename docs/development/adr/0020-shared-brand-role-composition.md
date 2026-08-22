# ADR-0020: 하나의 브랜드 시스템과 역할별 composition grammar

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·디자인
- 관련: `docs/agents/design.md:5`,
  `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

## 컨텍스트

ReadMates는 public, guest, member, host, platform admin에서 정보 밀도와 업무가 다르다. 역할 차이를 별도 palette·typography·shell로 해결하면 host/admin만 다른 제품처럼 보이고, 반대로 한 화면 문법을 모두에게 적용하면 public/member의 차분한 독서 경험이 운영 dashboard가 된다. `docs/agents/design.md:5-23`은 quiet editorial identity와 role별 저널·독서 작업대·운영 장부를 이미 방향으로 둔다.

## 결정

모든 역할은 warm paper, ink hierarchy, ink-blue accent, semantic state color, typography, spacing, focus, field/button/badge primitive를 공유한다. 차이는 sub-brand가 아니라 composition grammar로 만든다.

- Public: 문학 저널과 공개 archive
- Guest: public/member 사이 permission bridge
- Member: 개인 독서 작업대
- Host: club-scoped 운영 장부
- Platform admin: cross-club system command ledger

Host의 `Meeting Folio`, `Active Desk`, 기록 단계의 `Publication Desk`는 layout·hierarchy 이름이다. 스큐어모픽 종이·가죽·파일철 장식, excessive cards, glow, glassmorphism, generic SaaS KPI tile을 뜻하지 않는다.

## 근거

- 역할을 오가도 브랜드 신뢰와 component semantics가 유지된다.
- 같은 primitive를 공유하면서도 업무 밀도와 우선순위를 다르게 구성할 수 있다.
- host/admin 전용 theme drift와 중복 token을 막는다.
- public/member 표면을 host 운영 장부로 바꾸지 않고도 전체 제품 정합성을 유지한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| host/admin 전용 visual theme | 같은 사용자가 역할을 오갈 때 다른 제품처럼 보이고 token drift가 생긴다. |
| 모든 역할에 같은 page template | 역할별 밀도와 주요 행동이 무시된다. |
| generic SaaS dashboard | ReadMates의 editorial identity와 책 중심 hierarchy를 잃는다. |
| literal folio/desk 스큐어모피즘 | 장식이 정보 구조보다 앞서고 responsive/accessibility 비용이 커진다. |

## 결과

긍정적:
- design system primitive와 역할별 layout recipe의 경계가 명확해진다.
- host redesign이 member/public 전면개편을 강제하지 않는다.

부정적/감수한 비용:
- 역할별 fixture와 visual regression을 별도로 유지해야 한다.
- shared primitive 변경은 여러 역할의 contrast·wrapping을 함께 검증해야 한다.

## 검증

- 320/390/768/1024/1440px와 200% zoom에서 역할별 composition을 검증한다.
- AA contrast, focus, reduced motion, Korean/English wrapping을 확인한다.
- host-only palette/font/dark-theme token과 금지된 decorative pattern이 추가되지 않는지 review한다.

## 후속 작업

- design system docs에 role composition examples와 anti-pattern을 추가한다.
- 구현과 visual/browser evidence가 design guide에 반영되면 `Accepted`로 승격한다.
