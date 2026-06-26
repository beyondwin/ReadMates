package com.readmates.performance

import com.readmates.sessionclosing.adapter.out.persistence.SessionClosingStatusSql
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import com.readmates.support.assertUsesIndexFor
import com.readmates.support.explain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class MySqlQueryPlanTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val largeFixture by lazy { LargeReadPathFixture(jdbcTemplate) }

    @AfterEach
    fun cleanupLargeFixture() {
        largeFixture.cleanupAllPerformanceFixtures()
    }

    @Test
    fun `archive paged sessions query uses indexed access on sessions`() {
        val member5 = membershipIdFor("member5@example.com")
        val plan =
            jdbcTemplate.explain(
                """
                select
                  sessions.id,
                  sessions.number,
                  sessions.title,
                  sessions.book_title,
                  sessions.book_author,
                  sessions.book_image_url,
                  sessions.session_date,
                  sessions.state,
                  current_participant.attendance_status as my_attendance_status,
                  sum(case when session_participants.attendance_status = 'ATTENDED' then 1 else 0 end) as attendance,
                  count(session_participants.id) as total,
                  coalesce(public_session_publications.visibility = 'PUBLIC', false) as published,
                  latest_feedback_document.created_at as feedback_document_uploaded_at
                from sessions
                left join session_participants current_participant on current_participant.session_id = sessions.id
                  and current_participant.club_id = sessions.club_id
                  and current_participant.membership_id = ?
                  and current_participant.participation_status = 'ACTIVE'
                left join session_participants on session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.participation_status = 'ACTIVE'
                left join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                left join (
                  select session_id, club_id, created_at
                  from (
                    select
                      session_feedback_documents.session_id,
                      session_feedback_documents.club_id,
                      session_feedback_documents.created_at,
                      row_number() over (
                        partition by session_feedback_documents.session_id
                        order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                      ) as document_rank
                    from session_feedback_documents
                    where session_feedback_documents.club_id = ?
                  ) ranked_feedback_documents
                  where document_rank = 1
                ) latest_feedback_document on latest_feedback_document.session_id = sessions.id
                  and latest_feedback_document.club_id = sessions.club_id
                where sessions.club_id = ?
                  and sessions.state in ('CLOSED', 'PUBLISHED')
                  and sessions.visibility in ('MEMBER', 'PUBLIC')
                  and (
                    ? is null
                    or sessions.number < ?
                    or (sessions.number = ? and sessions.id < ?)
                  )
                group by
                  sessions.id,
                  sessions.number,
                  sessions.title,
                  sessions.book_title,
                  sessions.book_author,
                  sessions.book_image_url,
                  sessions.session_date,
                  sessions.state,
                  current_participant.attendance_status,
                  public_session_publications.visibility,
                  latest_feedback_document.created_at
                order by sessions.number desc, sessions.id desc
                limit ?
                """.trimIndent(),
                member5,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                null,
                null,
                null,
                null,
                31,
            )

        plan.assertUsesIndexFor("sessions", "member archive cursor page")
    }

    @Test
    fun `notes paged session query uses indexed access on sessions`() {
        val plan =
            jdbcTemplate.explain(
                """
                select
                  sessions.id,
                  sessions.number,
                  sessions.book_title,
                  sessions.session_date,
                  (
                    select count(*)
                    from questions force index (questions_club_session_created_idx)
                    where questions.club_id = sessions.club_id
                      and questions.session_id = sessions.id
                      and exists (
                        select 1
                        from session_participants
                        where session_participants.session_id = questions.session_id
                          and session_participants.club_id = questions.club_id
                          and session_participants.membership_id = questions.membership_id
                          and session_participants.participation_status = 'ACTIVE'
                      )
                  ) as question_count,
                  (
                    select count(*)
                    from one_line_reviews
                    where one_line_reviews.club_id = sessions.club_id
                      and one_line_reviews.session_id = sessions.id
                      and one_line_reviews.visibility = 'PUBLIC'
                      and exists (
                        select 1
                        from session_participants
                        where session_participants.session_id = one_line_reviews.session_id
                          and session_participants.club_id = one_line_reviews.club_id
                          and session_participants.membership_id = one_line_reviews.membership_id
                          and session_participants.participation_status = 'ACTIVE'
                      )
                  ) as one_liner_count,
                  (
                    select count(*)
                    from long_reviews
                    where long_reviews.club_id = sessions.club_id
                      and long_reviews.session_id = sessions.id
                      and long_reviews.visibility = 'PUBLIC'
                      and exists (
                        select 1
                        from session_participants
                        where session_participants.session_id = long_reviews.session_id
                          and session_participants.club_id = long_reviews.club_id
                          and session_participants.membership_id = long_reviews.membership_id
                          and session_participants.participation_status = 'ACTIVE'
                      )
                  ) as long_review_count,
                  (
                    select count(*)
                    from highlights
                    where highlights.club_id = sessions.club_id
                      and highlights.session_id = sessions.id
                      and (
                        highlights.membership_id is null
                        or exists (
                          select 1
                          from session_participants
                          where session_participants.session_id = highlights.session_id
                            and session_participants.club_id = highlights.club_id
                            and session_participants.membership_id = highlights.membership_id
                            and session_participants.participation_status = 'ACTIVE'
                        )
                      )
                  ) as highlight_count
                from sessions
                where sessions.club_id = ?
                  and sessions.state = 'PUBLISHED'
                  and sessions.visibility in ('MEMBER', 'PUBLIC')
                  and (
                    ? is null
                    or sessions.number < ?
                    or (sessions.number = ? and sessions.id < ?)
                  )
                order by sessions.number desc, sessions.id desc
                limit ?
                """.trimIndent(),
                READING_SAI_CLUB_ID,
                null,
                null,
                null,
                null,
                31,
            )

        plan.assertUsesIndexFor("sessions", "notes session cursor page")
        plan.assertUsesIndexFor("questions", "notes session question count")
        plan.assertUsesIndexFor("one_line_reviews", "notes session one-line review count")
        plan.assertUsesIndexFor("long_reviews", "notes session long review count")
        plan.assertUsesIndexFor("highlights", "notes session highlight count")
        plan.assertUsesIndexFor("session_participants", "notes session active participant filters")
    }

    @Test
    fun `notes feed union branches use indexed access on every source table`() {
        val plan =
            jdbcTemplate.explain(
                NOTES_FEED_PLAN_SQL,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                31,
            )

        plan.assertUsesIndexFor("questions", "notes feed question branch")
        plan.assertUsesIndexFor("long_reviews", "notes feed long-review branch")
        plan.assertUsesIndexFor("one_line_reviews", "notes feed one-line review branch")
        plan.assertUsesIndexFor("highlights", "notes feed highlight branch")
        plan.assertUsesIndexFor("session_participants", "notes feed active participant filter")
    }

    @Test
    fun `notes feed large fixture keeps every union branch on indexed access`() {
        largeFixture.seedNotesFeed(sessionCount = 80)

        val plan =
            jdbcTemplate.explain(
                NOTES_FEED_PLAN_SQL,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                READING_SAI_CLUB_ID,
                61,
            )
        plan.assertUsesIndexFor("questions", "large notes feed question branch")
        plan.assertUsesIndexFor("long_reviews", "large notes feed long-review branch")
        plan.assertUsesIndexFor("one_line_reviews", "large notes feed one-line review branch")
        plan.assertUsesIndexFor("highlights", "large notes feed highlight branch")
        plan.assertUsesIndexFor("sessions", "large notes feed session join")
        plan.assertUsesIndexFor("session_participants", "large notes feed active participant filter")
    }

    @Test
    fun `archive session detail queries use indexed access on hydrated detail tables`() {
        largeFixture.seedArchiveSessionDetail(artifactCount = 40)

        val sessionId = largeFixture.archiveDetailSessionId()

        assertArchiveDetailHeaderPlan(sessionId)
        assertArchiveDetailPublicBatchPlan(sessionId)
        assertArchiveDetailPersonalBatchPlan(sessionId)
        assertArchiveDetailFeedbackPlan(sessionId)
    }

    private fun assertArchiveDetailHeaderPlan(sessionId: String) {
        val headerPlan =
            jdbcTemplate.explain(
                """
                select
                  sessions.id,
                  sessions.number,
                  sessions.title,
                  sessions.book_title,
                  sessions.book_author,
                  sessions.book_image_url,
                  sessions.session_date,
                  sessions.state,
                  sessions.location_label,
                  (
                    select count(*)
                    from session_participants
                    where session_participants.session_id = sessions.id
                      and session_participants.club_id = sessions.club_id
                      and session_participants.attendance_status = 'ATTENDED'
                      and session_participants.participation_status = 'ACTIVE'
                  ) as attendance,
                  (
                    select count(*)
                    from session_participants
                    where session_participants.session_id = sessions.id
                      and session_participants.club_id = sessions.club_id
                      and session_participants.participation_status = 'ACTIVE'
                  ) as total,
                  current_participant.attendance_status as my_attendance_status,
                  case
                    when public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                      then public_session_publications.public_summary
                    else null
                  end as public_summary
                from sessions
                left join session_participants current_participant on current_participant.session_id = sessions.id
                  and current_participant.club_id = sessions.club_id
                  and current_participant.membership_id = ?
                  and current_participant.participation_status = 'ACTIVE'
                left join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where sessions.id = ?
                  and sessions.club_id = ?
                  and sessions.state in ('CLOSED', 'PUBLISHED')
                  and sessions.visibility in ('MEMBER', 'PUBLIC')
                """.trimIndent(),
                MEMBER_5_ID,
                sessionId,
                READING_SAI_CLUB_ID,
            )

        headerPlan.assertUsesIndexFor("sessions", "archive detail session lookup")
        headerPlan.assertUsesIndexFor("current_participant", "archive detail current participant join")
        headerPlan.assertUsesIndexFor("public_session_publications", "archive detail publication join")
        headerPlan.assertUsesIndexFor("session_participants", "archive detail attendance subqueries")
    }

    private fun assertArchiveDetailPublicBatchPlan(sessionId: String) {
        val publicBatchPlan =
            jdbcTemplate.explain(
                ARCHIVE_DETAIL_PUBLIC_BATCH_PLAN_SQL,
                READING_SAI_CLUB_ID,
                sessionId,
                READING_SAI_CLUB_ID,
                sessionId,
                READING_SAI_CLUB_ID,
                sessionId,
                READING_SAI_CLUB_ID,
                sessionId,
            )

        publicBatchPlan.assertUsesIndexFor("highlights", "archive detail public highlights")
        publicBatchPlan.assertUsesIndexFor("questions", "archive detail club questions")
        publicBatchPlan.assertUsesIndexFor("one_line_reviews", "archive detail one-line sections")
        publicBatchPlan.assertUsesIndexFor("session_participants", "archive detail active participant filters")
    }

    private fun assertArchiveDetailPersonalBatchPlan(sessionId: String) {
        val personalBatchPlan =
            jdbcTemplate.explain(
                ARCHIVE_DETAIL_PERSONAL_BATCH_PLAN_SQL,
                READING_SAI_CLUB_ID,
                sessionId,
                MEMBER_5_ID,
                READING_SAI_CLUB_ID,
                sessionId,
                MEMBER_5_ID,
                READING_SAI_CLUB_ID,
                sessionId,
                MEMBER_5_ID,
                READING_SAI_CLUB_ID,
                sessionId,
                MEMBER_5_ID,
            )

        personalBatchPlan.assertUsesIndexFor("questions", "archive detail personal questions")
        personalBatchPlan.assertUsesIndexFor("reading_checkins", "archive detail personal checkin")
        personalBatchPlan.assertUsesIndexFor("one_line_reviews", "archive detail personal one-line review")
        personalBatchPlan.assertUsesIndexFor("long_reviews", "archive detail personal long review")
        personalBatchPlan.assertUsesIndexFor(
            "session_participants",
            "archive detail personal active participant filters",
        )
    }

    private fun assertArchiveDetailFeedbackPlan(sessionId: String) {
        val feedbackPlan =
            jdbcTemplate.explain(
                """
                select created_at
                from session_feedback_documents
                where club_id = ?
                  and session_id = ?
                order by version desc, created_at desc
                limit 1
                """.trimIndent(),
                READING_SAI_CLUB_ID,
                sessionId,
            )

        feedbackPlan.assertUsesIndexFor("session_feedback_documents", "archive detail feedback document lookup")
    }

    @Test
    fun `host member paged query uses indexed access on memberships`() {
        val plan =
            jdbcTemplate.explain(
                """
                select
                  membership_id,
                  user_id,
                  email,
                  account_name,
                  display_name,
                  profile_image_url,
                  role,
                  status,
                  joined_at,
                  created_at,
                  current_session_id,
                  participation_status
                from (
                  select
                    memberships.id as membership_id,
                    users.id as user_id,
                    users.email,
                    users.name as account_name,
                    coalesce(memberships.short_name, users.name) as display_name,
                    users.profile_image_url,
                    memberships.role,
                    memberships.status,
                    memberships.joined_at,
                    memberships.created_at,
                    current_session.id as current_session_id,
                    session_participants.participation_status,
                    case memberships.role when 'HOST' then 0 else 1 end as role_rank,
                    case memberships.status
                      when 'ACTIVE' then 0
                      when 'VIEWER' then 1
                      when 'SUSPENDED' then 2
                      when 'LEFT' then 3
                      when 'INACTIVE' then 4
                      else 5
                    end as status_rank
                  from memberships
                  join users on users.id = memberships.user_id
                  left join sessions current_session on current_session.club_id = memberships.club_id
                    and current_session.state = 'OPEN'
                    and current_session.id = (
                      select sessions.id
                      from sessions
                      where sessions.club_id = memberships.club_id
                        and sessions.state = 'OPEN'
                      order by sessions.number desc
                      limit 1
                    )
                  left join session_participants on session_participants.session_id = current_session.id
                    and session_participants.club_id = memberships.club_id
                    and session_participants.membership_id = memberships.id
                  where memberships.club_id = ?
                ) ordered_members
                where (
                  ? is null
                  or role_rank > ?
                  or (role_rank = ? and status_rank > ?)
                  or (role_rank = ? and status_rank = ? and display_name > ?)
                  or (role_rank = ? and status_rank = ? and display_name = ? and email > ?)
                  or (role_rank = ? and status_rank = ? and display_name = ? and email = ? and membership_id > ?)
                )
                order by role_rank, status_rank, display_name, email, membership_id
                limit ?
                """.trimIndent(),
                READING_SAI_CLUB_ID,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                51,
            )

        plan.assertUsesIndexFor("memberships", "host member cursor page")
        plan.assertUsesIndexFor("current_session", "host member current open session join")
        plan.assertUsesIndexFor("sessions", "host member current open session lookup")
        plan.assertUsesIndexFor("session_participants", "host member current session participation join")
    }

    @Test
    fun `global notification delivery claim query uses indexed access on deliveries`() {
        val plan =
            jdbcTemplate.explain(
                """
                select id
                from notification_deliveries
                where channel = 'EMAIL'
                  and status in ('PENDING', 'FAILED')
                  and next_attempt_at <= utc_timestamp(6)
                order by next_attempt_at, created_at
                limit ?
                for update skip locked
                """.trimIndent(),
                50,
            )

        plan.assertUsesIndexFor("notification_deliveries", "global notification delivery claim")
    }

    @Test
    fun `admin analytics benchmark query uses indexed access on operating tables`() {
        val plan =
            jdbcTemplate.explain(
                """
                select
                  c.id as club_id, c.slug as slug, c.name as name,
                  count(distinct sp.membership_id) as active_members,
                  count(distinct s.id) as sessions,
                  count(distinct case when s.state in ('CLOSED','PUBLISHED') then s.id end) as completed_sessions,
                  count(sp.id) as participants,
                  sum(case when sp.rsvp_status in ('GOING','MAYBE') then 1 else 0 end) as going_maybe,
                  coalesce((
                    select sum(a.cost_estimate_usd) from ai_generation_audit_log a
                    where a.club_id = c.id and a.created_at >= utc_timestamp(6) - interval ? day
                  ), 0) as ai_cost,
                  coalesce((
                    select count(*) from notification_deliveries n
                    where n.club_id = c.id and n.status in ('SENT','FAILED','DEAD')
                      and n.updated_at >= utc_timestamp(6) - interval ? day
                  ), 0) as notif_terminal,
                  coalesce((
                    select count(*) from notification_deliveries n
                    where n.club_id = c.id and n.status = 'SENT'
                      and n.updated_at >= utc_timestamp(6) - interval ? day
                  ), 0) as notif_sent
                from clubs c
                left join sessions s on s.club_id = c.id and s.session_date >= current_date() - interval ? day
                left join session_participants sp force index (session_participants_session_club_fk)
                  on sp.session_id = s.id and sp.club_id = s.club_id
                group by c.id, c.slug, c.name
                having sessions > 0
                order by active_members desc, c.name asc
                limit 20
                """.trimIndent(),
                30,
                30,
                30,
                30,
            )

        plan.assertUsesIndexFor("s", "admin analytics benchmark session window")
        plan.assertUsesIndexFor("sp", "admin analytics benchmark participant aggregation")
        plan.assertUsesIndexFor("a", "admin analytics benchmark AI cost subquery")
        plan.assertUsesIndexFor("n", "admin analytics benchmark notification subqueries")
    }

    @Test
    fun `public session detail query uses indexed access on public publication table`() {
        val plan =
            jdbcTemplate.explain(
                """
                select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.book_author,
                       sessions.book_image_url, sessions.session_date, public_session_publications.public_summary
                from sessions
                join clubs on clubs.id = sessions.club_id
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where clubs.slug = ?
                  and clubs.status = 'ACTIVE'
                  and sessions.id = ?
                  and sessions.state = 'PUBLISHED'
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                "reading-sai",
                "00000000-0000-0000-0000-000000000306",
            )

        plan.assertUsesIndexFor("public_session_publications", "public session detail")
    }

    @Test
    fun `host closing status queries use indexed access on operating tables`() {
        val basePlan =
            jdbcTemplate.explain(
                SessionClosingStatusSql.CLOSING_BASE,
                "00000000-0000-0000-0000-000000000306",
                READING_SAI_CLUB_ID,
            )

        basePlan.assertUsesIndexFor("sessions", "host closing base session lookup")
        basePlan.assertUsesIndexFor("public_session_publications", "host closing public publication join")
        basePlan.assertUsesIndexFor("session_feedback_documents", "host closing feedback existence check")
        basePlan.assertUsesIndexFor("highlights", "host closing highlight count")
        basePlan.assertUsesIndexFor("one_line_reviews", "host closing one-line review count")

        val notificationPlan =
            jdbcTemplate.explain(
                SessionClosingStatusSql.LATEST_NOTIFICATION_EVENT,
                READING_SAI_CLUB_ID,
                "00000000-0000-0000-0000-000000000306",
            )

        notificationPlan.assertUsesIndexFor("notification_event_outbox", "host closing latest notification event")
    }

    private fun membershipIdFor(email: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ?
              and users.email = ?
            """.trimIndent(),
            String::class.java,
            READING_SAI_CLUB_ID,
            email,
        ) ?: error("Missing seeded membership for $email")

    companion object {
        private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val MEMBER_5_ID = "00000000-0000-0000-0000-000000000206"

        private const val ARCHIVE_DETAIL_PUBLIC_BATCH_PLAN_SQL = """
            select 'HIGHLIGHT' as section,
              highlights.sort_order,
              null as priority,
              highlights.text,
              null as draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from highlights
            left join memberships on memberships.id = highlights.membership_id
              and memberships.club_id = highlights.club_id
            left join users on users.id = memberships.user_id
            left join session_participants on session_participants.session_id = highlights.session_id
              and session_participants.club_id = highlights.club_id
              and session_participants.membership_id = highlights.membership_id
            where highlights.club_id = ?
              and highlights.session_id = ?
              and (
                highlights.membership_id is null
                or session_participants.participation_status = 'ACTIVE'
              )

            UNION ALL

            select 'CLUB_QUESTION' as section,
              null as sort_order,
              questions.priority,
              questions.text,
              questions.draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.club_id = ?
              and questions.session_id = ?

            UNION ALL

            select 'CLUB_ONE_LINER' as section,
              null as sort_order,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.visibility in ('SESSION', 'PUBLIC')

            UNION ALL

            select 'PUBLIC_ONE_LINER' as section,
              null as sort_order,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
        """

        private const val ARCHIVE_DETAIL_PERSONAL_BATCH_PLAN_SQL = """
            select 'MY_QUESTION' as section,
              questions.priority,
              questions.text,
              questions.draft_thought,
              null as reading_progress,
              null as body,
              coalesce(memberships.short_name, users.name) as author_name,
              CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.club_id = ?
              and questions.session_id = ?
              and questions.membership_id = ?

            UNION ALL

            select 'MY_CHECKIN' as section,
              null as priority,
              null as text,
              null as draft_thought,
              reading_checkins.reading_progress,
              null as body,
              null as author_name,
              null as author_short_name
            from reading_checkins
            join session_participants on session_participants.session_id = reading_checkins.session_id
              and session_participants.club_id = reading_checkins.club_id
              and session_participants.membership_id = reading_checkins.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where reading_checkins.club_id = ?
              and reading_checkins.session_id = ?
              and reading_checkins.membership_id = ?

            UNION ALL

            select 'MY_ONE_LINE_REVIEW' as section,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              null as reading_progress,
              null as body,
              coalesce(memberships.short_name, users.name) as author_name,
              CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = one_line_reviews.session_id
                  and session_participants.club_id = one_line_reviews.club_id
                  and session_participants.membership_id = one_line_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )

            UNION ALL

            select 'MY_LONG_REVIEW' as section,
              null as priority,
              null as text,
              null as draft_thought,
              null as reading_progress,
              long_reviews.body,
              null as author_name,
              null as author_short_name
            from long_reviews
            where long_reviews.club_id = ?
              and long_reviews.session_id = ?
              and long_reviews.membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = long_reviews.session_id
                  and session_participants.club_id = long_reviews.club_id
                  and session_participants.membership_id = long_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )
        """

        private const val NOTES_FEED_PLAN_SQL = """
            select id, session_id, session_number, book_title, session_date,
                   author_name, author_short_name_source, kind, text, created_at, source_order, item_order
            from (
              select
                questions.id as id, sessions.id as session_id, sessions.number as session_number,
                sessions.book_title as book_title, sessions.session_date as session_date,
                coalesce(memberships.short_name, users.name) as author_name,
                coalesce(memberships.short_name, users.name) as author_short_name_source,
                'QUESTION' as kind, questions.text as text, questions.created_at as created_at,
                10 as source_order, questions.priority as item_order
              from questions force index (questions_club_session_created_idx)
              join sessions on sessions.id = questions.session_id and sessions.club_id = questions.club_id
              join memberships on memberships.id = questions.membership_id and memberships.club_id = questions.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = questions.session_id
                and session_participants.club_id = questions.club_id
                and session_participants.membership_id = questions.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where questions.club_id = ?
                and sessions.state = 'PUBLISHED' and sessions.visibility in ('MEMBER', 'PUBLIC')

              union all

              select
                long_reviews.id as id, sessions.id as session_id, sessions.number as session_number,
                sessions.book_title as book_title, sessions.session_date as session_date,
                coalesce(memberships.short_name, users.name) as author_name,
                coalesce(memberships.short_name, users.name) as author_short_name_source,
                'LONG_REVIEW' as kind, long_reviews.body as text, long_reviews.created_at as created_at,
                40 as source_order, 0 as item_order
              from long_reviews
              join sessions on sessions.id = long_reviews.session_id and sessions.club_id = long_reviews.club_id
              join memberships on memberships.id = long_reviews.membership_id and memberships.club_id = long_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = long_reviews.session_id
                and session_participants.club_id = long_reviews.club_id
                and session_participants.membership_id = long_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where long_reviews.club_id = ? and long_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED' and sessions.visibility in ('MEMBER', 'PUBLIC')

              union all

              select
                one_line_reviews.id as id, sessions.id as session_id, sessions.number as session_number,
                sessions.book_title as book_title, sessions.session_date as session_date,
                coalesce(memberships.short_name, users.name) as author_name,
                coalesce(memberships.short_name, users.name) as author_short_name_source,
                'ONE_LINE_REVIEW' as kind, one_line_reviews.text as text, one_line_reviews.created_at as created_at,
                30 as source_order, 0 as item_order
              from one_line_reviews
              join sessions on sessions.id = one_line_reviews.session_id and sessions.club_id = one_line_reviews.club_id
              join memberships on memberships.id = one_line_reviews.membership_id and memberships.club_id = one_line_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = one_line_reviews.session_id
                and session_participants.club_id = one_line_reviews.club_id
                and session_participants.membership_id = one_line_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where one_line_reviews.club_id = ? and one_line_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED' and sessions.visibility in ('MEMBER', 'PUBLIC')

              union all

              select
                highlights.id as id, sessions.id as session_id, sessions.number as session_number,
                sessions.book_title as book_title, sessions.session_date as session_date,
                coalesce(memberships.short_name, users.name) as author_name,
                coalesce(memberships.short_name, users.name) as author_short_name_source,
                'HIGHLIGHT' as kind, highlights.text as text, highlights.created_at as created_at,
                20 as source_order, highlights.sort_order as item_order
              from highlights force index (highlights_club_session_created_idx)
              join sessions on sessions.id = highlights.session_id and sessions.club_id = highlights.club_id
              left join memberships on memberships.id = highlights.membership_id and memberships.club_id = highlights.club_id
              left join users on users.id = memberships.user_id
              left join session_participants on session_participants.session_id = highlights.session_id
                and session_participants.club_id = highlights.club_id
                and session_participants.membership_id = highlights.membership_id
              where highlights.club_id = ?
                and sessions.state = 'PUBLISHED' and sessions.visibility in ('MEMBER', 'PUBLIC')
                and (highlights.membership_id is null or session_participants.participation_status = 'ACTIVE')
            ) feed_items
            order by session_number desc, created_at desc, source_order asc, item_order asc, id desc
            limit ?
        """
    }
}
