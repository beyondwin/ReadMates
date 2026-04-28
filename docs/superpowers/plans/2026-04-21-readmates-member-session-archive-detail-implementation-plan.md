# ReadMates Member Session Archive Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a member-only archived session detail page so `/app/archive` opens `/app/sessions/{sessionId}` instead of the guest public session page, while preserving `/sessions/{sessionId}` as the public showcase.

**Architecture:** Add a read-only archive session detail API under `GET /api/archive/sessions/{sessionId}`. The API returns same-club `PUBLISHED` session data, public publication content, club activity, current member records, attendance summary, and feedback document status. The frontend adds a new app route and component for desktop/mobile member session detail, then rewires archive session/review/question links to the new route.

**Tech Stack:** Kotlin/Spring Boot 4, JdbcTemplate, MySQL-compatible SQL, Next.js App Router, React, TypeScript, Vitest/Testing Library, Gradle, pnpm.

---

## Source Spec

- `docs/superpowers/specs/2026-04-21-readmates-member-session-archive-detail-design.md`

## Scope Rules

- Do not change the public guest `/sessions/{sessionId}` behavior except tests that prove it remains a guest page.
- Do not reuse current-session edit/save forms in the archived session detail.
- Do not weaken feedback document access. The new detail API returns document status only; document body still comes from `GET /api/sessions/{sessionId}/feedback-document`.
- Do not modify unrelated dirty files. Current known unrelated dirty paths include:
  - `design/src/mobile/pages-home.jsx`
  - `design/src/mobile/pages-session.jsx`
  - `design/standalone/mobile.html`
  - `front/features/current-session/components/current-session.tsx`
  - `front/features/member-home/components/member-home.tsx`
  - `front/shared/styles/mobile.css`
  - `front/shared/ui/top-nav.tsx`
  - `front/tests/unit/member-home.test.tsx`
- Do not commit `.superpowers/` brainstorm mockup output.

## File Structure

Backend:

- Modify `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
  - Add archived session detail DTOs and `GET /api/archive/sessions/{sessionId}`.
- Modify `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
  - Add detail query, child collection queries, feedback status query, and not-found/permission-safe handling.
- Add or modify backend tests:
  - Add detail tests to an existing archive controller DB test if one exists.
  - If no archive DB test file exists, create `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`.

Frontend:

- Modify `front/shared/api/readmates.ts`
  - Add `MemberArchiveSessionDetailResponse` and nested DTO types.
- Add `front/app/(app)/app/sessions/[sessionId]/page.tsx`
  - Fetch `/api/archive/sessions/{sessionId}` through `fetchBffWithHandledStatuses`.
  - Render not-found/unavailable state for 404.
- Add `front/features/archive/components/member-session-detail-page.tsx`
  - Render desktop and mobile archived-session detail.
- Modify `front/features/archive/components/archive-page.tsx`
  - Rewire session, review, and question links to app detail anchors.
- Modify `front/shared/ui/mobile-header.tsx`
  - Map `/app/sessions/` to mobile title `지난 세션` and back link `/app/archive`.
- Modify tests:
  - `front/tests/unit/archive-page.test.tsx`
  - New detail component/route tests in `front/tests/unit/member-session-detail-page.test.tsx`.
  - `front/tests/unit/responsive-navigation.test.tsx` or `app-route-layout.test.tsx` only if mobile header/nav behavior needs explicit coverage.

---

## Task 1: Backend RED Tests For Archived Session Detail

**Files:**
- Create or modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`

- [x] **Step 1: Locate the current archive/server test pattern**

Run:

```bash
rg -n "ArchiveController|/api/archive|feedbackDocument|session_feedback_documents" server/src/test/kotlin
```

Expected:
- If an archive DB-backed test class exists, extend it.
- If none exists, create `ArchiveControllerDbTest` with the same Spring test annotations and MySQL/Flyway setup used by nearby session API DB tests.

- [x] **Step 2: Add a happy-path detail test for an attended member**

Test request:

```kotlin
mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
    with(user("member5@example.com"))
}
```

Assert at minimum:

```kotlin
status { isOk() }
jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000000306") }
jsonPath("$.sessionNumber") { value(6) }
jsonPath("$.bookTitle") { value("가난한 찰리의 연감") }
jsonPath("$.bookAuthor") { value("찰리 멍거") }
jsonPath("$.date") { value("2026-04-15") }
jsonPath("$.attendance") { value(6) }
jsonPath("$.total") { value(6) }
jsonPath("$.myAttendanceStatus") { value("ATTENDED") }
jsonPath("$.publicHighlights").isArray
jsonPath("$.clubQuestions").isArray
jsonPath("$.clubCheckins").isArray
jsonPath("$.publicOneLiners").isArray
jsonPath("$.myQuestions").isArray
jsonPath("$.feedbackDocument.available") { value(true) }
jsonPath("$.feedbackDocument.readable") { value(true) }
```

- [x] **Step 3: Add a not-attended member feedback-lock test**

Pick or seed a member participant row for a published session with `attendance_status != 'ATTENDED'` while the session has a feedback document.

Assert:

```kotlin
status { isOk() }
jsonPath("$.bookTitle").exists()
jsonPath("$.feedbackDocument.available") { value(true) }
jsonPath("$.feedbackDocument.readable") { value(false) }
jsonPath("$.feedbackDocument.lockedReason") { value("NOT_ATTENDED") }
```

- [x] **Step 4: Add a host feedback-readable test**

Request the same session as the host:

```kotlin
mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
    with(user("host@example.com"))
}
```

Assert:

```kotlin
status { isOk() }
jsonPath("$.feedbackDocument.available") { value(true) }
jsonPath("$.feedbackDocument.readable") { value(true) }
```

- [x] **Step 5: Add missing, invalid, and unpublished tests**

Assert:

- Invalid UUID returns `400`.
- Missing UUID returns `404`.
- Same-club non-`PUBLISHED` session returns `404`.

- [x] **Step 6: Run backend test and confirm RED**

Run the narrow test:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests '*ArchiveControllerDbTest'
```

Expected:
- Fails because the new endpoint does not exist yet.

---

## Task 2: Backend DTOs, Controller, And Repository

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`

- [x] **Step 1: Add response DTOs**

Add DTOs near the existing archive DTOs:

```kotlin
data class MemberArchiveSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val locationLabel: String,
    val attendance: Int,
    val total: Int,
    val myAttendanceStatus: String,
    val publicSummary: String?,
    val publicHighlights: List<MemberArchiveHighlightItem>,
    val clubQuestions: List<MemberArchiveQuestionItem>,
    val clubCheckins: List<MemberArchiveCheckinItem>,
    val publicOneLiners: List<MemberArchiveOneLinerItem>,
    val myQuestions: List<MemberArchiveQuestionItem>,
    val myCheckin: MemberArchiveCheckinItem?,
    val myOneLineReview: MemberArchiveOneLineReview?,
    val myLongReview: MemberArchiveLongReview?,
    val feedbackDocument: MemberArchiveFeedbackDocumentStatus,
)
```

Also add:

- `MemberArchiveHighlightItem(text, sortOrder)`
- `MemberArchiveQuestionItem(priority, text, draftThought, authorName, authorShortName)`
- `MemberArchiveCheckinItem(authorName, authorShortName, readingProgress, note)`
- `MemberArchiveOneLinerItem(authorName, authorShortName, text)`
- `MemberArchiveOneLineReview(text)`
- `MemberArchiveLongReview(body)`
- `MemberArchiveFeedbackDocumentStatus(available, readable, lockedReason, title, uploadedAt)`

Use nullable `lockedReason`, `title`, and `uploadedAt`.

- [x] **Step 2: Add controller route**

In `ArchiveController`, add:

```kotlin
@GetMapping("/sessions/{sessionId}")
fun sessionDetail(
    authentication: Authentication?,
    @PathVariable sessionId: String,
): MemberArchiveSessionDetailResponse =
    archiveRepository.findArchiveSessionDetail(currentMember(authentication), parseSessionId(sessionId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
```

Add a private UUID parser that returns `400` for invalid ids.

- [x] **Step 3: Implement the session base query**

In `ArchiveRepository`, add `findArchiveSessionDetail(currentMember: CurrentMember, sessionId: UUID)`.

Base query requirements:

- `sessions.id = ?`
- `sessions.club_id = currentMember.clubId`
- `sessions.state = 'PUBLISHED'`
- left join current member's `session_participants` row for `myAttendanceStatus`
- count attended participants as `attendance`
- count all participants as `total`
- left join `public_session_publications` for nullable `publicSummary`, but do not require `is_public = true` for access to the app detail

If no row exists, return `null`.

- [x] **Step 4: Implement child collection queries**

Add private helpers:

- `findArchiveHighlights(jdbcTemplate, clubId, sessionId)`
- `findArchiveClubQuestions(jdbcTemplate, clubId, sessionId)`
- `findArchiveClubCheckins(jdbcTemplate, clubId, sessionId)`
- `findArchivePublicOneLiners(jdbcTemplate, clubId, sessionId)`
- `findArchiveMyQuestions(jdbcTemplate, currentMember, sessionId)`
- `findArchiveMyCheckin(jdbcTemplate, currentMember, sessionId)`
- `findArchiveMyOneLineReview(jdbcTemplate, currentMember, sessionId)`
- `findArchiveMyLongReview(jdbcTemplate, currentMember, sessionId)`

Ordering:

- highlights by `sort_order`
- club questions by `priority`, author name
- checkins by author name
- public one-liners by created time, author name
- my questions by `priority`

Filter empty checkin notes from `clubCheckins`.

- [x] **Step 5: Implement feedback status helper**

Helper behavior:

- Select latest document by highest `version`.
- If no document exists, return `available=false`, `readable=false`, `lockedReason="NOT_AVAILABLE"`, `title=null`, `uploadedAt=null`.
- If document exists and current member is host, return readable.
- If document exists and `myAttendanceStatus == "ATTENDED"`, return readable.
- Otherwise return `available=true`, `readable=false`, `lockedReason="NOT_ATTENDED"`.

Title should match the feedback detail title style:

```kotlin
"독서모임 ${sessionNumber}차 피드백"
```

- [x] **Step 6: Run backend tests and fix until GREEN**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests '*ArchiveControllerDbTest'
```

Then run relevant existing tests:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests '*FeedbackDocumentControllerTest' --tests '*CurrentSessionControllerDbTest'
```

Expected:
- New and adjacent tests pass.

---

## Task 3: Frontend Types And Route RED Tests

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Add: `front/tests/unit/member-session-detail-page.test.tsx`
- Add or modify: route test if the project already tests route pages.

- [x] **Step 1: Add TypeScript response types**

Add `MemberArchiveSessionDetailResponse` and nested item types to `front/shared/api/readmates.ts`, matching the backend DTOs.

- [x] **Step 2: Add component tests for readable feedback**

Create `front/tests/unit/member-session-detail-page.test.tsx`.

Render `MemberSessionDetailPage` with sample data where:

- `feedbackDocument.available = true`
- `feedbackDocument.readable = true`

Assert:

- book title and author render
- no `Join the reading` text appears
- `피드백 문서 열기` links to `/app/feedback/{sessionId}`
- `PDF 저장` links to `/app/feedback/{sessionId}/pdf`
- desktop and mobile shells both render

- [x] **Step 3: Add component tests for locked and missing feedback**

Locked feedback sample:

- `available = true`
- `readable = false`
- `lockedReason = "NOT_ATTENDED"`

Assert the lock copy appears and no feedback document link is present.

Missing feedback sample:

- `available = false`
- `readable = false`
- `lockedReason = "NOT_AVAILABLE"`

Assert missing copy appears.

- [x] **Step 4: Add empty my-records test**

Render with:

- `myQuestions = []`
- `myCheckin = null`
- `myOneLineReview = null`
- `myLongReview = null`

Assert:

```text
이 회차에 남긴 내 질문이나 서평이 없습니다.
```

- [x] **Step 5: Run the new frontend test and confirm RED**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm exec vitest run tests/unit/member-session-detail-page.test.tsx
```

Expected:
- Fails because component does not exist yet.

---

## Task 4: Frontend Member Session Detail Component

**Files:**
- Add: `front/features/archive/components/member-session-detail-page.tsx`
- Add: `front/app/(app)/app/sessions/[sessionId]/page.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`

- [x] **Step 1: Create the app route**

Add `front/app/(app)/app/sessions/[sessionId]/page.tsx`.

Behavior:

- Read `sessionId` from `params`.
- Fetch with `fetchBffWithHandledStatuses<MemberArchiveSessionDetailResponse>(path, [404])`.
- Render `<MemberSessionDetailPage session={session} />`.
- If the result is `{ ok: false, status: 404 }`, render the local unavailable state.
- Let other non-OK statuses throw through the existing BFF error path.

- [x] **Step 2: Implement top-level component split**

In `member-session-detail-page.tsx`, export:

```tsx
export default function MemberSessionDetailPage({ session }: { session: MemberArchiveSessionDetailResponse })
```

Render:

- `<main className="rm-member-session-detail-page">`
- `.desktop-only` desktop detail
- `.mobile-only` mobile detail

Also export a small unavailable component if the route needs it.

- [x] **Step 3: Implement desktop detail**

Desktop structure:

- compact header with `아카이브로` link
- book cover
- session kicker
- title
- meta line
- segment chips as anchor links to:
  - `#summary`
  - `#club-records`
  - `#my-records`
  - `#feedback`
- two-column body:
  - main content stack
  - right rail

Use existing primitives:

- `BookCover`
- `AvatarChip` if participant chips need avatars
- `formatDateLabel` or local date formatter
- `surface`, `surface-quiet`, `badge`, `row`, `row-between`, `stack`

- [x] **Step 4: Implement mobile detail**

Mobile structure:

- `m-body`
- compact hero section
- horizontal chip row with anchors
- single-column sections:
  - summary
  - club records
  - my records
  - feedback

Use existing mobile primitives:

- `m-sec`
- `m-hscroll`
- `m-chip`
- `m-card`
- `m-card-quiet`
- `m-list`
- `m-list-row`

- [x] **Step 5: Implement feedback state component**

Create a shared internal `FeedbackDocumentCard`.

States:

- readable: show `피드백 문서 열기` and `PDF 저장`
- locked: show `피드백 문서는 해당 회차 참석자에게만 공개됩니다.`
- missing: show `아직 등록된 피드백 문서가 없습니다.`

Use hrefs:

- `/app/feedback/${session.sessionId}`
- `/app/feedback/${session.sessionId}/pdf`

- [x] **Step 6: Implement empty states**

Show section-level empty states:

- summary missing: `공개 요약이 아직 정리되지 않았습니다.`
- club records missing: `아직 이 회차에 표시할 클럽 기록이 없습니다.`
- my records missing: `이 회차에 남긴 내 질문이나 서평이 없습니다.`

- [x] **Step 7: Update mobile header route mapping**

In `front/shared/ui/mobile-header.tsx`:

- `appTitle` returns `지난 세션` for paths starting with `/app/sessions/`.
- `appBackHref` returns `/app/archive` for paths starting with `/app/sessions/`.

- [x] **Step 8: Run component tests until GREEN**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm exec vitest run tests/unit/member-session-detail-page.test.tsx
```

Expected:
- New component tests pass.

---

## Task 5: Archive Link Rewiring And Tab Behavior

**Files:**
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`

- [x] **Step 1: Add link helpers**

In `archive-page.tsx`, add:

```tsx
function appSessionHref(sessionId: string, hash?: string) {
  return `/app/sessions/${encodeURIComponent(sessionId)}${hash ? `#${hash}` : ""}`;
}
```

Use it consistently for archive links.

- [x] **Step 2: Rewire By session links**

Desktop `SessionAction`:

- Change href from `/sessions/${session.id}` to `/app/sessions/${session.id}`.
- Keep unavailable `준비 중` behavior for unpublished sessions if such rows still appear.

Mobile session cards:

- Change href from `/sessions/${session.id}` to `/app/sessions/${session.id}`.

- [x] **Step 3: Make review and question cards navigable**

Desktop:

- Wrap review cards or add a clear `세션으로` link to `/app/sessions/{sessionId}#my-records`.
- For question rows, make row title or row itself link to `/app/sessions/{sessionId}#my-records`.

Mobile:

- Make review/question cards anchors to `/app/sessions/{sessionId}#my-records`.
- Preserve current visual classes.

- [x] **Step 4: Keep feedback document links unchanged**

Do not route feedback documents through the new session detail. Existing feedback tab actions remain:

- `/app/feedback/{sessionId}`
- `/app/feedback/{sessionId}/pdf`

- [x] **Step 5: Update archive tests**

Change expected session hrefs:

- `/sessions/session-6` -> `/app/sessions/session-6`
- `/sessions/session-1` -> `/app/sessions/session-1`

Add expectations:

- review card/link points to `/app/sessions/session-6#my-records`
- question card/link points to `/app/sessions/session-1#my-records`

- [x] **Step 6: Run archive tests until GREEN**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm exec vitest run tests/unit/archive-page.test.tsx
```

Expected:
- Archive tests pass with app session hrefs.

---

## Task 6: Public Session Regression Tests

**Files:**
- Modify: `front/tests/unit/public-session-page.test.tsx`

- [x] **Step 1: Add explicit guest CTA assertion**

In the existing `PublicSession` test, assert:

```ts
expect(screen.getByText("Join the reading")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "로그인 / 초대 수락" })).toHaveAttribute("href", "/login");
```

- [x] **Step 2: Add app-detail negative assertion**

If not already covered in `member-session-detail-page.test.tsx`, assert the new member detail never renders `Join the reading`.

- [x] **Step 3: Run public session tests**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm exec vitest run tests/unit/public-session-page.test.tsx tests/unit/member-session-detail-page.test.tsx
```

Expected:
- Guest page keeps the guest CTA.
- Member page excludes it.

---

## Task 7: Integration And Browser Verification

**Files:**
- Modify tests only if browser verification exposes layout or route gaps.

- [x] **Step 1: Run targeted frontend unit tests**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm exec vitest run \
  tests/unit/archive-page.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/public-session-page.test.tsx \
  tests/unit/responsive-navigation.test.tsx
```

- [x] **Step 2: Run targeted backend tests**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests '*ArchiveControllerDbTest' --tests '*FeedbackDocumentControllerTest'
```

- [x] **Step 3: Run app lint and build checks**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm lint
pnpm build
```

- [x] **Step 4: Browser smoke test desktop and mobile**

Start the local app if it is not already running:

```bash
cd <local-workspace>/ReadMates/front
pnpm dev
```

Validate desktop:

- Visit `http://localhost:3000/app/archive`.
- Click a published session `세션 열기`.
- Confirm URL is `/app/sessions/{sessionId}`.
- Confirm no `Join the reading` appears.
- Confirm feedback status is visible.

Validate mobile viewport:

- Use a mobile viewport around 390px wide.
- Visit `/app/archive`.
- Open a session card.
- Confirm mobile header says `지난 세션`.
- Confirm bottom tab bar remains app tabs.
- Confirm section chips do not overflow incoherently.

---

## Task 8: Final Review Checklist

- [x] Confirm no `.superpowers/` files are staged or committed.
- [x] Confirm public `/sessions/{sessionId}` still uses guest layout and guest CTA.
- [x] Confirm app `/app/sessions/{sessionId}` uses app layout and no guest CTA.
- [x] Confirm feedback document body remains protected by the existing feedback endpoint.
- [x] Confirm unrelated dirty files are not reverted or accidentally included.
- [x] Summarize tests run and any skipped checks in the final implementation response.
