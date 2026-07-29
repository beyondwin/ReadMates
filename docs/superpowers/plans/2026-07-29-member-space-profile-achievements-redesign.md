# ReadMates Member Space Profile and Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/clubs/:clubSlug/app/me` participation-flow UI with a profile-first member space and an accurate cumulative reading-achievement summary.

**Architecture:** Keep the existing `myPageLoader` requests and server contracts. A pure archive model converts current-membership profile plus `MyJourneySummary` into profile metadata, a narrative, and flexible metrics; route/controller code owns profile mutation and auth refresh; prop-driven UI renders two semantic sections. Reuse one profile update controller across `/app/me` and `/app/me/settings`, leave the records route intact, and remove only the obsolete member-space composition.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vitest 4, Testing Library, Playwright 1.61, Vite 8, repository-pinned `pnpm@11.13.1` through Corepack.

## Global Constraints

- Product surface: member app `/clubs/:clubSlug/app/me`; owning feature: `front/features/archive`.
- Preserve the route-first dependency direction `src/app -> src/pages -> features -> shared`.
- `ui` modules render props and callbacks only; they must not import API, route, auth-state, or `shared/api` modules.
- `model` stays pure and imports no React, router, query, or API client.
- Use existing `/api/app/me`, `/api/archive/me/journey?limit=1`, and `PATCH /api/me/profile`; add no server, BFF, database, or migration change.
- Treat journey summary values as current-membership cumulative values; do not label them as a calendar year.
- Never derive achievement values from `recentAttendances`; unknown attendance is not displayed or inferred.
- Always render `함께한 모임` and `완독`; render `질문` and `서평` only when each value is greater than zero.
- Keep `/app/me/records` and `/app/me/settings` routes; remove the records link, timeline, nudge, and bottom logout only from `/app/me`.
- Keep email, account name, membership details, and leave action in `/app/me/settings`; keep logout in the existing account menu.
- Use an initial avatar only; do not add profile-image upload or claim that `/api/app/me` supplies an image.
- Mobile actions must be at least 44px, Korean and English text must wrap, WCAG AA contrast and visible focus must remain, and 200% zoom must not create horizontal page overflow.
- Use the existing paper, ink, rule, editorial typography, and restrained mint/ink-blue accents; do not add gradients, glow, glassmorphism, charts, badges, or circular attendance markers.
- Do not persist real member data, private domains, secrets, local absolute paths, or token-shaped examples.
- Current branch includes the approved design-spec commit `adec8196`; do not rewrite or amend it.

## Scope and Dependency Map

| Task | Deliverable | Depends on |
| --- | --- | --- |
| 1 | Pure cumulative member-space view model | Approved design spec |
| 2 | Shared profile update controller | Existing profile API and error mapping |
| 3 | Profile and achievement presentation components | Tasks 1 and existing `ProfileNameEditor` |
| 4 | `/app/me` route/page composition switch and obsolete UI removal | Tasks 1–3 |
| 5 | Responsive styling and member-space E2E contract replacement | Task 4 |
| 6 | CHANGELOG, boundary checks, full gates, bounded browser verification | Tasks 1–5 |

Tasks are sequential because Tasks 3–5 share component, route, CSS, and E2E contracts. Do not dispatch them in parallel. No task owns a database, container, provider, deployment, or production mutation.

## Acceptance Matrix

- Selected `Actor or authorization`: active members may edit their display name; viewer, suspended, left, invited, and inactive states must not receive the edit action. Evidence: controller/component tests and `member-profile-permissions.spec.ts`.
- Selected `UI or runtime state`: cover cumulative-empty, positive/zero optional metrics, profile-save error and pending state, long wrapping, desktop, 390px, 320px, keyboard focus, and 200% zoom. Evidence: model/component tests plus focused Playwright and browser inspection.
- Excluded `Club context`: loader club scoping and `ArchiveLink` path resolution are unchanged. Keep one scoped account-settings navigation assertion, but do not expand BFF or server club-isolation tests.
- Excluded `BFF or OAuth`: no proxy, cookie, redirect, or trusted-header contract changes.
- Excluded `Cursor collection`: `/app/me/records` and its pagination remain intact; only its link disappears from `/app/me`.
- Excluded `Session lifecycle`, `publication visibility`, `persistence or migration`, and `async, cache, or provider`: the slice reads existing summary/profile contracts and changes no lifecycle, visibility, storage, queue, or provider behavior.

---

### Task 1: Replace participation calculations with a cumulative member-space view model

**Files:**
- Modify: `front/features/archive/model/my-reading-shelf-model.ts`
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts`

**Interfaces:**
- Consumes: `MyPageProfile`, `MyJourneySummary`, `clubDisplayName`, `membershipIdentityLabel`, `formatJoinedMonth`.
- Produces:

```ts
export type MemberSpaceMetric = {
  label: "함께한 모임" | "완독" | "질문" | "서평";
  value: string;
};

export type MemberSpaceViewModel = {
  avatarLabel: string;
  profileMetaLabel: string;
  joinedMonthLabel: string | null;
  achievementHeading: string;
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.";
  metrics: MemberSpaceMetric[];
};

export function buildMemberSpaceViewModel(input: {
  profile: Pick<MyPageProfile, "displayName" | "clubName" | "role" | "membershipStatus" | "joinedAt">;
  summary: MyJourneySummary;
  today: Date;
}): MemberSpaceViewModel;
```

- Keeps: `emptyMyJourneyPage`, `appendUniqueJourneyItems`, `groupJourneyByYear`, and their record-page contracts.
- Removes: `ParticipationTimelineItem`, `ParticipationJourneyViewModel`, `participationTimelineItem`, and `buildParticipationJourneyViewModel`.

- [ ] **Step 1: Replace participation-model tests with failing cumulative-summary tests**

Keep the existing journey paging/grouping tests, then replace attendance-timeline cases with exact expectations:

```ts
const profile = {
  displayName: "멤버1",
  clubName: "읽는사이",
  role: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  joinedAt: "2025-11",
};

expect(buildMemberSpaceViewModel({
  profile,
  summary: {
    attendedSessionCount: 3,
    completedReadingCount: 3,
    questionCount: 12,
    reviewCount: 0,
    readableFeedbackDocumentCount: 2,
  },
  today: new Date(2026, 6, 29),
})).toEqual({
  avatarLabel: "멤",
  profileMetaLabel: "읽는사이 · 멤버 · 함께한 지 8개월",
  joinedMonthLabel: "2025.11",
  achievementHeading: "세 번의 모임에서 세 권을 끝까지 읽었어요.",
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
  metrics: [
    { label: "함께한 모임", value: "3" },
    { label: "완독", value: "3" },
    { label: "질문", value: "12" },
  ],
});
```

Add table cases for:

```ts
[
  { attended: 0, completed: 0, heading: "첫 모임부터 이곳에 독서 기록이 쌓여요." },
  { attended: 3, completed: 0, heading: "세 번의 모임을 함께했어요." },
  { attended: 9, completed: 7, heading: "9번의 모임에서 7권을 끝까지 읽었어요." },
]
```

Also assert:

```ts
expect(viewModel.metrics.map(({ label }) => label)).toEqual(["함께한 모임", "완독"]);
expect(buildWithJoinedAt("2026-08").joinedMonthLabel).toBeNull();
expect(buildWithJoinedAt("not-a-month").profileMetaLabel).not.toContain("함께한 지");
expect(buildWithDisplayName("   ").avatarLabel).toBe("멤");
```

- [ ] **Step 2: Run the focused model test and verify the new contract fails**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because `buildMemberSpaceViewModel` and `MemberSpaceViewModel` do not exist and participation-only exports remain.

- [ ] **Step 3: Implement the minimal cumulative view model**

Use exact narrative rules without reading `recentAttendances`:

```ts
function countWord(count: number, counter: "번" | "권") {
  const native = count === 1 ? "한" : count === 2 ? "두" : count === 3 ? "세" : String(count);
  return `${native}${count <= 3 ? " " : ""}${counter}`;
}

function achievementHeading(summary: MyJourneySummary) {
  if (summary.attendedSessionCount === 0) {
    return "첫 모임부터 이곳에 독서 기록이 쌓여요.";
  }
  if (summary.completedReadingCount === 0) {
    return `${countWord(summary.attendedSessionCount, "번")}의 모임을 함께했어요.`;
  }
  return `${countWord(summary.attendedSessionCount, "번")}의 모임에서 ${countWord(summary.completedReadingCount, "권")}을 끝까지 읽었어요.`;
}
```

Build the metric array in fixed semantic order and append question/review only when positive. Use `membershipDurationLabel(joinedAt, today)` as the validity gate before calling `formatJoinedMonth(joinedAt)`.

- [ ] **Step 4: Run the focused model test and verify it passes**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: PASS for journey paging/grouping plus all cumulative narrative, optional metric, avatar, and joined-month cases.

- [ ] **Step 5: Commit the model contract**

```bash
git add front/features/archive/model/my-reading-shelf-model.ts front/features/archive/model/my-reading-shelf-model.test.ts
git commit -m "refactor(front): model cumulative member achievements"
```

---

### Task 2: Extract one reusable profile update controller

**Files:**
- Create: `front/features/archive/route/profile-update-controller.ts`
- Create: `front/features/archive/route/profile-update-controller.test.tsx`
- Modify: `front/features/archive/route/account-settings-route.tsx`
- Modify: `front/features/archive/route/account-settings-route.test.tsx`

**Interfaces:**
- Consumes: `updateMyProfile(displayName)`, `profileSaveErrorMessage(code)`, source `MyPageResponse`, auth refresh callback, route revalidation callback.
- Produces:

```ts
export function useProfileUpdateController(input: {
  sourceProfile: MyPageResponse;
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
  onRevalidate: () => void;
}): {
  profile: MyPageResponse;
  updateProfile: (displayName: string) => Promise<MemberProfileResponse>;
};
```

- Guarantee: both `/app/me` and `/app/me/settings` decode API errors, retain an optimistic updated name, refresh auth, and revalidate in the same order.

- [ ] **Step 1: Write failing hook tests for success, denied mutation, and API error decoding**

Mock `archive-api.updateMyProfile`, then use `renderHook`:

```tsx
const { result } = renderHook(() => useProfileUpdateController({
  sourceProfile: profile,
  canEditProfile: true,
  onProfileUpdated,
  onRevalidate,
}));

await act(async () => {
  await expect(result.current.updateProfile("새 이름")).resolves.toEqual(updatedProfile);
});

expect(api.updateMyProfile).toHaveBeenCalledWith("새 이름");
expect(onProfileUpdated).toHaveBeenCalledOnce();
expect(onRevalidate).toHaveBeenCalledOnce();
expect(result.current.profile.displayName).toBe("새 이름");
```

Add:

```ts
await expect(denied.current.updateProfile("새 이름"))
  .rejects.toThrow("현재 상태에서는 프로필을 수정할 수 없습니다.");

api.updateMyProfile.mockResolvedValue(response(false, { code: "DISPLAY_NAME_DUPLICATE" }));
await expect(result.current.updateProfile("중복 이름"))
  .rejects.toThrow("같은 클럽에서 이미 쓰고 있는 이름입니다.");
```

- [ ] **Step 2: Run the new controller test and verify it fails**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/route/profile-update-controller.test.tsx
```

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Move profile response parsing and optimistic override into the controller**

Move `isRecord`, response-code parsing, `updateMyProfile`, `setProfileOverrideState`, and permission rejection from `AccountSettingsRoute` into `useProfileUpdateController`. Preserve the current order:

```ts
const response = await updateMyProfile(displayName);
if (!response.ok) {
  throw new Error(profileSaveErrorMessage(await profileErrorCodeFromResponse(response)));
}
const updatedProfile = await response.json();
await onProfileUpdated();
setProfileOverrideState({ sourceData: sourceProfile, profile: updatedProfile });
onRevalidate();
return updatedProfile;
```

In `AccountSettingsRoute`, keep leave-membership ownership and replace the duplicated profile flow:

```ts
const revalidator = useRevalidator();
const { profile, updateProfile } = useProfileUpdateController({
  sourceProfile: data,
  canEditProfile,
  onProfileUpdated,
  onRevalidate: revalidator.revalidate,
});
```

- [ ] **Step 4: Run controller and account-settings route tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/route/account-settings-route.test.tsx
```

Expected: PASS, including the existing profile success/error and leave-membership failure contracts.

- [ ] **Step 5: Commit the shared mutation boundary**

```bash
git add \
  front/features/archive/route/profile-update-controller.ts \
  front/features/archive/route/profile-update-controller.test.tsx \
  front/features/archive/route/account-settings-route.tsx \
  front/features/archive/route/account-settings-route.test.tsx
git commit -m "refactor(front): share member profile update flow"
```

---

### Task 3: Build profile-first and achievement presentation components

**Files:**
- Create: `front/features/archive/ui/my-page/member-profile-summary.tsx`
- Create: `front/features/archive/ui/my-page/reading-achievement-summary.tsx`
- Create: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Modify: `front/features/archive/ui/my-page/profile-name-editor.tsx`
- Modify: `front/features/archive/ui/my-page/preferences-section.tsx`

**Interfaces:**
- `MemberProfileSummary` consumes `MyPageProfile`, `MemberSpaceViewModel`, `canEditProfile`, and `onUpdateProfile`.
- `ReadingAchievementSummary` consumes `MemberSpaceViewModel`.
- `ProfileNameEditor` keeps one update contract and supports:

```ts
export type ProfileNameEditorProps = {
  data: MyPageProfile;
  canEditProfile?: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
  variant: "settings" | "member-space";
  headingId?: string;
};
```

- The member-space variant renders the display name as the page `h1`, labels its action `프로필 수정`, and never renders a disabled `변경 준비 중` control when permission is absent.

- [ ] **Step 1: Write failing component tests for hierarchy and editor states**

Render `MemberProfileSummary` and assert:

```tsx
expect(screen.getByText("내 프로필")).toBeVisible();
expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toBeVisible();
expect(screen.getByText("읽는사이 · 멤버 · 함께한 지 8개월")).toBeVisible();
expect(screen.getByRole("button", { name: "프로필 수정" })).toBeVisible();
expect(screen.getByRole("link", { name: "계정 관리" })).toHaveAttribute(
  "href",
  "/app/me/settings",
);
```

For `canEditProfile={false}`:

```tsx
expect(screen.queryByRole("button", { name: "프로필 수정" })).toBeNull();
expect(screen.queryByLabelText("이름 변경 준비 중")).toBeNull();
expect(screen.getByRole("link", { name: "계정 관리" })).toBeVisible();
```

Render `ReadingAchievementSummary` and assert the heading, body, `dl` labels, and exact order. Verify no `2026`, `최근`, `연속`, list, chart, or records link exists.

- [ ] **Step 2: Run the new component test and verify it fails**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
```

Expected: FAIL because both section components and the member-space editor variant are absent.

- [ ] **Step 3: Implement the two semantic sections**

Use this structure:

```tsx
<section className="rm-member-profile" aria-labelledby="member-profile-name">
  <div className="rm-member-profile__avatar" aria-hidden>{viewModel.avatarLabel}</div>
  <div className="rm-member-profile__body">
    <p className="rm-member-space-kicker">내 프로필</p>
    <ProfileNameEditor
      data={profile}
      canEditProfile={canEditProfile}
      onUpdateProfile={onUpdateProfile}
      variant="member-space"
      headingId="member-profile-name"
    />
    <p className="rm-member-profile__meta">{viewModel.profileMetaLabel}</p>
  </div>
  <Link className="rm-member-profile__settings" to="/app/me/settings">계정 관리</Link>
</section>
```

Use this achievement structure:

```tsx
<section className="rm-reading-achievement" aria-labelledby="reading-achievement-heading">
  <p className="rm-member-space-kicker">함께 읽어 온 기록</p>
  <h2 id="reading-achievement-heading">{viewModel.achievementHeading}</h2>
  <p>{viewModel.achievementBody}</p>
  <dl>
    {viewModel.metrics.map((metric) => (
      <div key={metric.label}>
        <dt>{metric.label}</dt>
        <dd>{metric.value}</dd>
      </div>
    ))}
  </dl>
  {viewModel.joinedMonthLabel ? (
    <p className="rm-reading-achievement__joined">
      <span>멤버십 시작</span>
      <strong>{viewModel.joinedMonthLabel}</strong>
    </p>
  ) : null}
</section>
```

The editor form keeps visible `이름`, `저장`, and `취소` controls plus `role="alert"`. The settings variant keeps its existing labels and behavior.

- [ ] **Step 4: Run the component and account-settings UI tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/account-settings-page.test.tsx
```

Expected: PASS; account settings still exposes profile, membership, and leave without a page-local logout.

- [ ] **Step 5: Commit the new presentation units**

```bash
git add \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/reading-achievement-summary.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/preferences-section.tsx
git commit -m "feat(front): add member profile achievement sections"
```

---

### Task 4: Switch `/app/me` to the new route and page composition

**Files:**
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/route/my-page-route.test.tsx`
- Modify: `front/src/pages/my-page.tsx`
- Modify: `front/src/pages/my-page.test.tsx`
- Delete: `front/features/archive/ui/my-page/participation-achievement.tsx`
- Delete: `front/features/archive/ui/my-page/participation-journey.tsx`
- Delete: `front/features/archive/ui/my-page/participation-journey.test.tsx`
- Delete: `front/features/archive/ui/my-page/participation-nudge.tsx`
- Delete: `front/features/archive/ui/my-page/participation-timeline.tsx`
- Delete: `front/features/archive/ui/my-page/participation-timeline.test.tsx`
- Delete: `front/features/archive/ui/my-page/supporting-reading-stats.tsx`
- Delete: `front/features/archive/ui/my-page/member-space-account-actions.tsx`

**Interfaces:**
- `MyPageRoute` props become:

```ts
{
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
}
```

- `MyReadingShelf` props become:

```ts
{
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
}
```

- `front/src/pages/my-page.tsx` owns auth-state access and no longer imports `LogoutButton`.

- [ ] **Step 1: Rewrite route/page tests to the new contract and verify old UI is absent**

In `my-page-route.test.tsx`, assert:

```tsx
expect(screen.getByRole("heading", { level: 1, name: "샘플 멤버" })).toBeVisible();
expect(screen.getByText("9번의 모임에서 7권을 끝까지 읽었어요.")).toBeVisible();
expect(screen.getByRole("link", { name: "계정 관리" })).toBeVisible();
expect(screen.queryByRole("list", { name: "최근 참여 대상 회차" })).toBeNull();
expect(screen.queryByRole("link", { name: "이번 세션 보기" })).toBeNull();
expect(screen.queryByRole("link", { name: "내 책별 기록 전체 보기" })).toBeNull();
expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
```

In `front/src/pages/my-page.test.tsx`, mock `useAuth`, `useAuthActions`, and `MyPageRoute`; verify active auth passes `canEditProfile={true}` and `refreshAuth`, while viewer/suspended states pass `false`. Remove page-local logout request tests because logout remains covered by account-menu tests.

- [ ] **Step 2: Run route/page tests and verify they fail against the old composition**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-route.test.tsx \
  src/pages/my-page.test.tsx
```

Expected: FAIL because `MyPageRoute` still builds the participation view model and receives `logoutControl`.

- [ ] **Step 3: Wire the shared controller and new sections**

In `MyPageRoute`:

```tsx
const { profile: sourceProfile, journey } = useLoaderData() as MyPageRouteData;
const revalidator = useRevalidator();
const { profile, updateProfile } = useProfileUpdateController({
  sourceProfile,
  canEditProfile,
  onProfileUpdated,
  onRevalidate: revalidator.revalidate,
});
const viewModel = buildMemberSpaceViewModel({
  profile,
  summary: journey.summary,
  today: new Date(),
});

return (
  <MyPage
    profile={profile}
    viewModel={viewModel}
    canEditProfile={canEditProfile}
    onUpdateProfile={updateProfile}
  />
);
```

In the page composition:

```tsx
const authState = useAuth();
const { refreshAuth } = useAuthActions();
const canEditProfile = authState.status === "ready" && canEditOwnProfile(authState.auth);

return <MyPageRoute canEditProfile={canEditProfile} onProfileUpdated={refreshAuth} />;
```

Compose `MemberProfileSummary` before `ReadingAchievementSummary` in `MyReadingShelf`.

- [ ] **Step 4: Delete obsolete participation-only presentation files and imports**

Run the contract scan:

```bash
rg -n "ParticipationJourney|ParticipationTimeline|ParticipationNudge|MemberSpaceAccountActions|buildParticipationJourneyViewModel" front
```

Expected after deletion: no production import remains. Test references may remain only in the E2E files scheduled for Task 5.

- [ ] **Step 5: Run all focused model, controller, section, route, and page tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/account-settings-page.test.tsx \
  src/pages/my-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the route composition switch**

```bash
git add -A -- \
  front/features/archive/ui/my-page \
  front/features/archive/route/my-page-route.tsx \
  front/features/archive/route/my-page-route.test.tsx \
  front/src/pages/my-page.tsx \
  front/src/pages/my-page.test.tsx
git commit -m "feat(front): make member space profile first"
```

---

### Task 5: Replace responsive styles and browser contracts

**Files:**
- Modify: `front/src/styles/globals.css:5730-6046`
- Modify: `front/src/styles/globals.css:6555-6660`
- Modify: `front/tests/e2e/member-space-information-architecture.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify when needed for deterministic cases: `front/tests/e2e/my-reading-shelf-fixtures.ts`

**Interfaces:**
- New stable selectors: `.rm-member-space`, `.rm-member-profile`, `.rm-member-profile__actions`, `.rm-reading-achievement`, `.rm-reading-achievement__metrics`.
- Removes all `.rm-participation-*` and `.rm-member-space-account-actions*` style contracts.
- Browser semantics: profile `h1` → account-management link → achievement `h2` → metric `dl` → joined-month row.

- [ ] **Step 1: Rewrite focused E2E assertions before changing CSS**

Replace the old timeline/records/logout flow with:

```ts
await expectDomOrder(
  shelf.getByRole("heading", { level: 1, name: "멤버1" }),
  shelf.getByRole("link", { name: "계정 관리" }),
  shelf.getByRole("heading", { level: 2, name: "세 번의 모임에서 세 권을 끝까지 읽었어요." }),
  shelf.getByText("함께한 모임"),
  shelf.getByText("완독"),
  shelf.getByText("질문"),
);

await expect(page.getByRole("list", { name: "최근 참여 대상 회차" })).toHaveCount(0);
await expect(page.getByRole("link", { name: "내 책별 기록 전체 보기" })).toHaveCount(0);
await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
```

Add:

- active member opens `프로필 수정`, saves a new name through a mocked `PATCH /api/bff/api/me/profile`, then sees the new `h1` and updated account-menu accessible name;
- unknown recent attendance fixture still renders only journey-summary counts and no `?`, `미확인`, `최근`, or `연속` copy;
- zero question/review fixture renders only `함께한 모임` and `완독`;
- viewer/suspended member has no profile-edit button but retains the account-management link;
- desktop 1280×900, mobile 390×844, narrow 320×700, and 200% zoom retain semantic order and no horizontal page overflow;
- `프로필 수정` and `계정 관리` are at least 44px on mobile and keyboard focus indicators are visible.

Keep `/app/me/records` pagination tests that navigate directly to that route; remove only the expectation that `/app/me` links there.

- [ ] **Step 2: Run the focused Playwright files and verify the old UI fails the new contract**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: FAIL on missing profile-first headings/actions and presence of the old timeline/link/logout.

- [ ] **Step 3: Replace the member-space CSS block**

Implement:

```css
.rm-member-space {
  width: min(100% - 32px, 920px);
  margin: 0 auto;
  padding: 48px 0 88px;
}

.rm-member-profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--line);
}

.rm-reading-achievement__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  margin: 28px 0 0;
  border-block: 1px solid var(--line);
}
```

Use existing tokens for paper, text, line, editorial font, focus, and button styles. On the existing mobile breakpoint:

```css
.rm-member-profile {
  grid-template-columns: auto minmax(0, 1fr);
}

.rm-member-profile__actions {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.rm-member-profile__actions > :is(a, button) {
  min-height: 44px;
}
```

Allow the metric grid to wrap; do not add horizontal scrolling. Remove old participation/timeline/nudge/records-action/account-action selectors rather than leaving dead CSS.

- [ ] **Step 4: Run focused E2E and inspect generated artifacts once**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS. Inspect the produced 1280px, 390px, 320px, and 200%-zoom screenshots in one batch. Record all visual defects, fix them in one CSS/component batch, and rerun the same focused command at most once for confirmation.

- [ ] **Step 5: Run the Impeccable mechanical detector once after the UI is final**

Run:

```bash
node ~/.codex/skills/impeccable/scripts/detect.mjs --json \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/reading-achievement-summary.tsx \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/src/styles/globals.css
```

Expected: zero unresolved design-detector findings. Fix reported findings before the task commit; do not rerun the detector.

- [ ] **Step 6: Commit responsive UI and E2E contracts**

```bash
git add \
  front/src/styles/globals.css \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts \
  front/tests/e2e/responsive-navigation-chrome.spec.ts \
  front/tests/e2e/my-reading-shelf-fixtures.ts
git commit -m "test(front): verify profile-first member space"
```

If the fixture file did not change, omit it from `git add`.

---

### Task 6: Update release notes and run the frontend completion gates

**Files:**
- Modify: `CHANGELOG.md:7-25`
- Verify only: all files changed by Tasks 1–5

**Interfaces:**
- CHANGELOG replaces the obsolete participation-journey and bottom-logout claims with the profile-first cumulative-achievement behavior.
- No active architecture document changes: route, API, auth, BFF, persistence, and deployment boundaries are unchanged.

- [ ] **Step 1: Write the Unreleased CHANGELOG replacement**

Replace the obsolete highlight with:

```md
- **프로필 중심의 내 공간:** 내 공간의 최상단에서 표시 이름과 멤버십 맥락을 확인·수정하고 계정 관리로 이동할 수 있습니다. 아래에는 현재 멤버십의 누적 참여·완독·질문·서평을 회고 문장과 간결한 지표로 보여주며, 출석 미확정 타임라인과 아카이브 중복 링크는 제거했습니다.
```

Update the existing route-separation entry so it no longer claims `/app/me` has a bottom logout. State that `/app/me/records` and `/app/me/settings` remain valid routes, account-menu logout remains, and `/app/me` links only to account management.

- [ ] **Step 2: Run focused unit and frontend boundary tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/account-settings-page.test.tsx \
  src/pages/my-page.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run canonical frontend lint, test, and build**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all commands exit 0. If `corepack` is absent, use:

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
```

Report the exact fallback commands if used.

- [ ] **Step 4: Run the complete frontend E2E suite**

Run:

```bash
corepack pnpm --dir front test:e2e
```

Expected: PASS. This is required because the change alters route-owned profile mutation, responsive navigation expectations, and a member user flow.

- [ ] **Step 5: Perform one local browser verification pass**

With the existing local development service or an isolated alternate port, open:

```text
http://localhost:<port>/clubs/reading-sai/app/me
```

Use a local fixture member and verify desktop plus 390px mobile together:

- profile name is the first heading and account management is reachable;
- profile edit success updates the heading and account-menu name;
- cumulative narrative and metric visibility match the API fixture;
- no timeline, current-session nudge, records link, or page-local logout appears;
- no horizontal overflow, clipped Korean/English copy, hidden focus, or bottom-navigation overlap exists.

Do not terminate or reconfigure an existing service to free a port. Record URL, HTTP/listener evidence, selected fixture role, and browser observations without persisting private values.

- [ ] **Step 6: Run diff, dead-contract, and public-safety checks**

Run:

```bash
git diff --check
rg -n "rm-participation|rm-member-space-account-actions|buildParticipationJourneyViewModel|ParticipationJourneyViewModel" front
rg -n "내 책별 기록 전체 보기|최근 참여 대상 회차" front/features/archive front/src/pages
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" CHANGELOG.md
```

Expected:

- `git diff --check` exits 0;
- the two dead-contract scans return no production references;
- E2E may still mention removed labels only in explicit negative assertions;
- the safety scan reports no new private-looking value.

- [ ] **Step 7: Commit the release note and verified final state**

```bash
git add CHANGELOG.md
git commit -m "docs: record profile-first member space"
```

Then report:

- exact focused and canonical commands run;
- automated and manual browser evidence;
- any skipped command with reason;
- remaining risk, especially shared profile editor behavior across `/app/me` and `/app/me/settings`;
- repository-only versus local-runtime evidence;
- no server, BFF, DB, deploy, or production validation was required or performed.

## Completion Criteria

- `/app/me` renders profile first, then cumulative achievements, in one semantic desktop/mobile order.
- Active members can update their display name through the shared controller; denied roles receive no edit affordance.
- Account management remains scoped to `/app/me/settings`; logout remains in the account menu.
- Timeline, streak, nudge, records link, and bottom account/logout section are absent from `/app/me`.
- Journey records and account settings routes continue to work independently.
- Focused model/controller/component/route tests, frontend boundary test, lint, full unit suite, build, focused E2E, and full E2E pass.
- One bounded browser pass confirms desktop and mobile behavior.
- Impeccable detector ran once after final UI edits and has no unresolved findings.
- CHANGELOG Unreleased describes the new behavior without stale participation-journey claims.
