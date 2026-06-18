package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.auth.adapter.`in`.security.CurrentMemberArgumentResolver
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingEvidence
import com.readmates.sessionclosing.application.model.ClosingOverall
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.ClosingSessionSummary
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.LocalDate
import java.util.UUID

class HostSessionClosingControllerTest {
    private val useCase = FakeGetHostSessionClosingStatusUseCase()
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(HostSessionClosingController(useCase))
            .setCustomArgumentResolvers(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase))
            .build()

    @Test
    fun `returns public safe host closing status`() {
        useCase.response = response()

        mockMvc
            .get("/api/host/sessions/11111111-1111-1111-1111-111111111111/closing-status") {
                with(hostUser())
                accept = MediaType.APPLICATION_JSON
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("host.session_closing_status.v1") }
                jsonPath("$.overall.state") { value("READY") }
                jsonPath("$.overall.primaryAction") { value("SEND_NOTIFICATION") }
                jsonPath("$.checklist[0].id") { value("SESSION_CLOSED") }
                jsonPath("$.evidence.highlightCount") { value(2) }
                jsonPath("$.evidence.publicRecordHref") {
                    value("/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111")
                }
                jsonPath("$.evidence.rawEmail") { doesNotExist() }
                jsonPath("$.evidence.providerError") { doesNotExist() }
            }
    }

    private fun response() =
        HostSessionClosingStatus(
            session =
                ClosingSessionSummary(
                    sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111"),
                    sessionNumber = 7,
                    bookTitle = "Test Book",
                    meetingDate = LocalDate.parse("2026-06-18"),
                    state = "CLOSED",
                    recordVisibility = SessionRecordVisibility.PUBLIC,
                ),
            overall = ClosingOverall(ClosingOverallState.READY, "Ready", ClosingPrimaryAction.SEND_NOTIFICATION),
            checklist =
                listOf(
                    ClosingChecklistItem(
                        id = ClosingChecklistId.SESSION_CLOSED,
                        state = ClosingChecklistState.DONE,
                        label = "Session closed",
                        detail = "The meeting status is closed.",
                        href = "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
                    ),
                ),
            evidence =
                ClosingEvidence(
                    summaryPublished = true,
                    highlightCount = 2,
                    oneLinerCount = 3,
                    feedbackDocumentState = FeedbackDocumentClosingState.AVAILABLE,
                    latestNotificationEvent = null,
                    publicRecordHref = "/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111",
                    memberReflectionHref = "/clubs/reading-sai/app/sessions/11111111-1111-1111-1111-111111111111",
                ),
        )
}

private class FakeGetHostSessionClosingStatusUseCase : GetHostSessionClosingStatusUseCase {
    lateinit var response: HostSessionClosingStatus

    override fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus = response
}

private val resolveCurrentMemberUseCase =
    object : ResolveCurrentMemberUseCase {
        override fun resolveByEmail(email: String): CurrentMember? = currentHost

        override fun findUserIdByEmail(email: String): UUID? = currentHost.userId

        override fun resolveByUserAndClub(
            userId: UUID,
            clubId: UUID,
        ): CurrentMember? = currentHost

        override fun resolveByEmailAndClub(
            email: String,
            clubId: UUID,
        ): CurrentMember? = currentHost

        override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()

        override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
    }

private fun hostUser(email: String = "host@example.com"): RequestPostProcessor =
    RequestPostProcessor { request ->
        request.userPrincipal = UsernamePasswordAuthenticationToken(email, "password", emptyList())
        request
    }

private val currentHost =
    CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "Host",
        accountName = "Host",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )
