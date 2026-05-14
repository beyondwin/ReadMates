package com.readmates.club.application.service

import com.readmates.club.application.ClubLifecycleError
import com.readmates.club.application.ClubLifecycleException
import com.readmates.club.application.port.out.ClubLifecyclePort
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class ClubLifecycleServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val objectMapper = JsonMapper.builder().findAndAddModules().build()

    private val admin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            email = "admin@example.com",
            role = PlatformAdminRole.OPERATOR,
        )

    @Test
    fun `activateAfterFirstHostJoin transitions SETUP_REQUIRED to ACTIVE`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.SETUP_REQUIRED)
        val service = ClubLifecycleService(port, objectMapper)

        service.activateAfterFirstHostJoin(clubId)

        assertEquals(ClubStatus.ACTIVE, port.currentStatus)
        assertEquals(1, port.auditEvents.size)
        assertEquals("CLUB_ACTIVATED", port.auditEvents[0].eventType)
    }

    @Test
    fun `suspend transitions ACTIVE to SUSPENDED`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.ACTIVE)
        val service = ClubLifecycleService(port, objectMapper)

        service.suspend(clubId, admin, "Policy violation")

        assertEquals(ClubStatus.SUSPENDED, port.currentStatus)
        assertEquals(1, port.auditEvents.size)
        assertEquals("CLUB_SUSPENDED", port.auditEvents[0].eventType)
        assertEquals(admin.userId, port.auditEvents[0].actorUserId)
    }

    @Test
    fun `restore transitions SUSPENDED to ACTIVE`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.SUSPENDED)
        val service = ClubLifecycleService(port, objectMapper)

        service.restore(clubId, admin)

        assertEquals(ClubStatus.ACTIVE, port.currentStatus)
        assertEquals(1, port.auditEvents.size)
        assertEquals("CLUB_RESTORED", port.auditEvents[0].eventType)
    }

    @Test
    fun `archive transitions ACTIVE to ARCHIVED`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.ACTIVE)
        val service = ClubLifecycleService(port, objectMapper)

        service.archive(clubId, admin)

        assertEquals(ClubStatus.ARCHIVED, port.currentStatus)
        assertEquals(1, port.auditEvents.size)
        assertEquals("CLUB_ARCHIVED", port.auditEvents[0].eventType)
    }

    @Test
    fun `throws CLUB_NOT_FOUND when club does not exist`() {
        val port = RecordingClubLifecyclePort(initialStatus = null)
        val service = ClubLifecycleService(port, objectMapper)

        val ex =
            assertThrows<ClubLifecycleException> {
                service.activateAfterFirstHostJoin(clubId)
            }
        assertEquals(ClubLifecycleError.CLUB_NOT_FOUND, ex.error)
    }

    @Test
    fun `throws INVALID_TRANSITION when transition is not allowed`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.ARCHIVED)
        val service = ClubLifecycleService(port, objectMapper)

        val ex =
            assertThrows<ClubLifecycleException> {
                service.restore(clubId, admin)
            }
        assertEquals(ClubLifecycleError.INVALID_TRANSITION, ex.error)
    }

    @Test
    fun `audit metadata json is valid json`() {
        val port = RecordingClubLifecyclePort(initialStatus = ClubStatus.ACTIVE)
        val service = ClubLifecycleService(port, objectMapper)

        service.suspend(clubId, admin, "Test reason")

        val metadata = port.auditEvents[0].metadataJson
        assertNotNull(objectMapper.readTree(metadata))
    }

    private inner class RecordingClubLifecyclePort(
        private var initialStatus: ClubStatus?,
    ) : ClubLifecyclePort {
        var currentStatus: ClubStatus? = initialStatus
        val auditEvents = mutableListOf<AuditEventRecord>()

        override fun loadCurrentStatus(clubId: UUID): ClubStatus? = currentStatus

        override fun transitionStatus(
            clubId: UUID,
            from: ClubStatus,
            to: ClubStatus,
        ): Boolean {
            if (currentStatus != from) return false
            currentStatus = to
            return true
        }

        override fun insertAuditEvent(
            clubId: UUID,
            actorUserId: UUID?,
            actorPlatformRole: String?,
            eventType: String,
            metadataJson: String,
        ) {
            auditEvents += AuditEventRecord(actorUserId, actorPlatformRole, eventType, metadataJson)
        }
    }

    private data class AuditEventRecord(
        val actorUserId: UUID?,
        val actorPlatformRole: String?,
        val eventType: String,
        val metadataJson: String,
    )
}
