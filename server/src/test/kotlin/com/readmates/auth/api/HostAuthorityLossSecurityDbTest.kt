package com.readmates.auth.api

import com.readmates.auth.adapter.`in`.security.AuthClubContextHeader
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.infrastructure.security.HostAuthorityContextCookie
import com.readmates.notification.application.service.NotificationDeliveryProcessingService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"],
)
@AutoConfigureMockMvc
@Sql(statements = [RESET_AUTHORITY_FIXTURE], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [RESET_AUTHORITY_FIXTURE], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostAuthorityLossSecurityDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) : ReadmatesMySqlIntegrationTestSupport() {
    @MockitoBean
    private lateinit var notificationProcessor: NotificationDeliveryProcessingService

    @Test
    fun `active host request remains authorized`() {
        `when`(notificationProcessor.processPendingForClub(READING_CLUB_ID, 20)).thenReturn(0)
        val sessionCookie = issueSessionCookie(READING_HOST_USER_ID)

        mockMvc
            .post("/api/host/notifications/process") {
                cookie(sessionCookie)
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
            }.andExpect {
                status { isOk() }
                jsonPath("$.processed") { value(0) }
                cookie { exists(HostAuthorityContextCookie.COOKIE_NAME) }
            }

        verify(notificationProcessor).processPendingForClub(READING_CLUB_ID, 20)
    }

    @Test
    fun `real auth session cookie preserves prior host proof after downgrade`() {
        val sessionCookie = issueSessionCookie(READING_HOST_USER_ID)
        val hostContextCookie = establishHostContext(sessionCookie, "reading-sai")
        jdbcTemplate.update(
            "update memberships set role = 'MEMBER' where id = ?",
            READING_HOST_MEMBERSHIP_ID.toString(),
        )

        mockMvc
            .post("/api/host/notifications/process") {
                cookie(sessionCookie, hostContextCookie)
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
            }.andExpect {
                status { isForbidden() }
                content { contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON) }
                jsonPath("$.code") { value("HOST_AUTHORITY_REVOKED") }
            }

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `suspended membership receives stable suspension problem without side effects`() {
        val sessionCookie = issueSessionCookie(READING_HOST_USER_ID)
        val hostContextCookie = establishHostContext(sessionCookie, "reading-sai")
        jdbcTemplate.update(
            "update memberships set status = 'SUSPENDED' where id = ?",
            READING_HOST_MEMBERSHIP_ID.toString(),
        )

        expectAuthorityProblem(sessionCookie, hostContextCookie, "reading-sai", "MEMBERSHIP_SUSPENDED")

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `explicit different joined club receives cross club problem without side effects`() {
        val sessionCookie = issueSessionCookie(READING_HOST_USER_ID)
        val hostContextCookie = establishHostContext(sessionCookie, "reading-sai")
        insertSampleMembership()

        expectAuthorityProblem(sessionCookie, hostContextCookie, "sample-book-club", "CROSS_CLUB_SCOPE")

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `safe navigation rotates authority context for a legitimate second host club`() {
        `when`(notificationProcessor.processPendingForClub(SAMPLE_CLUB_ID, 20)).thenReturn(0)
        val sessionCookie = issueSessionCookie(READING_HOST_USER_ID)
        val readingContextCookie = establishHostContext(sessionCookie, "reading-sai")
        insertSampleMembership(role = "HOST")

        val sampleContextCookie = establishHostContext(sessionCookie, "sample-book-club", readingContextCookie)

        mockMvc
            .post("/api/host/notifications/process") {
                cookie(sessionCookie, sampleContextCookie)
                header(AuthClubContextHeader.CLUB_SLUG, "sample-book-club")
            }.andExpect {
                status { isOk() }
                jsonPath("$.processed") { value(0) }
            }

        verify(notificationProcessor).processPendingForClub(SAMPLE_CLUB_ID, 20)
    }

    @Test
    fun `ordinary member and unknown club keep generic anti enumeration responses`() {
        val memberSessionCookie = issueSessionCookie(READING_MEMBER_USER_ID)
        mockMvc
            .post("/api/host/notifications/process") {
                cookie(memberSessionCookie, Cookie(HostAuthorityContextCookie.COOKIE_NAME, "v1.forged.signature"))
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
            }.andExpect {
                status { isForbidden() }
                content { string("") }
                cookie { maxAge(HostAuthorityContextCookie.COOKIE_NAME, 0) }
            }
        val hostSessionCookie = issueSessionCookie(READING_HOST_USER_ID)
        val hostContextCookie = establishHostContext(hostSessionCookie, "reading-sai")
        mockMvc
            .post("/api/host/notifications/process") {
                cookie(hostSessionCookie, hostContextCookie)
                header(AuthClubContextHeader.CLUB_SLUG, "missing-club")
            }.andExpect {
                status { isForbidden() }
                content { string("") }
            }
        mockMvc
            .get("/api/public/clubs/reading-sai")
            .andExpect {
                status { isOk() }
            }

        verifyNoInteractions(notificationProcessor)
    }

    private fun expectAuthorityProblem(
        sessionCookie: Cookie,
        hostContextCookie: Cookie,
        clubSlug: String,
        code: String,
    ) {
        mockMvc
            .post("/api/host/notifications/process") {
                cookie(sessionCookie, hostContextCookie)
                header(AuthClubContextHeader.CLUB_SLUG, clubSlug)
            }.andExpect {
                status { isForbidden() }
                content { contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON) }
                jsonPath("$.type") { value("about:blank") }
                jsonPath("$.title") { value("Forbidden") }
                jsonPath("$.status") { value(403) }
                jsonPath("$.detail") { isString() }
                jsonPath("$.code") { value(code) }
            }
    }

    private fun issueSessionCookie(userId: UUID): Cookie {
        val issued = authSessionService.issueSession(userId.toString(), "integration-test", "127.0.0.1")
        return Cookie(AuthSessionService.COOKIE_NAME, issued.rawToken)
    }

    private fun establishHostContext(
        sessionCookie: Cookie,
        clubSlug: String,
        priorContextCookie: Cookie? = null,
    ): Cookie {
        val response =
            mockMvc
                .get("/api/host/notifications/summary") {
                    cookie(*listOfNotNull(sessionCookie, priorContextCookie).toTypedArray())
                    header(AuthClubContextHeader.CLUB_SLUG, clubSlug)
                }.andExpect {
                    status { isOk() }
                    cookie { exists(HostAuthorityContextCookie.COOKIE_NAME) }
                }.andReturn()
                .response
        return requireNotNull(response.getHeader(HttpHeaders.SET_COOKIE))
            .substringBefore(';')
            .split('=', limit = 2)
            .let { Cookie(it[0], it[1]) }
    }

    private fun insertSampleMembership(role: String = "MEMBER") {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, ?, 'ACTIVE', utc_timestamp(6), 'Cross Fixture', 'globe-notebook')
            """.trimIndent(),
            SAMPLE_MEMBERSHIP_ID.toString(),
            SAMPLE_CLUB_ID.toString(),
            READING_HOST_USER_ID.toString(),
            role,
        )
    }

    private companion object {
        val READING_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val SAMPLE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val READING_HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val READING_MEMBER_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000102")
        val READING_HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val READING_MEMBER_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
        val SAMPLE_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009201")
    }
}

private const val RESET_AUTHORITY_FIXTURE = """
    delete from memberships
    where id = '00000000-0000-0000-0000-000000009201';
    update memberships
    set role = 'HOST', status = 'ACTIVE'
    where id = '00000000-0000-0000-0000-000000000201';
"""
