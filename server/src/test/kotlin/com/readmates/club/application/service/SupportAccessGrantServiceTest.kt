package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.CreateSupportAccessGrantPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.RevokeSupportAccessGrantPort
import com.readmates.club.application.port.out.WritePlatformAuditEventPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class SupportAccessGrantServiceTest {
    @Test
    fun `operator cannot create grant`() {
        assertThatThrownBy {
            service().createSupportAccessGrant(admin(PlatformAdminRole.OPERATOR), validCommand())
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `blank reason is rejected`() {
        assertError(validCommand(reason = " "), PlatformAdminError.GRANT_REASON_REQUIRED)
    }

    @Test
    fun `past expiry is rejected`() {
        assertError(
            validCommand(expiresAt = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1)),
            PlatformAdminError.GRANT_EXPIRY_IN_PAST,
        )
    }

    @Test
    fun `expiry beyond 24 hours is rejected`() {
        assertError(
            validCommand(expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusHours(25)),
            PlatformAdminError.GRANT_EXPIRY_TOO_LONG,
        )
    }

    @Test
    fun `ineligible grantee is rejected`() {
        assertError(
            validCommand(),
            PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE,
            ledger = FakeLedgerPort(activePlatformAdmin = false),
        )
    }

    @Test
    fun `duplicate active grant is rejected`() {
        assertError(
            validCommand(),
            PlatformAdminError.GRANT_DUPLICATE_ACTIVE,
            ledger = FakeLedgerPort(activeGrant = true),
        )
    }

    private fun assertError(
        command: CreateSupportAccessGrantCommand,
        error: PlatformAdminError,
        ledger: FakeLedgerPort = FakeLedgerPort(),
    ) {
        assertThatThrownBy { service(ledger).createSupportAccessGrant(admin(PlatformAdminRole.OWNER), command) }
            .isInstanceOfSatisfying(PlatformAdminException::class.java) { exception ->
                org.assertj.core.api.Assertions
                    .assertThat(exception.error)
                    .isEqualTo(error)
            }
    }

    private fun service(ledger: FakeLedgerPort = FakeLedgerPort()): SupportAccessGrantService =
        SupportAccessGrantService(
            createGrantPort = FakeCreateGrantPort(),
            revokeGrantPort = FakeRevokeGrantPort(),
            loadGrantPort = FakeLoadGrantPort(),
            grantLedgerPort = ledger,
            auditEventPort = FakeAuditPort(),
            objectMapper = ObjectMapper(),
        )

    private fun validCommand(
        reason: String = "Ticket escalation",
        expiresAt: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC).plusHours(2),
    ): CreateSupportAccessGrantCommand =
        CreateSupportAccessGrantCommand(
            CLUB_ID,
            GRANTEE_ID,
            SupportAccessGrantScope.HOST_SUPPORT_READ,
            reason,
            expiresAt,
        )

    @Suppress("ktlint:standard:function-expression-body")
    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin {
        return CurrentPlatformAdmin(OWNER_ID, "owner@example.com", role)
    }
}

private class FakeLedgerPort(
    private val activePlatformAdmin: Boolean = true,
    private val activeGrant: Boolean = false,
) : AdminSupportGrantLedgerPort {
    override fun listLedger(
        clubId: UUID?,
        granteeUserId: UUID?,
        limit: Int,
    ) = emptyList<com.readmates.club.application.model.AdminSupportGrantLedgerItem>()

    override fun hasActiveGrant(
        clubId: UUID,
        granteeUserId: UUID,
    ): Boolean = activeGrant

    override fun isGrantEligibleClub(clubId: UUID): Boolean = true

    override fun isActivePlatformAdmin(userId: UUID): Boolean = activePlatformAdmin
}

private class FakeCreateGrantPort : CreateSupportAccessGrantPort {
    override fun createGrant(
        clubId: UUID,
        grantedByUserId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        reason: String,
        expiresAt: OffsetDateTime,
    ): SupportAccessGrant =
        SupportAccessGrant(
            UUID.randomUUID(),
            clubId,
            grantedByUserId,
            granteeUserId,
            scope,
            reason,
            expiresAt,
            null,
            OffsetDateTime.now(ZoneOffset.UTC),
        )
}

private class FakeRevokeGrantPort : RevokeSupportAccessGrantPort {
    override fun revokeGrant(
        grantId: UUID,
        revokedAt: OffsetDateTime,
    ): SupportAccessGrant? = null
}

private class FakeLoadGrantPort : LoadSupportAccessGrantPort {
    override fun loadActiveGrantsByClub(clubId: UUID) = emptyList<SupportAccessGrant>()

    override fun loadActiveGrantsByGrantee(granteeUserId: UUID) = emptyList<SupportAccessGrant>()

    override fun loadActiveGrantByGranteeAndClub(
        granteeUserId: UUID,
        clubId: UUID,
    ): SupportAccessGrant? = null
}

private class FakeAuditPort : WritePlatformAuditEventPort {
    override fun writeEvent(
        actorUserId: UUID,
        actorPlatformRole: String,
        targetUserId: UUID?,
        eventType: String,
        metadataJson: String,
    ) = Unit
}

private val OWNER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private val GRANTEE_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
