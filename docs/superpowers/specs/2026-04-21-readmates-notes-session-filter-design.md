# ReadMates Notes Session Filter Design

작성일: 2026-04-21
상태: VALIDATED DESIGN SPEC
문서 목적: `/app/notes`가 모든 세션의 Questions, One-liners, Highlights, Reading marks를 한 번에 보여주지 않고, 선택된 한 세션의 기록만 읽을 수 있도록 UX, 데이터 흐름, API, 테스트 기준을 정의한다.

## 1. 문제 정의

현재 `/app/notes`는 `/api/notes/feed`에서 받은 클럽 기록을 종류별 섹션으로 나누어 모두 렌더링한다. 오른쪽에는 `By session` 목록이 있지만 실제 선택 기능은 없어서, 사용자는 회차별로 기록을 좁혀 볼 수 없다.

세션이 늘어나면 다음 문제가 커진다.

- `Questions`, `One-liners`, `Highlights`, `Reading marks`가 모든 세션 기준으로 누적되어 본문이 지나치게 길어진다.
- 오른쪽 세션 목록은 정보는 주지만 선택할 수 없어서 기대와 동작이 맞지 않는다.
- 현재 feed API는 최근 기록 `limit 120`을 사용하므로, 단순 클라이언트 필터만으로는 오래된 세션의 기록이 누락될 수 있다.
- 모바일에서는 오른쪽 레일 구조가 맞지 않으므로 별도의 세션 선택 패턴이 필요하다.

## 2. 목표

- `/app/notes` 기본 진입 시 기록이 있는 가장 최근 발행 세션을 보여준다.
- 사용자가 세션을 선택하면 그 세션의 `Questions`, `One-liners`, `Highlights`, `Reading marks`만 본문에 렌더링한다.
- 데스크탑의 오른쪽 `By session` 영역을 실제 선택 가능한 세션 레일로 바꾼다.
- 모바일에서는 오른쪽 레일 대신 상단 세션 요약, 최근 세션 가로 피커, 전체 세션 바텀시트를 제공한다.
- 세션이 많이 쌓여도 원하는 회차를 찾을 수 있게 검색과 스크롤 가능한 선택 UI를 둔다.
- 오래된 세션 기록이 feed limit 때문에 잘리지 않도록 선택 세션 기준 서버 조회를 지원한다.
- 기존 홈 화면의 최근 클럽 활동 피드 용도는 깨지지 않게 유지한다.

## 3. 비목표

- 전체 클럽 기록 검색을 본격적인 통합 검색으로 확장하지 않는다.
- 기록에 댓글, 좋아요, 공유, 태그 기능을 추가하지 않는다.
- 기록 작성/수정 기능을 `/app/notes`에 추가하지 않는다.
- `/app/archive`의 멤버 세션 상세 화면을 대체하지 않는다.
- 공개 `/records` 또는 공개 세션 페이지의 정보 구조를 바꾸지 않는다.
- 세션별 기록을 무한 스크롤하거나 페이지네이션하지 않는다. 한 세션의 기록은 한 번에 보여준다.

## 4. 확정된 방향

`/app/notes`는 "전체 클럽 피드"에서 "세션별 클럽 기록장"으로 바뀐다.

기본 선택:

- 기본 선택 세션은 기록이 있는 가장 최근 발행 세션이다.
- 기록이 있는 세션은 Questions, 공개 One-liners, Highlights, Reading marks 중 하나 이상을 가진 세션이다.
- 모든 발행 세션의 기록 수가 0이면 최신 발행 세션을 선택하고 세션 단위 empty state를 보여준다.
- 현재 진행중 세션은 기본 선택하지 않는다. 진행중 세션은 아직 `PUBLISHED` 기록이 없을 수 있으므로 `/app/session/current`에서 다루는 것이 맞다.

세션 선택:

- URL은 선택 상태를 표현할 수 있게 `/app/notes?sessionId={sessionId}`를 지원한다.
- `sessionId`가 없으면 리다이렉트하지 않고 서버에서 기본 선택만 적용한다.
- 유효한 `sessionId`가 있으면 해당 세션을 선택한다.
- 존재하지 않거나 같은 클럽의 발행 세션이 아닌 `sessionId`면 기본 선택 세션으로 조용히 fallback한다.

본문:

- 선택된 세션의 책 제목, 회차, 날짜, 기록 개수 요약을 상단에 보여준다.
- 종류 필터 `All`, `Questions`, `One-liners`, `Highlights`, `Reading marks`는 유지하되 선택 세션 내부에서만 작동한다.
- 세션을 바꾸면 종류 필터는 `All`로 초기화한다.

## 5. 데스크탑 UX

데스크탑은 현재의 2컬럼 구조를 유지한다.

왼쪽 메인 컬럼:

- 상단 헤더: `Club notes`, 선택된 책 제목, `No.06 · 2026.04.15` 같은 메타
- 기록 개수 요약: Questions, One-liners, Highlights, Reading marks
- 종류 필터 칩
- 선택된 세션의 기록 섹션

오른쪽 레일:

- 제목: `By session`
- 정렬 힌트: `최근순`
- 검색 입력: 책 제목 또는 회차 번호를 필터링한다.
- 세션 목록: note sessions를 최신순으로 표시한다.
- 선택된 세션 행은 명확히 강조하고 `aria-current` 또는 `aria-pressed`로 상태를 표현한다.

세션 행 정보:

- `No.06`
- 책 제목
- 날짜
- 기록 개수 총합
- 선택된 세션에는 `선택됨` 상태를 함께 보여준다.

세션이 많은 경우:

- 레일 목록은 고정 높이와 내부 스크롤을 사용한다.
- 검색어가 있으면 책 제목과 `No.06` 같은 회차 라벨을 대상으로 클라이언트 필터링한다.
- 검색 결과가 없으면 `일치하는 세션이 없습니다.`를 표시한다.

## 6. 모바일 UX

모바일은 레일을 사용하지 않고 단일 컬럼으로 구성한다.

상단:

- `Club notes`
- 선택된 책 제목
- `No.06 · 2026.04.15`
- 기록 개수 요약

세션 피커:

- 최근 note sessions를 가로 카드로 보여준다.
- 현재 선택된 세션 카드는 강조한다.
- 최근 피커에는 모든 세션을 억지로 넣지 않는다. 5~8개 정도의 최근 회차만 노출한다.
- `전체 세션` 버튼을 제공한다.

전체 세션 바텀시트:

- `전체 세션`을 누르면 아래에서 세션 선택 바텀시트가 열린다.
- 바텀시트에는 검색 입력과 전체 note session 목록이 있다.
- 목록은 최신순이다.
- 선택된 세션에는 선택 상태를 표시한다.
- 세션을 고르면 바텀시트가 닫히고 `/app/notes?sessionId={sessionId}`로 이동한다.

모바일 본문:

- 종류 필터는 기존 모바일 칩 스타일을 사용해 가로 스크롤로 표시한다.
- 필터 아래에 선택된 세션의 기록 섹션을 렌더링한다.
- 데스크탑과 같은 데이터와 같은 empty state를 사용한다.

접근성:

- 바텀시트는 `role="dialog"`와 제목을 가진다.
- 닫기 버튼은 명확한 accessible name을 가진다.
- 세션 선택 버튼은 책 제목과 회차가 포함된 accessible name을 가진다.
- 선택 상태는 `aria-pressed` 또는 현재 선택 텍스트로 스크린 리더에 전달한다.

## 7. 데이터 흐름

기존 `/api/notes/feed`는 홈 화면의 최근 클럽 활동에도 쓰인다. 따라서 기존 동작은 유지하고, `/app/notes`에는 세션 인덱스와 선택 세션 조회를 사용한다.

프론트 `/app/notes` 서버 컴포넌트:

1. `/api/notes/sessions`로 notes 화면용 발행 세션 인덱스를 가져온다.
2. URL의 `sessionId`를 읽는다.
3. 선택 가능한 note session 중 URL `sessionId`와 일치하는 세션을 찾는다.
4. 없으면 `totalCount > 0`인 첫 번째 세션을 선택한다.
5. 기록이 있는 세션이 없으면 note sessions의 첫 번째 항목을 선택한다.
6. 선택 세션이 있으면 `/api/notes/feed?sessionId={sessionId}`로 해당 세션의 기록을 가져온다.
7. 선택 세션이 없으면 빈 feed를 전달한다.

클라이언트 `NotesFeedPage`:

- `selectedSessionId`, `selectedSession`, `items`, `noteSessions`를 props로 받는다.
- 필터 상태는 클라이언트에서 유지한다.
- 세션 선택은 URL 변경으로 처리한다.
- 검색 입력은 세션 목록 표시만 필터링하며 서버 요청을 만들지 않는다.
- 모바일 바텀시트 open/close 상태를 가진다.

## 8. Backend API Design

새 endpoint:

```http
GET /api/notes/sessions
```

의미:

- `/app/notes`의 세션 선택 UI에 필요한 발행 세션 인덱스를 반환한다.
- 같은 클럽의 `PUBLISHED` 세션만 포함한다.
- 최신순으로 정렬한다.
- 각 세션의 기록 개수 요약을 포함한다.

응답 타입 초안:

```json
[
  {
    "sessionId": "00000000-0000-0000-0000-000000000306",
    "sessionNumber": 6,
    "bookTitle": "가난한 찰리의 연감",
    "date": "2026-04-15",
    "questionCount": 4,
    "oneLinerCount": 5,
    "highlightCount": 3,
    "checkinCount": 5,
    "totalCount": 17
  }
]
```

기존 endpoint:

```http
GET /api/notes/feed
```

기존 의미:

- 클럽의 최근 공개 기록을 반환한다.
- 홈 화면의 `Club pulse`, 모바일 `멤버 활동`에서 계속 사용한다.
- 기존 `limit 120` 정책은 유지한다.

확장 endpoint:

```http
GET /api/notes/feed?sessionId={sessionId}
```

새 의미:

- 같은 클럽의 발행된 특정 세션 기록만 반환한다.
- 해당 세션의 `QUESTION`, `ONE_LINE_REVIEW`, `HIGHLIGHT`, `CHECKIN`을 모두 반환한다.
- 선택 세션 조회는 세션 하나 기준이므로 `limit 120`에 의존하지 않는다.
- 존재하지 않거나 같은 클럽이 아니거나 `PUBLISHED`가 아닌 세션이면 빈 배열을 반환한다.

Repository:

- 기존 `findNotesFeed(clubId)`는 유지한다.
- 새 `findNoteSessions(clubId)`를 추가한다.
- 새 `findNotesFeedForSession(clubId, sessionId)` 또는 optional session id 파라미터를 추가한다.
- SQL은 기존 union 구조를 재사용하되 각 source에 `sessions.id = ?` 조건을 추가한다.
- 반환 타입 `NoteFeedItem`은 유지한다.

보안:

- 기존처럼 활성 멤버만 `/api/notes/feed`에 접근할 수 있다.
- `sessionId`가 다른 클럽의 세션이어도 결과를 구분하지 않고 빈 배열로 처리한다.

## 9. Empty States

note session이 하나도 없는 경우:

- 본문에는 `아직 발행된 세션 기록이 없습니다.`를 보여준다.
- 세션 레일/피커에는 `표시할 세션 기록이 없습니다.`를 보여준다.

선택된 세션은 있지만 기록이 없는 경우:

- 상단에는 선택된 세션 정보를 보여준다.
- 본문에는 `이 세션에는 아직 공개된 기록이 없습니다.`를 보여준다.
- 종류 필터는 비활성화하지 않고, 각 섹션을 빈 카운트로 보여주는 대신 단일 empty state를 우선한다.

종류 필터 결과가 없는 경우:

- 선택된 세션에는 기록이 있지만 선택한 종류만 없으면 `이 세션에는 해당 기록이 없습니다.`를 보여준다.
- 예: `Highlights` 필터를 눌렀는데 highlight가 없을 때.

검색 결과가 없는 경우:

- 세션 선택 UI 안에서만 `일치하는 세션이 없습니다.`를 보여준다.
- 본문 선택 상태는 유지한다.

## 10. Component Boundaries

`NotesFeedPage`는 너무 많은 책임을 갖지 않도록 작은 단위로 나눈다.

권장 단위:

- `NotesFeedPage`: 전체 상태 조립, 필터 상태, 레이아웃 분기
- `SelectedSessionHeader`: 선택된 세션 제목과 기록 개수 요약
- `NotesFilterBar`: 종류 필터 칩
- `FeedSections`: 선택된 세션 기록 섹션 렌더링
- `SessionRail`: 데스크탑 세션 검색과 목록
- `MobileSessionPicker`: 모바일 최근 세션 가로 피커
- `MobileSessionSheet`: 모바일 전체 세션 바텀시트

공통 helper:

- `buildSessionIndex`는 note sessions 중심으로 정리한다.
- `countItemsByKind(items)`로 선택 세션의 카운트를 만든다.
- `filterItemsByKind(items, filter)`로 본문 필터링을 처리한다.
- `sessionHref(sessionId)`로 `/app/notes?sessionId=...` 링크를 만든다.

## 11. Testing

프론트 unit tests:

- `sessionId`가 없을 때 기록이 있는 최신 note session이 선택된 상태로 렌더링된다.
- 기록이 있는 note session이 없으면 최신 발행 세션의 empty state가 렌더링된다.
- 선택된 세션의 기록만 본문에 보이고 다른 세션 기록은 보이지 않는다.
- `All`, `Questions`, `One-liners`, `Highlights`, `Reading marks` 필터가 선택 세션 내부에서만 작동한다.
- 세션 레일 검색이 책 제목과 회차 번호를 기준으로 목록을 줄인다.
- 세션 버튼은 `/app/notes?sessionId=...` 링크 또는 URL 변경 동작을 가진다.
- 모바일 피커에는 최근 세션과 `전체 세션` 버튼이 렌더링된다.
- 바텀시트를 열면 전체 note session 목록과 검색 입력이 보인다.
- 기록이 없는 선택 세션의 empty state가 표시된다.

백엔드 tests:

- `GET /api/notes/sessions`는 발행 세션을 최신순으로 반환하고 종류별 기록 개수를 포함한다.
- `GET /api/notes/sessions`의 `totalCount`는 기본 선택에 사용할 수 있을 만큼 정확하다.
- `GET /api/notes/feed`의 기존 최근 feed 동작이 유지된다.
- `GET /api/notes/feed?sessionId=...`는 해당 세션 기록만 반환한다.
- 다른 세션의 질문, 한줄평, 하이라이트, 체크인은 섞이지 않는다.
- 다른 클럽 세션이나 존재하지 않는 세션 id는 빈 배열을 반환한다.
- `PUBLISHED`가 아닌 세션 id는 빈 배열을 반환한다.

통합 확인:

- `/app/notes` 최초 진입에서 기록이 있는 최신 세션만 보인다.
- 오른쪽 레일에서 다른 세션을 선택하면 URL과 본문이 바뀐다.
- 모바일 폭에서 최근 세션 피커와 바텀시트로 세션을 선택할 수 있다.

## 12. Implementation Notes

- 현재 `front/app/(app)/app/notes/page.tsx`는 `currentSession`과 `/api/archive/sessions` fetch를 제거하거나 선택 UI에서 쓰지 않도록 정리한다. 이 화면의 선택 목록은 `/api/notes/sessions`가 기준이다.
- `front/features/archive/components/notes-feed-page.tsx`는 데스크탑/모바일 레이아웃을 분리할 수 있다. 기존 archive page처럼 `desktop-only`, `mobile-only` 패턴을 재사용한다.
- 세션 선택은 버튼 내부에서 직접 데이터를 바꾸기보다 URL 상태를 갱신하는 방식이 명확하다. 공유 가능한 URL이 생기고 서버에서 선택 세션 feed를 안정적으로 가져올 수 있다.
- 기존 홈 화면은 `/api/notes/feed`를 그대로 호출하므로 최근 활동 피드의 성격을 유지한다.
- 바텀시트는 새 라이브러리 없이 기존 CSS와 React 상태로 구현한다.

## 13. Open Decisions Resolved

- 기본 세션: 기록이 있는 가장 최근 발행 세션
- 데스크탑 방향: 오른쪽 세션 레일 선택형
- 모바일 방향: 상단 최근 세션 피커 + 전체 세션 바텀시트
- 세션 변경 시 종류 필터: `All`로 초기화
- API 방향: notes 세션 인덱스 추가 + 기존 최근 feed 유지 + `sessionId` query로 세션별 feed 확장
