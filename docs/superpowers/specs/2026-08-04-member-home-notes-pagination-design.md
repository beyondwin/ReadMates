# 멤버 홈 레이아웃과 게스트 노트 페이지네이션 보정 설계

## 목표

- 데스크톱 멤버 홈에서 `지난 모임 회고` 카드와 `클럽 흐름` 제목이 붙어 보이지 않도록 섹션 간 리듬을 복원한다.
- 모바일 멤버 홈에서 질문 마감 문구가 책 표지와 겹치지 않게 하고, `세션 열기` 동작의 세로 점유를 줄이면서 44px 터치 영역을 유지한다.
- 게스트 노트 화면의 `더 보기`가 선택한 세션의 다음 기록을 실제로 불러올 때만 나타나고 동작하게 한다.

## 현재 원인

데스크톱 홈은 `RecentRecordEntry`와 `ClubPulse`를 같은 fragment에 연속 렌더링하지만 두 섹션 사이의 간격 계약이 없다. 모바일 세션 카드는 절대 배치된 표지와 카드 본문의 오른쪽 정렬 마감 문구가 같은 영역을 사용하고, CTA 주변 여백이 본문 밀도에 비해 크다.

게스트 노트 화면은 선택 세션별 항목만 렌더링하면서도 `더 보기` 노출과 요청에는 클럽 전체 공개 피드의 `nextCursor`를 사용한다. 그래서 다음 전역 페이지에 다른 세션 기록만 있으면 버튼을 눌러도 현재 선택 세션 화면은 바뀌지 않는다.

## 검토한 접근

### 1. 선택 세션 기준 공개 피드 조회 — 선택

공개 게스트 피드 API에 선택적 `sessionId`를 추가하고, 노트 route가 선택 세션의 피드를 조회한다. cursor에는 클럽과 선택 세션 범위를 함께 묶어 다른 범위에서 재사용할 수 없게 한다. 서버·프런트 계약 수정이 필요하지만 버튼의 의미와 데이터 페이지 범위가 일치하며, 기존 멤버 노트 화면의 세션별 조회 방식과도 맞는다.

### 2. 현재 버튼만 숨기기

빈 화면 또는 현재 페이지에서 선택 세션 항목이 없을 때 `더 보기`를 숨긴다. 변경은 작지만 뒤쪽 페이지에 실제 선택 세션 기록이 있어도 접근할 수 없으므로 채택하지 않는다.

### 3. 프런트에서 전역 페이지를 반복 조회하기

한 번의 클릭으로 선택 세션 항목을 찾을 때까지 전역 피드를 여러 페이지 요청한다. 서버 계약은 유지하지만 불필요한 요청 수가 커지고, 특정 세션의 다음 페이지라는 의미를 보장하지 못하므로 채택하지 않는다.

## 상세 설계

### 멤버 홈

- `ClubPulse` 자체에 데스크톱 섹션 역할 class를 부여하고 위쪽에 기존 spacing scale의 32px 간격을 둔다.
- 모바일 준비 헤더는 `준비 현황`과 질문 마감을 왼쪽 정렬의 두 줄로 묶어 절대 배치된 표지와 수평 공간을 경쟁하지 않게 한다.
- `MobileIcon`에 `chevron-right`를 추가해 `세션 열기` 뒤의 긴 화살표를 짧은 chevron으로 바꾼다.
- CTA의 최소 높이 44px는 유지하고 위 여백과 카드 하단 padding만 줄인다.

### 게스트 노트

- `GET /api/public/clubs/{clubSlug}/browse/notes/feed`는 선택적 `sessionId`를 받는다.
- `sessionId`가 있으면 해당 클럽의 `PUBLISHED + GUEST_READABLE` 세션 기록만 조회한다. 기존 전체 피드 호출은 변경 없이 유지한다.
- `sessionId`는 UUID 형식과 현재 클럽의 공개 범위로 제한한다. 잘못된 UUID는 `400`, 존재하지 않거나 공개 불가한 세션은 빈 page를 반환한다.
- 공개 피드 cursor payload에는 nullable session 범위를 명시한다. 전체 피드 cursor와 세션 피드 cursor는 서로 재사용할 수 없다.
- 게스트 노트 loader는 세션 목록을 먼저 읽어 URL의 `sessionId` 또는 기본 선택 세션을 결정한 뒤 그 세션의 피드를 요청한다.
- 세션 선택은 route 재로딩으로 새 세션 범위의 첫 page를 받는다. `더 보기`는 그 page의 `nextCursor`가 있을 때만 나타나며, 같은 `sessionId`를 유지한 채 다음 page를 요청한다.

## 경계와 비목표

- 멤버 전용 `/api/notes/**`, BFF 경로, 인증·권한, 데이터베이스 migration은 변경하지 않는다.
- `GUEST_READABLE`과 `PUBLIC_RECORD`의 기존 구분, 게스트 DTO allowlist, 탈퇴 멤버 마스킹을 유지한다.
- CTA의 문구, 이동 경로, 버튼 접근성 이름은 바꾸지 않는다.
- 원격 push, 배포, 실제 운영 데이터 확인은 이번 작업 범위가 아니다.

## 검증

- 프런트 단위 테스트로 홈 섹션 class, 마감/CTA 구조, 선택 세션 요청 파라미터, 유효한 `nextCursor`일 때만 `더 보기`가 노출되는 동작을 고정한다.
- 서버 단위 테스트로 전체/세션 cursor 범위 분리와 UUID 검증을 확인한다.
- 서버 통합 테스트로 같은 클럽의 공개 세션 필터, 다른 클럽·비공개·미발행 세션의 빈 결과, cursor 페이지 순서를 확인한다.
- `corepack pnpm --dir front lint`, `corepack pnpm --dir front test`, `corepack pnpm --dir front build`, `./scripts/server-ci-check.sh`, 관련 Testcontainers 통합 테스트를 실행한다.
- 로컬 브라우저에서 데스크톱 홈과 모바일 홈·노트의 기록 있음/없음 상태를 확인한다.

## Acceptance Matrix

- `UI or runtime state`: desktop/mobile spacing, wrapping, empty/content state와 버튼 노출을 component/route test 및 브라우저로 확인한다.
- `Guest/public exposure`: 기존 공개 범위를 유지하면서 세션 filter가 허용된 공개 레코드만 반환하는지 통합 테스트로 확인한다.
- `Club context`: cursor와 `sessionId`가 현재 club 범위를 벗어나지 않는지 controller/service/persistence 테스트로 확인한다.
- Actor/auth, BFF/OAuth, persistence migration, async/provider 행은 권한·BFF·schema·side effect를 변경하지 않으므로 제외한다.
