package com.readmates.club.application.service

import com.readmates.club.application.model.ConfirmCreateClubDomainCommand
import com.readmates.club.application.model.PreviewCreateClubDomainCommand
import com.readmates.club.application.model.RecheckClubDomainCommand
import com.readmates.club.application.port.out.LoadClubDomainProvisioningPort
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubCommandPort
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.util.UUID

class PlatformAdminServiceTest {
    private val domainPort = mock(LoadClubDomainProvisioningPort::class.java)
    private val clubsPort = mock(LoadPlatformAdminClubsPort::class.java)
    private val commandPort = mock(PlatformAdminClubCommandPort::class.java)
    private val identityService = mock(AdminCommandIdentityService::class.java)
    private val idempotencyService = mock(AdminCommandIdempotencyService::class.java)
    private val transactionTemplate = mock(TransactionTemplate::class.java)
    private val convergenceService = mock(PlatformAdminDomainConvergenceService::class.java)
    private val service =
        PlatformAdminDomainCommandService(
            domainPort,
            clubsPort,
            commandPort,
            identityService,
            idempotencyService,
            AdminCommandIdempotencyProperties(),
            transactionTemplate,
            convergenceService,
            Clock.systemUTC(),
        )

    @Test
    fun `actor without domain capability is denied before preview persistence`() {
        assertThatThrownBy {
            service.previewClubDomain(
                actor(PlatformCapability.MANAGE_CLUBS),
                CLUB_ID,
                PreviewCreateClubDomainCommand(0, "club.example.test", ClubDomainKind.CUSTOM_DOMAIN, false),
            )
        }.isInstanceOf(AccessDeniedException::class.java)

        verifyNoInteractions(clubsPort, commandPort, identityService)
    }

    @Test
    fun `actor without domain capability is denied before confirm claim`() {
        assertThatThrownBy {
            service.createClubDomain(
                actor(PlatformCapability.MANAGE_CLUBS),
                CLUB_ID,
                ConfirmCreateClubDomainCommand(
                    UUID.randomUUID(),
                    "safe-test-key",
                    0,
                    "club.example.test",
                    ClubDomainKind.CUSTOM_DOMAIN,
                    false,
                    true,
                ),
            )
        }.isInstanceOf(AccessDeniedException::class.java)

        verifyNoInteractions(commandPort, identityService, idempotencyService, transactionTemplate)
    }

    @Test
    fun `actor without domain capability is denied before recheck target load`() {
        assertThatThrownBy {
            service.checkClubDomainProvisioning(
                actor(PlatformCapability.MANAGE_CLUBS),
                UUID.randomUUID(),
                RecheckClubDomainCommand("safe-test-key", ClubDomainStatus.ACTION_REQUIRED),
            )
        }.isInstanceOf(AccessDeniedException::class.java)

        verifyNoInteractions(domainPort, commandPort, idempotencyService, transactionTemplate)
    }

    private fun actor(vararg capabilities: PlatformCapability): PlatformActor =
        PlatformActor(
            UUID.fromString("00000000-0000-0000-0000-0000000000cc"),
            PlatformAdminRole.OPERATOR,
            capabilities.toSet(),
        )

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    }
}
