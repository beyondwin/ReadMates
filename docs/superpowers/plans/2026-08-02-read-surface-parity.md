# ReadMates Read-Surface Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render guest and viewer record surfaces with the regular-member presentation, keep every write control visible but disabled, and keep feedback documents inaccessible while preserving the current guest personal-space preview.

**Architecture:** Keep the anonymous guest public API and authenticated member API as separate data lanes. Normalize each response into small feature-owned read-view contracts plus shared capability flags, then pass those contracts to the existing member renderers. UI components render one structure for every audience; capabilities control enabled state and feedback locking without exposing member-only fields through the guest lane.

**Tech Stack:** React 19, TypeScript, React Router 7 loaders, TanStack Query 5, Vitest, Testing Library, Playwright, Vite, pnpm 11.13.1 via Corepack.

**Approved Design:** `docs/superpowers/specs/2026-08-02-read-surface-parity-design.md`

## Global Constraints

- Anonymous `GUEST` requests continue to use `/api/public/clubs/:slug/browse/**`; authenticated `VIEWER`, `MEMBER`, and `HOST` requests continue to use protected member APIs.
- Do not add server, BFF, Flyway, database, or guest DTO fields in this implementation.
- Guest responses must not expose membership/account IDs, email, exact location, meeting URL/passcode, personalized `my*` data, or feedback metadata/body.
- Home, current session, notes, archive, and session detail use the regular-member information hierarchy and presentation.
- Guest and viewer RSVP, progress, question, one-line review, long-review, add, remove, and save controls remain rendered but disabled; event handlers must also reject writes.
- Feedback is the only public-record content section that remains inaccessible to guest/viewer audiences.
- `/app/me` keeps `GuestMySpace`; notifications and settings keep their existing account-required locked behavior.
- Remove the persistent guest header actions and general-page conversion cards; keep conversion only inside `GuestMySpace` and after an explicit locked action.
- Preserve current guest partial-widget errors, bounded `Retry-After`, cursor pagination, session selection, note filters, route continuity, safe `returnTo`, and reduced-motion behavior.
- Keep UI modules prop/callback driven and free of API/query/route imports.
- Add failing tests before production changes and make narrow commits after each task.
- Do not persist real member data, private domains, deployment state, local absolute paths, secrets, or token-shaped examples.

---

## File Structure

### New files

- `front/shared/model/read-surface-capabilities.ts`
  - Audience-neutral `ReadSurfaceCapabilities` contract and immutable guest/viewer/member capability constants.
- `front/shared/model/read-surface-capabilities.test.ts`
  - Exact capability invariant tests.
- `front/features/current-session/model/current-session-read-view.ts`
  - Safe current-session presentation types plus member and guest adapters.
- `front/features/current-session/model/current-session-read-view.test.ts`
  - Member/guest normalization, forbidden-field, and transient attendee-key tests.
- `front/features/member-home/model/member-home-read-view.ts`
  - Member and guest home normalization into the single `MemberHome` renderer contract.
- `front/features/member-home/model/member-home-read-view.test.ts`
  - Home parity and no-fabricated-personal-state tests.
- `front/features/archive/model/archive-read-view.ts`
  - Guest archive page to regular archive-page props adapter and generic feedback-lock state.
- `front/features/archive/model/archive-read-view.test.ts`
  - Archive mapping and no-feedback-metadata tests.
- `front/features/archive/model/session-detail-read-view.ts`
  - Member and guest historical-session detail adapters.
- `front/features/archive/model/session-detail-read-view.test.ts`
  - Public section parity, personal-data omission, and feedback-lock tests.

### Modified files

- `front/features/current-session/model/current-session-view-model.ts`
  - Accept explicit read-surface capabilities and keep viewer/guest writes blocked.
- `front/features/current-session/ui/current-session-types.ts`
  - Re-export the feature-owned read-view types used by existing UI modules.
- `front/features/current-session/ui/current-session-page.tsx`
  - Remove `ViewerSessionReadOnly`; render the regular edit form inside a disabled fieldset.
- `front/features/current-session/ui/current-session-panels.tsx`
  - Support nullable safe location/meeting fields and transient attendee keys.
- `front/features/current-session/ui/mobile/current-session-mobile-board.tsx`
  - Remove viewer-only prep/record branches and use normal mobile segments with `canWrite=false`.
- `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
  - Keep the regular controls rendered and disabled for guest/viewer audiences.
- `front/features/current-session/ui/mobile/mobile-records-segment.tsx`
  - Remove the viewer-only record presentation and retain disabled regular controls.
- `front/features/current-session/route/current-session-route.tsx`
  - Adapt protected member data before rendering.
- `front/features/guest-browse/model/guest-read-views.ts`
  - Produce shared notes and page read views without changing public API contracts.
- `front/features/guest-browse/route/guest-scoped-app-route.tsx`
  - Compose guest loaders with member presentation components.
- `front/features/guest-browse/route/guest-route-data.ts`
  - Preserve loader boundaries while returning adapter-ready public data.
- `front/features/guest-browse/ui/guest-surfaces.tsx`
  - Remove replaced guest page renderers and conversion prompts; retain only guest-specific error/load-more primitives still needed by routes.
- `front/features/member-home/model/member-home-view-model.ts`
  - Consume normalized nullable personal state instead of raw auth/API contracts.
- `front/features/member-home/ui/member-home.tsx`
  - Render the same home structure from `MemberHomeReadView` for every audience.
- `front/features/member-home/ui/member-home-current-session.tsx`
  - Render missing private guest values safely and disable private actions.
- `front/features/member-home/ui/prep-card.tsx`
  - Use nullable safe meeting/location fields without exposing protected values.
- `front/features/member-home/ui/member-home-records.tsx`
  - Use response-local attendee keys rather than membership IDs.
- `front/src/pages/app-home.tsx`
  - Adapt protected loader data into `MemberHomeReadView`.
- `front/shared/model/notes-feed-model.ts`
  - Allow nullable public avatar keys without inventing an avatar identifier.
- `front/features/guest-browse/ui/guest-account-control.tsx`
  - Delete after all shell call sites and tests are removed.
- `front/src/app/layouts/app-route-layout.tsx`
  - Stop injecting persistent guest account controls into desktop/mobile headers.
- `front/src/styles/globals.css`
  - Remove only unused guest-account-control styles; retain lock and personal-space styles.
- `front/features/archive/ui/archive-page-shell.tsx`
  - Accept read capabilities and a route-provided locked-feedback action.
- `front/features/archive/ui/archive-desktop.tsx`
  - Keep the report tab visible but show a generic lock without reading report data when feedback is forbidden.
- `front/features/archive/ui/archive-mobile.tsx`
  - Mirror desktop archive feedback locking.
- `front/features/archive/route/archive-list-route.tsx`
  - Pass member capabilities to the shared archive renderer.
- `front/features/archive/ui/member-session-detail-page.tsx`
  - Render `SessionDetailReadView` for member and guest data.
- `front/features/archive/route/member-session-detail-route.tsx`
  - Adapt protected detail data before rendering.
- `front/features/guest-browse/ui/guest-shell.test.tsx`
- `front/features/guest-browse/ui/guest-surfaces.test.tsx`
- `front/features/guest-browse/route/guest-scoped-app-route.test.tsx`
- `front/features/current-session/model/current-session-view-model.test.ts`
- `front/features/current-session/ui/current-session-review-visibility.test.tsx`
- `front/features/member-home/ui/member-home-current-session.test.tsx`
- `front/features/member-home/ui/member-home-records.test.tsx`
- `front/tests/unit/current-session.test.tsx`
- `front/tests/unit/member-home.test.tsx`
- `front/tests/unit/notes-feed-page.test.tsx`
- `front/tests/unit/archive-page.test.tsx`
- `front/tests/unit/member-session-detail-page.test.tsx`
- `front/tests/unit/spa-layout.test.tsx`
- `front/tests/e2e/guest-browsing.spec.ts`
- `front/tests/e2e/google-auth-viewer.spec.ts`
- `front/tests/e2e/member-profile-permissions.spec.ts`
- `CHANGELOG.md`
  - Record the audience presentation/permission behavior change under `Unreleased`.

---

### Task 1: Introduce capability and current-session read-view contracts

**Files:**
- Create: `front/shared/model/read-surface-capabilities.ts`
- Create: `front/shared/model/read-surface-capabilities.test.ts`
- Create: `front/features/current-session/model/current-session-read-view.ts`
- Create: `front/features/current-session/model/current-session-read-view.test.ts`
- Modify: `front/features/current-session/ui/current-session-types.ts`

**Interfaces:**
- Consumes: `CurrentSessionResponse` from `front/shared/model/current-session-contracts.ts` and the structural guest current-session response from `front/features/guest-browse/api/guest-browse-contracts.ts`.
- Produces:
  - `ReadSurfaceCapabilities`
  - `GUEST_READ_SURFACE_CAPABILITIES`
  - `VIEWER_READ_SURFACE_CAPABILITIES`
  - `MEMBER_READ_SURFACE_CAPABILITIES`
  - `readSurfaceCapabilitiesForAuth(auth)`
  - `CurrentSessionReadView`
  - `CurrentSessionReadPageData`
  - `memberCurrentSessionReadPage(response, capabilities)`
  - `guestCurrentSessionReadPage(response)`

- [x] **Step 1: Write failing capability tests**

```ts
import { describe, expect, it } from "vitest";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  MEMBER_READ_SURFACE_CAPABILITIES,
  readSurfaceCapabilitiesForAuth,
  VIEWER_READ_SURFACE_CAPABILITIES,
} from "./read-surface-capabilities";

describe("read surface capabilities", () => {
  it("keeps guest and viewer controls visible but non-writable and feedback-locked", () => {
    expect(GUEST_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: false,
      canReadFeedback: false,
      canViewPersonalState: false,
    });
    expect(VIEWER_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: false,
      canReadFeedback: false,
      canViewPersonalState: true,
    });
  });

  it("keeps active member writing and feedback capability available", () => {
    expect(MEMBER_READ_SURFACE_CAPABILITIES).toEqual({
      canWrite: true,
      canReadFeedback: true,
      canViewPersonalState: true,
    });
  });

  it("derives protected viewer and suspended access without upgrading either audience", () => {
    expect(readSurfaceCapabilitiesForAuth({ membershipStatus: "VIEWER", approvalState: "VIEWER" }))
      .toEqual(VIEWER_READ_SURFACE_CAPABILITIES);
    expect(readSurfaceCapabilitiesForAuth({ membershipStatus: "SUSPENDED", approvalState: "SUSPENDED" }))
      .toEqual({ canWrite: false, canReadFeedback: false, canViewPersonalState: true });
  });
});
```

- [x] **Step 2: Run the capability test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/model/read-surface-capabilities.test.ts
```

Expected: FAIL because `read-surface-capabilities.ts` does not exist.

- [x] **Step 3: Implement the immutable capability contract**

```ts
export type ReadSurfaceCapabilities = Readonly<{
  canWrite: boolean;
  canReadFeedback: boolean;
  canViewPersonalState: boolean;
}>;

export const GUEST_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: false,
  canReadFeedback: false,
  canViewPersonalState: false,
});

export const VIEWER_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: false,
  canReadFeedback: false,
  canViewPersonalState: true,
});

export const MEMBER_READ_SURFACE_CAPABILITIES: ReadSurfaceCapabilities = Object.freeze({
  canWrite: true,
  canReadFeedback: true,
  canViewPersonalState: true,
});

export function readSurfaceCapabilitiesForAuth(auth: {
  membershipStatus: string | null;
  approvalState: string | null;
}): ReadSurfaceCapabilities {
  if (auth.membershipStatus === "ACTIVE" && auth.approvalState === "ACTIVE") {
    return MEMBER_READ_SURFACE_CAPABILITIES;
  }
  if (auth.membershipStatus === "VIEWER") {
    return VIEWER_READ_SURFACE_CAPABILITIES;
  }
  return Object.freeze({ canWrite: false, canReadFeedback: false, canViewPersonalState: true });
}
```

- [x] **Step 4: Write failing member/guest current-session adapter tests**

Add tests that construct one protected response and one guest response with the same public book, attendee, question, and review content. Assert:

```ts
const memberView = memberCurrentSessionReadPage(memberResponse, VIEWER_READ_SURFACE_CAPABILITIES);
const guestView = guestCurrentSessionReadPage(guestResponse);

expect(guestView.currentSession).toMatchObject({
  bookTitle: memberView.currentSession?.bookTitle,
  board: memberView.currentSession?.board,
  capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  myRsvpStatus: null,
  myCheckin: null,
  myQuestions: [],
  myOneLineReview: null,
  myLongReview: null,
  locationLabel: null,
  meetingUrl: null,
  meetingPasscode: null,
});
expect(JSON.stringify(guestView)).not.toMatch(/membershipId|accountName/);
for (const protectedValue of ["Room 7", "https://meet.example.com/secret", "2468"]) {
  expect(JSON.stringify(guestView)).not.toContain(protectedValue);
}
expect(guestView.currentSession?.attendees[0].renderKey).toBe("guest-0-읽는이-book");
```

- [x] **Step 5: Run the adapter test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/current-session/model/current-session-read-view.test.ts
```

Expected: FAIL because the read-view types and adapter functions do not exist.

- [x] **Step 6: Implement the read-view types and adapters**

Define the presentation contract with nullable protected values and response-local attendee keys:

```ts
export type CurrentSessionReadAttendee = {
  renderKey: string;
  avatarKey: string;
  displayName: string;
  role: "HOST" | "MEMBER" | null;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  participationStatus: SessionParticipationStatus;
};

export type CurrentSessionQuestion = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
};

export type CurrentSessionLongReview = {
  authorName: string;
  authorShortName: string;
  avatarKey: string;
  body: string;
};

export type CurrentSessionReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string | null;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  questionDeadlineAt: string;
  myRsvpStatus: RsvpStatus | null;
  myCheckin: { readingProgress: number } | null;
  myQuestions: CurrentSessionQuestion[];
  myOneLineReview: { text: string } | null;
  myLongReview: { body: string } | null;
  board: {
    questions: CurrentSessionQuestion[];
    longReviews: CurrentSessionLongReview[];
  };
  attendees: CurrentSessionReadAttendee[];
  capabilities: ReadSurfaceCapabilities;
};

export type CurrentSessionReadPageData = {
  currentSession: CurrentSessionReadView | null;
};

export type GuestCurrentSessionReadSource = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookLink: string | null;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    questionDeadlineAt: string;
    attendees: Array<{
      displayName: string;
      avatarKey: string;
      rsvpStatus: string;
      attendanceStatus: string;
    }>;
    board: {
      questions: CurrentSessionQuestion[];
      longReviews: Array<{
        title: string;
        content: string;
        authorName: string;
        authorShortName: string;
        avatarKey: string;
      }>;
    };
  };
};

export type MemberCurrentSessionReadPage = (
  response: CurrentSessionResponse,
  capabilities: ReadSurfaceCapabilities,
) => CurrentSessionReadPageData;

export type GuestCurrentSessionReadPage = (
  response: GuestCurrentSessionReadSource,
) => CurrentSessionReadPageData;
```

Export concrete `memberCurrentSessionReadPage` and `guestCurrentSessionReadPage` functions satisfying those signatures. The member adapter uses `membershipId` only to populate `renderKey` and never retains account data. The guest adapter uses `guest-${index}-${displayName}-${avatarKey}`, maps unknown RSVP/attendance strings through guards to `NO_RESPONSE`/`UNKNOWN`, sets guest participation to `ACTIVE`, and sets protected/personal fields to `null` or empty arrays. Add invalid guest status fixtures to the adapter test so no unchecked `as RsvpStatus`/`as AttendanceStatus` cast is accepted.

- [x] **Step 7: Re-export the read-view types for existing UI imports**

Change `current-session-types.ts` to import and re-export `CurrentSessionReadView` as `CurrentSession` and derive `RsvpUpdateStatus` from non-null RSVP values:

```ts
export type { CurrentSessionReadView as CurrentSession } from "@/features/current-session/model/current-session-read-view";
export type RsvpUpdateStatus = "GOING" | "MAYBE" | "DECLINED";
```

- [x] **Step 8: Run focused GREEN tests and type checking through the frontend test runner**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  shared/model/read-surface-capabilities.test.ts \
  features/current-session/model/current-session-read-view.test.ts
```

Expected: PASS.

- [x] **Step 9: Commit Task 1**

```bash
git add \
  front/shared/model/read-surface-capabilities.ts \
  front/shared/model/read-surface-capabilities.test.ts \
  front/features/current-session/model/current-session-read-view.ts \
  front/features/current-session/model/current-session-read-view.test.ts \
  front/features/current-session/ui/current-session-types.ts
git commit -m "refactor(frontend): define shared read surface contracts"
```

---

### Task 2: Make viewer current-session controls identical and disabled

**Files:**
- Modify: `front/features/current-session/model/current-session-view-model.ts`
- Modify: `front/features/current-session/model/current-session-view-model.test.ts`
- Modify: `front/features/current-session/ui/current-session-page.tsx`
- Modify: `front/features/current-session/ui/current-session-panels.tsx`
- Modify: `front/features/current-session/ui/mobile/current-session-mobile-board.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-records-segment.tsx`
- Modify: `front/features/current-session/ui/current-session-review-visibility.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`

**Interfaces:**
- Consumes: `CurrentSessionReadView`, `ReadSurfaceCapabilities`, and `VIEWER_READ_SURFACE_CAPABILITIES` from Task 1.
- Produces:
  - `getCurrentSessionAccessState(auth, capabilities?)`
  - One desktop and one mobile current-session renderer with visible disabled controls for `canWrite=false`.
  - No `ViewerSessionReadOnly`, `MobileViewerPrepSegment`, or `MobileViewerRecordsSegment` export.

- [x] **Step 1: Replace viewer unit expectations with disabled-control expectations**

In `front/tests/unit/current-session.test.tsx`, update the viewer desktop and mobile tests to assert the regular controls exist and are disabled:

```ts
for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
  expect(desktopScope.getByRole("button", { name: label })).toBeDisabled();
}
expect(desktopScope.getByRole("slider", { name: "읽기 진행률" })).toBeDisabled();
expect(desktopScope.getAllByRole("textbox").every((input) => input.hasAttribute("disabled"))).toBe(true);
expect(desktopScope.queryByText("읽기 전용 세션 상세")).not.toBeInTheDocument();
expect(fetchMock).not.toHaveBeenCalled();
```

Seed the viewer fixture with an RSVP, non-zero progress, questions, and a long review, then assert those actual values appear in the disabled controls. For mobile, switch to `내 준비` and `내 기록` and assert the same input/button labels and stored values are present and disabled.

- [x] **Step 2: Run the current-session test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/current-session.test.tsx
```

Expected: FAIL because viewer-only renderers omit the regular controls.

- [x] **Step 3: Extend access-state calculation with explicit capabilities**

Use this signature in `current-session-view-model.ts`:

```ts
export function getCurrentSessionAccessState(
  auth?: CurrentSessionAccessAuth,
  capabilities?: ReadSurfaceCapabilities,
) {
  const isViewer = auth?.membershipStatus === "VIEWER";
  const isSuspended = auth?.membershipStatus === "SUSPENDED";
  const isHost = auth?.role === "HOST";
  const canWrite = capabilities?.canWrite
    ?? (auth ? auth.membershipStatus === "ACTIVE" && auth.approvalState === "ACTIVE" : true);
  const canReadFeedback = capabilities?.canReadFeedback ?? (!isViewer && !isSuspended);

  return { isViewer, isSuspended, isHost, canWrite, canReadFeedback };
}
```

Add a focused model test proving explicit guest/viewer capabilities cannot be upgraded by missing auth.

Change `CurrentSessionPageProps.actions` and the matching `CurrentSessionBoard` prop to `actions?: CurrentSessionSaveActions`. Inside the board, derive access with the normalized session capabilities and require both capability and actions for a write path:

```ts
const accessState = getCurrentSessionAccessState(auth, session.capabilities);
const canWrite = accessState.canWrite && actions !== undefined;
```

Each save handler returns before mutation when `!canWrite`, then invokes its action with optional chaining (`await actions?.saveCheckin(...)`, etc.). This makes the guest route safe without a fabricated no-op action object and prevents a future route with missing actions from enabling inputs.

- [x] **Step 4: Remove the desktop viewer-only branch**

Replace the `isViewer ? <ViewerSessionReadOnly /> : <fieldset>` branch with one fieldset for all audiences:

```tsx
<fieldset
  className="stack"
  disabled={!canWrite}
  aria-describedby={!canWrite ? "current-session-read-only-note" : undefined}
  style={{ "--stack": "20px", border: 0, margin: 0, padding: 0, minWidth: 0 } as CSSProperties}
>
  <RsvpPanel rsvp={rsvp ?? "NO_RESPONSE"} saveStatus={saveStatuses.rsvp} onRsvp={handleRsvp} />
  <CheckinPanel
    readingProgress={readingProgress}
    sessionDate={session.date}
    saveStatus={saveStatuses.checkin}
    onReadingProgressChange={handleReadingProgressChange}
    onSave={handleSaveCheckin}
  />
  <QuestionEditor
    variant="desktop"
    questionInputs={questionInputs}
    writtenQuestionCount={writtenQuestionCount}
    validationMessage={questionValidationMessage}
    saveStatus={saveStatuses.question}
    onChangeQuestion={updateQuestionInput}
    onAddQuestion={addQuestionInput}
    onRemoveQuestion={removeQuestionInput}
    onSaveQuestions={handleSaveQuestions}
  />
  <LongReviewPanel
    longReview={longReview}
    saveStatus={saveStatuses.longReview}
    onChange={handleLongReviewChange}
    onSave={handleSaveLongReview}
  />
</fieldset>
```

Keep one short `읽기 전용` note above the fieldset and delete `ViewerSessionReadOnly` and `ReadOnlyMetric`.

- [x] **Step 5: Make state initialization null-safe without inventing saved values**

Use UI defaults only:

```ts
const [rsvp, setRsvp] = useState<RsvpStatus>(session.myRsvpStatus ?? "NO_RESPONSE");
const [readingProgress, setReadingProgress] = useState(session.myCheckin?.readingProgress ?? 0);
const [questionInputs, setQuestionInputs] = useState<QuestionInput[]>(
  () => initialQuestionInputs(session.myQuestions),
);
```

The model retains `null`; only the disabled control receives `NO_RESPONSE`/`0` as a display value. Change `RsvpPanel`, `MobileCurrentSessionBoard`, and mobile segment RSVP props to explicit non-null `RsvpStatus` rather than deriving them from nullable `CurrentSession["myRsvpStatus"]`.

- [x] **Step 6: Remove mobile viewer-only branches**

Render `MobilePrepSegment` and `MobileRecordsSegment` for every audience and wrap their controls in the existing disabled fieldset path:

```tsx
{mobileTab === "prep" ? (
  <MobilePrepSegment
    session={session}
    rsvp={rsvp}
    readingProgress={readingProgress}
    canWrite={canWrite}
    onRsvpChange={onRsvpChange}
    onReadingProgressChange={onReadingProgressChange}
    onSaveCheckin={onSaveCheckin}
    questionInputs={questionInputs}
    onQuestionChange={onQuestionChange}
    onAddQuestion={onAddQuestion}
    onRemoveQuestion={onRemoveQuestion}
    onSaveQuestions={onSaveQuestions}
    checkinSaveStatus={checkinSaveStatus}
    questionSaveStatus={questionSaveStatus}
    questionValidationMessage={questionValidationMessage}
  />
) : null}
```

Delete `MobileViewerPrepSegment` and `MobileViewerRecordsSegment` after their imports and tests are removed.

- [x] **Step 7: Replace membership-key rendering with `renderKey` and omit protected empty metadata**

Update roster keys to `member.renderKey`. Render location and meeting rows only when their nullable values are present; keep the surrounding session metadata component unchanged.

- [x] **Step 8: Run focused current-session tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/current-session/model/current-session-view-model.test.ts \
  features/current-session/ui/current-session-review-visibility.test.tsx \
  tests/unit/current-session.test.tsx
```

Expected: PASS, with viewer controls present/disabled and no fetch/mutation call.

- [x] **Step 9: Commit Task 2**

```bash
git add front/features/current-session front/tests/unit/current-session.test.tsx
git commit -m "feat(frontend): keep viewer session controls read only"
```

---

### Task 3: Render guest current sessions with the regular current-session page

**Files:**
- Modify: `front/features/current-session/route/current-session-route.tsx`
- Modify: `front/features/guest-browse/model/guest-read-views.ts`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.test.tsx`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.test.tsx`

**Interfaces:**
- Consumes: `memberCurrentSessionReadPage`, `guestCurrentSessionReadPage`, `CurrentSessionPage`, and guest loader data.
- Produces:
  - Protected current-session route passes member-normalized data and capabilities.
  - Guest current-session route passes guest-normalized data, no mutation actions, and `GUEST_READ_SURFACE_CAPABILITIES`.

- [x] **Step 1: Write failing guest current-session parity tests**

Replace the existing “no participation controls” assertion with:

```ts
expect(screen.getByRole("heading", { name: "파도" })).toBeVisible();
expect(screen.getByText("다가오는 질문")).toBeVisible();
for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
  expect(screen.getByRole("button", { name: label })).toBeDisabled();
}
expect(screen.getByRole("slider", { name: "읽기 진행률" })).toBeDisabled();
expect(screen.queryByText(/Passcode|모임 링크 열기/)).not.toBeInTheDocument();
```

Assert the guest route renders `.rm-current-session-desktop` and `data-testid="current-session-mobile"`, the same markers used by the member page.

- [x] **Step 2: Run guest surface/route tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/ui/guest-surfaces.test.tsx \
  features/guest-browse/route/guest-scoped-app-route.test.tsx
```

Expected: FAIL because `GuestCurrentSession` still uses the separate guest renderer.

- [x] **Step 3: Normalize protected route data before rendering**

In `CurrentSessionRoute`, call `readSurfaceCapabilitiesForAuth(loaderData.auth)` and pass `memberCurrentSessionReadPage(currentData, capabilities)` to `CurrentSessionPage`. Keep the existing mutation hooks only in this protected route.

- [x] **Step 4: Normalize guest route data and render `CurrentSessionPage`**

Replace the guest branch with:

```tsx
if (appPath === "/app/session/current") {
  const page = guestCurrentSessionReadPage(
    data as GuestCurrentSessionResponse,
  );
  return (
    <CurrentSessionPage
      data={page}
      internalLinkComponent={guestCurrentSessionInternalLink(LinkComponent)}
    />
  );
}
```

`CurrentSessionPage` reads capabilities only from `data.currentSession.capabilities`; do not add a second capabilities prop. It accepts optional mutation actions and throws no error when actions are absent because `canWrite=false` guards every mutation path. The protected route embeds its auth-derived capabilities in `memberCurrentSessionReadPage` and remains the only route that supplies mutation actions.

- [x] **Step 5: Delete only the replaced guest current-session renderer**

Remove `GuestCurrentSession`, `GuestSessionCard`, `GuestRoster`, `GuestQuestions`, and `GuestLongReviews` if no other guest page imports them. Keep guest error and pagination behavior used by remaining routes.

- [x] **Step 6: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/current-session/model/current-session-read-view.test.ts \
  features/guest-browse/ui/guest-surfaces.test.tsx \
  features/guest-browse/route/guest-scoped-app-route.test.tsx \
  tests/unit/current-session.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit Task 3**

```bash
git add \
  front/features/current-session/route/current-session-route.tsx \
  front/features/guest-browse/model/guest-read-views.ts \
  front/features/guest-browse/route/guest-scoped-app-route.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/features/guest-browse/ui/guest-surfaces.test.tsx \
  front/features/guest-browse/route/guest-scoped-app-route.test.tsx
git commit -m "feat(frontend): share current session with guests"
```

---

### Task 4: Render guest notes with the regular notes feed

**Files:**
- Modify: `front/shared/model/notes-feed-model.ts`
- Modify: `front/features/guest-browse/model/guest-read-views.ts`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.test.tsx`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.test.tsx`
- Modify: `front/tests/unit/notes-feed-page.test.tsx`

**Interfaces:**
- Consumes: `NotesFeedPageProps`, `NoteFeedItem`, `NoteSessionItem`, guest note pages, existing guest queries.
- Produces:
  - `guestNoteSessionsReadPage(page): PagedResponse<NoteSessionItem>`
  - `guestNoteFeedReadPage(page): PagedResponse<NoteFeedItem>`
  - `GuestNotesRoute` renders `NotesFeedPage` with guest pagination and URL filters.

- [x] **Step 1: Write failing adapter and parity assertions**

Add to `guest-read-views.test.ts`:

```ts
expect(guestNoteSessionsReadPage(guestSessions)).toEqual(guestSessions);
expect(guestNoteFeedReadPage(guestFeed).items[0]).toEqual({
  sessionId: "s1",
  sessionNumber: 1,
  bookTitle: "책",
  date: "2026-08-02",
  authorName: "이름",
  authorShortName: "이",
  avatarKey: null,
  kind: "HIGHLIGHT",
  text: "문장",
});
```

In route/UI tests assert the regular description, session rail/picker, filter buttons, and selected-session link are present. Remove the old guest-only copy assertion.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/model/guest-read-views.test.ts \
  features/guest-browse/route/guest-scoped-app-route.test.tsx \
  tests/unit/notes-feed-page.test.tsx
```

Expected: FAIL because guest notes still render `NotesReadPage` and `NoteFeedItem.avatarKey` rejects `null`.

- [x] **Step 3: Make avatar keys nullable in the shared notes read model**

Change only the presentation type:

```ts
export type NoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  avatarKey: string | null;
  kind: NoteFeedKind;
  text: string;
};
```

`AvatarChip` already accepts unknown/nullable keys and safely renders no fabricated asset key.

- [x] **Step 4: Implement guest-to-shared note adapters**

Use explicit field mapping and filter unsupported kinds with the existing `guestNoteKind` guard. Do not cast the guest page wholesale.

- [x] **Step 5: Render `NotesFeedPage` from `GuestNotesRoute`**

Pass:

```tsx
<NotesFeedPage
  items={guestNoteFeedReadPage(data.feed)}
  noteSessions={guestNoteSessionsReadPage(data.sessions)}
  selectedSessionId={selectedSessionId}
  selectedSession={selectedSession}
  initialFilter={feedFilterFromSearchParam(searchParams.get("filter"))}
  onFilterChange={handleFilterChange}
  onLoadMoreItems={loadMoreFeed}
  onLoadMoreNoteSessions={loadMoreSessions}
  LinkComponent={LinkComponent}
/>
```

Keep filter and `sessionId` query parameters when either changes. Continue using `guestNoteFeedQuery` and `guestNoteSessionsQuery`; do not reuse member query keys.

- [x] **Step 6: Remove the replaced `GuestNotes` and `GuestNoteList` renderers**

Delete those exports after every route/test import uses `NotesFeedPage`.

- [x] **Step 7: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/model/guest-read-views.test.ts \
  features/guest-browse/route/guest-scoped-app-route.test.tsx \
  tests/unit/notes-feed-page.test.tsx
```

Expected: PASS, including cursor accumulation and retry behavior.

- [x] **Step 8: Commit Task 4**

```bash
git add \
  front/shared/model/notes-feed-model.ts \
  front/features/guest-browse/model/guest-read-views.ts \
  front/features/guest-browse/route/guest-scoped-app-route.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/features/guest-browse/ui/guest-surfaces.test.tsx \
  front/features/guest-browse/route/guest-scoped-app-route.test.tsx \
  front/tests/unit/notes-feed-page.test.tsx
git commit -m "feat(frontend): share notes feed with guests"
```

---

### Task 5: Render guest home with the regular member-home structure

**Files:**
- Create: `front/features/member-home/model/member-home-read-view.ts`
- Create: `front/features/member-home/model/member-home-read-view.test.ts`
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/member-home/ui/member-home.tsx`
- Modify: `front/features/member-home/ui/member-home-current-session.tsx`
- Modify: `front/features/member-home/ui/prep-card.tsx`
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/features/member-home/ui/member-home-current-session.test.tsx`
- Modify: `front/features/member-home/ui/member-home-records.test.tsx`
- Modify: `front/src/pages/app-home.tsx`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.test.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`

**Interfaces:**
- Consumes: `CurrentSessionReadPageData`, note shared types, guest home pages, protected member-home route data.
- Produces:
  - `MemberHomeReadView`
  - `memberHomeReadViewFromRouteData(routeData)`
  - `guestMemberHomeReadView(guestData)`
  - `MemberHomeWidgetErrors`
  - `MemberHomeRetryHandlers`
  - `MemberHome` accepts `{ view, LinkComponent, widgetErrors?, onRetry? }` without importing the guest feature.

- [x] **Step 1: Write failing home adapter tests**

Define the shared view contract in the test expectations:

```ts
expect(guestMemberHomeReadView(guestHome)).toMatchObject({
  displayName: null,
  isHost: false,
  current: { currentSession: { bookTitle: "파도" } },
  capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  upcomingSessions: [{ bookTitle: "다음 책", locationLabel: null }],
});
expect(guestMemberHomeReadView(guestHome).current.currentSession).toMatchObject({
  locationLabel: null,
  meetingUrl: null,
  meetingPasscode: null,
});
expect(JSON.stringify(guestMemberHomeReadView(guestHome))).not.toMatch(/accountName|membershipId/);
expect(JSON.stringify(guestMemberHomeReadView(guestHome))).not.toContain("Room 7");
```

Add a component test proving both guest/member views contain the same `홈 요약`, `이번 세션`, `최근 기록`, and `예정 세션` section markers.

- [x] **Step 2: Run focused home tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/member-home/model/member-home-read-view.test.ts \
  tests/unit/member-home.test.tsx
```

Expected: FAIL because the new view model and prop contract do not exist.

- [x] **Step 3: Implement `MemberHomeReadView`**

Use this top-level contract:

```ts
export type MemberHomeReadView = {
  displayName: string | null;
  isHost: boolean;
  current: CurrentSessionReadPageData;
  noteFeedItems: NoteFeedItem[];
  upcomingSessions: Array<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string | null;
  }>;
  capabilities: ReadSurfaceCapabilities;
};

export type MemberHomeWidgetKey = "current" | "upcoming" | "recentNotes";
export type MemberHomeWidgetErrors = Partial<
  Record<MemberHomeWidgetKey, { status?: number; retryAfterSeconds?: number }>
>;
export type MemberHomeRetryHandlers = Partial<Record<MemberHomeWidgetKey, () => Promise<void>>>;

export type GuestMemberHomeReadSource = {
  current: GuestCurrentSessionReadSource;
  upcoming: PagedResponse<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
  }>;
  recentNotes: PagedResponse<NoteFeedItem>;
  widgetErrors?: MemberHomeWidgetErrors;
};

export function memberHomeReadViewFromRouteData(
  routeData: MemberHomeView,
): MemberHomeReadView;

export function guestMemberHomeReadView(
  guestData: GuestMemberHomeReadSource,
): MemberHomeReadView;
```

Define `GuestMemberHomeReadSource` locally as the structural subset of the public current/upcoming/recent-notes data used by this adapter. Do not import `GuestHomeReadView` into the member-home feature. The route may pass its compatible guest value, while `member-home/ui` consumes only `MemberHomeReadView`, `MemberHomeWidgetErrors`, and `MemberHomeRetryHandlers`.

The member adapter preserves actual personal values. The guest adapter reuses `guestCurrentSessionReadPage`, maps public notes/upcoming sessions, and sets location/personal fields to `null`.

- [x] **Step 4: Refactor `MemberHome` to render from `view`**

Replace raw `auth/current/noteFeedItems/upcomingSessions` props with:

```tsx
export default function MemberHome({
  view,
  LinkComponent = PlainMemberHomeLink,
  widgetErrors,
  onRetry,
}: {
  view: MemberHomeReadView;
  LinkComponent?: MemberHomeLinkComponent;
  widgetErrors?: MemberHomeWidgetErrors;
  onRetry?: MemberHomeRetryHandlers;
}) {
  const { displayName, isHost, current, noteFeedItems, upcomingSessions, capabilities } = view;
  const currentSession = current.currentSession;
  const memberName = displayName ?? "게스트";
  const canWrite = capabilities.canWrite;
```

Keep the exact desktop/mobile structure. For guest private values, render regular controls/status cards in disabled or neutral display form; omit protected location/meeting text rather than substituting a fake value.

- [x] **Step 5: Preserve partial widget error boundaries inside the shared home**

Move the existing guest widget error/retry wrappers around the corresponding shared home sections. A failed upcoming widget must not remove the current-session or recent-record sections.

- [x] **Step 6: Adapt protected and guest routes**

`app-home.tsx` calls `memberHomeReadViewFromRouteData(loaderData)`. `GuestHomeRoute` calls `guestMemberHomeReadView(initialData)` and passes the existing retry handlers.

- [x] **Step 7: Remove the replaced `GuestHome` renderer and page-level `ConversionPrompt`**

Delete `GuestHome`, `GuestSessionCard`, and the general home conversion card after route/tests use `MemberHome`.

- [x] **Step 8: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/member-home/model/member-home-read-view.test.ts \
  features/member-home/ui/member-home-current-session.test.tsx \
  features/member-home/ui/member-home-records.test.tsx \
  features/guest-browse/route/guest-scoped-app-route.test.tsx \
  tests/unit/member-home.test.tsx
```

Expected: PASS, including partial 429 handling.

- [x] **Step 9: Commit Task 5**

```bash
git add \
  front/features/member-home \
  front/src/pages/app-home.tsx \
  front/features/guest-browse/route/guest-scoped-app-route.tsx \
  front/features/guest-browse/route/guest-scoped-app-route.test.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/tests/unit/member-home.test.tsx
git commit -m "feat(frontend): share member home with guests"
```

---

### Task 6: Render guest archive with the regular archive page

**Files:**
- Create: `front/features/archive/model/archive-read-view.ts`
- Create: `front/features/archive/model/archive-read-view.test.ts`
- Modify: `front/features/archive/ui/archive-page-shell.tsx`
- Modify: `front/features/archive/ui/archive-desktop.tsx`
- Modify: `front/features/archive/ui/archive-mobile.tsx`
- Modify: `front/features/archive/route/archive-list-route.tsx`
- Modify: `front/features/guest-browse/model/guest-read-views.ts`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.test.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`

**Interfaces:**
- Consumes: `ArchiveListQueryData`, guest archive page, `ReadSurfaceCapabilities`, route-provided `ReactNode` for locked feedback action.
- Produces:
  - `guestArchiveReadView(page): ArchivePageReadView`
  - `ArchivePage` props add `capabilities` and `feedbackLockedAction`.
  - Guest archive keeps all regular tabs visible; personal tabs have empty pages because no guest identity, and feedback shows a generic lock without metadata.

- [x] **Step 1: Write failing archive adapter tests**

```ts
const view = guestArchiveReadView(guestArchivePage);
expect(view.sessions.items[0]).toMatchObject({
  sessionId: "s1",
  published: false,
  state: "CLOSED",
});
expect(view.questions).toEqual({ items: [], nextCursor: null });
expect(view.reviews).toEqual({ items: [], nextCursor: null });
expect(view.reports).toEqual({ items: [], nextCursor: null });
expect(view.capabilities.canReadFeedback).toBe(false);
expect(JSON.stringify(view)).not.toMatch(/fileName|uploadedAt|feedbackDocument/);
```

Add component assertions that `세션`, `피드백 문서`, `내 질문`, and `내 서평` tabs remain visible, while the report panel says `피드백 문서는 정식 멤버에게 열립니다` and does not render a document title/file name.

- [x] **Step 2: Run focused archive tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/archive-read-view.test.ts \
  tests/unit/archive-page.test.tsx
```

Expected: FAIL because guest archive data cannot drive `ArchivePage` and feedback locking is data-derived.

- [x] **Step 3: Implement the archive read adapter**

Define the complete adapter output:

```ts
export type ArchivePageReadView = {
  sessions: PagedResponse<ArchiveSessionItemLike>;
  questions: PagedResponse<ArchiveQuestionItem>;
  reviews: PagedResponse<ArchiveReviewItem>;
  reports: PagedResponse<FeedbackDocumentListItem>;
  capabilities: ReadSurfaceCapabilities;
};
```

Map guest states explicitly:

```ts
function sessionState(value: string): SessionState | null {
  if (value === "DRAFT" || value === "OPEN" || value === "CLOSED" || value === "PUBLISHED") {
    return value;
  }
  return null;
}

export type GuestArchiveReadSource = {
  items: Array<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    attendance: number;
    total: number;
    state: string;
  }>;
  nextCursor: string | null;
};

export function guestArchiveReadView(page: GuestArchiveReadSource): ArchivePageReadView {
  return {
    sessions: {
      items: page.items.flatMap((session) => {
        const state = sessionState(session.state);
        return state ? [{
          sessionId: session.sessionId,
          sessionNumber: session.sessionNumber,
          bookTitle: session.bookTitle,
          bookAuthor: session.bookAuthor,
          bookImageUrl: session.bookImageUrl,
          date: session.date,
          attendance: session.attendance,
          total: session.total,
          published: state === "PUBLISHED",
          state,
        }] : [];
      }),
      nextCursor: page.nextCursor,
    },
    questions: { items: [], nextCursor: null },
    reviews: { items: [], nextCursor: null },
    reports: { items: [], nextCursor: null },
    capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  };
}
```

- [x] **Step 4: Make archive feedback locking capability-driven**

Add props:

```ts
type ArchivePageAccessProps = {
  capabilities: ReadSurfaceCapabilities;
  feedbackLockedAction?: ReactNode;
};
```

When `canReadFeedback=false`, do not inspect `reports` or per-session feedback fields. Render a generic lock card and the route-provided action. Keep the tab visible and keyboard-selectable.

- [x] **Step 5: Render `ArchivePage` from `GuestArchiveRoute`**

Pass the guest adapter result, route pathname/search, session load-more callback, and one route-provided login link as `feedbackLockedAction`. Build its `to` with `loginPathForReturnTo(currentScopedArchiveUrl)`; the action appears only after the guest explicitly selects the locked feedback tab. Do not fabricate a feedback session ID merely to open the lock dialog.

- [x] **Step 6: Remove the replaced `GuestArchive` renderer**

Delete it after route and tests use `ArchivePage`. Preserve cursor double-click protection in `GuestArchiveRoute` and its route test.

- [x] **Step 7: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/archive-read-view.test.ts \
  features/guest-browse/route/guest-scoped-app-route.test.tsx \
  tests/unit/archive-page.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit Task 6**

```bash
git add \
  front/features/archive/model/archive-read-view.ts \
  front/features/archive/model/archive-read-view.test.ts \
  front/features/archive/ui/archive-page-shell.tsx \
  front/features/archive/ui/archive-desktop.tsx \
  front/features/archive/ui/archive-mobile.tsx \
  front/features/archive/route/archive-list-route.tsx \
  front/features/guest-browse/model/guest-read-views.ts \
  front/features/guest-browse/route/guest-scoped-app-route.tsx \
  front/features/guest-browse/route/guest-scoped-app-route.test.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/tests/unit/archive-page.test.tsx
git commit -m "feat(frontend): share archive presentation with guests"
```

---

### Task 7: Render guest historical session details with the regular detail page

**Files:**
- Create: `front/features/archive/model/session-detail-read-view.ts`
- Create: `front/features/archive/model/session-detail-read-view.test.ts`
- Modify: `front/features/archive/queries/archive-queries.ts`
- Modify: `front/features/archive/queries/archive-queries.test.ts`
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/archive/route/member-session-detail-route.tsx`
- Modify: `front/features/guest-browse/model/guest-read-views.ts`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.tsx`
- Modify: `front/features/guest-browse/ui/guest-surfaces.test.tsx`
- Modify: `front/tests/unit/member-session-detail-page.test.tsx`

**Interfaces:**
- Consumes: member detail response, guest archive detail response, `ReadSurfaceCapabilities`, `ReadmatesReturnTarget`.
- Produces:
  - `SessionDetailReadView`
  - `MemberArchiveSessionQueryData`
  - `memberSessionDetailReadView(response, capabilities)`
  - `guestSessionDetailReadView(response)`
  - `MemberSessionDetailPage` accepts `SessionDetailReadView` and `feedbackLockedAction`.

- [x] **Step 1: Write failing detail adapter tests**

```ts
const guestView = guestSessionDetailReadView(guestDetail);
expect(guestView).toMatchObject({
  bookTitle: "기록 책",
  publicSummary: "공개 요약",
  publicHighlights: [{ text: "공개 문장" }],
  clubQuestions: [{ text: "공개 질문" }],
  clubOneLiners: [{ text: "공개 한줄평" }],
  publicLongReviews: [{ body: "공개 서평" }],
  capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  feedbackDocument: null,
  myQuestions: [],
  myCheckin: null,
  myOneLineReview: null,
  myLongReview: null,
});
expect(guestView?.locationLabel).toBeNull();
expect(JSON.stringify(guestView)).not.toMatch(/fileName|uploadedAt/);
expect(JSON.stringify(guestView)).not.toContain("Room 7");
```

Add a query test proving member `LONG_REVIEW` note items become `clubLongReviews` without changing the server DTO. Add a component test rendering member and guest views and comparing their public heading order: `요약`, `회차 기록`, `함께 남긴 질문`, `공개 서평`.

- [x] **Step 2: Run focused detail tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/session-detail-read-view.test.ts \
  features/archive/queries/archive-queries.test.ts \
  tests/unit/member-session-detail-page.test.tsx
```

Expected: FAIL because the shared detail contract and guest adapter do not exist.

- [x] **Step 3: Enrich protected detail query data with public long reviews**

Define a frontend-only query result without changing `MemberArchiveSessionDetailResponse`:

```ts
export type MemberArchiveSessionQueryData = MemberArchiveSessionDetailResponse & {
  clubLongReviews: Array<{
    authorName: string;
    authorShortName: string | null;
    avatarKey: string | null;
    body: string;
  }>;
};
```

Change `fetchMemberArchiveSessionQueryData` and `memberArchiveSessionQuery` to return `MemberArchiveSessionQueryData | null`. Fetch the notes page whenever a session exists, because long-review enrichment is needed even when every highlight already has an author. When notes succeed, map `LONG_REVIEW` items with non-null authors into `clubLongReviews` and continue enriching missing highlight authors. When notes fail, return `{ ...session, clubLongReviews: [] }`; never return the raw server DTO under the enriched query type. Do not add this field to the API/Zod contract.

- [x] **Step 4: Implement explicit member and guest detail adapters**

Define the presentation contract in `session-detail-read-view.ts`:

```ts
export type SessionDetailHighlight = {
  text: string;
  sortOrder: number;
  authorName: string | null;
  authorShortName: string | null;
  avatarKey: string | null;
};

export type SessionDetailQuestion = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
  avatarKey: string | null;
};

export type SessionDetailOneLiner = {
  authorName: string;
  authorShortName: string;
  avatarKey: string | null;
  text: string;
};

export type SessionDetailLongReview = {
  authorName: string;
  authorShortName: string | null;
  avatarKey: string | null;
  body: string;
};

export type SessionDetailReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  state: SessionState;
  locationLabel: string | null;
  attendance: number;
  total: number;
  myAttendanceStatus: AttendanceStatus | null;
  isHost: boolean;
  publicSummary: string | null;
  publicHighlights: SessionDetailHighlight[];
  clubQuestions: SessionDetailQuestion[];
  clubOneLiners: SessionDetailOneLiner[];
  publicLongReviews: SessionDetailLongReview[];
  myQuestions: SessionDetailQuestion[];
  myCheckin: { readingProgress: number } | null;
  myOneLineReview: { text: string } | null;
  myLongReview: { body: string } | null;
  feedbackDocument: ArchiveFeedbackDocumentStatus | null;
  capabilities: ReadSurfaceCapabilities;
};

export type GuestSessionDetailReadSource = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  attendance: number;
  total: number;
  state: string;
  summary: string | null;
  highlights: SessionDetailHighlight[];
  questions: SessionDetailQuestion[];
  oneLiners: SessionDetailOneLiner[];
  longReviews: Array<{
    title: string;
    content: string;
    authorName: string;
    authorShortName: string;
    avatarKey: string | null;
  }>;
};

export function memberSessionDetailReadView(
  source: MemberArchiveSessionQueryData,
  capabilities: ReadSurfaceCapabilities,
): SessionDetailReadView;

export function guestSessionDetailReadView(
  source: GuestSessionDetailReadSource,
): SessionDetailReadView | null;
```

Keep `GuestSessionDetailReadSource` structural and local to the archive feature; do not import guest feature model types. The member adapter maps `clubLongReviews` to `publicLongReviews`. The guest adapter validates `state` with the same explicit state guard used by the list adapter and returns `null` for an invalid value. For valid input it maps guest `longReviews[].content` to `publicLongReviews[].body`, sets protected location, personal state, and feedback document to `null`, and retains public author/avatar values exactly as delivered. The adapter test includes an invalid state fixture and expects `null` rather than accepting a cast.

- [x] **Step 5: Make the existing detail page consume `SessionDetailReadView`**

Keep desktop/mobile layout and section primitives. Add a `공개 서평` section backed by `publicLongReviews` for member and guest views. Guard protected fields with null checks. When `canReadFeedback=false`, render one generic locked card and the injected `feedbackLockedAction`; do not render `FeedbackMetaBadge` or inspect feedback availability.

- [x] **Step 6: Adapt member and guest routes**

The protected route calls `memberSessionDetailReadView`. The guest route calls `guestSessionDetailReadView`, renders its existing not-found boundary when the adapter returns `null`, and otherwise injects a `GuestNavigationLink` to `/app/feedback/:sessionId`, which opens the existing lock dialog without navigating.

- [x] **Step 7: Remove the replaced `GuestArchiveDetail` renderer and bottom conversion card**

Delete the guest-only detail JSX and `ConversionPrompt`. Keep locked feedback conversion through `GuestNavigationLink` only.

- [x] **Step 8: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/session-detail-read-view.test.ts \
  features/archive/queries/archive-queries.test.ts \
  features/guest-browse/ui/guest-surfaces.test.tsx \
  tests/unit/member-session-detail-page.test.tsx
```

Expected: PASS with no feedback metadata in guest presentation.

- [x] **Step 9: Commit Task 7**

```bash
git add \
  front/features/archive/model/session-detail-read-view.ts \
  front/features/archive/model/session-detail-read-view.test.ts \
  front/features/archive/queries/archive-queries.ts \
  front/features/archive/queries/archive-queries.test.ts \
  front/features/archive/ui/member-session-detail-page.tsx \
  front/features/archive/route/member-session-detail-route.tsx \
  front/features/guest-browse/model/guest-read-views.ts \
  front/features/guest-browse/route/guest-scoped-app-route.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/features/guest-browse/ui/guest-surfaces.test.tsx \
  front/tests/unit/member-session-detail-page.test.tsx
git commit -m "feat(frontend): share session detail with guests"
```

---

### Task 8: Remove persistent guest conversion controls and preserve personal-space locking

**Files:**
- Delete: `front/features/guest-browse/ui/guest-account-control.tsx`
- Modify: `front/features/guest-browse/ui/guest-shell.test.tsx`
- Modify: `front/features/guest-browse/ui/guest-my-space.tsx`
- Modify: `front/features/guest-browse/ui/guest-locked-page.tsx`
- Modify: `front/features/guest-browse/ui/guest-navigation-dialog.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/src/app/layouts/app-route-layout.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/spa-layout.test.tsx`

**Interfaces:**
- Consumes: existing `TopNav`, `MobileHeader`, `GuestMySpace`, `GuestLockedPage`, and `GuestNavigationProvider` contracts.
- Produces:
  - Guest shell passes `accountControl={null}` on desktop/mobile.
  - `GuestMySpace` retains its contextual `멤버로 시작` action and exact `returnTo`.
  - Explicit feedback/account lock dialog retains focus trap, Escape, backdrop close, focus restore, and one conversion action.

- [x] **Step 1: Rewrite shell tests for the approved conversion policy**

Delete the direct `GuestAccountControl` render test. In the layout test assert:

```ts
expect(screen.queryByLabelText("게스트 계정")).not.toBeInTheDocument();
expect(screen.queryByRole("link", { name: "공개 홈으로 나가기" })).not.toBeInTheDocument();
expect(screen.queryByRole("link", { name: "멤버로 시작" })).not.toBeInTheDocument();
```

Keep separate tests proving `GuestMySpace` and an opened lock dialog each contain exactly one `멤버로 시작` link with the full encoded return path.

- [x] **Step 2: Run shell/layout tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/ui/guest-shell.test.tsx \
  src/app/layouts/app-route-layout.test.tsx \
  tests/unit/spa-layout.test.tsx
```

Expected: FAIL because desktop/mobile shell still inject `GuestAccountControl`.

- [x] **Step 3: Remove guest account-control injection**

Use the authenticated account controller only:

```tsx
accountControl={
  auth?.authenticated ? (
    <AccountMenuController
      auth={auth}
      appBasePath={basePath}
      LinkComponent={Link}
      onLoggedOut={markLoggedOut}
    />
  ) : null
}
```

Apply this to both `TopNav` and `MobileHeader`. Remove the `GuestAccountControl` import and delete its file.

- [x] **Step 4: Remove unused account-control CSS only**

Delete `.rm-guest-account-control`, `__badge`, `__action`, and their media/focus rules. Retain `.rm-guest-lock*`, `.rm-guest-my-space*`, dialog, and reduced-motion styles.

- [x] **Step 5: Preserve contextual conversion behavior**

Do not change the `GuestMySpace` route selection in `GuestScopedAppRoute`. Keep the current safe `loginPathForReturnTo(returnTo)` call. Keep explicit feedback/account lock behavior in `GuestNavigationDialog` and `GuestLockedPage`.

- [x] **Step 6: Run focused GREEN tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/ui/guest-shell.test.tsx \
  src/app/layouts/app-route-layout.test.tsx \
  tests/unit/spa-layout.test.tsx
```

Expected: PASS.

- [x] **Step 7: Run the frontend boundary test after guest UI removals**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS with no UI-to-route/API dependency violation.

- [x] **Step 8: Commit Task 8**

```bash
git add -A \
  front/features/guest-browse/ui \
  front/src/app/layouts/app-route-layout.tsx \
  front/src/app/layouts/app-route-layout.test.tsx \
  front/src/styles/globals.css \
  front/tests/unit/spa-layout.test.tsx
git commit -m "fix(frontend): remove persistent guest conversion actions"
```

---

### Task 9: Prove audience parity, denied writes, responsive behavior, and release documentation

**Files:**
- Modify: `front/tests/e2e/guest-browsing.spec.ts`
- Modify: `front/tests/e2e/google-auth-viewer.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: final guest/viewer/member UI, existing public-request inventory, viewer login fixtures, direct denied-write probes, responsive helpers.
- Produces: end-to-end evidence for selected acceptance-matrix rows and an `Unreleased` behavior note.

- [x] **Step 1: Update the guest journey expectations**

Replace guest-only headings/copy with regular-member structure markers. For current session assert regular controls exist and are disabled:

```ts
for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
  await expect(page.getByRole("button", { name: label }).first()).toBeDisabled();
}
await expect(page.getByRole("slider", { name: "읽기 진행률" }).first()).toBeDisabled();
```

For every ordinary guest record page assert no persistent header/general-page conversion links:

```ts
await expect(page.getByRole("link", { name: "공개 홈으로 나가기" })).toHaveCount(0);
await expect(page.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(0);
```

After explicitly opening feedback, assert the dialog contains exactly one conversion link. On `/app/me`, assert `GuestMySpace` still contains exactly one conversion link.

- [x] **Step 2: Update viewer E2E expectations**

In both viewer specs, replace “control count 0” assertions with visible/disabled assertions. Keep direct PATCH/feedback probes and their expected `403` responses unchanged.

- [x] **Step 3: Run targeted E2E and verify behavior**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/guest-browsing.spec.ts \
  tests/e2e/google-auth-viewer.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS. Guest browser request inventory contains only `/api/bff/api/public/**` and `/api/bff/api/auth/me`; viewer direct writes and feedback reads return `403`.

- [x] **Step 4: Capture responsive browser evidence**

Use the existing Playwright fixtures at 1280×900 and 390×844 to inspect:

- Guest and member home section order.
- Guest/viewer/member current-session header, tabs, form placement, and enabled state.
- Guest/member notes rail or mobile sheet, filters, and session transition.
- Guest/member archive tabs and session detail public section order.
- No horizontal overflow.
- Reduced-motion notes transitions.
- Feedback lock dialog focus trap/Escape/focus restoration.
- Guest personal-space preview unchanged.

Store screenshots only in Playwright output or existing ignored evidence paths; do not add new tracked generated images unless the repository contract explicitly requires them.

- [x] **Step 5: Update `CHANGELOG.md`**

Under `Unreleased`, add one public-safe bullet:

```markdown
- 둘러보기 사용자도 정식 멤버와 같은 홈·세션·노트·아카이브·기록 화면을 사용하며, 입력 영역은 읽기 전용으로 비활성화되고 피드백 문서는 정식 멤버에게만 열리도록 정리했습니다.
```

- [x] **Step 6: Run the canonical frontend gates at the Task 9 snapshot**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: all commands PASS.

- [x] **Step 7: Run repository diff and public-safety checks**

Run:

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  CHANGELOG.md \
  front/features/current-session \
  front/features/guest-browse \
  front/features/member-home \
  front/features/archive \
  front/shared/model \
  front/src/app/layouts \
  front/tests
```

Expected: `git diff --check` exits 0 and the safety scan reports no introduced private-looking value. Existing public-safe fixture emails such as `member@example.com` must be reviewed as test placeholders rather than reported as secrets.

- [x] **Step 8: Review the final branch against the approved spec**

Confirm every acceptance statement:

- Guest/viewer/member share record renderers.
- Guest/viewer controls are present and disabled.
- No guest mutation callback or viewer direct write succeeds.
- Feedback metadata/body are absent from guest presentation and viewer feedback requests remain denied.
- Header/general-page conversion is absent.
- Explicit feedback lock and `GuestMySpace` conversion remain.
- Guest partial errors, pagination, filters, route continuity, and reduced motion remain covered.

- [x] **Step 9: Commit Task 9**

```bash
git add \
  front/tests/e2e/guest-browsing.spec.ts \
  front/tests/e2e/google-auth-viewer.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts \
  CHANGELOG.md
git commit -m "test(frontend): prove guest member surface parity"
```

Task 9's canonical snapshot was `d2f5087c`: lint and build passed, the full
frontend unit suite passed 2,038/2,038, and the full E2E suite passed 131/131.
The later whole-branch review fix wave changed runtime code, so this checked
step is historical Task 9 evidence rather than final-HEAD recertification.

---

## Final closeout status

- [x] Independent whole-branch review completed; three Important findings were recorded.
- [x] One fix wave resolved all three findings with RED/GREEN evidence in `8fea0e17`.
- [x] The single scoped re-review of the fix diff was clean.
- [x] Fix-wave focused regression (103/103), frontend boundary (8/8), full unit (2,041/2,041), lint, build, diff, and targeted public-safety checks passed.
- [x] Tracked implementation report and Task 1-9 checkbox closeout prepared in one docs-only commit.
- [ ] Controller: rerun targeted guest/viewer/member E2E at the exact final docs HEAD.
- [ ] Controller: rerun full frontend E2E at the exact final docs HEAD.
- [ ] Controller: recapture or revalidate desktop/mobile/reduced-motion browser evidence at the exact final docs HEAD.
- [ ] Controller: record one exact final-HEAD lint, full unit, build, diff, and public-safety snapshot after the docs commit.

---

## Acceptance Matrix Handoff

### Selected rows

- `Actor or authorization`
  - `GUEST`, `VIEWER`, active `MEMBER`, and `HOST` presentation states are affected.
  - Evidence: capability/model tests, guest current-session tests, viewer tests, guest/viewer E2E, direct denied writes and feedback reads.
- `Guest DTO privacy`
  - The implementation maps guest DTOs into member presentation contracts and must not invent or leak forbidden fields.
  - Evidence: explicit adapter field mapping, recursive/serialized forbidden-key assertions, anonymous browser request inventory.
- `Cursor collection`
  - Guest notes and archive continue using independent cursor pages after swapping renderers.
  - Evidence: existing first/continuation/rapid-click/retry route tests and guest E2E.
- `BFF or OAuth`
  - Safe `returnTo` and explicit lock conversion remain, while persistent conversion controls are removed.
  - Evidence: guest shell/link tests and feedback lock E2E. OAuth provider behavior itself is unchanged.
- `Async, cache, or provider`
  - Guest partial widget failure and bounded `Retry-After` remain relevant.
  - Evidence: guest home 429 component/route tests.
- `UI or runtime state`
  - Desktop/mobile, disabled state, error, empty, wrapping, route transition, and reduced motion are central.
  - Evidence: focused component tests, Playwright desktop/mobile checks, full frontend gates.

### Adjacent high-risk rows excluded

- `Club context`: route scope and BFF-derived club context are not changed; existing guest cross-club/404 E2E remains a regression guard.
- `Session lifecycle`: no state transition or lifecycle visibility rule changes.
- `Guest/public exposure`: no `access_scope`, `site_visibility`, host write, or publication logic changes; current guest fixtures remain regression evidence.
- `Persistence or migration`: no server persistence, Flyway, or schema files change.

## Final Verification Record

The executor must report:

- Exact focused RED/GREEN commands per task.
- Exact canonical frontend gate output at final HEAD.
- Desktop/mobile/reduced-motion browser evidence performed.
- Guest anonymous request inventory result.
- Viewer direct write and feedback-read denial result.
- Any skipped command and the reason; do not describe an unrun check as passed.
- Remaining risk, especially any member-only display field that could not be represented from the public projection without violating the allowlist.
