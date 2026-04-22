# ReadMates Seed Dev Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local ReadMates usable with real seed data, dev login, archived sessions 1-6, and host-created session 7.

**Architecture:** Keep the existing two-tier shape. Spring Boot owns seed data, authentication, role checks, and database-backed read/write APIs using focused JDBC repositories; Next.js uses thin BFF route handlers and existing visual components receive API-shaped data instead of hardcoded sample arrays.

**Tech Stack:** Kotlin, Spring Boot 4, Spring Security, Spring JDBC, Flyway, PostgreSQL, JUnit 5, MockMvc, Next.js App Router, React, TypeScript, Vitest, Playwright.

---

## Current Status Refresh: 2026-04-19

This plan has been checked against the current codebase.

- Status: completed. All tasks in this plan are checked off.
- The unchecked-looking `Expected: FAIL ...` statements below are historical TDD checkpoints, not current failures.
- The latest question policy is `priority` 1-5. That is the current implementation, not a legacy edit.
- Before this documentation refresh, the only working-tree changes were documentation edits in `docs/superpowers/plans` and `docs/superpowers/specs`; there were no unstaged code changes.
- The seed/dev-login runtime path is current: seed sessions 1-6 are `PUBLISHED`, there is no seeded open session, and the first host-created clean-session flow creates session 7.

Implemented by this plan:

- Dev-only Flyway seed loading and dev login.
- Active member lookup from the authenticated email.
- Role mapping for seeded HOST/MEMBER memberships.
- DB-backed current session lookup.
- DB-backed host session creation.
- DB-backed RSVP, reading check-in, and question writes.
- DB-backed archive session list, notes feed, and my page profile/attendance count.
- Frontend BFF proxy and focused page wiring for the local demo flow.

Still outside or partial after this plan:

- The later real-data wiring pass completed public `/api/public/**` pages, current-session saved check-in/question reads, shared board hydration, one-line/long review persistence, host dashboard/session/attendance/publication DB wiring, report metadata and scoped access, archive side tabs, and My page report lists.
- Current code still leaves invitation preview as a fixed sample response; full invitation acceptance is not wired to a controller.
- Feedback HTML generation remains manual upload only; there is no automatic report generator.

## File Map

### Backend

- Input: `docs/superpowers/specs/2026-04-19-readmates-seeded-questions.md` - exact source for all historical prepared questions.
- Create: `server/src/main/resources/application-dev.yml` - dev-only Flyway locations and dev login settings.
- Create: `server/src/main/resources/db/migration/V4__allow_five_questions.sql` - change `questions.priority` database check from 1-3 to 1-5.
- Create: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` - idempotent seed for club, users, memberships, sessions 1-6, participants, summaries, highlights, and the prepared questions source.
- Create: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt` - authenticated member context and resolver.
- Create: `server/src/main/kotlin/com/readmates/shared/security/AccessDeniedException.kt` - small exception for role failures.
- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt` - JDBC lookup for seeded users and memberships.
- Create: `server/src/main/kotlin/com/readmates/auth/api/DevLoginController.kt` - local-only login/logout endpoints.
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt` - return real auth/member payload.
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt` - gate dev login, preserve OAuth, apply role-safe API protection.
- Create: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt` - JDBC current session, participant, RSVP, and session creation operations.
- Modify: `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt` - return database-backed current session or empty state.
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt` - create session 7 and participant rows.
- Modify: `server/src/main/kotlin/com/readmates/session/api/RsvpController.kt` - persist current member RSVP.
- Modify: `server/src/main/kotlin/com/readmates/note/api/CheckinController.kt` - persist current member check-in.
- Modify: `server/src/main/kotlin/com/readmates/note/api/QuestionController.kt` - persist current member question and validate priority 1-5.
- Create: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt` - JDBC archive and notes feed read models.
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt` - return sessions 1-6 from DB.
- Modify: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt` - return seeded notes from DB.
- Modify: `server/src/main/kotlin/com/readmates/archive/api/MyPageController.kt` - return current member stats from DB.
- Test: `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

### Frontend

- Create: `front/shared/api/readmates.ts` - typed fetch helpers and shared response types.
- Create: `front/app/api/bff/[...path]/route.ts` - generic BFF proxy to Spring Boot with cookie relay.
- Modify: `front/features/auth/components/login-card.tsx` - show dev account chooser when enabled.
- Modify: `front/app/(app)/app/page.tsx` - fetch auth/current session and pass data to home.
- Modify: `front/features/member-home/components/member-home.tsx` - render empty/current session states from props.
- Modify: `front/app/(app)/app/session/current/page.tsx` - fetch current session.
- Modify: `front/features/current-session/components/current-session.tsx` - render empty state and API-backed current session.
- Modify: `front/features/current-session/actions/update-rsvp.ts` - call BFF current-session endpoint.
- Modify: `front/features/current-session/actions/save-checkin.ts` - call BFF current-session endpoint.
- Modify: `front/features/current-session/actions/save-question.ts` - call BFF current-session endpoint.
- Modify: `front/app/(app)/app/archive/page.tsx` and `front/features/archive/components/archive-page.tsx` - render API sessions.
- Modify: `front/app/(app)/app/notes/page.tsx` and `front/features/archive/components/notes-feed-page.tsx` - render API feed.
- Modify: `front/app/(app)/app/me/page.tsx` and `front/features/archive/components/my-page.tsx` - render current member profile.
- Modify: `front/app/(app)/app/host/page.tsx` and `front/features/host/components/host-dashboard.tsx` - render host-only create-session CTA.
- Modify: `front/features/host/components/host-session-editor.tsx` - POST real session creation for `/app/host/sessions/new`.
- Test: `front/tests/unit/login-card.test.tsx`
- Test: `front/tests/unit/current-session.test.tsx`
- Test: `front/tests/unit/archive-page.test.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`
- Test: `front/tests/e2e/dev-login-session-flow.spec.ts`

## Delivery Notes

- Execute tasks in order. Each backend task should pass its focused tests before moving on.
- Keep all dev login behavior behind `readmates.dev.login-enabled=true`.
- Do not add DB columns in this plan.
- Keep controllers thin. Database access belongs in focused repository/application files.
- Keep existing visual layout unless data requirements force a small empty-state section.

## Task 1: Add Dev Seed Data

**Files:**
- Read: `docs/superpowers/specs/2026-04-19-readmates-seeded-questions.md`
- Create: `server/src/main/resources/application-dev.yml`
- Create: `server/src/main/resources/db/migration/V4__allow_five_questions.sql`
- Create: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

- [x] **Step 1: Add the failing database-backed archive seed test**

Create `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`:

```kotlin
package com.readmates.archive.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
        "readmates.dev.login-enabled=true",
    ],
)
@AutoConfigureMockMvc(addFilters = false)
class ArchiveAndNotesDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns the six seeded archive sessions newest first`() {
        mockMvc.get("/api/archive/sessions")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(6) }
                jsonPath("$[0].sessionNumber") { value(6) }
                jsonPath("$[0].bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$[5].sessionNumber") { value(1) }
                jsonPath("$[5].bookTitle") { value("팩트풀니스") }
            }
    }

    @Test
    fun `returns seeded notes feed items`() {
        mockMvc.get("/api/notes/feed")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].kind") { exists() }
                jsonPath("$[0].text") { isNotEmpty() }
                jsonPath("$[?(@.text == '10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요? 그리고 왜 그 본능이 유독 자신에게 강하게 나타난다고 생각하나요?')]") { exists() }
            }
    }
}
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: FAIL because the dev seed file and DB-backed archive/notes queries do not exist.

- [x] **Step 3: Add dev Flyway configuration**

Create `server/src/main/resources/application-dev.yml`:

```yaml
spring:
  flyway:
    locations: classpath:db/migration,classpath:db/dev

readmates:
  dev:
    login-enabled: true
```

- [x] **Step 4: Add the migration that allows five questions**

Create `server/src/main/resources/db/migration/V4__allow_five_questions.sql`:

```sql
alter table questions
  drop constraint questions_priority_check;

alter table questions
  add constraint questions_priority_check check (priority between 1 and 5);
```

- [x] **Step 5: Add idempotent seed SQL**

Create `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` with deterministic ids:

```sql
insert into clubs (id, slug, name, tagline, about)
values (
  '00000000-0000-0000-0000-000000000001',
  'reading-sai',
  '읽는사이',
  '읽고 돌아와 서로의 생각을 듣는 독서모임',
  '읽는사이는 매달 한 권의 책을 읽고 질문, 감상, 대화를 조용히 쌓아가는 독서모임입니다.'
)
on conflict (id) do update
set slug = excluded.slug,
    name = excluded.name,
    tagline = excluded.tagline,
    about = excluded.about,
    updated_at = now();

insert into users (id, google_subject_id, email, name, profile_image_url)
values
  ('00000000-0000-0000-0000-000000000101', 'dev-google-wooseung', 'host@example.com', '김호스트', null),
  ('00000000-0000-0000-0000-000000000102', 'dev-google-ansungjin', 'member1@example.com', '안멤버1', null),
  ('00000000-0000-0000-0000-000000000103', 'dev-google-sangheon', 'member2@example.com', '최멤버2', null),
  ('00000000-0000-0000-0000-000000000104', 'dev-google-samee', 'member3@example.com', '김멤버3', null),
  ('00000000-0000-0000-0000-000000000105', 'dev-google-mingeun', 'member4@example.com', '송멤버4', null),
  ('00000000-0000-0000-0000-000000000106', 'dev-google-suhan', 'member5@example.com', '이멤버5', null)
on conflict (id) do update
set google_subject_id = excluded.google_subject_id,
    email = excluded.email,
    name = excluded.name,
    profile_image_url = excluded.profile_image_url,
    updated_at = now();

insert into memberships (id, club_id, user_id, role, status, joined_at)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'HOST', 'ACTIVE', '2025-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'MEMBER', 'ACTIVE', '2025-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'MEMBER', 'ACTIVE', '2025-12-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'MEMBER', 'ACTIVE', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000105', 'MEMBER', 'ACTIVE', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000106', 'MEMBER', 'ACTIVE', '2025-11-01T00:00:00Z')
on conflict (id) do update
set role = excluded.role,
    status = excluded.status,
    joined_at = excluded.joined_at,
    updated_at = now();

insert into sessions (
  id, club_id, number, title, book_title, book_author, book_translator, book_link,
  session_date, start_time, end_time, location_label, question_deadline_at, state
)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 1, '1회차 모임 · 팩트풀니스', '팩트풀니스', '한스 로슬링', null, null, '2025-11-26', '19:42', '21:46', 'online · Zoom', '2025-11-25T14:59:00Z', 'PUBLISHED'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 2, '2회차 모임 · 냉정한 이타주의자', '냉정한 이타주의자', '윌리엄 맥어스킬', null, null, '2025-12-17', '20:07', '21:51', 'online · Zoom', '2025-12-16T14:59:00Z', 'PUBLISHED'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 3, '3회차 모임 · 우리가 겨울을 지나온 방식', '우리가 겨울을 지나온 방식', '문미순', null, null, '2026-01-21', '20:13', '21:59', 'online · Zoom', '2026-01-20T14:59:00Z', 'PUBLISHED'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001', 4, '4회차 모임 · 내 안에서 나를 만드는 것들', '내 안에서 나를 만드는 것들', '러셀 로버츠', null, null, '2026-02-25', '19:59', '22:37', 'online · Zoom', '2026-02-24T14:59:00Z', 'PUBLISHED'),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000001', 5, '5회차 모임 · 지대넓얕 무한', '지대넓얕 무한', '채사장', null, null, '2026-03-18', '20:01', '22:19', 'online · Zoom', '2026-03-17T14:59:00Z', 'PUBLISHED'),
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000001', 6, '6회차 모임 · 가난한 찰리의 연감', '가난한 찰리의 연감', '찰리 멍거', null, null, '2026-04-15', '20:01', '22:08', 'online · Zoom', '2026-04-14T14:59:00Z', 'PUBLISHED')
on conflict (club_id, number) do update
set title = excluded.title,
    book_title = excluded.book_title,
    book_author = excluded.book_author,
    session_date = excluded.session_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    location_label = excluded.location_label,
    question_deadline_at = excluded.question_deadline_at,
    state = excluded.state,
    updated_at = now();

insert into public_session_publications (id, club_id, session_id, public_summary, is_public, published_at)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '팩트풀니스를 읽고 데이터, 평균, 본능이 사람과 세계를 이해하는 방식을 어떻게 바꾸는지 이야기했다.', true, '2025-11-27T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', '냉정한 이타주의자를 통해 효율, 감정, 지속 가능한 선의 기준을 각자의 삶에 비추어 보았다.', true, '2025-12-18T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', '우리가 겨울을 지나온 방식에서는 돌봄, 가족, 소설의 몰입이 주는 불편함과 힘을 나누었다.', true, '2026-01-22T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000304', '내 안에서 나를 만드는 것들을 읽고 공정한 관찰자, 도덕 감정, 타인의 시선이 나를 구성하는 방식을 토론했다.', true, '2026-02-26T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000305', '지대넓얕 무한을 읽고 의식, 신념, 종교적 세계관을 이해하는 각자의 기준을 점검했다.', true, '2026-03-19T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000306', '가난한 찰리의 연감에서는 투자, 전기, 다학문적 사고, 뒤집기와 실패 회피의 태도를 중심으로 이야기했다.', true, '2026-04-16T00:00:00Z')
on conflict (session_id) do update
set public_summary = excluded.public_summary,
    is_public = excluded.is_public,
    published_at = excluded.published_at,
    updated_at = now();
```

Append participant rows in the same file using this exact pattern:

```sql
insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
select
  gen_random_uuid(),
  s.club_id,
  s.id,
  m.id,
  case
    when (s.number = 1 and u.email in ('host@example.com', 'member5@example.com', 'member1@example.com')) then 'GOING'
    when (s.number = 2 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com')) then 'GOING'
    when (s.number = 3 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com', 'member1@example.com', 'member4@example.com', 'member3@example.com')) then 'GOING'
    when (s.number = 4 and u.email in ('host@example.com', 'member2@example.com', 'member4@example.com', 'member3@example.com')) then 'GOING'
    when (s.number = 5 and u.email in ('host@example.com', 'member2@example.com', 'member4@example.com', 'member1@example.com')) then 'GOING'
    when (s.number = 6 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com')) then 'GOING'
    else 'DECLINED'
  end,
  case
    when (s.number = 1 and u.email in ('host@example.com', 'member5@example.com', 'member1@example.com')) then 'ATTENDED'
    when (s.number = 2 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com')) then 'ATTENDED'
    when (s.number = 3 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com', 'member1@example.com', 'member4@example.com', 'member3@example.com')) then 'ATTENDED'
    when (s.number = 4 and u.email in ('host@example.com', 'member2@example.com', 'member4@example.com', 'member3@example.com')) then 'ATTENDED'
    when (s.number = 5 and u.email in ('host@example.com', 'member2@example.com', 'member4@example.com', 'member1@example.com')) then 'ATTENDED'
    when (s.number = 6 and u.email in ('host@example.com', 'member5@example.com', 'member2@example.com')) then 'ATTENDED'
    else 'ABSENT'
  end
from sessions s
cross join memberships m
join users u on u.id = m.user_id
where s.club_id = '00000000-0000-0000-0000-000000000001'
  and m.club_id = s.club_id
  and s.number between 1 and 6
on conflict (session_id, membership_id) do update
set rsvp_status = excluded.rsvp_status,
    attendance_status = excluded.attendance_status,
    updated_at = now();
```

Use `insert ... on conflict` for highlight rows with corrected club ids:

```sql
insert into highlights (id, club_id, session_id, text, sort_order)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '평균과 데이터가 세계를 설명할 때 놓치는 극단의 사례를 어떻게 볼 것인가.', 1),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', '효율만으로 삶의 선택을 재단할 수 있는가.', 1),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000306', '실패를 피하는 방식으로 성공을 정의할 수 있는가.', 1)
on conflict (session_id, sort_order) do update
set text = excluded.text,
    updated_at = now();
```

Use the prepared questions in `docs/superpowers/specs/2026-04-19-readmates-seeded-questions.md` as the exact seed source. For each session/member, insert the first five questions into `questions` with priorities 1-5. When a member has more than five questions in one session, insert the remaining question text into `long_reviews` with `visibility = 'PRIVATE'` and a body prefix of `질문 메모: `.

The question rows must use this shape:

```sql
insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
values
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    1,
    '10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요? 그리고 왜 그 본능이 유독 자신에게 강하게 나타난다고 생각하나요?',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    2,
    '책을 읽으면서 "내가 세상을 오해해왔구나" 하고 깨달은 순간이 있었나요? 구체적으로 어떤 부분에서 자신의 판단이 편향되어 있었다는 걸 발견했나요?',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    3,
    '"사실과 데이터에 기반한 사고"의 중요성에 대해 모두 공감하지만, 실제로 일상에서 실천하기는 쉽지 않습니다. 여러분은 정보를 접할 때 어떤 방식으로 사실을 확인하고 검증하나요?',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000604',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    4,
    '"겸손과 호기심의 태도"가 중요하다고 했는데, 자신의 생각이나 판단이 틀렸을 수 있다는 것을 인정하기가 왜 어려울까요? 이런 태도를 기르려면 어떻게 해야 할까요?',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000605',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    5,
    '책을 읽고 난 후, 세상을 바라보는 방식에서 작은 변화라도 생겼나요?',
    null
  )
on conflict (session_id, membership_id, priority) do update
set text = excluded.text,
    draft_thought = excluded.draft_thought,
    updated_at = now();
```

Continue the same id pattern for the rest of the source document:

- question ids: `00000000-0000-0000-0000-0000000006xx` through `00000000-0000-0000-0000-0000000008xx`
- overflow long review ids for any future 6th-or-later question: `00000000-0000-0000-0000-0000000009xx`
- session ids: 1회차 `...0301`, 2회차 `...0302`, 3회차 `...0303`, 4회차 `...0304`, 5회차 `...0305`, 6회차 `...0306`
- membership ids: 호스트 `...0201`, 멤버1 `...0202`, 멤버2 `...0203`, 멤버3 `...0204`, 멤버4 `...0205`, 멤버5 `...0206`

Add one-line reviews and check-ins after the question rows so every feed filter has data:

```sql
insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000206', '데이터를 믿되, 평균 바깥의 사람을 잊지 않는 연습.', 'PUBLIC'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000203', '좋은 판단은 아는 것보다 모르는 것을 분명히 하는 데서 시작했다.', 'PUBLIC')
on conflict (session_id, membership_id) do update
set text = excluded.text,
    visibility = excluded.visibility,
    updated_at = now();

insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
values
  ('00000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 100, '질문을 다섯 개 준비했고 10가지 본능 중 내게 강한 것을 중심으로 읽었다.'),
  ('00000000-0000-0000-0000-000000001102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000206', 100, '뒤집기와 인센티브 구조에 대한 질문을 준비했다.')
on conflict (session_id, membership_id) do update
set reading_progress = excluded.reading_progress,
    note = excluded.note,
    updated_at = now();
```

- [x] **Step 6: Run Flyway-backed tests and capture the next failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: FAIL in controller assertions because `ArchiveController` and `NotesFeedController` still return hardcoded sample data.

- [x] **Step 7: Commit seed resources and failing coverage**

```bash
git add server/src/main/resources/application-dev.yml server/src/main/resources/db/migration/V4__allow_five_questions.sql server/src/main/resources/db/dev/R__readmates_dev_seed.sql server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "test: cover readmates dev seed data"
```

## Task 2: Add Current Member Resolution And Dev Login

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/security/AccessDeniedException.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/DevLoginController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`

- [x] **Step 1: Write dev login and auth-me tests**

Create `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`:

```kotlin
package com.readmates.auth.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
        "readmates.dev.login-enabled=true",
    ],
)
@AutoConfigureMockMvc
class DevLoginControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `logs in seeded host by email`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"host@example.com"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value("host@example.com") }
            jsonPath("$.role") { value("HOST") }
            jsonPath("$.shortName") { value("호스트") }
        }
    }

    @Test
    fun `rejects unknown dev login email`() {
        mockMvc.post("/api/dev/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"unknown@example.com"}"""
        }.andExpect {
            status { isUnauthorized() }
        }
    }
}
```

Replace the authenticated test in `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt` with DB-backed expectations:

```kotlin
@Test
fun `returns seeded member payload when session exists`() {
    mockMvc.get("/api/auth/me") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.email") { value("member5@example.com") }
        jsonPath("$.role") { value("MEMBER") }
        jsonPath("$.displayName") { value("이멤버5") }
        jsonPath("$.shortName") { value("멤버5") }
    }
}
```

- [x] **Step 2: Run auth tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
```

Expected: FAIL because dev login endpoint, account repository, and enriched auth-me response do not exist.

- [x] **Step 3: Implement account lookup and member context**

Create `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`:

```kotlin
package com.readmates.shared.security

import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import java.util.UUID

data class CurrentMember(
    val userId: UUID,
    val membershipId: UUID,
    val clubId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val role: String,
) {
    val isHost: Boolean get() = role == "HOST"
}

fun Authentication?.emailOrNull(): String? {
    if (this == null || !isAuthenticated) {
        return null
    }

    val principal = principal
    return when (principal) {
        is OidcUser -> principal.email
        is org.springframework.security.core.userdetails.UserDetails -> principal.username
        is String -> principal
        else -> name
    }?.lowercase()
}
```

Create `server/src/main/kotlin/com/readmates/shared/security/AccessDeniedException.kt`:

```kotlin
package com.readmates.shared.security

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.ResponseStatus

@ResponseStatus(HttpStatus.FORBIDDEN)
class AccessDeniedException(message: String) : RuntimeException(message)
```

Create `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`:

```kotlin
package com.readmates.auth.application

import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class MemberAccountRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun findCurrentMemberByEmail(email: String): CurrentMember? =
        jdbcTemplate.query(
            """
            select
              u.id as user_id,
              m.id as membership_id,
              m.club_id,
              u.email,
              u.name,
              m.role
            from users u
            join memberships m on m.user_id = u.id
            where lower(u.email) = lower(?)
              and m.status = 'ACTIVE'
            order by case when m.role = 'HOST' then 0 else 1 end
            limit 1
            """.trimIndent(),
            { rs, _ -> rs.toCurrentMember() },
            email,
        ).firstOrNull()

    private fun ResultSet.toCurrentMember(): CurrentMember {
        val displayName = getString("name")
        return CurrentMember(
            userId = getObject("user_id", UUID::class.java),
            membershipId = getObject("membership_id", UUID::class.java),
            clubId = getObject("club_id", UUID::class.java),
            email = getString("email"),
            displayName = displayName,
            shortName = shortName(displayName),
            role = getString("role"),
        )
    }

    private fun shortName(displayName: String): String =
        when (displayName) {
            "김호스트" -> "호스트"
            "안멤버1" -> "멤버1"
            "최멤버2" -> "멤버2"
            "김멤버3" -> "멤버3"
            "송멤버4" -> "멤버4"
            "이멤버5" -> "멤버5"
            else -> displayName
        }
}
```

- [x] **Step 4: Implement dev login controller**

Create `server/src/main/kotlin/com/readmates/auth/api/DevLoginController.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.MemberAccountRepository
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class DevLoginRequest(
    @field:NotBlank @field:Email val email: String,
)

data class AuthenticatedMemberResponse(
    val authenticated: Boolean,
    val userId: String?,
    val membershipId: String?,
    val clubId: String?,
    val email: String?,
    val displayName: String?,
    val shortName: String?,
    val role: String?,
)

@RestController
@RequestMapping("/api/dev")
@ConditionalOnProperty(prefix = "readmates.dev", name = ["login-enabled"], havingValue = "true")
class DevLoginController(
    private val memberAccountRepository: MemberAccountRepository,
) {
    @PostMapping("/login")
    fun login(
        @Valid @RequestBody request: DevLoginRequest,
        servletRequest: HttpServletRequest,
        servletResponse: HttpServletResponse,
    ): AuthenticatedMemberResponse {
        val member = memberAccountRepository.findCurrentMemberByEmail(request.email)
            ?: throw DevLoginRejectedException()

        val authentication = UsernamePasswordAuthenticationToken(
            member.email,
            "N/A",
            listOf(SimpleGrantedAuthority("ROLE_${member.role}")),
        )
        val context = SecurityContextHolder.createEmptyContext()
        context.authentication = authentication
        SecurityContextHolder.setContext(context)
        servletRequest.getSession(true).setAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            context,
        )

        return member.toResponse()
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(servletRequest: HttpServletRequest) {
        servletRequest.getSession(false)?.invalidate()
        SecurityContextHolder.clearContext()
    }
}

@ResponseStatus(HttpStatus.UNAUTHORIZED)
class DevLoginRejectedException : RuntimeException("Unknown dev login email")

fun com.readmates.shared.security.CurrentMember.toResponse() = AuthenticatedMemberResponse(
    authenticated = true,
    userId = userId.toString(),
    membershipId = membershipId.toString(),
    clubId = clubId.toString(),
    email = email,
    displayName = displayName,
    shortName = shortName,
    role = role,
)
```

- [x] **Step 5: Enrich AuthMeController**

Replace `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt` with:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.emailOrNull
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.security.core.Authentication

@RestController
@RequestMapping("/api/auth/me")
class AuthMeController(
    private val memberAccountRepository: MemberAccountRepository,
) {
    @GetMapping
    fun me(authentication: Authentication?): AuthenticatedMemberResponse {
        val email = authentication.emailOrNull()
            ?: return anonymous()

        val member = memberAccountRepository.findCurrentMemberByEmail(email)
            ?: return anonymous(email)

        return member.toResponse()
    }

    private fun anonymous(email: String? = null) = AuthenticatedMemberResponse(
        authenticated = false,
        userId = null,
        membershipId = null,
        clubId = null,
        email = email,
        displayName = null,
        shortName = null,
        role = null,
    )
}
```

- [x] **Step 6: Adjust security config**

Modify `SecurityConfig` so `/api/dev/**` is permitted only when the controller exists and CSRF is ignored for `/api/dev/**` and BFF-backed JSON APIs during local testing:

```kotlin
http
    .csrf { csrf ->
        csrf.ignoringRequestMatchers("/api/dev/**")
    }
    .authorizeHttpRequests {
        it.requestMatchers(
            "/internal/health",
            "/api/public/**",
            "/api/invitations/**",
            "/api/auth/me",
            "/api/dev/**",
            "/oauth2/**",
            "/login/oauth2/**",
        ).permitAll()
            .anyRequest().authenticated()
    }
```

- [x] **Step 7: Run auth tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
```

Expected: PASS.

- [x] **Step 8: Commit auth work**

```bash
git add server/src/main/kotlin/com/readmates/shared/security server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth
git commit -m "feat: add dev login and member auth payload"
```

## Task 3: Implement Current Session And Member Actions

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/RsvpController.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/api/CheckinController.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/api/QuestionController.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`

- [x] **Step 1: Add failing current-session and member-action tests**

Create `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`:

```kotlin
package com.readmates.session.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
class CurrentSessionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns empty current session when only seeded sessions exist`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession") { value(null) }
        }
    }
}
```

Create `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`:

```kotlin
package com.readmates.note.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
class MemberActionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns conflict when no open session exists for member action`() {
        mockMvc.patch("/api/sessions/current/rsvp") {
            with(user("member5@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"status":"GOING"}"""
        }.andExpect {
            status { isConflict() }
        }

        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80,"note":"질문을 준비 중입니다."}"""
        }.andExpect {
            status { isConflict() }
        }

        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"priority":1,"text":"무엇을 이야기하면 좋을까요?","draftThought":"첫 생각"}"""
        }.andExpect {
            status { isConflict() }
        }
    }
}
```

Also update `server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt` so priority 5 is accepted and priority 6 is rejected:

```kotlin
@Test
fun `creates a fifth priority question`() {
    mockMvc.post("/api/sessions/current/questions") {
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "priority": 5,
              "text": "다섯 번째 질문까지 준비할 수 있나요?",
              "draftThought": "실제 모임 질문 수에 맞춘 검증"
            }
            """.trimIndent()
    }.andExpect {
        status { isCreated() }
        jsonPath("$.priority") { value(5) }
    }
}
```

Change the existing invalid priority test payload from `"priority": 4` to `"priority": 6`.

- [x] **Step 2: Run tests and verify failures**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.note.api.MemberActionControllerDbTest'
```

Expected: FAIL because controllers still use hardcoded responses and do not resolve current members.

- [x] **Step 3: Implement SessionRepository**

Create `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`:

```kotlin
package com.readmates.session.application

import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.bind.annotation.ResponseStatus
import java.sql.ResultSet
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

data class CurrentSessionPayload(
    val currentSession: CurrentSessionDetail?,
)

data class CurrentSessionDetail(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val questionDeadlineAt: String,
    val myRsvpStatus: String,
    val attendees: List<SessionAttendee>,
)

data class SessionAttendee(
    val membershipId: String,
    val displayName: String,
    val shortName: String,
    val role: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

@Repository
class SessionRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun findCurrentSession(member: CurrentMember): CurrentSessionPayload {
        val session = jdbcTemplate.query(
            """
            select *
            from sessions
            where club_id = ?
              and state = 'OPEN'
            order by number desc
            limit 1
            """.trimIndent(),
            { rs, _ -> rs.toCurrentSessionDetail(member) },
            member.clubId,
        ).firstOrNull() ?: return CurrentSessionPayload(null)

        return CurrentSessionPayload(
            currentSession = session.copy(attendees = findAttendees(UUID.fromString(session.sessionId), member.clubId)),
        )
    }

    fun updateRsvp(member: CurrentMember, status: String): Map<String, String> {
        val sessionId = findOpenSessionId(member.clubId)
        val updated = jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = ?, updated_at = now()
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            status,
            sessionId,
            member.membershipId,
        )
        if (updated == 0) throw CurrentSessionNotOpenException()
        return mapOf("status" to status)
    }

    fun saveCheckin(member: CurrentMember, readingProgress: Int, note: String): Map<String, Any> {
        val sessionId = findOpenSessionId(member.clubId)
        jdbcTemplate.update(
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
            values (gen_random_uuid(), ?, ?, ?, ?, ?)
            on conflict (session_id, membership_id) do update
            set reading_progress = excluded.reading_progress,
                note = excluded.note,
                updated_at = now()
            """.trimIndent(),
            member.clubId,
            sessionId,
            member.membershipId,
            readingProgress,
            note,
        )
        return mapOf("readingProgress" to readingProgress, "note" to note)
    }

    fun saveQuestion(member: CurrentMember, priority: Int, text: String, draftThought: String?): Map<String, Any?> {
        val sessionId = findOpenSessionId(member.clubId)
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values (gen_random_uuid(), ?, ?, ?, ?, ?, ?)
            on conflict (session_id, membership_id, priority) do update
            set text = excluded.text,
                draft_thought = excluded.draft_thought,
                updated_at = now()
            """.trimIndent(),
            member.clubId,
            sessionId,
            member.membershipId,
            priority,
            text,
            draftThought,
        )
        return mapOf("priority" to priority, "text" to text, "draftThought" to draftThought)
    }

    fun findOpenSessionId(clubId: UUID): UUID =
        jdbcTemplate.query(
            "select id from sessions where club_id = ? and state = 'OPEN' order by number desc limit 1",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            clubId,
        ).firstOrNull() ?: throw CurrentSessionNotOpenException()

    private fun findAttendees(sessionId: UUID, clubId: UUID): List<SessionAttendee> =
        jdbcTemplate.query(
            """
            select m.id, u.name, m.role, sp.rsvp_status, sp.attendance_status
            from session_participants sp
            join memberships m on m.id = sp.membership_id
            join users u on u.id = m.user_id
            where sp.session_id = ?
              and sp.club_id = ?
            order by case when m.role = 'HOST' then 0 else 1 end, u.name
            """.trimIndent(),
            { rs, _ ->
                val name = rs.getString("name")
                SessionAttendee(
                    membershipId = rs.getObject("id", UUID::class.java).toString(),
                    displayName = name,
                    shortName = shortName(name),
                    role = rs.getString("role"),
                    rsvpStatus = rs.getString("rsvp_status"),
                    attendanceStatus = rs.getString("attendance_status"),
                )
            },
            sessionId,
            clubId,
        )

    private fun ResultSet.toCurrentSessionDetail(member: CurrentMember): CurrentSessionDetail {
        val sessionId = getObject("id", UUID::class.java)
        val myRsvp = jdbcTemplate.query(
            "select rsvp_status from session_participants where session_id = ? and membership_id = ?",
            { rs, _ -> rs.getString("rsvp_status") },
            sessionId,
            member.membershipId,
        ).firstOrNull() ?: "NO_RESPONSE"

        return CurrentSessionDetail(
            sessionId = sessionId.toString(),
            sessionNumber = getInt("number"),
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            date = getObject("session_date", LocalDate::class.java).toString(),
            startTime = getObject("start_time", LocalTime::class.java).toString(),
            endTime = getObject("end_time", LocalTime::class.java).toString(),
            locationLabel = getString("location_label"),
            questionDeadlineAt = getObject("question_deadline_at").toString(),
            myRsvpStatus = myRsvp,
            attendees = emptyList(),
        )
    }

    private fun shortName(displayName: String) =
        when (displayName) {
            "김호스트" -> "호스트"
            "안멤버1" -> "멤버1"
            "최멤버2" -> "멤버2"
            "김멤버3" -> "멤버3"
            "송멤버4" -> "멤버4"
            "이멤버5" -> "멤버5"
            else -> displayName
        }
}

@ResponseStatus(HttpStatus.CONFLICT)
class CurrentSessionNotOpenException : RuntimeException("No open current session")
```

- [x] **Step 4: Wire current member into controllers**

Update each controller to resolve `CurrentMember` from `Authentication` using `MemberAccountRepository`. If lookup fails, return `401`.

In `QuestionController`, change request validation from `@field:Max(3)` to `@field:Max(5)`:

```kotlin
data class CreateQuestionRequest(
    @field:Min(1) @field:Max(5) val priority: Int,
    @field:NotBlank val text: String,
    val draftThought: String?,
)
```

For `CurrentSessionController`, replace hardcoded payload with:

```kotlin
@GetMapping
fun current(authentication: Authentication?): CurrentSessionPayload {
    val member = currentMember(authentication)
    return sessionRepository.findCurrentSession(member)
}
```

For `RsvpController`, call:

```kotlin
return sessionRepository.updateRsvp(currentMember(authentication), request.status)
```

For `CheckinController`, call:

```kotlin
return sessionRepository.saveCheckin(currentMember(authentication), request.readingProgress, request.note)
```

For `QuestionController`, call:

```kotlin
return sessionRepository.saveQuestion(currentMember(authentication), request.priority, request.text, request.draftThought)
```

- [x] **Step 5: Run tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.note.api.MemberActionControllerDbTest'
```

Expected: PASS.

- [x] **Step 6: Commit current session work**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/note server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/note
git commit -m "feat: persist current session member actions"
```

## Task 4: Implement Host Session Creation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [x] **Step 1: Add failing host creation tests**

Create `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`:

```kotlin
package com.readmates.session.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
class HostSessionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `host creates session seven and members can see it as current`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com").roles("HOST"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 모임",
                  "bookTitle": "테스트 책",
                  "bookAuthor": "테스트 저자",
                  "date": "2026-05-20"
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.sessionNumber") { value(7) }
            jsonPath("$.state") { value("OPEN") }
        }

        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com").roles("MEMBER"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession.sessionNumber") { value(7) }
            jsonPath("$.currentSession.bookTitle") { value("테스트 책") }
            jsonPath("$.currentSession.myRsvpStatus") { value("NO_RESPONSE") }
        }
    }

    @Test
    fun `member cannot create a host session`() {
        mockMvc.post("/api/host/sessions") {
            with(user("member5@example.com").roles("MEMBER"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "권한 없는 모임",
                  "bookTitle": "테스트 책",
                  "bookAuthor": "테스트 저자",
                  "date": "2026-05-20"
                }
                """.trimIndent()
        }.andExpect {
            status { isForbidden() }
        }
    }
}
```

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: FAIL because host creation still echoes the request.

- [x] **Step 3: Add createSession to SessionRepository**

Add:

```kotlin
data class CreatedSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val state: String,
)

fun createOpenSession(host: CurrentMember, request: HostSessionRequest): CreatedSessionResponse {
    if (!host.isHost) {
        throw AccessDeniedException("Host role required")
    }

    val sessionId = UUID.randomUUID()
    val nextNumber = jdbcTemplate.queryForObject(
        "select coalesce(max(number), 0) + 1 from sessions where club_id = ?",
        Int::class.java,
        host.clubId,
    ) ?: 1

    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator, book_link,
          session_date, start_time, end_time, location_label, question_deadline_at, state
        )
        values (?, ?, ?, ?, ?, ?, null, null, ?::date, '20:00', '22:00', 'online · Zoom', (?::date - interval '1 day' + time '23:59'), 'OPEN')
        """.trimIndent(),
        sessionId,
        host.clubId,
        nextNumber,
        request.title,
        request.bookTitle,
        request.bookAuthor,
        request.date,
        request.date,
    )

    jdbcTemplate.update(
        """
        insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
        select gen_random_uuid(), ?, ?, id, 'NO_RESPONSE', 'UNKNOWN'
        from memberships
        where club_id = ?
          and status = 'ACTIVE'
        """.trimIndent(),
        host.clubId,
        sessionId,
        host.clubId,
    )

    return CreatedSessionResponse(
        sessionId = sessionId.toString(),
        sessionNumber = nextNumber,
        title = request.title,
        bookTitle = request.bookTitle,
        bookAuthor = request.bookAuthor,
        date = request.date,
        state = "OPEN",
    )
}
```

- [x] **Step 4: Update HostSessionController**

In `HostSessionController`, inject `MemberAccountRepository` and `SessionRepository`, resolve current member, and replace `create` with:

```kotlin
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
fun create(
    authentication: Authentication?,
    @Valid @RequestBody request: HostSessionRequest,
): CreatedSessionResponse {
    val member = currentMember(authentication)
    return sessionRepository.createOpenSession(member, request)
}
```

Keep `update` as request echo for this plan unless tests require editing existing sessions.

- [x] **Step 5: Run host tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: PASS.

- [x] **Step 6: Commit host creation work**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "feat: create next readmates session"
```

## Task 5: Implement Archive, Notes, And My Page Read Models

**Files:**
- Create: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/api/MyPageController.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

- [x] **Step 1: Extend archive tests for my page**

Add to `ArchiveAndNotesDbTest`:

```kotlin
@Test
fun `returns current member my page stats`() {
    mockMvc.get("/api/app/me") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.displayName") { value("이멤버5") }
        jsonPath("$.email") { value("member5@example.com") }
        jsonPath("$.sessionCount") { value(4) }
    }
}
```

- [x] **Step 2: Run archive tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: FAIL because read models still return hardcoded data.

- [x] **Step 3: Implement ArchiveRepository**

Create repository methods:

```kotlin
data class ArchiveSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val attendance: Int,
    val total: Int,
    val published: Boolean,
)

data class NoteFeedItem(
    val sessionNumber: Int,
    val authorName: String,
    val authorShortName: String,
    val kind: String,
    val text: String,
)

data class MyPageResponse(
    val displayName: String,
    val shortName: String,
    val email: String,
    val joinedAt: String,
    val sessionCount: Int,
)
```

Implement `findArchiveSessions`, `findNotesFeed`, and `findMyPage` with `JdbcTemplate`. For `findNotesFeed`, union these tables:

```sql
select s.number, u.name, 'QUESTION' as kind, q.text, q.created_at
from questions q
join sessions s on s.id = q.session_id
join memberships m on m.id = q.membership_id
join users u on u.id = m.user_id
union all
select s.number, u.name, 'ONE_LINE_REVIEW' as kind, r.text, r.created_at
from one_line_reviews r
join sessions s on s.id = r.session_id
join memberships m on m.id = r.membership_id
join users u on u.id = m.user_id
union all
select s.number, '읽는사이' as name, 'HIGHLIGHT' as kind, h.text, h.created_at
from highlights h
join sessions s on s.id = h.session_id
order by created_at desc
limit 80
```

- [x] **Step 4: Wire controllers**

Replace hardcoded `ArchiveController.sessions()` with:

```kotlin
@GetMapping("/sessions")
fun sessions(authentication: Authentication?) =
    archiveRepository.findArchiveSessions(currentMember(authentication).clubId)
```

Replace hardcoded `NotesFeedController.feed()` with:

```kotlin
@GetMapping
fun feed(authentication: Authentication?) =
    archiveRepository.findNotesFeed(currentMember(authentication).clubId)
```

Replace hardcoded `MyPageController.me()` with:

```kotlin
@GetMapping
fun me(authentication: Authentication?) =
    archiveRepository.findMyPage(currentMember(authentication))
```

- [x] **Step 5: Run archive tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: PASS.

- [x] **Step 6: Commit read models**

```bash
git add server/src/main/kotlin/com/readmates/archive server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "feat: read archive and notes from seed data"
```

## Task 6: Add Frontend BFF And API Types

**Files:**
- Create: `front/shared/api/readmates.ts`
- Create: `front/app/api/bff/[...path]/route.ts`
- Test: `front/tests/unit/login-card.test.tsx`

- [x] **Step 1: Add typed API helper**

Create `front/shared/api/readmates.ts`:

```ts
export type AuthMeResponse = {
  authenticated: boolean;
  userId: string | null;
  membershipId: string | null;
  clubId: string | null;
  email: string | null;
  displayName: string | null;
  shortName: string | null;
  role: "HOST" | "MEMBER" | null;
};

export type CurrentSessionResponse = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string;
    questionDeadlineAt: string;
    myRsvpStatus: "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
    attendees: Array<{
      membershipId: string;
      displayName: string;
      shortName: string;
      role: "HOST" | "MEMBER";
      rsvpStatus: string;
      attendanceStatus: string;
    }>;
  };
};

export async function readmatesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/bff${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ReadMates API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
```

- [x] **Step 2: Add BFF proxy route**

Create `front/app/api/bff/[...path]/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:8080";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamPath = `/${path.join("/")}`;
  const upstreamUrl = new URL(upstreamPath, API_BASE_URL);
  upstreamUrl.search = request.nextUrl.search;

  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Cookie: request.headers.get("cookie") ?? "",
    },
    body,
    redirect: "manual",
  });

  const responseBody = await upstream.arrayBuffer();
  const response = new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
```

- [x] **Step 3: Run frontend tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS or existing snapshot/query failures only from components that will be updated in later tasks.

- [x] **Step 4: Commit BFF work**

```bash
git add front/shared/api/readmates.ts front/app/api/bff
git commit -m "feat: add readmates frontend bff"
```

## Task 7: Wire Login, Home, Current Session, Archive, Notes, And Host UI

**Files:**
- Modify frontend files listed in the frontend file map.
- Test frontend unit files listed in the frontend file map.

- [x] **Step 1: Update action endpoints**

Change action URLs:

```ts
// update-rsvp.ts
return fetch("/api/bff/api/sessions/current/rsvp", ...)

// save-checkin.ts
return fetch("/api/bff/api/sessions/current/checkin", ...)

// save-question.ts
return fetch("/api/bff/api/sessions/current/questions", ...)
```

- [x] **Step 2: Add dev login buttons to LoginCard**

Add this constant:

```ts
const devAccounts = [
  { label: "김호스트 · HOST", email: "host@example.com" },
  { label: "안멤버1", email: "member1@example.com" },
  { label: "최멤버2", email: "member2@example.com" },
  { label: "김멤버3", email: "member3@example.com" },
  { label: "송멤버4", email: "member4@example.com" },
  { label: "이멤버5", email: "member5@example.com" },
];
```

Render the chooser only when `process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true"`. Each button posts:

```ts
await fetch("/api/bff/api/dev/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
window.location.href = "/app";
```

- [x] **Step 3: Add current-session empty state**

In `CurrentSession`, accept `data: CurrentSessionResponse`. If `data.currentSession === null`, render:

```tsx
<main>
  <section className="page-header-compact">
    <div className="container">
      <p className="eyebrow" style={{ margin: 0 }}>This session</p>
      <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>아직 열린 세션이 없습니다</h1>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        6회차는 종료되었습니다. 호스트가 7회차를 등록하면 RSVP와 질문 작성이 열립니다.
      </p>
    </div>
  </section>
</main>
```

- [x] **Step 4: Fetch page data in route pages**

Use server-side fetch from BFF in route pages:

```tsx
const current = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"}/api/bff/api/sessions/current`, {
  cache: "no-store",
}).then((response) => response.json());
```

Pass the typed response into the component. Use the same pattern for `/api/archive/sessions`, `/api/notes/feed`, `/api/app/me`, and `/api/auth/me`.

- [x] **Step 5: Wire host session creation form**

In `HostSessionEditor`, when rendering the new session route, submit:

```ts
const response = await fetch("/api/bff/api/host/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title,
    bookTitle,
    bookAuthor,
    date,
  }),
});

if (response.ok) {
  window.location.href = "/app/session/current";
}
```

- [x] **Step 6: Add focused frontend tests**

For `current-session.test.tsx`, assert the empty state text:

```tsx
render(<CurrentSession data={{ currentSession: null }} />);
expect(screen.getByText("아직 열린 세션이 없습니다")).toBeInTheDocument();
```

For `login-card.test.tsx`, set `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`, render `LoginCard`, and assert `김호스트 · HOST`.

For `archive-page.test.tsx`, render `ArchivePage` with the six API sessions and assert `가난한 찰리의 연감` and `팩트풀니스`.

- [x] **Step 7: Run frontend tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [x] **Step 8: Commit frontend data wiring**

```bash
git add front/app front/features front/shared front/tests
git commit -m "feat: wire frontend to readmates seed api"
```

## Task 8: End-To-End Verification

**Files:**
- Create: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify: `README.md`

- [x] **Step 1: Add Playwright dev-login flow**

Create `front/tests/e2e/dev-login-session-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("host creates session seven and member sees current session", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /김호스트 · HOST/ }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto("/app/host/sessions/new");
  await page.getByLabel("세션 제목").fill("7회차 모임 · 테스트 책");
  await page.getByLabel("책 제목").fill("테스트 책");
  await page.getByLabel("저자").fill("테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();

  await expect(page).toHaveURL(/\/app\/session\/current/);
  await expect(page.getByText("테스트 책")).toBeVisible();

  await page.goto("/login");
  await page.getByRole("button", { name: "이멤버5" }).click();
  await page.goto("/app/session/current");
  await expect(page.getByText("테스트 책")).toBeVisible();
  await page.getByRole("button", { name: "참석" }).click();
});
```

- [x] **Step 2: Update README local demo instructions**

Add:

```markdown
## Local Demo Data

Run the backend with the `dev` profile to load ReadMates demo data:

```bash
SPRING_PROFILES_ACTIVE=dev ./server/gradlew -p server bootRun
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true READMATES_API_BASE_URL=http://127.0.0.1:8080 pnpm --dir front dev
```

The dev login chooser includes 김호스트 as HOST and five member accounts. Seed sessions 1-6 are archived. The current session is empty until the host creates session 7.
```

- [x] **Step 3: Run full verification**

Run:

```bash
./server/gradlew -p server test
pnpm --dir front test
pnpm --dir front test:e2e
```

Expected: all pass. If e2e cannot run because the backend is not running under `dev`, start the backend with `SPRING_PROFILES_ACTIVE=dev` and rerun `pnpm --dir front test:e2e`.

- [x] **Step 4: Commit verification docs and e2e**

```bash
git add README.md front/tests/e2e/dev-login-session-flow.spec.ts
git commit -m "test: cover dev login session flow"
```

## Self-Review

- Spec coverage: seed accounts, sessions 1-6, 6회차 archived state, dev login, auth payload, current session empty state, host-created 7회차, member actions, archive, notes, my page, and frontend flows are all covered by tasks.
- Placeholder scan: no placeholder markers remain. The seed SQL examples use corrected club ids and deterministic ids.
- Type consistency: backend response names use `sessionNumber`, `bookTitle`, `displayName`, `shortName`, `role`, and `currentSession`; frontend types use the same names.
- Scope check: HTML report generation, automatic AI extraction, email, and multi-club behavior remain out of scope as specified.
- Current code caveat: this plan intentionally did not finish the broader V1 stubs listed in the current status refresh above.
