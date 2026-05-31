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

## 4. Empty / 에러 카피 안전성
- [ ] 데이터가 얇을 때 정직한 empty state를 보여준다(가짜 데이터 금지).
- [ ] 실패 카피가 provider raw error / private data / token-shaped 예시를 노출하지 않는다.

## 5. 일관성
- [ ] 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치한다.

## 적용 대상 라우트
today · health · clubs · clubs/:clubId · notifications · ai-ops · support · audit · analytics · (host dashboard)
