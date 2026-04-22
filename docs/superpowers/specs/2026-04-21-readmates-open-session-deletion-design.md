# ReadMates Open Session Deletion Design

## Context

ReadMates lets a host create the next reading session from `/app/host/sessions/new` and edit it from `/app/host/sessions/{sessionId}/edit`. The host editor already shows a danger area with a `세션 삭제` button, but the button is currently presentation-only. It has no click handler and the backend has no `DELETE /api/host/sessions/{sessionId}` endpoint.

The current database model does not use `ON DELETE CASCADE` for session-owned tables. Tables such as `session_participants`, `questions`, `reading_checkins`, `one_line_reviews`, `long_reviews`, `highlights`, `public_session_publications`, `feedback_reports`, and `session_feedback_documents` all reference `sessions`. A raw delete from `sessions` would either fail under FK constraints or require manual child deletion first.

The existing e2e cleanup helper already demonstrates the desired physical deletion order for generated sessions with number `>= 7`. This feature turns that operational cleanup behavior into a host-facing product flow, but with stricter product policy: only the current `OPEN` session can be deleted.

## User Decisions

- Delete only sessions whose state is `OPEN`.
- Use hard delete, not soft delete.
- Delete all session-owned data together with the session.
- Do not delete member accounts, memberships, invitations, or auth sessions.
- After deleting session 7, the next session creation reuses number 7.
- Show a confirmation modal with deletion impact counts before the final delete.
- After successful deletion, redirect the host to `/app/host/sessions/new`.
- Implement deletion explicitly in the service/repository layer, not through DB cascade.

## Goals

- Let a host safely delete a mistakenly created open session.
- Prevent deletion of historical or published records.
- Give the host a clear preview of what will be removed.
- Preserve database integrity by deleting child rows before the parent session row.
- Keep the delete operation atomic.
- Reuse the existing session numbering behavior after deletion.
- Cover backend and frontend behavior with focused tests.

## Non-Goals

- No deletion of `CLOSED` or `PUBLISHED` sessions.
- No recovery or trash flow.
- No `DELETED` session state in this change.
- No database-wide FK cascade migration.
- No deletion of users, memberships, club records, invitations, or login sessions.
- No audit log in the first implementation.
- No broad redesign of the host session editor.

## Recommended Approach

Add an explicit host-only deletion flow:

1. `GET /api/host/sessions/{sessionId}/deletion-preview`
2. `DELETE /api/host/sessions/{sessionId}`

The preview endpoint returns current deletion counts for the target session. The delete endpoint revalidates the same policy inside a transaction, deletes child data in FK-safe order, deletes the session, and returns the final deleted counts.

This keeps product policy in application code. The database continues to protect integrity through FK constraints, while the repository owns the intentionally destructive operation.

## Backend API

### Preview Endpoint

`GET /api/host/sessions/{sessionId}/deletion-preview`

Authentication and authorization:

- Requires an authenticated active member.
- Requires host role.
- Requires the session to belong to the host's club.

Response on success:

```json
{
  "sessionId": "00000000-0000-0000-0000-000000000307",
  "sessionNumber": 7,
  "title": "7회차 모임",
  "state": "OPEN",
  "canDelete": true,
  "counts": {
    "participants": 6,
    "rsvpResponses": 2,
    "questions": 4,
    "checkins": 3,
    "oneLineReviews": 0,
    "longReviews": 0,
    "highlights": 0,
    "publications": 0,
    "feedbackReports": 0,
    "feedbackDocuments": 0
  }
}
```

For `OPEN` sessions, `canDelete` is `true`. For non-open sessions, return `409 Conflict` rather than a preview with `canDelete: false`. This keeps the API contract strict and avoids presenting non-deletable historical data as an actionable delete candidate.

Error responses:

- `400 Bad Request`: invalid UUID path parameter.
- `401 Unauthorized`: unauthenticated request.
- `403 Forbidden`: authenticated member is not a host.
- `404 Not Found`: session does not exist in the host's club.
- `409 Conflict`: session exists but is not `OPEN`.

### Delete Endpoint

`DELETE /api/host/sessions/{sessionId}`

Response on success:

```json
{
  "sessionId": "00000000-0000-0000-0000-000000000307",
  "sessionNumber": 7,
  "deleted": true,
  "counts": {
    "participants": 6,
    "rsvpResponses": 2,
    "questions": 4,
    "checkins": 3,
    "oneLineReviews": 0,
    "longReviews": 0,
    "highlights": 0,
    "publications": 0,
    "feedbackReports": 0,
    "feedbackDocuments": 0
  }
}
```

The delete endpoint must not trust a previous preview response. It rechecks host role, club ownership, and `OPEN` state inside its own transaction.

## Backend Types

Add response DTOs in the session API/application boundary:

```kotlin
data class HostSessionDeletionPreviewResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val state: String,
    val canDelete: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val deleted: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionCounts(
    val participants: Int,
    val rsvpResponses: Int,
    val questions: Int,
    val checkins: Int,
    val oneLineReviews: Int,
    val longReviews: Int,
    val highlights: Int,
    val publications: Int,
    val feedbackReports: Int,
    val feedbackDocuments: Int,
)
```

`rsvpResponses` counts `session_participants` rows whose `rsvp_status <> 'NO_RESPONSE'`. `participants` counts all `session_participants` rows for the session.

## Repository Design

Add two repository methods to `SessionRepository`:

```kotlin
fun previewOpenSessionDeletion(member: CurrentMember, sessionId: UUID): HostSessionDeletionPreviewResponse

@Transactional
fun deleteOpenHostSession(member: CurrentMember, sessionId: UUID): HostSessionDeletionResponse
```

Both methods use the existing host authorization style:

- Call `requireHost(member)`.
- Scope every query by `member.clubId`.
- Parse/validate UUID at controller boundary through existing `parseHostSessionId`.

### Preview Query

Preview queries the session by `id` and `club_id`. If missing, throw `HostSessionNotFoundException`.

If found but `state != 'OPEN'`, throw a new conflict exception:

```kotlin
@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")
```

Then compute counts with scoped `count(*)` queries or one aggregate query. Keep this logic behind a small private helper such as `countSessionDeletionRows(jdbcTemplate, sessionId, clubId)`.

### Delete Transaction

The delete method:

1. Require host role.
2. Select the session row by `id` and `club_id` with `for update`.
3. Return `404` if no row exists.
4. Return `409` if the row state is not `OPEN`.
5. Compute deletion counts before deleting rows.
6. Delete child rows in FK-safe order.
7. Delete the `sessions` row.
8. Return `HostSessionDeletionResponse`.

The row lock prevents two concurrent delete requests from both seeing the same open session as available. Once the first transaction deletes the row and commits, a second delete request resolves as `404`.

### Delete Order

Use the same order as the e2e generated-session cleanup, scoped to the single session:

1. `feedback_reports`
2. `session_feedback_documents`
3. `public_session_publications`
4. `highlights`
5. `one_line_reviews`
6. `long_reviews`
7. `questions`
8. `reading_checkins`
9. `session_participants`
10. `sessions`

The delete uses direct SQL deletes inside the transaction. Avoid dynamic table names. Each statement includes `session_id = ?` and, where the table has it, `club_id = ?`.

## Number Reuse

No new numbering logic is needed.

Current session creation computes `coalesce(max(number), 0) + 1` for the club. If sessions 1-6 remain and the mistaken `OPEN` session 7 is hard-deleted, the next created session becomes 7 again. This is the intended behavior.

The design intentionally does not introduce a session number ledger or tombstone because the user goal is to reverse mistaken session creation, not preserve a permanent audit trail of failed drafts.

## Frontend API Types

Extend `front/shared/api/readmates.ts` with:

```ts
export type HostSessionDeletionCounts = {
  participants: number;
  rsvpResponses: number;
  questions: number;
  checkins: number;
  oneLineReviews: number;
  longReviews: number;
  highlights: number;
  publications: number;
  feedbackReports: number;
  feedbackDocuments: number;
};

export type HostSessionDeletionPreviewResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  canDelete: boolean;
  counts: HostSessionDeletionCounts;
};

export type HostSessionDeletionResponse = {
  sessionId: string;
  sessionNumber: number;
  deleted: true;
  counts: HostSessionDeletionCounts;
};
```

## Frontend UX

Update `HostSessionEditor`:

- Show the danger delete section only when `session` exists.
- Disable or hide the delete action when `session.state !== 'OPEN'`.
- On click, open a modal instead of deleting immediately.
- When the modal opens, fetch `/api/bff/api/host/sessions/{sessionId}/deletion-preview`.
- Show a loading state while preview is loading.
- Show an error state if preview fails.
- Show count rows when preview succeeds.
- Require a second explicit click on `세션 삭제` inside the modal.
- Disable modal buttons while the delete request is in flight.
- On successful delete, redirect to `/app/host/sessions/new`.
- On delete failure, keep the modal open and show an error message.

The modal does not require typing the session title or number. The impact summary plus second click is enough because deletion is limited to `OPEN` sessions.

### Modal Copy

Suggested modal title:

`이 세션을 삭제할까요?`

Suggested body:

`삭제하면 이 회차와 준비 기록이 모두 제거됩니다. 멤버 계정과 멤버십은 삭제되지 않습니다.`

Suggested count labels:

- 참석 대상
- RSVP 응답
- 질문
- 체크인
- 한줄평
- 장문평
- 하이라이트
- 공개 요약
- 개인 피드백 리포트
- 회차 피드백 문서

Suggested buttons:

- Cancel: `취소`
- Destructive action: `세션 삭제`

## Error Handling

Backend:

- Invalid UUID: existing `parseHostSessionId` returns `400`.
- Unauthenticated: existing current-member lookup returns `401`.
- Non-host: `requireHost` returns forbidden behavior through `AccessDeniedException`.
- Missing session: `HostSessionNotFoundException`, `404`.
- Non-open session: new conflict exception, `409`.
- Unexpected DB error: transaction rolls back and returns server error through normal Spring behavior.

Frontend:

- Preview `404`: show `세션을 찾을 수 없습니다.`
- Preview or delete `409`: show `이미 닫히거나 공개된 세션은 삭제할 수 없습니다.`
- Other failures: show `세션 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.`
- Network error: same generic failure message.

## Testing Plan

### Backend Tests

Add coverage in `HostSessionControllerDbTest` or a focused new DB test class:

- Host can preview deletion for an `OPEN` session.
- Preview counts include participants, RSVP responses, questions, checkins, reviews, highlights, publications, feedback reports, and feedback documents.
- Host can delete an `OPEN` session.
- Delete removes all session-owned child rows.
- Delete leaves users, memberships, invitations, and auth sessions untouched.
- Delete returns `404` for a session in another club or a missing session.
- Delete returns `409` for `CLOSED` and `PUBLISHED` sessions.
- Non-host cannot preview or delete.
- After deleting generated session 7, creating a new session returns session number 7.
- Repeated delete is idempotent from a safety perspective: first succeeds, second returns `404`.

### Frontend Unit Tests

Update `host-session-editor.test.tsx`:

- Delete section is visible for existing `OPEN` sessions.
- Delete section is hidden or disabled for new sessions.
- Clicking delete opens the modal and fetches preview.
- Preview counts render with Korean labels.
- Confirming delete sends `DELETE /api/bff/api/host/sessions/{sessionId}`.
- Successful delete redirects to `/app/host/sessions/new`.
- Preview failure shows an error and does not send delete.
- Delete failure keeps the modal open and shows an error.
- Delete button is disabled while request is pending.

### E2E

The current e2e cleanup helper remains direct SQL cleanup. It does not call the product delete endpoint because test setup/teardown must work even when the app server is not running.

Add one product-flow e2e case if the implementation phase already has a stable app-server-backed e2e path for this flow. Otherwise, defer it and rely on the backend DB tests plus frontend unit tests for the first implementation:

1. Host creates session 7.
2. Member adds a question.
3. Host opens edit page.
4. Host opens delete modal and confirms.
5. Host is redirected to new session page.
6. Current session is empty.
7. Creating another session produces session 7.

This e2e is not a release gate for the first implementation.

## Rollout Notes

This is a behavioral API/frontend change with no schema migration. It only adds endpoints and UI behavior.

Deployment risk is concentrated in deletion SQL. Keep every delete scoped by both `session_id` and `club_id` where possible. Do not implement deletion through string-built dynamic SQL. Do not broaden the feature to non-open sessions during implementation.

Because the delete button already exists visually, wiring it may surprise a user who assumed it was inert. The confirmation modal and impact counts are therefore required before the first delete request is sent.

## Open Questions Resolved

- Should `PUBLISHED` sessions be deletable? No.
- Should deletion be recoverable? No.
- Should member-created questions survive deletion? No, they are session-owned preparation data.
- Should the deleted session number be reused? Yes.
- Should deletion use DB cascade? No.
- Should the modal require typing the title? No.

## Acceptance Criteria

- A host can delete an `OPEN` session from the edit screen after seeing a deletion preview modal.
- Deleting an `OPEN` session removes all rows tied to that session in the session-owned tables.
- The same operation does not remove users, memberships, invitations, or auth sessions.
- `CLOSED` and `PUBLISHED` sessions cannot be deleted through the API or UI.
- Delete is transactional: partial deletion is not observable after an error.
- After deleting session 7, the next created session is numbered 7.
- Backend tests cover success, refusal, data cleanup, and number reuse.
- Frontend tests cover modal preview, confirmation, success redirect, and failure states.
