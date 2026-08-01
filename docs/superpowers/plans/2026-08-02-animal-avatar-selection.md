# Animal Avatar Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 20 still-life membership avatars with 40 approved animal reading avatars, assign them once with same-club duplicate minimization, and let eligible members explicitly change their own club-scoped avatar from My Space.

**Architecture:** Keep `memberships.avatar_key` as the authoritative presentation key. A forward-only V44 migration and the auth write slice own key validation, deterministic existing-member reassignment, randomized unused-first allocation, and self-service mutation; the frontend keeps local static assets behind an allowlist and composes a prop-driven picker from the `/app/me` route. Existing read projections continue transporting strings and never construct asset paths from IDs or external URLs.

**Tech Stack:** React 19, TypeScript, React Router 7, TanStack Query 5, Vitest, Playwright component/E2E tests, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, Gradle, `sips`, and `cwebp`.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-08-02-animal-avatar-selection-design.md` at commit `17391909`.
- The product allowlist contains exactly these 40 keys in this stable order:

```text
hedgehog-green-book
squirrel-acorn
deer-brown-book
fox-glasses-mug
koala-book-sprig
polar-bear-snowflake-mug
penguin-beret-book
cat-flower-mug
alpaca-winter-sprig
squirrel-green-book
penguin-orange-mug
panda-green-book
mouse-blue-book
turtle-winter-book
ladybug-green-book
snail-green-book
sloth-orange-mug
alpaca-brown-book
fennec-heart-mug
hedgehog-glasses-book
squirrel-autumn-book
penguin-heart-mug
deer-plaid-book
alpaca-heart-mug
turtle-glasses-book
owl-beret-book
bear-green-book
rabbit-brown-book
cat-heart-mug
dog-green-book
chick-beret-book
duck-green-mug
hamster-green-book
red-panda-orange-mug
sheep-brown-book
fox-side-book
winter-bird
mallard-orange-mug
owl-glasses-book
hedgehog-green-mug
```

- `hedgehog-green-book` is the unknown/decode-failure/anonymous/left-member fallback.
- The six user-provided source sheets are external inputs. Before Task 1, stage copies at `.tmp/animal-avatar-source/sheet-1.png` through `sheet-6.png`; stop and request the attachments again if any source is unavailable. Never commit source sheets or intermediate crops.
- Sheet numbering is top-left to top-right as 1–5 and bottom-left to bottom-right as 6–10. Exclude: sheet 1 slot 3; sheet 2 slots 2, 3, 4, 5, 9; sheet 3 slots 1, 2, 4, 8; sheet 4 slots 1, 2, 5, 8; sheet 5 slot 8; sheet 6 slots 1, 2, 3, 7, 10.
- Final browser assets are exactly 40 individual 256×256 WebP files under `front/public/assets/avatars/book-club/`.
- Automatic assignment prefers an unused key in the current club and persists it. Manual selection may duplicate another member's key and has no cooldown.
- Avatar identity is membership-scoped, not account-global. A user may choose different avatars in different clubs.
- Do not add upload/crop UI, Google profile rendering, external URLs, runtime AI generation, categories, search, pagination, host editing, or avatar history.
- Browser traffic continues through the existing same-origin BFF; add no proxy rule, secret, trusted header, or browser-exposed configuration.
- Keep frontend direction `route -> ui` and `route -> queries -> api`; UI files do not fetch.
- Keep server direction `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence`.
- Preserve public visibility and `LEFT`/anonymous identity masking. Names remain authoritative identity; avatars stay decorative outside the picker.
- Preserve the current frontend edit gate: only `canEditProfile=true` renders the picker opener. The server continues matching the existing display-name mutation policy for `VIEWER`, `ACTIVE`, and `SUSPENDED`; `LEFT` and `INACTIVE` remain forbidden.
- Use the root-pinned `pnpm@11.13.1` through Corepack for frontend commands.
- V43 remains immutable. The new operational migration is `V44__animal_avatar_selection.sql`.
- This plan authorizes repository implementation and local verification only. It does not authorize push, PR, deploy, or live member-data mutation.

### Canonical legacy fixture mapping

Use this one-to-one mapping only to update repository fixtures, dev seed data, examples, and assertions. V43 itself remains unchanged, and V44 production reassignment uses its own deterministic club-local ranking rather than this mapping.

```text
archive-box -> hedgehog-green-book
reading-lamp -> squirrel-acorn
open-book-pencil -> deer-brown-book
book-spines -> fox-glasses-mug
bookmark-page -> koala-book-sprig
notebook-pen -> polar-bear-snowflake-mug
library-stamp -> penguin-beret-book
books-glasses -> cat-flower-mug
index-cards -> alpaca-winter-sprig
round-table-books -> squirrel-green-book
paired-bookmarks -> penguin-orange-mug
book-dialogue -> panda-green-book
question-card -> mouse-blue-book
calendar-book -> turtle-winter-book
feedback-sheet -> ladybug-green-book
reading-notes -> snail-green-book
banded-book -> sloth-orange-mug
desk-clock-book -> alpaca-brown-book
book-tote -> fennec-heart-mug
discussion-circle -> hedgehog-glasses-book
```

---

## File Structure

### New focused units

- `server/src/main/resources/db/mysql/migration/V44__animal_avatar_selection.sql` — forward-only key constraint replacement and deterministic existing-row reassignment.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAvatarRandomIndexPort.kt` — test-controllable bounded random index contract.
- `server/src/main/kotlin/com/readmates/auth/adapter/out/random/ThreadLocalMemberAvatarRandomIndexAdapter.kt` — production non-cryptographic random source.
- `front/features/archive/queries/profile-queries.ts` — profile mutation hooks and archive-profile invalidation policy.
- `front/features/archive/queries/profile-queries.test.tsx` — mutation request and invalidation contract.
- `front/features/archive/ui/my-page/avatar-picker.tsx` — prop-driven opener, dialog/bottom-sheet draft state, focus, save, cancel, and error UI.
- `front/features/archive/ui/my-page/avatar-picker.test.tsx` — interaction and accessibility behavior.
- `front/features/archive/ui/my-page/avatar-picker.ct.tsx` — 320/390/1280 visual and overflow evidence.

### Existing ownership changes

- `front/shared/ui/book-club-avatar.ts` and `.test.ts` — 40-key metadata manifest, labels, fallback, and safe URL resolution.
- `front/shared/ui/avatar-chip.tsx` and `.ct.tsx` — unchanged consumer API, new fallback key and 40-asset visual proof.
- `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt` — exact server allowlist.
- `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapter.kt` — unused-first randomized selection and unconditional valid previous-key preservation.
- `server/src/main/kotlin/com/readmates/auth/application/{model,port,service}/**` and `adapter/{in/web,out/persistence}/**` — self avatar update command, use case, validation, persistence, response, and error mapping.
- `front/features/archive/{api,route,ui}/**` — mutation contract, independent field overrides, My Space wiring, and picker props.
- `front/tests/e2e/account-navigation-avatars.spec.ts` and `member-profile-permissions.spec.ts` — synthetic browser flow plus real API permission coverage.
- `docs/development/architecture.md` and `CHANGELOG.md` — active behavior and Unreleased user-visible change.

---

### Task 1: Build the 40-Asset Frontend Foundation

**Files:**
- Modify: `front/shared/ui/book-club-avatar.ts`
- Modify: `front/shared/ui/book-club-avatar.test.ts`
- Modify: `front/shared/ui/avatar-chip.ct.tsx`
- Delete: the 20 current files under `front/public/assets/avatars/book-club/`
- Create: 40 WebP files whose names exactly match the Global Constraints allowlist
- Modify: frontend source, fixture, JSON, component, unit, and E2E files returned by the exact legacy-key scan in Step 8

**Interfaces:**
- Consumes: the six staged source sheets and the Global Constraints allowlist/exclusion coordinates.
- Produces: `BookClubAvatarDefinition`, `BOOK_CLUB_AVATARS`, `BOOK_CLUB_AVATAR_KEYS`, `BookClubAvatarKey`, `DEFAULT_BOOK_CLUB_AVATAR_KEY`, `isBookClubAvatarKey`, `normalizeBookClubAvatarKey`, `bookClubAvatarLabel`, and `bookClubAvatarSrc`.
- Produces: exactly 40 local 256×256 WebP assets; later tasks may use only the key strings, never source coordinates.

- [ ] **Step 1: Write the failing manifest and asset-presence tests**

Replace the old 20-key assertions in `front/shared/ui/book-club-avatar.test.ts` with exact count, uniqueness, label, path, fallback, traversal, and on-disk RIFF checks:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK_CLUB_AVATARS,
  BOOK_CLUB_AVATAR_KEYS,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  bookClubAvatarLabel,
  bookClubAvatarSrc,
  isBookClubAvatarKey,
} from "./book-club-avatar";

const assetDirectory = resolve(process.cwd(), "public/assets/avatars/book-club");

it("exposes exactly forty unique approved animal avatars", () => {
  expect(BOOK_CLUB_AVATARS).toHaveLength(40);
  expect(new Set(BOOK_CLUB_AVATAR_KEYS)).toHaveSize(40);
  expect(DEFAULT_BOOK_CLUB_AVATAR_KEY).toBe("hedgehog-green-book");
  expect(BOOK_CLUB_AVATAR_KEYS.at(-1)).toBe("hedgehog-green-mug");
});

it("keeps labels and local files aligned with the allowlist", () => {
  expect(readdirSync(assetDirectory).filter((name) => name.endsWith(".webp")).sort())
    .toEqual(BOOK_CLUB_AVATAR_KEYS.map((key) => `${key}.webp`).sort());
  for (const { key, label } of BOOK_CLUB_AVATARS) {
    const file = resolve(assetDirectory, `${key}.webp`);
    expect(label.trim().length).toBeGreaterThan(0);
    expect(bookClubAvatarLabel(key)).toBe(label);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).toString("ascii")).toBe("RIFF");
  }
});

it("falls back without allowing arbitrary paths", () => {
  expect(isBookClubAvatarKey("squirrel-acorn")).toBe(true);
  expect(isBookClubAvatarKey("../../member-id")).toBe(false);
  expect(bookClubAvatarSrc("../../member-id"))
    .toBe("/assets/avatars/book-club/hedgehog-green-book.webp");
});
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
```

Expected: FAIL because the manifest still has 20 legacy keys and the 40 animal WebP files do not exist.

- [ ] **Step 3: Verify and stage the six external source sheets**

Run:

```bash
for sheet_number in 1 2 3 4 5 6; do
  test -f ".tmp/animal-avatar-source/sheet-${sheet_number}.png"
  sips -g pixelWidth -g pixelHeight ".tmp/animal-avatar-source/sheet-${sheet_number}.png"
done
```

Expected: every file exists and reports `pixelWidth: 1448`, `pixelHeight: 1086`. If not, stop before generating assets.

- [ ] **Step 4: Create the ignored deterministic crop manifest**

Create `.tmp/animal-avatar-crops.tsv` with these exact tab-separated rows (`key`, `sheet`, `offsetY`, `offsetX`):

```text
hedgehog-green-book	1	225	0
squirrel-acorn	1	225	278
deer-brown-book	1	225	842
fox-glasses-mug	1	225	1125
koala-book-sprig	1	560	0
polar-bear-snowflake-mug	1	560	278
penguin-beret-book	1	560	560
cat-flower-mug	1	560	842
alpaca-winter-sprig	1	560	1125
squirrel-green-book	2	225	0
penguin-orange-mug	2	560	0
panda-green-book	2	560	278
mouse-blue-book	2	560	560
turtle-winter-book	2	560	1125
ladybug-green-book	3	220	560
snail-green-book	3	220	1125
sloth-orange-mug	3	555	0
alpaca-brown-book	3	555	278
fennec-heart-mug	3	555	842
hedgehog-glasses-book	3	555	1125
squirrel-autumn-book	4	200	560
penguin-heart-mug	4	200	842
deer-plaid-book	4	555	0
alpaca-heart-mug	4	555	278
turtle-glasses-book	4	555	842
owl-beret-book	4	555	1125
bear-green-book	5	220	0
rabbit-brown-book	5	220	278
cat-heart-mug	5	220	560
dog-green-book	5	220	842
chick-beret-book	5	220	1125
duck-green-mug	5	555	0
hamster-green-book	5	555	278
red-panda-orange-mug	5	555	842
sheep-brown-book	5	555	1125
fox-side-book	6	220	842
winter-bird	6	220	1125
mallard-orange-mug	6	555	0
owl-glasses-book	6	555	560
hedgehog-green-mug	6	555	842
```

Do not add this TSV to git.

- [ ] **Step 5: Generate normalized 256×256 WebP files**

Run this exact loop after creating `.tmp/animal-avatar-crops`:

```bash
mkdir -p .tmp/animal-avatar-crops front/public/assets/avatars/book-club
while IFS=$'\t' read -r avatar_key sheet_number offset_y offset_x; do
  source_image=".tmp/animal-avatar-source/sheet-${sheet_number}.png"
  crop_png=".tmp/animal-avatar-crops/${avatar_key}.png"
  output_webp="front/public/assets/avatars/book-club/${avatar_key}.webp"
  sips --cropToHeightWidth 320 320 --cropOffset "$offset_y" "$offset_x" \
    "$source_image" --out "$crop_png"
  sips --resampleHeightWidth 256 256 "$crop_png" --out "$crop_png"
  cwebp -quiet -q 88 -m 6 "$crop_png" -o "$output_webp"
done < .tmp/animal-avatar-crops.tsv
```

Remove only the 20 tracked legacy assets with:

```bash
git rm front/public/assets/avatars/book-club/{archive-box,banded-book,book-dialogue,book-spines,book-tote,bookmark-page,books-glasses,calendar-book,desk-clock-book,discussion-circle,feedback-sheet,index-cards,library-stamp,notebook-pen,open-book-pencil,paired-bookmarks,question-card,reading-lamp,reading-notes,round-table-books}.webp
```

- [ ] **Step 6: Implement the 40-key metadata manifest**

In `front/shared/ui/book-club-avatar.ts`, define this shape and include all 40 Global Constraints keys with the Korean labels from the approved spec table:

```ts
export type BookClubAvatarDefinition = {
  key: string;
  label: string;
};

export const BOOK_CLUB_AVATARS = [
  { key: "hedgehog-green-book", label: "초록 책을 읽는 고슴도치" },
  { key: "squirrel-acorn", label: "도토리를 든 다람쥐" },
  { key: "deer-brown-book", label: "갈색 책을 읽는 사슴" },
  { key: "fox-glasses-mug", label: "안경 쓰고 찻잔을 든 여우" },
  { key: "koala-book-sprig", label: "책과 나뭇가지를 든 코알라" },
  { key: "polar-bear-snowflake-mug", label: "눈꽃 찻잔을 든 북극곰" },
  { key: "penguin-beret-book", label: "베레모를 쓰고 책을 읽는 펭귄" },
  { key: "cat-flower-mug", label: "꽃무늬 찻잔을 든 고양이" },
  { key: "alpaca-winter-sprig", label: "목도리를 하고 나뭇가지를 든 알파카" },
  { key: "squirrel-green-book", label: "초록 책을 읽는 붉은 다람쥐" },
  { key: "penguin-orange-mug", label: "주황 찻잔을 든 펭귄" },
  { key: "panda-green-book", label: "초록 책을 읽는 판다" },
  { key: "mouse-blue-book", label: "파란 책을 읽는 생쥐" },
  { key: "turtle-winter-book", label: "겨울 모자를 쓰고 책을 읽는 거북이" },
  { key: "ladybug-green-book", label: "초록 책을 읽는 무당벌레" },
  { key: "snail-green-book", label: "초록 책을 읽는 달팽이" },
  { key: "sloth-orange-mug", label: "주황 찻잔을 든 나무늘보" },
  { key: "alpaca-brown-book", label: "갈색 책을 읽는 알파카" },
  { key: "fennec-heart-mug", label: "하트 찻잔을 든 사막여우" },
  { key: "hedgehog-glasses-book", label: "안경 쓰고 책을 읽는 고슴도치" },
  { key: "squirrel-autumn-book", label: "가을 숲에서 책을 읽는 다람쥐" },
  { key: "penguin-heart-mug", label: "하트 찻잔을 든 펭귄" },
  { key: "deer-plaid-book", label: "체크 목도리를 하고 책을 읽는 사슴" },
  { key: "alpaca-heart-mug", label: "하트 찻잔을 든 알파카" },
  { key: "turtle-glasses-book", label: "안경 쓰고 책을 읽는 거북이" },
  { key: "owl-beret-book", label: "베레모를 쓰고 책을 읽는 부엉이" },
  { key: "bear-green-book", label: "초록 책을 읽는 곰" },
  { key: "rabbit-brown-book", label: "갈색 책을 읽는 토끼" },
  { key: "cat-heart-mug", label: "하트 찻잔을 든 고양이" },
  { key: "dog-green-book", label: "초록 책을 읽는 강아지" },
  { key: "chick-beret-book", label: "베레모를 쓰고 책을 읽는 병아리" },
  { key: "duck-green-mug", label: "초록 찻잔을 든 흰 오리" },
  { key: "hamster-green-book", label: "초록 책을 든 햄스터" },
  { key: "red-panda-orange-mug", label: "주황 찻잔을 든 레서판다" },
  { key: "sheep-brown-book", label: "갈색 책을 읽는 양" },
  { key: "fox-side-book", label: "옆을 보며 책을 읽는 여우" },
  { key: "winter-bird", label: "목도리를 두른 겨울 새" },
  { key: "mallard-orange-mug", label: "주황 찻잔을 든 청둥오리" },
  { key: "owl-glasses-book", label: "안경 쓰고 책을 읽는 부엉이" },
  { key: "hedgehog-green-mug", label: "초록 찻잔을 든 고슴도치" },
] as const;

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATARS)[number]["key"];
export const BOOK_CLUB_AVATAR_KEYS = BOOK_CLUB_AVATARS.map(({ key }) => key);
export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "hedgehog-green-book";
```

Implement lookup sets/maps so unknown keys normalize to the default and `bookClubAvatarLabel()` returns the default label for unknown input.

- [ ] **Step 7: Update component evidence for all 40 assets**

Change `front/shared/ui/avatar-chip.ct.tsx` to mount every key at 24, 32, 48, and 64px, assert `naturalWidth === 256`, `naturalHeight === 256`, `alt === ""`, and keep the two-stage requested/default image failure test using `hedgehog-green-book`.

- [ ] **Step 8: Mechanically migrate frontend fixtures and source defaults**

Run this exact replacement only over text files under `front/`:

```bash
avatar_front_files=$(rg -l 'archive-box|reading-lamp|open-book-pencil|book-spines|bookmark-page|notebook-pen|library-stamp|books-glasses|index-cards|round-table-books|paired-bookmarks|book-dialogue|question-card|calendar-book|feedback-sheet|reading-notes|banded-book|desk-clock-book|book-tote|discussion-circle' front --glob '*.ts' --glob '*.tsx' --glob '*.json')
perl -pi -e 's/archive-box/hedgehog-green-book/g; s/reading-lamp/squirrel-acorn/g; s/open-book-pencil/deer-brown-book/g; s/book-spines/fox-glasses-mug/g; s/bookmark-page/koala-book-sprig/g; s/notebook-pen/polar-bear-snowflake-mug/g; s/library-stamp/penguin-beret-book/g; s/books-glasses/cat-flower-mug/g; s/index-cards/alpaca-winter-sprig/g; s/round-table-books/squirrel-green-book/g; s/paired-bookmarks/penguin-orange-mug/g; s/book-dialogue/panda-green-book/g; s/question-card/mouse-blue-book/g; s/calendar-book/turtle-winter-book/g; s/feedback-sheet/ladybug-green-book/g; s/reading-notes/snail-green-book/g; s/banded-book/sloth-orange-mug/g; s/desk-clock-book/alpaca-brown-book/g; s/book-tote/fennec-heart-mug/g; s/discussion-circle/hedgehog-glasses-book/g' $avatar_front_files
```

Then restore the final 40-definition manifest from Step 6 if the mechanical pass touched its newly written content, and change any uppercase/unknown-key assertions explicitly to the new fallback.

- [ ] **Step 9: Run focused asset verification and inspect the contact sheet**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
```

Expected: PASS. Open the generated `avatar-chip-contact-sheet.png` and inspect all 40 at 24/32/48/64px. If any face or primary prop is clipped, change only that key's numeric `offsetY`/`offsetX` row in `.tmp/animal-avatar-crops.tsv`, regenerate, and rerun both commands before continuing.

- [ ] **Step 10: Run the frontend unit regression for fixture migration**

Run:

```bash
corepack pnpm --dir front test
```

Expected: PASS with no remaining legacy-key expected paths.

- [ ] **Step 11: Commit the asset foundation**

```bash
git add front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts front/shared/ui/avatar-chip.ct.tsx front/public/assets/avatars/book-club front
git commit -m "feat(ui): add animal avatar assets"
```

Do not add `.tmp/`.

---

### Task 2: Migrate the Database and Server Avatar Vocabulary

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V44__animal_avatar_selection.sql`
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql`
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: server Kotlin/SQL fixtures returned by the exact scan in Step 5, excluding V43

**Interfaces:**
- Consumes: the exact 40-key order from Global Constraints.
- Produces: `BookClubAvatarKey.entries`, `.ordered`, `.fallback`, and `.fromWireValue()` for the new allowlist.
- Produces: a non-null ASCII `memberships.avatar_key` restricted by `memberships_avatar_key_check` to the exact 40 keys.

- [ ] **Step 1: Add failing V43-to-V44 migration assertions**

In `MySqlFlywayMigrationTest`, add a test that migrates a fresh container to target `43`, inserts two clubs with 42 memberships using valid V43 keys, then migrates to latest and asserts:

```kotlin
assertThat(upgradeResult.migrationsExecuted).isEqualTo(1)
assertThat(latestVersion).isEqualTo("44")
assertThat(newKeysForFirstClub.take(40).distinct()).hasSize(40)
assertThat(newKeysForFirstClub).allMatch(BookClubAvatarKey::isWireValue)
assertThat(checkConstraintClause(upgradeJdbc, "memberships_avatar_key_check"))
    .contains("hedgehog-green-book", "hedgehog-green-mug")
```

Add `isWireValue(value: String) = BookClubAvatarKey.fromWireValue(value) != null` as a test-local helper. Also update the existing V42-to-latest test to expect two executed migrations and latest version `44` while preserving its V43 column/index assertions.

- [ ] **Step 2: Run the focused migration test and verify RED**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: FAIL because V44 does not exist and latest remains V43.

- [ ] **Step 3: Replace the server enum with the exact 40 values**

Use uppercase enum constants corresponding one-to-one with the Global Constraints wire keys. Preserve the public interface:

```kotlin
enum class BookClubAvatarKey(val wireValue: String) {
    HEDGEHOG_GREEN_BOOK("hedgehog-green-book"),
    SQUIRREL_ACORN("squirrel-acorn"),
    DEER_BROWN_BOOK("deer-brown-book"),
    FOX_GLASSES_MUG("fox-glasses-mug"),
    KOALA_BOOK_SPRIG("koala-book-sprig"),
    POLAR_BEAR_SNOWFLAKE_MUG("polar-bear-snowflake-mug"),
    PENGUIN_BERET_BOOK("penguin-beret-book"),
    CAT_FLOWER_MUG("cat-flower-mug"),
    ALPACA_WINTER_SPRIG("alpaca-winter-sprig"),
    SQUIRREL_GREEN_BOOK("squirrel-green-book"),
    PENGUIN_ORANGE_MUG("penguin-orange-mug"),
    PANDA_GREEN_BOOK("panda-green-book"),
    MOUSE_BLUE_BOOK("mouse-blue-book"),
    TURTLE_WINTER_BOOK("turtle-winter-book"),
    LADYBUG_GREEN_BOOK("ladybug-green-book"),
    SNAIL_GREEN_BOOK("snail-green-book"),
    SLOTH_ORANGE_MUG("sloth-orange-mug"),
    ALPACA_BROWN_BOOK("alpaca-brown-book"),
    FENNEC_HEART_MUG("fennec-heart-mug"),
    HEDGEHOG_GLASSES_BOOK("hedgehog-glasses-book"),
    SQUIRREL_AUTUMN_BOOK("squirrel-autumn-book"),
    PENGUIN_HEART_MUG("penguin-heart-mug"),
    DEER_PLAID_BOOK("deer-plaid-book"),
    ALPACA_HEART_MUG("alpaca-heart-mug"),
    TURTLE_GLASSES_BOOK("turtle-glasses-book"),
    OWL_BERET_BOOK("owl-beret-book"),
    BEAR_GREEN_BOOK("bear-green-book"),
    RABBIT_BROWN_BOOK("rabbit-brown-book"),
    CAT_HEART_MUG("cat-heart-mug"),
    DOG_GREEN_BOOK("dog-green-book"),
    CHICK_BERET_BOOK("chick-beret-book"),
    DUCK_GREEN_MUG("duck-green-mug"),
    HAMSTER_GREEN_BOOK("hamster-green-book"),
    RED_PANDA_ORANGE_MUG("red-panda-orange-mug"),
    SHEEP_BROWN_BOOK("sheep-brown-book"),
    FOX_SIDE_BOOK("fox-side-book"),
    WINTER_BIRD("winter-bird"),
    MALLARD_ORANGE_MUG("mallard-orange-mug"),
    OWL_GLASSES_BOOK("owl-glasses-book"),
    HEDGEHOG_GREEN_MUG("hedgehog-green-mug");

    companion object {
        val ordered = entries.toList()
        val fallback = HEDGEHOG_GREEN_BOOK
        fun fromWireValue(value: String?): BookClubAvatarKey? =
            entries.firstOrNull { it.wireValue == value }
    }
}
```

- [ ] **Step 4: Add the forward-only V44 migration**

Implement `V44__animal_avatar_selection.sql` in this order:

1. `alter table memberships drop check memberships_avatar_key_check;`
2. Rank each club's rows with visible statuses first, then `sha2(concat(club_id, ':', id, ':animal-avatar-v1'), 256)`, then `id`.
3. Join `json_table` over the exact JSON array of 40 Global Constraints keys and set `avatar_key` using `mod(avatar_rank - 1, 40) + 1`.
4. Re-add `memberships_avatar_key_check` with an explicit `avatar_key IN` list containing every key from Global Constraints in the exact stable order.

The ranking subquery must be:

```sql
select
  id,
  row_number() over (
    partition by club_id
    order by
      case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
      sha2(concat(club_id, ':', id, ':animal-avatar-v1'), 256),
      id
  ) as avatar_rank
from memberships
```

Use this exact JSON array in `json_table`:

```json
["hedgehog-green-book","squirrel-acorn","deer-brown-book","fox-glasses-mug","koala-book-sprig","polar-bear-snowflake-mug","penguin-beret-book","cat-flower-mug","alpaca-winter-sprig","squirrel-green-book","penguin-orange-mug","panda-green-book","mouse-blue-book","turtle-winter-book","ladybug-green-book","snail-green-book","sloth-orange-mug","alpaca-brown-book","fennec-heart-mug","hedgehog-glasses-book","squirrel-autumn-book","penguin-heart-mug","deer-plaid-book","alpaca-heart-mug","turtle-glasses-book","owl-beret-book","bear-green-book","rabbit-brown-book","cat-heart-mug","dog-green-book","chick-beret-book","duck-green-mug","hamster-green-book","red-panda-orange-mug","sheep-brown-book","fox-side-book","winter-bird","mallard-orange-mug","owl-glasses-book","hedgehog-green-mug"]
```

- [ ] **Step 5: Mechanically migrate server fixtures without editing V43**

Run:

```bash
avatar_server_files=$(rg -l 'archive-box|reading-lamp|open-book-pencil|book-spines|bookmark-page|notebook-pen|library-stamp|books-glasses|index-cards|round-table-books|paired-bookmarks|book-dialogue|question-card|calendar-book|feedback-sheet|reading-notes|banded-book|desk-clock-book|book-tote|discussion-circle' server/src/main server/src/test --glob '*.kt' --glob '*.sql' --glob '!**/V43__membership_book_club_avatars.sql')
perl -pi -e 's/archive-box/hedgehog-green-book/g; s/reading-lamp/squirrel-acorn/g; s/open-book-pencil/deer-brown-book/g; s/book-spines/fox-glasses-mug/g; s/bookmark-page/koala-book-sprig/g; s/notebook-pen/polar-bear-snowflake-mug/g; s/library-stamp/penguin-beret-book/g; s/books-glasses/cat-flower-mug/g; s/index-cards/alpaca-winter-sprig/g; s/round-table-books/squirrel-green-book/g; s/paired-bookmarks/penguin-orange-mug/g; s/book-dialogue/panda-green-book/g; s/question-card/mouse-blue-book/g; s/calendar-book/turtle-winter-book/g; s/feedback-sheet/ladybug-green-book/g; s/reading-notes/snail-green-book/g; s/banded-book/sloth-orange-mug/g; s/desk-clock-book/alpaca-brown-book/g; s/book-tote/fennec-heart-mug/g; s/discussion-circle/hedgehog-glasses-book/g' $avatar_server_files
git diff --exit-code -- server/src/main/resources/db/mysql/migration/V43__membership_book_club_avatars.sql
```

Expected: V43 has no diff. Manually update V42/V43 upgrade assertions so they distinguish old V43 keys before V44 from final animal keys after V44.

- [ ] **Step 6: Run migration and server fixture verification**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server unitTest
```

Expected: PASS; invalid legacy, uppercase, non-ASCII, omitted, and arbitrary keys remain rejected by the named check constraint.

- [ ] **Step 7: Commit schema and vocabulary migration**

```bash
git add server/src/main/kotlin server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql server/src/main/resources/db/mysql/migration/V44__animal_avatar_selection.sql server/src/test
git commit -m "feat(auth): migrate animal avatar keys"
```

---

### Task 3: Randomize Unused-First Membership Allocation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAvatarRandomIndexPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/random/ThreadLocalMemberAvatarRandomIndexAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapterTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/adapter/out/random/ThreadLocalMemberAvatarRandomIndexAdapterTest.kt`

**Interfaces:**
- Produces: `fun interface MemberAvatarRandomIndexPort { fun nextIndex(boundExclusive: Int): Int }` with result `0 until boundExclusive`.
- Consumes: `BookClubAvatarKey.ordered` and the existing `MemberAvatarAllocationPort` methods without changing their signatures.
- Produces: valid previous-key preservation, random selection from unused visible keys, and random selection from all 40 after exhaustion.

- [ ] **Step 1: Rewrite allocator tests for the approved properties**

Use `@MockitoBean lateinit var randomIndex: MemberAvatarRandomIndexPort` and stub `nextIndex` to specific values. Replace ordered-first assertions with:

```kotlin
whenever(randomIndex.nextIndex(any())).thenReturn(1, 0, 0)

val first = adapter.allocate(CLUB_ID)
persistMembership(userId(0), MembershipStatus.ACTIVE, first)
val second = adapter.allocate(CLUB_ID)

assertThat(first).isEqualTo(BookClubAvatarKey.SQUIRREL_ACORN)
assertThat(second).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
assertThat(second).isNotEqualTo(first)
```

Add tests that:

- 40 visible allocations produce the full enum set regardless of order;
- the 41st calls `nextIndex(40)` and returns the stubbed all-keys candidate;
- `LEFT`/`INACTIVE` keys are absent from the used set;
- a rejoining user's valid previous key is preserved even when another active member uses the same key;
- parallel transactions still serialize and persist distinct unused keys.

- [ ] **Step 2: Run allocator tests and verify RED**

```bash
./server/gradlew -p server integrationTest --tests com.readmates.auth.adapter.out.persistence.JdbcMemberAvatarAllocationAdapterTest
```

Expected: FAIL because allocation still selects the first unused key and rejoin currently replaces an occupied previous key.

- [ ] **Step 3: Add the bounded random port and production adapter**

```kotlin
fun interface MemberAvatarRandomIndexPort {
    fun nextIndex(boundExclusive: Int): Int
}
```

```kotlin
@Component
class ThreadLocalMemberAvatarRandomIndexAdapter : MemberAvatarRandomIndexPort {
    override fun nextIndex(boundExclusive: Int): Int {
        require(boundExclusive > 0) { "boundExclusive must be positive" }
        return ThreadLocalRandom.current().nextInt(boundExclusive)
    }
}
```

Unit-test bounds `1`, `2`, and `40`, plus rejection of `0` and negative values.

- [ ] **Step 4: Implement random unused-first selection**

After taking the existing club lock and loading a previous key, use:

```kotlin
previousKey?.let { return it }

val usedKeys = visibleAvatarKeysUsedByOtherMembers(clubId, userId)
    .mapNotNull(BookClubAvatarKey::fromWireValue)
    .toSet()
val candidates = BookClubAvatarKey.ordered.filterNot(usedKeys::contains)
    .ifEmpty { BookClubAvatarKey.ordered }
return candidates[randomIndex.nextIndex(candidates.size)]
```

Do not make manual duplicates a reason to replace the previous key.

- [ ] **Step 5: Run focused allocator and architecture tests**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.adapter.out.random.ThreadLocalMemberAvatarRandomIndexAdapterTest
./server/gradlew -p server integrationTest --tests com.readmates.auth.adapter.out.persistence.JdbcMemberAvatarAllocationAdapterTest
./server/gradlew -p server architectureTest
```

Expected: PASS, including concurrent distinct allocation while unused keys exist.

- [ ] **Step 6: Commit allocator behavior**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAvatarRandomIndexPort.kt server/src/main/kotlin/com/readmates/auth/adapter/out/random/ThreadLocalMemberAvatarRandomIndexAdapter.kt server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapter.kt server/src/test/kotlin/com/readmates/auth/adapter/out
git commit -m "feat(auth): randomize membership avatars"
```

---

### Task 4: Add the Self-Service Avatar API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/model/MemberProfileCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/MemberProfileUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/service/MemberProfileServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`

**Interfaces:**
- Produces: `UpdateMemberAvatarCommand(val avatarKey: String?)`.
- Produces: `UpdateOwnMemberAvatarUseCase.updateOwnAvatar(authenticationEmail, command): MemberProfile`.
- Produces: `MemberProfileStorePort.updateOwnAvatarKey(clubId, membershipId, avatarKey): Boolean`.
- Produces: `PATCH /api/me/avatar` with `{ "avatarKey": string }` and existing `MemberProfileResponse` including `avatarKey`.

- [ ] **Step 1: Add failing service tests**

Add tests for:

```kotlin
val updated = service.updateOwnAvatar(
    "member@example.test",
    UpdateMemberAvatarCommand("  hedgehog-green-mug  "),
)

verify(store).updateOwnAvatarKey(CLUB_ID, MEMBERSHIP_ID, "hedgehog-green-mug")
assertThat(updated.avatarKey).isEqualTo("hedgehog-green-mug")
assertThat(cacheInvalidation.clubs).containsExactly(CLUB_ID)
```

Also assert blank/null -> `AVATAR_KEY_REQUIRED`, legacy/traversal/uppercase -> `AVATAR_KEY_INVALID`, `LEFT`/`INACTIVE` -> `MEMBERSHIP_NOT_ALLOWED`, and a failed conditional update rechecks membership status before returning `MEMBER_NOT_FOUND`.

- [ ] **Step 2: Add failing controller integration tests**

In `MemberProfileControllerTest`, add an ACTIVE member request:

```kotlin
mockMvc.patch("/api/me/avatar") {
    cookie(cookie)
    header("X-Readmates-Bff-Secret", "test-bff-secret")
    header("Origin", "http://localhost:3000")
    with(csrf())
    contentType = MediaType.APPLICATION_JSON
    content = """{"avatarKey":"hedgehog-green-mug"}"""
}.andExpect {
    status { isOk() }
    jsonPath("$.membershipId") { value(membershipId) }
    jsonPath("$.avatarKey") { value("hedgehog-green-mug") }
    jsonPath("$.email") { doesNotExist() }
}
assertEquals("hedgehog-green-mug", avatarKeyForMembership(membershipId))
```

Add unauthenticated, VIEWER allowed, LEFT/INACTIVE forbidden, invalid key bad-request, and same-club duplicate-key allowed cases.

- [ ] **Step 3: Run service and API tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.application.service.MemberProfileServiceTest
./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest
```

Expected: FAIL because the command, use case, store method, endpoint, and error codes do not exist.

- [ ] **Step 4: Implement the command, use case, validation, and persistence method**

Use `BookClubAvatarKey.fromWireValue(command.avatarKey?.trim())`. Add `AVATAR_KEY_REQUIRED` and `AVATAR_KEY_INVALID` to `MemberProfileError`, mapping both to HTTP 400.

The store SQL must update only eligible current memberships:

```sql
update memberships
set avatar_key = ?,
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and status in ('VIEWER', 'ACTIVE', 'SUSPENDED')
```

After the update, reload through `findProfileMemberByEmail`, evict club content after commit, and return the authoritative profile. Do not expose a host-targeted avatar endpoint.

- [ ] **Step 5: Implement the request/response endpoint and error mapping**

Add:

```kotlin
data class MemberAvatarUpdateRequest(val avatarKey: String? = null)
```

Inject `UpdateOwnMemberAvatarUseCase` into `MemberProfileController` and map `PATCH /api/me/avatar` to `MemberProfileResponse.from(profile)`. Keep CSRF/BFF/auth behavior inherited from the existing profile mutation.

- [ ] **Step 6: Run focused and PR-level server checks**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.application.service.MemberProfileServiceTest
./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest
./scripts/server-ci-check.sh
```

Expected: PASS.

- [ ] **Step 7: Commit the self-service API**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth
git commit -m "feat(auth): allow own avatar changes"
```

---

### Task 5: Add Frontend Profile Mutations and Independent Field Overrides

**Files:**
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Create: `front/features/archive/queries/profile-queries.ts`
- Create: `front/features/archive/queries/profile-queries.test.tsx`
- Modify: `front/features/archive/route/profile-update-controller.ts`
- Modify: `front/features/archive/route/profile-update-controller.test.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/route/my-page-route.test.tsx`

**Interfaces:**
- Produces: `UpdateMemberAvatarRequest = { avatarKey: string }`; API/query modules do not import `shared/ui`.
- Produces: `MemberProfileResponse` with required `avatarKey: string`.
- Produces: `updateMyAvatar(avatarKey)` and `useUpdateMyAvatarMutation()`.
- Extends: `useProfileUpdateController()` with `updateAvatar(avatarKey)` while keeping `updateProfile(displayName)`.

- [ ] **Step 1: Write failing API and mutation-hook tests**

Assert `updateMyAvatar("hedgehog-green-mug")` sends:

```ts
expect(readmatesFetchResponse).toHaveBeenCalledWith(
  "/api/me/avatar",
  expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ avatarKey: "hedgehog-green-mug" }),
  }),
);
```

In `profile-queries.test.tsx`, render the hook in a `QueryClientProvider`, resolve a response containing `avatarKey`, and assert the mutation calls the API once and invalidates `archiveKeys.all` only after success.

- [ ] **Step 2: Extend controller tests for avatar-only override state**

Mock `useUpdateMyAvatarMutation` and verify:

```ts
await result.current.updateAvatar("hedgehog-green-mug");
expect(result.current.profile.avatarKey).toBe("hedgehog-green-mug");
expect(result.current.profile.displayName).toBe("기존 이름");
expect(callbackOrder).toEqual(["auth-refresh", "revalidate"]);
```

Add a race characterization: a saved name override and saved avatar override retire independently when their corresponding authoritative source field changes. A stale loader object for one field must not roll back the other field.

- [ ] **Step 3: Run frontend mutation/controller tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx
```

Expected: FAIL because the request contract, mutation hook, `avatarKey` response field, and controller method do not exist.

- [ ] **Step 4: Implement API contracts and query hooks**

Add:

```ts
export type UpdateMemberAvatarRequest = { avatarKey: string };

export type MemberProfileResponse = {
  membershipId: string;
  displayName: string;
  accountName: string;
  profileImageUrl: string | null;
  avatarKey: string;
};
```

`profile-queries.ts` owns `useMutation` for both existing display-name update and new avatar update. On success, invalidate `{ queryKey: archiveKeys.all }`; route callbacks still own auth refresh and loader revalidation.

- [ ] **Step 5: Refactor route override state by field**

Represent name and avatar overrides separately:

```ts
type SavedFieldOverride = { source: string; saved: string };

const [displayNameOverride, setDisplayNameOverride] = useState<SavedFieldOverride | null>(null);
const [avatarKeyOverride, setAvatarKeyOverride] = useState<SavedFieldOverride | null>(null);
```

`updateProfile` changes only the name override. `updateAvatar` changes only the avatar override. Both perform `await onProfileUpdated()` before `onRevalidate()`. On failure, neither sets an override nor refreshes/revalidates.

- [ ] **Step 6: Run focused frontend checks**

```bash
corepack pnpm --dir front exec vitest run features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx features/archive/route/my-page-route.test.tsx
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit frontend mutation flow**

```bash
git add front/features/archive/api front/features/archive/queries/profile-queries.ts front/features/archive/queries/profile-queries.test.tsx front/features/archive/route
git commit -m "feat(front): add avatar profile mutation"
```

---

### Task 6: Build the Accessible Avatar Picker

**Files:**
- Create: `front/features/archive/ui/my-page/avatar-picker.tsx`
- Create: `front/features/archive/ui/my-page/avatar-picker.test.tsx`
- Create: `front/features/archive/ui/my-page/avatar-picker.ct.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: `BOOK_CLUB_AVATARS`, `BookClubAvatarKey`, `AvatarChip`, current key, eligibility, and `onUpdateAvatar(key): Promise<AvatarUpdateResult>`.
- Produces: `AvatarPicker({ avatarKey, canEditProfile, onUpdateAvatar })` with one opener, local draft, explicit save, focus trap/return, responsive modal/sheet, and inline alert.

- [ ] **Step 1: Write failing interaction tests**

Cover these exact behaviors in `avatar-picker.test.tsx`:

```ts
expect(screen.getByRole("button", { name: "아바타 바꾸기" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "아바타 바꾸기" }));
const dialog = screen.getByRole("dialog", { name: "나의 아바타 선택" });
expect(within(dialog).getAllByRole("button", { name: /선택$/ })).toHaveLength(40);
expect(within(dialog).getByRole("button", { name: "이 아바타로 변경" })).toBeDisabled();
await user.click(within(dialog).getByRole("button", { name: "초록 찻잔을 든 고슴도치 선택" }));
expect(within(dialog).getByRole("button", { name: "이 아바타로 변경" })).toBeEnabled();
```

Also test:

- only one opener focus stop contains avatar, pencil affordance, and visible text;
- `aria-pressed` plus check marks the selected tile;
- cancel, Escape, and backdrop close without calling save and return focus;
- Tab and Shift+Tab wrap inside the dialog;
- pending save shows `변경 중…`, disables actions, and ignores Escape/double submit;
- failed save keeps draft and dialog, leaves the source avatar unchanged, renders a role alert, and permits retry;
- `canEditProfile=false` renders the avatar without an opener.

- [ ] **Step 2: Run picker tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/avatar-picker.test.tsx
```

Expected: FAIL because the picker does not exist.

- [ ] **Step 3: Implement local draft/save state and dialog semantics**

Use these state transitions:

```ts
const [open, setOpen] = useState(false);
const [draftKey, setDraftKey] = useState<BookClubAvatarKey>(normalizedAvatarKey);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);

async function saveDraft() {
  if (saving || draftKey === normalizedAvatarKey) return;
  setSaving(true);
  setError(null);
  try {
    await onUpdateAvatar(draftKey);
    setOpen(false);
    restoreFocusRef.current = true;
  } catch {
    setError("아바타를 변경하지 못했습니다. 다시 시도해 주세요.");
  } finally {
    setSaving(false);
  }
}
```

On every open, reset draft to the current normalized key and clear the error. Ignore dismiss events while saving. Use the established focusable-selector pattern from `front/features/archive/ui/notes-session-filter.tsx`; do not import route/query/API modules.

- [ ] **Step 4: Implement the responsive presentation**

Desktop CSS uses an 8-column grid within a centered modal. Mobile CSS at the existing breakpoint uses a bottom sheet with 4 columns, `max-height: min(90dvh, 760px)`, sticky header/footer, and only the grid body scrolling. Every tile/action has at least 44×44px target size. Use ink/olive borders and warm paper surfaces; add no gradients, glow, or glass treatment.

- [ ] **Step 5: Add component screenshots and responsive assertions**

In `avatar-picker.ct.tsx`, mount an open picker at 320×700, 390×844, and 1280×900. Assert:

- 40 visible tile buttons exist;
- dialog bounding box stays inside viewport;
- footer actions stay visible after scrolling the grid to the last item;
- no document horizontal overflow;
- current and draft checks are visible without relying on color.

Save screenshots named `avatar-picker-320.png`, `avatar-picker-390.png`, and `avatar-picker-1280.png`.

- [ ] **Step 6: Run component and interaction checks**

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/avatar-picker.test.tsx
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts features/archive/ui/my-page/avatar-picker.ct.tsx
```

Expected: PASS. Inspect all three screenshots for clipping, sticky-action overlap, and readable 44px targets.

- [ ] **Step 7: Commit the picker component**

```bash
git add front/features/archive/ui/my-page/avatar-picker.tsx front/features/archive/ui/my-page/avatar-picker.test.tsx front/features/archive/ui/my-page/avatar-picker.ct.tsx front/src/styles/globals.css front/shared/styles/mobile.css
git commit -m "feat(ui): add avatar picker"
```

---

### Task 7: Wire My Space and Prove the Browser Journey

**Files:**
- Modify: `front/features/archive/ui/my-page/types.ts`
- Modify: `front/features/archive/ui/my-page/member-profile-summary.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/route/my-page-route.test.tsx`
- Modify: `front/tests/e2e/account-navigation-avatars.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`

**Interfaces:**
- Produces: `AvatarUpdateResult = Pick<MyPageProfile, "avatarKey">` without changing the existing display-name `ProfileUpdateResult`.
- Threads: `onUpdateAvatar(key)` from `MyPageRoute` through `MyPage` and `MyReadingShelf` to `MemberProfileSummary` and `AvatarPicker`.
- Preserves: existing `onUpdateProfile(displayName)` behavior and account-menu auth refresh ordering.

- [ ] **Step 1: Write failing My Space integration tests**

Update `member-space-sections.test.tsx` to assert the editable profile contains one `아바타 바꾸기` button before the kicker/name row, and a VIEWER/blocked profile contains only the decorative avatar. Add a save test that resolves `{ displayName, accountName, avatarKey: "hedgehog-green-mug" }` and verifies the profile image changes only after explicit save.

Update `my-page-route.test.tsx` to assert the route passes both callbacks and `updateAvatar` receives the selected key.

- [ ] **Step 2: Add the failing synthetic E2E mutation journey**

In `account-navigation-avatars.spec.ts`, make the synthetic route stateful:

```ts
let savedAvatarKey = "squirrel-acorn";

if (path.endsWith("/api/me/avatar") && route.request().method() === "PATCH") {
  const body = route.request().postDataJSON() as { avatarKey: string };
  savedAvatarKey = body.avatarKey;
  return json(route, {
    membershipId: "member-squirrel-acorn",
    displayName: MEMBER_NAME,
    accountName: MEMBER_NAME,
    profileImageUrl: null,
    avatarKey: savedAvatarKey,
  });
}
```

Return `savedAvatarKey` from `/api/auth/me` and `/api/app/me`. Test opening at 390px, choosing `hedgehog-green-mug`, confirming, then observing the My Space and account trigger images update to `/assets/avatars/book-club/hedgehog-green-mug.webp`. Reload and assert persistence. Repeat at 1280px for modal layout and capture screenshots.

- [ ] **Step 3: Run integration tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx features/archive/route/my-page-route.test.tsx
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts
```

Expected: FAIL because My Space does not expose or wire the picker callback.

- [ ] **Step 4: Thread the picker through the route-first component tree**

Expose `updateAvatar` from `useProfileUpdateController`, pass it through `MyPage -> MyReadingShelf -> MemberProfileSummary`, and replace the static avatar wrapper with `AvatarPicker`. Keep `ProfileNameEditor` separate and keep the single `h1` invariant.

After save, await auth refresh, set the avatar-only override, and revalidate the route. Do not navigate to `/app/me/settings`.

- [ ] **Step 5: Extend real permission E2E coverage**

In `member-profile-permissions.spec.ts`, assert an ACTIVE user can save an allowlisted avatar through the UI. Preserve the current frontend restriction by asserting VIEWER/SUSPENDED do not render the opener, while their direct API behavior continues matching the existing display-name endpoint. Assert LEFT/INACTIVE do not render the opener and direct `PATCH /api/me/avatar` returns 403. Use synthetic `.test` fixture members only. Add a duplicate-key case proving two same-club ACTIVE members may store `hedgehog-green-mug`.

- [ ] **Step 6: Run focused UI and E2E checks**

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx features/archive/route/my-page-route.test.tsx
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS at 320/390/1280 widths with auth/profile consistency and no cross-club overwrite.

- [ ] **Step 7: Commit the complete My Space journey**

```bash
git add front/features/archive/ui/my-page front/features/archive/ui/my-page.tsx front/features/archive/route/my-page-route.tsx front/features/archive/route/my-page-route.test.tsx front/tests/e2e/account-navigation-avatars.spec.ts front/tests/e2e/member-profile-permissions.spec.ts
git commit -m "feat(member): customize club avatar"
```

---

### Task 8: Sync Active Docs and Run Final Evidence

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Verify: all files changed since `17391909`

**Interfaces:**
- Consumes: the final implemented 40-key assets, V44/API behavior, and My Space picker.
- Produces: active architecture and Unreleased documentation that match the code; no new runtime interface.

- [ ] **Step 1: Update active documentation**

Change the avatar paragraph in `docs/development/architecture.md` from 20 still-life keys to 40 local animal keys, unused-first persisted automatic assignment, membership-scoped self-selection, manual duplicate allowance, and `/api/me/avatar`. Preserve the privacy-safe local-asset and Google-profile exclusion language.

Update the existing Unreleased avatar bullet in `CHANGELOG.md` to mention the 40-character set and My Space customization. Do not add source-sheet paths or generated-image provenance details.

- [ ] **Step 2: Run focused frontend tests**

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx features/archive/ui/my-page/avatar-picker.test.tsx features/archive/ui/my-page/member-space-sections.test.tsx
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx features/archive/ui/my-page/avatar-picker.ct.tsx
```

Expected: PASS with reviewed contact-sheet and responsive screenshots.

- [ ] **Step 3: Run canonical frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 4: Run canonical server and MySQL gates**

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS, including Flyway V42->V44, V43->V44, allocator concurrency, avatar API permission, public masking, and read-projection fixtures.

- [ ] **Step 5: Run the full E2E suite once at final HEAD**

```bash
corepack pnpm --dir front test:e2e
```

Expected: PASS. Do not substitute repeated focused runs for this final full run.

- [ ] **Step 6: Run public-safety and diff checks**

```bash
git diff --check
git diff --check 17391909..HEAD
test "$(find front/public/assets/avatars/book-club -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')" = "40"
test -z "$(git ls-files '.tmp/**')"
if rg -n 'archive-box|reading-lamp|open-book-pencil|book-spines|bookmark-page|notebook-pen|library-stamp|books-glasses|index-cards|round-table-books|paired-bookmarks|book-dialogue|question-card|calendar-book|feedback-sheet|reading-notes|banded-book|desk-clock-book|book-tote|discussion-circle' front server/src/main server/src/test --glob '!**/V43__membership_book_club_avatars.sql' --glob '!**/2026-08-01-neutral-book-club-avatars-design.md' --glob '!**/2026-08-01-responsive-account-navigation-book-club-avatars.md'; then exit 1; fi
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: `git diff --check` passes; asset count is 40; `.tmp` is untracked; the legacy-key scan returns no active-code/fixture hits; public release checks pass without source sheets, temporary crops, local paths, or secrets.

- [ ] **Step 7: Inspect the final branch diff and residual risk**

```bash
git status --short --branch --untracked-files=all
git diff --stat 17391909..HEAD
git log --oneline 17391909..HEAD
```

Review the whole implementation range, not only the last commit. Confirm no push, PR, deploy, live API call, or live member mutation occurred. Record skipped commands with their exact reason rather than claiming they passed.

- [ ] **Step 8: Commit documentation closeout**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs: document animal avatar selection"
```

Rerun `git diff --check 17391909..HEAD` after this commit.
