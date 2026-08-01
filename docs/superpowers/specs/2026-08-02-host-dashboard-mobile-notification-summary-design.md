# ReadMates 호스트 대시보드 모바일 알림 요약 설계

작성일: 2026-08-02
상태: USER-APPROVED
대상 표면: frontend, host dashboard, mobile UI/UX
Canonical route: `/clubs/:slug/app/host`

## 1. 배경과 원인

호스트 대시보드의 모바일 `운영 도구` 안에서 알림 발송 요약이 중첩 카드와 불균형한 상태 배지로 표시된다.

현재 구현은 다음 스타일 조합 때문에 깨진다.

- `운영 도구` disclosure가 `border-block`과 좌우 padding을 가진다.
- 그 안의 `HostNotificationLedger`가 다시 `m-card-quiet` 테두리와 18px padding을 만든다.
- 대기, 실패, 중단 3개 상태를 `rm-host-dashboard-mobile__two-column-row`에 넣어 2열 grid로 배치한다.
- 공통 `badge`가 grid item 너비를 채워 첫째와 셋째 상태는 긴 막대가 되고 둘째 상태만 짧은 캡슐이 된다.

390px 실제 화면에서 대기와 중단 배지는 약 212px, 실패 배지는 약 48px로 계산됐다. 외곽 disclosure와 내부 알림 카드가 각각 테두리를 가져 시각적으로 선과 상자가 중첩된다.

## 2. 목표

- 모바일에서 알림 상태를 한눈에 비교할 수 있다.
- 대기, 실패, 중단을 동일한 폭과 정보 위계로 표시한다.
- `최근 24시간 발송 건수`와 현재 적체 상태의 의미를 구분한다.
- 운영 도구의 row 기반 구조 안에서 알림 영역만 중첩 카드처럼 보이지 않는다.
- 알림 발송 장부로 이동하는 행동이 명확하고 최소 44px 터치 영역을 가진다.
- 320px와 390px에서 텍스트 겹침, 가로 넘침, 비대칭 줄바꿈이 없다.
- 데스크톱 알림 요약과 발송 계약은 변경하지 않는다.

## 3. 검토한 접근

### A. 기존 배지에 폭만 지정

모바일 배지 3개에 같은 `min-width`를 주고 내부 카드 구조는 유지한다.

- 장점: 변경량이 가장 작다.
- 단점: 중첩 테두리, 약한 행동 위계, 320px 줄바꿈 위험이 남는다.

### B. 모바일 전용 요약 rail로 재구성 - 선택

모바일 알림 영역을 운영 도구의 첫 번째 평면 section으로 렌더링하고, 발송 건수와 상태 3개를 역할별로 분리한다. 상태는 균등한 3열 metric rail, 장부 이동은 full-width quiet row로 둔다.

- 장점: 상태 비교, 테두리, 터치 행동을 함께 해결한다.
- 장점: API, route, mutation, 데스크톱 표현을 바꾸지 않는다.
- 단점: 모바일 JSX와 전용 CSS, responsive 테스트가 함께 필요하다.

### C. 대시보드에서 재처리 행동 제공

실패 또는 중단 상태에 재처리 버튼을 붙인다.

- 장점: 장부 화면으로 이동하지 않고 처리할 수 있다.
- 단점: 실수로 운영 상태를 변경할 위험이 커지고 dashboard의 책임이 넓어진다.
- 단점: 현재 summary API만으로는 안전한 대상 선택과 결과 확인을 제공하기 어렵다.

선택한 접근은 B다.

## 4. 모바일 정보 구조

```text
운영 도구                                      -
알림 · 멤버 · 초대 · AI 설정

알림 발송                         최근 24시간 0건

대기                  실패                  중단
0                     0                     0

알림 발송 장부 열기                            >
------------------------------------------------
멤버 관리                              멤버 보기
참석 1명 · 미응답 4명
------------------------------------------------
멤버 초대                              초대 관리
초대 상태와 링크 관리
```

### 4.1 알림 header

- `알림 발송`을 운영 도구 내부 section heading으로 사용한다.
- `최근 24시간 N건`은 우측 보조 정보로 유지한다.
- 320px에서 두 문구가 겹치지 않도록 header는 `minmax(0, 1fr) auto`를 사용한다.
- 발송 건수는 최근 활동량이며 장애 수치가 아니므로 위험 색을 사용하지 않는다.

### 4.2 상태 metric rail

- 대기, 실패, 중단은 `repeat(3, minmax(0, 1fr))` 한 줄이다.
- 각 칸은 label과 count를 위아래로 쌓고 동일한 너비를 갖는다.
- 칸 사이에는 `var(--line-soft)` 세로선 하나만 둔다.
- 0은 중립적인 ink 계열로 표시한다.
- 실패 또는 중단이 1 이상이면 해당 count에 warning/danger tone을 적용한다.
- 대기가 1 이상이면 accent 또는 warning보다 낮은 attention tone을 사용한다.
- 상태는 항상 텍스트 label을 포함해 색상에만 의존하지 않는다.
- 공통 `badge`와 `badge-dot`은 사용하지 않는다.

### 4.3 장부 이동

- metric rail 아래에 `알림 발송 장부 열기` link row를 둔다.
- 높이는 최소 44px이며 전체 가로 영역이 터치 대상이다.
- 우측 chevron으로 탐색 행동임을 표시한다.
- 실제 href와 club-scoped link 계약은 유지한다.

### 4.4 테두리와 여백

- 모바일 `HostNotificationLedger`에서 `m-card-quiet`를 제거한다.
- 운영 도구 disclosure의 외곽 `border-block`은 유지한다.
- 알림 영역과 다음 `멤버 관리` row 사이는 한 개의 `var(--line-soft)` 구분선만 사용한다.
- 알림 영역 안에는 별도 외곽 카드 테두리나 radius를 추가하지 않는다.
- disclosure 좌우 16px inset 안에서 header, rail, action row를 정렬한다.

## 5. 상태와 행동 계약

- 이번 변경은 summary 표현만 바꾸며 실제 알림 발송이나 재처리를 수행하지 않는다.
- 상태가 모두 0이어도 3열 구조를 유지해 비교 위치가 바뀌지 않게 한다.
- 최근 실패 목록이 있으면 metric rail 아래, 장부 link 위에 최대 3건을 compact row로 표시한다.
- 실패 목록은 기존 마스킹을 유지하고 전체 이메일 주소를 노출하지 않는다.
- summary loading, authorization, fetch error는 현재 route 경계를 유지한다.
- 대기/실패/중단 처리와 수동 발송은 기존 알림 장부 화면에서만 수행한다.

## 6. 접근성

- 알림 영역은 모바일에서도 이름이 있는 `section` 또는 `region`으로 렌더링한다.
- metric은 `dl`, `dt`, `dd` 또는 동등한 의미 구조를 사용한다.
- 장부 link는 최소 44px 높이와 visible focus를 유지한다.
- 수치에는 tabular numeral을 적용한다.
- warning tone은 텍스트 label과 count를 함께 제공한다.
- 200% text zoom과 긴 번역에서도 control과 문구가 겹치지 않게 한다.

## 7. 구현 경계

예상 수정 파일:

- `front/features/host/ui/dashboard/host-notification-ledger.tsx`
  - 모바일 전용 header, metric rail, 실패 목록, action row 구조.
  - 데스크톱 렌더링은 기존 구조와 시각 계약을 유지한다.
- `front/shared/styles/mobile.css`
  - 모바일 알림 summary, 3열 metric rail, action row, responsive wrapping.
- `front/features/host/ui/host-dashboard.test.tsx` 또는 co-located focused test
  - 모바일 semantic 구조와 데스크톱 회귀.
- `front/tests/unit/host-dashboard.test.tsx`
  - 상태 count, 마스킹, scoped 장부 link 계약.
- `front/tests/e2e/host-club-operations.spec.ts`
  - 320px/390px 균등 rail, 단일 구분선, overflow, 44px action 증거.

`front/src/styles/globals.css`에는 현재 다른 작업의 미커밋 변경이 있으므로 이번 구현에서 수정하지 않는다. API, query, BFF, server, migration, notification dispatch 계약도 변경하지 않는다.

## 8. 검증 계약

Focused checks:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx tests/unit/host-dashboard.test.tsx
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts
```

Frontend gate:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

브라우저 확인:

- 320x844, 390x844에서 운영 도구를 펼친다.
- 3개 metric의 폭이 균등하고 한 줄을 유지하는지 확인한다.
- 운영 도구 외곽과 알림 내부에 중첩 카드 테두리가 없는지 확인한다.
- 알림 장부 link가 44px 이상이고 가로 overflow가 없는지 확인한다.
- 0건과 non-zero 실패 fixture를 모두 확인한다.

## 9. Non-goals

- 대시보드에서 알림 재처리 또는 실제 발송.
- 알림 장부, 수동 발송 workbench, reminder policy 재설계.
- 데스크톱 운영 도구 전면 재설계.
- 새 API 필드, endpoint, server logic, database migration.
- 발송 상태 의미나 집계 기간 변경.
- push, PR, deploy, release, 실제 이메일 발송.
