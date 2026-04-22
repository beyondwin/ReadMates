# ReadMates Member Session Archive Detail Design

작성일: 2026-04-21
상태: VALIDATED DESIGN SPEC
문서 목적: 로그인 멤버가 아카이브에서 지난 세션을 열었을 때 공개 게스트 화면이 아니라 멤버용 세션 기록 상세를 보도록 라우트, UX, API, 권한, 테스트 기준을 정의한다.

## 1. 문제 정의

현재 `/app/archive`의 세션 `열기` 액션은 공개 라우트인 `/sessions/{sessionId}`로 이동한다. 이 공개 세션 화면은 게스트 쇼케이스이므로 하단에 `Join the reading` 영역과 로그인/초대 수락 CTA를 항상 렌더링한다.

이 때문에 이미 로그인한 멤버가 앱 내부 아카이브에서 지난 회차를 열어도 게스트 모집 문구를 보게 된다. 또한 공개 세션 화면은 공개 요약, 공개 하이라이트, 공개 한줄평만 보여주므로 멤버가 기대하는 내 질문, 내 서평, 회차 피드백 문서, 참석 맥락으로 이어지지 않는다.

아카이브의 `By session`, `Reviews`, `My questions`, `피드백 문서` 탭도 지금은 서로 다른 회고 경로라기보다 단순 목록 필터처럼 보인다. 각 탭이 어떤 목적으로 다시 세션 기록에 들어가는지 명확히 해야 한다.

## 2. 목표

- 로그인 멤버와 호스트가 지난 세션을 열 때 앱 내부의 멤버용 읽기 전용 세션 상세를 보게 한다.
- 공개 `/sessions/{sessionId}`는 게스트용 쇼케이스로 유지한다.
- 멤버용 세션 상세는 공개 요약, 클럽 기록, 내 기록, 피드백 문서 상태를 한 화면에 모은다.
- 클럽 멤버는 참석 여부와 무관하게 같은 클럽의 발행된 세션 상세를 볼 수 있다.
- 피드백 문서 본문은 기존 정책대로 호스트 또는 해당 회차 참석자만 열람한다.
- 아카이브 탭을 서로 다른 회고 진입점으로 정리한다.
- 데스크탑과 모바일 모두 앱 쉘 안에서 자연스럽게 작동하게 한다.

## 3. 비목표

- 공개 세션 화면을 제거하지 않는다.
- 현재 세션 준비 화면(`/app/session/current`)의 저장/RSVP 폼을 지난 세션 상세에 재사용하지 않는다.
- 피드백 문서 권한 정책을 완화하지 않는다.
- 세션 상세에서 과거 질문, 체크인, 서평을 수정하는 기능은 추가하지 않는다.
- 피드백 문서의 서버 PDF 생성 방식을 새로 만들지 않는다.
- 전체 아카이브 검색, 태그, 필터 고도화는 이번 범위에 포함하지 않는다.

## 4. 확정된 방향

새 앱 라우트 `/app/sessions/{sessionId}`를 추가한다.

역할별 라우트는 아래처럼 분리한다.

| 사용자 | 라우트 | 목적 |
| --- | --- | --- |
| Guest | `/sessions/{sessionId}` | 공개 요약과 공개 기록을 보여주는 외부 쇼케이스 |
| Member/Host | `/app/sessions/{sessionId}` | 지난 회차의 내부 기록을 다시 읽는 멤버 워크스페이스 |

`/app/archive`의 세션 `열기` 링크는 모두 `/app/sessions/{sessionId}`로 변경한다. 공개 홈, 공개 클럽, 공개 기록 페이지에서만 `/sessions/{sessionId}` 링크를 유지한다.

## 5. 권한 정책

세션 상세 접근:

- 비로그인 사용자는 앱 레이아웃의 기존 정책에 따라 `/login`으로 이동한다.
- 활성 클럽 멤버와 호스트만 `/app/sessions/{sessionId}`에 접근할 수 있다.
- 조회 대상은 같은 클럽의 `PUBLISHED` 세션으로 제한한다.
- 다른 클럽 세션이거나 존재하지 않는 세션은 구분하지 않고 조용한 not-found 상태로 처리한다.
- 참석하지 않은 클럽 멤버도 세션 상세의 공개 요약, 클럽 기록, 자신의 기록 빈 상태는 볼 수 있다.

피드백 문서:

- 세션 상세 API는 피드백 문서의 상태만 반환한다.
- 피드백 문서 본문은 기존 `GET /api/sessions/{sessionId}/feedback-document`를 사용한다.
- 호스트는 같은 클럽의 피드백 문서를 열람할 수 있다.
- 멤버는 `session_participants.attendance_status = 'ATTENDED'`인 회차의 피드백 문서만 열람할 수 있다.
- 문서가 있지만 미참석자인 경우 세션 상세는 열리고 피드백 영역만 잠긴다.

## 6. 정보 구조

멤버용 지난 세션 상세는 읽기 전용 기록장이다.

주요 섹션:

- `요약`: 책, 회차, 날짜, 참석 수, 공개 요약, 공개 하이라이트
- `클럽 기록`: 회차 질문, 체크인 노트, 공개 한줄평
- `내 기록`: 내 질문, 내 체크인, 내 한줄평, 내 장문 서평
- `피드백`: 피드백 문서 상태와 열기/PDF 저장 진입

현재 세션 화면과 다른 점:

- RSVP 변경 버튼을 제공하지 않는다.
- 체크인, 질문, 서평 입력 폼을 제공하지 않는다.
- 저장 액션과 save feedback 상태를 제공하지 않는다.
- 이미 남긴 기록을 읽기 좋은 형태로 보여준다.

## 7. 데스크탑 UX

데스크탑 `/app/sessions/{sessionId}`는 앱 네비게이션 아래에 렌더링한다.

상단 헤더:

- 작은 뒤로가기 링크: `아카이브로`
- 책 표지
- `Archived session · No.06 · 2026.04.15`
- 책 제목
- 저자, 날짜, 참석 수, 공개 기록 여부, 피드백 문서 상태

본문 구조:

- 상단 또는 본문 시작점에 세그먼트 칩: `요약`, `클럽 기록`, `내 기록`, `피드백`
- 왼쪽 메인 컬럼은 읽기 콘텐츠를 세로로 배치한다.
- 오른쪽 레일은 보조 정보를 담는다.

메인 컬럼:

- 공개 요약
- 공개 하이라이트
- 회차 질문 목록
- 체크인 노트
- 공개 한줄평
- 내 질문과 내 서평

오른쪽 레일:

- 내 참석 상태
- 내가 남긴 기록 요약: 질문 수, 서평 여부, 체크인 여부
- 피드백 문서 카드
- 호스트일 경우 오른쪽 레일 하단에 `세션 편집` 링크를 노출하고 `/app/host/sessions/{sessionId}/edit`로 이동한다.

피드백 문서 카드는 상태별로 다르게 보인다.

- `readable`: `피드백 문서 열기`, `PDF 저장`
- `locked`: `참석자에게만 공개됩니다`
- `missing`: `아직 등록된 피드백 문서가 없습니다`

## 8. 모바일 UX

모바일은 앱 모바일 헤더와 하단 탭을 유지한다.

헤더:

- 제목: `지난 세션`
- 뒤로가기: `/app/archive`
- 오른쪽 액션은 두지 않는다.

본문:

- 책 표지와 메타를 압축한 모바일 히어로
- 가로 스크롤 칩: `요약`, `기록`, `내 기록`, `피드백`
- 단일 컬럼 섹션

모바일 칩은 페이지 내 앵커로 구현한다. 칩을 누르면 해당 섹션으로 이동하고, 콘텐츠는 같은 페이지 안에 남아 있다.

모바일 섹션 순서:

1. 세션 히어로
2. 요약
3. 클럽 기록
4. 내 기록
5. 피드백 문서

모바일에서는 데스크탑 오른쪽 레일을 만들지 않는다. 내 참석 상태와 피드백 문서 상태는 각각 `내 기록`, `피드백` 섹션 안으로 들어간다.

## 9. 아카이브 탭 UX

아카이브 탭은 네 개의 회고 진입점으로 정리한다.

`By session`:

- 회차별 색인이다.
- 각 행은 책, 회차, 날짜, 저자, 참석 수, 내 기록 여부, 피드백 문서 여부를 보여준다.
- 액션은 `세션 열기`이며 `/app/sessions/{sessionId}`로 이동한다.

`Reviews`:

- 내 서평 색인이다.
- 각 카드는 서평 본문 일부, 종류, 책, 회차, 날짜를 보여준다.
- 카드를 누르면 `/app/sessions/{sessionId}#my-records`로 이동한다.
- 모바일 탭 라벨은 현재처럼 `내 서평`을 사용한다.

`My questions`:

- 내 질문 색인이다.
- 각 카드는 질문, 우선순위, 책, 회차, 날짜, draft thought를 보여준다.
- 카드를 누르면 `/app/sessions/{sessionId}#my-records`로 이동한다.
- 모바일 탭 라벨은 현재처럼 `내 질문`을 사용한다.

`피드백 문서`:

- 내가 열람 가능한 피드백 문서 색인이다.
- 행은 책, 회차, 날짜, 문서 제목, 업로드일을 보여준다.
- 액션은 `문서 열기`, `PDF 저장`이다.
- 모바일은 아이콘 버튼을 유지하되 `aria-label`과 `title`로 의미를 보존한다.

## 10. 백엔드 API

새 엔드포인트:

`GET /api/archive/sessions/{sessionId}`

응답 타입 초안:

```json
{
  "sessionId": "00000000-0000-0000-0000-000000000306",
  "sessionNumber": 6,
  "title": "6회차 모임 · 가난한 찰리의 연감",
  "bookTitle": "가난한 찰리의 연감",
  "bookAuthor": "찰리 멍거",
  "bookImageUrl": "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
  "date": "2026-04-15",
  "locationLabel": "Google Meet",
  "attendance": 6,
  "total": 6,
  "myAttendanceStatus": "ATTENDED",
  "publicSummary": "공개 요약",
  "publicHighlights": ["공개 하이라이트"],
  "clubQuestions": [
    {
      "priority": 1,
      "text": "질문",
      "draftThought": "질문 의도",
      "authorName": "이멤버5",
      "authorShortName": "멤버5"
    }
  ],
  "clubCheckins": [
    {
      "authorName": "이멤버5",
      "authorShortName": "멤버5",
      "readingProgress": 100,
      "note": "체크인 노트"
    }
  ],
  "publicOneLiners": [
    {
      "authorName": "이멤버5",
      "authorShortName": "멤버5",
      "text": "공개 한줄평"
    }
  ],
  "myQuestions": [],
  "myCheckin": null,
  "myOneLineReview": null,
  "myLongReview": null,
  "feedbackDocument": {
    "available": true,
    "readable": true,
    "lockedReason": null,
    "title": "독서모임 6차 피드백",
    "uploadedAt": "2026-04-20T09:00:00Z"
  }
}
```

필드 원칙:

- 공개 페이지에서 쓰는 `publicSummary`, `highlights`, `oneLiners`를 재사용하되 앱 상세에서는 멤버 맥락 필드를 추가한다.
- `clubQuestions`는 해당 회차에 제출된 질문 전체를 보여준다.
- `clubCheckins`는 노트가 비어 있지 않은 체크인만 보여준다.
- `myQuestions`, `myCheckin`, `myOneLineReview`, `myLongReview`는 현재 로그인 멤버 기준이다.
- `feedbackDocument.available`은 문서 존재 여부다.
- `feedbackDocument.readable`은 현재 사용자 권한 기준이다.
- `feedbackDocument.lockedReason`은 `NOT_ATTENDED` 또는 `NOT_AVAILABLE`처럼 UI 분기에 충분한 안정 문자열을 사용한다.

## 11. 데이터 조회 기준

세션 기본 정보:

- `sessions`
- 같은 `club_id`
- `state = 'PUBLISHED'`

공개 요약:

- `public_session_publications`
- `is_public = true`이면 요약을 보여준다.
- `is_public = false`이거나 publication row가 없으면 멤버 앱에서는 세션 기본 정보와 클럽 기록은 보여주되 요약 섹션에 빈 상태를 표시한다.

클럽 기록:

- 질문: `questions`
- 체크인: `reading_checkins`
- 공개 한줄평: `one_line_reviews.visibility = 'PUBLIC'`
- 하이라이트: `highlights`

내 기록:

- 현재 멤버의 `questions`
- 현재 멤버의 `reading_checkins`
- 현재 멤버의 `one_line_reviews`
- 현재 멤버의 `long_reviews`

참석 상태:

- 현재 멤버의 `session_participants.attendance_status`
- 전체 참석 수는 `ATTENDED`
- 전체 인원은 해당 세션 participant count

피드백 문서 상태:

- `session_feedback_documents` 최신 버전 존재 여부
- 호스트면 readable
- 멤버면 해당 회차 `ATTENDED`일 때 readable

## 12. 프론트 구조

추가할 파일:

- `front/app/(app)/app/sessions/[sessionId]/page.tsx`
- `front/features/archive/components/member-session-detail-page.tsx`

확장할 타입:

- `MemberArchiveSessionDetailResponse`
- `ArchiveSessionFeedbackDocumentStatus`

수정할 파일:

- `front/features/archive/components/archive-page.tsx`
- `front/shared/ui/mobile-header.tsx`
- `front/tests/unit/archive-page.test.tsx`
- 새 상세 페이지 unit test

`ArchivePage`는 세션 링크만 바꾸고 기존 데스크탑/모바일 구조를 보존한다. 새 상세 화면은 별도 컴포넌트로 둬서 아카이브 목록과 책임을 섞지 않는다.

## 13. 에러와 빈 상태

세션 없음:

- 제목: `세션을 찾을 수 없습니다`
- 본문: `삭제되었거나 열람할 수 없는 세션입니다.`
- 액션: `아카이브로 돌아가기`

공개 요약 없음:

- `공개 요약이 아직 정리되지 않았습니다.`

클럽 기록 없음:

- `아직 이 회차에 표시할 클럽 기록이 없습니다.`

내 기록 없음:

- `이 회차에 남긴 내 질문이나 서평이 없습니다.`

피드백 문서 없음:

- `아직 등록된 피드백 문서가 없습니다.`

피드백 문서 잠김:

- `피드백 문서는 해당 회차 참석자에게만 공개됩니다.`

## 14. 테스트 기준

백엔드:

- 클럽 멤버가 같은 클럽의 published 세션 상세를 조회할 수 있다.
- 다른 클럽 또는 없는 세션은 404로 처리한다.
- 미참석 멤버도 세션 상세는 조회할 수 있다.
- 참석 멤버는 `feedbackDocument.readable = true`를 받는다.
- 미참석 멤버는 `feedbackDocument.available = true`, `readable = false`, `lockedReason = NOT_ATTENDED`를 받는다.
- 호스트는 참석 여부와 무관하게 `readable = true`를 받는다.

프론트:

- `/app/archive`의 세션 링크가 `/app/sessions/{sessionId}`를 가리킨다.
- 공개 `/sessions/{sessionId}`는 게스트 CTA를 유지한다.
- 앱 `/app/sessions/{sessionId}`는 `Join the reading`을 렌더링하지 않는다.
- 앱 상세는 책 제목, 날짜, 참석 수, 공개 요약, 클럽 기록, 내 기록, 피드백 상태를 렌더링한다.
- 피드백 readable 상태에서는 문서 열기와 PDF 저장 링크가 활성화된다.
- 피드백 locked 상태에서는 열기 링크 없이 잠김 문구를 보여준다.
- 모바일 상세는 앱 모바일 헤더와 하단 탭 안에서 단일 컬럼으로 렌더링한다.

회귀 테스트:

- 기존 `public-session-page` 테스트는 게스트 화면의 비공개 정보 미노출을 계속 보장한다.
- 기존 `archive-page` 테스트는 탭 전환과 피드백 문서 액션을 계속 보장하되 세션 href 기대값만 앱 라우트로 갱신한다.

## 15. 구현 순서

1. 백엔드 `ArchiveController`에 `GET /api/archive/sessions/{sessionId}`를 추가한다.
2. `ArchiveRepository`에 멤버용 상세 조회 메서드와 응답 DTO를 추가한다.
3. 프론트 타입을 추가한다.
4. `/app/sessions/[sessionId]` 라우트와 상세 컴포넌트를 추가한다.
5. `/app/archive` 세션 링크를 `/app/sessions/{sessionId}`로 바꾼다.
6. 데스크탑 상세 레이아웃을 구현한다.
7. 모바일 상세 레이아웃과 헤더 title을 구현한다.
8. unit test와 필요한 e2e smoke test를 갱신한다.

## 16. 성공 기준

- 로그인 멤버가 아카이브에서 세션을 열면 게스트 CTA가 보이지 않는다.
- 게스트 공개 세션 화면은 기존대로 작동한다.
- 멤버는 지난 회차에서 공개 기록과 자신의 기록을 한 화면에서 다시 읽을 수 있다.
- 참석하지 않은 멤버도 회차 상세를 볼 수 있지만 피드백 문서는 열 수 없다.
- 데스크탑과 모바일 모두 앱 네비게이션 맥락을 잃지 않는다.
- 아카이브 탭은 각각 세션, 서평, 질문, 피드백 문서로 돌아가는 명확한 진입점이 된다.
