# ADR-0018: 사용자 핵심 객체를 `모임`과 `기록`으로 통일

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·디자인·프런트엔드
- 관련: `front/shared/ui/readmates-copy.ts:1`,
  `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

## 컨텍스트

현재 사용자 copy는 같은 객체를 `세션`, `모임`, `회차`로 부르고, 참석 의향은 `RSVP`, 공개 동작은 audience나 목적지 없이 `공개`로 축약한다. `front/shared/ui/readmates-copy.ts:9-24`와 `front/shared/ui/readmates-copy.ts:33-54`에도 멤버·호스트·모바일 label이 서로 다른 어휘를 쓴다. 이 혼용은 host 운영 화면뿐 아니라 member/public copy, aria-label, 알림 template, error copy에서 같은 객체와 행동을 다르게 해석하게 한다.

## 결정

사용자 화면의 핵심 객체는 `모임`, 장기 자산은 `기록`으로 통일한다. 번호는 짧은 표면에서 `No.N`, 문장에서는 `N번째 모임`으로 쓴다. `세션`은 로그인 세션 같은 실제 기술 세션에만 노출하며, `회차`와 `RSVP`는 사용자 핵심 용어로 쓰지 않는다. Publication 관련 action은 실제 delta를 밝혀 `게스트·멤버 노트에 기록 게시`, `공개 기록에 게시`로 구분한다. `CLOSED + GUEST_READABLE` archive에서 이미 읽을 수 있는 기록을 `CLOSED → PUBLISHED`가 처음 공개한다고 표현하지 않는다.

내부 route/API/database의 `session`, `sessionId`, `sessionNumber`, enum과 parser marker는 호환을 위해 유지한다. 기술 이름을 무리하게 rename하는 결정이 아니다.

## 근거

- 사용자가 객체명 번역에 인지 비용을 쓰지 않고 task와 결과를 판단할 수 있다.
- member, host, public 표면의 copy·접근성 이름·알림 template을 한 dictionary로 검증할 수 있다.
- 내부 contract를 유지하므로 route/API/data migration 위험을 만들지 않는다.
- `기록 공개`와 public-site placement를 다른 문장으로 표현해 잘못된 인터넷 공개 해석을 줄인다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 기존 `세션`을 전 표면에서 유지 | 독서모임 제품의 사용자 mental model보다 기술 객체명이 앞선다. |
| 역할마다 `모임/세션/회차`를 다르게 사용 | 같은 사람이 member와 host를 오갈 때 학습이 재설정된다. |
| 내부 식별자까지 `meeting`으로 일괄 rename | 사용자 가치 없이 API, route, migration 호환 비용과 위험이 크다. |
| 모든 공개 action을 짧게 `공개`로 사용 | audience access와 public-site placement를 구분할 수 없다. |

## 결과

긍정적:
- 공통 formatter, copy dictionary, accessibility assertion을 만들 수 있다.
- 역할 전환 뒤에도 같은 객체가 같은 이름을 유지한다.

부정적/감수한 비용:
- 기존 screenshot test, exact-label selector, email/in-app template을 함께 migration해야 한다.
- 저장된 과거 알림과 사용자 생성 제목은 새 copy와 잠시 공존한다.

## 검증

- visible copy와 aria-label에서 legacy `세션/회차/RSVP`가 허용된 기술 문맥 외에 남지 않는지 version-controlled allowlist 기반 executable inventory test로 검증한다.
- member/host/public route와 future notification template의 canonical dictionary test를 둔다.
- parser marker와 internal API/route name이 바뀌지 않았음을 contract test로 확인한다.

## 후속 작업

- 구현 계획에서 표면별 copy inventory와 migration 순서를 만든다.
- 코드·테스트·active architecture가 canonical dictionary와 일치하면 `Accepted`로 승격한다.
