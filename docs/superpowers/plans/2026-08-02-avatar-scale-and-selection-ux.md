# ReadMates Avatar Scale And Selection UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make every user-facing ReadMates avatar legible through a shared responsive size contract, reduce the brand mark to 32px, and make avatar selection discoverable with visible poetic names and the approved filled circular check.

**Architecture:** Keep avatar metadata, keys, artwork, fallback and persistence contracts unchanged. Extend the shared AvatarChip primitive with semantic responsive size roles, migrate member/host/public/guest consumers to those roles, and keep profile-specific naming and selection presentation in the existing archive UI components. CSS owns responsive composition and state styling; routes, queries, APIs, BFF and server code remain untouched.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest, Testing Library, Playwright component tests and E2E, pnpm 11.13.1 through Corepack.

## Global Constraints

- Source of truth: docs/superpowers/specs/2026-08-02-avatar-scale-and-selection-ux-design.md at commit e6cf9b8d.
- Include member, host, public and guest avatar consumers; exclude platform-admin-only surfaces.
- Use these exact desktop/mobile role sizes: navigation 36/36, dense 30/30, author 36/36, member 38/34, roster 42/38, profile 88/64, editor 72/72, picker 64/58 pixels.
- Reduce ReadmatesBrandMark from 34px to 32px on desktop and mobile; do not resize its inner book SVG or unrelated navigation icons.
- Keep all 30 avatar keys, catalog order, poetic labels, objective descriptions, WebP assets, cloud-green-book fallback, API payloads and database values unchanged.
- The profile-editor avatar row remains one button. Its visible hint is exactly 눌러서 다른 아바타 선택 and its accessible name is 아바타 선택, 현재 <서정 이름>.
- Every picker tile displays the complete poetic label without ellipsis. Desktop uses five columns and mobile uses three.
- The approved selected indicator is a 28–30px accent-filled circle with a white round-cap check SVG, inset 8–10px inside the tile.
- Keep selected, hover and focus-visible visually distinct. Preserve aria-pressed and do not rely on the check or color alone.
- Display 나의 아바타 · <서정 이름> below the membership metadata in My Space using supporting text, not a pill or separate card.
- Preserve profile draft, dirty-close, focus trap, opener focus restoration, disabled and save-error behavior.
- Preserve the route-first frontend boundary and keep UI components prop/callback driven.
- Use TDD RED/GREEN and run focused tests before broader gates.
- Use the root-pinned package manager through corepack pnpm.
- Component baseline generation and verification must use the Docker-backed test:ct:update and test:ct commands; do not create host-rendered baselines.
- Generated test-results, Playwright reports and ad-hoc screenshots are evidence artifacts and must not be committed.
- Executing this plan includes narrow local task commits. Do not push, open a PR, tag, deploy or mutate live data without separate authorization.
- Preserve unrelated user changes and stop before editing if a dirty path overlaps a task file.

---

## File Structure

### Shared size contract and navigation

- Create: front/shared/ui/avatar-chip.test.tsx — locks semantic role names, desktop/mobile sizes, numeric-size compatibility and rendered data attributes.
- Modify: front/shared/ui/avatar-chip.tsx — exports the role map/type and renders responsive CSS variables.
- Modify: design/system/src/styles/tokens.css — switches role-sized AvatarChip instances to the mobile variable at the 768px breakpoint.
- Modify: front/shared/ui/avatar-chip.ct.tsx — proves computed role sizes and preserves borderless artwork/fallback behavior.
- Modify: front/shared/ui/readmates-brand-mark.tsx — reduces only the outer mark to 32px.
- Modify: front/shared/ui/readmates-brand-mark.ct.tsx — updates the exact brand bounds.
- Modify: front/features/auth/ui/account-menu.tsx — uses the navigation role.
- Modify: front/features/auth/ui/account-menu.test.tsx — observes the semantic role instead of a raw 32px prop.
- Modify: front/shared/ui/top-nav.tsx — uses the navigation role for its fallback account avatar.
- Modify: front/shared/ui/top-nav.ct.tsx — verifies 36px account identity remains compatible with long names.

### My Space identity and profile editor

- Modify: front/features/archive/ui/my-page/member-profile-summary.tsx — uses the profile role and renders the current poetic name.
- Modify: front/features/archive/ui/my-page/member-space-sections.test.tsx — locks profile role, supporting copy and read-only behavior.
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.tsx — makes the current-avatar row explicitly discoverable and uses the editor role.
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.test.tsx — locks copy, accessible name, navigation and unchanged wire-key saving.
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx — checks the larger action at 320, 390, 1280 and 200-percent zoom.
- Modify: front/src/styles/globals.css — updates profile layout, supporting copy, action row, picker labels and selected/focus styling.
- Modify: front/shared/styles/mobile.css — keeps profile/picker layout usable at mobile widths.

### Picker presentation

- Modify: front/features/archive/ui/my-page/avatar-picker.tsx — renders the poetic label, picker role and approved filled circular check.
- Modify: front/features/archive/ui/my-page/avatar-picker.test.tsx — locks visible labels, aria-pressed, the selected badge and callback/disabled behavior.
- Modify: front/features/archive/ui/my-page/avatar-picker.ct.tsx — checks columns, wrapping, inset badge, focus, scrolling and overflow at all required viewports.

### Avatar consumer migration

- Modify: front/shared/ui/notes-feed-list.tsx — uses author role consistently and adjusts author-row optical indentation.
- Modify: front/features/member-home/ui/member-home-records.tsx — uses author and roster roles.
- Modify: front/features/member-home/ui/member-home-records.test.tsx — locks semantic roles.
- Modify: front/features/member-home/ui/member-home-records.ct.tsx — locks 36px author presentation and responsive overflow.
- Modify: front/features/current-session/ui/current-session-panels.tsx — uses member/dense roles.
- Modify: front/features/current-session/ui/mobile/mobile-prep-segment.tsx — uses the responsive member role.
- Modify: front/features/current-session/ui/mobile/mobile-board-segment.tsx — uses dense role.
- Modify: front/features/archive/ui/member-session-detail-page.tsx — replaces 18–22px branches with dense role.
- Modify: front/features/host/ui/host-session-attendance-editor.tsx — uses member role and widens the avatar grid column.
- Modify: front/features/host/ui/members/member-list.tsx — uses member role.
- Modify: front/features/public/ui/public-session.tsx — uses dense role.
- Modify: front/features/public/ui/public-club.tsx — uses author role.
- Modify: front/features/guest-browse/ui/guest-surfaces.tsx — explicitly assigns member/dense roles instead of the 24px default.
- Modify the focused Vitest files already covering these surfaces: front/tests/unit/notes-feed-page.test.tsx, front/tests/unit/current-session.test.tsx, front/tests/unit/member-session-detail-page.test.tsx, front/tests/unit/host-members.test.tsx, front/tests/unit/public-club.test.tsx and front/features/guest-browse/ui/guest-surfaces.test.tsx.

### Integrated proof

- Modify: front/tests/e2e/account-navigation-avatars.spec.ts — checks profile/picker/navigation/member/dense role bounds, visible names, selected badge containment and persisted naming at mobile/desktop widths.
- Update only expected Docker-rendered baselines under front/__screenshots__/shared/ui and front/__screenshots__/features.

---

### Task 1: Add The Shared Responsive Avatar Role Contract

**Files:**
- Create: front/shared/ui/avatar-chip.test.tsx
- Modify: front/shared/ui/avatar-chip.tsx:1-55
- Modify: design/system/src/styles/tokens.css:496-526
- Modify: front/shared/ui/avatar-chip.ct.tsx:1-260
- Modify: front/shared/ui/readmates-brand-mark.tsx:2-23
- Modify: front/shared/ui/readmates-brand-mark.ct.tsx:1-11
- Modify: front/features/auth/ui/account-menu.tsx:103-123
- Modify: front/features/auth/ui/account-menu.test.tsx:65-89
- Modify: front/shared/ui/top-nav.tsx:304-318
- Modify: front/shared/ui/top-nav.ct.tsx

**Interfaces:**
- Consumes: existing AvatarChip props avatarKey, name, label, size and className; existing rm-avatar-chip CSS custom property.
- Produces: AVATAR_SIZE_ROLES, AvatarSizeRole, optional AvatarChip prop sizeRole, data-avatar-size-role, --avatar-size and --avatar-mobile-size.

- [ ] **Step 1: Add the failing unit contract for all eight roles**

Create front/shared/ui/avatar-chip.test.tsx with this exact observable contract:

~~~tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarChip, AVATAR_SIZE_ROLES, type AvatarSizeRole } from "./avatar-chip";

const expected = [
  ["navigation", 36, 36],
  ["dense", 30, 30],
  ["author", 36, 36],
  ["member", 38, 34],
  ["roster", 42, 38],
  ["profile", 88, 64],
  ["editor", 72, 72],
  ["picker", 64, 58],
] as const satisfies readonly (readonly [AvatarSizeRole, number, number])[];

describe("AvatarChip size roles", () => {
  it.each(expected)("maps %s to desktop %ipx and mobile %ipx", (role, desktop, mobile) => {
    const { container } = render(
      <AvatarChip avatarKey="banana-green-book" name="멤버" label="" sizeRole={role} />,
    );
    const avatar = container.querySelector<HTMLElement>(".rm-avatar-chip")!;
    expect(AVATAR_SIZE_ROLES[role]).toEqual({ desktop, mobile });
    expect(avatar).toHaveAttribute("data-avatar-size-role", role);
    expect(avatar.style.getPropertyValue("--avatar-size")).toBe(desktop + "px");
    expect(avatar.style.getPropertyValue("--avatar-mobile-size")).toBe(mobile + "px");
  });

  it("keeps explicit numeric sizing for raster inspection tests", () => {
    const { container } = render(
      <AvatarChip avatarKey="banana-green-book" name="멤버" label="" size={256} />,
    );
    const avatar = container.querySelector<HTMLElement>(".rm-avatar-chip")!;
    expect(avatar).not.toHaveAttribute("data-avatar-size-role");
    expect(avatar.style.getPropertyValue("--avatar-size")).toBe("256px");
    expect(avatar.style.getPropertyValue("--avatar-mobile-size")).toBe("256px");
  });
});
~~~

- [ ] **Step 2: Run the unit test and verify RED**

Run:

~~~bash
corepack pnpm --dir front exec vitest run shared/ui/avatar-chip.test.tsx
~~~

Expected: FAIL because AVATAR_SIZE_ROLES, AvatarSizeRole, sizeRole, data-avatar-size-role and --avatar-mobile-size do not exist.

- [ ] **Step 3: Implement the shared role map and responsive variables**

Add this contract above AvatarChip in front/shared/ui/avatar-chip.tsx:

~~~tsx
export const AVATAR_SIZE_ROLES = {
  navigation: { desktop: 36, mobile: 36 },
  dense: { desktop: 30, mobile: 30 },
  author: { desktop: 36, mobile: 36 },
  member: { desktop: 38, mobile: 34 },
  roster: { desktop: 42, mobile: 38 },
  profile: { desktop: 88, mobile: 64 },
  editor: { desktop: 72, mobile: 72 },
  picker: { desktop: 64, mobile: 58 },
} as const;

export type AvatarSizeRole = keyof typeof AVATAR_SIZE_ROLES;
~~~

Extend AvatarChip with sizeRole?: AvatarSizeRole. Resolve the variables before rendering:

~~~tsx
const resolvedSize = sizeRole
  ? AVATAR_SIZE_ROLES[sizeRole]
  : { desktop: size, mobile: size };
~~~

Render these attributes on the outer span:

~~~tsx
data-avatar-size-role={sizeRole}
style={{
  "--avatar-size": resolvedSize.desktop + "px",
  "--avatar-mobile-size": resolvedSize.mobile + "px",
} as CSSProperties}
~~~

Add this rule after the artwork styles in design/system/src/styles/tokens.css:

~~~css
@media (max-width: 768px) {
  .rm-avatar-chip[data-avatar-size-role] {
    --avatar-size: var(--avatar-mobile-size) !important;
  }
}
~~~

- [ ] **Step 4: Migrate navigation avatars and reduce only the outer brand mark**

Apply these exact replacements:

| File | Current | Replacement |
| --- | --- | --- |
| front/features/auth/ui/account-menu.tsx | size={32} | sizeRole="navigation" |
| front/shared/ui/top-nav.tsx | size={32} | sizeRole="navigation" |
| front/shared/ui/readmates-brand-mark.tsx | width/height 34px | width/height 32px |

Do not change the 20px SVG inside ReadmatesBrandMark.

- [ ] **Step 5: Update focused assertions and add computed responsive CT coverage**

In account-menu.test.tsx replace the raw --avatar-size assertion with:

~~~tsx
expect(trigger.querySelector(".rm-avatar-chip")).toHaveAttribute(
  "data-avatar-size-role",
  "navigation",
);
expect(
  trigger.querySelector<HTMLElement>(".rm-avatar-chip")?.style.getPropertyValue("--avatar-size"),
).toBe("36px");
~~~

In readmates-brand-mark.ct.tsx expect width and height 32.

In avatar-chip.ct.tsx keep the numeric contact-sheet tests intact and add one test that mounts one AvatarChip per role at 1280px, then at 390px, and compares getBoundingClientRect().width to AVATAR_SIZE_ROLES[role].desktop/mobile. Assert each node has data-avatar-size-role.

Use this assertion shape inside the viewport loop:

~~~tsx
for (const [role, sizes] of Object.entries(AVATAR_SIZE_ROLES)) {
  const avatar = component.locator('[data-avatar-size-role="' + role + '"]');
  await expect(avatar).toHaveAttribute("data-avatar-size-role", role);
  expect((await avatar.boundingBox())?.width).toBe(
    viewport.width <= 768 ? sizes.mobile : sizes.desktop,
  );
}
~~~

In top-nav.ct.tsx assert the account AvatarChip is 36px and the existing long-name overflow checks still pass.

- [ ] **Step 6: Run focused GREEN verification**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  shared/ui/avatar-chip.test.tsx \
  features/auth/ui/account-menu.test.tsx
~~~

Expected: PASS.

Do not run host-rendered Playwright CT. Task 5 runs the Docker CT update and verification after every visual consumer is complete.

- [ ] **Step 7: Review and commit Task 1**

Run:

~~~bash
git diff --check -- \
  front/shared/ui/avatar-chip.tsx \
  front/shared/ui/avatar-chip.test.tsx \
  design/system/src/styles/tokens.css \
  front/shared/ui/avatar-chip.ct.tsx \
  front/shared/ui/readmates-brand-mark.tsx \
  front/shared/ui/readmates-brand-mark.ct.tsx \
  front/features/auth/ui/account-menu.tsx \
  front/features/auth/ui/account-menu.test.tsx \
  front/shared/ui/top-nav.tsx \
  front/shared/ui/top-nav.ct.tsx
git diff --stat
~~~

Expected: only the semantic role contract, navigation migration, brand reduction and focused tests.

Commit:

~~~bash
git add \
  front/shared/ui/avatar-chip.tsx \
  front/shared/ui/avatar-chip.test.tsx \
  design/system/src/styles/tokens.css \
  front/shared/ui/avatar-chip.ct.tsx \
  front/shared/ui/readmates-brand-mark.tsx \
  front/shared/ui/readmates-brand-mark.ct.tsx \
  front/features/auth/ui/account-menu.tsx \
  front/features/auth/ui/account-menu.test.tsx \
  front/shared/ui/top-nav.tsx \
  front/shared/ui/top-nav.ct.tsx
git commit -m "refactor(ui): centralize avatar size roles"
~~~

---

### Task 2: Clarify My Space Identity And Avatar Selection Entry

**Files:**
- Modify: front/features/archive/ui/my-page/member-profile-summary.tsx:1-26
- Modify: front/features/archive/ui/my-page/member-space-sections.test.tsx:1-49
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.tsx:205-255
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.test.tsx:1-230
- Modify: front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx:1-35
- Modify: front/src/styles/globals.css:6733-6890,7789-7801
- Modify: front/shared/styles/mobile.css:100-143

**Interfaces:**
- Consumes: AVATAR_SIZE_ROLES/profile and editor roles from Task 1; bookClubAvatarLabel(value: unknown): string.
- Produces: visible My Space copy 나의 아바타 · <label>; profile-editor button accessible name 아바타 선택, 현재 <label>; visible hint and decorative chevron.

- [ ] **Step 1: Add failing My Space and editor discoverability assertions**

In member-space-sections.test.tsx add these assertions to the read-only identity test:

~~~tsx
expect(artwork).toHaveAttribute("data-avatar-size-role", "profile");
expect(within(section).getByText("나의 아바타 · 한 장 더 읽는 바나나")).toBeVisible();
~~~

Add the same name assertion to the canEditProfile={false} test so read-only memberships keep the current avatar name.

In profile-editor-dialog.test.tsx, before entering the avatar step, assert:

~~~tsx
const avatarAction = within(dialog).getByRole("button", {
  name: "아바타 선택, 현재 한 장 더 읽는 바나나",
});
expect(avatarAction).toHaveTextContent("한 장 더 읽는 바나나");
expect(avatarAction).toHaveTextContent("눌러서 다른 아바타 선택");
expect(avatarAction.querySelector(".rm-avatar-chip")).toHaveAttribute(
  "data-avatar-size-role",
  "editor",
);
expect(avatarAction.querySelector(".rm-profile-editor__avatar-chevron")).toHaveAttribute(
  "aria-hidden",
  "true",
);
~~~

Update existing profile-editor test queries from the exact name 아바타 선택 to the new exact accessible name.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
~~~

Expected: FAIL because My Space omits the avatar name, the editor button still has the old accessible name/hint and both use numeric sizes.

- [ ] **Step 3: Implement My Space avatar naming and responsive profile size**

Import bookClubAvatarLabel beside normalizeBookClubAvatarKey in member-profile-summary.tsx. Resolve:

~~~tsx
const avatarLabel = bookClubAvatarLabel(avatarKey);
~~~

Replace size={72} with sizeRole="profile". Add this line after the membership metadata:

~~~tsx
<p className="rm-member-profile__avatar-name">
  나의 아바타 · {avatarLabel}
</p>
~~~

In globals.css update the integrated profile layout:

~~~css
.rm-member-profile {
  grid-template-columns: 88px minmax(0, 1fr) auto;
}

.rm-member-profile__avatar {
  width: 88px;
  height: 88px;
}

.rm-member-profile__avatar-name {
  margin: 5px 0 0;
  color: var(--text-3);
  font-size: var(--type-size-supporting);
  line-height: var(--type-leading-supporting);
  overflow-wrap: anywhere;
}
~~~

At max-width 768px set the profile grid/avatar to 64px, not 46px:

~~~css
.rm-member-profile {
  grid-template-columns: 64px minmax(0, 1fr);
}

.rm-member-profile__avatar {
  width: 64px;
  height: 64px;
}
~~~

- [ ] **Step 4: Implement the explicit whole-row selection action**

Resolve const currentAvatarLabel = bookClubAvatarLabel(draft.avatarKey) in ProfileEditorDialog. Change the button to:

~~~tsx
<button
  ref={avatarControlRef}
  data-focus-target="avatar"
  type="button"
  className="rm-profile-editor__avatar-action"
  aria-label={"아바타 선택, 현재 " + currentAvatarLabel}
  disabled={saving}
  aria-describedby={errors.avatarKey ? avatarErrorId : undefined}
  onClick={() => setStep("avatar")}
>
  <AvatarChip avatarKey={draft.avatarKey} name={null} label="" sizeRole="editor" />
  <span className="rm-profile-editor__avatar-copy">
    <strong>{currentAvatarLabel}</strong>
    <small>눌러서 다른 아바타 선택</small>
  </span>
  <ChevronIcon />
</button>
~~~

Add this local icon:

~~~tsx
function ChevronIcon() {
  return (
    <svg className="rm-profile-editor__avatar-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
~~~

Add CSS that keeps the whole row one target:

~~~css
.rm-profile-editor__avatar-action {
  min-height: 104px;
}

.rm-profile-editor__avatar-action:hover {
  border-color: var(--line-strong);
  background: var(--bg-sub);
}

.rm-profile-editor__avatar-copy {
  min-width: 0;
  flex: 1;
}

.rm-profile-editor__avatar-copy strong {
  display: block;
  overflow-wrap: anywhere;
}

.rm-profile-editor__avatar-chevron {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
~~~

- [ ] **Step 5: Preserve error focus and responsive containment**

Update every test query that previously used getByRole("button", { name: "아바타 선택" }) to use the current-label accessible name. Keep the existing avatarKey error assertion pointed at this same single button.

In profile-editor-dialog.ct.tsx assert:

- the avatar action contains data-avatar-size-role="editor";
- its computed avatar width is 72px at 320, 390 and 1280;
- its button width stays within the dialog at 320px and 200-percent zoom;
- document scrollWidth remains no larger than clientWidth.

Use the computed role size and containment checks directly:

~~~tsx
const action = dialog.getByRole("button", {
  name: "아바타 선택, 현재 한 장 더 읽는 바나나",
});
const avatar = action.locator('.rm-avatar-chip[data-avatar-size-role="editor"]');
expect((await avatar.boundingBox())?.width).toBe(72);
const [actionBox, dialogBox] = await Promise.all([action.boundingBox(), dialog.boundingBox()]);
expect(actionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
  dialogBox!.x + dialogBox!.width,
);
~~~

- [ ] **Step 6: Run focused GREEN verification**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx \
  tests/unit/my-page.test.tsx
~~~

Expected: PASS with unchanged dirty-close, focus and wire-key save assertions.

- [ ] **Step 7: Review and commit Task 2**

Run:

~~~bash
git diff --check -- \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
~~~

Commit:

~~~bash
git add \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
git commit -m "feat(profile): clarify avatar selection entry"
~~~

---

### Task 3: Show Poetic Names And The Approved Filled Check In The Picker

**Files:**
- Modify: front/features/archive/ui/my-page/avatar-picker.tsx:1-38
- Modify: front/features/archive/ui/my-page/avatar-picker.test.tsx:1-41
- Modify: front/features/archive/ui/my-page/avatar-picker.ct.tsx:1-29
- Modify: front/shared/ui/avatar-chip.ct.tsx:244-260
- Modify: front/src/styles/globals.css:6508-6574,6925-6956
- Modify: front/shared/styles/mobile.css:52-76,133-142

**Interfaces:**
- Consumes: BOOK_CLUB_AVATARS labels/descriptions and picker role from Task 1.
- Produces: rm-avatar-picker__label, rm-avatar-picker__check, five/three-column named tiles and independent selected/focus visuals.

- [ ] **Step 1: Add failing unit assertions for visible names and the approved badge**

In avatar-picker.test.tsx, capture the selected button and assert:

~~~tsx
const selected = screen.getByRole("button", {
  name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택",
});
expect(selected).toHaveAttribute("aria-pressed", "true");
expect(within(selected).getByText("한 장 더 읽는 바나나")).toHaveClass(
  "rm-avatar-picker__label",
);
expect(selected.querySelector(".rm-avatar-chip")).toHaveAttribute(
  "data-avatar-size-role",
  "picker",
);
expect(selected.querySelector(".rm-avatar-picker__check")).toHaveClass(
  "rm-avatar-picker__check--filled",
);
expect(screen.getAllByText(/./, { selector: ".rm-avatar-picker__label" })).toHaveLength(30);
~~~

Keep the existing callback, disabled and aria-describedby assertions.

- [ ] **Step 2: Run the picker unit test and verify RED**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/avatar-picker.test.tsx
~~~

Expected: FAIL because labels are not rendered, the picker uses size={52} and the check lacks the filled variant.

- [ ] **Step 3: Render the name and filled check without changing selection data**

Replace the picker tile body with:

~~~tsx
<AvatarChip avatarKey={key} name={null} label="" sizeRole="picker" />
<span className="rm-avatar-picker__label">{label}</span>
{selected ? (
  <span
    className="rm-avatar-picker__check rm-avatar-picker__check--filled"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
) : null}
~~~

Keep the button aria-label exactly label + ", " + description + " 선택", aria-pressed, aria-describedby, disabled and onClick.

Use this round-cap check path:

~~~tsx
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.2 12.2 10.1 16 18 7.8" />
    </svg>
  );
}
~~~

- [ ] **Step 4: Replace the oversized empty-ring presentation with named tiles**

Update globals.css with these values:

~~~css
.rm-profile-editor .rm-avatar-picker__grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.rm-profile-editor .rm-avatar-picker__tile {
  min-height: 154px;
  padding: 40px 4px 12px;
  display: grid;
  grid-template-rows: auto minmax(2.7em, auto);
  align-content: center;
  justify-items: center;
  gap: 8px;
  border: 1px solid transparent;
  background: transparent;
}

.rm-profile-editor .rm-avatar-picker__tile[aria-pressed="true"] {
  border: 2px solid var(--accent);
  background: var(--accent-soft);
}

.rm-avatar-picker__label {
  min-width: 0;
  color: var(--text-2);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  overflow-wrap: anywhere;
}

.rm-avatar-picker__check--filled {
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: 0;
  background: var(--accent);
  color: var(--paper-50);
  box-shadow: 0 3px 7px oklch(0.35 0.08 255 / 0.2);
}

.rm-avatar-picker__check--filled svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.5;
}

.rm-profile-editor .rm-avatar-picker__tile:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}
~~~

Delete the rm-avatar-picker__tile::after selection/focus ring rules. Selection uses the tile border; focus uses the external outline.

In mobile.css keep three columns, set tile min-height to 148px with padding: 38px 6px 10px, and remove the old --avatar-size: 48px override because sizeRole="picker" supplies 58px. The reserved top padding keeps the 30px badge from overlapping the artwork.

- [ ] **Step 5: Strengthen CT geometry at 320, 390 and 1280**

In avatar-picker.ct.tsx, for every viewport:

1. Assert 30 .rm-avatar-picker__label elements and that each textContent is non-empty.
2. Read getComputedStyle(grid).gridTemplateColumns, split its resolved pixel tracks and expect 3 tracks at width 320/390 and 5 tracks at 1280.
3. Expect picker artwork width 58px at mobile and 64px at desktop.
4. Compare the selected tile and check bounding boxes:

~~~tsx
const tileBox = await selected.boundingBox();
const checkBox = await selected.locator(".rm-avatar-picker__check").boundingBox();
const artworkBox = await selected.locator(".rm-avatar-chip").boundingBox();
expect(checkBox!.x).toBeGreaterThanOrEqual(tileBox!.x + 8);
expect(checkBox!.y).toBeGreaterThanOrEqual(tileBox!.y + 8);
expect(checkBox!.x + checkBox!.width).toBeLessThanOrEqual(
  tileBox!.x + tileBox!.width - 8,
);
expect(checkBox!.y + checkBox!.height).toBeLessThanOrEqual(artworkBox!.y);
~~~

5. Focus the selected tile and expect computed outlineStyle not to be none and outlineWidth to be 2px.
6. Keep horizontal overflow, last-tile scrolling and screenshot evidence assertions.

In avatar-chip.ct.tsx replace the old pseudo-element ownership assertion with an external outline assertion and verify the artwork itself stays frame-free.

- [ ] **Step 6: Run picker GREEN verification**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Review and commit Task 3**

Run:

~~~bash
git diff --check -- \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/avatar-picker.ct.tsx \
  front/shared/ui/avatar-chip.ct.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
~~~

Commit:

~~~bash
git add \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/avatar-picker.ct.tsx \
  front/shared/ui/avatar-chip.ct.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
git commit -m "feat(profile): improve avatar picker clarity"
~~~

---

### Task 4: Migrate Every User-Facing Avatar Consumer

**Files:**
- Modify: front/shared/ui/notes-feed-list.tsx:117-170,338-365
- Modify: front/features/member-home/ui/member-home-records.tsx:147-360
- Modify: front/features/member-home/ui/member-home-records.test.tsx
- Modify: front/features/member-home/ui/member-home-records.ct.tsx:37-89
- Modify: front/features/current-session/ui/current-session-panels.tsx:415-543
- Modify: front/features/current-session/ui/mobile/mobile-prep-segment.tsx:314-335
- Modify: front/features/current-session/ui/mobile/mobile-board-segment.tsx:30-79
- Modify: front/features/archive/ui/member-session-detail-page.tsx:470-493,675-697
- Modify: front/features/host/ui/host-session-attendance-editor.tsx:57-89
- Modify: front/features/host/ui/members/member-list.tsx:150-175
- Modify: front/features/public/ui/public-session.tsx:88-145
- Modify: front/features/public/ui/public-club.tsx:115-136
- Modify: front/features/guest-browse/ui/guest-surfaces.tsx:127-157
- Modify: front/tests/unit/notes-feed-page.test.tsx
- Modify: front/tests/unit/current-session.test.tsx
- Modify: front/tests/unit/member-session-detail-page.test.tsx
- Modify: front/tests/unit/host-members.test.tsx
- Modify: front/tests/unit/public-club.test.tsx
- Modify: front/features/guest-browse/ui/guest-surfaces.test.tsx

**Interfaces:**
- Consumes: AvatarChip sizeRole contract from Task 1.
- Produces: no new public interface; every production AvatarChip caller in the included surfaces declares navigation, dense, author, member, roster, profile, editor or picker.

- [ ] **Step 1: Add failing semantic-role assertions to representative tests**

Add these exact data-role expectations:

| Test file | Locator | Expected role |
| --- | --- | --- |
| member-home-records.test.tsx | .rm-club-pulse-entry__author .rm-avatar-chip | author |
| member-home-records.test.tsx | .rm-member-activity-card__author .rm-avatar-chip | author |
| tests/unit/notes-feed-page.test.tsx | every author .rm-avatar-chip | author |
| tests/unit/current-session.test.tsx | roster avatar | member |
| tests/unit/current-session.test.tsx | question/review avatar | dense |
| tests/unit/member-session-detail-page.test.tsx | highlight and one-liner avatar | dense |
| tests/unit/host-members.test.tsx | every rendered member .rm-avatar-chip | member |
| tests/unit/public-club.test.tsx | public host avatar | author |
| guest-surfaces.test.tsx | guest roster avatar | member |
| guest-surfaces.test.tsx | guest one-liner avatar | dense |

Use toHaveAttribute("data-avatar-size-role", "<role>") rather than testing implementation imports.

For example, the member-home assertions are:

~~~tsx
expect(
  container.querySelector(".rm-club-pulse-entry__author .rm-avatar-chip"),
).toHaveAttribute("data-avatar-size-role", "author");
expect(
  container.querySelector(".rm-member-activity-card__author .rm-avatar-chip"),
).toHaveAttribute("data-avatar-size-role", "author");
~~~

In member-home-records.ct.tsx change the expected ClubPulse and MobileMemberActivity bounds from 30/32 to 36.

- [ ] **Step 2: Run the focused surface suite and verify RED**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/member-home/ui/member-home-records.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-members.test.tsx \
  tests/unit/public-club.test.tsx \
  features/guest-browse/ui/guest-surfaces.test.tsx
~~~

Expected: FAIL because production consumers still pass raw sizes or rely on the 24px default.

- [ ] **Step 3: Apply the exact consumer-to-role mapping**

Replace every production AvatarChip sizing call according to this table:

| File and surface | Role |
| --- | --- |
| shared/ui/notes-feed-list.tsx all FeedAuthorRow avatars | author |
| member-home-records.tsx ClubPulse and MobileMemberActivity | author |
| member-home-records.tsx RosterSummary | roster |
| current-session-panels.tsx RosterList | member |
| current-session-panels.tsx BoardQuestions and BoardLongReviews | dense |
| mobile-prep-segment.tsx attendee list | member |
| mobile-board-segment.tsx questions and reviews | dense |
| member-session-detail-page.tsx highlights and one-liners | dense |
| host-session-attendance-editor.tsx attendee | member |
| host/members/member-list.tsx member identity | member |
| public/ui/public-session.tsx highlights and one-liners | dense |
| public/ui/public-club.tsx host note | author |
| guest-surfaces.tsx GuestRoster attendee | member |
| guest-surfaces.tsx guest archive one-liner author | dense |

For each call remove size={...} and add sizeRole="<role>". Do not change avatarKey, name, label or RSVP labels.

The production call shape is:

~~~tsx
<AvatarChip
  avatarKey={member.avatarKey}
  name={member.displayName}
  label=""
  sizeRole="member"
/>
~~~

- [ ] **Step 4: Adjust only the layout space that the larger artwork needs**

Apply these narrow layout changes:

- In FeedQuestions, FeedOneLiners and FeedHighlights remove markerSize props, make FeedAuthorRow always use sizeRole="author", and increase author-copy paddingLeft from 34px to 46px where it aligns under quoted text.
- In RosterSummary increase the avatar-row gap from 6px to 8px.
- In host-session-attendance-editor.tsx change inline gridTemplateColumns from "32px 1fr auto auto" to "46px minmax(0, 1fr) auto auto" so the 38px desktop avatar has breathing room and names can shrink.
- Keep existing flex wrapping on host members; do not add a card or badge.
- Do not change text sizes, dates, RSVP status colors, permissions or action controls.

- [ ] **Step 5: Prove no production caller remains on a raw or implicit size**

Run:

~~~bash
rg -n -P -U '<AvatarChip(?:(?!sizeRole=)[\s\S]){0,500}?/>' \
  front/src front/features front/shared \
  --glob '*.tsx' \
  --glob '!*.test.tsx' \
  --glob '!*.ct.tsx' \
  --glob '!*.story.tsx'
~~~

Expected: no output. Numeric-size AvatarChip calls remain only in avatar-chip tests used for raster inspection.

- [ ] **Step 6: Run focused GREEN verification**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  features/member-home/ui/member-home-records.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-members.test.tsx \
  tests/unit/public-club.test.tsx \
  features/guest-browse/ui/guest-surfaces.test.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Review and commit Task 4**

Run:

~~~bash
git diff --check -- front
git diff --stat
~~~

Confirm the diff contains only AvatarChip role migration, the three narrow spacing changes and focused assertions.

Commit:

~~~bash
git add \
  front/shared/ui/notes-feed-list.tsx \
  front/features/member-home/ui/member-home-records.tsx \
  front/features/member-home/ui/member-home-records.test.tsx \
  front/features/member-home/ui/member-home-records.ct.tsx \
  front/features/current-session/ui/current-session-panels.tsx \
  front/features/current-session/ui/mobile/mobile-prep-segment.tsx \
  front/features/current-session/ui/mobile/mobile-board-segment.tsx \
  front/features/archive/ui/member-session-detail-page.tsx \
  front/features/host/ui/host-session-attendance-editor.tsx \
  front/features/host/ui/members/member-list.tsx \
  front/features/public/ui/public-session.tsx \
  front/features/public/ui/public-club.tsx \
  front/features/guest-browse/ui/guest-surfaces.tsx \
  front/tests/unit/notes-feed-page.test.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/member-session-detail-page.test.tsx \
  front/tests/unit/host-members.test.tsx \
  front/tests/unit/public-club.test.tsx \
  front/features/guest-browse/ui/guest-surfaces.test.tsx
git commit -m "fix(ui): normalize user avatar scale"
~~~

---

### Task 5: Lock Responsive Visual And End-To-End Evidence

**Files:**
- Modify: front/tests/e2e/account-navigation-avatars.spec.ts:350-635
- Update expected Docker-rendered files under:
  - front/__screenshots__/shared/ui/avatar-chip.ct.tsx/
  - front/__screenshots__/shared/ui/readmates-brand-mark.ct.tsx/
  - front/__screenshots__/shared/ui/top-nav.ct.tsx/
  - front/__screenshots__/features/member-home/ui/member-home-records.ct.tsx/
- Update any additional baseline only when git diff and the CT test name prove it is directly affected by the changed shared AvatarChip role or profile/picker layout.

**Interfaces:**
- Consumes: all Task 1–4 UI contracts.
- Produces: final browser evidence at 390/1280 plus 320 navigation evidence, Docker CT baselines and canonical frontend verification.

- [ ] **Step 1: Add an E2E size helper and failing integrated assertions**

Add this helper beside the existing frame-free assertion helpers:

~~~ts
async function expectAvatarRoleSize(
  avatar: Locator,
  role: string,
  expectedSize: number,
) {
  await expect(avatar).toHaveAttribute("data-avatar-size-role", role);
  await expect.poll(
    () => avatar.evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(expectedSize);
}
~~~

Extend My Space save coverage:

- at width 390, expect profile role 64px and navigation role 36px;
- at width 1280, expect profile role 88px and navigation role 36px;
- expect visible text 나의 아바타 · 한 장 더 읽는 바나나 before editing;
- open the editor through button name 아바타 선택, 현재 한 장 더 읽는 바나나;
- expect all 30 .rm-avatar-picker__label elements;
- expect picker artwork 58px mobile or 64px desktop;
- compare the selected tile/check boxes to prove the filled circle is inset;
- after saving teacup-green-book, expect 나의 아바타 · 책 곁에 머문 찻잔 and unchanged persisted src after reload.

Use these concrete assertions inside the existing width loop:

~~~ts
await expectAvatarRoleSize(
  page.locator(".rm-member-profile__avatar"),
  "profile",
  width === 390 ? 64 : 88,
);
await expectAvatarRoleSize(
  page.getByRole("button", { name: MEMBER_NAME + " 계정 메뉴" }).locator(".rm-avatar-chip"),
  "navigation",
  36,
);
await expect(page.getByText("나의 아바타 · 한 장 더 읽는 바나나")).toBeVisible();
await dialog.getByRole("button", {
  name: "아바타 선택, 현재 한 장 더 읽는 바나나",
}).click();
await expect(picker.locator(".rm-avatar-picker__label")).toHaveCount(30);
~~~

Extend current-session/host/public coverage:

- current-session roster: member is 34px at 390 and 38px at 1280;
- host attendance and host members: member is 34px at 390 and 38px at 1280;
- public record author avatars: dense is 30px at both widths;
- existing frame-free and exact local WebP request assertions remain.

Use the same helper for the roster/host/public checks:

~~~ts
await expectAvatarRoleSize(
  roster.locator(".rm-avatar-chip").first(),
  "member",
  width === 390 ? 34 : 38,
);
await expectAvatarRoleSize(
  page.locator(".public-note-author-row .rm-avatar-chip").first(),
  "dense",
  30,
);
~~~

- [ ] **Step 2: Run the targeted integrated E2E assertions**

Run:

~~~bash
corepack pnpm --dir front test:e2e -- tests/e2e/account-navigation-avatars.spec.ts
~~~

Expected: PASS at the Task 4 HEAD. Tasks 1–4 already established RED/GREEN behavior with focused unit tests; this step adds cross-route integration evidence without rewriting history or reverting the working tree. If it fails, diagnose the exact role, viewport or interaction contract and fix that owning task surface before continuing.

- [ ] **Step 3: Run focused unit regression at final code**

Run:

~~~bash
corepack pnpm --dir front exec vitest run \
  shared/ui/avatar-chip.test.tsx \
  features/auth/ui/account-menu.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/member-home/ui/member-home-records.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-members.test.tsx \
  tests/unit/public-club.test.tsx \
  features/guest-browse/ui/guest-surfaces.test.tsx
~~~

Expected: PASS.

- [ ] **Step 4: Generate and review Docker component baselines**

Run:

~~~bash
corepack pnpm --dir front test:ct:update
~~~

Inspect:

~~~bash
git status --short -- front/__screenshots__
git diff --stat -- front/__screenshots__
~~~

Expected changed baselines are limited to the explicitly listed shared brand/avatar/top-nav and member-home surfaces. Picker/profile-editor testInfo screenshots stay under test-results and are not staged.

Run the canonical no-update verification:

~~~bash
corepack pnpm --dir front test:ct
~~~

Expected: PASS.

- [ ] **Step 5: Run the targeted E2E GREEN evidence**

Run:

~~~bash
corepack pnpm --dir front test:e2e -- tests/e2e/account-navigation-avatars.spec.ts
~~~

Expected: PASS with screenshots for My Space picker/save, account navigation, current-session roster, host attendance, host members and public record at the specified mobile/desktop widths.

- [ ] **Step 6: Run canonical frontend gates**

Run:

~~~bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
~~~

Expected: all commands PASS. This is a frontend presentation change; server, BFF, migration and Testcontainers checks are out of scope.

- [ ] **Step 7: Run final source, diff and artifact hygiene checks**

Run:

~~~bash
rg -n -P -U '<AvatarChip(?:(?!sizeRole=)[\s\S]){0,500}?/>' \
  front/src front/features front/shared \
  --glob '*.tsx' \
  --glob '!*.test.tsx' \
  --glob '!*.ct.tsx' \
  --glob '!*.story.tsx'
git diff --check
git status --short --untracked-files=all
~~~

Expected:

- the role scan prints nothing;
- git diff --check prints nothing;
- no test-results, playwright-report, coverage, dist, .tmp or Visual Companion files are staged;
- only intended source, tests and Docker baseline files remain.

- [ ] **Step 8: Commit integrated proof**

Stage the E2E spec and only directly affected baseline PNGs:

~~~bash
git add front/tests/e2e/account-navigation-avatars.spec.ts
git add \
  front/__screenshots__/shared/ui/avatar-chip.ct.tsx \
  front/__screenshots__/shared/ui/readmates-brand-mark.ct.tsx \
  front/__screenshots__/shared/ui/top-nav.ct.tsx \
  front/__screenshots__/features/member-home/ui/member-home-records.ct.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "test(ui): lock responsive avatar presentation"
~~~

If Docker CT reports no baseline change for one listed directory, omit that unchanged path from git add. If an unexpected baseline changed, inspect its test and shared dependency before deciding whether it belongs; never stage a broad screenshot directory without that review.

- [ ] **Step 9: Record final verification evidence**

Capture in the execution handoff:

- final HEAD SHA and the five task commit SHAs;
- exact focused, CT, E2E, lint, unit and build commands with outcomes;
- viewports checked: 320, 390 and 1280;
- changed frontend surfaces;
- confirmation that server/BFF/API/DB/migrations and avatar assets were unchanged;
- skipped validations and reasons;
- residual risk: visual density may still vary with unusually long real display names, mitigated by existing public-safe long-name fixtures and responsive overflow assertions.
