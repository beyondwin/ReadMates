# ReadMates Book Images And Meeting URL Design

## Context

ReadMates already stores core session book metadata (`book_title`, `book_author`, `book_link`) and schedule metadata (`location_label`), but the host editor does not persist every field it shows. The current host editor has a book link input and schedule/meeting-looking inputs, yet create/update requests only send `title`, `bookTitle`, `bookAuthor`, and `date`. Several screens also render CSS or text-based book cover placeholders instead of a real cover image.

The product should now let the host register a book image URL while creating or editing a session. Registered images should replace the existing placeholder covers wherever a session book is shown. Seed sessions 1-6 should include real cover image URLs found during implementation through internet research.

The product is also moving away from Zoom-specific copy. Runtime pages, active frontend tests, active backend tests, server defaults, and dev seed data should not contain `Zoom`, `zoom`, or `줌`. The app should use neutral meeting copy because the actual meeting tool will be Google Meet, but the stored value should remain provider-agnostic.

## Goals

- Add a persisted `bookImageUrl` field to session data.
- Show a live book cover preview in the host session editor.
- Use registered book images on member, current-session, archive, and public record pages.
- Keep the existing CSS placeholder as a fallback when an image URL is empty or fails to load.
- Persist the host editor's existing book link input as `bookLink`.
- Persist meeting details from the schedule section:
  - `locationLabel`
  - `meetingUrl`
  - `meetingPasscode`
- Remove Zoom-specific wording from active app source, tests, server defaults, and dev seed data.
- Seed sessions 1-6 with verified book cover image URLs.
- Avoid exposing meeting URL or passcode on public pages.

## Non-Goals

- No image file upload or image storage service in this change.
- No server-side image proxying or resizing in this change.
- No automatic cover lookup inside the app UI.
- No Google Meet-specific database field names.
- No public exposure of private meeting details.
- No broad rewrite of historical design/planning documents that are not runtime pages or active tests.

## Recommended Approach

Use URL-based cover registration with live preview.

This fits the current product shape: hosts already enter book metadata by hand, the frontend is a Next app, and the backend stores session metadata in PostgreSQL. File upload would require a storage strategy, MIME validation, file serving, and cleanup rules. That is unnecessary for the current need. A URL string with a resilient visual fallback gives the host the desired control while keeping the change small and reversible.

The same pass should make the existing book link and meeting inputs real persisted fields. Leaving them as display-only inputs would make the host editor misleading and would create another partial data path.

## Data Model

Add a migration that extends `sessions`:

- `book_image_url varchar(1000)`
- `meeting_url varchar(1000)`
- `meeting_passcode varchar(255)`

Existing columns stay in place:

- `book_link varchar(500)`
- `location_label varchar(255) not null`

`location_label` remains required at the database layer. API requests may omit it for backward compatibility, but repository code should normalize missing or blank values to `온라인`. Optional URL fields are stored as nullable strings after trimming; blank input becomes `null`.

The migration should be additive so existing data remains valid.

## Backend API

Extend `HostSessionRequest`:

- required:
  - `title`
  - `bookTitle`
  - `bookAuthor`
  - `date`
- optional:
  - `bookLink`
  - `bookImageUrl`
  - `locationLabel`
  - `meetingUrl`
  - `meetingPasscode`

Create and update endpoints should write all fields:

- `POST /api/host/sessions`
- `PATCH /api/host/sessions/{sessionId}`

Extend host/current-session responses:

- `CreatedSessionResponse`
- `HostSessionDetailResponse`
- `CurrentSessionDetail`

Fields to include:

- `bookLink`
- `bookImageUrl`
- `locationLabel`
- `meetingUrl`
- `meetingPasscode`

Extend archive/public book responses with `bookImageUrl` only:

- `ArchiveSessionItem`
- `PublicSessionListItem`
- `PublicSessionDetailResponse`

Do not add `meetingUrl` or `meetingPasscode` to public API DTOs. Those are member-only operational details.

Validation should stay pragmatic:

- Required strings must be non-blank after trimming.
- `locationLabel` should become `온라인` when omitted or blank.
- Optional URL fields can be nullable and should be length-limited by the DB schema.
- Server-side URL syntax validation is not required in the first pass because existing book links are also flexible. Frontend placeholders and labels should guide hosts toward valid HTTPS URLs.

## Seed Data

Update `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` for sessions 1-6:

- Add `book_image_url` values to the seed CTE.
- Preserve or add `book_link` values when reliable book detail pages are found.
- Keep `location_label` as `온라인` or another Zoom-free neutral value.
- Keep `meeting_url` and `meeting_passcode` null for historical sessions unless there is a real safe value to seed.

During implementation, cover image URLs should be selected through internet research. Prefer stable HTTPS cover URLs from publisher, bookstore, library, or book metadata pages. Avoid signed, expiring, tracking-heavy, or session-bound URLs. Store only URLs, not image binaries.

## Frontend Data Flow

Update `front/shared/api/readmates.ts` types to match the backend DTOs.

In `HostSessionEditor`:

- Convert `bookLink`, `bookImageUrl`, `locationLabel`, `meetingUrl`, and `meetingPasscode` to controlled state.
- Include those fields in POST/PATCH payloads.
- Add a `책 이미지 URL` field in the Basics panel.
- Keep `책 링크` in the Basics panel and make it persist.
- Add a compact cover preview beside or below the book metadata.
- Show the real image when `bookImageUrl` is present.
- Fall back to the existing placeholder when empty or broken.

In member/current-session UI:

- Display the registered book cover instead of the placeholder where a cover is shown.
- If `meetingUrl` exists, show a `미팅 입장` link in member-visible session surfaces.
- If `meetingPasscode` exists, show it as supporting text next to the meeting link.
- Continue to show `locationLabel` in the schedule metadata.

In archive/public UI:

- Use `bookImageUrl` for cover visuals.
- Keep public pages free of meeting URL and passcode.
- Preserve existing card layout and typography; this is a data/rendering enhancement, not a redesign.

## Shared Book Cover Component

Create or reuse a small shared component for covers so the fallback behavior is consistent.

Suggested interface:

- `title`
- `author`
- `imageUrl`
- `width` or className/style hook

Behavior:

- If `imageUrl` is non-empty, render an `<img>` with `alt="{title} 표지"`.
- Use `object-fit: cover`, stable aspect ratio, and rounded corners matching current cover treatment.
- If image loading fails, hide the image and render the existing placeholder treatment with title/author where appropriate.
- For purely decorative compact covers, the wrapper may be `aria-hidden`, but meaningful cover images should have an accessible alt.

Use a normal `<img>` initially. That avoids Next image remote-domain configuration churn and supports arbitrary host-provided URLs.

## Copy Changes

Runtime source and active tests should use neutral copy:

- `장소 / 줌 링크` -> `장소`
- `Zoom / 미팅 URL` -> `미팅 URL`
- `online · Zoom` -> `온라인`
- `Zoom 링크` -> `미팅 URL`
- `책·일정·Zoom 링크` -> `책·일정·미팅 URL`
- `참석 확정 · Zoom 링크 공유` -> `참석 확정 · 미팅 URL 공유`

After implementation, `rg "Zoom|zoom|줌" front server README.md` should return no active runtime/test hits. Historical docs under `docs/superpowers` may still contain old planning context unless a separate documentation cleanup is requested.

## Error Handling

- Empty optional fields are saved as `null`.
- Broken image URLs should not break a page; render the placeholder cover.
- Failed session save should keep the current toast behavior.
- Missing `meetingUrl` should simply omit the `미팅 입장` action.
- Missing `meetingPasscode` should omit passcode text.
- Public pages should never render private meeting details even if backend data exists.

## Testing

Backend tests:

- Host create stores and returns `bookLink`, `bookImageUrl`, `locationLabel`, `meetingUrl`, and `meetingPasscode`.
- Host update changes those fields.
- Current session response includes cover and meeting fields for members.
- Public responses include `bookImageUrl` and do not include meeting fields.
- Dev seed integrity covers sessions 1-6 having non-empty `book_image_url`.
- Server default location no longer contains Zoom.

Frontend tests:

- Host editor POST/PATCH payload includes the new persisted fields.
- Host editor shows cover preview for `bookImageUrl`.
- Host editor uses `장소` and `미팅 URL` labels without Zoom wording.
- Member/current-session surfaces show `미팅 입장` only when `meetingUrl` exists.
- Archive/public cover rendering uses image URLs and keeps fallback for empty/broken values.
- Active frontend tests contain no Zoom-specific expected text.

Verification:

- Run relevant frontend unit tests.
- Run relevant backend tests around host sessions, current session, archive, public APIs, and seed data.
- Run `rg "Zoom|zoom|줌" front server README.md` and confirm no active source/test hits remain.

## Rollout

This is an additive DB/API/frontend change. Existing rows get null cover/meeting URLs and continue rendering through fallback UI. Dev seed rows for sessions 1-6 gain cover image URLs so local/demo environments immediately show real covers.

No data backfill is required for production beyond optionally entering image URLs for existing sessions through the host editor after deployment.
