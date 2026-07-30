# ReadMates Member Space Account and Archive UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/clubs/:clubSlug/app/me` a coherent personal reading surface, move account settings discovery to the global account menu, give `/app/me/settings` an explicit return path, and send the recent-reading CTA to the canonical archive sessions view without breaking the personal-record deep link.

**Architecture:** Preserve the existing profile, journey, archive, leave-membership, and auth APIs. Simplify the prop-driven archive UI so `/app/me` owns inline display-name editing and reading context, `AccountMenu` owns global account navigation, and `AccountSettingsRoute` owns only read-only account and membership information plus the existing leave action. Route modules continue to create club-scoped hrefs with `scopedAppLinkTarget`; `/app/me/records` stays registered and directly testable but receives no new visible entry point.

**Tech Stack:** React 19.2.7, React Router 7, TypeScript 6.0.3, Vitest 4.1.10, Testing Library, Playwright 1.61.1, Vite 8.1.5, repository-pinned `pnpm@11.13.1` through Corepack.

## Global Constraints

- Design authority: `docs/superpowers/specs/2026-07-30-member-space-account-archive-ux-design.md` at approved HEAD `4526c02b`.
- Product surfaces: member `/app/me`, global member and host account menu, member `/app/me/settings`, and the recent-reading CTA only.
- Preserve `src/app -> src/pages -> features -> shared`; UI modules render props and callbacks only, route modules own router state and API calls, and pure models stay free of React, router, fetch, and API-client imports.
- Reuse `/api/app/me`, `/api/archive/me/journey?limit=3`, `/api/archive/sessions`, `PATCH /api/me/profile`, `POST /api/me/membership/leave`, and the existing logout endpoint.
- Add no server, BFF, database, Flyway migration, package, remote-image fallback, or dependency change.
- Keep `/app/me/records` registered, directly accessible, and cursor-paginated; do not delete or redirect it because its personal-activity scope differs from the archive session scope.
- Remove the `/app/me` profile-surface account-settings link; global `AccountMenu` must expose `내 공간`, `계정 설정`, and `로그아웃` in that order.
- Use `이름 변경`, `계정 설정`, `← 내 공간`, `계정 정보`, `클럽 멤버십`, `멤버십 종료`, `클럽 탈퇴…`, `클럽 탈퇴`, and `전체 세션 기록 보기` exactly.
- The recent-reading CTA must target scoped `/app/archive?view=sessions`; individual recent rows continue to target scoped `/app/sessions/:sessionId`.
- Keep the display name as the only `/app/me` `h1`; achievements and recent readings use `h2`, and recent book titles use `h3`.
- Preserve profile authorization: only `canEditOwnProfile` users receive the inline `이름 변경` control; saving still refreshes auth and revalidates the route.
- Keep account information and membership information read-only on `/app/me/settings`; do not duplicate display-name editing or logout there.
- Keep leave-membership policy, request, success redirect, and failure copy unchanged; only clarify the section and action labels and apply danger styling to the final confirm action.
- Desktop and mobile use the same DOM order: avatar, profile kicker, display name, name-change control, membership byline, achievement narrative, metrics, recent readings, archive CTA.
- Maintain a maximum 1080px member-space width, minimum 44px interactive targets, 320px overflow safety, 200% zoom safety, visible focus, semantic links and buttons, WCAG AA contrast, and reduced-motion behavior.
- Use public-safe sample names and `example.com` addresses only; do not persist real member data, secrets, deployment state, private domains, local absolute paths, or token-shaped examples.
- Run frontend commands with `corepack pnpm`; if Corepack is absent, use the repository guide's explicit fallback and report the exact command.

## File Structure

| Path | Responsibility |
| --- | --- |
| `front/features/archive/ui/my-page/profile-name-editor.tsx` | Inline display-name heading, `이름 변경`, save, cancel, pending, and error states for `/app/me` only |
| `front/features/archive/ui/my-page/member-profile-summary.tsx` | Profile avatar, identity editor, and membership byline without account-settings navigation |
| `front/features/archive/ui/my-page/my-reading-shelf.tsx` | One member-space overview followed by recent readings |
| `front/features/archive/ui/my-page.tsx` | Stable page props passed from `MyPageRoute` |
| `front/features/archive/ui/my-page/member-space-sections.test.tsx` | Profile order, edit state, read-only state, and achievement semantics |
| `front/tests/unit/my-page.test.tsx` | Whole-page composition without local account or logout actions |
| `front/features/archive/ui/my-page/recent-reading-list.tsx` | Recent personal activity preview and canonical archive sessions CTA |
| `front/features/archive/ui/my-page/recent-reading-list.test.tsx` | CTA copy, destination, list, and empty-state component contracts |
| `front/features/archive/route/my-page-route.tsx` | Club-scoped session-detail and archive-session href construction |
| `front/features/archive/route/my-page-route.test.tsx` | Scoped route destinations and absence of profile account navigation |
| `front/features/auth/ui/account-menu.tsx` | Global `내 공간`, `계정 설정`, and logout navigation |
| `front/features/auth/ui/account-menu.test.tsx` | Account-menu item naming, order, and href |
| `front/features/auth/route/account-menu-controller.test.tsx` | Controller-provided scoped settings href under the new copy |
| `front/features/archive/ui/my-page/account-settings-sections.tsx` | Read-only account and club-membership definition lists |
| `front/features/archive/ui/my-page/preferences-section.tsx` | Deleted after its profile-editing responsibility moves entirely to `/app/me` |
| `front/features/archive/ui/account-settings-page.tsx` | Scoped return link, setting summaries, and membership termination composition |
| `front/features/archive/ui/account-settings-page.test.tsx` | Settings headings, return href, summaries, and absence of duplicated edit/logout |
| `front/features/archive/route/account-settings-route.tsx` | Settings loader data, scoped `/app/me` return href, and leave request |
| `front/features/archive/route/account-settings-route.test.tsx` | Scoped and unscoped return hrefs plus leave failure |
| `front/src/pages/account-settings.tsx` | Thin settings page adapter with no profile-edit auth/controller wiring |
| `front/features/archive/ui/my-page/danger-zone.tsx` | Two-step membership termination with a final danger action |
| `front/src/styles/globals.css` | Continuous member-space paper, inline edit action, settings summaries/back link, danger confirm, responsive and focus rules |
| `front/tests/e2e/my-reading-shelf-fixtures.ts` | Public-safe long identity, missing joined month, journey, and direct-record browser fixtures |
| `front/tests/e2e/member-space-information-architecture.spec.ts` | Semantic order, CTA destination, direct personal-record route, viewport, zoom, focus, and scoped navigation |
| `front/tests/e2e/member-profile-permissions.spec.ts` | Active profile editing and restricted-member read-only regressions under the new information architecture |
| `front/tests/e2e/responsive-navigation-chrome.spec.ts` | Account-menu copy, settings return flow, mobile tap targets, and overflow |
| `docs/development/architecture.md` | Current ownership and canonical navigation facts |
| `CHANGELOG.md` | Unreleased reader-facing summary |

## Acceptance Matrix

- Selected `UI or runtime state`: read-only profile, editing, save pending, save failure, cancel, settings direct entry, leave confirmation, leave failure, recent-list empty/non-empty states, desktop, 390px, 320px, 200% zoom, and reduced motion. Evidence: focused Vitest suites and the three named Playwright files.
- Selected `Actor or authorization`: active members keep inline profile editing; viewer and suspended members keep readable profile/settings content without gaining edit controls; host account-menu behavior remains consistent. Evidence: page/controller component tests and `member-profile-permissions.spec.ts`.
- Selected `Club context`: scoped and unscoped compatibility routes must create stable `/app/me`, `/app/me/settings`, `/app/archive?view=sessions`, and session-detail hrefs. Evidence: route tests and scoped navigation E2E.
- Selected `Cursor collection`: `/app/me/records` stays a direct 12-item cursor route with continuation, retry, and deduplication behavior unchanged. Evidence: retain its direct-route pagination and error E2E while removing only the new-user entry point.
- Excluded `Session lifecycle` and `publication visibility`: preview and archive data sources are unchanged.
- Excluded `BFF or OAuth`, `persistence or migration`, and `async, cache, or provider`: no proxy, auth protocol, database, queue, cache, or provider contract changes.

---

### Task 1: Put profile identity, inline name editing, and membership context in one semantic flow

**Files:**
- Modify: `front/features/archive/ui/my-page/profile-name-editor.tsx:1-250`
- Modify: `front/features/archive/ui/my-page/member-profile-summary.tsx:1-48`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx:1-49`
- Modify: `front/features/archive/ui/my-page.tsx:1-38`
- Test: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

**Interfaces:**
- Consumes: `MyPageProfile`, `MemberSpaceViewModel`, `ProfileUpdateResult`, `canEditProfile`, and `onUpdateProfile`.
- Produces:

```ts
export type ProfileNameEditorProps = {
  data: MyPageProfile;
  canEditProfile?: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  headingId: string;
};

export type MemberProfileSummaryProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};
```

- Removes: `variant`, `memberSpaceActions`, `accountSettingsHref`, the settings-only editor branch, and the `rm-member-profile__actions` action row.
- Guarantees: `h1` precedes the `이름 변경` button, the byline follows the editor block, pending/error/cancel behavior is unchanged, and read-only users see no edit affordance or placeholder.

- [x] **Step 1: Replace the profile-section assertions with the approved hierarchy**

In `member-space-sections.test.tsx`, remove every `accountSettingsHref` prop and replace the first two tests with:

```tsx
it("renders identity, inline name editing, and membership context without account navigation", () => {
  const { container } = renderProfileSummary();
  const section = screen.getByRole("region", { name: "멤버1" });
  const heading = within(section).getByRole("heading", { level: 1, name: "멤버1" });
  const edit = within(section).getByRole("button", { name: "이름 변경" });
  const byline = within(section).getByText("읽는사이 · 멤버 · 2025.11부터 함께");

  expect(screen.getByText("내 프로필")).toBeVisible();
  expect(heading.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(edit.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
  expect(container.querySelector(".rm-member-profile__actions")).toBeNull();
});

it("omits only the name-change control when profile editing is not allowed", () => {
  renderProfileSummary(false);

  expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toBeVisible();
  expect(screen.getByText("읽는사이 · 멤버 · 2025.11부터 함께")).toBeVisible();
  expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
  expect(screen.queryByLabelText("이름 변경 준비 중")).toBeNull();
  expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
});
```

Change all edit initiations in this test file from:

```ts
screen.getByRole("button", { name: "프로필 수정" })
```

to:

```ts
screen.getByRole("button", { name: "이름 변경" })
```

In `front/tests/unit/my-page.test.tsx`, remove only `accountSettingsHref`, keep the existing `recordsHref` prop until Task 2, and add:

```ts
expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
expect(screen.getByRole("button", { name: "이름 변경" })).toBeVisible();
```

- [x] **Step 2: Run the focused tests and verify the old component contract fails**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the profile still renders `프로필 수정`, injects `계정 관리`, and requires `accountSettingsHref`.

- [x] **Step 3: Simplify `ProfileNameEditor` to the member-space editor only**

Remove `CSSProperties` and `ReactNode` from the React import. Replace the props and render branches with this structure while retaining the current `submitProfile`, `profileFailureMessage`, draft, pending, error, and cancel logic:

```tsx
export type ProfileNameEditorProps = {
  data: MyPageProfile;
  canEditProfile?: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  headingId: string;
};

export function ProfileNameEditor({
  data,
  canEditProfile = true,
  onUpdateProfile,
  headingId,
}: ProfileNameEditorProps) {
  const inputId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    sourceDisplayName: data.displayName,
    value: data.displayName,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const value =
    draft.sourceDisplayName === data.displayName
      ? draft.value
      : data.displayName;

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current || !canEditProfile) {
      return;
    }

    const trimmedValue = value.trim();
    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const profile = await onUpdateProfile(trimmedValue);
      setDraft({
        sourceDisplayName: profile.displayName,
        value: profile.displayName,
      });
      setEditing(false);
    } catch (profileError) {
      setError(profileFailureMessage(profileError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="rm-member-profile__name" data-editing={editing || undefined}>
      <div className="rm-member-profile__name-row">
        <h1 id={headingId}>{data.displayName}</h1>
        {!editing && canEditProfile ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm rm-member-profile__edit"
            aria-label="이름 변경"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
          >
            <Icon size={13} />
            <span>이름 변경</span>
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="rm-member-profile__form" onSubmit={submitProfile}>
          <div className="rm-member-profile__field">
            <label htmlFor={inputId} className="body">
              이름
            </label>
            <input
              id={inputId}
              className="input"
              value={value}
              disabled={saving}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) =>
                setDraft({
                  sourceDisplayName: data.displayName,
                  value: event.currentTarget.value,
                })
              }
            />
            {error ? (
              <div id={errorId} role="alert" className="tiny rm-member-profile__error">
                {error}
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            aria-label="이름 저장"
            disabled={saving}
          >
            {saving ? "저장 중" : "저장"}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setError(null);
              setDraft({
                sourceDisplayName: data.displayName,
                value: data.displayName,
              });
            }}
          >
            취소
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Icon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
    </svg>
  );
}
```

- [x] **Step 4: Remove account-settings navigation from the profile composition**

Make `MemberProfileSummary` render only:

```tsx
export function MemberProfileSummary({
  profile,
  viewModel,
  canEditProfile,
  onUpdateProfile,
}: MemberProfileSummaryProps) {
  return (
    <section className="rm-member-profile" aria-labelledby="member-profile-name">
      <div className="rm-member-profile__avatar" aria-hidden>
        {viewModel.avatarLabel}
      </div>
      <p className="rm-member-space-kicker">내 프로필</p>
      <ProfileNameEditor
        data={profile}
        canEditProfile={canEditProfile}
        onUpdateProfile={onUpdateProfile}
        headingId="member-profile-name"
      />
      <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
    </section>
  );
}
```

Delete `accountSettingsHref` from `MemberProfileSummaryProps`, `MyReadingShelfProps`, `MyPageProps`, and every corresponding call site. Keep `canEditProfile` and `onUpdateProfile` unchanged so `front/src/pages/my-page.tsx` continues to refresh auth after a successful edit.

- [x] **Step 5: Run the focused tests and verify the new profile contract passes**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  tests/unit/my-page.test.tsx \
  src/pages/my-page.test.tsx
```

Expected: PASS. The page-adapter tests must still prove ACTIVE receives editing and VIEWER/SUSPENDED do not.

- [x] **Step 6: Commit the profile hierarchy**

```bash
git add \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/tests/unit/my-page.test.tsx
git commit -m "refactor(front): simplify member profile actions"
```

---

### Task 2: Send the recent-reading CTA to the scoped archive sessions view

**Files:**
- Modify: `front/features/archive/ui/my-page/recent-reading-list.tsx:1-49`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx:1-51`
- Test: `front/features/archive/ui/my-page/recent-reading-list.test.tsx`
- Test: `front/features/archive/route/my-page-route.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`

**Interfaces:**
- Produces:

```ts
export type RecentReadingListProps = {
  items: RecentReadingListItem[];
  archiveSessionsHref: string;
};

type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  archiveSessionsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};
```

- Route construction:

```ts
const archiveSessionsHref = scopedAppLinkTarget(
  location.pathname,
  "/app/archive?view=sessions",
);
```

- Guarantees: the CTA is present only for a non-empty recent preview, its visible and accessible names are both `전체 세션 기록 보기`, the club slug and query string are preserved, and direct `/app/me/records` behavior is untouched.

- [x] **Step 1: Change the component and route assertions first**

In `recent-reading-list.test.tsx`, rename the prop and assert:

```tsx
<RecentReadingList
  archiveSessionsHref="/app/archive?view=sessions"
  items={[recentItem()]}
/>

expect(screen.getByRole("link", {
  name: "전체 세션 기록 보기",
})).toHaveAttribute("href", "/app/archive?view=sessions");
expect(screen.queryByRole("link", { name: "전체 기록 보기" })).toBeNull();
```

Keep the empty-state rule explicit:

```tsx
render(
  <RecentReadingList
    items={[]}
    archiveSessionsHref="/app/archive?view=sessions"
  />,
);

expect(screen.queryByRole("link", {
  name: "전체 세션 기록 보기",
})).toBeNull();
```

In `my-page-route.test.tsx`, replace the settings/records assertions with:

```ts
expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
expect(screen.getByRole("link", {
  name: "전체 세션 기록 보기",
})).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/archive?view=sessions",
);
```

Keep the encoded session-detail assertion unchanged.

- [x] **Step 2: Run the route and component tests to confirm the destination mismatch**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the current prop is `recordsHref`, the copy is `전체 기록 보기`, and the route still points at `/app/me/records`.

- [x] **Step 3: Rename the prop through the page composition**

Replace the CTA in `RecentReadingList` with:

```tsx
{items.length > 0 ? (
  <a
    className="rm-recent-readings__all"
    href={archiveSessionsHref}
  >
    전체 세션 기록 보기 <span aria-hidden="true">→</span>
  </a>
) : null}
```

Rename `recordsHref` to `archiveSessionsHref` in `RecentReadingListProps`, `MyReadingShelfProps`, `MyPageProps`, destructuring, and JSX forwarding. Do not change `RecentReadingListItem.href`; recent rows still open session details.

- [x] **Step 4: Construct the canonical scoped href in `MyPageRoute`**

Keep the existing `scopedHref` helper and replace the removed page props with:

```tsx
<MyPage
  profile={profile}
  viewModel={viewModel}
  recentReadings={recentReadings}
  canEditProfile={canEditProfile}
  archiveSessionsHref={scopedHref("/app/archive?view=sessions")}
  onUpdateProfile={updateProfile}
/>
```

Do not modify `front/src/app/routes/member.tsx`; its `me/records` route must remain registered.

- [x] **Step 5: Run the focused navigation tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: PASS with the scoped query string intact.

- [x] **Step 6: Commit the archive CTA**

```bash
git add \
  front/features/archive/ui/my-page/recent-reading-list.tsx \
  front/features/archive/ui/my-page/recent-reading-list.test.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/route/my-page-route.tsx \
  front/features/archive/route/my-page-route.test.tsx \
  front/tests/unit/my-page.test.tsx
git commit -m "fix(front): route member history to archive sessions"
```

---

### Task 3: Make the global account menu the single account-settings entry point

**Files:**
- Modify: `front/features/auth/ui/account-menu.tsx:126-140`
- Test: `front/features/auth/ui/account-menu.test.tsx`
- Test: `front/features/auth/route/account-menu-controller.test.tsx`

**Interfaces:**
- Consumes: existing `mySpaceHref`, `settingsHref`, `LinkComponent`, and `LogoutControl`.
- Produces: identity, `내 공간`, `계정 설정`, and logout in the existing DOM order with no focus or dismiss behavior changes.

- [x] **Step 1: Update account-menu tests to the approved name and order**

In `account-menu.test.tsx`, assert within the dialog:

```ts
const items = within(dialog).getAllByRole("link");

expect(items.map((item) => item.textContent)).toEqual(["내 공간", "계정 설정"]);
expect(within(dialog).getByRole("link", { name: "계정 설정" }))
  .toHaveAttribute("href", "/app/me/settings");
expect(within(dialog).queryByRole("link", { name: "계정 관리" })).toBeNull();
expect(within(dialog).getByRole("button", { name: "로그아웃" })).toBeVisible();
```

In `account-menu-controller.test.tsx`, change the accessible-name lookup to:

```ts
expect(screen.getByRole("link", { name: "계정 설정" })).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/me/settings",
);
```

- [x] **Step 2: Run the two focused account-menu suites**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/auth/ui/account-menu.test.tsx \
  features/auth/route/account-menu-controller.test.tsx
```

Expected: FAIL because `AccountMenu` still renders `계정 관리`.

- [x] **Step 3: Rename the menu item without changing behavior**

Replace only the settings link copy:

```tsx
<LinkComponent
  to={settingsHref}
  className="rm-account-menu__item"
  onClick={closeMenu}
>
  계정 설정
</LinkComponent>
```

Keep the item order, pointer-outside dismissal, Escape dismissal, trigger focus restoration, shared member/host usage, and logout control unchanged.

- [x] **Step 4: Run the account-menu suites**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/auth/ui/account-menu.test.tsx \
  features/auth/route/account-menu-controller.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit the global navigation copy**

```bash
git add \
  front/features/auth/ui/account-menu.tsx \
  front/features/auth/ui/account-menu.test.tsx \
  front/features/auth/route/account-menu-controller.test.tsx
git commit -m "fix(front): name the global account settings entry"
```

---

### Task 4: Turn account settings into read-only account and membership summaries with a stable return link

**Files:**
- Create: `front/features/archive/ui/my-page/account-settings-sections.tsx`
- Delete: `front/features/archive/ui/my-page/preferences-section.tsx`
- Modify: `front/features/archive/ui/account-settings-page.tsx:1-35`
- Modify: `front/features/archive/route/account-settings-route.tsx:1-38`
- Modify: `front/src/pages/account-settings.tsx:1-10`
- Test: `front/features/archive/ui/account-settings-page.test.tsx`
- Test: `front/features/archive/route/account-settings-route.test.tsx`
- Verify unchanged: `front/features/archive/route/account-settings-data.test.ts`

**Interfaces:**
- Produces:

```ts
export function AccountInformation({ data }: { data: MyPageProfile }): JSX.Element;
export function MembershipIdentity({ data }: { data: MyPageProfile }): JSX.Element;

export type AccountSettingsPageProps = {
  data: MyPageProfile;
  mySpaceHref: string;
  onLeaveMembership: () => Promise<void>;
};

export function AccountSettingsRoute(): JSX.Element;
```

- Removes: account-settings profile update controller, `canEditProfile`, `onProfileUpdated`, `onUpdateProfile`, `useRevalidator`, auth-state imports from the page adapter, and the duplicate settings editor.
- Guarantees: a deterministic scoped `← 내 공간` anchor precedes the title, settings remain directly loadable, and leave membership remains route-owned.

- [x] **Step 1: Rewrite the settings page test around information ownership**

Render with `mySpaceHref="/clubs/reading-sai/app/me"` and assert:

```ts
expect(screen.getByRole("link", { name: "내 공간" })).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/me",
);
expect(screen.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
expect(screen.getByRole("heading", { level: 2, name: "계정 정보" })).toBeVisible();
expect(screen.getByRole("heading", { level: 2, name: "클럽 멤버십" })).toBeVisible();
expect(screen.getByText(profile.email)).toBeVisible();
expect(screen.getByText(profile.displayName)).toBeVisible();
expect(screen.getByText("읽는 사이")).toBeVisible();
expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
expect(screen.queryByRole("textbox", { name: "이름" })).toBeNull();
expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
```

Use level-two headings for the three page sections because `계정 설정` is the page `h1`.

- [x] **Step 2: Replace profile-update route tests with scoped-return tests**

Change the hoisted router state to:

```ts
const route = vi.hoisted(() => ({
  loaderData: null as unknown,
  pathname: "/clubs/reading-sai/app/me/settings",
}));
```

Mock router hooks with:

```ts
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
  useLocation: () => ({ pathname: route.pathname }),
}));
```

Replace the profile-save tests with:

```ts
it.each([
  [
    "/clubs/reading-sai/app/me/settings",
    "/clubs/reading-sai/app/me",
  ],
  [
    "/app/me/settings",
    "/app/me",
  ],
])("builds a stable my-space return from %s", (pathname, expectedHref) => {
  route.pathname = pathname;
  render(<AccountSettingsRoute />);

  expect(screen.getByRole("link", { name: "내 공간" }))
    .toHaveAttribute("href", expectedHref);
});
```

Keep a leave-failure test with the current labels; Task 5 changes the destructive-action copy in its own red-green cycle:

```ts
await user.click(screen.getByRole("button", { name: "탈퇴" }));
await user.click(screen.getByRole("button", { name: "탈퇴 확인" }));

expect(api.leaveMembership).toHaveBeenCalledOnce();
expect(await screen.findByRole("alert")).toHaveTextContent(
  "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
);
```

- [x] **Step 3: Run settings tests and verify the duplicate editor is still present**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/account-settings-page.test.tsx \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/account-settings-data.test.ts
```

Expected: FAIL because the title is `계정 관리`, no return link exists, and settings still mount the profile editor.

- [x] **Step 4: Create focused read-only setting sections**

Create `account-settings-sections.tsx` with:

```tsx
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import {
  clubDisplayName,
  formatJoinedMonth,
  membershipIdentityLabel,
} from "@/features/archive/model/archive-model";

export function AccountInformation({
  data,
}: {
  data: MyPageProfile;
}): JSX.Element {
  return (
    <section
      className="rm-account-settings-page__summary"
      aria-labelledby="account-information-heading"
    >
      <h2 id="account-information-heading">계정 정보</h2>
      <dl>
        <div>
          <dt>이메일</dt>
          <dd>{data.email}</dd>
        </div>
        <div>
          <dt>표시 이름</dt>
          <dd>{data.displayName}</dd>
        </div>
      </dl>
    </section>
  );
}

export function MembershipIdentity({
  data,
}: {
  data: MyPageProfile;
}): JSX.Element {
  return (
    <section
      className="rm-account-settings-page__summary"
      aria-labelledby="club-membership-heading"
    >
      <h2 id="club-membership-heading">클럽 멤버십</h2>
      <dl>
        <div>
          <dt>클럽</dt>
          <dd>{clubDisplayName(data)}</dd>
        </div>
        <div>
          <dt>멤버 상태</dt>
          <dd>{membershipIdentityLabel(data)}</dd>
        </div>
        <div>
          <dt>합류</dt>
          <dd>{formatJoinedMonth(data.joinedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
```

Delete `preferences-section.tsx`; no file should import `ProfileNameEditor` for settings after this step.

- [x] **Step 5: Recompose `AccountSettingsPage`**

Replace its props and JSX with:

```tsx
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { DangerZone } from "./my-page/danger-zone";
import {
  AccountInformation,
  MembershipIdentity,
} from "./my-page/account-settings-sections";

export type AccountSettingsPageProps = {
  data: MyPageProfile;
  mySpaceHref: string;
  onLeaveMembership: () => Promise<void>;
};

export function AccountSettingsPage({
  data,
  mySpaceHref,
  onLeaveMembership,
}: AccountSettingsPageProps) {
  return (
    <main className="rm-account-settings-page">
      <a className="rm-account-settings-page__back" href={mySpaceHref}>
        <span aria-hidden="true">←</span>
        <span>내 공간</span>
      </a>
      <header className="rm-account-settings-page__header">
        <p className="rm-my-shelf-kicker">내 공간</p>
        <h1>계정 설정</h1>
        <p>현재 계정과 읽는사이 멤버십 정보를 확인합니다.</p>
      </header>
      <div className="rm-account-settings-page__content">
        <AccountInformation data={data} />
        <MembershipIdentity data={data} />
        <div className="rm-account-settings-page__boundary">
          <DangerZone onLeaveMembership={onLeaveMembership} />
        </div>
      </div>
    </main>
  );
}
```

- [x] **Step 6: Simplify the route and page adapter**

Use the pathname to build a deterministic return destination:

```tsx
import { useLoaderData, useLocation } from "react-router-dom";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function AccountSettingsRoute() {
  const data = useLoaderData() as MyPageResponse;
  const location = useLocation();

  return (
    <AccountSettingsPage
      data={data}
      mySpaceHref={scopedAppLinkTarget(location.pathname, "/app/me")}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
```

Replace `front/src/pages/account-settings.tsx` with:

```tsx
import { AccountSettingsRoute } from "@/features/archive/route/account-settings-route";

export default function AccountSettingsRoutePage() {
  return <AccountSettingsRoute />;
}
```

- [x] **Step 7: Run settings and boundary tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/account-settings-page.test.tsx \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/account-settings-data.test.ts \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS with no new architecture exception.

- [x] **Step 8: Commit the settings ownership change**

```bash
git add \
  front/features/archive/ui/my-page/account-settings-sections.tsx \
  front/features/archive/ui/my-page/preferences-section.tsx \
  front/features/archive/ui/account-settings-page.tsx \
  front/features/archive/ui/account-settings-page.test.tsx \
  front/features/archive/route/account-settings-route.tsx \
  front/features/archive/route/account-settings-route.test.tsx \
  front/src/pages/account-settings.tsx
git commit -m "refactor(front): clarify account settings ownership"
```

---

### Task 5: Make membership termination an explicit two-step destructive action

**Files:**
- Modify: `front/features/archive/ui/my-page/danger-zone.tsx:1-78`
- Test: `front/features/archive/ui/account-settings-page.test.tsx`
- Test: `front/features/archive/route/account-settings-route.test.tsx`

**Interfaces:**
- Consumes: unchanged `onLeaveMembership: () => Promise<void>`.
- Produces: `멤버십 종료` section, `클럽 탈퇴…` disclosure button, `취소`, final `클럽 탈퇴` danger button, existing status/error messages, and existing public-about redirect.

- [x] **Step 1: Add the two-step semantics to the component test**

Extend `account-settings-page.test.tsx`:

```ts
it("reveals a specific final danger action only after the initial leave action", async () => {
  const user = userEvent.setup();
  renderAccountSettings();

  expect(screen.getByRole("heading", {
    level: 2,
    name: "멤버십 종료",
  })).toBeVisible();
  expect(screen.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "클럽 탈퇴" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "클럽 탈퇴…" }));

  const confirm = screen.getByRole("button", { name: "클럽 탈퇴" });
  expect(confirm).toHaveClass("rm-account-settings-page__danger-action");
  expect(screen.getByRole("button", { name: "취소" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("button", { name: "클럽 탈퇴" })).toBeNull();
});
```

Import `userEvent` in the test file.

- [x] **Step 2: Run the settings component and route suites**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/account-settings-page.test.tsx \
  features/archive/route/account-settings-route.test.tsx
```

Expected: FAIL on the old `멤버십 경계`, `탈퇴`, and `탈퇴 확인` labels.

- [x] **Step 3: Update `DangerZone` labels and final action class**

The component is only used by account settings, so remove the unused `variant` branch and use one semantic section:

```tsx
return (
  <section
    className="surface-quiet rm-account-settings-page__termination"
    aria-labelledby="membership-termination-heading"
  >
    <h2 id="membership-termination-heading">멤버십 종료</h2>
    <div className="rm-account-settings-page__termination-row">
      <p>
        클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setLeaveOpen((current) => !current)}
      >
        클럽 탈퇴…
      </button>
    </div>
    {leaveOpen ? (
      <div className="surface rm-account-settings-page__termination-confirm">
        <p>
          탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가
          &quot;탈퇴한 멤버&quot;로 표시됩니다.
        </p>
        <div className="rm-account-settings-page__termination-actions">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={isLeaving}
            onClick={() => setLeaveOpen(false)}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm rm-account-settings-page__danger-action"
            disabled={isLeaving}
            onClick={handleLeave}
          >
            {isLeaving ? "탈퇴 처리 중" : "클럽 탈퇴"}
          </button>
        </div>
      </div>
    ) : null}
    {leaveMessage ? (
      <p role="status" className="small rm-account-settings-page__success">
        {leaveMessage}
      </p>
    ) : null}
    {leaveError ? (
      <p role="alert" className="small rm-account-settings-page__error">
        {leaveError}
      </p>
    ) : null}
  </section>
);
```

Keep `handleLeave`, `scopedPublicLinkTarget`, success copy, failure copy, and redirect behavior unchanged.

- [x] **Step 4: Run the focused settings tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/account-settings-page.test.tsx \
  features/archive/route/account-settings-route.test.tsx
```

Expected: PASS. The route test must still prove a failed response leaves the settings page visible and reports the existing alert.

- [x] **Step 5: Commit the termination semantics**

```bash
git add \
  front/features/archive/ui/my-page/danger-zone.tsx \
  front/features/archive/ui/account-settings-page.test.tsx \
  front/features/archive/route/account-settings-route.test.tsx
git commit -m "fix(front): clarify membership termination"
```

---

### Task 6: Polish the continuous paper layout and lock responsive, focus, and navigation behavior in E2E

**Files:**
- Modify: `front/src/styles/globals.css:5730-6050`
- Modify: `front/src/styles/globals.css:6267-6496`
- Modify: `front/src/styles/globals.css:6554-6693`
- Modify: `front/tests/e2e/my-reading-shelf-fixtures.ts`
- Modify: `front/tests/e2e/member-space-information-architecture.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: Task 1 `.rm-member-profile__name-row`, `.rm-member-profile__edit`, `.rm-member-profile__field`; Task 4 settings summary/back classes; Task 5 termination classes.
- Produces: a single bordered paper surface with profile above achievements, responsive identity wrapping, 44px actions, settings summaries, visible focus, final danger treatment, and browser-level evidence.

- [x] **Step 1: Update the information-architecture E2E expectations**

In `expectMemberSpaceSemanticOrder`, use:

```ts
await expectDomOrder(
  shelf.getByRole("heading", { level: 1, name: "멤버1" }),
  shelf.getByRole("button", { name: "이름 변경" }),
  shelf.getByText("읽는사이 · 멤버 · 2025.11부터 함께"),
  shelf.getByRole("heading", {
    level: 2,
    name: "세 번의 모임에서 세 권을 끝까지 읽었어요.",
  }),
  shelf.getByText("함께한 모임", { exact: true }),
  shelf.getByText("완독", { exact: true }),
  shelf.getByText("질문", { exact: true }),
  shelf.getByRole("heading", { level: 2, name: "최근 함께 읽은 기록" }),
  shelf.getByRole("link", {
    name: /responsive reading shelf 회차 기록/,
  }),
);
```

For every viewport, assert:

```ts
await expect(shelf.getByRole("link", {
  name: "전체 세션 기록 보기",
})).toHaveAttribute(
  "href",
  `${scopedAppPath}/archive?view=sessions`,
);
await expect(shelf.getByRole("link", {
  name: /계정 (관리|설정)/,
})).toHaveCount(0);
await expectPracticalTapTarget(
  shelf.getByRole("button", { name: "이름 변경" }),
);
```

Replace the old two-column assertion with a continuous-surface assertion:

```ts
const layout = await overview.evaluate((element) => {
  const profile = element.querySelector(".rm-member-profile")!;
  const achievement = element.querySelector(".rm-reading-achievement")!;
  const overviewBox = element.getBoundingClientRect();
  const profileBox = profile.getBoundingClientRect();
  const achievementBox = achievement.getBoundingClientRect();

  return {
    display: getComputedStyle(element).display,
    width: overviewBox.width,
    profileTop: profileBox.top,
    profileBottom: profileBox.bottom,
    achievementTop: achievementBox.top,
    profileLeft: profileBox.left,
    achievementLeft: achievementBox.left,
  };
});

expect(layout.display).toBe("block");
expect(layout.width).toBeLessThanOrEqual(1080);
expect(layout.profileTop).toBeLessThan(layout.achievementTop);
expect(layout.profileBottom).toBeLessThanOrEqual(layout.achievementTop + 1);
expect(Math.abs(layout.profileLeft - layout.achievementLeft)).toBeLessThanOrEqual(1);
```

Keep the existing 1280px, 390px, 320px, 200% zoom, overflow, screenshot, focus-visible, and reduced-motion checks.

- [x] **Step 2: Update navigation and permission E2E copy**

In `member-profile-permissions.spec.ts`:

- change profile editing from `프로필 수정` to `이름 변경`;
- suspended, viewer, and empty shelves must contain no `계정 관리` or `계정 설정` link;
- direct settings tests expect `계정 설정`, read-only email/display name, no `이름 변경`, and `클럽 탈퇴…`;
- remove the old assertion that settings exposes an editable profile;
- leave host member-list editing tests unchanged because that is a separate host workflow.

Use these concrete restricted-member assertions:

```ts
await expect(shelf.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
await expect(shelf.getByRole("link", {
  name: /계정 (관리|설정)/,
})).toHaveCount(0);
```

In `responsive-navigation-chrome.spec.ts`:

- change every global menu lookup from `계정 관리` to `계정 설정`;
- replace `.rm-member-profile__actions` layout checks with `.rm-member-profile__name-row` and the `이름 변경` 44px target;
- settings must show `← 내 공간`, `계정 설정`, and `클럽 탈퇴…`;
- clicking `내 공간` from settings must return to `${baselineClubAppPath}/me`;
- keyboard order remains trigger, `내 공간`, `계정 설정`, logout;
- keep direct `/app/me/records` load-more error and retry coverage unchanged.

Before the settings return link assertion, prove ordinary browser history still works:

```ts
await page.goBack();
await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me/records$`));
await page.getByRole("button", { name: /계정 메뉴$/ }).click();
await page.getByRole("link", { name: "계정 설정" }).click();
await expect(page).toHaveURL(
  new RegExp(`${baselineClubAppPath}/me/settings$`),
);
```

Add this settings return flow:

```ts
const backToMySpace = settings.getByRole("link", { name: "내 공간" });
await expect(backToMySpace).toHaveAttribute(
  "href",
  `${baselineClubAppPath}/me`,
);
await expectPracticalTapTarget(backToMySpace);
await backToMySpace.click();
await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me$`));
```

Add this archive destination flow in `member-space-information-architecture.spec.ts`:

```ts
await page.goto(`${scopedAppPath}/me`);
await page.getByRole("link", {
  name: "전체 세션 기록 보기",
}).click();
await expect(page).toHaveURL(
  new RegExp(`${scopedAppPath}/archive\\?view=sessions$`),
);
await expect(page.getByRole("button", { name: "세션" }))
  .toHaveAttribute("aria-pressed", "true");
```

Keep the direct `/app/me/records` pagination test at the start of the file.

- [x] **Step 3: Add public-safe long-identity and missing-month browser coverage**

Extend `ParticipationProfileMode` in `my-reading-shelf-fixtures.ts`:

```ts
type ParticipationProfileMode =
  | "history"
  | "mid-join"
  | "unknown"
  | "empty"
  | "long-identity";
```

Add the mode to `recentAttendancesByMode`:

```ts
"long-identity": historyRecentAttendances,
```

In the fulfilled profile object, set:

```ts
displayName:
  mode === "long-identity"
    ? "아주 긴 한국어 표시 이름과 Long English Display Name"
    : profile.displayName,
clubName:
  mode === "long-identity"
    ? "아주 긴 한국어 독서 모임과 Long English Reading Club"
    : profile.clubName,
joinedAt: mode === "long-identity" ? "" : "2025-01",
```

Add this test to `member-space-information-architecture.spec.ts`:

```ts
test("long identity wraps without inventing a missing joined month", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "long-identity");
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, memberEmail);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/app/me");

  const shelf = page.locator(".rm-member-space");
  await expect(shelf.getByRole("heading", {
    level: 1,
    name: "아주 긴 한국어 표시 이름과 Long English Display Name",
  })).toBeVisible();
  await expect(shelf.getByText(
    "아주 긴 한국어 독서 모임과 Long English Reading Club · 멤버",
  )).toBeVisible();
  await expect(shelf.getByText(/부터 함께/)).toHaveCount(0);
  await expectPracticalTapTarget(
    shelf.getByRole("button", { name: "이름 변경" }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
```

- [x] **Step 4: Run the focused E2E files and confirm CSS and copy failures**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: FAIL before CSS updates because the overview is still a two-column grid, old selectors remain, settings has no back styling, and the final leave action has no danger treatment.

- [x] **Step 5: Replace the split overview and action-row CSS**

Use a block paper surface:

```css
.rm-member-space__overview {
  display: block;
  min-width: 0;
  border: 1px solid var(--line);
  background: var(--surface);
}

.rm-member-profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  gap: 10px 16px;
  min-width: 0;
  padding: 32px;
  border-bottom: 1px solid var(--line);
}

.rm-member-profile__name-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rm-member-profile__edit {
  min-width: 44px;
  min-height: 44px;
  flex: 0 0 auto;
}

.rm-member-profile__field {
  min-width: 0;
}

.rm-member-profile__field label {
  display: block;
  font-size: 0.875rem;
}

.rm-member-profile__field .input {
  width: 100%;
  min-width: 0;
  height: 40px;
  margin-top: 7px;
}

.rm-member-profile__error {
  margin-top: 7px;
  color: var(--danger);
}

.rm-member-profile__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: end;
  margin-top: 12px;
}

.rm-reading-achievement {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
  column-gap: 48px;
  min-width: 0;
  padding: 32px;
}

.rm-reading-achievement > :not(.rm-reading-achievement__metrics) {
  grid-column: 1;
}

.rm-reading-achievement__metrics {
  grid-column: 2;
  grid-row: 1 / span 3;
  align-self: center;
}
```

Delete `.rm-member-profile__actions`, `.rm-member-profile__settings`, their hover/focus rules, the `:only-child` rule, and the old `:has()` row-shifting rule. Include `.rm-member-profile__edit` in the focus-visible selector.

- [x] **Step 6: Add settings, return-link, and termination CSS**

Use:

```css
.rm-account-settings-page__back {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 650;
  text-decoration: none;
}

.rm-account-settings-page h2 {
  margin: 0 0 12px;
  color: var(--text);
  font-family: var(--font-editorial);
  font-size: 1.1rem;
  line-height: 1.3;
}

.rm-account-settings-page__summary dl {
  display: grid;
  margin: 0;
  border-top: 1px solid var(--line-soft);
}

.rm-account-settings-page__summary dl > div {
  display: grid;
  grid-template-columns: minmax(88px, 0.45fr) minmax(0, 1fr);
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-soft);
}

.rm-account-settings-page__summary dt {
  color: var(--text-3);
  font-size: 0.8125rem;
}

.rm-account-settings-page__summary dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.rm-account-settings-page__termination {
  padding: 22px;
}

.rm-account-settings-page__termination-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.rm-account-settings-page__termination-row p,
.rm-account-settings-page__termination-confirm p {
  margin: 0;
  color: var(--text-2);
  font-size: 0.875rem;
  line-height: 1.6;
}

.rm-account-settings-page__termination-confirm {
  margin-top: 16px;
  padding: 18px;
}

.rm-account-settings-page__termination-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.rm-account-settings-page__danger-action {
  border-color: var(--danger);
  color: var(--danger);
}

.rm-account-settings-page__danger-action:hover {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.rm-account-settings-page__success {
  margin: 14px 0 0;
  color: var(--ok);
}

.rm-account-settings-page__error {
  margin: 14px 0 0;
  color: var(--danger);
}

.rm-account-settings-page__back:focus-visible,
.rm-account-settings-page__danger-action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}
```

Replace the old membership-only summary selectors with the shared summary selectors above.

- [x] **Step 7: Update the mobile composition without changing DOM order**

Inside the existing `@media (max-width: 768px)` block, use:

```css
.rm-member-profile {
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 14px;
  padding: 24px 20px;
}

.rm-member-profile__name-row {
  align-items: flex-start;
}

.rm-member-profile__edit {
  width: auto;
}

.rm-member-profile__form {
  grid-template-columns: minmax(0, 1fr) auto;
}

.rm-member-profile__form > .rm-member-profile__field {
  grid-column: 1 / -1;
}

.rm-reading-achievement {
  display: block;
  padding: 28px 20px;
}

.rm-reading-achievement__metrics {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.rm-account-settings-page__summary dl > div {
  grid-template-columns: minmax(78px, 0.4fr) minmax(0, 1fr);
  gap: 10px;
}

.rm-account-settings-page__termination-row {
  align-items: stretch;
  flex-direction: column;
}

.rm-account-settings-page__termination-row .btn {
  align-self: flex-start;
}
```

Delete the old mobile `.rm-member-profile__actions` two-column grid rules. Keep safe-area bottom padding and `.rm-account-settings-page .btn { min-block-size: 44px; }`.

- [x] **Step 8: Run focused unit tests and the three E2E files**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  features/archive/ui/account-settings-page.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  features/archive/route/account-settings-route.test.tsx \
  features/auth/ui/account-menu.test.tsx \
  features/auth/route/account-menu-controller.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS, including 320px, 390px, desktop, 200% zoom, keyboard focus, scoped archive navigation, settings return, and direct personal-record pagination.

- [x] **Step 9: Commit responsive and browser evidence**

```bash
git add \
  front/src/styles/globals.css \
  front/tests/e2e/my-reading-shelf-fixtures.ts \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts \
  front/tests/e2e/responsive-navigation-chrome.spec.ts
git commit -m "feat(front): polish member account and archive UX"
```

---

### Task 7: Align architecture and release notes, then run the complete frontend gates

**Files:**
- Modify: `docs/development/architecture.md:337-349`
- Modify: `CHANGELOG.md:9-21`
- Verify: all Task 1-6 files

**Interfaces:**
- Documents the exact shipped ownership and compatibility contract.
- Adds no product code.

- [x] **Step 1: Update the architecture facts**

Replace the current `/app/me` navigation paragraph with:

```md
`/app/me` loader는 profile과 `limit=3` journey를 병렬 로드하며, 누적 `summary`는 page 크기와 무관하게 유지됩니다. 화면은 표시 이름과 inline `이름 변경`, 현재 클럽 멤버십 맥락, 누적 독서 성취가 이어지는 하나의 overview와 서버 정렬 순서를 따르는 최근 개인 기록을 최대 3건 보여줍니다. 최근 row는 club scope를 유지한 회차 상세로 연결되고, section의 `전체 세션 기록 보기`는 canonical `/app/archive?view=sessions`로 이어집니다.

`/app/me/records`는 `limit=12`부터 cursor continuation을 누적하는 개인 활동 기반 전체 목록으로 직접 접근과 기존 deep link를 유지하지만 `/app/me`의 새 사용자 진입점으로 노출하지 않습니다. 개인 journey와 archive sessions의 포함 조건이 다르므로 이 route를 삭제하거나 archive로 redirect하지 않습니다.

계정·멤버십 정보와 탈퇴는 `/app/me/settings`, 알림 수신 설정은 알림함과 나란한 `/app/notifications/settings`가 소유합니다. 전역 계정 메뉴는 `내 공간`, `계정 설정`, `로그아웃`을 제공하고, `/app/me/settings`는 scoped `← 내 공간` 복귀 링크를 제공합니다. 표시 이름 편집은 `/app/me`만 소유하며 profile update controller, auth refresh, route revalidation 계약을 유지합니다. `/app/me/settings`에는 이름 편집과 로그아웃을 중복하지 않습니다.
```

- [x] **Step 2: Update `CHANGELOG.md` Unreleased**

Replace the current `멤버 내 공간 경로` entry with:

```md
- **멤버 내 공간·계정·기록 동선:** `/app/me`는 표시 이름과 inline `이름 변경`, 현재 클럽 맥락, 누적 성취가 한 지면에서 이어지며 프로필 안의 중복 계정 설정 action을 제거합니다. 전역 계정 메뉴는 `내 공간`, `계정 설정`, `로그아웃`을 제공하고, `/app/me/settings`는 읽기 전용 계정·멤버십 정보와 `← 내 공간`, 단계형 클럽 탈퇴를 제공합니다. 최근 개인 기록의 `전체 세션 기록 보기`는 `/app/archive?view=sessions`로 연결하며 `/app/me/records` direct deep link와 cursor pagination은 유지합니다.
```

- [x] **Step 3: Scan the diff for stale copy, props, and accidental scope expansion**

Run:

```bash
rg -n \
  "accountSettingsHref|recordsHref|PreferencesSection|variant=\"settings\"|프로필 수정|계정 관리|전체 기록 보기|rm-member-profile__actions|rm-member-profile__settings" \
  front/features/archive \
  front/features/auth \
  front/src/pages \
  front/tests
git diff -- \
  front \
  docs/development/architecture.md \
  CHANGELOG.md
```

Expected: the first command reports no stale product/test occurrences in the touched member-account surfaces. Any deliberate historical text outside the touched files is not rewritten. The diff contains no server, BFF, migration, dependency, or route deletion.

- [x] **Step 4: Run formatting and focused architecture checks**

Run:

```bash
git diff --check
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [x] **Step 5: Run all canonical frontend gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: PASS. Do not run server or public-release gates because this slice changes no server, BFF, deployment, public-release, migration, or package contract.

- [x] **Step 6: Inspect the built UI at bounded viewports**

Using the existing local frontend runtime, verify:

```text
/clubs/reading-sai/app/me at 1280x900
/clubs/reading-sai/app/me at 390x844
/clubs/reading-sai/app/me at 320x700
/clubs/reading-sai/app/me with 200% zoom
/clubs/reading-sai/app/me/settings at 390x844
/clubs/reading-sai/app/archive?view=sessions after the recent-reading CTA
/clubs/reading-sai/app/me/records by direct URL
```

For each viewport confirm no horizontal overflow, visible focus, 44px controls, the approved DOM order, settings return, archive sessions selected state, and no duplicated account/edit/logout action.

- [x] **Step 7: Commit documentation and gate evidence**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs: align member account and archive navigation"
```

- [x] **Step 8: Record the final verification state**

Run:

```bash
git status --short --branch
git log -7 --oneline --decorate
```

Report:

- changed surface: member-space profile, global account menu, account settings, recent-reading navigation, responsive CSS, frontend tests, architecture, and changelog;
- exact commands that passed;
- any skipped command and reason;
- remaining risk: production data-scope analytics for possible future `/app/me/records` deprecation is outside this implementation and the route intentionally remains available;
- remote actions: no push, pull request, deploy, tag, or production activation unless separately authorized.
