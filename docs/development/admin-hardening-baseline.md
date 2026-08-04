# Admin 하드닝 베이스라인 체크리스트

이 문서는 Post–Admin vNext 고도화 엄브렐러의 H 슬라이스 산출물이며,
A/M/P 슬라이스의 공통 게이트로 재사용된다.

각 admin 라우트(+host dashboard)는 아래를 만족해야 한다.

## 1. 접근성 (자동 검증 가능)
- [ ] 라우트 본문에 heading이 1개 이상 존재한다 (`getAllByRole("heading")`).
- [ ] 모든 상호작용 요소(`button`, `a[href]`, `[role=button]`, `[role=link]`)가
      접근 가능한 이름(가시 텍스트 / `aria-label` / `aria-labelledby` / `title`)을 가진다.
      → `findUnnamedInteractiveElements(container)` 가 빈 배열.
- [ ] error/empty 상태가 `role="status"` 또는 `role="alert"` 영역으로 노출된다.

## 2. 접근성 (수동 검증)
- [ ] 키보드 Tab 순서가 시각 순서와 일치하고, 포커스 링이 보인다.
- [ ] admin shell 진입 시 본문으로 건너뛰는 skip-link가 동작한다.
- [ ] 텍스트/배경 색 대비가 WCAG AA(본문 4.5:1, 큰 텍스트 3:1)를 만족한다.

## 3. 모바일 (수동 검증)
- [ ] 360px 폭에서 nav·테이블·카드가 가로 스크롤 없이 사용 가능하다.
- [ ] 터치 타깃이 충분한 크기를 가진다.
- [ ] `/admin/today`는 390px에서 목록 → 상세 → 목록 흐름으로 동작하고, 뒤로 갈 때 필터와 선택 위치를 보존한다.
- [ ] `/admin/today`는 1440px에서 queue와 inspector를 함께 제공하고 900px에서 단일 열 전환 뒤에도 상태 변경과 상세 route 이동이 가능하다.

## 4. Empty / 에러 카피 안전성
- [ ] 데이터가 얇을 때 정직한 empty state를 보여준다(가짜 데이터 금지).
- [ ] 실패 카피가 provider raw error / private data / token-shaped 예시를 노출하지 않는다.

## 5. 운영 케이스 상태
- [ ] 최초 loading과 background refresh를 구분하고, refresh 중 기존 queue·선택·필터를 유지한다.
- [ ] 정상 0건은 disabled fake action 없이 compact한 empty state로 표시한다.
- [ ] stale source는 마지막 정상 시각을, partial/unavailable source는 `확인 불가` 상태를 표시하면서 성공한 source의 case를 계속 사용할 수 있게 한다.
- [ ] 재시도 control은 `UNAVAILABLE` source에만 노출하고 case lifecycle mutation과 분리한다.
- [ ] 낙관적 version conflict는 최신 detail 재조회가 필요한 상태로 안내하고 stale action의 반복 실행을 막는다.
- [ ] `RESOLVED`와 재개방 상태를 색만이 아닌 lifecycle 텍스트와 history로 구분한다.
- [ ] permission denied 상태에는 이전 lifecycle control을 남기지 않는다.

## 6. 일관성
- [ ] 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치한다.

## 7. 브라우저 증거
- [ ] `/admin/today`의 1440×1000, 900×900, 390×844 viewport에서 queue/detail 탐색, lifecycle control, 긴 safe identifier wrapping을 확인한다.
- [ ] partial source와 conflict에서도 다른 case 탐색이 유지되고, Escape·닫기·backdrop·navigation이 resolve mutation을 만들지 않음을 확인한다.
- [ ] OWNER/OPERATOR lifecycle 성공과 SUPPORT read-only/direct mutation 거절을 함께 확인한다.

## 적용 대상 라우트
today · health · clubs · clubs/:clubId · notifications · ai-ops · support · audit · analytics · (host dashboard)
