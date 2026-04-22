# ReadMates Book Images And Meeting URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist book cover URLs, book links, neutral meeting details, and render registered covers and meeting actions across ReadMates without Zoom-specific copy.

**Architecture:** Add nullable metadata columns to `sessions`, extend existing host/current/archive/public DTOs, and keep meeting details private to authenticated app surfaces. Frontend uses one shared `BookCover` component with a CSS fallback so all book-cover slots behave consistently.

**Tech Stack:** Kotlin/Spring Boot 4, PostgreSQL/Flyway, JdbcTemplate, Next.js/React, Vitest/Testing Library, Gradle, pnpm.

---

## File Structure

- Create `server/src/main/resources/db/migration/V6__session_book_images_and_meeting_urls.sql`
  - Adds `book_image_url`, `meeting_url`, and `meeting_passcode` to `sessions`.
- Modify `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
  - Extends `HostSessionRequest` with optional persisted fields.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
  - Normalizes blank optional fields, writes/reads new metadata, defaults blank location to `온라인`.
- Modify `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
  - Adds `bookImageUrl` to archive session DTO.
- Modify `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
  - Selects and maps `sessions.book_image_url`.
- Modify `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`
  - Adds `bookImageUrl` to public book DTOs without exposing meeting data.
- Modify `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
  - Seeds cover URLs/book links and removes Zoom wording.
- Create `front/shared/ui/book-cover.tsx`
  - Single React component for image cover + fallback cover.
- Modify `front/shared/api/readmates.ts`
  - Adds the new fields to frontend API types.
- Modify `front/features/host/components/host-session-editor.tsx`
  - Persists book link, book image URL, location, meeting URL, and passcode.
- Modify `front/features/member-home/components/prep-card.tsx`
  - Uses `BookCover` and shows member meeting action.
- Modify `front/features/current-session/components/current-session.tsx`
  - Uses cover metadata and shows member meeting action.
- Modify `front/features/host/components/host-dashboard.tsx`
  - Uses `BookCover` and removes Zoom copy.
- Modify `front/features/archive/components/archive-page.tsx`
  - Uses registered cover image on mobile session cards.
- Modify `front/features/archive/components/my-page.tsx`
  - Removes Zoom copy in notification text.
- Modify `front/features/public/components/public-home.tsx`
  - Uses registered cover image on public home cards.
- Modify `front/features/public/components/public-session.tsx`
  - Uses registered cover image on public session detail.
- Modify tests listed in each task.

## Seed Cover URL Map

Use these verified HTTPS image URLs in the seed file. Each URL returned `HTTP 200` with `Content-Type: image/jpeg` during planning.

| Session | Book | `book_link` | `book_image_url` |
| --- | --- | --- | --- |
| 1 | 팩트풀니스 | `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=373510599` | `https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg` |
| 2 | 냉정한 이타주의자 | `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=370838575` | `https://image.aladin.co.kr/product/10044/19/cover500/8960515833_3.jpg` |
| 3 | 우리가 겨울을 지나온 방식 | `https://www.aladin.co.kr/shop/UsedShop/wuseditemall.aspx?ItemId=329015526` | `https://image.aladin.co.kr/product/32901/55/cover500/k602936626_2.jpg` |
| 4 | 내 안에서 나를 만드는 것들 | `https://www.aladin.co.kr/shop/UsedShop/wuseditemall.aspx?ItemId=68829723&start=newproduct` | `https://image.aladin.co.kr/product/6882/97/cover500/8933870644_2.jpg` |
| 5 | 지대넓얕 무한 | `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=353017075` | `https://image.aladin.co.kr/product/35301/70/cover500/k692035972_1.jpg` |
| 6 | 가난한 찰리의 연감 | `https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=350688115` | `https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg` |

Verify them before editing seed data:

```bash
for url in \
  https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg \
  https://image.aladin.co.kr/product/10044/19/cover500/8960515833_3.jpg \
  https://image.aladin.co.kr/product/32901/55/cover500/k602936626_2.jpg \
  https://image.aladin.co.kr/product/6882/97/cover500/8933870644_2.jpg \
  https://image.aladin.co.kr/product/35301/70/cover500/k692035972_1.jpg \
  https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg
do
  curl -I -L --max-time 10 "$url" | rg 'HTTP/|Content-Type'
done
```

Expected: every URL reports `HTTP/1.1 200 OK` and `Content-Type: image/jpeg`.

### Task 1: Backend Host Session Persistence

**Files:**
- Create: `server/src/main/resources/db/migration/V6__session_book_images_and_meeting_urls.sql`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`

- [x] **Step 1: Write failing host create coverage**

In `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`, update the first create request body:

```kotlin
content =
    """
    {
      "title": "7회차 · 테스트 책",
      "bookTitle": "테스트 책",
      "bookAuthor": "테스트 저자",
      "bookLink": "https://example.com/books/test-book",
      "bookImageUrl": "https://example.com/covers/test-book.jpg",
      "date": "2026-05-20",
      "locationLabel": "온라인",
      "meetingUrl": "https://meet.google.com/readmates-test",
      "meetingPasscode": "readmates"
    }
    """.trimIndent()
```

Add response assertions in the same `.andExpect` block:

```kotlin
jsonPath("$.bookLink") { value("https://example.com/books/test-book") }
jsonPath("$.bookImageUrl") { value("https://example.com/covers/test-book.jpg") }
jsonPath("$.locationLabel") { value("온라인") }
jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-test") }
jsonPath("$.meetingPasscode") { value("readmates") }
```

Change the `sessionDefaults` query to select the new fields:

```sql
select
  start_time::text,
  end_time::text,
  location_label,
  book_link,
  book_image_url,
  meeting_url,
  meeting_passcode,
  to_char(question_deadline_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as question_deadline_at
from sessions
where club_id = '00000000-0000-0000-0000-000000000001'::uuid
  and number = 7
```

Replace the old location assertion and add persistence assertions:

```kotlin
assertEquals("온라인", sessionDefaults["location_label"])
assertEquals("https://example.com/books/test-book", sessionDefaults["book_link"])
assertEquals("https://example.com/covers/test-book.jpg", sessionDefaults["book_image_url"])
assertEquals("https://meet.google.com/readmates-test", sessionDefaults["meeting_url"])
assertEquals("readmates", sessionDefaults["meeting_passcode"])
```

Add current-session assertions:

```kotlin
jsonPath("$.currentSession.bookImageUrl") { value("https://example.com/covers/test-book.jpg") }
jsonPath("$.currentSession.locationLabel") { value("온라인") }
jsonPath("$.currentSession.meetingUrl") { value("https://meet.google.com/readmates-test") }
jsonPath("$.currentSession.meetingPasscode") { value("readmates") }
```

- [x] **Step 2: Write failing host detail/update coverage**

In `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`, extend the initial `GET /api/host/sessions/{id}` assertions:

```kotlin
jsonPath("$.bookLink") { value("https://example.com/books/new-book") }
jsonPath("$.bookImageUrl") { value("https://example.com/covers/new-book.jpg") }
jsonPath("$.locationLabel") { value("온라인") }
jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-new") }
jsonPath("$.meetingPasscode") { value("newpass") }
```

Extend the patch request body:

```kotlin
content =
    """
    {
      "title": "7회차 · 수정된 책",
      "bookTitle": "수정된 책",
      "bookAuthor": "수정 저자",
      "bookLink": "https://example.com/books/updated-book",
      "bookImageUrl": "https://example.com/covers/updated-book.jpg",
      "date": "2026-05-27",
      "locationLabel": "강남 스터디룸",
      "meetingUrl": "https://meet.google.com/readmates-updated",
      "meetingPasscode": "updated"
    }
    """.trimIndent()
```

Add patch response assertions:

```kotlin
jsonPath("$.bookLink") { value("https://example.com/books/updated-book") }
jsonPath("$.bookImageUrl") { value("https://example.com/covers/updated-book.jpg") }
jsonPath("$.locationLabel") { value("강남 스터디룸") }
jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-updated") }
jsonPath("$.meetingPasscode") { value("updated") }
```

Update `createSessionSeven()` request body:

```kotlin
content =
    """
    {
      "title": "7회차 · 새로운 책",
      "bookTitle": "새로운 책",
      "bookAuthor": "새 저자",
      "bookLink": "https://example.com/books/new-book",
      "bookImageUrl": "https://example.com/covers/new-book.jpg",
      "date": "2026-05-20",
      "locationLabel": "온라인",
      "meetingUrl": "https://meet.google.com/readmates-new",
      "meetingPasscode": "newpass"
    }
    """.trimIndent()
```

- [x] **Step 3: Run failing backend tests**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest' --tests 'com.readmates.session.api.HostDashboardControllerTest'
```

Expected: FAIL because `bookImageUrl`, `bookLink`, `meetingUrl`, `meetingPasscode`, and `locationLabel` are not mapped through the request/response path yet.

- [x] **Step 4: Add migration**

Create `server/src/main/resources/db/migration/V6__session_book_images_and_meeting_urls.sql`:

```sql
alter table sessions
  add column book_image_url varchar(1000),
  add column meeting_url varchar(1000),
  add column meeting_passcode varchar(255);
```

- [x] **Step 5: Extend host request and response DTOs**

In `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`, replace `HostSessionRequest` with:

```kotlin
data class HostSessionRequest(
    @field:NotBlank val title: String,
    @field:NotBlank val bookTitle: String,
    @field:NotBlank val bookAuthor: String,
    @field:Size(max = 500) val bookLink: String? = null,
    @field:Size(max = 1000) val bookImageUrl: String? = null,
    @field:Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}") val date: String,
    @field:Size(max = 255) val locationLabel: String? = null,
    @field:Size(max = 1000) val meetingUrl: String? = null,
    @field:Size(max = 255) val meetingPasscode: String? = null,
) {
    @AssertTrue(message = "date must be a valid ISO calendar date")
    fun isValidCalendarDate(): Boolean = runCatching {
        LocalDate.parse(date)
    }.isSuccess
}
```

Add the import:

```kotlin
import jakarta.validation.constraints.Size
```

- [x] **Step 6: Extend repository data classes**

In `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`, add fields to `CurrentSessionDetail`:

```kotlin
val bookLink: String?,
val bookImageUrl: String?,
val meetingUrl: String?,
val meetingPasscode: String?,
```

Add fields to `CreatedSessionResponse`:

```kotlin
val bookLink: String?,
val bookImageUrl: String?,
val locationLabel: String,
val meetingUrl: String?,
val meetingPasscode: String?,
```

Add fields to `HostSessionDetailResponse`:

```kotlin
val bookLink: String?,
val bookImageUrl: String?,
val locationLabel: String,
val meetingUrl: String?,
val meetingPasscode: String?,
```

Add helper functions near the bottom of `SessionRepository`:

```kotlin
private fun blankToNull(value: String?): String? =
    value?.trim()?.takeIf { it.isNotEmpty() }

private fun locationLabelOrDefault(value: String?): String =
    blankToNull(value) ?: "온라인"
```

- [x] **Step 7: Persist fields on create/update and select them back**

In `createOpenSession`, define normalized values before the insert:

```kotlin
val bookLink = blankToNull(request.bookLink)
val bookImageUrl = blankToNull(request.bookImageUrl)
val locationLabel = locationLabelOrDefault(request.locationLabel)
val meetingUrl = blankToNull(request.meetingUrl)
val meetingPasscode = blankToNull(request.meetingPasscode)
```

Update the insert column list:

```sql
book_link,
book_image_url,
session_date,
start_time,
end_time,
location_label,
meeting_url,
meeting_passcode,
question_deadline_at,
state
```

Update the insert values:

```sql
values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Pass parameters in this order after `request.bookAuthor`:

```kotlin
bookLink,
bookImageUrl,
sessionDate,
LocalTime.of(20, 0),
LocalTime.of(22, 0),
locationLabel,
meetingUrl,
meetingPasscode,
sessionDate.minusDays(1).atTime(23, 59).atOffset(ZoneOffset.ofHours(9)),
state,
```

Return the normalized values:

```kotlin
bookLink = bookLink,
bookImageUrl = bookImageUrl,
locationLabel = locationLabel,
meetingUrl = meetingUrl,
meetingPasscode = meetingPasscode,
```

In `findHostSession`, extend the select:

```sql
select id, number, title, book_title, book_author, book_link, book_image_url,
       session_date, location_label, meeting_url, meeting_passcode, state
from sessions
```

Map fields into `HostSessionDetailResponse`:

```kotlin
bookLink = resultSet.getString("book_link"),
bookImageUrl = resultSet.getString("book_image_url"),
locationLabel = resultSet.getString("location_label"),
meetingUrl = resultSet.getString("meeting_url"),
meetingPasscode = resultSet.getString("meeting_passcode"),
```

In `updateHostSession`, normalize request values like create and update SQL:

```sql
set title = ?,
    book_title = ?,
    book_author = ?,
    book_link = ?,
    book_image_url = ?,
    session_date = ?,
    location_label = ?,
    meeting_url = ?,
    meeting_passcode = ?,
    question_deadline_at = ?,
    updated_at = now()
```

Pass:

```kotlin
request.title,
request.bookTitle,
request.bookAuthor,
bookLink,
bookImageUrl,
sessionDate,
locationLabel,
meetingUrl,
meetingPasscode,
sessionDate.minusDays(1).atTime(23, 59).atOffset(ZoneOffset.ofHours(9)),
sessionId,
member.clubId,
```

In `findCurrentSession`, extend the select:

```sql
book_link,
book_image_url,
meeting_url,
meeting_passcode,
```

Map fields in `toCurrentSessionDetail`:

```kotlin
bookLink = getString("book_link"),
bookImageUrl = getString("book_image_url"),
meetingUrl = getString("meeting_url"),
meetingPasscode = getString("meeting_passcode"),
```

- [x] **Step 8: Run backend tests to verify pass**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest' --tests 'com.readmates.session.api.HostDashboardControllerTest'
```

Expected: PASS.

- [x] **Step 9: Commit backend host persistence**

```bash
git add server/src/main/resources/db/migration/V6__session_book_images_and_meeting_urls.sql \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt \
  server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt
git commit -m "feat: persist session book and meeting metadata"
```

### Task 2: Backend Archive/Public Book Images And Seed Integrity

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`

- [x] **Step 1: Write failing seed integrity coverage**

Add this test to `ReadmatesSeedDataTest`:

```kotlin
@Test
fun `seed sessions include cover image urls and neutral locations`() {
    val rows = jdbcTemplate.query(
        """
        select number, book_image_url, location_label, meeting_url, meeting_passcode
        from sessions
        where club_id = ?
          and number between 1 and 6
        order by number
        """.trimIndent(),
        { rs, _ ->
            SeedSessionMetadata(
                number = rs.getInt("number"),
                bookImageUrl = rs.getString("book_image_url"),
                locationLabel = rs.getString("location_label"),
                meetingUrl = rs.getString("meeting_url"),
                meetingPasscode = rs.getString("meeting_passcode"),
            )
        },
        CLUB_ID,
    )

    assertEquals(6, rows.size)
    rows.forEach { row ->
        require(row.bookImageUrl.startsWith("https://image.aladin.co.kr/product/")) {
            "session ${row.number} should use a stable Aladin cover URL"
        }
        assertEquals("온라인", row.locationLabel)
        assertEquals(null, row.meetingUrl)
        assertEquals(null, row.meetingPasscode)
    }
}

private data class SeedSessionMetadata(
    val number: Int,
    val bookImageUrl: String,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
)
```

- [x] **Step 2: Write failing public and archive response coverage**

In `ArchiveAndNotesDbTest`, extend the archive sessions test with:

```kotlin
jsonPath("$[0].bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
```

In `PublicControllerDbTest`, extend `public club returns real published sessions`:

```kotlin
jsonPath("$.recentSessions[0].bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
jsonPath("$.recentSessions[0].meetingUrl") { doesNotExist() }
jsonPath("$.recentSessions[0].meetingPasscode") { doesNotExist() }
```

Extend `public session returns details for published session`:

```kotlin
jsonPath("$.bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
jsonPath("$.meetingUrl") { doesNotExist() }
jsonPath("$.meetingPasscode") { doesNotExist() }
```

In the test SQL for `public surfaces exclude published non-public session`, update insert columns and values after `book_link`:

```sql
book_image_url,
```

```sql
null,
```

Change `online · Zoom` to `온라인`.

- [x] **Step 3: Run failing backend tests**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.archive.api.ReadmatesSeedDataTest' --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

Expected: FAIL because seed data and public/archive DTOs do not include `bookImageUrl` yet.

- [x] **Step 4: Extend archive DTO and repository**

In `ArchiveController.kt`, add to `ArchiveSessionItem`:

```kotlin
val bookImageUrl: String?,
```

In `ArchiveRepository.findArchiveSessions`, add `sessions.book_image_url` to the select and group-by:

```sql
sessions.book_image_url,
```

Map it in `toArchiveSessionItem()`:

```kotlin
bookImageUrl = getString("book_image_url"),
```

- [x] **Step 5: Extend public DTOs and queries**

In `PublicController.kt`, add `bookImageUrl` to `PublicSessionListItem` and `PublicSessionDetailResponse`:

```kotlin
val bookImageUrl: String?,
```

In both public session queries, add:

```sql
sessions.book_image_url,
```

Map:

```kotlin
bookImageUrl = rs.getString("book_image_url"),
```

Do not add `meeting_url` or `meeting_passcode` to public DTOs.

- [x] **Step 6: Run tests to verify response mapping is wired**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

Expected: FAIL only because seed values are still null. Leave these changes uncommitted until Task 3 updates seed data and the combined backend response tests pass.

### Task 3: Dev Seed Covers And Zoom-Free Backend Fixtures

**Files:**
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Modify: backend tests containing session insert SQL with Zoom copy.

- [x] **Step 1: Update dev seed session CTE**

In `R__readmates_dev_seed.sql`, change the session seed CTE from:

```sql
with seed(id_suffix, number, title, book_title, book_author, book_translator, session_date, question_deadline_at) as (
```

to:

```sql
with seed(id_suffix, number, title, book_title, book_author, book_translator, book_link, book_image_url, session_date, question_deadline_at) as (
```

Replace the six rows with:

```sql
(301, 1, '1회차 · 팩트풀니스', '팩트풀니스', '한스 로슬링', '이창신', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=373510599', 'https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg', '2025-11-26'::date, '2025-11-25 23:59:00+09'::timestamptz),
(302, 2, '2회차 · 냉정한 이타주의자', '냉정한 이타주의자', '윌리엄 맥어스킬', null, 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=370838575', 'https://image.aladin.co.kr/product/10044/19/cover500/8960515833_3.jpg', '2025-12-17'::date, '2025-12-16 23:59:00+09'::timestamptz),
(303, 3, '3회차 · 우리가 겨울을 지나온 방식', '우리가 겨울을 지나온 방식', '문미순', null, 'https://www.aladin.co.kr/shop/UsedShop/wuseditemall.aspx?ItemId=329015526', 'https://image.aladin.co.kr/product/32901/55/cover500/k602936626_2.jpg', '2026-01-21'::date, '2026-01-20 23:59:00+09'::timestamptz),
(304, 4, '4회차 · 내 안에서 나를 만드는 것들', '내 안에서 나를 만드는 것들', '러셀 로버츠', null, 'https://www.aladin.co.kr/shop/UsedShop/wuseditemall.aspx?ItemId=68829723&start=newproduct', 'https://image.aladin.co.kr/product/6882/97/cover500/8933870644_2.jpg', '2026-02-25'::date, '2026-02-24 23:59:00+09'::timestamptz),
(305, 5, '5회차 · 지대넓얕 무한', '지대넓얕 무한', '채사장', null, 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=353017075', 'https://image.aladin.co.kr/product/35301/70/cover500/k692035972_1.jpg', '2026-03-18'::date, '2026-03-17 23:59:00+09'::timestamptz),
(306, 6, '6회차 · 가난한 찰리의 연감', '가난한 찰리의 연감', '찰리 멍거', null, 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=350688115', 'https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg', '2026-04-15'::date, '2026-04-14 23:59:00+09'::timestamptz)
```

In the `resolved` CTE, replace:

```sql
null::varchar(500) as book_link,
```

with:

```sql
seed.book_link::varchar(500) as book_link,
seed.book_image_url::varchar(1000) as book_image_url,
```

Add `book_image_url`, `meeting_url`, and `meeting_passcode` to the insert columns:

```sql
book_image_url,
...
meeting_url,
meeting_passcode,
```

Add values:

```sql
book_image_url,
...
null,
null,
```

Add conflict updates:

```sql
book_image_url = excluded.book_image_url,
meeting_url = excluded.meeting_url,
meeting_passcode = excluded.meeting_passcode,
```

Set `location_label` to:

```sql
'온라인' as location_label,
```

- [x] **Step 2: Remove Zoom from backend fixtures**

Run:

```bash
rg -n "Zoom|zoom|줌" server/src/main server/src/test server/src/main/resources
```

For each active backend hit, replace location values with `온라인`. Known test inserts to update:

```text
server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt
server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
```

When insert SQL lists `book_link`, add `book_image_url`, `meeting_url`, and `meeting_passcode` only if the test database schema requires matching the new column order. Because the new columns are nullable and additive, explicit insert lists can omit them unless the test needs values.

- [x] **Step 3: Run backend seed tests**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.archive.api.ReadmatesSeedDataTest' --tests 'com.readmates.publication.api.PublicControllerDbTest' --tests 'com.readmates.session.api.CurrentSessionControllerDbTest'
```

Expected: PASS.

- [x] **Step 4: Commit seed updates**

```bash
git add server/src/main/resources/db/dev/R__readmates_dev_seed.sql \
  server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt \
  server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt \
  server/src/main/kotlin/com/readmates/publication/api/PublicController.kt
git commit -m "feat: seed and expose readmates book cover urls"
```

### Task 4: Shared Frontend Book Cover Component

**Files:**
- Create: `front/shared/ui/book-cover.tsx`
- Create: `front/tests/unit/book-cover.test.tsx`

- [x] **Step 1: Write failing component tests**

Create `front/tests/unit/book-cover.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookCover } from "@/shared/ui/book-cover";

afterEach(cleanup);

describe("BookCover", () => {
  it("renders a registered cover image with accessible alt text", () => {
    render(
      <BookCover
        title="팩트풀니스"
        author="한스 로슬링"
        imageUrl="https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg"
        width={96}
      />,
    );

    const image = screen.getByRole("img", { name: "팩트풀니스 표지" });
    expect(image).toHaveAttribute("src", "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg");
  });

  it("falls back to a text cover when the registered image fails", () => {
    render(
      <BookCover
        title="팩트풀니스"
        author="한스 로슬링"
        imageUrl="https://example.com/broken.jpg"
        width={96}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "팩트풀니스 표지" }));

    expect(screen.queryByRole("img", { name: "팩트풀니스 표지" })).not.toBeInTheDocument();
    expect(screen.getByText("팩트풀니스")).toBeInTheDocument();
    expect(screen.getByText("한스 로슬링")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run failing component tests**

Run:

```bash
cd front
pnpm test tests/unit/book-cover.test.tsx
```

Expected: FAIL because `@/shared/ui/book-cover` does not exist.

- [x] **Step 3: Implement `BookCover`**

Create `front/shared/ui/book-cover.tsx`:

```tsx
"use client";

import { type CSSProperties, useState } from "react";
import { displayText } from "@/shared/ui/readmates-display";

type BookCoverProps = {
  title: string;
  author?: string | null;
  imageUrl?: string | null;
  width?: number;
  className?: string;
  style?: CSSProperties;
  decorative?: boolean;
};

export function BookCover({
  title,
  author,
  imageUrl,
  width = 96,
  className,
  style,
  decorative = false,
}: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  const safeTitle = displayText(title, "책 정보 준비 중");
  const safeAuthor = displayText(author ?? "", "저자 미정");
  const normalizedImageUrl = imageUrl?.trim();
  const showImage = Boolean(normalizedImageUrl) && !failed;
  const coverStyle: CSSProperties = {
    width,
    aspectRatio: "3 / 4",
    borderRadius: 4,
    border: "1px solid var(--line)",
    overflow: "hidden",
    flexShrink: 0,
    background: "var(--bg-sub)",
    boxShadow: "1px 1px 0 var(--line-soft), 2px 2px 0 var(--line-soft)",
    ...style,
  };

  return (
    <div className={className} style={coverStyle} aria-hidden={decorative || undefined}>
      {showImage ? (
        <img
          src={normalizedImageUrl}
          alt={decorative ? "" : `${safeTitle} 표지`}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, var(--bg-deep), var(--bg-sub))",
          }}
        >
          <span className="editorial" style={{ fontSize: 14, lineHeight: 1.2 }}>
            {safeTitle}
          </span>
          <span className="tiny">{safeAuthor}</span>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: Run component tests**

Run:

```bash
cd front
pnpm test tests/unit/book-cover.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit shared component**

```bash
git add front/shared/ui/book-cover.tsx front/tests/unit/book-cover.test.tsx
git commit -m "feat: add shared book cover component"
```

### Task 5: Frontend Types And Host Session Editor

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [x] **Step 1: Write failing host editor tests**

In the `session` fixture in `host-session-editor.test.tsx`, add:

```ts
bookLink: "https://example.com/books/factfulness",
bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
locationLabel: "온라인",
meetingUrl: "https://meet.google.com/readmates-factfulness",
meetingPasscode: "fact",
```

Add this test:

```tsx
it("shows persisted book and meeting fields without Zoom wording", () => {
  const { container } = render(<HostSessionEditor session={session} />);

  expect(screen.getByLabelText("책 링크")).toHaveValue("https://example.com/books/factfulness");
  expect(screen.getByLabelText("책 이미지 URL")).toHaveValue("https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg");
  expect(screen.getByRole("img", { name: "팩트풀니스 표지" })).toBeInTheDocument();
  expect(screen.getByLabelText("장소")).toHaveValue("온라인");
  expect(screen.getByLabelText("미팅 URL")).toHaveValue("https://meet.google.com/readmates-factfulness");
  expect(screen.getByLabelText("Passcode · 선택")).toHaveValue("fact");
  expect(container).not.toHaveTextContent(/Zoom|zoom|줌/);
});
```

Update the POST expected payload:

```ts
body: JSON.stringify({
  title: "7회차 모임 · 새 책",
  bookTitle: "새 책",
  bookAuthor: "새 저자",
  bookLink: "https://product.kyobobook.co.kr/detail/S000001947832",
  bookImageUrl: "",
  date: "2026-05-20",
  locationLabel: "온라인",
  meetingUrl: "",
  meetingPasscode: "",
}),
```

Update the PATCH expected payload:

```ts
body: JSON.stringify({
  title: "6회차 모임 · 수정",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookLink: "https://example.com/books/factfulness",
  bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
  date: "2025-11-26",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-factfulness",
  meetingPasscode: "fact",
}),
```

- [x] **Step 2: Run failing host editor tests**

Run:

```bash
cd front
pnpm test tests/unit/host-session-editor.test.tsx
```

Expected: FAIL because types and editor state do not include the new fields.

- [x] **Step 3: Extend frontend API types**

In `front/shared/api/readmates.ts`, add optional fields to every current-session and host/public/archive type that receives them.

For `CurrentSessionResponse.currentSession`, add:

```ts
bookLink: string | null;
bookImageUrl: string | null;
meetingUrl: string | null;
meetingPasscode: string | null;
```

For `ArchiveSessionItem`, `PublicSessionListItem`, and `PublicSessionDetailResponse`, add:

```ts
bookImageUrl: string | null;
```

For `HostSessionDetailResponse`, add:

```ts
bookLink: string | null;
bookImageUrl: string | null;
locationLabel: string;
meetingUrl: string | null;
meetingPasscode: string | null;
```

For `HostSessionRequest`, replace it with:

```ts
export type HostSessionRequest = {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink?: string | null;
  bookImageUrl?: string | null;
  date: string;
  locationLabel?: string | null;
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
};
```

For `CreatedSessionResponse`, add:

```ts
bookLink: string | null;
bookImageUrl: string | null;
locationLabel: string;
meetingUrl: string | null;
meetingPasscode: string | null;
```

- [x] **Step 4: Implement host editor state and UI**

In `host-session-editor.tsx`, import `BookCover`:

```tsx
import { BookCover } from "@/shared/ui/book-cover";
```

Add controlled state:

```tsx
const [bookLink, setBookLink] = useState(session?.bookLink ?? "https://product.kyobobook.co.kr/detail/S000001947832");
const [bookImageUrl, setBookImageUrl] = useState(session?.bookImageUrl ?? "");
const [locationLabel, setLocationLabel] = useState(session?.locationLabel ?? "온라인");
const [meetingUrl, setMeetingUrl] = useState(session?.meetingUrl ?? "");
const [meetingPasscode, setMeetingPasscode] = useState(session?.meetingPasscode ?? "");
```

Extend the JSON body:

```tsx
body: JSON.stringify({
  title,
  bookTitle,
  bookAuthor,
  bookLink,
  bookImageUrl,
  date,
  locationLabel,
  meetingUrl,
  meetingPasscode,
}),
```

Replace the `book-link` input with controlled state:

```tsx
<input
  id="book-link"
  className="input"
  value={bookLink}
  onChange={(event) => setBookLink(event.target.value)}
  placeholder="https://product.kyobobook.co.kr/..."
/>
```

Add `책 이미지 URL` after book link:

```tsx
<div>
  <label className="label" htmlFor="book-image-url">
    책 이미지 URL <span className="tiny" style={{ fontWeight: 400 }}>· 선택</span>
  </label>
  <input
    id="book-image-url"
    className="input"
    value={bookImageUrl}
    onChange={(event) => setBookImageUrl(event.target.value)}
    placeholder="https://image.aladin.co.kr/product/..."
  />
</div>
<BookCover title={bookTitle} author={bookAuthor} imageUrl={bookImageUrl} width={96} />
```

Replace schedule labels and inputs:

```tsx
<label className="label" htmlFor="session-location">
  장소
</label>
<input
  id="session-location"
  className="input"
  value={locationLabel}
  onChange={(event) => setLocationLabel(event.target.value)}
/>
```

```tsx
<label className="label" htmlFor="meeting-url">
  미팅 URL
</label>
<input
  id="meeting-url"
  className="input"
  value={meetingUrl}
  onChange={(event) => setMeetingUrl(event.target.value)}
  placeholder="https://meet.google.com/..."
/>
```

```tsx
<input
  id="meeting-passcode"
  className="input"
  value={meetingPasscode}
  onChange={(event) => setMeetingPasscode(event.target.value)}
  placeholder="선택 사항"
/>
```

- [x] **Step 5: Run host editor tests**

Run:

```bash
cd front
pnpm test tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit host editor**

```bash
git add front/shared/api/readmates.ts \
  front/features/host/components/host-session-editor.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: persist host book covers and meeting urls"
```

### Task 6: Member And Current Session Meeting UI

**Files:**
- Modify: `front/features/member-home/components/prep-card.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [x] **Step 1: Write failing member/current tests**

In `member-home.test.tsx`, change fixture location to `온라인` and add fields:

```ts
bookLink: "https://example.com/books/test",
bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
locationLabel: "온라인",
meetingUrl: "https://meet.google.com/readmates-member",
meetingPasscode: "memberpass",
```

Add assertions in `shows the next gathering prep card`:

```ts
expect(screen.getByRole("img", { name: "테스트 책 표지" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "미팅 입장" })).toHaveAttribute("href", "https://meet.google.com/readmates-member");
expect(screen.getByText("Passcode memberpass")).toBeInTheDocument();
```

In `current-session.test.tsx`, change fixture location to `온라인` and add:

```ts
bookLink: "https://example.com/books/test",
bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
meetingUrl: "https://meet.google.com/readmates-current",
meetingPasscode: "currentpass",
```

Add assertions to `shows RSVP, check-in, and question sections`:

```ts
expect(screen.getByRole("img", { name: "테스트 책 표지" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "미팅 입장" })).toHaveAttribute("href", "https://meet.google.com/readmates-current");
expect(screen.getByText("Passcode currentpass")).toBeInTheDocument();
```

Add a missing-meeting test:

```tsx
it("omits the meeting action when a session has no meeting URL", () => {
  render(
    <CurrentSession
      data={{
        currentSession: {
          ...currentSessionData.currentSession!,
          meetingUrl: null,
          meetingPasscode: null,
        },
      }}
    />,
  );

  expect(screen.queryByRole("link", { name: "미팅 입장" })).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run failing member/current tests**

Run:

```bash
cd front
pnpm test tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx
```

Expected: FAIL because the UI does not render cover images or meeting actions yet.

- [x] **Step 3: Implement member prep card cover and meeting action**

In `prep-card.tsx`, import:

```tsx
import { BookCover } from "@/shared/ui/book-cover";
```

Replace the right-side quiet cover `<div>` with:

```tsx
<BookCover title={bookTitle} author={bookAuthor} imageUrl={session.bookImageUrl} width={96} />
```

Add after the `When` small text:

```tsx
{session.meetingUrl ? (
  <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
    <a className="btn btn-ghost btn-sm" href={session.meetingUrl} target="_blank" rel="noreferrer">
      미팅 입장
    </a>
    {session.meetingPasscode ? <span className="tiny">Passcode {session.meetingPasscode}</span> : null}
  </div>
) : null}
```

- [x] **Step 4: Implement current session cover and meeting action**

In `current-session.tsx`, import `BookCover`:

```tsx
import { BookCover } from "@/shared/ui/book-cover";
```

In the page header row, add a cover before the text block:

```tsx
<BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={72} />
```

In the session `<dl>` aside after `Place`, add:

```tsx
{session.meetingUrl ? (
  <>
    <dt className="eyebrow">Meeting</dt>
    <dd style={{ margin: 0 }}>
      <a href={session.meetingUrl} target="_blank" rel="noreferrer">
        미팅 입장
      </a>
      {session.meetingPasscode ? (
        <div className="tiny" style={{ marginTop: 4 }}>
          Passcode {session.meetingPasscode}
        </div>
      ) : null}
    </dd>
  </>
) : null}
```

- [x] **Step 5: Remove Zoom copy in host/my pages**

In `host-dashboard.tsx`, replace checklist copy:

```tsx
{ when: "당일", title: "참석 확정 · 미팅 URL 공유", done: false },
```

In `my-page.tsx`, replace notification copy:

```tsx
{ label: "다음 모임 7일 전 리마인더", sub: "책·일정·미팅 URL", on: true },
```

In `host-dashboard.tsx`, import `BookCover` from shared UI and remove any local `BookCover` function if one exists. Use:

```tsx
<BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={96} />
```

- [x] **Step 6: Run member/current/host tests**

Run:

```bash
cd front
pnpm test tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/my-page.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit member session UI**

```bash
git add front/features/member-home/components/prep-card.tsx \
  front/features/current-session/components/current-session.tsx \
  front/features/host/components/host-dashboard.tsx \
  front/features/archive/components/my-page.tsx \
  front/tests/unit/member-home.test.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/host-dashboard.test.tsx \
  front/tests/unit/my-page.test.tsx
git commit -m "feat: show meeting links and registered covers to members"
```

### Task 7: Archive And Public Cover Rendering

**Files:**
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/public/components/public-home.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`
- Modify: `front/tests/unit/public-session-page.test.tsx`

- [x] **Step 1: Write failing archive/public tests**

In `archive-page.test.tsx`, add `bookImageUrl` to every `seededSessions` item. For session 6:

```ts
bookImageUrl: "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
```

Add assertion in the mobile archive test:

```ts
expect(scoped.getByRole("img", { name: "가난한 찰리의 연감 표지" })).toHaveAttribute(
  "src",
  "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
);
```

In `public-home.test.tsx`, add `bookImageUrl` to recent sessions. For session 6:

```ts
bookImageUrl: "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
```

Add:

```ts
expect(screen.getAllByRole("img", { name: "가난한 찰리의 연감 표지" }).length).toBeGreaterThan(0);
```

In `public-session-page.test.tsx`, add `bookImageUrl` to the fixture and assert:

```ts
expect(screen.getByRole("img", { name: "팩트풀니스 표지" })).toHaveAttribute(
  "src",
  "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
);
```

- [x] **Step 2: Run failing archive/public tests**

Run:

```bash
cd front
pnpm test tests/unit/archive-page.test.tsx tests/unit/public-home.test.tsx tests/unit/public-session-page.test.tsx
```

Expected: FAIL because the views still render text/CSS covers.

- [x] **Step 3: Implement archive cover rendering**

In `archive-page.tsx`, import `BookCover`:

```tsx
import { BookCover } from "@/shared/ui/book-cover";
```

Add `bookImageUrl` to `SessionRecord`:

```ts
bookImageUrl: string | null;
```

Map it in `toSessionRecord`:

```ts
bookImageUrl: session.bookImageUrl,
```

Replace mobile session cover:

```tsx
<BookCover title={session.book} author={session.author} imageUrl={session.bookImageUrl} width={52} />
```

- [x] **Step 4: Implement public cover rendering**

In `public-home.tsx`, import `BookCover`:

```tsx
import { BookCover } from "@/shared/ui/book-cover";
```

Replace the desktop latest record cover `<div aria-hidden ...>` with:

```tsx
<BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={96} />
```

Replace the mobile latest cover:

```tsx
<BookCover title={display.title} author={display.author} imageUrl={session.bookImageUrl} width={76} />
```

In `public-session.tsx`, import `BookCover` and replace the summary cover:

```tsx
<BookCover title={bookTitle} author={bookAuthor} imageUrl={session.bookImageUrl} width={160} />
```

- [x] **Step 5: Run archive/public tests**

Run:

```bash
cd front
pnpm test tests/unit/archive-page.test.tsx tests/unit/public-home.test.tsx tests/unit/public-session-page.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit archive/public UI**

```bash
git add front/features/archive/components/archive-page.tsx \
  front/features/public/components/public-home.tsx \
  front/features/public/components/public-session.tsx \
  front/tests/unit/archive-page.test.tsx \
  front/tests/unit/public-home.test.tsx \
  front/tests/unit/public-session-page.test.tsx
git commit -m "feat: render registered covers on archive and public pages"
```

### Task 8: Final Zoom Sweep And Full Verification

**Files:**
- Modify: any active source/test file still returned by `rg "Zoom|zoom|줌" front server README.md`

- [x] **Step 1: Search active app files for Zoom wording**

Run:

```bash
rg -n "Zoom|zoom|줌" front server README.md
```

Expected before cleanup: zero hits, or only hits in generated output that are not active source/test files. If active hits remain, replace them with neutral copy:

```text
Zoom 링크 -> 미팅 URL
Zoom / 미팅 URL -> 미팅 URL
장소 / 줌 링크 -> 장소
online · Zoom -> 온라인
```

- [x] **Step 2: Run backend targeted tests**

Run:

```bash
cd server
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest' \
  --tests 'com.readmates.session.api.HostDashboardControllerTest' \
  --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' \
  --tests 'com.readmates.archive.api.ReadmatesSeedDataTest' \
  --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest' \
  --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

Expected: PASS.

- [x] **Step 3: Run frontend targeted tests**

Run:

```bash
cd front
pnpm test tests/unit/book-cover.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/member-home.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/archive-page.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/public-home.test.tsx \
  tests/unit/public-session-page.test.tsx
```

Expected: PASS.

- [x] **Step 4: Run broader checks**

Run:

```bash
cd front
pnpm lint
pnpm test
```

Expected: PASS.

Run:

```bash
cd server
./gradlew test
```

Expected: PASS.

- [x] **Step 5: Commit final cleanup**

```bash
git add front server README.md
git commit -m "chore: remove zoom-specific copy"
```

Skip the commit if `git diff --cached --quiet` reports no staged changes after the sweep.

Result: skipped because `git add front server README.md && git diff --cached --quiet` reported no staged cleanup changes.

## Self-Review

Spec coverage:

- Persisted `bookImageUrl`, `bookLink`, `locationLabel`, `meetingUrl`, and `meetingPasscode`: Tasks 1 and 5.
- Book cover preview and shared fallback behavior: Tasks 4 and 5.
- Registered covers on member/current/archive/public pages: Tasks 6 and 7.
- Seed sessions 1-6 with real cover image URLs: Task 3.
- Meeting URL shown only in authenticated member surfaces: Tasks 1, 2, 6, and 7.
- Public APIs exclude meeting data: Task 2.
- Zoom wording removed from active source/tests/server defaults: Tasks 3, 6, and 8.
- Verification commands included: Tasks 1-8.

Placeholder scan:

- The plan intentionally uses concrete file paths, field names, commands, expected failures, expected passes, and seed URLs.
- No step requires inventing names during implementation.

Type consistency:

- Backend uses `bookLink`, `bookImageUrl`, `locationLabel`, `meetingUrl`, and `meetingPasscode` as JSON property names.
- Database uses `book_link`, `book_image_url`, `location_label`, `meeting_url`, and `meeting_passcode`.
- Frontend types mirror backend JSON names exactly.
