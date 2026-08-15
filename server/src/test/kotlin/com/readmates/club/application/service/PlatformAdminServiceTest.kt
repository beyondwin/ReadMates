package com.readmates.club.application.service

import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.CreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.application.port.out.CreateClubDomainPort
import com.readmates.club.application.port.out.CreateClubDomainResult
import com.readmates.club.application.port.out.LoadClubDomainProvisioningPort
import com.readmates.club.application.port.out.LoadPlatformAdminSummaryPort
import com.readmates.club.application.port.out.UpdateClubDomainProvisioningPort
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class PlatformAdminServiceTest {
    @Test
    fun `actor with manage clubs but not domains is denied before create domain port call`() {
        val ports = DomainPorts()
        val service = PlatformAdminService(ports, ports, ports, ports, ports)

        assertThatThrownBy {
            service.createClubDomain(actor(PlatformCapability.MANAGE_CLUBS), CLUB_ID, CREATE_COMMAND)
        }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(ports.createCalls).isZero()
    }

    @Test
    fun `actor with manage clubs but not domains is denied before provisioning load port call`() {
        val ports = DomainPorts()
        val service = PlatformAdminService(ports, ports, ports, ports, ports)

        assertThatThrownBy {
            service.checkClubDomainProvisioning(actor(PlatformCapability.MANAGE_CLUBS), DOMAIN_ID)
        }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(ports.provisioningLoadCalls).isZero()
        assertThat(ports.actualCheckCalls).isZero()
        assertThat(ports.provisioningUpdateCalls).isZero()
    }

    @Test
    fun `actor with domains but not manage clubs reaches deterministic domain ports`() {
        val ports = DomainPorts()
        val service = PlatformAdminService(ports, ports, ports, ports, ports)
        val actor = actor(PlatformCapability.MANAGE_CLUB_DOMAINS)

        assertThat(service.createClubDomain(actor, CLUB_ID, CREATE_COMMAND)).isEqualTo(ports.createdDomain)
        assertThat(service.checkClubDomainProvisioning(actor, DOMAIN_ID)).isEqualTo(ports.updatedDomain)

        assertThat(ports.createCalls).isEqualTo(1)
        assertThat(ports.provisioningLoadCalls).isEqualTo(1)
        assertThat(ports.actualCheckCalls).isEqualTo(1)
        assertThat(ports.provisioningUpdateCalls).isEqualTo(1)
    }

    private fun actor(vararg capabilities: PlatformCapability): PlatformActor =
        PlatformActor(UUID.fromString("00000000-0000-0000-0000-0000000000cc"), capabilities.toSet())

    private class DomainPorts :
        LoadPlatformAdminSummaryPort,
        CreateClubDomainPort,
        LoadClubDomainProvisioningPort,
        UpdateClubDomainProvisioningPort,
        CheckClubDomainActualStatePort {
        val createdDomain = domain(hostname = "club.example.test", status = ClubDomainStatus.REQUESTED)
        val updatedDomain = domain(hostname = "club.example.test", status = ClubDomainStatus.ACTIVE)
        var createCalls = 0
        var provisioningLoadCalls = 0
        var actualCheckCalls = 0
        var provisioningUpdateCalls = 0

        override fun countActiveClubs(): Long = 0

        override fun countDomainsRequiringAction(): Long = 0

        override fun listDomains(limit: Int): List<PlatformAdminClubDomain> = emptyList()

        override fun listDomainsRequiringAction(limit: Int): List<PlatformAdminClubDomain> = emptyList()

        override fun createClubDomain(
            clubId: UUID,
            hostname: String,
            kind: ClubDomainKind,
            isPrimary: Boolean,
        ): CreateClubDomainResult {
            createCalls += 1
            return CreateClubDomainResult.Created(createdDomain)
        }

        override fun loadClubDomain(domainId: UUID): PlatformAdminClubDomain? {
            provisioningLoadCalls += 1
            return createdDomain
        }

        override fun updateClubDomainProvisioning(
            domainId: UUID,
            status: ClubDomainStatus,
            verifiedAt: OffsetDateTime?,
            lastCheckedAt: OffsetDateTime,
            errorCode: String?,
        ): PlatformAdminClubDomain? {
            provisioningUpdateCalls += 1
            return updatedDomain
        }

        override fun check(hostname: String): ClubDomainActualCheckResult {
            actualCheckCalls += 1
            return ClubDomainActualCheckResult(ClubDomainStatus.ACTIVE, null)
        }

        private fun domain(
            hostname: String,
            status: ClubDomainStatus,
        ): PlatformAdminClubDomain =
            PlatformAdminClubDomain(
                id = DOMAIN_ID,
                clubId = CLUB_ID,
                hostname = hostname,
                kind = ClubDomainKind.CUSTOM_DOMAIN,
                status = status,
                isPrimary = false,
                verifiedAt = null,
                lastCheckedAt = OffsetDateTime.of(2026, 8, 12, 0, 0, 0, 0, ZoneOffset.UTC),
                errorCode = null,
            )
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val DOMAIN_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val CREATE_COMMAND: CreateClubDomainCommand =
            CreateClubDomainCommand("club.example.test", ClubDomainKind.CUSTOM_DOMAIN, false)
    }
}
