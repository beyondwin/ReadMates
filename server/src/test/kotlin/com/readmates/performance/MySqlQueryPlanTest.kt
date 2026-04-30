package com.readmates.performance

import com.readmates.support.MySqlTestContainer
import com.readmates.support.assertUsesIndexFor
import com.readmates.support.explain
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
class MySqlQueryPlanTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `archive paged sessions query uses indexed access on sessions`() {
        val member5 = membershipIdFor("member5@example.com")
        val plan = jdbcTemplate.explain(
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
        val plan = jdbcTemplate.explain(
            """
            select
              sessions.id,
              sessions.number,
              sessions.book_title,
              sessions.session_date,
              (
                select count(*)
                from questions
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
    fun `host member paged query uses indexed access on memberships`() {
        val plan = jdbcTemplate.explain(
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
        val plan = jdbcTemplate.explain(
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
    fun `public session detail query uses indexed access on public publication table`() {
        val plan = jdbcTemplate.explain(
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

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
