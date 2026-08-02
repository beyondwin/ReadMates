# ReadMates Avatar Poetic Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive scene-only avatar labels with 30 approved poetic ReadMates names while preserving an objective artwork description in every picker accessible name.

**Architecture:** Keep the existing avatar key, asset, server, database, API, catalog order, and fallback contracts unchanged. Extend the frontend-only avatar metadata with `description`, make `label` the poetic display name, expose one fallback-safe description helper, and compose the picker accessible name from both fields.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, Vite, pnpm 11.13.1 through Corepack.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-08-02-avatar-poetic-naming-design.md`.
- Preserve all 30 current wire keys, their current literal catalog order, `cloud-green-book` fallback, WebP filenames, server enum values, DB values, and API payloads.
- Use each poetic `label` and objective `description` exactly as listed in the approved spec.
- The profile editor displays only the poetic label; the picker button accessible name is `<label>, <description> 선택`.
- Keep `AvatarChip` decorative outside the picker; do not change its `alt`, title, fallback, or consumer API.
- Do not change images, CSS, layout, routes, queries, APIs, BFF code, server code, migrations, seeds, auth, or membership behavior.
- Follow frontend dependency direction and keep the metadata in `front/shared/ui` with the prop-driven picker in `front/features/archive/ui`.
- Use TDD RED/GREEN: run each stated focused test before and after its implementation.
- Use the root-pinned package manager through `corepack pnpm`.
- Existing dirty files outside this plan belong to the user; never stage, edit, format, or commit them.
- This plan authorizes repository implementation and local verification only. Commit, push, PR, deploy, and live mutation require separate explicit user authorization.

---

## File Structure

- `front/shared/ui/book-club-avatar.ts` — owns the stable 30-key metadata manifest, poetic label, objective description, safe normalization, fallback-safe label/description lookup, and local asset URL construction.
- `front/shared/ui/book-club-avatar.test.ts` — locks the exact approved copy, uniqueness, fallback, key set, catalog order, and asset alignment.
- `front/features/archive/ui/my-page/avatar-picker.tsx` — composes the accessible selection-button name from metadata without changing selection behavior.
- `front/features/archive/ui/my-page/avatar-picker.test.tsx` — verifies combined poetic-name/artwork-description accessibility and existing selection/disabled behavior.
- `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx` — characterizes the poetic current-avatar label and updates picker interaction queries while proving the saved payload is still the wire key.

No new production file or abstraction is needed.

---

### Task 1: Split Poetic Names From Objective Artwork Descriptions

**Files:**
- Modify: `front/shared/ui/book-club-avatar.test.ts:4-61`
- Modify: `front/shared/ui/book-club-avatar.ts:1-64`

**Interfaces:**
- Consumes: the existing 30 literal keys, existing catalog order, `BookClubAvatarKey`, `normalizeBookClubAvatarKey(value: unknown): BookClubAvatarKey`, and `DEFAULT_BOOK_CLUB_AVATAR_KEY`.
- Produces: `BookClubAvatarDefinition` with `key`, `label`, and `description`; `bookClubAvatarLabel(value: unknown): string`; and `bookClubAvatarDescription(value: unknown): string`.

- [ ] **Step 1: Add the exact approved-copy fixture and failing metadata assertions**

In `front/shared/ui/book-club-avatar.test.ts`, add `bookClubAvatarDescription` to the imports and add this fixture after `APPROVED_KEY_SET`:

```ts
const approvedCopyByKey = new Map([
  ["globe-notebook", ["세계를 펼치는 지구본", "노트와 연필을 든 지구본"]],
  ["mushroom-green-book", ["문장을 줍는 버섯", "초록 책을 읽는 버섯"]],
  ["lemon-green-book", ["여백에 머문 레몬", "초록 책을 읽는 레몬"]],
  ["pudding-notebook", ["생각을 받아 적는 푸딩", "노트와 연필을 든 푸딩"]],
  ["peach-green-book", ["이야기를 품은 복숭아", "초록 책을 읽는 복숭아"]],
  ["radish-notebook", ["질문을 적는 무", "노트와 연필을 든 무"]],
  ["apple-green-book", ["책갈피를 건네는 사과", "초록 책을 읽는 사과"]],
  ["sailboat-green-book", ["다음 장으로 가는 돛단배", "초록 책을 읽는 돛단배"]],
  ["palette-green-book", ["생각을 칠하는 팔레트", "초록 책과 붓을 든 팔레트"]],
  ["balloon-green-book", ["이야기를 띄우는 열기구", "초록 책을 읽는 열기구"]],
  ["dumpling-notebook", ["기록을 빚는 만두", "노트와 연필을 든 만두"]],
  ["tulip-notebook", ["여백에 피어난 튤립", "노트와 연필을 든 튤립"]],
  ["cheese-green-book", ["문장을 숙성하는 치즈", "초록 책을 읽는 치즈"]],
  ["starfish-notebook", ["밑줄을 모으는 불가사리", "노트를 든 불가사리"]],
  ["banana-green-book", ["한 장 더 읽는 바나나", "초록 책을 읽는 바나나"]],
  ["milk-green-book", ["아침을 읽는 우유 팩", "초록 책을 읽는 우유 팩"]],
  ["cloud-green-book", ["문장 사이의 구름", "초록 책을 읽는 구름"]],
  ["teacup-green-book", ["책 곁에 머문 찻잔", "초록 책을 읽는 찻잔"]],
  ["toast-brown-book", ["오래 읽는 식빵", "갈색 책을 읽는 식빵"]],
  ["snowglobe-green-book", ["기억을 간직한 스노우볼", "초록 책을 읽는 스노우볼"]],
  ["cherries-notebook", ["문장을 나누는 체리", "노트와 연필을 든 체리"]],
  ["envelope-notebook", ["다음 책을 전하는 편지봉투", "노트와 연필을 든 편지봉투"]],
  ["bell-notebook", ["모임을 여는 종", "노트와 연필을 든 종"]],
  ["teacup-notebook", ["대화를 기록하는 찻잔", "노트와 연필을 든 찻잔"]],
  ["candle-green-book", ["늦은 독서를 밝히는 촛불", "초록 책을 읽는 촛불"]],
  ["sun-green-book", ["다음 장을 밝히는 해", "초록 책을 읽는 해"]],
  ["teapot-green-book", ["대화를 끓이는 찻주전자", "초록 책을 읽는 찻주전자"]],
  ["sheep-notebook", ["조용히 듣는 양", "노트와 연필을 든 양"]],
  ["moon-green-book", ["밤의 페이지를 지키는 초승달", "초록 책을 읽는 초승달"]],
  ["star-notebook", ["질문을 남기는 별", "노트를 든 별"]],
] as const);
```

Replace the metadata loop inside `keeps labels and local files aligned with the allowlist` with assertions over `description`, exact approved copy, and label uniqueness:

```ts
const labels = new Set<string>();
for (const { key, label, description } of BOOK_CLUB_AVATARS) {
  const file = resolve(assetDirectory, `${key}.webp`);
  expect(APPROVED_KEY_SET.has(key)).toBe(true);
  expect([label, description]).toEqual(approvedCopyByKey.get(key));
  expect(label.trim()).not.toBe("");
  expect(description.trim()).not.toBe("");
  expect(label).toMatch(/[\uac00-\ud7a3]/);
  expect(description).toMatch(/[\uac00-\ud7a3]/);
  expect(bookClubAvatarLabel(key)).toBe(label);
  expect(bookClubAvatarDescription(key)).toBe(description);
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file).subarray(0, 4).toString("ascii")).toBe("RIFF");
  labels.add(label);
}
expect(labels).toHaveSize(30);
```

Replace the fallback label assertion and add the description assertion:

```ts
expect(bookClubAvatarLabel("unknown-avatar")).toBe("문장 사이의 구름");
expect(bookClubAvatarDescription("unknown-avatar")).toBe("초록 책을 읽는 구름");
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
```

Expected: FAIL because `bookClubAvatarDescription` and every `description` field do not exist and current labels are scene descriptions.

- [ ] **Step 3: Implement the exact three-field metadata manifest**

In `front/shared/ui/book-club-avatar.ts`, extend the type:

```ts
export type BookClubAvatarDefinition = {
  key: string;
  label: string;
  description: string;
};
```

Replace `BOOK_CLUB_AVATARS` with the same key order and this exact approved metadata:

```ts
export const BOOK_CLUB_AVATARS = [
  { key: "globe-notebook", label: "세계를 펼치는 지구본", description: "노트와 연필을 든 지구본" },
  { key: "mushroom-green-book", label: "문장을 줍는 버섯", description: "초록 책을 읽는 버섯" },
  { key: "lemon-green-book", label: "여백에 머문 레몬", description: "초록 책을 읽는 레몬" },
  { key: "pudding-notebook", label: "생각을 받아 적는 푸딩", description: "노트와 연필을 든 푸딩" },
  { key: "peach-green-book", label: "이야기를 품은 복숭아", description: "초록 책을 읽는 복숭아" },
  { key: "radish-notebook", label: "질문을 적는 무", description: "노트와 연필을 든 무" },
  { key: "apple-green-book", label: "책갈피를 건네는 사과", description: "초록 책을 읽는 사과" },
  { key: "sailboat-green-book", label: "다음 장으로 가는 돛단배", description: "초록 책을 읽는 돛단배" },
  { key: "palette-green-book", label: "생각을 칠하는 팔레트", description: "초록 책과 붓을 든 팔레트" },
  { key: "balloon-green-book", label: "이야기를 띄우는 열기구", description: "초록 책을 읽는 열기구" },
  { key: "dumpling-notebook", label: "기록을 빚는 만두", description: "노트와 연필을 든 만두" },
  { key: "tulip-notebook", label: "여백에 피어난 튤립", description: "노트와 연필을 든 튤립" },
  { key: "cheese-green-book", label: "문장을 숙성하는 치즈", description: "초록 책을 읽는 치즈" },
  { key: "starfish-notebook", label: "밑줄을 모으는 불가사리", description: "노트를 든 불가사리" },
  { key: "banana-green-book", label: "한 장 더 읽는 바나나", description: "초록 책을 읽는 바나나" },
  { key: "milk-green-book", label: "아침을 읽는 우유 팩", description: "초록 책을 읽는 우유 팩" },
  { key: "cloud-green-book", label: "문장 사이의 구름", description: "초록 책을 읽는 구름" },
  { key: "teacup-green-book", label: "책 곁에 머문 찻잔", description: "초록 책을 읽는 찻잔" },
  { key: "toast-brown-book", label: "오래 읽는 식빵", description: "갈색 책을 읽는 식빵" },
  { key: "snowglobe-green-book", label: "기억을 간직한 스노우볼", description: "초록 책을 읽는 스노우볼" },
  { key: "cherries-notebook", label: "문장을 나누는 체리", description: "노트와 연필을 든 체리" },
  { key: "envelope-notebook", label: "다음 책을 전하는 편지봉투", description: "노트와 연필을 든 편지봉투" },
  { key: "bell-notebook", label: "모임을 여는 종", description: "노트와 연필을 든 종" },
  { key: "teacup-notebook", label: "대화를 기록하는 찻잔", description: "노트와 연필을 든 찻잔" },
  { key: "candle-green-book", label: "늦은 독서를 밝히는 촛불", description: "초록 책을 읽는 촛불" },
  { key: "sun-green-book", label: "다음 장을 밝히는 해", description: "초록 책을 읽는 해" },
  { key: "teapot-green-book", label: "대화를 끓이는 찻주전자", description: "초록 책을 읽는 찻주전자" },
  { key: "sheep-notebook", label: "조용히 듣는 양", description: "노트와 연필을 든 양" },
  { key: "moon-green-book", label: "밤의 페이지를 지키는 초승달", description: "초록 책을 읽는 초승달" },
  { key: "star-notebook", label: "질문을 남기는 별", description: "노트를 든 별" },
] as const satisfies readonly BookClubAvatarDefinition[];
```

Add a description lookup beside `labelByKey` and expose the fallback-safe helper:

```ts
const descriptionByKey = new Map<string, string>(
  BOOK_CLUB_AVATARS.map(({ key, description }) => [key, description]),
);

export function bookClubAvatarDescription(value: unknown) {
  return descriptionByKey.get(normalizeBookClubAvatarKey(value))!;
}
```

- [ ] **Step 4: Run the manifest test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
```

Expected: PASS with the existing 30-key asset/order/fallback assertions and the new exact-copy assertions.

- [ ] **Step 5: Review the Task 1 diff and conditionally commit**

Run:

```bash
git diff --check -- front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts
git diff -- front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts
```

Expected: only metadata, helper, and focused test changes; no key, order, asset, or fallback change.

If and only if the user has explicitly authorized commits for this execution:

```bash
git add front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts
git commit -m "feat(profile): add poetic avatar names"
```

Otherwise leave the verified Task 1 changes unstaged and continue without committing.

---

### Task 2: Compose Accessible Picker Names And Prove Wire-Key Saving

**Files:**
- Modify: `front/features/archive/ui/my-page/avatar-picker.test.tsx:6-37`
- Modify: `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx:37-64`
- Modify: `front/features/archive/ui/my-page/avatar-picker.tsx:11-31`

**Interfaces:**
- Consumes: `BOOK_CLUB_AVATARS` entries shaped as `{ key, label, description }`, `BookClubAvatarKey`, and `bookClubAvatarLabel(value: unknown): string` from Task 1.
- Produces: picker buttons named `<label>, <description> 선택`; unchanged `onChange(avatarKey: BookClubAvatarKey): void`; unchanged profile save payload `{ displayName: string; avatarKey: BookClubAvatarKey }`.

- [ ] **Step 1: Change the picker and profile tests first**

In `front/features/archive/ui/my-page/avatar-picker.test.tsx`, replace the selected and click queries with:

```ts
expect(screen.getByRole("button", {
  name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택",
})).toHaveAttribute("aria-pressed", "true");

await user.click(screen.getByRole("button", {
  name: "문장 사이의 구름, 초록 책을 읽는 구름 선택",
}));
expect(onChange).toHaveBeenCalledWith("cloud-green-book");
```

In `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx`, extend `initializes one atomic draft and saves both fields only from the final action` before opening the picker:

```ts
expect(within(dialog).getByText("한 장 더 읽는 바나나")).toBeVisible();
```

Replace its cloud picker query with:

```ts
await user.click(within(dialog).getByRole("button", {
  name: "문장 사이의 구름, 초록 책을 읽는 구름 선택",
}));
```

Keep the existing final assertion unchanged:

```ts
expect(onSaveProfile).toHaveBeenCalledWith({
  displayName: "새 멤버",
  avatarKey: "cloud-green-book",
});
```

Update every other picker button query in this test file returned by the following scan to use the combined approved accessible name while leaving non-picker `아바타 선택` queries unchanged:

```bash
rg -n '초록 책을 읽는|노트와 연필을 든|갈색 책을 읽는' \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

Expected: FAIL because the picker still exposes `<old scene label> 선택`; the profile editor's current `bookClubAvatarLabel` assertion becomes GREEN from Task 1 but the combined picker queries remain RED.

- [ ] **Step 3: Build the combined accessible name in the picker**

In `front/features/archive/ui/my-page/avatar-picker.tsx`, destructure `description` and update only the accessible-name expression:

```tsx
{BOOK_CLUB_AVATARS.map(({ key, label, description }) => {
  const selected = key === value;
  return (
    <button
      key={key}
      type="button"
      className="rm-avatar-picker__tile"
      aria-label={`${label}, ${description} 선택`}
      aria-pressed={selected}
      aria-describedby={errorId}
      disabled={disabled}
      onClick={() => onChange(key)}
    >
      <AvatarChip avatarKey={key} name={null} label="" size={52} />
      {selected ? <span className="rm-avatar-picker__check" aria-hidden="true"><CheckIcon /></span> : null}
    </button>
  );
})}
```

Do not add visible tile text, `title`, new DOM wrappers, CSS, or changes to `AvatarChip`.

- [ ] **Step 4: Run the UI tests and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

Expected: PASS; the selected state and click target use the combined accessible name, and the saved payload remains `cloud-green-book`.

- [ ] **Step 5: Review the Task 2 diff and conditionally commit**

Run:

```bash
git diff --check -- \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx
git diff -- \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

Expected: accessible-copy and test-query changes only; no layout, save, close, focus, or error behavior changes.

If and only if the user has explicitly authorized commits for this execution:

```bash
git add \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx
git commit -m "test(profile): verify accessible avatar naming"
```

Otherwise leave the verified Task 2 changes unstaged.

---

### Task 3: Run Focused Regression And Canonical Frontend Verification

**Files:**
- Verify: the five frontend files owned by Tasks 1 and 2
- Do not modify: assets, CSS, server, BFF, migrations, API contracts, or unrelated dirty files

**Interfaces:**
- Consumes: the completed metadata and picker behavior from Tasks 1 and 2.
- Produces: fresh focused-test, lint, full-test, build, diff-scope, and worktree evidence at final HEAD or final unstaged state.

- [ ] **Step 1: Run the focused regression set together**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  shared/ui/book-club-avatar.test.ts \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

Expected: PASS with zero failing tests.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
corepack pnpm --dir front lint
```

Expected: exit 0 with no lint errors.

- [ ] **Step 3: Run the complete frontend test suite**

Run:

```bash
corepack pnpm --dir front test
```

Expected: exit 0 with zero failing test files and zero failing tests.

- [ ] **Step 4: Run the production frontend build**

Run:

```bash
corepack pnpm --dir front build
```

Expected: exit 0 with the Vite production build complete.

- [ ] **Step 5: Verify final scope and formatting**

Run:

```bash
git diff --check -- \
  front/shared/ui/book-club-avatar.ts \
  front/shared/ui/book-club-avatar.test.ts \
  front/features/archive/ui/my-page/avatar-picker.tsx \
  front/features/archive/ui/my-page/avatar-picker.test.tsx \
  front/features/archive/ui/my-page/profile-editor-dialog.test.tsx
git status --short --branch --untracked-files=all
git diff --stat
```

Expected: no whitespace error; product changes are confined to the five planned frontend files; pre-existing unrelated dirty documents remain untouched.

- [ ] **Step 6: Report evidence and residual risk**

Report the exact commands and pass/fail counts observed, not expected counts. State explicitly that component screenshots and E2E were not run because image, layout, route, API, auth, and BFF behavior did not change. The remaining product judgment is subjective acceptance of the approved Korean naming copy; there is no known server, persistence, or migration risk in this frontend-only metadata change.
