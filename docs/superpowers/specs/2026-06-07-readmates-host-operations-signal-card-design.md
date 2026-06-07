# ReadMates Host Operations Signal Card

작성일: 2026-06-07
상태: APPROVED DESIGN SPEC

## 1. 배경

호스트 운영 홈의 데스크톱 우측 패널에는 `운영 신호` 카드가 있다. 현재 카드는 `/api/host/club-operations`에서 가져온 `host.club_operations_snapshot.v1` 데이터를 렌더링하지만, 화면 품질은 다른 호스트 운영 패널보다 낮다.

현재 코드 기준 문제는 세 가지다.

- `HostClubOperationsCard`는 준비 상태, 열린 세션, 마감 대기, AI 실패만 단순 `<dl>`로 출력한다.
- `host-club-ops` 계열 클래스는 JSX에 있지만 전용 CSS가 없어 기본 HTML처럼 보인다.
- 테스트도 이 카드를 `read-only` 신호 카드로만 고정하고 있어, 운영자가 다음 행동을 고르기 어렵다.

이 작업은 S9 host-surface reinforcement의 후속 polish다. 서버 계약과 host/admin 경계는 유지하고, 이미 연결된 host-scoped aggregate 신호를 호스트가 실제 운영 판단에 쓰기 좋게 만든다.

## 2. 목표

성공 기준은 "카드가 예뻐지는 것"이 아니다. 호스트가 `운영 신호`를 보고 현재 상태와 다음 확인 지점을 바로 이해해야 한다.

목표:

- 데스크톱 host 홈의 `운영 신호`를 운영 판단 카드로 완성한다.
- 기존 `HostClubOperationsSnapshot` 계약만 사용한다.
- 상태 배지, 판단 문장, 2x2 지표, host-safe 조치 링크를 제공한다.
- admin-only 신호, raw provider error, private member data, 복구 명령은 노출하지 않는다.
- 모바일 host 화면은 이번 범위에서 유지한다.

Non-goals:

- 새 서버 endpoint 또는 DTO 추가.
- admin club operations 화면을 host에 복제.
- host에서 AI job force-cancel, admin recovery, provider-level diagnosis 제공.
- 모바일 host dashboard 구조 변경.

## 3. 선택한 접근

선택한 접근은 **운영 판단 + 다음 조치 카드**다.

검토한 대안:

1. 컴포넌트 완성형
   - 기존 지표를 2x2 카드와 배지로 보기 좋게 만든다.
   - 가장 작고 안전하지만, 여전히 "다음에 무엇을 할지"가 약하다.

2. 운영 판단 카드
   - 지표와 함께 상태 해석 문장, 관련 host route 링크를 제공한다.
   - host 홈의 "지금 닫을 일" 흐름과 가장 잘 맞는다.

3. 상세 운영 장부
   - admin club operations처럼 readiness/session/AI를 촘촘히 보여준다.
   - 정보량은 좋지만 host 홈이 작은 admin dashboard처럼 보일 위험이 있다.

이번 작업은 2번을 선택한다. ReadMates host 화면은 generic dashboard가 아니라 세션 준비와 멤버 운영을 닫는 workbench여야 한다.

## 4. 범위

주요 변경 파일:

- `front/features/host/ui/host-club-operations-card.tsx`
- `front/features/host/ui/host-club-operations-card.test.tsx`
- `front/src/styles/globals.css`
- `front/tests/e2e/host-club-operations.spec.ts`

변경 범위:

- `HostClubOperationsCard` 내부에서 표시 모델을 계산한다.
- 전용 CSS를 추가해 카드, 배지, 지표 grid, blocking reason, 링크 cluster를 정리한다.
- 기존 desktop placement는 유지한다. 현재 카드 위치는 `HostDashboard` 우측 보조 패널의 알림 장부 앞이다.
- 기존 loader/query 흐름은 유지한다.

범위 밖:

- `HostDashboardRoute`, loader, BFF proxy, Spring controller/service 계약 변경.
- `front/shared/model/club-operations.ts` 타입 변경.
- `MobileHostDashboard` 변경.
- public docs, README, architecture 문서 변경.

## 5. 사용자 흐름

호스트는 `/clubs/:slug/app/host` 데스크톱 화면에서 우측 보조 패널을 본다.

1. 카드 상단에서 `운영 신호`와 readiness badge를 확인한다.
2. 판단 문장으로 현재 운영 상태를 읽는다.
   - 막힌 항목이 없으면 현재 세션 기준으로 운영 가능하다고 말한다.
   - blocking reason이 있으면 조치가 필요하다고 말한다.
   - AI 실패가 최근 window에서 늘었으면 알림/AI 상태 확인을 유도한다.
   - 마감 대기가 있으면 세션 기록 마감을 우선 확인하도록 유도한다.
3. 2x2 지표에서 열린 세션, 마감 대기, AI 실패, 전주 대비를 확인한다.
4. 관련 host route로 이동한다.
   - 세션 문서: 현재 운영 flow를 이어가기 위한 기본 조치.
   - 알림 장부: AI/알림 위험 신호를 확인하기 위한 host-safe 조치.

## 6. UI 설계

카드는 기존 ReadMates host 화면의 warm paper tone을 따른다.

구성:

- Header
  - 왼쪽: `운영 신호`
  - 오른쪽: readiness badge
- Summary
  - 한 문장으로 상태를 해석한다.
  - 상태가 정상이면 담담한 copy를 쓴다.
  - blocking/AI failure/due item이 있으면 우선 확인 대상을 말한다.
- Metrics
  - 2x2 grid
  - 각 cell은 label, value, 짧은 helper를 가진다.
  - 수치만 크게 보이고 helper는 작게 둔다.
- Blockers
  - `snapshot.readiness.blockingReasons`가 있을 때만 표시한다.
  - raw code를 그대로 크게 노출하지 않고 작은 목록으로 둔다.
- Actions
  - host-safe link만 제공한다.
  - 버튼형 링크는 최대 2개로 제한한다.

Copy 원칙:

- UI 사용법을 길게 설명하지 않는다.
- admin 또는 platform operator 용어를 host 화면에 끌어오지 않는다.
- raw field name 대신 host가 이해할 수 있는 문장을 우선한다.

## 7. 데이터와 모델

사용 계약은 기존 `HostClubOperationsSnapshot`이다.

```text
HostClubOperationsSnapshot
  readiness.state
  readiness.blockingReasons
  sessionProgress.currentOpenCount
  sessionProgress.incompleteRecordCount
  aiUsage.failedRecentJobs
  aiUsage.priorFailedJobs7d
```

표시 모델은 컴포넌트 안에서 작게 계산한다. 계산이 커지면 같은 파일 내 helper 함수로 분리하되, 새 feature-wide model 파일은 만들지 않는다.

판단 우선순위:

1. `blockingReasons.length > 0`
2. `sessionProgress.incompleteRecordCount > 0`
3. `aiUsage.failedRecentJobs > 0` 또는 AI failure delta 증가
4. `readiness.state === "READY"`
5. 그 외 상태는 확인 필요로 표시

`readiness.nextAction`은 1차 개선에서 실행 가능한 action으로 해석하지 않는다. 서버 계약 의미가 host 화면의 route와 정확히 매핑되지 않을 수 있기 때문이다.

## 8. 경계와 Public Safety

Frontend boundary:

- `HostClubOperationsCard`는 `shared/model/club-operations` 타입과 helper만 import한다.
- UI는 props 기반 렌더링을 유지한다.
- API, query, route module을 UI 카드에 직접 import하지 않는다.

Server boundary:

- 기존 `HostClubOperationsService`와 `/api/host/club-operations`는 그대로 둔다.
- host projection은 자기 클럽 aggregate만 보여준다.
- admin-only operation command는 host로 이동하지 않는다.

Public safety:

- real member data, email, private domain, deployment state, provider raw error를 표시하지 않는다.
- screenshot/E2E fixture는 기존 public-safe mock 패턴을 유지한다.
- raw JSON, admin route marker, private sentinel이 화면에 나오지 않아야 한다.

## 9. 에러 처리

현재 loader는 `fetchHostClubOperations(context).catch(() => null)`로 카드 실패를 host dashboard 전체 실패와 분리한다. 이 동작을 유지한다.

카드가 받는 snapshot이 있으면 항상 렌더링한다. 일부 값이 0인 것은 정상 상태로 해석한다. 음수 delta는 그대로 감소 신호로 표시하되 과장된 성공 copy는 쓰지 않는다.

## 10. 검증 계획

단위 테스트:

```bash
pnpm --dir front test -- host-club-operations-card
```

검증 항목:

- READY 상태에서 판단 문장, readiness badge, 2x2 지표가 표시된다.
- blocking reason이 있으면 주의 문장과 blocking list가 표시된다.
- AI 실패 delta가 양수이면 최근 실패 증가가 보인다.
- 카드 안에 mutation button은 생기지 않는다.
- host-safe link만 표시된다.

E2E:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
```

검증 항목:

- desktop host dashboard에서 개선된 운영 신호 카드가 보인다.
- desktop screenshot artifact가 public-safe evidence로 생성된다.
- mobile host dashboard는 기존 operating summary expectation을 유지한다.
- private sentinel이 노출되지 않는다.

기본 frontend check는 구현 변경 후 필요에 따라 실행한다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

## 11. 리스크

| 리스크 | 대응 |
| --- | --- |
| host 화면이 admin dashboard처럼 보임 | 조치 링크는 host route만 제공하고, admin-only raw 신호는 제외 |
| 카드 copy가 실제 조치와 어긋남 | snapshot aggregate에서 확실히 알 수 있는 판단만 말함 |
| 모바일 E2E와 충돌 | 모바일 구조는 변경하지 않고 기존 요약 expectation 유지 |
| CSS가 다른 화면에 영향 | `host-club-ops` 전용 selector로 제한 |
| `nextAction` 의미를 잘못 해석 | 이번 범위에서는 실행 action으로 사용하지 않음 |

## 12. 완료 기준

- 데스크톱 `운영 신호` 카드가 전용 스타일과 운영 판단 문장을 가진다.
- 기존 host-scoped aggregate 계약을 유지한다.
- 카드에서 다음 host-safe route를 찾을 수 있다.
- 단위 테스트와 host operations E2E가 새 기대값을 고정한다.
- public-safe sentinel 검증이 계속 통과한다.
