package com.readmates.auth.api

import com.readmates.auth.application.InvitationService
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.LocalDate

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [InvitationControllerDbTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [InvitationControllerDbTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class InvitationControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val invitationService: InvitationService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `preview returns masked pending invitation`() {
        val token = createInvitation("preview.member@example.com", "미리보기 멤버")

        mockMvc.get("/api/invitations/$token")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.email") { value("preview.member@example.com") }
                jsonPath("$.name") { value("미리보기 멤버") }
                jsonPath("$.emailHint") { value("pr****@example.com") }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.canAccept") { value(true) }
            }
    }

    @Test
    fun `legacy password invitation accept endpoint is gone`() {
        val token = createInvitation("accepted.member@example.com", "초대 멤버")

        val result = mockMvc.post("/api/invitations/$token/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "password": "correct horse battery staple",
                  "passwordConfirmation": "correct horse battery staple"
                }
            """.trimIndent()
        }.andExpect {
            status { isGone() }
        }.andReturn()

        assertEquals("Password invitation acceptance has been removed", result.response.errorMessage)
    }

    @Test
    fun `invalid token returns not found`() {
        mockMvc.get("/api/invitations/not-a-real-token")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("INVITATION_NOT_FOUND") }
            }
    }

    @Test
    fun `accepting invite with current session intent disabled does not create current participant`() {
        val token = createInvitation(
            email = "intent.disabled@example.com",
            name = "다음 세션 멤버",
            applyToCurrentSession = false,
        )
        createOpenSession("00000000-0000-0000-0000-000000005101")

        invitationService.acceptGoogleInvitation(
            rawToken = token,
            googleSubjectId = "google-intent-disabled",
            email = "intent.disabled@example.com",
            displayName = "다음 세션 멤버",
            profileImageUrl = null,
        )

        assertEquals("ACTIVE", membershipStatus("intent.disabled@example.com"))
        assertEquals(0, currentParticipantCount("intent.disabled@example.com"))
    }

    @Test
    fun `accepting invite with current session intent enabled creates participant when session is safe`() {
        val token = createInvitation(
            email = "intent.enabled@example.com",
            name = "이번 세션 멤버",
            applyToCurrentSession = true,
        )
        createOpenSession("00000000-0000-0000-0000-000000005102")

        invitationService.acceptGoogleInvitation(
            rawToken = token,
            googleSubjectId = "google-intent-enabled",
            email = "intent.enabled@example.com",
            displayName = "이번 세션 멤버",
            profileImageUrl = null,
        )

        assertEquals("ACTIVE", membershipStatus("intent.enabled@example.com"))
        assertEquals(1, currentParticipantCount("intent.enabled@example.com"))
    }

    @Test
    fun `accepting invite after question deadline leaves active membership without participant`() {
        val token = createInvitation(
            email = "intent.deadline-passed@example.com",
            name = "마감 후 멤버",
            applyToCurrentSession = true,
        )
        createOpenSession(
            sessionId = "00000000-0000-0000-0000-000000005103",
            questionDeadlineSql = "date_sub(utc_timestamp(6), interval 1 minute)",
        )

        invitationService.acceptGoogleInvitation(
            rawToken = token,
            googleSubjectId = "google-intent-deadline-passed",
            email = "intent.deadline-passed@example.com",
            displayName = "마감 후 멤버",
            profileImageUrl = null,
        )

        assertEquals("ACTIVE", membershipStatus("intent.deadline-passed@example.com"))
        assertEquals(0, currentParticipantCount("intent.deadline-passed@example.com"))
    }

    @Test
    fun `accepting invite after Korea local session date leaves active membership without participant`() {
        val token = createInvitation(
            email = "intent.session-passed@example.com",
            name = "회차 지남 멤버",
            applyToCurrentSession = true,
        )
        createOpenSession(
            sessionId = "00000000-0000-0000-0000-000000005104",
            sessionDate = LocalDate.now().minusDays(1),
        )

        invitationService.acceptGoogleInvitation(
            rawToken = token,
            googleSubjectId = "google-intent-session-passed",
            email = "intent.session-passed@example.com",
            displayName = "회차 지남 멤버",
            profileImageUrl = null,
        )

        assertEquals("ACTIVE", membershipStatus("intent.session-passed@example.com"))
        assertEquals(0, currentParticipantCount("intent.session-passed@example.com"))
    }

    private fun createInvitation(email: String, name: String, applyToCurrentSession: Boolean = true): String {
        val acceptUrl = mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","name":"$name","applyToCurrentSession":$applyToCurrentSession}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")

        return acceptUrl.substringAfterLast("/")
    }

    private fun createOpenSession(
        sessionId: String,
        sessionDate: LocalDate = LocalDate.now().plusDays(7),
        questionDeadlineSql: String = "date_add(utc_timestamp(6), interval 7 day)",
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              5101,
              'Invitation Current Session Test',
              'Invitation Test Book',
              'Invitation Test Author',
              ?,
              '19:30:00',
              '21:30:00',
              '온라인',
              $questionDeadlineSql,
              'OPEN'
            )
            """.trimIndent(),
            sessionId,
            sessionDate,
        )
    }

    private fun membershipStatus(email: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.status
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ) ?: error("Missing membership for $email")

    private fun currentParticipantCount(email: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            join sessions on sessions.id = session_participants.session_id
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where users.email = ?
              and sessions.state = 'OPEN'
            """.trimIndent(),
            Int::class.java,
            email,
        ) ?: 0

    companion object {
        const val CLEANUP_SQL = """
            delete from session_participants
            where membership_id in (
              select memberships.id
              from memberships
              join users on users.id = memberships.user_id
              where users.email in (
                'intent.disabled@example.com',
                'intent.enabled@example.com',
                'intent.deadline-passed@example.com',
                'intent.session-passed@example.com'
              )
            );

            delete from invitations
            where invited_email in (
              'preview.member@example.com',
              'accepted.member@example.com',
              'intent.disabled@example.com',
              'intent.enabled@example.com',
              'intent.deadline-passed@example.com',
              'intent.session-passed@example.com'
            );

            delete from sessions
            where title = 'Invitation Current Session Test';

            delete from memberships
            where user_id in (
              select id
              from users
              where email in (
                'intent.disabled@example.com',
                'intent.enabled@example.com',
                'intent.deadline-passed@example.com',
                'intent.session-passed@example.com'
              )
            );

            delete from users
            where email in (
              'intent.disabled@example.com',
              'intent.enabled@example.com',
              'intent.deadline-passed@example.com',
              'intent.session-passed@example.com'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
