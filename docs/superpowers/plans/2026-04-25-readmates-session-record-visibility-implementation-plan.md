# ReadMates Session Record Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing draft/publish host UI with a single record summary save flow and a three-state visibility model: host-only, member-visible, public.

**Architecture:** Add `visibility = HOST_ONLY | MEMBER | PUBLIC` as the source of truth for session record exposure while keeping the existing `public_session_publications` table. Public APIs read only `PUBLIC`, member/archive APIs read `MEMBER` and `PUBLIC`, and host APIs can read/write every state without changing `sessions.state`.

**Tech Stack:** Kotlin/Spring Boot, Spring MVC, JDBC, MySQL/Flyway, React/Vite, React Router 7, Cloudflare Pages Functions BFF, Vitest, Spring MockMvc DB tests.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-25-readmates-session-record-visibility-design.md`
- Repository router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`
- Architecture guide: `docs/development/architecture.md`

## Current Code Reality

- Host publication save endpoint is `PUT /api/host/sessions/{sessionId}/publication` in `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`.
- Host publication request currently accepts `publicSummary` and `isPublic`.
- Application command is `UpsertPublicationCommand` in `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`.
- Host response models are in `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`.
- Host persistence upsert is `JdbcHostSessionWriteAdapter.upsertHostPublication`.
- Host publication detail read is `JdbcHostSessionWriteAdapter.findHostSessionPublication`.
- Public listing and public session detail queries are in `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`.
- Member archive list/detail queries are in `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`.
- Current public query exposure requires `sessions.state = 'PUBLISHED'` and `public_session_publications.is_public = true`.
- Current archive member detail exposes `public_summary` only when `is_public = true`.
- Frontend host publication contracts are in `front/features/host/api/host-contracts.ts`.
- Frontend host publication request builder is in `front/features/host/model/host-session-editor-model.ts`.
- Frontend host editor UI is in `front/features/host/components/host-session-editor.tsx`.
- Existing host editor tests cover the old `요약 초안 저장` and `공개 기록 발행` buttons in `front/tests/unit/host-session-editor.test.tsx`.
- Existing public DB tests are in `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`.
- Existing host session DB tests are in `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`.

## Implementation Policy

- Keep the existing endpoint path `PUT /api/host/sessions/{sessionId}/publication`.
- Replace request/response field `isPublic` with `visibility`.
- Keep `is_public` and `published_at` DB columns during this implementation for compatibility, but stop using `is_public` as read-path source of truth.
- Do not change route structure.
- Do not add member-facing edit controls.
- Do not add audit logging.
- Do not rename `public_session_publications` in this implementation.
- Do not use `sessions.state` to decide whether a record appears in `/records`.
- Do not expose `HOST_ONLY` records through public or member APIs.
- Preserve public repo safety: use `example.com` domains and deterministic test UUIDs only.

## File Map

### Server Migration And Models

- Create `server/src/main/resources/db/mysql/migration/V14__session_record_visibility.sql`: add `visibility`, backfill from `is_public`, and add a check constraint.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`: add `SessionRecordVisibility`, update `HostSessionPublication`, and update `HostPublicationResponse`.
- Modify `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`: change `UpsertPublicationCommand` from `isPublic` to `visibility`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`: validate and map `visibility`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`: write/read `visibility`, maintain `is_public`, stop changing `sessions.state`.

### Server Read Paths

- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`: public detail, stats, and list queries use `visibility = 'PUBLIC'`.
- Modify `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`: archive `published` derives from `visibility = 'PUBLIC'`, and member detail summary is visible for `visibility in ('MEMBER', 'PUBLIC')`.
- Optionally modify `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt` and web DTOs only if a record visibility label is added to member responses. This plan does not require that label.

### Frontend Host UI

- Modify `front/features/host/api/host-contracts.ts`: introduce `SessionRecordVisibility`, update publication contract and request.
- Modify `front/features/host/model/host-session-editor-model.ts`: replace publication mode/action helpers with visibility helpers.
- Modify `front/features/host/components/host-session-editor.tsx`: replace old status cards and two buttons with a radio group and one save button.
- Modify `front/tests/unit/api-contract-fixtures.ts`: update host publication fixture.
- Modify `front/tests/unit/host-session-editor-model.test.ts`: update helper tests.
- Modify `front/tests/unit/host-session-editor.test.tsx`: update UI and API interaction tests.

### Server Tests

- Modify `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`: add public/member/host-only visibility cases and open public session case.
- Modify `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`: update publication save tests and DB assertions.
- Modify `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt` or `ArchiveAndNotesDbTest.kt`: add member-visible summary coverage and host-only hiding coverage.
- Modify `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` only if migration tests need an expected schema assertion update.

---

## Task 0: Branch And Baseline

**Files:**
- No product files.

- [ ] **Step 1: Create or confirm the implementation branch**

Run:

```bash
git status --short --branch --untracked-files=all
```

Expected: current branch and dirty state are visible. If starting a new branch, use:

```bash
git switch -c codex/readmates-session-record-visibility
```

Expected: branch switches to `codex/readmates-session-record-visibility`.

- [ ] **Step 2: Confirm baseline checks that are practical before editing**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest
pnpm --dir front test -- host-session-editor
```

Expected: both commands pass before changes. If either fails before edits, stop and record the failure as pre-existing.

- [ ] **Step 3: Commit checkpoint**

No commit is required if no files changed. Record the baseline result in the execution notes.

---

## Task 1: Add The Visibility DB Column

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V14__session_record_visibility.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [ ] **Step 1: Write the migration**

Create `server/src/main/resources/db/mysql/migration/V14__session_record_visibility.sql`:

```sql
alter table public_session_publications
  add column visibility varchar(20) not null default 'HOST_ONLY' after is_public;

update public_session_publications
set visibility = case
  when is_public then 'PUBLIC'
  else 'HOST_ONLY'
end;

alter table public_session_publications
  add constraint public_session_publications_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
```

- [ ] **Step 2: Run Flyway migration tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: PASS. This confirms clean MySQL schema creation and migration order.

- [ ] **Step 3: Run seed smoke tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: PASS. The repeatable dev seed still inserts publication rows because the new column has a default.

- [ ] **Step 4: Commit**

Run:

```bash
git add server/src/main/resources/db/mysql/migration/V14__session_record_visibility.sql
git commit -m "feat: add session record visibility column"
```

Expected: commit succeeds with only the migration file staged.

---

## Task 2: Convert Host Publication API To Visibility

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [ ] **Step 1: Add a failing host publication DB test**

In `HostSessionControllerDbTest`, add a test that creates or reuses a deterministic session, saves every visibility, and checks response plus DB compatibility columns.

Use this request shape:

```json
{
  "publicSummary": "멤버에게만 공유할 테스트 기록입니다.",
  "visibility": "MEMBER"
}
```

Assert these response fields:

```kotlin
jsonPath("$.publicSummary") { value("멤버에게만 공유할 테스트 기록입니다.") }
jsonPath("$.visibility") { value("MEMBER") }
jsonPath("$.isPublic") { doesNotExist() }
jsonPath("$.published") { doesNotExist() }
```

Assert DB state after `MEMBER`:

```sql
select visibility, is_public, published_at
from public_session_publications
where session_id = '<session-id>'
```

Expected values:

```text
visibility = MEMBER
is_public = false
published_at = null
```

Then save `PUBLIC` and assert:

```text
visibility = PUBLIC
is_public = true
published_at is not null
```

Then save `HOST_ONLY` and assert:

```text
visibility = HOST_ONLY
is_public = false
published_at = null
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: FAIL because `visibility` is not accepted or returned yet.

- [ ] **Step 3: Update application models**

In `SessionApplicationModels.kt`, add:

```kotlin
enum class SessionRecordVisibility {
    HOST_ONLY,
    MEMBER,
    PUBLIC,
}
```

Change `HostSessionPublication` to:

```kotlin
data class HostSessionPublication(
    val publicSummary: String,
    val visibility: SessionRecordVisibility,
)
```

Change `HostPublicationResponse` to:

```kotlin
data class HostPublicationResponse(
    val sessionId: String,
    val publicSummary: String,
    val visibility: SessionRecordVisibility,
)
```

- [ ] **Step 4: Update the command**

In `HostSessionCommands.kt`, change:

```kotlin
data class UpsertPublicationCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val publicSummary: String,
    val visibility: SessionRecordVisibility,
)
```

Add the required import from `com.readmates.session.application.SessionRecordVisibility`.

- [ ] **Step 5: Update the controller request**

In `PublicationController.kt`, change `PublicationRequest` to:

```kotlin
data class PublicationRequest(
    @field:NotBlank val publicSummary: String,
    val visibility: SessionRecordVisibility,
) {
    fun toCommand(host: CurrentMember, sessionId: UUID): UpsertPublicationCommand =
        UpsertPublicationCommand(host, sessionId, publicSummary.trim(), visibility)
}
```

Add the required import for `SessionRecordVisibility`.

- [ ] **Step 6: Update host persistence write path**

In `JdbcHostSessionWriteAdapter.upsertHostPublication`, compute:

```kotlin
val isPublic = command.visibility == SessionRecordVisibility.PUBLIC
```

Update the insert columns to include `visibility`:

```sql
insert into public_session_publications (
  id,
  club_id,
  session_id,
  public_summary,
  is_public,
  visibility,
  published_at
)
values (
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  case when ? then utc_timestamp(6) else null end
)
on duplicate key update
  public_summary = values(public_summary),
  is_public = values(is_public),
  visibility = values(visibility),
  published_at = values(published_at),
  updated_at = utc_timestamp(6)
```

Bind parameters in this order:

```kotlin
UUID.randomUUID().dbString(),
command.host.clubId.dbString(),
command.sessionId.dbString(),
command.publicSummary,
isPublic,
command.visibility.name,
isPublic,
```

Remove the block that updates `sessions.state` to `PUBLISHED`.

- [ ] **Step 7: Update host persistence read path**

In `findHostSessionPublication`, select `visibility`:

```sql
select
  public_summary,
  visibility
from public_session_publications
where session_id = ?
  and club_id = ?
limit 1
```

Map it with:

```kotlin
HostSessionPublication(
    publicSummary = resultSet.getString("public_summary"),
    visibility = SessionRecordVisibility.valueOf(resultSet.getString("visibility")),
)
```

- [ ] **Step 8: Run host DB tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "feat: save host session record visibility"
```

Expected: commit includes only server publication API/model/persistence/test changes.

---

## Task 3: Update Public API Visibility Rules

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`

- [ ] **Step 1: Add failing public visibility tests**

In `PublicControllerDbTest`, replace the old non-public test with three cases:

1. `PUBLIC + OPEN` is visible in `/api/public/club`.
2. `MEMBER + PUBLISHED` is hidden from `/api/public/club` and `/api/public/sessions/{sessionId}`.
3. `HOST_ONLY + PUBLISHED` is hidden from `/api/public/club` and `/api/public/sessions/{sessionId}`.

Use deterministic UUIDs under the existing test cleanup pattern. Insert publication rows with the new column:

```sql
insert into public_session_publications (
  id, club_id, session_id, public_summary, is_public, visibility, published_at
)
values (
  '00000000-0000-0000-0000-000000001998',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000998',
  '외부 공개 테스트 요약입니다.',
  true,
  'PUBLIC',
  '2026-04-25 00:00:00.000000'
);
```

- [ ] **Step 2: Run failing public tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest
```

Expected: FAIL because public queries still require `sessions.state = 'PUBLISHED'` and `is_public = true`.

- [ ] **Step 3: Update public detail query**

In `JdbcPublicQueryAdapter.loadSession`, replace:

```sql
and sessions.state = 'PUBLISHED'
and public_session_publications.is_public = true
```

with:

```sql
and public_session_publications.visibility = 'PUBLIC'
```

- [ ] **Step 4: Update public stats queries**

In both `sessions` and `books` stat queries, replace:

```sql
and sessions.state = 'PUBLISHED'
and public_session_publications.is_public = true
```

with:

```sql
and public_session_publications.visibility = 'PUBLIC'
```

- [ ] **Step 5: Update public list query**

In `publicSessions`, replace:

```sql
and sessions.state = 'PUBLISHED'
and public_session_publications.is_public = true
```

with:

```sql
and public_session_publications.visibility = 'PUBLIC'
```

- [ ] **Step 6: Run public DB tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest
```

Expected: PASS. Existing seed count should remain 6 unless the test inserts an additional public row inside its own test method.

- [ ] **Step 7: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
git commit -m "feat: expose public records by visibility"
```

Expected: commit includes public query and public DB test changes.

---

## Task 4: Update Member Archive Visibility Rules

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt` only if existing detail coverage lives there.

- [ ] **Step 1: Add failing member visibility tests**

Add DB tests that seed three sessions with publication rows:

```text
HOST_ONLY summary: should not appear in member archive detail publicSummary
MEMBER summary: should appear in member archive detail publicSummary
PUBLIC summary: should appear in member archive detail publicSummary
```

For archive list `published` boolean, assert:

```text
HOST_ONLY -> published = false
MEMBER -> published = false
PUBLIC -> published = true
```

Use `GET /api/archive/sessions/{sessionId}` with an active member user, for example:

```kotlin
mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000998") {
    with(user("member5@example.com"))
}
```

- [ ] **Step 2: Run failing archive tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest
```

Expected: FAIL because member detail still requires `is_public = true`.

- [ ] **Step 3: Update archive list query**

In `loadArchiveSessions`, replace:

```sql
coalesce(public_session_publications.is_public, false) as published
```

with:

```sql
coalesce(public_session_publications.visibility = 'PUBLIC', false) as published
```

Update the `group by` item from:

```sql
public_session_publications.is_public
```

to:

```sql
public_session_publications.visibility
```

- [ ] **Step 4: Update archive detail summary query**

In `loadArchiveSessionDetail`, replace:

```sql
case
  when coalesce(public_session_publications.is_public, false)
    then public_session_publications.public_summary
  else null
end as public_summary
```

with:

```sql
case
  when public_session_publications.visibility in ('MEMBER', 'PUBLIC')
    then public_session_publications.public_summary
  else null
end as public_summary
```

- [ ] **Step 5: Run archive DB tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt server/src/test/kotlin/com/readmates/archive/api
git commit -m "feat: show member-visible session records in archive"
```

Expected: commit includes archive query and tests only.

---

## Task 5: Update Frontend Contracts And Model Helpers

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/model/host-session-editor-model.ts`
- Modify: `front/tests/unit/api-contract-fixtures.ts`
- Modify: `front/tests/unit/host-session-editor-model.test.ts`

- [ ] **Step 1: Add failing model tests**

Update `host-session-editor-model.test.ts` expectations:

```ts
expect(initialRecordVisibility(null)).toBe("HOST_ONLY");
expect(initialPublicationSummary(null)).toBe("");
expect(buildPublicationRequest("  기록 요약입니다.  ", "MEMBER")).toEqual({
  publicSummary: "기록 요약입니다.",
  visibility: "MEMBER",
});
expect(buildPublicationRequest("   ", "PUBLIC")).toBeNull();
expect(recordVisibilityLabel("HOST_ONLY")).toBe("호스트 전용");
expect(recordVisibilityLabel("MEMBER")).toBe("멤버 공개");
expect(recordVisibilityLabel("PUBLIC")).toBe("외부 공개");
```

Expected: FAIL because helpers do not exist and old helpers still use `isPublic`.

- [ ] **Step 2: Update host contracts**

In `host-contracts.ts`, replace old publication types with:

```ts
export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

export type HostSessionPublication = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};

export type HostSessionPublicationRequest = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};
```

- [ ] **Step 3: Update model types and helpers**

In `host-session-editor-model.ts`, replace:

```ts
export type HostSessionPublicationMode = "internal" | "draft" | "public";
export type HostSessionPublicationAction = "draft" | "public";
```

with:

```ts
export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";
```

Add helpers:

```ts
export function initialRecordVisibility(
  session?: Pick<HostSessionEditorSession, "publication"> | null,
): SessionRecordVisibility {
  return session?.publication?.visibility ?? "HOST_ONLY";
}

export function recordVisibilityLabel(visibility: SessionRecordVisibility) {
  if (visibility === "MEMBER") {
    return "멤버 공개";
  }

  if (visibility === "PUBLIC") {
    return "외부 공개";
  }

  return "호스트 전용";
}

export function recordVisibilityDescription(visibility: SessionRecordVisibility) {
  if (visibility === "MEMBER") {
    return "멤버 앱 안에서 볼 수 있지만 공개 기록 목록에는 나오지 않습니다.";
  }

  if (visibility === "PUBLIC") {
    return "멤버 앱과 공개 기록 목록에 표시됩니다.";
  }

  return "호스트 편집 화면에서만 볼 수 있습니다.";
}
```

Change `buildPublicationRequest` signature to:

```ts
export function buildPublicationRequest(
  summary: string,
  visibility: SessionRecordVisibility,
): HostSessionPublicationRequest | null {
  const publicSummary = summary.trim();
  if (!publicSummary) {
    return null;
  }

  return {
    publicSummary,
    visibility,
  };
}
```

- [ ] **Step 4: Update fixtures**

In `api-contract-fixtures.ts`, change:

```ts
export const hostSessionPublicationContractFixture = {
  publicSummary: "데이터를 읽는 태도와 대화의 균형을 공개 요약으로 남겼습니다.",
  visibility: "PUBLIC",
} satisfies HostSessionPublication;
```

- [ ] **Step 5: Run model tests**

Run:

```bash
pnpm --dir front test -- host-session-editor-model
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add front/features/host/api/host-contracts.ts front/features/host/model/host-session-editor-model.ts front/tests/unit/api-contract-fixtures.ts front/tests/unit/host-session-editor-model.test.ts
git commit -m "feat: model host record visibility on frontend"
```

Expected: commit includes frontend contract/model/test changes only.

---

## Task 6: Replace Host Editor Publication UI

**Files:**
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Replace old publication tests with these expectations:

```ts
expect(screen.getByRole("heading", { name: "기록 공개 범위" })).toBeVisible();
expect(screen.getByLabelText("기록 요약")).toHaveValue("저장된 공개 요약입니다.");
expect(screen.getByRole("radio", { name: /호스트 전용/ })).toBeVisible();
expect(screen.getByRole("radio", { name: /멤버 공개/ })).toBeChecked();
expect(screen.getByRole("radio", { name: /외부 공개/ })).toBeVisible();
expect(screen.getByRole("button", { name: "저장" })).toBeVisible();
expect(screen.queryByRole("button", { name: "요약 초안 저장" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "공개 기록 발행" })).not.toBeInTheDocument();
```

Add save interaction:

```ts
await user.type(screen.getByLabelText("기록 요약"), "멤버에게 공유할 기록입니다.");
await user.click(screen.getByRole("radio", { name: /멤버 공개/ }));
await user.click(screen.getByRole("button", { name: "저장" }));

expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/host/sessions/session-1/publication",
  expect.objectContaining({
    method: "PUT",
    body: JSON.stringify({
      publicSummary: "멤버에게 공유할 기록입니다.",
      visibility: "MEMBER",
    }),
  }),
);
expect(await screen.findByRole("status")).toHaveTextContent("기록 공개 범위를 저장했습니다.");
```

Add validation expectation:

```ts
await user.click(screen.getByRole("button", { name: "저장" }));
expect(await screen.findByRole("alert")).toHaveTextContent("기록 요약을 입력한 뒤 저장해주세요.");
expect(fetchMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
pnpm --dir front test -- host-session-editor
```

Expected: FAIL because old UI is still rendered.

- [ ] **Step 3: Update imports and state**

In `host-session-editor.tsx`, replace old publication mode/action imports with:

```ts
  buildPublicationRequest,
  initialPublicationSummary,
  initialRecordVisibility,
  recordVisibilityDescription,
  recordVisibilityLabel,
  type SessionRecordVisibility,
```

Replace state:

```ts
const [recordVisibility, setRecordVisibility] = useState<SessionRecordVisibility>(() => initialRecordVisibility(session));
const [summary, setSummary] = useState(() => initialPublicationSummary(session));
const [recordSaveInFlight, setRecordSaveInFlight] = useState(false);
const [publicationFeedback, setPublicationFeedback] = useState<PublicationFeedback | null>(null);
```

- [ ] **Step 4: Replace save handler**

Use one save handler:

```ts
const savePublication = async () => {
  if (!session || recordSaveInFlight) {
    return;
  }

  const publicationRequest = buildPublicationRequest(summary, recordVisibility);

  if (!publicationRequest) {
    setPublicationFeedback({
      tone: "error",
      message: "기록 요약을 입력한 뒤 저장해주세요.",
    });
    return;
  }

  setRecordSaveInFlight(true);
  setPublicationFeedback(null);

  try {
    const response = await actions.savePublication(session.sessionId, publicationRequest);

    if (!response.ok) {
      setPublicationFeedback({
        tone: "error",
        message:
          response.status === 400
            ? "기록 요약을 입력한 뒤 저장해주세요."
            : "기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
      });
      return;
    }

    setSummary(publicationRequest.publicSummary);
    setRecordVisibility(publicationRequest.visibility);
    setPublicationFeedback({
      tone: "success",
      message: "기록 공개 범위를 저장했습니다.",
    });
  } catch {
    setPublicationFeedback({
      tone: "error",
      message: "기록 공개 범위 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    });
  } finally {
    setRecordSaveInFlight(false);
  }
};
```

- [ ] **Step 5: Replace panel UI**

Change panel heading from `공개 기록 발행` to `기록 공개 범위`. Change textarea label from `공개 요약` to `기록 요약`.

Render a radio group:

```tsx
<fieldset className="stack" style={{ "--stack": "10px" } as CSSProperties}>
  <legend className="label">공개 범위</legend>
  {(["HOST_ONLY", "MEMBER", "PUBLIC"] as const).map((visibility) => (
    <label key={visibility} className="choice-card">
      <input
        type="radio"
        name="record-visibility"
        value={visibility}
        checked={recordVisibility === visibility}
        disabled={!session || recordSaveInFlight}
        onChange={() => setRecordVisibility(visibility)}
      />
      <span>
        <span className="body">{recordVisibilityLabel(visibility)}</span>
        <span className="tiny">{recordVisibilityDescription(visibility)}</span>
      </span>
    </label>
  ))}
</fieldset>
```

If `choice-card` does not exist in CSS, use the local inline style pattern already used by the current status cards. Do not create nested cards.

Render one button:

```tsx
<button
  type="button"
  className="btn btn-primary"
  disabled={!session || recordSaveInFlight}
  aria-describedby={!session ? "publication-disabled-reason" : undefined}
  onClick={() => void savePublication()}
>
  {recordSaveInFlight ? "저장하는 중" : "저장"}
</button>
```

For unsaved sessions, use this guidance:

```text
세션을 만든 뒤 기록 요약과 공개 범위를 저장할 수 있습니다.
```

- [ ] **Step 6: Update side-panel status text**

Where the side panel currently says publication mode, map:

```ts
value: session?.publication ? recordVisibilityLabel(recordVisibility) : "기록 없음"
```

Use a neutral badge for `HOST_ONLY`, accent badge for `MEMBER`, ok/accent badge for `PUBLIC`. Preserve existing badge class patterns.

- [ ] **Step 7: Run UI tests**

Run:

```bash
pnpm --dir front test -- host-session-editor
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add front/features/host/components/host-session-editor.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: simplify host record visibility editor"
```

Expected: commit includes host editor component and tests.

---

## Task 7: Contract Fixture And Boundary Verification

**Files:**
- Modify only if tests require it: `front/tests/unit/api-contract-fixtures.test.ts`
- Modify only if import boundary tests expose a regression: touched frontend files.

- [ ] **Step 1: Run API fixture tests**

Run:

```bash
pnpm --dir front test -- api-contract-fixtures
```

Expected: PASS. If this fails because fixture response shape changed, update fixture assertions to expect `visibility` and not `isPublic`.

- [ ] **Step 2: Run frontend boundary tests**

Run:

```bash
pnpm --dir front test -- frontend-boundaries
```

Expected: PASS. If this fails, move any helper that imports React/router/API client out of `model`, or move UI-only helpers back into the component.

- [ ] **Step 3: Commit if files changed**

If this task changed files, run:

```bash
git add front/tests/unit/api-contract-fixtures.test.ts front/features/host
git commit -m "test: align visibility fixtures and frontend boundaries"
```

Expected: commit only when file changes exist.

---

## Task 8: Full Relevant Verification

**Files:**
- No product files unless verification reveals failures that require fixes.

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 3: Run E2E only if user-flow or BFF behavior changed beyond existing route calls**

The endpoint path remains the same and no auth/BFF code changes are required. If implementation changes route/auth/BFF behavior anyway, run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 4: Manual local smoke test**

Start the backend and frontend in the usual local setup, then verify:

1. Host opens `/app/host/sessions/{sessionId}/edit`.
2. Host enters a record summary, selects `외부 공개`, and clicks `저장`.
3. `/records` shows the session even if the session state is `OPEN`.
4. Host changes the same session to `멤버 공개` and clicks `저장`.
5. `/records` no longer shows the session.
6. Member archive detail still shows the summary.
7. Host changes the same session to `호스트 전용` and clicks `저장`.
8. Member archive detail no longer shows the summary.

- [ ] **Step 5: Final diff review**

Run:

```bash
git status --short --untracked-files=all
git diff --stat HEAD~8..HEAD
```

Expected: only intended server migration/model/API/query/test and frontend host UI/model/test files changed.

- [ ] **Step 6: Final commit if verification fixes were needed**

If verification required fixes, commit them with:

```bash
git add <fixed-files>
git commit -m "fix: stabilize session record visibility rollout"
```

Expected: final branch is clean after commit.

---

## Rollback Notes

If deployment must roll back after `V14` is applied:

- Old code can continue reading `is_public` because the column remains.
- New code writes both `visibility` and `is_public`.
- Rolling back application code before database cleanup is safe.
- Do not drop `is_public` in this implementation.
- Do not ship a cleanup migration until the visibility-based application has been deployed and verified.

## Self-Review Checklist

- [ ] Every design goal has a task: host UI, server enum, DB migration, public API, member API, tests.
- [ ] No task requires table renaming, audit logs, generated summaries, or route restructuring.
- [ ] `PUBLIC` is the only public API exposure state.
- [ ] `MEMBER` and `PUBLIC` are the only member archive exposure states.
- [ ] `HOST_ONLY` is visible only to host session edit.
- [ ] `sessions.state` is not used as the public exposure source of truth.
- [ ] Existing `is_public` compatibility column is kept and synchronized.
- [ ] Verification includes server clean test, frontend lint, frontend test, and frontend build.
