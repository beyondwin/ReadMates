# ReadMates Notes Session Filter Implementation Plan

작성일: 2026-04-21
기준 설계 문서: `docs/superpowers/specs/2026-04-21-readmates-notes-session-filter-design.md`

## Scope Guardrails

- `/app/notes`만 세션별 기록장으로 전환한다.
- 홈 화면과 기존 최근 활동 용도의 `/api/notes/feed` 기본 동작은 유지한다.
- 진행중 세션은 notes 기본 선택 후보에 포함하지 않는다.
- 기존 사용자 작업으로 보이는 변경은 되돌리거나 덮어쓰지 않는다.

## Task 1 - Backend Notes Session Index And Session Feed

- [x] `NoteSessionItem` 응답 타입을 추가한다.
- [x] `GET /api/notes/sessions` endpoint를 추가한다.
- [x] `ArchiveRepository.findNoteSessions(clubId)`를 추가해 같은 클럽의 `PUBLISHED` 세션을 최신순으로 반환하고, 질문/공개 한줄평/하이라이트/체크인 수와 `totalCount`를 계산한다.
- [x] 기존 `findNotesFeed(clubId)`의 최근 feed 동작과 `limit 120`을 유지한다.
- [x] `GET /api/notes/feed?sessionId=...`를 지원하고, 유효하지 않거나 다른 클럽이거나 `PUBLISHED`가 아닌 세션은 빈 배열을 반환한다.
- [x] 선택 세션 조회는 해당 세션의 모든 `QUESTION`, `ONE_LINE_REVIEW`, `HIGHLIGHT`, `CHECKIN`을 반환하고 `limit 120`에 의존하지 않는다.
- [x] 백엔드 테스트로 notes sessions 정렬/카운트, 기존 feed 유지, sessionId 필터, invalid/unpublished session 빈 배열을 검증한다.
- [x] 검증: `./gradlew test --tests com.readmates.archive.api.ArchiveAndNotesDbTest`
- [x] Spec compliance review 완료.
- [x] Code quality review 완료.

## Task 2 - Frontend Server Data Wiring And Types

- [x] `NoteSessionItem` 프론트 타입을 추가한다.
- [x] `/app/notes` 서버 컴포넌트에서 `/api/notes/sessions`를 먼저 가져온다.
- [x] URL `sessionId`를 읽고, 유효한 note session이면 선택한다.
- [x] URL `sessionId`가 없거나 유효하지 않으면 `totalCount > 0`인 최신 세션으로 fallback한다.
- [x] 기록이 있는 세션이 없으면 최신 발행 세션으로 fallback한다.
- [x] 선택 세션이 있으면 `/api/notes/feed?sessionId=...`를 호출하고, 없으면 빈 feed를 전달한다.
- [x] `NotesFeedPage` props를 `items`, `noteSessions`, `selectedSessionId`, `selectedSession` 기준으로 바꾼다.
- [x] 기존 `currentSession`과 `/api/archive/sessions` 의존성을 `/app/notes`에서 제거한다.
- [x] 프론트 unit test로 기본 선택/fallback 데이터 전달 또는 렌더링을 검증한다.
- [x] 검증: `pnpm vitest run tests/unit/notes-page.test.tsx tests/unit/notes-feed-page.test.tsx`
- [x] Spec compliance review 완료.
- [x] Code quality review 완료.

## Task 3 - Notes Session Selection UI

- [x] `SelectedSessionHeader`를 추가해 선택된 책 제목, 회차/날짜, 기록 개수 요약을 보여준다.
- [x] 기존 종류 필터를 선택 세션 내부 필터로 유지하고, 세션 변경 링크는 URL 상태를 사용한다.
- [x] 데스크탑 오른쪽 `By session` 영역을 검색 가능한 `SessionRail`로 바꾼다.
- [x] 세션 행에 회차, 책 제목, 날짜, 총 기록 수, 선택 상태를 표시하고 `aria-current` 또는 `aria-pressed`를 제공한다.
- [x] 검색어는 책 제목과 `No.06` 같은 회차 라벨을 기준으로 클라이언트 필터링한다.
- [x] 모바일 상단 최근 세션 피커를 추가하고 최근 5~8개 세션과 `전체 세션` 버튼을 렌더링한다.
- [x] 모바일 전체 세션 바텀시트를 추가하고 `role="dialog"`, 제목, 닫기 버튼, 검색 입력, 전체 목록을 제공한다.
- [x] 세션 변경 시 URL 이동이 일어나도록 `/app/notes?sessionId=...` 링크를 사용한다.
- [x] note session 없음, 선택 세션 기록 없음, 필터 결과 없음, 세션 검색 결과 없음 empty state를 설계 문구대로 처리한다.
- [x] 프론트 unit test로 검색, 링크, 모바일 피커/바텀시트, 필터 empty state를 검증한다.
- [x] 검증: `pnpm vitest run tests/unit/notes-page.test.tsx tests/unit/notes-feed-page.test.tsx`
- [x] Spec compliance review 완료.
- [x] Code quality review 완료.

## Task 4 - Final Regression Verification And Plan Closure

- [x] Task별 체크박스가 실제 완료 상태와 일치하는지 갱신한다.
- [x] 홈 화면 최근 활동 피드가 기존 `/api/notes/feed` 기본 동작에 의존하는지 확인하고 관련 회귀 테스트를 실행한다.
- [x] 서버 notes DB 테스트를 다시 실행한다.
- [x] 프론트 notes 및 member home 관련 unit test를 실행한다.
- [x] `git status --short`로 변경 범위를 확인한다.
- [x] 최종 리뷰를 수행한다.
- [x] Final verification command: `cd server && ./gradlew test --tests com.readmates.archive.api.ArchiveAndNotesDbTest && cd ../front && pnpm vitest run tests/unit/notes-page.test.tsx tests/unit/notes-feed-page.test.tsx tests/unit/member-home.test.tsx`
