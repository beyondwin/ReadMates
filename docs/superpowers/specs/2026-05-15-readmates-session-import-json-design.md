# ReadMates Session Import JSON Design

Date: 2026-05-15

## Summary

ReadMates needs a repeatable way to turn a meeting voice transcript into all post-session records needed by the host workflow:

- public/member record summary
- session highlights
- one-line reviews
- session feedback document

The chosen design is a semi-automated flow:

1. A local generator turns a transcript text file into one structured JSON file.
2. The host opens the existing session editor and imports that JSON.
3. The app previews and validates the result.
4. When the host approves, the server replaces the existing post-session record data for that session in one transaction.

This keeps LLM keys, model choice, prompt iteration, and transcript handling out of the production app while making the final storage path controlled by the application.

## Goals

- Let a host produce all session record artifacts from one generated JSON file.
- Keep the import action inside the existing host session editor.
- Reuse existing persistence concepts: `public_session_publications`, `highlights`, `one_line_reviews`, and `session_feedback_documents`.
- Validate import content before it writes to the database.
- Make replacement behavior explicit: approved imports replace the existing summary, highlights, one-line reviews, and feedback document for the target session.
- Keep production public exposure tied to the host-selected record visibility, not to hidden defaults inside the import file.

## Non-Goals

- Do not call an LLM from the production frontend or backend in this iteration.
- Do not add an in-app transcript-to-record generator yet.
- Do not build a rich editor for rewriting generated records.
- Do not support batch imports across multiple sessions in the first pass.
- Do not rely on local paths, private transcripts, or checked-in seed files at runtime.

## Existing Context

The current product already has separate paths for most affected records:

- Feedback documents are uploaded through `POST /api/host/sessions/{sessionId}/feedback-document` and parsed as `readmates-feedback:v1` Markdown.
- Public/member record summaries are saved through `PUT /api/host/sessions/{sessionId}/publication`.
- One-line reviews are currently member-authored current-session records in `one_line_reviews`.
- Highlights are read by public/archive views but do not currently have a host editing UI.

The new import flow should avoid duplicating these concepts. It adds a higher-level host operation that validates and writes the four record groups together.

## Import JSON Format

The import file is a single UTF-8 JSON document. It is intended to be readable and editable before upload.

```json
{
  "format": "readmates-session-import:v1",
  "session": {
    "number": 7,
    "bookTitle": "Example Book",
    "meetingDate": "2026-05-14"
  },
  "publication": {
    "summary": "A concise public-safe summary of the meeting."
  },
  "highlights": [
    {
      "authorName": "Host",
      "text": "A public-safe highlight from the session."
    }
  ],
  "oneLineReviews": [
    {
      "authorName": "Host",
      "text": "A concise one-line review."
    }
  ],
  "feedbackDocument": {
    "fileName": "session-7-feedback.md",
    "markdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 7차 피드백\n\n..."
  }
}
```

### Field Rules

- `format` must be exactly `readmates-session-import:v1`.
- `session.number`, `session.bookTitle`, and `session.meetingDate` are safety checks against the session currently open in the editor.
- `publication.summary` is required and non-empty.
- `highlights` contains one to six items.
- `oneLineReviews` contains at least one item.
- `authorName` values are matched by exact display name against the target session's active attendees.
- `feedbackDocument.fileName` must be safe and end in `.md` or `.txt`.
- `feedbackDocument.markdown` must pass the existing `FeedbackDocumentParser` template rules.

## Host UI

The import entry point lives in the existing host session editor. The UI adds an `AI 결과 JSON 가져오기` action near the existing record publication and feedback document controls.

After file selection, the UI shows a preview instead of saving immediately:

- session match status: number, book title, meeting date
- publication summary preview
- highlights with author match status
- one-line reviews with author match status
- feedback document parse status and extracted title
- a clear warning that approval will replace existing records for this session

The save button is disabled until required validations pass. Browser validation is only for quick feedback; the server repeats all checks before writing.

## Server API

Add a host-only import surface under the session host namespace:

- `POST /api/host/sessions/{sessionId}/session-import/preview`
- `POST /api/host/sessions/{sessionId}/session-import/commit`

Both endpoints accept the same JSON body. Preview returns normalized data and validation results without writes. Commit validates again and writes in a single transaction.

The API belongs under the server-side host/session write surface, not under public read or archive read packages. HTTP parsing stays in the inbound adapter, orchestration and authorization stay in an application service, and JDBC details stay behind an outbound persistence adapter.

## Commit Behavior

Commit is an explicit full replacement for the imported sections:

1. Upsert `public_session_publications.public_summary` for the target session.
2. Replace all `highlights` for the target session with the JSON highlight list.
3. Replace all `one_line_reviews` for the target session with the JSON one-line review list.
4. Save the imported feedback Markdown as a new current feedback document version.
5. Invalidate affected public, archive, notes, and host/session caches.

The existing published state is not automatically changed by import. If the session is still closed but unpublished, the host can publish through the existing lifecycle action. If the session is already published, the replaced data becomes visible according to the chosen visibility and normal cache behavior after commit.

## Visibility Mapping

The import JSON contains content only. It does not set visibility.

The commit uses the current record visibility selected in the host session editor:

- `PUBLIC`: save the publication as `PUBLIC`; save one-line reviews as `PUBLIC`.
- `MEMBER`: save the publication as member-visible; save one-line reviews as `SESSION`.
- `HOST_ONLY`: reject commit because this import creates session records intended for member/public views.

Highlights do not currently have a visibility column. They are tied to the session and shown by existing read rules when their author is an active session participant, or when no author is set.

## Author Matching

The first version uses exact `authorName` matching. The server resolves each author against active attendees for the target session.

Rules:

- Missing author match fails validation.
- Duplicate one-line review authors fail validation.
- Duplicate highlight authors are allowed.
- Authors who are not active participants fail validation.

This deliberately avoids email addresses in import files. It is easier for the local generator and keeps the JSON safer to inspect. If real-world name collisions become a problem, a later version can add optional membership IDs or a UI correction step.

## Local Generator

The local generator is a documented workflow first, not production application code.

Inputs:

- transcript `.txt`
- session number
- book title and author
- meeting date
- attendee display names
- real-name or alias mode

Output:

- one pretty-printed `readmates-session-import:v1` JSON file

Generation rules:

- Public summary and highlights must be public-safe: avoid private background details, sensitive claims, internal operations, and unnecessary personally identifying context.
- One-line reviews should be concise and suitable for the selected visibility.
- Feedback documents can be more detailed because existing product access restricts them to the host and eligible attendees.
- Do not invent facts that are not supported by the transcript.
- Use attendee names exactly as they appear in the app when real-name mode is selected.
- Use aliases for demo/public seed workflows.

The generator can start as a prompt/template stored in documentation. A CLI wrapper can be added later if the workflow becomes frequent enough to justify automation.

## Error Handling

Errors should tell the host how to fix the file.

Examples:

- `이 파일은 readmates-session-import:v1 형식이 아닙니다.`
- `7회차 파일인데 현재 화면은 6회차입니다.`
- `책 제목이 현재 세션과 일치하지 않습니다.`
- `하이라이트 작성자 'Host'를 이 회차 참석자에서 찾을 수 없습니다.`
- `피드백 문서가 ReadMates 피드백 템플릿 형식이 아닙니다.`
- `호스트 전용 공개 범위에서는 세션 기록 import를 저장할 수 없습니다.`

Commit must be transactional. If any write fails, no partial summary/highlight/review/feedback state should remain.

## Testing

Server tests:

- preview accepts a valid fixture and returns normalized sections
- preview rejects wrong session number, wrong book title, wrong date, invalid format, and invalid feedback Markdown
- commit requires host authorization
- commit rejects `HOST_ONLY` visibility
- commit replaces existing publication, highlights, one-line reviews, and feedback document in one transaction
- commit rolls back all writes if a later section fails
- author matching requires active session participants

Frontend tests:

- host editor accepts a `.json` import file
- preview shows summary, highlights, one-line reviews, and feedback document status
- invalid author and invalid feedback template errors are shown
- save is disabled when validation fails
- successful commit refreshes editor state and shows a confirmation

Generator checks:

- sample transcript workflow produces JSON that passes schema validation
- generated feedback Markdown passes the existing `readmates-feedback:v1` parser
- public-safe sections do not include forbidden local paths, emails, or token-shaped examples in fixtures

## Security And Public Safety

- The production app does not store or process raw transcript files in this design.
- Import files may contain real member names, so they should not be committed to the public repo.
- Server validation enforces host authorization and session membership boundaries.
- Public APIs continue to expose only records allowed by existing publication visibility rules.
- The design avoids adding browser-visible secrets or LLM provider credentials.

## Rollout

1. Add schema and server preview/commit tests.
2. Add the host import API and transactional persistence path.
3. Add the host editor import preview UI.
4. Add local generator documentation and a sample sanitized fixture.
5. Verify with targeted backend/frontend tests, then run the relevant full checks for the touched surfaces.

## Open Follow-Ups

- Add optional UI author correction if exact name matching proves too brittle.
- Add a CLI generator wrapper once the prompt workflow stabilizes.
- Consider a future in-app LLM generator only after key management, cost limits, audit logs, and transcript retention policy are designed.
