# ReadMates Session Feedback Document Design

## Context

Before this migration, ReadMates had a partial member-level upload implementation built around `feedback_reports`: host uploads were one HTML file per member, members saw their own uploaded file, and the BFF forwarded HTML/CSP/disposition headers. That surface is superseded by the session-level feedback document model described here.

A feedback document is now a session-level artifact: one document contains feedback for every attendee in that session, and every attendee of that session can read the same document. The host will keep generating the feedback manually with AI, but the generated output should be Markdown-like structured text rather than styled HTML. The ReadMates app makes it look native on screen and provides a PDF save path.

The six source documents from `recode/feedback` have been converted into checked-in dev seed SQL content for sessions 1-6. Runtime does not depend on the ignored `recode/feedback` files or on a user-local Downloads path. The source documents already have stable semantic sections: metadata, observer notes, participant blocks, participation style, concrete contributions, problems/self-contradictions, action items, and one revealing quote. The prompt has been updated to output a stable `readmates-feedback:v1` Markdown structure that the app can parse without trusting arbitrary HTML.

## Goals

- Let a host upload one `.md` or `.txt` feedback document per session.
- Seed the real session 1-6 feedback documents so hosts and attended members can verify the feature with actual data.
- Make the document visible only to the host and members who attended that session.
- Render the document as a native ReadMates page, not as uploaded HTML or an iframe.
- Preserve the existing editorial ReadMates tone: compact page header, restrained typography, line-based sections, quiet surfaces, and mobile-first readability.
- Let users save the feedback as PDF from a print-optimized view.
- Keep the AI output focused on meaning and structure. Styling belongs to the app.
- Remove or refactor old member-level uploaded-HTML copy, APIs, tests, and frontend types that would keep the deprecated product model visible.

## Non-Goals

- No automatic AI feedback generation inside ReadMates.
- No arbitrary uploaded HTML rendering for the new session feedback document.
- No per-member private feedback splitting in this feature.
- No public access to feedback documents.
- No rich in-app editor for rewriting sections after upload.
- No one-click server-generated PDF in the first version.

## Recommended Approach

Create a new session-level feedback document model instead of repurposing `feedback_reports`.

The existing table represents a different product shape: member-level HTML files with `membership_id`, `content_type = 'text/html'`, and versioning per member. Reusing it would make access checks, dashboard counts, and UI labels misleading. A new table keeps the new model clear and lets the old partial code be removed or left isolated during migration.

## Data Model

Add a table named `session_feedback_documents`.

Fields:

- `id`
- `club_id`
- `session_id`
- `version`
- `source_text`
- `file_name`
- `content_type`
- `file_size`
- `created_at`
- `updated_at`

Constraints:

- `session_id, club_id` references `sessions`.
- `version > 0`.
- `source_text` and `file_name` are non-empty.
- `file_name` cannot contain path separators.
- `content_type` is one of `text/markdown`, `text/plain`, or a normalized internal value for Markdown text.
- Unique latest history is represented by `(session_id, version)`, with latest selected by highest version.

The active product behavior is "one current document per session", but keeping versions is useful for replacement history. Storing UTF-8 Markdown text directly in the database keeps host uploads, seeded demo content, parsing, and rendering on one path and avoids local file path drift.

## Backend API

Host endpoints:

- `POST /api/host/sessions/{sessionId}/feedback-document`
  - Multipart upload field: `file`.
  - Accept `.md` and `.txt`.
  - Validate non-empty, safe filename, reasonable size, UTF-8 readable text, `<!-- readmates-feedback:v1 -->` marker, and required headings.
  - Store the raw Markdown text and create a new version.
  - Return document metadata and parsed summary.

- `GET /api/host/sessions/{sessionId}/feedback-document`
  - Host-only metadata and raw parse status for the session editor.

Member/host endpoints:

- `GET /api/sessions/{sessionId}/feedback-document`
  - Returns parsed JSON used by the native viewer.
  - Host can read any club session document.
  - Member can read only if `session_participants.attendance_status = 'ATTENDED'` for that session.

- `GET /api/sessions/{sessionId}/feedback-document/source`
  - Optional raw Markdown download for host/debug only. Do not expose to normal members in the first UI.

PDF flow:

- `GET /app/feedback/{sessionId}/print` is a frontend route using the same parsed document.
- The `PDF로 저장` button opens the print route and triggers browser print.
- Print CSS hides navigation/buttons and formats the document for A4-style output.
- The browser's save-as-PDF flow produces the PDF. This avoids adding server PDF libraries and Korean font packaging in the first implementation.

If true one-click PDF binary download becomes required later, add a dedicated PDF renderer with embedded Korean fonts as a second phase.

## Parser Contract

The app treats the upload as structured Markdown, not arbitrary Markdown.

Required marker:

- `<!-- readmates-feedback:v1 -->`

Required top-level sections:

- `# 독서모임 N차 피드백`
- `## 메타`
- `## 관찰자 노트`
- `## 참여자별 피드백`

Required participant shape:

- `### 01. 이름`
- `역할: ...`
- `#### 참여 스타일`
- `#### 실질 기여`
- `#### 문제점과 자기모순`
- `#### 실천 과제`
- `#### 드러난 한 문장`

The parser returns a typed document:

- title
- session label
- book/date subtitle
- metadata list
- observer note paragraphs
- participants
- participant role
- style paragraphs
- contribution list
- problem list with title, core, evidence, interpretation
- action item list
- revealing quote, context, note

Rendering should use React text nodes and typed fields, not `dangerouslySetInnerHTML`.

## Frontend Experience

### Member List Entry

On `/app/me` and the archive feedback tab, replace file-name-centric legacy rows with session-centric rows:

- `No.01`
- `팩트풀니스 · 2025.11.26`
- `회차 피드백 문서`
- Actions: `읽기`, `PDF로 저장`

Empty state remains quiet and direct:

- `아직 열람 가능한 피드백 문서가 없습니다.`

### Feedback Detail Page

Add the member-visible route `/app/feedback/{sessionId}`.

Layout:

- Header uses `page-header-compact`.
- Eyebrow: `Feedback report`.
- H1: `독서모임 N차 피드백`.
- Supporting line: `책 제목 · YYYY.MM.DD`.
- Actions: `PDF로 저장` and a back link.

Body:

- Use the existing `container` width and editorial typography.
- Avoid nested cards.
- Use line dividers for major sections.
- `관찰자 노트` appears near the top in a quiet surface or unframed text block.
- Participant sections are vertical by default.
- Desktop may show a sticky participant table of contents in a right rail.
- Mobile shows participant jump chips above the first participant.
- Problem items get stronger hierarchy through typography and spacing, not a foreign visual style.
- Quotes render as native block quote sections with context and timestamp.

This keeps the page aligned with archive and notes-feed pages, rather than making it feel like an AI-generated report pasted into the app.

### Host Session Editor

Replace the current "개인 피드백 리포트 (HTML)" panel with "회차 피드백 문서".

Panel behavior:

- Explain that one Markdown/text document is shared with attendees of the session.
- File input accepts `.md,.txt`.
- Show upload status: `미등록`, `업로드 완료`, `교체 가능`.
- Show latest filename and uploaded timestamp.
- Actions:
  - `파일 선택`
  - `업로드`
  - `미리보기`
  - `교체`

The report target list should no longer show one row per member. Attendance still matters for access, but the uploaded artifact is session-level.

### Host Dashboard

Update `feedbackPending` semantics:

- Count closed/published sessions that have at least one attended participant and no session feedback document.
- Do not count one missing report per attendee.

Label:

- `피드백 문서 등록 대기`

Hint:

- `회차별 문서 확인`

## Access Rules

- Anonymous users cannot access feedback endpoints.
- A host can upload, replace, preview, and read feedback documents for their club.
- A member can read only if they attended the target session.
- A member who RSVP'd but did not attend cannot read the feedback document.
- Public pages never expose feedback documents.
- BFF should proxy JSON and text responses normally; no uploaded HTML is rendered.

## Error Handling

Upload errors:

- Empty file: `피드백 문서가 비어 있습니다.`
- Unsupported extension/content: `.md 또는 .txt 파일만 업로드할 수 있습니다.`
- Invalid UTF-8: `문서를 UTF-8 텍스트로 읽을 수 없습니다.`
- Missing marker/headings: `ReadMates 피드백 템플릿 형식이 아닙니다.`
- Session not found: 404.
- Not host: 403.

Viewer errors:

- No document: show quiet empty state with no broken layout.
- Not attended: 403 route-level state.
- Parse failure on an existing document: show host-facing "문서 형식 확인 필요"; members see a generic unavailable state.

## Testing

Backend tests:

- Host can upload `.md` feedback document for a session.
- Upload rejects empty, unsafe filename, unsupported type, missing marker, missing required headings.
- Latest document selection returns the highest version.
- Host can read any session feedback document in the club.
- Attended member can read the document.
- Non-attending member cannot read the document.
- Dashboard pending count is session-level, not attendee-level.

Frontend unit tests:

- Parser converts the `readmates-feedback:v1` sample into typed data.
- Parser rejects missing required sections.
- My page and archive rows show session title/date instead of raw filenames.
- Detail page renders observer notes, participants, problem items, action items, and revealing quotes.
- Host editor shows the session-level upload panel and not per-member report rows.

E2E or integration checks:

- Host uploads a sample `.md` feedback document.
- Attended member sees it in My page/archive and opens the detail page.
- Non-attending member cannot open the detail page.
- Print/PDF route hides app navigation and action buttons.

## Migration Notes

The legacy `feedback_reports` implementation is superseded by `session_feedback_documents` for this feature.

The implementation must actively clean up the old member-level uploaded-HTML surface so new code and tests do not keep two competing report models alive. Remove or refactor:

- `HostReportController`
- `ReportController`
- per-member `ReportListItem`
- host editor copy that references HTML
- tests that assert legacy uploaded-HTML behavior, replacing them with session feedback document tests
- frontend links to `/api/reports/me`, `/api/reports/{reportId}/content`, and `/api/host/reports`
- dashboard and host-session detail queries that count missing per-attendee `feedback_reports`
- README statements that describe legacy uploaded-HTML handling as the current report model

The ignored `recode/feedback` files are source artifacts only. All six source documents are represented in checked-in dev seed SQL as `readmates-feedback:v1` session feedback documents, so local/demo runtime reads from the database seed and never from ignored source files.

For local/demo data, seed sessions 1-6 into `session_feedback_documents` from checked-in SQL content derived from the approved Markdown files, not from the ignored `recode/` directory or a user Downloads path.

## Decisions

- The first version uses the label `PDF로 저장` because it opens the browser save-as-PDF flow instead of returning a server-generated PDF binary.
- True one-click PDF binary generation is deferred to a later phase.
