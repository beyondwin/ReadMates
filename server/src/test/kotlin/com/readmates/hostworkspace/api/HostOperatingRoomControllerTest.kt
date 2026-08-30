package com.readmates.hostworkspace.api

import com.readmates.auth.adapter.`in`.security.CurrentMemberArgumentResolver
import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.hostworkspace.adapter.`in`.web.HostOperatingRoomController
import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrent
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrentMeeting
import com.readmates.hostworkspace.application.model.HostOperatingRoomScheduleSeenAvailability
import com.readmates.hostworkspace.application.model.HostOperatingRoomSelection
import com.readmates.hostworkspace.application.port.`in`.GetHostOperatingRoomCurrentUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.util.UUID

class HostOperatingRoomControllerTest {
    private val useCase = RecordingCurrentUseCase()
    private val mockMvc =
        MockMvcBuilders
            .standaloneSetup(HostOperatingRoomController(useCase))
            .setCustomArgumentResolvers(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase))
            .build()

    @Test
    fun `returns the server owned current meeting contract for the URL authoritative host`() {
        useCase.response =
            HostOperatingRoomCurrent(
                HostOperatingRoomCurrentMeeting(
                    sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111"),
                    selection = HostOperatingRoomSelection.UPCOMING_DRAFT,
                    scheduleSeenAvailability = HostOperatingRoomScheduleSeenAvailability.UNAVAILABLE,
                ),
            )

        mockMvc
            .get("/api/host/operating-room/current") { with(hostUser()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.currentMeeting.sessionId") { value("11111111-1111-1111-1111-111111111111") }
                jsonPath("$.currentMeeting.selection") { value("UPCOMING_DRAFT") }
                jsonPath("$.currentMeeting.scheduleSeenAvailability") { value("UNAVAILABLE") }
            }

        assertEquals(currentHost.clubId, useCase.actor?.clubId)
        assertEquals(currentHost.membershipId, useCase.actor?.membershipId)
        assertEquals(true, useCase.actor?.activeHost)
    }

    @Test
    fun `returns an explicit null current meeting`() {
        useCase.response = HostOperatingRoomCurrent(null)

        mockMvc
            .get("/api/host/operating-room/current") { with(hostUser()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.currentMeeting") { value(null) }
            }
    }
}

private class RecordingCurrentUseCase : GetHostOperatingRoomCurrentUseCase {
    lateinit var response: HostOperatingRoomCurrent
    var actor: HostOperatingRoomActor? = null

    override fun current(actor: HostOperatingRoomActor): HostOperatingRoomCurrent {
        this.actor = actor
        return response
    }
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

private val resolveCurrentMemberUseCase =
    object : ResolveCurrentMemberUseCase {
        override fun resolveByEmail(email: String): CurrentMember? = currentHost

        override fun findUserIdByEmail(email: String): UUID? = currentHost.userId

        override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? = currentHost

        override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? = currentHost

        override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()

        override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
    }

private fun hostUser(): RequestPostProcessor =
    RequestPostProcessor { request ->
        request.userPrincipal = UsernamePasswordAuthenticationToken("host@example.com", "password", emptyList())
        request
    }
