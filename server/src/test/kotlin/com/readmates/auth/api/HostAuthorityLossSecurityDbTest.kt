package com.readmates.auth.api

import com.readmates.auth.adapter.`in`.security.AuthClubContextHeader
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.service.NotificationDeliveryProcessingService
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
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
) : ReadmatesMySqlIntegrationTestSupport() {
    @MockitoBean
    private lateinit var notificationProcessor: NotificationDeliveryProcessingService

    @Test
    fun `active host request remains authorized`() {
        `when`(notificationProcessor.processPendingForClub(READING_CLUB_ID, 20)).thenReturn(0)

        mockMvc
            .post("/api/host/notifications/process") {
                with(staleReadingHost())
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
            }.andExpect {
                status { isOk() }
                jsonPath("$.processed") { value(0) }
            }

        verify(notificationProcessor).processPendingForClub(READING_CLUB_ID, 20)
    }

    @Test
    fun `downgraded prior host receives stable authority revoked problem without side effects`() {
        jdbcTemplate.update(
            "update memberships set role = 'MEMBER' where id = ?",
            READING_HOST_MEMBERSHIP_ID.toString(),
        )

        expectAuthorityProblem("reading-sai", "HOST_AUTHORITY_REVOKED")

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `suspended membership receives stable suspension problem without side effects`() {
        jdbcTemplate.update(
            "update memberships set status = 'SUSPENDED' where id = ?",
            READING_HOST_MEMBERSHIP_ID.toString(),
        )

        expectAuthorityProblem("reading-sai", "MEMBERSHIP_SUSPENDED")

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `explicit different joined club receives cross club problem without side effects`() {
        insertSampleMembership()

        expectAuthorityProblem("sample-book-club", "CROSS_CLUB_SCOPE")

        verifyNoInteractions(notificationProcessor)
    }

    @Test
    fun `ordinary member and unknown club keep generic anti enumeration responses`() {
        mockMvc
            .post("/api/host/notifications/process") {
                with(authentication(activeReadingMember()))
                header(AuthClubContextHeader.CLUB_SLUG, "reading-sai")
            }.andExpect {
                status { isForbidden() }
                content { string("") }
            }
        mockMvc
            .post("/api/host/notifications/process") {
                with(staleReadingHost())
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
        clubSlug: String,
        code: String,
    ) {
        mockMvc
            .post("/api/host/notifications/process") {
                with(staleReadingHost())
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

    private fun staleReadingHost() = authentication(staleReadingHostAuthentication())

    private fun staleReadingHostAuthentication() =
        UsernamePasswordAuthenticationToken(
            currentMember(
                membershipId = READING_HOST_MEMBERSHIP_ID,
                clubId = READING_CLUB_ID,
                clubSlug = "reading-sai",
                role = MembershipRole.HOST,
                status = MembershipStatus.ACTIVE,
            ),
            null,
            listOf(SimpleGrantedAuthority("ROLE_HOST")),
        )

    private fun activeReadingMember() =
        UsernamePasswordAuthenticationToken(
            currentMember(
                membershipId = READING_MEMBER_MEMBERSHIP_ID,
                clubId = READING_CLUB_ID,
                clubSlug = "reading-sai",
                role = MembershipRole.MEMBER,
                status = MembershipStatus.ACTIVE,
                email = "member1@example.com",
                userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
            ),
            null,
            listOf(SimpleGrantedAuthority("ROLE_MEMBER")),
        )

    private fun currentMember(
        membershipId: UUID,
        clubId: UUID,
        clubSlug: String,
        role: MembershipRole,
        status: MembershipStatus,
        email: String = "host@example.com",
        userId: UUID = READING_HOST_USER_ID,
    ) = CurrentMember(
        userId = userId,
        membershipId = membershipId,
        clubId = clubId,
        clubSlug = clubSlug,
        email = email,
        displayName = "Fixture",
        accountName = "fixture",
        role = role,
        membershipStatus = status,
    )

    private fun insertSampleMembership() {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'Cross Fixture', 'globe-notebook')
            """.trimIndent(),
            SAMPLE_MEMBERSHIP_ID.toString(),
            SAMPLE_CLUB_ID.toString(),
            READING_HOST_USER_ID.toString(),
        )
    }

    private companion object {
        val READING_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val SAMPLE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val READING_HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
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
