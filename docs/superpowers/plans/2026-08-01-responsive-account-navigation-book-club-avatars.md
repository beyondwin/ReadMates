# Responsive Account Navigation and Book Club Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous initial-only identity chips with 20 stable, privacy-safe book-club avatars and make account, workspace switching, notifications, and My Space navigation explicit on mobile and desktop.

**Architecture:** Auth owns the persisted membership `avatar_key`, deterministic allocation, and lifecycle stability. Existing session, archive, note, publication, and host read adapters project the stored allowlisted key through additive response fields; the BFF remains passthrough-only. The frontend maps the key to local WebP assets in `shared/ui`, while route layers assemble club-scoped navigation and presentation components remain data-only.

**Tech Stack:** MySQL 8/Flyway, Kotlin 2/Spring Boot/JdbcTemplate, React 19/TypeScript/Vite, Vitest/Testing Library, Playwright component and end-to-end tests, GPT Image 2 generated WebP assets.

## Global Constraints

- Preserve the existing host-only `⇄` workspace switch, its authorization, and its destination behavior.
- Mobile account trigger copy is exactly `계정`; desktop account trigger shows avatar, full display name, and chevron.
- Account popover contains only identity, membership status, `계정 설정`, and `로그아웃`; it remains a labelled nonmodal dialog, not an ARIA `menu`.
- `/app/me` owns direct `알림` and `계정 설정` links; notification and account-settings descendants have a fixed club-scoped `내 공간` parent link.
- Do not add a fifth bottom tab, unread-count fetch, drawer, bottom sheet, hamburger menu, logout confirmation, API endpoint, BFF rule, dependency, or runtime AI call.
- Persist exactly one allowlisted `avatarKey` per membership; never derive it from display name, email, user ID, membership ID, or Google profile data.
- The 20 stable keys, in allocation order, are `reading-lamp`, `open-book-pencil`, `book-spines`, `bookmark-page`, `notebook-pen`, `library-stamp`, `books-glasses`, `index-cards`, `archive-box`, `round-table-books`, `paired-bookmarks`, `book-dialogue`, `question-card`, `calendar-book`, `feedback-sheet`, `reading-notes`, `banded-book`, `desk-clock-book`, `book-tote`, and `discussion-circle`.
- Avatar artwork contains no people, faces, hands, bodies, animals, letters, numbers, logos, or watermarks. Each final asset is a 256x256 WebP using a warm muted paper background and exactly two colors from ink blue, olive, rust, and mustard.
- Within one club, visible statuses are `INVITED`, `VIEWER`, `ACTIVE`, and `SUSPENDED`; allocate the first unused key in stable order, then cycle in stable order only after all 20 are used.
- Rejoining preserves the previous key only when no other visible membership uses it. `LEFT`, system, missing, and anonymous presentation uses `archive-box` without exposing the stored departed-member key.
- Display-name, role, auth-provider, RSVP, attendance, and membership-status presentation must not mutate the stored key.
- Keep `users.profile_image_url` and existing `profileImageUrl` contracts intact, but do not render them in this feature.
- Do not expose database identifiers in image URLs, asset names, logs, telemetry, or accessible labels.
- Keep image elements decorative when the full member name is adjacent: `alt=""` and `aria-hidden="true"`.
- Missing or unknown key falls back to `archive-box`; a failed requested image retries `archive-box` once; a failed fallback becomes a background-only tile without hiding the adjacent name or action.
- Support 24, 32, 48, and 64px avatar presentation and responsive layouts at 320, 390, and 1280px without overflow; interactive targets are at least 44x44px.
- Use the repository-pinned `pnpm@11.13.1` through Corepack for frontend checks.
- Preserve the unrelated untracked `docs/superpowers/plans/2026-08-01-google-login-recovery-kakao-browser.md`; never stage it as part of this work.
- No push, pull request, deploy, live provider call, or production data mutation is authorized by this plan.

---

## File Structure

### New files

- `server/src/main/resources/db/mysql/migration/V43__membership_book_club_avatars.sql` — add, backfill, constrain, and index `memberships.avatar_key`.
- `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt` — canonical server-side ordered allowlist and fallback key.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAvatarAllocationPort.kt` — transaction-facing allocation contract.
- `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapter.kt` — club-row lock, previous-key reuse, first-unused allocation, and cycle behavior.
- `server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapterTest.kt` — MySQL-backed allocation and concurrency coverage.
- `front/shared/ui/book-club-avatar.ts` — frontend key union, ordered manifest, fallback, and static URL resolver.
- `front/shared/ui/book-club-avatar.test.ts` — allowlist and URL safety tests.
- `front/shared/ui/mobile-header.ct.tsx` — 320/390px mobile action-rail visual coverage.
- `front/public/assets/avatars/book-club/*.webp` — exactly 20 generated, normalized product assets.
- `front/features/archive/ui/my-page/member-space-utility-nav.tsx` — presentation-only My Space utility list.
- `front/features/notifications/ui/member-space-breadcrumb.tsx` — desktop-only `내 공간 / 알림` breadcrumb.
- `front/tests/e2e/account-navigation-avatars.spec.ts` — scoped navigation, responsive trigger, fallback, and same-club differentiation flow.

### Existing files with primary ownership changes

- `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt` and auth web/profile/member-list DTOs — carry public-safe `avatarKey`.
- `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt` and `InvitationService.kt` — request allocation inside existing auth transactions.
- `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt` and `JdbcHostInvitationStoreAdapter.kt` — persist the application-selected key and map it back.
- Session/archive/note/publication persistence, result, and web DTO files named in Tasks 4-5 — project the stored key only where an `AvatarChip` consumer exists.
- `front/shared/ui/avatar-chip.tsx` and `design/system/src/styles/tokens.css` — image rendering and status-safe styling; remove monogram behavior.
- Frontend API contracts and current `AvatarChip` consumers named in Task 6 — pass `avatarKey`, never recompute it.
- Account, header, My Space, notification, and settings files named in Tasks 7-9 — implement the approved responsive information architecture.

## Dependency Order

1. Task 1 establishes the shared key vocabulary and accepted assets.
2. Tasks 2-3 establish persistence, allocation, auth identity, and membership lifecycle.
3. Tasks 4-5 propagate the server read contracts; they may run independently after Task 3 but share server fixtures and must not run concurrently against the same database/container.
4. Task 6 consumes Tasks 1, 3, 4, and 5 in frontend contracts and all avatar surfaces.
5. Tasks 7-9 consume Task 6 and may be reviewed separately, but they share global CSS and must be executed serially.
6. Tasks 10-11 verify the integrated behavior and close documentation.

## Acceptance Matrix Handoff

Selected rows:

- **Actor or authorization:** the host-only workspace switch must remain host-only, while member and host account/logout access stays global. Evidence: account/header unit tests, auth API tests, and the integrated member/host E2E flow.
- **Club context:** allocation uniqueness and every `내 공간`/settings/notification link must remain within the current club, while unscoped compatibility routes still work. Evidence: allocator database tests, scoped/unscoped route tests, and the multi-surface E2E flow.
- **Publication visibility:** active authors may expose an allowlisted key; `LEFT`, missing, and anonymous authors must expose only `archive-box` without weakening existing name/record visibility. Evidence: public controller and JDBC adapter tests plus public frontend fixtures.
- **BFF or OAuth:** no proxy rule changes, but first Google viewer creation and invitation acceptance now pass an allocated key. Evidence: `GoogleLoginServiceTest`, `GoogleOAuthLoginSessionTest`, invitation acceptance tests, and full E2E regression.
- **Persistence or migration:** V43 adds a non-null constrained column, deterministic backfill, allocation index, and club-row serialization. Evidence: V42-to-V43 Flyway upgrade test, MySQL allocator concurrency test, server CI, and full `integrationTest`.
- **UI or runtime state:** unknown/missing/decode-failed images, long names, dialog dismissal/focus, and 320/390/1280px layouts are behaviorally relevant. Evidence: Vitest, Playwright component screenshots, network inspection, and focused/full E2E.

Adjacent rows excluded:

- **Session lifecycle:** only identity projection changes; session creation, closing, publication transitions, and participation mutation rules remain unchanged.
- **Cursor collection:** additive item fields do not alter cursor format, ordering, deduplication, or continuation state; existing collection regressions still run in full frontend/server suites.
- **Async, cache, or provider:** assets are generated once before commit and served statically; there is no runtime AI call, provider retry, Redis mutation, outbox, or delivery behavior.

Automated evidence is defined task-by-task and culminates in full frontend, server CI, integration, and E2E gates. Manual evidence is limited to prohibited-element inspection, 24/32/48/64px contact-sheet review, responsive screenshots, and browser network inspection. No production runtime, provider, deploy, or live data validation is part of this plan.

---

### Task 1: Generate, Normalize, and Render the 20 Local Avatar Assets

**Files:**
- Create: `front/shared/ui/book-club-avatar.ts`
- Create: `front/shared/ui/book-club-avatar.test.ts`
- Create: `front/public/assets/avatars/book-club/reading-lamp.webp`
- Create: `front/public/assets/avatars/book-club/open-book-pencil.webp`
- Create: `front/public/assets/avatars/book-club/book-spines.webp`
- Create: `front/public/assets/avatars/book-club/bookmark-page.webp`
- Create: `front/public/assets/avatars/book-club/notebook-pen.webp`
- Create: `front/public/assets/avatars/book-club/library-stamp.webp`
- Create: `front/public/assets/avatars/book-club/books-glasses.webp`
- Create: `front/public/assets/avatars/book-club/index-cards.webp`
- Create: `front/public/assets/avatars/book-club/archive-box.webp`
- Create: `front/public/assets/avatars/book-club/round-table-books.webp`
- Create: `front/public/assets/avatars/book-club/paired-bookmarks.webp`
- Create: `front/public/assets/avatars/book-club/book-dialogue.webp`
- Create: `front/public/assets/avatars/book-club/question-card.webp`
- Create: `front/public/assets/avatars/book-club/calendar-book.webp`
- Create: `front/public/assets/avatars/book-club/feedback-sheet.webp`
- Create: `front/public/assets/avatars/book-club/reading-notes.webp`
- Create: `front/public/assets/avatars/book-club/banded-book.webp`
- Create: `front/public/assets/avatars/book-club/desk-clock-book.webp`
- Create: `front/public/assets/avatars/book-club/book-tote.webp`
- Create: `front/public/assets/avatars/book-club/discussion-circle.webp`
- Modify: `front/shared/ui/avatar-chip.tsx`
- Delete: `front/shared/ui/avatar-chip-utils.ts`
- Modify: `front/shared/ui/avatar-chip.ct.tsx`
- Modify: `design/system/src/styles/tokens.css`
- Test: `front/shared/ui/book-club-avatar.test.ts`
- Test: `front/shared/ui/avatar-chip.ct.tsx`

**Interfaces:**
- Produces: `BOOK_CLUB_AVATAR_KEYS`, `BookClubAvatarKey`, `DEFAULT_BOOK_CLUB_AVATAR_KEY`, `isBookClubAvatarKey(value)`, and `bookClubAvatarSrc(value)`.
- Produces: `AvatarChip({ avatarKey, name, label, rsvpStatus, size })` with decorative image/fallback behavior.
- Consumes: no server contract; unknown strings are accepted at the component boundary and normalized locally.

- [ ] **Step 1: Write the failing manifest tests**

```ts
import { describe, expect, it } from "vitest";
import {
  BOOK_CLUB_AVATAR_KEYS,
  DEFAULT_BOOK_CLUB_AVATAR_KEY,
  bookClubAvatarSrc,
  isBookClubAvatarKey,
} from "./book-club-avatar";

describe("book-club avatar manifest", () => {
  it("contains exactly 20 unique stable keys", () => {
    expect(BOOK_CLUB_AVATAR_KEYS).toHaveLength(20);
    expect(new Set(BOOK_CLUB_AVATAR_KEYS)).toHaveLength(20);
    expect(BOOK_CLUB_AVATAR_KEYS[0]).toBe("reading-lamp");
    expect(BOOK_CLUB_AVATAR_KEYS[8]).toBe("archive-box");
    expect(BOOK_CLUB_AVATAR_KEYS[19]).toBe("discussion-circle");
  });

  it("maps only allowlisted values to public static paths", () => {
    expect(isBookClubAvatarKey("book-tote")).toBe(true);
    expect(isBookClubAvatarKey("../../member-id")).toBe(false);
    expect(bookClubAvatarSrc("book-tote")).toBe("/assets/avatars/book-club/book-tote.webp");
    expect(bookClubAvatarSrc("../../member-id")).toBe(
      `/assets/avatars/book-club/${DEFAULT_BOOK_CLUB_AVATAR_KEY}.webp`,
    );
    expect(bookClubAvatarSrc(null)).toBe("/assets/avatars/book-club/archive-box.webp");
  });
});
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run: `corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts`

Expected: FAIL because `book-club-avatar.ts` does not exist.

- [ ] **Step 3: Implement the ordered frontend manifest**

```ts
export const BOOK_CLUB_AVATAR_KEYS = [
  "reading-lamp", "open-book-pencil", "book-spines", "bookmark-page",
  "notebook-pen", "library-stamp", "books-glasses", "index-cards",
  "archive-box", "round-table-books", "paired-bookmarks", "book-dialogue",
  "question-card", "calendar-book", "feedback-sheet", "reading-notes",
  "banded-book", "desk-clock-book", "book-tote", "discussion-circle",
] as const;

export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATAR_KEYS)[number];
export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "archive-box";
const keySet = new Set<string>(BOOK_CLUB_AVATAR_KEYS);

export function isBookClubAvatarKey(value: unknown): value is BookClubAvatarKey {
  return typeof value === "string" && keySet.has(value);
}

export function normalizeBookClubAvatarKey(value: unknown): BookClubAvatarKey {
  return isBookClubAvatarKey(value) ? value : DEFAULT_BOOK_CLUB_AVATAR_KEY;
}

export function bookClubAvatarSrc(value: unknown) {
  return `/assets/avatars/book-club/${normalizeBookClubAvatarKey(value)}.webp`;
}
```

- [ ] **Step 4: Generate the 20 source images with the built-in image generation tool**

Invoke the repository-available image-generation skill/tool once per stable key. Use this exact common prompt and replace only `{MOTIF}` and `{COLORS}` with the rows below:

```text
Create one square non-human avatar for a Korean book-club web app. Motif: {MOTIF}. Compact flat editorial letterpress still life, one bold simple centered silhouette, weak paper and print texture, warm muted paper background, exactly two ink colors: {COLORS}. Designed to remain immediately distinct and readable at 24px. No person, face, eyes, hands, body, animal, character, letter, number, word, logo, watermark, photo, gradient, 3D, drop shadow, border, or UI frame. No text of any kind. 1:1 composition with generous safe margin.
```

| Key | `{MOTIF}` | `{COLORS}` |
| --- | --- | --- |
| `reading-lamp` | angled reading lamp casting a small pool of light onto a closed book | ink blue and mustard |
| `open-book-pencil` | open book with one diagonal pencil | ink blue and rust |
| `book-spines` | three distinct upright book spines with no markings | olive and mustard |
| `bookmark-page` | single open page with a ribbon bookmark | rust and ink blue |
| `notebook-pen` | closed notebook and fountain pen without lettering | olive and rust |
| `library-stamp` | rubber library stamp beside a plain card, no imprint or text | ink blue and mustard |
| `books-glasses` | two stacked books with simple round reading glasses | olive and ink blue |
| `index-cards` | small fan of blank index cards | rust and mustard |
| `archive-box` | archival document box with a plain tab and no label | ink blue and olive |
| `round-table-books` | top view of a round table with three books | rust and ink blue |
| `paired-bookmarks` | two crossed ribbon bookmarks | olive and mustard |
| `book-dialogue` | two open books angled toward each other like a conversation, no speech bubbles | ink blue and rust |
| `question-card` | blank question card beside a closed book, use shape only and no question mark | mustard and olive |
| `calendar-book` | ring-bound blank calendar shape resting on a book, no dates or numbers | rust and ink blue |
| `feedback-sheet` | blank feedback sheet with two abstract check lines but no glyphs | olive and rust |
| `reading-notes` | three overlapping blank reading-note slips | mustard and ink blue |
| `banded-book` | closed book wrapped with a simple elastic band | rust and olive |
| `desk-clock-book` | minimal analog desk clock with no numerals beside a book | ink blue and mustard |
| `book-tote` | cloth tote carrying two plain books | olive and rust |
| `discussion-circle` | top view of four closed books arranged in a circle | mustard and ink blue |

Reject and regenerate an asset once if it contains a prohibited element or is not distinguishable at thumbnail size. If the second attempt fails, replace only that motif with a simpler arrangement of the same book-club objects; do not change the key.

- [ ] **Step 5: Normalize generated outputs to tracked 256x256 WebP files**

Use a lossless working copy outside the repository, crop only to preserve the centered 1:1 composition, and export each accepted source to its exact destination filename. On macOS the deterministic conversion command for each source is:

```bash
avatar_source_path=/absolute/path/returned/by/the/image-generation-tool.png
avatar_key=reading-lamp
sips --resampleHeightWidth 256 256 --setProperty format webp "$avatar_source_path" --out "front/public/assets/avatars/book-club/${avatar_key}.webp"
```

Repeat the last two assignments/command for each exact key in the table; use the actual absolute output path returned by the image tool and the corresponding literal stable key.

If the installed `sips` cannot encode WebP, use the already-available workspace image runtime; do not add an npm dependency solely for conversion. Do not track generated PNG sources, rejected variants, prompts, or a contact sheet.

- [ ] **Step 6: Replace monogram rendering with bounded image fallback state**

Implement `AvatarChip` with the following state transition, keeping the existing RSVP `data-` attribute and size custom property:

```tsx
const requestedKey = normalizeBookClubAvatarKey(avatarKey);
const [renderedKey, setRenderedKey] = useState<BookClubAvatarKey | null>(requestedKey);

useEffect(() => setRenderedKey(requestedKey), [requestedKey]);

function handleImageError() {
  setRenderedKey((current) =>
    current === DEFAULT_BOOK_CLUB_AVATAR_KEY ? null : DEFAULT_BOOK_CLUB_AVATAR_KEY,
  );
}

return (
  <span
    className="rm-avatar-chip"
    data-rsvp-status={rsvpStatus}
    title={safeLabel || undefined}
    style={{ "--avatar-size": `${size}px` } as CSSProperties}
  >
    {renderedKey ? (
      <img
        src={bookClubAvatarSrc(renderedKey)}
        alt=""
        aria-hidden="true"
        onError={handleImageError}
      />
    ) : null}
  </span>
);
```

Remove `fallbackInitial`, `avatarInitial`, text hashing, tone selection, and monogram text. Keep `name` and `label` only for a non-identifying `title`; when the full name is adjacent, callers pass an empty label so the image remains decorative.

- [ ] **Step 7: Add component tests for dimensions, decorative semantics, and both failure stages**

Update `avatar-chip.ct.tsx` to mount every key at 24/32/48/64px, assert every `<img>` has `naturalWidth === 256`, `naturalHeight === 256`, `alt === ""`, and take one contact-sheet screenshot. Add a test that routes a requested image to failure, observes `archive-box.webp`, fails that request too, and confirms the outer `.rm-avatar-chip` remains visible without an `<img>`.

- [ ] **Step 8: Run focused asset and component verification**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
```

Expected: PASS; the screenshot clearly distinguishes all 20 motifs at 24, 32, 48, and 64px.

- [ ] **Step 9: Commit the asset foundation**

```bash
git add front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts front/shared/ui/avatar-chip.tsx front/shared/ui/avatar-chip.ct.tsx design/system/src/styles/tokens.css front/public/assets/avatars/book-club
git rm front/shared/ui/avatar-chip-utils.ts
git commit -m "feat(ui): add neutral book club avatars"
```

---

### Task 2: Add and Backfill the Membership Avatar Key

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V43__membership_book_club_avatars.sql`
- Create: `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Interfaces:**
- Produces: non-null `memberships.avatar_key varchar(40)` constrained to the 20 stable wire values.
- Produces: `BookClubAvatarKey.ordered`, `BookClubAvatarKey.fallback`, `BookClubAvatarKey.fromWireValue(value)`.
- Consumes: current last migration `V42`; re-check the directory immediately before creating the migration and renumber both file and test target if another migration has landed.

- [ ] **Step 1: Extend the Flyway upgrade test for a V42-to-V43 backfill**

Before latest migration, insert two clubs with more than 20 memberships across `ACTIVE`, `SUSPENDED`, `VIEWER`, `LEFT`, and `INACTIVE`, deliberately ordering timestamps and UUIDs. After migration assert:

```kotlin
assertThat(upgradeResult.migrationsExecuted).isEqualTo(1)
assertThat(latestVersion).isEqualTo("43")
assertThat(nullAvatarKeyCount).isZero()
assertThat(visibleKeysForFirstClub.take(20).distinct()).hasSize(20)
assertThat(visibleKeysForFirstClub[20]).isEqualTo("reading-lamp")
assertThat(keysOrderedByCreatedAt.take(3)).containsExactly(
    "reading-lamp", "open-book-pencil", "book-spines",
)
```

Also try inserting `avatar_key = 'member-id'` and assert a check-constraint failure.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `./server/gradlew -p server test --tests 'com.readmates.support.MySqlFlywayMigrationTest'`

Expected: FAIL because the latest migration is still V42 and `avatar_key` does not exist.

- [ ] **Step 3: Add the ordered server enum**

```kotlin
enum class BookClubAvatarKey(val wireValue: String) {
    READING_LAMP("reading-lamp"),
    OPEN_BOOK_PENCIL("open-book-pencil"),
    BOOK_SPINES("book-spines"),
    BOOKMARK_PAGE("bookmark-page"),
    NOTEBOOK_PEN("notebook-pen"),
    LIBRARY_STAMP("library-stamp"),
    BOOKS_GLASSES("books-glasses"),
    INDEX_CARDS("index-cards"),
    ARCHIVE_BOX("archive-box"),
    ROUND_TABLE_BOOKS("round-table-books"),
    PAIRED_BOOKMARKS("paired-bookmarks"),
    BOOK_DIALOGUE("book-dialogue"),
    QUESTION_CARD("question-card"),
    CALENDAR_BOOK("calendar-book"),
    FEEDBACK_SHEET("feedback-sheet"),
    READING_NOTES("reading-notes"),
    BANDED_BOOK("banded-book"),
    DESK_CLOCK_BOOK("desk-clock-book"),
    BOOK_TOTE("book-tote"),
    DISCUSSION_CIRCLE("discussion-circle");

    companion object {
        val ordered: List<BookClubAvatarKey> = entries
        val fallback: BookClubAvatarKey = ARCHIVE_BOX
        fun fromWireValue(value: String?): BookClubAvatarKey? = entries.firstOrNull { it.wireValue == value }
    }
}
```

- [ ] **Step 4: Implement the additive migration and deterministic backfill**

The migration must:

1. `alter table memberships add column avatar_key varchar(40) null`.
2. Rank each club by visible-status group first, then `created_at`, then `id`.
3. Map `mod(row_number - 1, 20)` to the exact ordered key list with a `CASE` expression.
4. Update every membership from the ranked derived table.
5. Change the column to `not null`.
6. Add `memberships_avatar_key_check` with all 20 literal values.
7. Add `memberships_club_status_avatar_idx (club_id, status, avatar_key)` for allocation reads.

The ranking expression is:

```sql
row_number() over (
  partition by club_id
  order by
    case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
    created_at,
    id
)
```

- [ ] **Step 5: Run the migration test and architecture test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.support.MySqlFlywayMigrationTest'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add server/src/main/resources/db/mysql/migration/V43__membership_book_club_avatars.sql server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "feat(auth): persist membership avatar keys"
```

---

### Task 3: Allocate Stable Keys in Auth Transactions and Expose Auth Identity

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAvatarAllocationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAvatarAllocationAdapterTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/GoogleAccountStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/HostInvitationStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcHostInvitationStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/model/MemberProfileCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/HostMemberListItemMapper.kt`
- Modify: auth persistence row mappers that construct `CurrentMember`, `MemberProfileRow`, `LifecycleMembershipRow`, or `HostMemberListRow`
- Test: `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/application/AcceptInvitationUseCaseTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`

**Interfaces:**
- Produces: `MemberAvatarAllocationPort.allocate(clubId: UUID, userId: UUID?): BookClubAvatarKey` and `allocateForClubSlug(clubSlug: String, userId: UUID?): BookClubAvatarKey`.
- Produces: `avatarKey: String` on `CurrentMember`, auth current membership/top-level compatibility field, member profile, and host member list responses.
- Consumes: `BookClubAvatarKey.ordered` from Task 2 and persists the returned `wireValue` in existing membership insert/upsert methods.

- [ ] **Step 1: Write allocator unit/integration tests first**

Cover all rules with MySQL-backed tests:

```kotlin
@Test
fun `first twenty visible memberships receive distinct ordered keys then cycle`() {
    val assigned = (0 until 21).map { index ->
        val key = adapter.allocate(CLUB_ID)
        persistMembership(userId = userId(index), status = MembershipStatus.ACTIVE, avatarKey = key)
        key
    }

    assertThat(assigned.take(20)).containsExactlyElementsOf(BookClubAvatarKey.ordered)
    assertThat(assigned.take(20).distinct()).hasSize(20)
    assertThat(assigned[20]).isEqualTo(BookClubAvatarKey.READING_LAMP)
}

@Test
fun `left membership frees its key and rejoin retains a free previous key`() {
    persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.READING_LAMP)
    assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.READING_LAMP)
}

@Test
fun `rejoin chooses first unused key when previous key is occupied`() {
    persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.READING_LAMP)
    persistMembership(OTHER_USER_ID, MembershipStatus.ACTIVE, BookClubAvatarKey.READING_LAMP)
    assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.OPEN_BOOK_PENCIL)
}

@Test
fun `parallel allocations serialize on the club row`() {
    val start = CountDownLatch(1)
    val results = ConcurrentLinkedQueue<BookClubAvatarKey>()
    val futures = listOf(FIRST_USER_ID, SECOND_USER_ID).map { userId ->
        executor.submit {
            start.await()
            transactionTemplate.executeWithoutResult {
                val key = adapter.allocate(CLUB_ID, userId)
                persistMembership(userId, MembershipStatus.ACTIVE, key)
                results += key
            }
        }
    }
    start.countDown()
    futures.forEach { it.get(10, TimeUnit.SECONDS) }
    assertThat(results).containsExactlyInAnyOrder(
        BookClubAvatarKey.READING_LAMP,
        BookClubAvatarKey.OPEN_BOOK_PENCIL,
    )
}
```

Define `persistMembership(userId, status, avatarKey)` in the test file as one explicit `JdbcTemplate.update` inserting into the already-seeded `CLUB_ID`, and define `userId(index)` as deterministic UUIDs. Shut down the executor in `@AfterEach`.

The concurrency test must use two executor threads and two independent transactions; coordinate their start with latches and assert distinct keys rather than relying on timing sleeps.

- [ ] **Step 2: Add failing application and response tests**

In `GoogleLoginServiceTest`, verify `avatarAllocation.allocateForClubSlug("reading-sai", null)` is called and this exact returned enum is passed as the fifth `createViewerGoogleMember` argument. In `AcceptInvitationUseCaseTest`, verify `allocate(invitation.clubId, userId)` is called and this exact returned enum is passed as the fourth `upsertActiveMembership` argument. Use Mockito `inOrder(avatarAllocation, googleAccountStore)` to prove allocation precedes persistence. In API tests assert JSON contains only `avatarKey: "reading-lamp"`, never an asset URL or identifier-derived value.

- [ ] **Step 3: Run focused auth tests and verify RED**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.adapter.out.persistence.JdbcMemberAvatarAllocationAdapterTest' --tests 'com.readmates.auth.application.GoogleLoginServiceTest' --tests 'com.readmates.auth.application.AcceptInvitationUseCaseTest' --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest' --tests 'com.readmates.auth.api.AuthMeControllerTest'
```

Expected: FAIL because allocation and `avatarKey` contracts do not exist.

- [ ] **Step 4: Implement the allocation port and locked JDBC adapter**

```kotlin
interface MemberAvatarAllocationPort {
    fun allocate(clubId: UUID, userId: UUID? = null): BookClubAvatarKey
    fun allocateForClubSlug(clubSlug: String, userId: UUID? = null): BookClubAvatarKey
}
```

`allocateForClubSlug` resolves and locks the club row by the exact slug, then delegates to the same private allocation routine. Inside that routine:

1. `select id from clubs where id = ? for update`; throw if no club exists.
2. If `userId` is present, load the existing membership's stored key for that club.
3. Query keys used by other memberships with visible status.
4. Return the previous parsed key when it is not used by another visible membership.
5. Otherwise return the first ordered key absent from the used set.
6. If all 20 are used, return `ordered[visibleMembershipCount % ordered.size]`.

Keep this adapter free of membership insert/update side effects; the application service owns the orchestration and passes the result into the existing store ports.

- [ ] **Step 5: Wire allocation into both existing transactional creation paths**

Change port signatures to:

```kotlin
fun createViewerGoogleMember(
    googleSubjectId: String,
    email: String,
    displayName: String?,
    profileImageUrl: String?,
    avatarKey: BookClubAvatarKey,
): CurrentMember

fun upsertActiveMembership(
    clubId: UUID,
    userId: UUID,
    role: MembershipRole,
    avatarKey: BookClubAvatarKey,
): UUID
```

`GoogleLoginService` calls `allocateForClubSlug("reading-sai", null)` before inserting the current default viewer membership. `InvitationService` calls `allocate(invitation.clubId, userId)`. Inserts write `avatar_key`; reactivation updates role/status but uses the allocated key only when the previous key is occupied, preserving it otherwise. Keep the existing default-club behavior unchanged; this task does not introduce club selection during first Google login.

- [ ] **Step 6: Add `avatarKey` to authenticated identity, profile, and host-member projections**

Add `val avatarKey: String` to `MemberProfile`, `MemberProfileResponse`, `MemberProfileRow`, `LifecycleMembershipRow`, `HostMemberListRow`, and `HostMemberListItem`. Add `val avatarKey: String = BookClubAvatarKey.fallback.wireValue` to `CurrentMember` so non-database security test fixtures remain source-compatible; every production SQL mapper must still select and pass `memberships.avatar_key`. Every web DTO emits the wire string unchanged. Add `avatarKey` to `AuthCurrentMembership` and the top-level compatibility property:

```kotlin
val avatarKey: String? = currentMembership?.avatarKey
```

Do not add `avatarKey` to platform-admin-only identities without a membership.

- [ ] **Step 7: Verify lifecycle stability and JSON contracts**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.*' --tests 'com.readmates.auth.api.*' --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
./server/gradlew -p server architectureTest
```

Expected: PASS; display-name update, suspend/restore, and role changes preserve the stored key.

- [ ] **Step 8: Commit allocation and auth contracts**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt server/src/test/kotlin/com/readmates/auth
git commit -m "feat(auth): allocate stable club avatars"
```

---

### Task 4: Project Avatar Keys Through Current and Host Session Contracts

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcCurrentSessionAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt`
- Modify: session web mappers/controllers only where explicit DTO mapping exists
- Test: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`

**Interfaces:**
- Produces: `avatarKey: String` on `SessionAttendee`, `CurrentSessionQuestion`, `CurrentSessionOneLineReview`, `CurrentSessionLongReview`, and `HostSessionAttendee`.
- Consumes: stored `memberships.avatar_key` from Task 2; no name/hash fallback in SQL.

- [ ] **Step 1: Add failing controller assertions for all current-session author shapes**

Seed two same-surname memberships with `reading-lamp` and `book-tote`. Assert attendee, question, one-line review, and long-review JSON each returns the author's stored key and never `profileImageUrl`.

- [ ] **Step 2: Add failing host-session attendee assertion**

Seed a host-session participant and assert:

```kotlin
jsonPath("$.attendees[0].avatarKey").value("book-tote")
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: FAIL because the response objects do not yet include `avatarKey`.

- [ ] **Step 4: Add fields and select the membership key in existing joins**

Add `avatarKey` directly beside each author or attendee identity field. Extend existing membership joins and row mappers with explicit aliases: `attendee_avatar_key`, `question_author_avatar_key`, `one_line_review_author_avatar_key`, and `long_review_author_avatar_key`. Do not create a second query, N+1 lookup, or cache key. Questions and reviews without a resolvable membership use `BookClubAvatarKey.fallback.wireValue` only at the mapper boundary.

- [ ] **Step 5: Run focused tests and the query-budget test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.session.api.HostSessionControllerDbTest' --tests 'com.readmates.performance.ServerQueryBudgetTest'
```

Expected: PASS with unchanged query counts.

- [ ] **Step 6: Commit session projections**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt
git commit -m "feat(session): expose participant avatar keys"
```

---

### Task 5: Project Safe Avatar Keys Through Archive, Notes, and Public Records

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveDetailFragments.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveDetailQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/application/model/NotesFeedResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/in/web/NotesFeedWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/model/PublicResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapterTest.kt`

**Interfaces:**
- Produces: nullable `avatarKey` beside nullable member authors internally; web output uses a safe string key when an author is rendered.
- Consumes: `BookClubAvatarKey.fallback.wireValue` for missing, `LEFT`, system, or anonymous public presentation.

- [ ] **Step 1: Write failing member archive and note-feed assertions**

Assert highlight, question, one-liner, and note-feed items return the stored key for visible memberships. Where the existing contract suppresses author identity, assert the response uses `archive-box` and does not leak the stored departed-member key.

- [ ] **Step 2: Write failing public-record privacy assertions**

Create an active author and a `LEFT` author with different stored keys. Assert active public rows expose the active key, while the departed/anonymous row returns `archive-box` together with the existing anonymized name behavior.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest' --tests 'com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapterTest'
```

Expected: FAIL because the read models omit `avatarKey`.

- [ ] **Step 4: Extend existing joins and response mapping**

Select `memberships.avatar_key` in the membership joins already used for author display names. Add one `avatarKey` field beside `authorName`/`authorShortName` in each result and web item used by a frontend `AvatarChip`. Apply this mapping rule once at each web mapper boundary:

```kotlin
val publicAvatarKey =
    if (membershipStatus == MembershipStatus.LEFT || authorName == null) {
        BookClubAvatarKey.fallback.wireValue
    } else {
        BookClubAvatarKey.fromWireValue(storedAvatarKey)?.wireValue
            ?: BookClubAvatarKey.fallback.wireValue
    }
```

Do not alter record visibility, author-name anonymization, pagination, cache identity, or query count.

- [ ] **Step 5: Run focused tests and read-side query budgets**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest' --tests 'com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapterTest' --tests 'com.readmates.performance.ServerQueryBudgetTest'
```

Expected: PASS.

- [ ] **Step 6: Commit read projections**

```bash
git add server/src/main/kotlin/com/readmates/archive server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/publication server/src/test/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/publication
git commit -m "feat(read-models): project safe avatar keys"
```

---

### Task 6: Add Avatar Keys to Frontend Contracts and Every Existing Avatar Consumer

**Files:**
- Modify: `front/shared/auth/auth-contracts.ts`
- Modify: `front/shared/model/current-session-contracts.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/model/archive-model.ts`
- Modify: `front/features/archive/model/notes-feed-model.ts`
- Modify: `front/features/member-home/api/member-home-contracts.ts`
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/public/api/public-contracts.ts`
- Modify: `front/features/public/model/public-display-model.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/model/host-view-types.ts`
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/archive/ui/notes-feed-list.tsx`
- Modify: `front/features/current-session/ui/current-session-panels.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-board-segment.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- Modify: `front/features/host/ui/host-session-attendance-editor.tsx`
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/features/public/ui/public-club.tsx`
- Modify: `front/features/public/ui/public-session.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Test: existing adjacent contract/model/UI tests for every modified feature
- Test: `front/tests/unit/frontend-boundaries.test.ts`

**Interfaces:**
- Consumes: additive server `avatarKey: string` fields from Tasks 3-5 and `AvatarChip.avatarKey` from Task 1.
- Produces: all named member-backed avatar surfaces pass the server key directly; the static public host introduction passes `archive-box`.

- [ ] **Step 1: Add failing contract and view-model fixtures**

Update fixtures for auth current membership, current-session attendees/authors, archive authors, note-feed authors, public authors, and host attendees to include `avatarKey`. In Zod schemas use `z.string()` at the API boundary so unknown future keys reach the shared fallback safely; do not reject the page response because the frontend manifest is older.

- [ ] **Step 2: Add failing UI assertions for same-surname differentiation**

Render three `김…` names using `reading-lamp`, `book-tote`, and `calendar-book`. Assert their image `src` values differ while the full names and RSVP/attendance labels remain present.

- [ ] **Step 3: Run focused frontend tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/current-session/api/current-session-contracts.test.ts features/archive/ui/member-session-detail-page.test.tsx features/public/ui/public-session.test.tsx tests/unit/current-session.test.tsx tests/unit/my-page.test.tsx
```

Expected: FAIL because contract fields and `AvatarChip.avatarKey` calls are missing.

- [ ] **Step 4: Extend contracts without frontend recomputation**

Add `avatarKey: string` immediately beside every `membershipId` or author name used by the listed UI files. Preserve nullable author-name behavior, but make rendered author items carry a safe key. Do not import `book-club-avatar.ts` into feature API/model modules; key normalization belongs only to `AvatarChip`.

- [ ] **Step 5: Replace every initial-based call with direct key passing**

Use this call shape everywhere a full name is adjacent:

```tsx
<AvatarChip
  avatarKey={member.avatarKey}
  name={member.displayName}
  label=""
  rsvpStatus={member.rsvpStatus}
  size={24}
/>
```

For author items use `avatarKey={item.avatarKey}`. Remove every `fallbackInitial` prop. For `STATIC_OPERATION_INTRO`, use `avatarKey="archive-box"` because it is system-authored copy rather than a membership projection.

- [ ] **Step 6: Run focused tests and frontend boundary enforcement**

Run:

```bash
corepack pnpm --dir front exec vitest run features/current-session features/archive features/member-home features/public features/host shared/auth tests/unit/frontend-boundaries.test.ts
```

Expected: PASS and `rg -n 'fallbackInitial|avatarInitial' front --glob '*.{ts,tsx}'` returns no matches.

- [ ] **Step 7: Commit frontend contract propagation**

```bash
git add front/shared/auth front/shared/model front/features/archive front/features/current-session front/features/member-home front/features/public front/features/host front/shared/ui/top-nav.tsx front/tests/unit/frontend-boundaries.test.ts
git commit -m "feat(front): render stored avatar keys"
```

---

### Task 7: Make the Responsive Account Trigger Explicit and Reduce the Popover

**Files:**
- Modify: `front/features/auth/ui/account-menu.tsx`
- Modify: `front/features/auth/ui/account-menu.test.tsx`
- Modify: `front/features/auth/route/account-menu-controller.tsx`
- Modify: `front/features/auth/route/account-menu-controller.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/shared/ui/top-nav.ct.tsx`
- Create: `front/shared/ui/mobile-header.ct.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx` only if prop assembly requires it

**Interfaces:**
- Consumes: `auth.avatarKey`/`auth.currentMembership.avatarKey` from Task 6.
- Produces: `AccountMenuProps` with `memberName`, `avatarKey`, `membershipLabel`, and `settingsHref`; removes `mySpaceHref` and `notificationsHref`.

- [ ] **Step 1: Rewrite the account-menu test to encode the approved IA**

Assert the open dialog has exactly one link, `계정 설정`, followed by `로그아웃`; assert `내 공간` and `알림` are absent. Assert trigger accessible name remains `멤버1 계정 메뉴`, has `aria-haspopup="dialog"`, exposes `aria-expanded`, and contains desktop name/avatar plus mobile `계정` text and a stateful chevron.

- [ ] **Step 2: Preserve and extend dismissal tests**

Keep natural Tab order, Escape dismissal, outside-pointer dismissal, and focus return. Add a toggle test that observes closed `▾` and open `▴` while the accessible name remains stable.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/ui/account-menu.test.tsx features/auth/route/account-menu-controller.test.tsx
```

Expected: FAIL because the popover still includes content navigation and the trigger is avatar-only.

- [ ] **Step 4: Implement one shared trigger with responsive presentation**

Render this semantic structure inside the native button:

```tsx
<span className="rm-account-menu__trigger-avatar" aria-hidden="true">
  <AvatarChip avatarKey={avatarKey} name={memberName} label="" size={28} />
</span>
<span className="rm-account-menu__trigger-name">{memberName}</span>
<span className="rm-account-menu__trigger-mobile-label">계정</span>
<span className="rm-account-menu__chevron" aria-hidden="true">
  {open ? "▴" : "▾"}
</span>
```

Desktop CSS shows avatar/name/chevron and truncates only the name. At `max-width: 768px`, hide avatar/name, show `계정`/chevron, and keep a minimum 44px height. Do not branch state or create a second popover.

- [ ] **Step 5: Remove content navigation from controller and popover**

Delete `mySpaceHref` and `notificationsHref` props and the two links. Keep only scoped `settingsHref`, identity, membership label, logout control, error handling, and current focus logic.

- [ ] **Step 6: Verify 320px and desktop component screenshots**

Create `mobile-header.ct.tsx` with 320px host and 390px member header cases, and extend `top-nav.ct.tsx` with a 1280px long-name case. Assert `⇄` appears only for authorized host navigation, `계정` is never clipped on mobile, and desktop shows the avatar and full accessible name with visual ellipsis.

- [ ] **Step 7: Run focused account/header tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth shared/ui tests/unit/responsive-navigation.test.tsx
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/top-nav.ct.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit account navigation**

```bash
git add front/features/auth front/src/app/layouts/app-route-layout.tsx front/src/styles/globals.css front/shared/styles/mobile.css front/shared/ui/mobile-header.ct.tsx front/shared/ui/top-nav.ct.tsx
git commit -m "feat(nav): clarify responsive account access"
```

---

### Task 8: Make My Space a Complete Utility Hub

**Files:**
- Create: `front/features/archive/ui/my-page/member-space-utility-nav.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/route/my-page-route.test.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Modify: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `MemberSpaceUtilityNav({ notificationsHref, settingsHref })` with no router, API, auth, or query imports.
- Consumes: `scopedAppLinkTarget(location.pathname, target)` in `MyPageRoute`.

- [ ] **Step 1: Add failing route and ordering tests**

For both scoped and unscoped routes, assert `MyPage` receives:

```ts
notificationsHref: "/clubs/reading-sai/app/notifications"
settingsHref: "/clubs/reading-sai/app/me/settings"
```

Render the shelf and assert `내 공간 관리` appears after the overview and before `나의 독서 기록`, with rows `알림` / `받은 알림과 수신 설정` and `계정 설정` / `프로필과 멤버십 정보`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/route/my-page-route.test.tsx features/archive/ui/my-page/member-space-sections.test.tsx
```

Expected: FAIL because the utility navigation does not exist.

- [ ] **Step 3: Implement the presentation-only quiet list**

```tsx
export function MemberSpaceUtilityNav({ notificationsHref, settingsHref }: Props) {
  return (
    <section className="rm-member-space-utilities" aria-labelledby="member-space-utilities-heading">
      <p className="rm-member-space-kicker">내 공간 관리</p>
      <h2 id="member-space-utilities-heading" className="sr-only">내 공간 관리</h2>
      <div className="rm-member-space-utilities__list">
        <UtilityLink href={notificationsHref} label="알림" description="받은 알림과 수신 설정" />
        <UtilityLink href={settingsHref} label="계정 설정" description="프로필과 멤버십 정보" />
      </div>
    </section>
  );
}
```

Each anchor has at least 48px row height, one trailing chevron marked `aria-hidden`, one shared quiet surface, and a divider between rows. Do not add a badge or fetch.

- [ ] **Step 4: Assemble club-scoped links in the route**

Pass `scopedHref("/app/notifications")` and `scopedHref("/app/me/settings")` through `MyPage` and `MyReadingShelf`; render the utility navigation between `MemberSpaceOverview` and `RecentReadingList`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/route/my-page-route.test.tsx features/archive/ui/my-page/member-space-sections.test.tsx tests/unit/my-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the My Space utility hub**

```bash
git add front/features/archive front/src/styles/globals.css
git commit -m "feat(my-space): add account and notification links"
```

---

### Task 9: Add Fixed My Space Parent Navigation and Desktop Breadcrumbs

**Files:**
- Create: `front/features/notifications/ui/member-space-breadcrumb.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Modify: `front/features/notifications/route/member-notifications-route.tsx`
- Modify: `front/features/notifications/route/member-notification-settings-route.tsx`
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Modify: `front/features/notifications/ui/member-notifications-page.test.tsx`
- Modify: `front/features/notifications/ui/member-notification-settings-page.tsx`
- Modify: `front/features/notifications/ui/member-notification-settings-page.test.tsx`
- Modify: `front/features/archive/ui/account-settings-page.tsx`
- Modify: `front/features/archive/ui/account-settings-page.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Produces: mobile back targets for `/app/notifications`, `/app/notifications/settings`, and `/app/me/settings`, each fixed to `/app/me` before club scoping.
- Produces: `MemberSpaceBreadcrumb({ mySpaceHref, currentLabel: "알림" })` visible only above 768px.
- Consumes: route-computed club-scoped `mySpaceHref`; never uses `history.back()`.

- [ ] **Step 1: Add failing mobile-header route tests**

Assert these exact mappings for scoped and unscoped paths:

```text
/clubs/reading-sai/app/notifications          -> /clubs/reading-sai/app/me, label 내 공간
/clubs/reading-sai/app/notifications/settings -> /clubs/reading-sai/app/me, label 내 공간
/clubs/reading-sai/app/me/settings            -> /clubs/reading-sai/app/me, label 내 공간
```

Assert the fixed target is unchanged on direct entry with no location state.

- [ ] **Step 2: Add failing notification and account-settings presentation tests**

At desktop width, assert `내 공간` is a link and `알림` is current text before the page title. At mobile width, assert the breadcrumb is hidden and the `MobileHeader` owns the only visible `내 공간` back control. Assert `AccountSettingsPage` body back link is desktop-visible and mobile-hidden, avoiding duplicates.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/notifications/ui/member-notifications-page.test.tsx features/notifications/ui/member-notification-settings-page.test.tsx features/archive/ui/account-settings-page.test.tsx tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL because notification/settings routes have no fixed parent target or breadcrumb.

- [ ] **Step 4: Add fixed route targets in `appBackTarget`**

Insert these checks before the generic `return null`:

```ts
if (pathname === "/app/notifications" || pathname === "/app/notifications/settings") {
  return { href: "/app/me", label: "내 공간" };
}
if (pathname === "/app/me/settings") {
  return { href: "/app/me", label: "내 공간" };
}
```

Use the existing `scopeAppBackTarget` so scoped URLs remain correct.

- [ ] **Step 5: Add desktop breadcrumb and responsive ownership**

Both notification route components compute `mySpaceHref = scopedAppLinkTarget(location.pathname, "/app/me")` and pass it to their page. `MemberSpaceBreadcrumb` renders:

```tsx
<nav className="rm-member-space-breadcrumb desktop-only" aria-label="현재 위치">
  <a href={mySpaceHref}>내 공간</a>
  <span aria-hidden="true">/</span>
  <span aria-current="page">알림</span>
</nav>
```

Keep notification tabs and page title unchanged. Hide `.rm-account-settings-page__back` at mobile widths and keep it visible on desktop.

- [ ] **Step 6: Run focused navigation tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/notifications features/archive/ui/account-settings-page.test.tsx tests/unit/responsive-navigation.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit hierarchy navigation**

```bash
git add front/shared/ui/mobile-header.tsx front/features/notifications front/features/archive/ui/account-settings-page.tsx front/features/archive/ui/account-settings-page.test.tsx front/src/styles/globals.css front/shared/styles/mobile.css front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat(nav): restore my space hierarchy"
```

---

### Task 10: Prove the Integrated Responsive User Flow

**Files:**
- Create: `front/tests/e2e/account-navigation-avatars.spec.ts`
- Modify: visual baselines created by Task 1/7 only when inspection confirms the new output

**Interfaces:**
- Consumes: final server/frontend contract and UI from Tasks 1-9.
- Produces: browser evidence for 320, 390, and 1280px without production data or external image requests.

- [ ] **Step 1: Write a failing scoped E2E flow**

The test must use synthetic users with the same surname and different allowlisted keys. Cover:

1. Open `/clubs/reading-sai/app/notifications` directly at 390px.
2. Observe bottom/top navigation still marks `내 공간` current.
3. Use `‹ 내 공간`, then open `알림` from the new utility list.
4. Open `계정`, confirm popover excludes `내 공간`/`알림`, and open `계정 설정`.
5. Confirm the fixed parent link returns to the same club-scoped `/app/me`.
6. Switch to host workspace and confirm `⇄` and `계정` are distinct controls while logout remains reachable.
7. At 1280px, confirm desktop account trigger shows the member's avatar and name.
8. Confirm three same-surname members in an attendee/member list have three different local asset URLs.
9. Abort one avatar image request and confirm the full name/action remains usable with fallback.

- [ ] **Step 2: Run the new test and verify RED before final fixture wiring**

Run: `corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts --project=chromium`

Expected: FAIL until all fixture responses include `avatarKey` and selectors match the new navigation.

- [ ] **Step 3: Update only synthetic fixtures and stable selectors**

Keep all route interception and synthetic membership fixtures local to `account-navigation-avatars.spec.ts`; every membership-bearing response receives an explicit allowlisted key. Do not use names, UUID fragments, Google URLs, or real member data to synthesize the value. Prefer accessible-role selectors such as `getByRole("button", { name: /계정 메뉴/ })` and `getByRole("link", { name: "내 공간" })`.

- [ ] **Step 4: Capture and inspect responsive screenshots**

Capture 320px and 390px mobile headers with/without `⇄`, open account popover, My Space utilities, notification parent navigation, and 1280px desktop trigger. Store screenshots only in the ignored test-output/evidence directory, not product assets. Check for overlap, clipped `계정`, duplicate back links, popover viewport clipping, and indistinguishable 24px silhouettes.

- [ ] **Step 5: Run the focused E2E and component suites**

Run:

```bash
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts --project=chromium
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx shared/ui/mobile-header.ct.tsx shared/ui/top-nav.ct.tsx
```

Expected: PASS with no external Google image requests.

- [ ] **Step 6: Commit integrated browser evidence code**

```bash
git add front/tests/e2e/account-navigation-avatars.spec.ts front/shared/ui/avatar-chip.ct.tsx front/shared/ui/mobile-header.ct.tsx front/shared/ui/top-nav.ct.tsx
git commit -m "test(e2e): cover account navigation avatars"
```

Do not stage Playwright output, generated screenshots outside committed baselines, or the unrelated Google login plan.

---

### Task 11: Run Full Gates and Close the Approved Design Records

**Files:**
- Modify: `docs/superpowers/specs/2026-08-01-responsive-account-navigation-design.md`
- Modify: `docs/superpowers/specs/2026-08-01-neutral-book-club-avatars-design.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/development/architecture.md` only if the implemented public contract inventory currently enumerates auth/session/archive/public response fields and would otherwise become factually stale

**Interfaces:**
- Consumes: final HEAD after Tasks 1-10.
- Produces: verified implementation evidence and local documentation closeout; no remote mutation.

- [ ] **Step 1: Run static safety scans before broad tests**

Run:

```bash
test "$(find front/public/assets/avatars/book-club -type f -name '*.webp' | wc -l | tr -d ' ')" = "20"
find front/public/assets/avatars/book-club -type f ! -name '*.webp' -print
google_profile_host='google''usercontent'
private_root_pattern='/'Users'/'
rg -n 'profileImageUrl' front/features front/shared --glob '*.{ts,tsx}'
if rg -n "${google_profile_host}|fallbackInitial|avatarInitial" front/features front/shared --glob '*.{ts,tsx}'; then exit 1; fi
if find front/public/assets/avatars/book-club -type f -print | rg "${private_root_pattern}|member-id|token|secret"; then exit 1; fi
if rg -n "${private_root_pattern}" CHANGELOG.md docs/superpowers/specs/2026-08-01-responsive-account-navigation-design.md docs/superpowers/specs/2026-08-01-neutral-book-club-avatars-design.md; then exit 1; fi
```

Expected: exactly 20 WebPs; no non-WebP assets; no avatar rendering from `profileImageUrl`; no monogram helpers; no private-path/identifier-derived asset references. Legitimate `profileImageUrl` contract/storage declarations may remain and must be reviewed rather than deleted.

- [ ] **Step 2: Run focused frontend tests at final HEAD**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts features/auth features/archive features/current-session features/member-home features/notifications features/public features/host tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full frontend gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: PASS. If full E2E requires a local runtime, use an isolated port/cache/container and preserve any existing user services.

- [ ] **Step 4: Run full server gates**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS, including Flyway V43 upgrade, architecture boundaries, auth concurrency, current/host sessions, archive/notes, and public privacy cases.

- [ ] **Step 5: Inspect final browser network and asset size evidence**

For one current-session page and one public-record page, verify only the visible avatars are requested, no Google/external profile URL is requested, every response is local `image/webp`, and no all-20 sprite/preload occurs. Record each asset byte size and total 20-asset size in the implementation closeout notes; do not add a runtime preload.

- [ ] **Step 6: Update approved specs and changelog**

Change both spec status lines to `구현 완료` only after all required gates pass. Add an `Unreleased` changelog bullet summarizing explicit responsive account access, My Space parent navigation, and privacy-safe stable book-club avatars. Update active architecture docs only for factual contract inventory drift; do not copy the whole historical design into active docs.

- [ ] **Step 7: Run documentation and diff hygiene checks**

Run:

```bash
git diff --check
private_root_pattern='/'Users'/'
local_host_pattern='local''host:[0-9]+'
google_profile_host='google''usercontent'
oauth_token_pattern='ya29[.]'
auth_header_pattern='Bear''er '
if git diff -- CHANGELOG.md docs/development/architecture.md docs/superpowers/specs/2026-08-01-responsive-account-navigation-design.md docs/superpowers/specs/2026-08-01-neutral-book-club-avatars-design.md | rg -n "${private_root_pattern}|127[.]0[.]0[.]1:[0-9]+|${local_host_pattern}|${google_profile_host}|${oauth_token_pattern}|${auth_header_pattern}"; then exit 1; fi
git status --short --branch --untracked-files=all
```

Expected: no whitespace errors or newly persisted private/token-shaped values; the unrelated Google login plan remains untracked and unstaged.

- [ ] **Step 8: Review final diff against both approved specs**

Use `git diff --stat` and `git diff --name-only` to confirm every modified path belongs to avatar persistence/projection/rendering, account navigation, My Space hierarchy, tests, or their documentation. Confirm non-goals remain untouched: BFF code, tab count/order, logout contract, notification fetch/mutation, profile upload, dependencies, deploy, and runtime provider calls.

- [ ] **Step 9: Commit documentation closeout**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-08-01-responsive-account-navigation-design.md docs/superpowers/specs/2026-08-01-neutral-book-club-avatars-design.md
git add docs/development/architecture.md  # only when Step 6 found real factual drift
git commit -m "docs: close account avatar redesign"
```

- [ ] **Step 10: Report completion without remote mutation**

Report the changed frontend/server/migration surfaces, exact commands and counts that passed, image count/dimensions/total bytes, responsive screenshot locations, current local commit SHA, and any skipped check with its reason. State explicitly that no push, PR, deploy, production data change, external profile fetch, or runtime AI call occurred.
