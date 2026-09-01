package com.readmates.auth.application

import com.readmates.auth.application.port.out.AuthPublicProjectionLock
import com.readmates.auth.application.port.out.AuthPublicProjectionMutation
import com.readmates.auth.application.port.out.AuthPublicProjectionMutationPort
import com.readmates.auth.application.port.out.MemberApprovalStorePort
import com.readmates.auth.application.port.out.ViewerMemberRow
import com.readmates.auth.application.service.MemberApprovalService
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.junit.jupiter.api.Test
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.time.OffsetDateTime
import java.util.UUID

class MemberApprovalServiceTest {
    @Test
    fun `public session prelock precedes viewer activation and projection record`() {
        val store = mock(MemberApprovalStorePort::class.java)
        val projection = mock(AuthPublicProjectionMutationPort::class.java)
        val lock = mock(AuthPublicProjectionLock::class.java)
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val membershipId = UUID.fromString("00000000-0000-0000-0000-000000000202")
        val host =
            ClubActor(
                userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
                membershipId = hostMembershipId,
                clubId = clubId,
                clubSlug = "reading-sai",
                capabilities = setOf(ClubCapability.MANAGE_MEMBERS),
            )
        val row =
            ViewerMemberRow(
                membershipId,
                UUID.fromString("00000000-0000-0000-0000-000000000102"),
                "viewer@example.com",
                "Viewer",
                "Viewer Account",
                null,
                MembershipStatus.ACTIVE,
                OffsetDateTime.parse("2026-01-01T00:00:00Z"),
            )
        `when`(projection.lockPotentiallyAffectedSessions(clubId)).thenReturn(lock)
        `when`(store.activateViewer(clubId, membershipId)).thenReturn(true)
        `when`(store.findMemberForHost(clubId, membershipId)).thenReturn(row)

        MemberApprovalService(store, projection).activateViewer(host, membershipId)

        inOrder(projection, store).apply {
            verify(projection).lockPotentiallyAffectedSessions(clubId)
            verify(store).activateViewer(clubId, membershipId)
            verify(projection).record(
                lock,
                AuthPublicProjectionMutation(
                    clubId,
                    hostMembershipId,
                    membershipId,
                    "VIEWER_ACTIVATED",
                    clubBodyChanged = true,
                    includeSubjectPublicContent = false,
                ),
            )
        }
    }

    @Test
    fun `viewer rejection records one immutable lifecycle receipt after the transition`() {
        val store = mock(MemberApprovalStorePort::class.java)
        val projection = mock(AuthPublicProjectionMutationPort::class.java)
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val membershipId = UUID.fromString("00000000-0000-0000-0000-000000000202")
        val host =
            ClubActor(
                userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
                membershipId = hostMembershipId,
                clubId = clubId,
                clubSlug = "reading-sai",
                capabilities = setOf(ClubCapability.MANAGE_MEMBERS),
            )
        val row =
            ViewerMemberRow(
                membershipId,
                UUID.fromString("00000000-0000-0000-0000-000000000102"),
                "viewer@example.com",
                "Viewer",
                "Viewer Account",
                null,
                MembershipStatus.INACTIVE,
                OffsetDateTime.parse("2026-01-01T00:00:00Z"),
            )
        `when`(store.deactivateViewer(clubId, membershipId)).thenReturn(true)
        `when`(store.findMemberForHost(clubId, membershipId)).thenReturn(row)

        MemberApprovalService(store, projection).deactivateViewer(host, membershipId)

        inOrder(store).apply {
            verify(store).deactivateViewer(clubId, membershipId)
            verify(store).recordViewerRejection(clubId, hostMembershipId, membershipId)
            verify(store).deleteClubAccess(clubId, membershipId)
        }
    }
}
