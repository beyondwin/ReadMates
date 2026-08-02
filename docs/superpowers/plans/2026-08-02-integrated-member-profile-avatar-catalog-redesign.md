# Integrated Member Profile and Avatar Catalog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy 40-animal avatar catalog with 30 individually cleaned assets, provide one-layer avatar rendering everywhere, and let eligible members atomically save their club-scoped display name and avatar from one adaptive profile editor.

**Architecture:** `memberships.short_name` and `memberships.avatar_key` remain the authoritative club-membership identity. A forward-only V45 migration, one server command and one `PUT /api/me/profile` transaction own the new 30-key contract; the frontend keeps a fixed local allowlist and composes a prop-driven right-side desktop/full-screen mobile editor through `route -> queries -> api`. Existing `PATCH` endpoints remain compatibility adapters, while the shared artwork modifier on `AvatarChip` updates every roster, board, archive, host, navigation and public consumer without giving avatar borders state semantics.

**Tech Stack:** React 19, TypeScript 6, React Router 7, TanStack Query 5, Vitest 4, Playwright 1.61 component/E2E tests, Kotlin, Spring Boot 4, JDBC, MySQL 8, Flyway, Gradle, macOS `sips`, WebP tools, and a temporary CoreGraphics crop helper.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-08-02-integrated-member-profile-avatar-catalog-redesign.md` at commit `36c92417`.
- The seven supplied 1448×1086 source sheets are external inputs. Stage them as `.tmp/integrated-avatar-source/sheet-1.png` through `sheet-7.png`; do not commit source sheets, crop coordinates, intermediate PNGs or contact sheets.
- Sheet slots are numbered 1–5 on the top row and 6–10 on the bottom row. Keep exactly: `1:[6,9]`, `2:[1,2,5,8]`, `3:[1,2,4,8]`, `4:[1,4,5,10]`, `5:[1,4,5,10]`, `6:[1,2,5,7,8]`, `7:[1,2,3,4,6,7,8]`.
- The product key set contains exactly these 30 stable wire keys; source coordinates are never wire values:

```text
starfish-notebook
teacup-notebook
banana-green-book
cherries-notebook
pudding-notebook
snowglobe-green-book
peach-green-book
radish-notebook
balloon-green-book
palette-green-book
lemon-green-book
sailboat-green-book
sheep-notebook
globe-notebook
apple-green-book
cheese-green-book
milk-green-book
bell-notebook
sun-green-book
tulip-notebook
teapot-green-book
envelope-notebook
candle-green-book
cloud-green-book
star-notebook
moon-green-book
mushroom-green-book
dumpling-notebook
teacup-green-book
toast-brown-book
```

- Every final asset is a 256×256 WebP. Only the selected cream oval and subject remain; the outer square is transparent, neighboring oval fragments are absent, and visible artwork keeps at least 8% safe margin.
- Crop and small-size QA all 30 assets before shuffling. Shuffle exactly once, commit the resulting literal order, and never shuffle at runtime. Frontend manifest, server enum and V45 assignment list use that same fixed order.
- `cloud-green-book` is the unknown-key, decode-failure, anonymous and left-member fallback regardless of its shuffled position.
- At rest, local artwork shows no `AvatarChip` circle, background, border or picker card. Selected/focus uses one shared ring plus a check; RSVP, attendance, role and membership status remain text/badges.
- Own-profile replacement is `PUT /api/me/profile?clubSlug=<current-club>` with required `{displayName, avatarKey}` and one transaction. Missing or invalid club context fails closed.
- Keep `PATCH /api/me/profile` and `PATCH /api/me/avatar` during the compatibility window. They accept only the new 30-key server vocabulary where relevant; the new UI does not call them.
- Do not add uploads, user crop UI, external avatar URLs, Google profile rendering, runtime image generation, avatar search/categories/history or host-targeted avatar editing.
- Keep frontend direction `route -> ui` and `route -> queries -> api`; UI does not fetch or import route modules.
- Keep server direction `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence`.
- V44 and all older migrations remain immutable. The new migration is `V45__integrated_member_profile_avatar_catalog.sql`.
- Use root-pinned `pnpm@11.13.1` through Corepack for frontend commands.
- Repository implementation and local test fixtures are authorized. Push, PR, deploy, release tags and live member-data mutation are not authorized.

---

## File Structure

### New focused units

- `front/features/archive/model/profile-update.ts` — editable profile shape, typed save failure and field/form error mapping shared by route and UI.
- `front/features/archive/ui/my-page/profile-editor-dialog.tsx` — adaptive modal shell, name/avatar draft, selection step, discard confirmation, focus and save state.
- `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx` — interaction, dirty dismissal, error and accessibility tests.
- `front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx` — 320/390/1280/200%-zoom layout evidence.
- `server/src/main/resources/db/mysql/migration/V45__integrated_member_profile_avatar_catalog.sql` — deterministic 40-to-30 replacement and named check constraint.
- `server/src/test/kotlin/com/readmates/auth/domain/BookClubAvatarKeyTest.kt` — exact server set, order and fallback contract.

### Existing ownership changes

- `front/public/assets/avatars/book-club/` — delete all 40 legacy WebPs and add exactly 30 approved WebPs.
- `front/shared/ui/book-club-avatar.ts` and `.test.ts` — fixed shuffled manifest, labels, safe fallback/path and asset inventory.
- `front/shared/ui/avatar-chip.tsx` and `.ct.tsx` — artwork modifier, transparent fallback behavior and multi-size proof.
- `design/system/src/styles/tokens.css` — preserve generic initials chips while removing frame semantics from `.rm-avatar-chip--artwork`.
- `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt` — exact fixed 30-key enum order and fallback.
- `server/src/main/kotlin/com/readmates/auth/application/{model,port,service}/**` — atomic own-profile replace command/use case and orchestration.
- `server/src/main/kotlin/com/readmates/auth/adapter/{in/web,out/persistence}/**` — `PUT` adapter, club context, combined SQL update and authoritative response.
- `front/features/archive/{api,queries,route,ui}/**` — one request, mutation, profile revision override and integrated editor wiring.
- `front/src/styles/globals.css` and `front/shared/styles/mobile.css` — read-only identity card, desktop side panel, mobile full-screen editor and single-ring picker.
- Existing AvatarChip consumer tests and `front/tests/e2e/account-navigation-avatars.spec.ts` — global frame/state/identity regression.
- `docs/development/architecture.md` and `CHANGELOG.md` — current 30-key and atomic profile behavior plus forward-deploy boundary.

---

### Task 1: Build and Freeze the 30-Asset Catalog

**Files:**
- Modify: `front/shared/ui/book-club-avatar.ts`
- Modify: `front/shared/ui/book-club-avatar.test.ts`
- Modify: `front/shared/ui/avatar-chip.ct.tsx`
- Delete: all 40 current WebPs under `front/public/assets/avatars/book-club/`
- Create: 30 WebPs named exactly after the Global Constraints key set
- Modify: frontend fixtures returned by the legacy-key scan in Step 11

**Interfaces:**
- Consumes: seven staged source sheets and the exact sheet/slot selection in Global Constraints.
- Produces: `BOOK_CLUB_AVATARS`, `BOOK_CLUB_AVATAR_KEYS`, `BookClubAvatarKey`, `DEFAULT_BOOK_CLUB_AVATAR_KEY`, `isBookClubAvatarKey`, `normalizeBookClubAvatarKey`, `bookClubAvatarLabel` and `bookClubAvatarSrc`.
- Produces: one fixed post-QA order consumed verbatim by Tasks 2–8.

- [ ] **Step 1: Replace the manifest tests with the exact 30-key contract**

In `front/shared/ui/book-club-avatar.test.ts`, define an `APPROVED_KEY_SET` from the 30 Global Constraints keys and add these assertions:

```ts
const sourceOrder = [
  "starfish-notebook", "teacup-notebook", "banana-green-book",
  "cherries-notebook", "pudding-notebook", "snowglobe-green-book",
  "peach-green-book", "radish-notebook", "balloon-green-book",
  "palette-green-book", "lemon-green-book", "sailboat-green-book",
  "sheep-notebook", "globe-notebook", "apple-green-book",
  "cheese-green-book", "milk-green-book", "bell-notebook",
  "sun-green-book", "tulip-notebook", "teapot-green-book",
  "envelope-notebook", "candle-green-book", "cloud-green-book",
  "star-notebook", "moon-green-book", "mushroom-green-book",
  "dumpling-notebook", "teacup-green-book", "toast-brown-book",
] as const;

it("exposes the approved catalog once in a fixed non-source order", () => {
  expect(BOOK_CLUB_AVATARS).toHaveLength(30);
  expect(new Set(BOOK_CLUB_AVATAR_KEYS)).toHaveSize(30);
  expect([...BOOK_CLUB_AVATAR_KEYS].sort()).toEqual([...sourceOrder].sort());
  expect(BOOK_CLUB_AVATAR_KEYS).not.toEqual(sourceOrder);
  expect(DEFAULT_BOOK_CLUB_AVATAR_KEY).toBe("cloud-green-book");
});
```

Keep the on-disk filename equality, non-empty Korean label, RIFF header, traversal rejection and local fallback-path assertions. Change unknown, uppercase and decode-failure expectations to `cloud-green-book`.

- [ ] **Step 2: Run the manifest test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
```

Expected: FAIL because the tree still contains 40 legacy keys/assets and the default is not `cloud-green-book`.

- [ ] **Step 3: Stage and verify all seven external source sheets**

Create `.tmp/integrated-avatar-source/`, copy the attachments to `sheet-1.png` through `sheet-7.png`, then run:

```bash
for sheet_number in 1 2 3 4 5 6 7; do
  test -f ".tmp/integrated-avatar-source/sheet-${sheet_number}.png"
  sips -g pixelWidth -g pixelHeight ".tmp/integrated-avatar-source/sheet-${sheet_number}.png"
done
```

Expected: every source reports `pixelWidth: 1448` and `pixelHeight: 1086`. Stop this task if any attachment is unavailable or has different dimensions.

- [ ] **Step 4: Create one ignored measured crop record per approved slot**

Create `.tmp/integrated-avatar-crops.tsv` with tab-separated columns `key`, `sheet`, `slot`, `x`, `y`, `width`, `height`, `ovalInsetX`, `ovalInsetY`. Use these individually bounded initial rectangles; each stays inside its own visual cell and includes the selected cream oval without reaching the neighboring oval:

```text
starfish-notebook	1	6	18	548	274	365	7	5
teacup-notebook	1	9	875	548	268	365	6	5
banana-green-book	2	1	19	198	273	360	7	5
cherries-notebook	2	2	305	198	268	360	6	5
pudding-notebook	2	5	1164	198	270	360	7	5
snowglobe-green-book	2	8	590	548	268	360	6	5
peach-green-book	3	1	20	198	271	359	7	5
radish-notebook	3	2	304	198	270	359	7	5
balloon-green-book	3	4	875	198	268	359	6	5
palette-green-book	3	8	590	548	269	360	7	5
lemon-green-book	4	1	19	198	273	360	7	5
sailboat-green-book	4	4	874	198	270	360	7	5
sheep-notebook	4	5	1162	198	272	360	7	5
globe-notebook	4	10	1163	548	271	360	7	5
apple-green-book	5	1	19	198	273	360	7	5
cheese-green-book	5	4	874	198	270	360	7	5
milk-green-book	5	5	1162	198	272	360	7	5
bell-notebook	5	10	1163	548	271	360	7	5
sun-green-book	6	1	19	198	273	360	7	5
tulip-notebook	6	2	304	198	270	360	7	5
teapot-green-book	6	5	1162	198	272	360	7	5
envelope-notebook	6	7	304	548	270	360	7	5
candle-green-book	6	8	590	548	269	360	7	5
cloud-green-book	7	1	19	198	273	360	7	5
star-notebook	7	2	304	198	270	360	7	5
moon-green-book	7	3	589	198	270	360	7	5
mushroom-green-book	7	4	874	198	270	360	7	5
dumpling-notebook	7	6	19	548	273	360	7	5
teacup-green-book	7	7	304	548	270	360	7	5
toast-brown-book	7	8	590	548	269	360	7	5
```

A guard in the helper must reject non-integers, duplicate keys, a row count other than 30, rectangles outside 1448×1086 and a source slot outside the approved list. If Step 7 exposes clipping or contamination, adjust only the affected row's numeric bounds and keep the successful final TSV under `.tmp/`.

- [ ] **Step 5: Generate individually masked 256×256 WebPs**

Create `.tmp/build-integrated-avatars.swift` with this CoreGraphics implementation. It validates the approved slots and keys, crops each recorded rectangle, creates a 256×256 transparent RGBA canvas, scales proportionally into a centered 214px box, clips drawing to the selected oval and rejects non-transparent pixels in the outer 8px safety band:

```swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Crop {
    let key: String
    let sheet: Int
    let slot: Int
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let ovalInsetX: Int
    let ovalInsetY: Int
}

let approved = Set([
    "1-6", "1-9", "2-1", "2-2", "2-5", "2-8", "3-1", "3-2", "3-4", "3-8",
    "4-1", "4-4", "4-5", "4-10", "5-1", "5-4", "5-5", "5-10", "6-1", "6-2",
    "6-5", "6-7", "6-8", "7-1", "7-2", "7-3", "7-4", "7-6", "7-7", "7-8",
])

guard CommandLine.arguments.count == 4 else {
    fatalError("usage: swift build-integrated-avatars.swift crops.tsv source-dir output-dir")
}

let tsvURL = URL(fileURLWithPath: CommandLine.arguments[1])
let sourceDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
let rows = try String(contentsOf: tsvURL, encoding: .utf8)
    .split(whereSeparator: \.isNewline)
    .map { row -> Crop in
        let fields = row.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
        guard fields.count == 9,
              let sheet = Int(fields[1]), let slot = Int(fields[2]),
              let x = Int(fields[3]), let y = Int(fields[4]),
              let width = Int(fields[5]), let height = Int(fields[6]),
              let ovalInsetX = Int(fields[7]), let ovalInsetY = Int(fields[8]) else {
            fatalError("invalid TSV row: \(row)")
        }
        return Crop(
            key: fields[0], sheet: sheet, slot: slot, x: x, y: y,
            width: width, height: height, ovalInsetX: ovalInsetX, ovalInsetY: ovalInsetY
        )
    }

guard rows.count == 30, Set(rows.map(\.key)).count == 30,
      Set(rows.map { "\($0.sheet)-\($0.slot)" }) == approved else {
    fatalError("crop inventory does not match approved 30-slot contract")
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

for crop in rows {
    guard crop.x >= 0, crop.y >= 0, crop.width > 0, crop.height > 0,
          crop.x + crop.width <= 1448, crop.y + crop.height <= 1086,
          crop.ovalInsetX >= 0, crop.ovalInsetY >= 0 else {
        fatalError("out-of-bounds crop: \(crop.key)")
    }

    let sourceURL = sourceDirectory.appendingPathComponent("sheet-\(crop.sheet).png")
    guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
          let sourceImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil),
          let croppedImage = sourceImage.cropping(to: CGRect(
              x: crop.x,
              y: crop.y,
              width: crop.width,
              height: crop.height
          )) else {
        fatalError("cannot decode/crop source for \(crop.key)")
    }

    let pixelSize = 256
    let bytesPerRow = pixelSize * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * pixelSize)
    let outputImage: CGImage = pixels.withUnsafeMutableBytes { storage in
        guard let context = CGContext(
            data: storage.baseAddress,
            width: pixelSize,
            height: pixelSize,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { fatalError("cannot create bitmap context") }

        context.clear(CGRect(x: 0, y: 0, width: pixelSize, height: pixelSize))
        let scale = min(214.0 / CGFloat(crop.width), 214.0 / CGFloat(crop.height))
        let drawSize = CGSize(width: CGFloat(crop.width) * scale, height: CGFloat(crop.height) * scale)
        let drawRect = CGRect(
            x: (CGFloat(pixelSize) - drawSize.width) / 2,
            y: (CGFloat(pixelSize) - drawSize.height) / 2,
            width: drawSize.width,
            height: drawSize.height
        )
        let ovalRect = drawRect.insetBy(
            dx: CGFloat(crop.ovalInsetX) * scale,
            dy: CGFloat(crop.ovalInsetY) * scale
        )

        context.saveGState()
        context.addEllipse(in: ovalRect)
        context.clip()
        context.interpolationQuality = .high
        context.draw(croppedImage, in: drawRect)
        context.restoreGState()
        guard let image = context.makeImage() else { fatalError("cannot render \(crop.key)") }
        return image
    }

    for row in 0..<pixelSize {
        for column in 0..<pixelSize where row < 8 || row >= 248 || column < 8 || column >= 248 {
            let alpha = pixels[row * bytesPerRow + column * 4 + 3]
            guard alpha == 0 else { fatalError("unsafe edge pixel in \(crop.key)") }
        }
    }

    let outputURL = outputDirectory.appendingPathComponent("\(crop.key).png")
    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else { fatalError("cannot create PNG destination") }
    CGImageDestinationAddImage(destination, outputImage, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("cannot write \(crop.key)") }
}
```

Run it and convert each PNG:

```bash
mkdir -p .tmp/integrated-avatar-crops front/public/assets/avatars/book-club
swift .tmp/build-integrated-avatars.swift \
  .tmp/integrated-avatar-crops.tsv \
  .tmp/integrated-avatar-source \
  .tmp/integrated-avatar-crops

while IFS=$'\t' read -r avatar_key _; do
  cwebp -quiet -q 90 -m 6 -alpha_q 100 \
    ".tmp/integrated-avatar-crops/${avatar_key}.png" \
    -o "front/public/assets/avatars/book-club/${avatar_key}.webp"
done < .tmp/integrated-avatar-crops.tsv
```

If the first contact sheet is vertically inverted, change only the `y` argument in `sourceImage.cropping` to `1086 - crop.y - crop.height`, regenerate all 30, and retain the orientation whose subject matches the supplied sheets. Delete the 40 tracked legacy WebPs only after all 30 outputs exist and the outer-band alpha guard passes.

- [ ] **Step 6: Build small-size and edge-inspection contact sheets**

Update `front/shared/ui/avatar-chip.ct.tsx` to mount all keys at `20, 22, 24, 26, 28, 32, 46, 52, 72` pixels, assert every image has natural size 256×256, draw each image to a same-origin canvas and assert corner alpha is zero. Save one Playwright screenshot covering every size and a second 256px crop-inspection screenshot.

- [ ] **Step 7: Run asset QA before any shuffle**

Run:

```bash
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
```

Open both screenshots. Reject any asset with a neighboring oval, clipped cream oval, subject touching the 8% margin, unrecognizable face/book at 20px, or inconsistent centering. Change only that key's measured TSV row, regenerate it and rerun Step 7 until all 30 pass.

- [ ] **Step 8: Shuffle exactly once and persist the result**

After Step 7 passes, write the source-order keys to `.tmp/avatar-source-order.txt`, then run this command once:

```bash
while IFS= read -r avatar_key; do
  printf '%s\t%s\n' "$(openssl rand -hex 16)" "$avatar_key"
done < .tmp/avatar-source-order.txt | sort | cut -f2 > .tmp/final-avatar-order.txt
test "$(wc -l < .tmp/final-avatar-order.txt | tr -d ' ')" = "30"
test "$(sort -u .tmp/final-avatar-order.txt | wc -l | tr -d ' ')" = "30"
if cmp -s .tmp/avatar-source-order.txt .tmp/final-avatar-order.txt; then exit 1; fi
```

Do not run the shuffle command again. The saved file is the fixed catalog order for all later tasks.

- [ ] **Step 9: Implement the shuffled frontend manifest**

Define all 30 entries in the exact `.tmp/final-avatar-order.txt` order with the Korean labels from the approved spec. Preserve the current local-path API and set:

```ts
export type BookClubAvatarDefinition = { key: string; label: string };
export type BookClubAvatarKey = (typeof BOOK_CLUB_AVATARS)[number]["key"];
export const BOOK_CLUB_AVATAR_KEYS = BOOK_CLUB_AVATARS.map(({ key }) => key);
export const DEFAULT_BOOK_CLUB_AVATAR_KEY: BookClubAvatarKey = "cloud-green-book";
```

- [ ] **Step 10: Run focused catalog tests and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
```

Expected: PASS with exactly 30 files, 30 unique keys, fixed non-source order, transparent corners and valid fallback.

- [ ] **Step 11: Migrate frontend fixture keys and prove no runtime legacy key remains**

Use `rg -l` over `front/**/*.ts`, `front/**/*.tsx` and `front/**/*.json` for the old 40-key vocabulary. Replace fixture values with keys from the fixed new manifest, keeping at least `cloud-green-book`, `banana-green-book`, `star-notebook`, `moon-green-book` and `toast-brown-book` represented. Then run the same scan again and require zero results.

Do not scan or edit historical specs/plans. Update the hardcoded public host and left-member fallback in `front/features/public/ui/public-club.tsx`, `front/features/host/ui/members/member-list.tsx` and `front/features/archive/model/archive-model.ts` to `cloud-green-book`.

- [ ] **Step 12: Commit the asset catalog**

```bash
git add front/public/assets/avatars/book-club front/shared/ui/book-club-avatar.ts front/shared/ui/book-club-avatar.test.ts front/shared/ui/avatar-chip.ct.tsx front
git commit -m "feat(ui): replace the member avatar catalog"
```

Confirm `.tmp/` is not staged.

---

### Task 2: Migrate the Server Vocabulary and Existing Memberships

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/domain/BookClubAvatarKeyTest.kt`
- Create: `server/src/main/resources/db/mysql/migration/V45__integrated_member_profile_avatar_catalog.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: server fixtures returned by the legacy-key scan, excluding V43 and V44

**Interfaces:**
- Consumes: Task 1's exact fixed order from `.tmp/final-avatar-order.txt` and `BOOK_CLUB_AVATAR_KEYS`.
- Produces: `BookClubAvatarKey.ordered`, `.fallback` and `.fromWireValue()` for exactly the same 30 keys.
- Produces: non-null `memberships.avatar_key` restricted by `memberships_avatar_key_check` to those keys.

- [ ] **Step 1: Add RED enum and V44-to-V45 migration tests**

Create `BookClubAvatarKeyTest.kt`:

```kotlin
@Test
fun `catalog contains exactly the fixed frontend wire set`() {
    assertEquals(30, BookClubAvatarKey.ordered.size)
    assertEquals(30, BookClubAvatarKey.ordered.map { it.wireValue }.toSet().size)
    assertEquals("cloud-green-book", BookClubAvatarKey.fallback.wireValue)
    assertNull(BookClubAvatarKey.fromWireValue("hedgehog-green-book"))
    assertNull(BookClubAvatarKey.fromWireValue("../cloud-green-book"))
}
```

Also hardcode Task 1's fixed shuffled order as `expectedWireValues` in this test and assert `BookClubAvatarKey.ordered.map { it.wireValue } == expectedWireValues`; this makes server order drift fail independently of migration behavior.

In `MySqlFlywayMigrationTest`, add a V44 target fixture containing two clubs and at least 31 memberships per club. After migrating to latest, assert latest version `45`, exactly one migration executed, all rows map to the new enum, the first 30 visible rows per club are unique, the 31st safely repeats, and the named check rejects an old key, uppercase key, null and arbitrary text. Extract the V45 `json_table` JSON and named-check literals in a source-contract assertion and require both ordered lists to equal `BookClubAvatarKey.ordered.map { it.wireValue }`.

- [ ] **Step 2: Run server catalog tests and verify RED**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.domain.BookClubAvatarKeyTest
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: FAIL because the enum still has 40 old keys and latest migration is V44.

- [ ] **Step 3: Replace the enum with the fixed 30-key order**

Translate every Task 1 wire key to one uppercase enum constant and keep the exact shuffled order. Preserve:

```kotlin
companion object {
    val ordered = entries.toList()
    val fallback = CLOUD_GREEN_BOOK

    fun fromWireValue(value: String?): BookClubAvatarKey? =
        entries.firstOrNull { it.wireValue == value }
}
```

- [ ] **Step 4: Add the forward-only V45 migration**

Generate the two ordered SQL representations directly from Task 1's fixed artifact:

```bash
node -e '
const fs = require("node:fs");
const keys = fs.readFileSync(".tmp/final-avatar-order.txt", "utf8").trim().split(/\n/);
if (keys.length !== 30 || new Set(keys).size !== 30) process.exit(1);
console.log(JSON.stringify(keys));
console.log(keys.map((key) => `      ${JSON.stringify(key).replaceAll("\"", "\x27")}`).join(",\n"));
'
```

Use the first emitted line as the literal JSON document passed to `json_table` and the following 30 lines as the `avatar_key in (...)` literals. Implement the migration in this exact sequence:

```sql
alter table memberships drop check memberships_avatar_key_check;

update memberships
join (
  select ranked_memberships.id, avatar_keys.avatar_key
  from (
    select
      id,
      row_number() over (
        partition by club_id
        order by
          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
          sha2(concat(club_id, ':', id, ':integrated-avatar-v2'), 256),
          id
      ) as avatar_rank
    from memberships
  ) ranked_memberships
```

Complete the statement with `json_table` over the emitted JSON, ordinal mapping `mod(avatar_rank - 1, 30) + 1`, the joined membership update, and the named check over the emitted 30 SQL literals. Add a post-update guard in the migration test that proves no old value survives before relying on the new check constraint.

- [ ] **Step 5: Migrate server seed/test fixtures without touching history**

Scan `server/src/main`, `server/src/test` and test resources for the old 40-key vocabulary. Replace runtime defaults and fixtures with new keys, excluding:

```text
server/src/main/resources/db/mysql/migration/V43__membership_book_club_avatars.sql
server/src/main/resources/db/mysql/migration/V44__animal_avatar_selection.sql
```

Run `git diff --exit-code` on both immutable migrations. Require the remaining legacy scan to report only V43/V44 and the explicit negative assertion in `BookClubAvatarKeyTest` that proves an old key is rejected.

- [ ] **Step 6: Run migration, enum and allocation regressions**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.domain.BookClubAvatarKeyTest
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server integrationTest --tests com.readmates.auth.adapter.out.persistence.JdbcMemberAvatarAllocationAdapterTest
./server/gradlew -p server integrationTest --tests com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubAvatarAllocationTest
```

Expected: PASS. Existing unused-first allocation automatically uses the 30-entry enum, preserves a valid rejoin key, ignores `LEFT`/`INACTIVE` in used-key calculation and reuses after exhaustion.

- [ ] **Step 7: Commit server catalog and migration**

```bash
git add server/src/main/kotlin/com/readmates/auth/domain/BookClubAvatarKey.kt server/src/main/resources/db/mysql/migration/V45__integrated_member_profile_avatar_catalog.sql server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql server/src/test
git commit -m "feat(auth): migrate the avatar catalog to thirty keys"
```

---

### Task 3: Add the Atomic Club-Scoped Profile Application Service

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/model/MemberProfileCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/MemberProfileUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/service/MemberProfileServiceTest.kt`

**Interfaces:**
- Produces: `ReplaceOwnMemberProfileCommand(val displayName: String?, val avatarKey: String?)`.
- Produces: `ReplaceOwnMemberProfileUseCase.replaceOwnProfile(authenticationEmail: String?, currentClubId: UUID, command: ReplaceOwnMemberProfileCommand): MemberProfile`.
- Produces: `MemberProfileStorePort.updateOwnProfile(clubId, membershipId, displayName, avatarKey): Boolean`.
- Preserves: existing `UpdateOwnMemberProfileUseCase`, `UpdateOwnMemberAvatarUseCase` and host profile interfaces.

- [ ] **Step 1: Add RED service tests for atomic success and rollback**

Extend the recording store so combined updates are recorded as one value:

```kotlin
data class OwnProfileUpdate(
    val clubId: UUID,
    val membershipId: UUID,
    val displayName: String,
    val avatarKey: String,
)
```

Add tests that call:

```kotlin
val profile = service.replaceOwnProfile(
    "member@example.com",
    clubId,
    ReplaceOwnMemberProfileCommand("  새이름  ", "  cloud-green-book  "),
)

assertEquals("새이름", profile.displayName)
assertEquals("cloud-green-book", profile.avatarKey)
assertEquals(listOf(OwnProfileUpdate(clubId, membershipId, "새이름", "cloud-green-book")), store.profileUpdates)
assertEquals(listOf(clubId), invalidation.clubs)
```

Add null/blank/invalid/reserved/duplicate name cases, null/blank/legacy/traversal/uppercase avatar cases, unauthenticated, wrong club, `LEFT`/`INACTIVE`, allowed `VIEWER`/`ACTIVE`/`SUSPENDED`, and a conditional update that changes status before the SQL write. Every failure must assert `profileUpdates.isEmpty()` and no cache invalidation.

- [ ] **Step 2: Run the focused service test and verify RED**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.application.service.MemberProfileServiceTest
```

Expected: compilation/test failure because the combined command/use case/store method do not exist.

- [ ] **Step 3: Add the combined command and ports**

Add:

```kotlin
data class ReplaceOwnMemberProfileCommand(
    val displayName: String?,
    val avatarKey: String?,
)

interface ReplaceOwnMemberProfileUseCase {
    fun replaceOwnProfile(
        authenticationEmail: String?,
        currentClubId: UUID,
        command: ReplaceOwnMemberProfileCommand,
    ): MemberProfile
}
```

Add the combined store signature exactly as listed in Interfaces; do not remove the two compatibility update methods.

- [ ] **Step 4: Implement validation-before-write and one transaction**

Make `MemberProfileService` implement the new use case. The method must:

1. normalize authenticated email;
2. load the member by `email + currentClubId`;
3. validate display name and avatar before any update;
4. lock the club profile-name namespace;
5. reload the membership `FOR UPDATE` and recheck `canEditOwnProfile`;
6. reject a same-club duplicate name;
7. call the combined store method once;
8. reclassify a failed conditional update from the locked row;
9. reload by `email + currentClubId`, schedule one after-commit cache eviction and return the authoritative profile.

The compatibility methods may reuse private validators/guards, but `replaceOwnProfile` must not call the two separate update methods.

- [ ] **Step 5: Implement one conditional SQL update**

```sql
update memberships
set short_name = ?,
    avatar_key = ?,
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and status in ('VIEWER', 'ACTIVE', 'SUSPENDED')
```

Return `true` only for one affected row. Do not modify the `users` table or any other club membership.

- [ ] **Step 6: Run service and architecture tests and verify GREEN**

```bash
./server/gradlew -p server unitTest --tests com.readmates.auth.application.service.MemberProfileServiceTest
./server/gradlew -p server architectureTest
```

Expected: PASS with one combined write on success and zero writes on every validation/permission failure.

- [ ] **Step 7: Commit the atomic application slice**

```bash
git add server/src/main/kotlin/com/readmates/auth/application server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt server/src/test/kotlin/com/readmates/auth/application/service/MemberProfileServiceTest.kt
git commit -m "feat(auth): replace own profile atomically"
```

---

### Task 4: Expose the PUT Contract and Preserve Compatibility

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`

**Interfaces:**
- Consumes: Task 3 `ReplaceOwnMemberProfileUseCase`.
- Produces: `OwnMemberProfileReplaceRequest(displayName: String? = null, avatarKey: String? = null)`.
- Produces: `PUT /api/me/profile` returning the existing `MemberProfileResponse`.
- Preserves: both existing `PATCH` methods and their response/error shapes.

- [ ] **Step 1: Add RED controller integration tests**

Add a successful multi-club request:

```kotlin
mockMvc.put("/api/me/profile") {
    cookie(cookie)
    header("X-Readmates-Bff-Secret", "test-bff-secret")
    header("X-Readmates-Club-Slug", "reading-sai")
    header("Origin", "http://localhost:3000")
    with(csrf())
    contentType = MediaType.APPLICATION_JSON
    content = """{"displayName":"After","avatarKey":"cloud-green-book"}"""
}.andExpect {
    status { isOk() }
    jsonPath("$.membershipId") { value(primaryMembershipId) }
    jsonPath("$.displayName") { value("After") }
    jsonPath("$.avatarKey") { value("cloud-green-book") }
}
```

Assert the second club membership is unchanged. Add missing/malformed trusted club context, unauthenticated, duplicate name, invalid/legacy avatar, blocked status and simultaneous-request coverage. For every rejected request, query both columns and assert neither changed. Keep existing `PATCH` tests and change their valid fixtures to new keys.

- [ ] **Step 2: Add a RED BFF PUT forwarding test**

In `cloudflare-bff.test.ts`, issue same-origin `PUT /api/bff/api/me/profile?clubSlug=reading-sai` with an attacker-supplied `X-Readmates-Club-Slug`. Assert the upstream request is `PUT /api/me/profile?clubSlug=reading-sai`, body bytes are preserved, and only the normalized trusted slug header `reading-sai` is forwarded.

- [ ] **Step 3: Run API/BFF tests and verify RED**

```bash
./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest
corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts
```

Expected: the server test fails with method not allowed and the new request DTO/controller method is absent; existing BFF behavior should already satisfy most forwarding assertions.

- [ ] **Step 4: Add the request DTO and controller method**

Inject `ReplaceOwnMemberProfileUseCase`, resolve the club context with the same trusted resolver used by the avatar compatibility endpoint, and add:

```kotlin
@PutMapping("/me/profile")
fun replaceOwnProfile(
    authentication: Authentication?,
    request: HttpServletRequest,
    @RequestBody payload: OwnMemberProfileReplaceRequest,
): MemberProfileResponse
```

Map unresolved context to `MEMBER_NOT_FOUND`, convert both request fields to `ReplaceOwnMemberProfileCommand`, and reuse existing error-to-status mapping.

- [ ] **Step 5: Run contract, compatibility and security tests**

```bash
./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest
corepack pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts
./scripts/server-ci-check.sh
```

Expected: PASS. Verify `PATCH /api/me/profile`, `PATCH /api/me/avatar` and host member-name edit tests remain green and removed legacy keys return `AVATAR_KEY_INVALID` rather than a 403.

- [ ] **Step 6: Commit the HTTP contract**

```bash
git add server/src/main/kotlin/com/readmates/auth/adapter/in/web server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt front/tests/unit/cloudflare-bff.test.ts
git commit -m "feat(api): add atomic own profile replacement"
```

---

### Task 5: Replace Split Frontend Mutations with One Profile Revision

**Files:**
- Create: `front/features/archive/model/profile-update.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/features/archive/queries/profile-queries.ts`
- Modify: `front/features/archive/queries/profile-queries.test.tsx`
- Modify: `front/features/archive/route/profile-update-controller.ts`
- Modify: `front/features/archive/route/profile-update-controller.test.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`

**Interfaces:**
- Produces: `EditableMemberProfile = {displayName: string; avatarKey: BookClubAvatarKey}`.
- Produces: `UpdateMemberProfileRequest` with both required fields.
- Produces: `updateMyProfile(profile, context)` using `PUT`.
- Produces: `useUpdateMyProfileMutation(context)` accepting one editable profile.
- Produces: `useProfileUpdateController(input).saveProfile(profile): Promise<MemberProfileResponse>`.

- [ ] **Step 1: Add RED API/query tests for one PUT**

Assert:

```ts
await mutation.mutateAsync({
  displayName: "새이름",
  avatarKey: "cloud-green-book",
});

expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/me/profile?clubSlug=reading-sai",
  expect.objectContaining({
    method: "PUT",
    body: JSON.stringify({ displayName: "새이름", avatarKey: "cloud-green-book" }),
  }),
);
```

Assert one archive invalidation after success and no invalidation on failure. Remove new-UI expectations for `updateMyAvatar`; keep direct API compatibility coverage only where it intentionally validates the old endpoint.

- [ ] **Step 2: Add RED controller tests for profile-level fencing**

Replace field-specific controller tests with cases that save both fields, refresh auth once, revalidate once, retain one saved override while an older loader response arrives, clear it when the authoritative combined profile arrives, and prevent an old-club response from replacing the current club profile. Assert `canEditProfile=false` rejects before calling the mutation.

- [ ] **Step 3: Run focused frontend data tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/queries/profile-queries.test.tsx \
  features/archive/route/profile-update-controller.test.tsx
```

Expected: FAIL because the implementation still exposes two PATCH mutations and two field overrides.

- [ ] **Step 4: Add editable profile and typed failure model**

Extend `MemberProfileErrorCode` in `archive-contracts.ts` with `AVATAR_KEY_REQUIRED`, `AVATAR_KEY_INVALID`, `AUTHENTICATION_REQUIRED` and `MEMBER_NOT_FOUND`. In `profile-update.ts` define:

```ts
export type EditableMemberProfile = {
  displayName: string;
  avatarKey: BookClubAvatarKey;
};

export type ProfileFailureField = "displayName" | "avatarKey" | "form";

export class ProfileUpdateFailure extends Error {
  constructor(
    message: string,
    readonly code: MemberProfileErrorCode | null,
    readonly field: ProfileFailureField,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProfileUpdateFailure";
  }
}
```

Map display-name codes to `displayName`, avatar codes to `avatarKey`, membership/session/network errors to `form`, and preserve the existing Korean messages.

- [ ] **Step 5: Implement the request, mutation and profile revision override**

Change the request contract to both required fields and call `readmatesFetchResponse("/api/me/profile", jsonRequest({method: "PUT"}, profile), context)`. Replace the two hooks with one club-scoped hook.

Represent override state as one object:

```ts
type SavedProfileOverride = {
  source: EditableMemberProfile;
  saved: EditableMemberProfile;
  generation: number;
  staleSources: Array<EditableMemberProfile & { generation: number }>;
};
```

Compare both fields together, update both from the authoritative response, then call `onProfileUpdated()` and `onRevalidate()` once. On failure throw `ProfileUpdateFailure` with the original API error as `cause`.

- [ ] **Step 6: Wire `MyPageRoute` to one callback and verify GREEN**

Pass `onSaveProfile={saveProfile}` down the UI tree instead of `onUpdateProfile` and `onUpdateAvatar`. Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/queries/profile-queries.test.tsx \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/route/my-page-route.test.tsx
```

Expected: PASS with one PUT and profile-level stale-response fencing.

- [ ] **Step 7: Commit the frontend data flow**

```bash
git add front/features/archive/model/profile-update.ts front/features/archive/api front/features/archive/queries/profile-queries.ts front/features/archive/queries/profile-queries.test.tsx front/features/archive/route
git commit -m "feat(front): save member identity as one profile"
```

---

### Task 6: Build the Adaptive Integrated Profile Editor

**Files:**
- Create: `front/features/archive/ui/my-page/profile-editor-dialog.tsx`
- Create: `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx`
- Create: `front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx`
- Modify: `front/features/archive/ui/my-page/avatar-picker.tsx`
- Modify: `front/features/archive/ui/my-page/avatar-picker.test.tsx`
- Modify: `front/features/archive/ui/my-page/avatar-picker.ct.tsx`
- Modify: `front/features/archive/ui/my-page/member-profile-summary.tsx`
- Modify: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/ui/my-page/types.ts`
- Delete: `front/features/archive/ui/my-page/profile-name-editor.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: Task 5 `EditableMemberProfile`, `ProfileUpdateFailure` and `onSaveProfile(profile)`.
- Produces: read-only `MemberProfileSummary` with one `프로필 편집` action.
- Produces: stateless `AvatarPicker({value, onChange, disabled, errorId})` selection grid.
- Produces: desktop right panel and mobile full-screen `ProfileEditorDialog`.

- [ ] **Step 1: Add RED summary and editor interaction tests**

Assert the summary shows one level-1 display-name heading, one 72px avatar, meta text and exactly one `프로필 편집` button; `이름 변경` and `아바타 바꾸기` must be absent. For non-editable memberships assert no edit action and no empty action container.

Add editor tests for baseline initialization, name/avatar draft changes, no callback before final save, one callback with both fields, saving lock/double-submit prevention, server result close/focus return, name-field error, avatar-control error, form error with retry, and draft retention after failure.

- [ ] **Step 2: Add RED dismissal/focus/accessibility tests**

Cover pristine Escape/backdrop close, dirty Escape/backdrop/mobile-back/close opening `변경사항을 버릴까요?`, `계속 편집`, `변경사항 버리기`, focus trap, opener focus restoration, `aria-modal`, labelled description, `aria-pressed`, one selected check and minimum 44px controls.

- [ ] **Step 3: Run focused UI tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

Expected: FAIL because the summary still has two editors and the integrated dialog does not exist.

- [ ] **Step 4: Make AvatarPicker a stateless 30-option step**

Use this public shape:

```ts
export type AvatarPickerProps = {
  value: BookClubAvatarKey;
  onChange: (avatarKey: BookClubAvatarKey) => void;
  disabled: boolean;
  errorId?: string;
};
```

Render desktop 5 columns/mobile 3 columns. Default buttons have transparent border/background, selected/focus share one pseudo-element ring, selected adds one check and `aria-pressed=true`, and clicking only calls `onChange`.

The selection step header includes a back action to the profile step. Labels come from `BOOK_CLUB_AVATARS`; do not render sheet number, source slot or wire key as visible copy.

- [ ] **Step 5: Implement the modal state machine**

Use explicit states:

```ts
type ProfileEditorStep = "profile" | "avatar" | "discard";
type ProfileDraft = EditableMemberProfile;
type ProfileFieldErrors = Partial<Record<"displayName" | "avatarKey" | "form", string>>;
```

Open from the server-backed profile, compute dirty by trimmed name plus normalized avatar, and keep draft/step/scroll on failure. During save disable inputs, selection, closing and duplicate submit. On success close and return focus. The discard step owns the only destructive close path for dirty drafts.

The display-name input is labelled `표시 이름`, uses the existing 20-character limit/helper copy and connects field errors with `aria-describedby`. The avatar control connects avatar errors the same way; a form error uses a live alert and focuses the retry/save action.

- [ ] **Step 6: Implement the read-only card and adaptive layout**

Desktop CSS uses a fixed scrim and a right-aligned panel `width: min(480px, 100vw); height: 100dvh`. Mobile `max-width: 768px` uses full viewport, `100dvh`, safe-area padding, sticky top bar and sticky save footer. Ensure 320px and 200% zoom have no horizontal overflow; use reduced-motion media query to remove transitions.

The summary uses the approved hierarchy and the artwork image at 72px without an avatar container border. Long names wrap before colliding with the single edit button.

- [ ] **Step 7: Run component tests at required viewports**

```bash
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts \
  features/archive/ui/my-page/profile-editor-dialog.ct.tsx \
  features/archive/ui/my-page/avatar-picker.ct.tsx
```

Capture 320×700, 390×844 and 1280×900 plus a 200% zoom case. Assert no horizontal overflow, footer remains reachable with a focused text input, desktop panel is right-aligned, mobile fills the viewport, and selected/focus never produces two rings.

- [ ] **Step 8: Run focused UI regression and commit**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx \
  features/archive/route/my-page-route.test.tsx
git add front/features/archive/ui front/src/styles/globals.css front/shared/styles/mobile.css
git commit -m "feat(ui): integrate member profile editing"
```

Expected: PASS; only the final save mutates identity.

---

### Task 7: Apply the One-Layer Avatar Contract to Every Consumer

**Files:**
- Modify: `front/shared/ui/avatar-chip.tsx`
- Modify: `front/shared/ui/avatar-chip.ct.tsx`
- Modify: `design/system/src/styles/tokens.css`
- Modify: `front/features/current-session/ui/current-session-panels.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: existing consumer unit/CT tests for current-session, archive, notes, host, member-home, auth and public UI
- Modify: `front/tests/e2e/account-navigation-avatars.spec.ts`

**Interfaces:**
- Preserves: `AvatarChip({avatarKey, name, label, size})` and decorative `<img alt="" aria-hidden="true">` behavior.
- Removes: `rsvpStatus` from the artwork component API and all three callers.
- Produces: `.rm-avatar-chip--artwork`, which does not alter the generic design-system initials chip.

- [ ] **Step 1: Add RED artwork visual contract tests**

Update `avatar-chip.ct.tsx` to assert the artwork root has `.rm-avatar-chip--artwork`, computed `border-width: 0px`, transparent background, no circular clipping, `object-fit: contain`, and no `data-rsvp-status`. Cover requested image success, requested failure to `cloud-green-book`, and fallback failure to a borderless neutral box.

At sizes 20–72px, inspect the component itself rather than a surrounding card. Add a selected/focus picker mount proving only the picker owns the single state ring.

- [ ] **Step 2: Run AvatarChip CT and verify RED**

```bash
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
```

Expected: FAIL because `.rm-avatar-chip` still supplies a circular background/border and RSVP data changes its border.

- [ ] **Step 3: Add the artwork modifier without breaking initials chips**

Render:

```tsx
<span
  className="rm-avatar-chip rm-avatar-chip--artwork"
  title={safeLabel || undefined}
  style={{ "--avatar-size": `${size}px` } as CSSProperties}
>
```

Remove `rsvpStatus` and `data-rsvp-status` from the runtime component. In tokens, keep `.rm-avatar-chip` unchanged for `@readmates/design-system` initials, then add a later modifier:

```css
.rm-avatar-chip.rm-avatar-chip--artwork {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  overflow: visible;
}

.rm-avatar-chip--artwork img {
  object-fit: contain;
}
```

Remove the `NO_RESPONSE` artwork rule; attendance/RSVP copy remains in adjacent badges/text.

- [ ] **Step 4: Remove RSVP frame input from all callers**

Delete `rsvpStatus={member.rsvpStatus}` in desktop current-session roster, mobile prep roster and member-home attendee list. Do not remove the existing RSVP/attendance text or badge elements.

- [ ] **Step 5: Run all named consumer regressions**

```bash
corepack pnpm --dir front exec vitest run \
  tests/unit/current-session.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  features/member-home/ui/member-home-records.test.tsx \
  tests/unit/host-members.test.tsx \
  features/auth/ui/account-menu.test.tsx \
  features/public/ui/public-session.test.tsx
```

Verify current-session roster/questions/reviews, mobile prep/board, member-home records, archive detail/notes, host attendance/member list, top navigation/account menu, public club/session and profile/editor all render local 30-key paths with adjacent names/statuses intact.

- [ ] **Step 6: Update synthetic browser evidence**

Change `account-navigation-avatars.spec.ts` to the integrated PUT flow and new keys. At 390 and 1280 widths, capture profile editor, saved summary/account identity, current-session roster, host attendance/member list and public session. Assert computed artwork border is zero and the visible avatar image requests are same-origin `/assets/avatars/book-club/*.webp` only.

- [ ] **Step 7: Run design and frontend component gates**

```bash
corepack pnpm design:check
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts
```

Expected: PASS with generic initials-chip behavior preserved and local artwork frame-free at rest.

- [ ] **Step 8: Commit the global visual contract**

```bash
git add design/system/src/styles/tokens.css front/shared/ui front/features front/tests/e2e/account-navigation-avatars.spec.ts
git commit -m "fix(ui): simplify avatar framing everywhere"
```

---

### Task 8: Prove Runtime Contract, Update Docs and Close the Change

**Files:**
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Modify: any directly affected fixture/test files revealed by final scans

**Interfaces:**
- Consumes: complete Tasks 1–7.
- Produces: fresh-process API proof, browser proof and repository documentation at final HEAD.

- [ ] **Step 1: Add the real-stack atomic profile E2E**

Replace split name/avatar helpers with a `PUT` helper and add a test that starts from a real E2E membership, saves a unique display name plus `cloud-green-book`, verifies the 200 response, fetches scoped `/api/app/me` and `/api/auth/me`, checks both fields, confirms a second club membership is unchanged, then restores the fixture in `finally`.

Add denied cases for missing/invalid club context, other club, unauthenticated, blocked status, invalid legacy key and duplicate name. Assert rejected cases preserve both database columns.

- [ ] **Step 2: Run the contract smoke before visual QA**

Run with Playwright's `reuseExistingServer: false` fresh backend:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-profile-permissions.spec.ts \
  -g "updates name and avatar atomically in the selected club"
```

Expected: PASS with HTTP 200 and both readbacks. Treat 404/405, unexpected 403 or response-shape mismatch as stale/runtime-contract failure; do not continue to screenshots and do not relax security headers/context.

- [ ] **Step 3: Run focused browser flows after the smoke**

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/account-navigation-avatars.spec.ts
```

Expected: PASS for atomic save, multi-club isolation, permission failures, mobile/desktop editor and global avatar consumers.

- [ ] **Step 4: Update architecture and Unreleased notes**

In `docs/development/architecture.md`, replace the inline name editor/40-animal/PATCH-only text with the read-only summary, integrated adaptive editor, 30-key local catalog, V45 reassignment, `PUT` atomic transaction and compatibility PATCH window. In `CHANGELOG.md` Unreleased, add user-visible profile/editor/avatar changes and a deployment note: new backend + V45 must be healthy before the new frontend; cached old clients may receive `AVATAR_KEY_INVALID`; production deployment is not part of this implementation.

- [ ] **Step 5: Run exact residual scans**

Require:

```bash
test "$(find front/public/assets/avatars/book-club -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')" = "30"
rg -n "inline.*이름 변경|40개 allowlist|40-key" docs/development/architecture.md CHANGELOG.md
rg -n "PUT /api/me/profile|PATCH /api/me/profile|PATCH /api/me/avatar|V45" docs/development/architecture.md CHANGELOG.md
rg -n "hedgehog-green-book|squirrel-acorn|hedgehog-green-mug" front server/src/main \
  --glob '!**/V43__membership_book_club_avatars.sql' \
  --glob '!**/V44__animal_avatar_selection.sql'
git diff --check
```

The obsolete-doc and active-runtime legacy scans must report nothing. The endpoint/V45 scan must show the atomic PUT, compatibility PATCH window and forward migration. Negative legacy-key assertions in tests, historical specs/plans and immutable migrations are allowed; inspect them to ensure they only prove rejection or history and never seed a valid runtime value.

- [ ] **Step 6: Run the canonical frontend and server gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
git diff --check
```

Expected: every command passes at the same final HEAD. If any check cannot run, record the exact skipped command and reason; do not claim the change is release-ready.

- [ ] **Step 7: Review final visual evidence and data boundaries**

Inspect all contact sheets and 320/390/1280 screenshots. Confirm no neighboring oval, no circle-inside-circle or square frame at rest, one selected/focus ring, readable 20px identities, accessible 44px targets, no horizontal overflow, preserved RSVP/attendance badges and correct account/roster/public updates. Confirm no source sheet, intermediate crop, local absolute path, real member data or secret is tracked.

- [ ] **Step 8: Commit docs and final regression changes**

```bash
git add front/tests/e2e/member-profile-permissions.spec.ts docs/development/architecture.md CHANGELOG.md
git commit -m "docs: record the integrated profile avatar contract"
```

- [ ] **Step 9: Perform completion verification**

Invoke `verification-before-completion`, inspect `git status --short --branch`, `git log --oneline` for all task commits, and summarize changed frontend/server/migration/docs surfaces, exact commands run, browser evidence and any remaining deployment risk. Do not push, merge, tag or deploy.
