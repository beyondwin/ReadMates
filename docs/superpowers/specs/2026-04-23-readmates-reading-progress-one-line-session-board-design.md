# ReadMates Reading Progress And One-Line Session Board Design

작성일: 2026-04-23
상태: VALIDATED DESIGN SPEC
문서 목적: 현재 세션의 체크인 메모와 읽기 흔적 공유를 제거하고, 한줄평을 모임 종료 이후 공개물이 아니라 해당 세션 참여자에게 즉시 보이는 공동 보드 기록으로 전환하기 위한 완전 정리 설계를 정의한다.

## 1. 문제 정의

현재 ReadMates는 현재 세션에서 `읽기 진행률`과 `체크인 메모`를 함께 저장한다. 저장된 체크인 메모는 현재 세션 공동 보드의 `읽기 흔적`, 홈의 클럽 흐름, 노트 피드, 아카이브 세션 상세에 다시 노출된다.

이 구조는 사용자가 원하는 정보 경계와 맞지 않는다. 읽기 진행률은 모임 준비 상태와 호스트 운영 판단에는 유용하지만, 짧은 체크인 메모를 별도 기록물처럼 계속 남기고 공유하는 것은 불필요하다. 따라서 체크인 메모와 읽기 흔적 표시는 삭제한다.

반대로 한줄평은 현재 "모임 종료 후 공개 · 이전까지는 본인만"이라는 안내와 `PRIVATE` 저장 정책 때문에 현재 세션 참여자가 서로 볼 수 없다. 사용자는 한줄평을 모임 종료 후 공개 기록이 아니라, 해당 세션에 참여한 사람들이 함께 보는 기록으로 쓰길 원한다.

## 2. 목표

- 읽기 진행률은 계속 유지한다.
- 체크인 메모 입력, 저장, 조회, 표시를 제거한다.
- `읽기 흔적`이라는 공동 보드/피드/아카이브 노출을 제거한다.
- 현재 세션 공동 보드에 한줄평 목록을 추가한다.
- 한줄평은 현재 열린 세션의 active 참여자가 저장하면 같은 세션 active 참여자에게 보인다.
- 한줄평의 외부 공개 페이지 정책은 분리한다.
- DB, API contract, frontend model, UI, 테스트 fixture를 모두 같은 의미로 정리한다.
- 기존 공개 아카이브/공개 사이트가 내부 세션 참여자 공개를 외부 공개로 오해하지 않게 한다.

## 3. 비목표

- 읽기 진행률 자체를 삭제하지 않는다.
- RSVP, 질문 작성, 장문 서평 기능은 바꾸지 않는다.
- 공개 사이트에 현재 세션 한줄평을 즉시 공개하지 않는다.
- 한줄평에 댓글, 좋아요, 투표, 익명 공개 옵션을 추가하지 않는다.
- 과거 체크인 메모를 보존하거나 백업 화면을 만들지 않는다.

## 4. 확정된 방향

선택한 방향은 `완전 정리`다.

읽기 체크인은 `reading_progress`만 가진 준비 상태로 남긴다. 체크인 메모는 데이터 모델에서 제거하고, 프런트와 서버 contract에서도 사라진다. 기존 `reading_checkins.note` 데이터는 제품에서 더 이상 사용하지 않으므로 마이그레이션에서 삭제한다.

한줄평은 `one_line_reviews.visibility = 'SESSION'`을 기본값으로 저장한다. 이 값은 "현재 세션 active 참여자에게 보임"을 뜻한다. 기존 `PUBLIC`은 외부 공개 기록과 공개 아카이브용으로 계속 남긴다. 기존 `PRIVATE`는 과거 데이터 호환과 장기 안전을 위해 check constraint에 남기되, 현재 세션 저장 흐름에서는 더 이상 기본값으로 쓰지 않는다.

현재 세션 응답의 공동 보드는 다음 구조가 된다.

```ts
board: {
  questions: CurrentSessionQuestion[];
  oneLineReviews: BoardOneLineReview[];
  highlights: BoardHighlight[];
}
```

`board.checkins`는 제거한다.

## 5. 데이터 모델 변경

### 5.1 reading_checkins

`reading_checkins`는 읽기 진행률 저장 테이블로 유지한다.

삭제:

- `note`

유지:

- `id`
- `club_id`
- `session_id`
- `membership_id`
- `reading_progress`
- `created_at`
- `updated_at`
- `unique (session_id, membership_id)`
- 기존 FK와 `reading_progress between 0 and 100` check

마이그레이션:

- MySQL migration에 `alter table reading_checkins drop column note;`를 추가한다.
- 기본 migration 트리에도 동일한 의미의 migration을 추가한다.
- dev seed는 `reading_checkins` insert에서 `note`를 제거한다.
- 기존 체크인 메모는 삭제된다. 이는 이번 요구의 의도와 맞다.

### 5.2 one_line_reviews

`one_line_reviews.visibility` 허용값을 확장한다.

허용값:

- `SESSION`: 세션 active 참여자에게 공개
- `PUBLIC`: 공개 사이트/공개 기록에 노출 가능
- `PRIVATE`: 과거 데이터와 후방 호환용

현재 세션 저장 기본값:

- insert/update 모두 `SESSION`

공개 발행 흐름:

- 호스트가 공개 기록을 발행하더라도 `SESSION` 한줄평을 자동으로 `PUBLIC`으로 바꾸지 않는다.
- 외부 공개 기록에서 한줄평을 쓰려면 별도 공개 처리 흐름이 필요하다.
- 이번 변경에서는 외부 공개 한줄평 편집/승격 UI를 만들지 않는다.

## 6. Backend API Design

### 6.1 체크인 저장 API

기존:

```http
PUT /api/sessions/current/checkin
```

기존 요청:

```json
{
  "readingProgress": 80,
  "note": "질문을 준비 중입니다."
}
```

새 요청:

```json
{
  "readingProgress": 80
}
```

새 응답:

```json
{
  "readingProgress": 80
}
```

완전 정리 기준으로 `note`는 request/response DTO, command, result, repository method에서 제거한다. 프런트 BFF action도 `note`를 받지 않는다.

endpoint path는 유지한다. `/checkin`이라는 이름은 이미 프런트와 테스트, 운영 지표에 퍼져 있으므로 이번 작업에서는 path를 바꾸지 않는다. 단, 화면 문구는 `읽기 진행률` 중심으로 바꾼다.

### 6.2 현재 세션 조회 API

`GET /api/sessions/current` 응답 변경:

삭제:

- `currentSession.myCheckin.note`
- `currentSession.board.checkins`

추가:

- `currentSession.board.oneLineReviews`

새 타입:

```kotlin
data class CurrentSessionCheckin(
    val readingProgress: Int,
)

data class BoardOneLineReview(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)
```

조회 정책:

- `myCheckin`은 현재 멤버의 읽기 진행률만 반환한다.
- `board.oneLineReviews`는 같은 클럽, 같은 현재 open 세션, active participant, `visibility in ('SESSION', 'PUBLIC')` 한줄평을 반환한다.
- left member 익명화 정책은 질문/기존 보드와 동일하게 적용한다.
- removed participant의 한줄평은 보드에서 제외한다.

### 6.3 한줄평 저장 API

기존 endpoint는 유지한다.

```http
POST /api/sessions/current/one-line-reviews
```

저장 정책만 바꾼다.

```sql
insert into one_line_reviews (..., text, visibility)
select ..., ?, 'SESSION'
...
on duplicate key update
  text = values(text),
  visibility = values(visibility),
  updated_at = utc_timestamp(6)
```

저장 성공 후 route refresh가 일어나면 공동 보드의 한줄평 목록에 바로 반영된다.

## 7. Frontend UX Design

### 7.1 현재 세션 데스크톱

`내 준비 작업대`의 읽기 섹션을 바꾼다.

변경 전:

- 제목: `읽기 체크인`
- 입력: 읽기 진행률 range, 체크인 메모 textarea
- 안내: 체크인은 다른 멤버에게도 보임
- 버튼: 체크인 저장

변경 후:

- 제목: `읽기 진행률`
- 입력: 읽기 진행률 range
- 안내: `진행률은 내 준비 상태와 호스트 운영 확인에 사용됩니다.`
- 버튼: `진행률 저장`
- 체크인 메모 textarea 제거

`내 상태` 카드:

- `읽기 체크인` 라벨을 `읽기 진행률`로 변경한다.

공동 보드 탭:

- 제거: `읽기 흔적`
- 추가: `한줄평 · N`
- 유지: `질문`, `하이라이트`

한줄평 입력 카드:

- 안내 문구를 `저장하면 이번 세션 참여자가 함께 볼 수 있습니다.`로 바꾼다.
- 하단 문구를 `세션 참여자 공개`로 바꾼다.

### 7.2 현재 세션 모바일

`내 준비` 탭:

- `읽기 체크인` 카드명을 `읽기 진행률`로 바꾼다.
- 체크인 메모 textarea와 "다른 멤버에게 보이는 짧은 읽기 기록" 문구를 제거한다.
- 저장 버튼을 `진행률 저장`으로 바꾼다.

`공동 보드` 탭:

- `읽기 흔적` 섹션을 제거한다.
- `한줄평` 섹션을 추가한다.

`내 기록` 탭:

- 한줄평 안내를 `모임 뒤 공개 기록`에서 `세션 참여자 공개`로 바꾼다.

### 7.3 홈, 노트 피드, 아카이브

홈:

- 클럽 흐름과 멤버 활동에서 `CHECKIN` 항목을 제거한다.
- 모바일 통계의 `체크인` 라벨은 `읽기` 또는 `진행률`로 바꾼다.

노트 피드 `/app/notes`:

- `checkins` filter와 `읽기 흔적` 섹션을 제거한다.
- `NoteFeedKind`에서 `CHECKIN`을 제거한다.
- 세션 카운트에서 `checkinCount`를 제거하고 `totalCount` 계산에서 제외한다.

아카이브 세션 상세:

- `clubCheckins` 목록을 제거한다.
- `myCheckin`은 필요하면 내 진행률 summary로만 표현한다.
- "클럽 기록"에는 질문, 공개 하이라이트, 세션 참여자에게 보이는 한줄평을 표시한다.

확정 세부 정책:

- 아카이브의 `publicOneLiners`는 외부 공개용 `PUBLIC`만 유지한다.
- 세션 참여자 공개인 `SESSION` 한줄평은 현재 세션이 종료/발행된 뒤에도 인증된 멤버용 archive detail의 클럽 기록에 보인다.
- member archive detail에는 `clubOneLiners`를 새로 추가한다. `clubOneLiners`는 `visibility in ('SESSION', 'PUBLIC')` 한줄평을 담는다.
- 기존 `publicOneLiners`는 외부 공개 의미를 유지하며, 공개 API와 공개 화면에서만 사용한다.

## 8. Public Boundary

공개 사이트와 공개 API는 현재 정책을 유지한다.

- `/api/public/**`는 `sessions.state = 'PUBLISHED'`와 `one_line_reviews.visibility = 'PUBLIC'`만 노출한다.
- `SESSION` 한줄평은 인증된 멤버 세션/아카이브 안에서만 노출한다.
- 공개 사이트의 "한줄평 N" 카운트는 `PUBLIC`만 센다.

이렇게 해야 "세션 참여자 공개"가 외부 공개로 확대되지 않는다.

## 9. Data Flow

읽기 진행률:

```text
UI range
  -> saveCheckin(readingProgress)
  -> PUT /api/sessions/current/checkin
  -> reading_checkins.reading_progress upsert
  -> route refresh
  -> myCheckin.readingProgress hydrate
```

한줄평:

```text
UI input
  -> saveOneLineReview(text)
  -> POST /api/sessions/current/one-line-reviews
  -> one_line_reviews visibility SESSION upsert
  -> route refresh
  -> board.oneLineReviews hydrate
```

노트/아카이브:

```text
Notes feed
  -> questions + public/session-appropriate one-liners + highlights
  -> no CHECKIN kind

Public feed
  -> public summary + highlights + PUBLIC one-liners only
```

## 10. Compatibility

Breaking changes are intentional inside the authenticated app contract.

Known removals:

- `CheckinRequest.note`
- `CheckinResponse.note`
- `CurrentSession.myCheckin.note`
- `CurrentSession.board.checkins`
- `NoteFeedKind.CHECKIN`
- `NoteSessionItem.checkinCount`
- `MemberArchiveSessionDetailResponse.clubCheckins`

Known additions:

- `CurrentSession.board.oneLineReviews`
- `MemberArchiveSessionDetailResponse.clubOneLiners`

Deployment expectation:

- Frontend and backend should deploy together.
- Existing tests and fixtures must be updated in the same change.
- No fallback UI for old response shape is required.

## 11. Testing Plan

Backend tests:

- Checkin controller accepts `{ "readingProgress": 80 }` and persists only progress.
- Checkin controller rejects progress outside 0..100.
- Current session response includes `board.oneLineReviews` for active participants.
- Current session response excludes removed participants' one-line reviews.
- One-line review save writes `visibility = 'SESSION'`.
- Notes feed no longer returns `CHECKIN`.
- Public API continues to return only `PUBLIC` one-liners.
- Archive session detail exposes member-visible one-liners without checkin notes.
- Migration test confirms `reading_checkins.note` is absent.

Frontend tests:

- Current session desktop and mobile no longer render `체크인 메모` or `읽기 흔적`.
- Current session desktop and mobile render `한줄평 · N` board tab/section.
- Saving reading progress sends no `note` field.
- Saving one-line review refreshes and shows board one-liners.
- Notes feed filter list has no `읽기 흔적`.
- Archive detail has no checkin list.
- Public home/public records tests continue to count only public one-liners.
- Host dashboard labels use `읽기 진행률` where user-facing copy previously implied shared checkin notes.

## 12. Implementation Order

1. Add DB migrations and update dev seed inserts.
2. Update backend command/result/request/response models for checkin note removal.
3. Update `SessionParticipationRepository.saveCheckin`.
4. Update `CurrentSessionRepository` to remove checkin board and add one-line review board.
5. Update archive/notes query repositories to remove `CHECKIN` feed and checkin note surfaces.
6. Update public queries only if check constraint changes require fixture adjustments; keep public one-liner policy unchanged.
7. Update frontend API contracts and fixtures.
8. Update current-session UI and model tabs.
9. Update home, notes feed, archive detail, host dashboard copy.
10. Update tests and run targeted frontend/backend suites.

## 13. Risks

- Dropping `reading_checkins.note` is destructive. This is acceptable because the requested product change is to delete checkin memo/read trace behavior.
- `SESSION` visibility can be confused with `PUBLIC` unless query names and UI copy stay explicit.
- Notes feed and archive contracts remove fields used by several tests; update should be broad and atomic.
- Host dashboard still needs a progress completion signal. Keeping `reading_checkins` as a progress table avoids losing that operating metric.

## 14. Acceptance Criteria

- No current-session input screen shows a checkin memo textarea.
- No authenticated app screen labels a member-visible shared list as `읽기 흔적`.
- `reading_checkins` stores progress only.
- Current session participants can see each other's one-line reviews in the current session board.
- A saved one-line review is not externally public unless its visibility is `PUBLIC`.
- Public pages still exclude non-public one-line reviews.
- Unit and integration tests cover the new contract.
