package com.readmates.club.application.service

import com.readmates.club.application.model.CreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.port.`in`.CheckClubDomainProvisioningUseCase
import com.readmates.club.application.port.`in`.CreateClubDomainUseCase
import com.readmates.club.application.port.`in`.PlatformAdminSummaryUseCase
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.application.port.out.CreateClubDomainPort
import com.readmates.club.application.port.out.LoadClubDomainProvisioningPort
import com.readmates.club.application.port.out.LoadPlatformAdminSummaryPort
import com.readmates.club.application.port.out.UpdateClubDomainProvisioningPort
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.AccessDeniedException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

@Service
class PlatformAdminService(
    private val summaryPort: LoadPlatformAdminSummaryPort,
    private val createClubDomainPort: CreateClubDomainPort,
    private val loadClubDomainProvisioningPort: LoadClubDomainProvisioningPort,
    private val updateClubDomainProvisioningPort: UpdateClubDomainProvisioningPort,
    private val checkClubDomainActualStatePort: CheckClubDomainActualStatePort,
) : PlatformAdminSummaryUseCase,
    CreateClubDomainUseCase,
    CheckClubDomainProvisioningUseCase {
    override fun summary(admin: CurrentPlatformAdmin): PlatformAdminDashboardSummary =
        PlatformAdminDashboardSummary(
            platformRole = admin.role,
            activeClubCount = summaryPort.countActiveClubs(),
            domainActionRequiredCount = summaryPort.countDomainsRequiringAction(),
            domains = summaryPort.listDomains(limit = 20),
            domainsRequiringAction = summaryPort.listDomainsRequiringAction(limit = 20),
        )

    override fun createClubDomain(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: CreateClubDomainCommand,
    ): PlatformAdminClubDomain {
        if (!admin.canManageClubDomains) {
            throw AccessDeniedException("Platform admin role cannot manage club domains")
        }

        val hostname = normalizeHostname(command.hostname)
        validateHostname(hostname)
        if (command.isPrimary) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Pending club domains cannot become primary")
        }

        return createClubDomainPort.createClubDomain(
            clubId = clubId,
            hostname = hostname,
            kind = command.kind,
            isPrimary = command.isPrimary,
        )
    }

    override fun checkClubDomainProvisioning(
        admin: CurrentPlatformAdmin,
        domainId: UUID,
    ): PlatformAdminClubDomain {
        if (!admin.canManageClubDomains) {
            throw AccessDeniedException("Platform admin role cannot manage club domains")
        }

        val domain = loadClubDomainProvisioningPort.loadClubDomain(domainId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club domain not found")
        if (domain.status == ClubDomainStatus.DISABLED) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Disabled club domain cannot be checked")
        }

        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val result = checkClubDomainActualStatePort.check(domain.hostname)
        val status = if (result.status == ClubDomainStatus.ACTIVE) {
            ClubDomainStatus.ACTIVE
        } else {
            ClubDomainStatus.FAILED
        }

        return updateClubDomainProvisioningPort.updateClubDomainProvisioning(
            domainId = domainId,
            status = status,
            verifiedAt = now.takeIf { status == ClubDomainStatus.ACTIVE },
            lastCheckedAt = now,
            errorCode = result.errorCode.takeIf { status == ClubDomainStatus.FAILED },
        )
    }

    private fun normalizeHostname(hostname: String): String =
        hostname.trim()
            .removeSuffix(".")
            .lowercase(Locale.ROOT)

    private fun validateHostname(hostname: String) {
        if (hostname.isBlank()) {
            throw invalidHostname()
        }
        if (hostname == PAGES_DEV_FALLBACK_HOSTNAME) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Platform fallback hostname cannot be a club domain")
        }
        if (
            hostname.contains("://") ||
            hostname.contains("/") ||
            hostname.contains(":") ||
            hostname.contains("*") ||
            hostname.any(Char::isWhitespace) ||
            hostname == "localhost" ||
            hostname.length > 253 ||
            IPV4_LITERAL.matches(hostname)
        ) {
            throw invalidHostname()
        }

        val labels = hostname.split(".")
        if (labels.size < 2 || labels.any { label -> label.isBlank() || label.length > 63 || !HOSTNAME_LABEL.matches(label) }) {
            throw invalidHostname()
        }
    }

    private fun invalidHostname(): ResponseStatusException =
        ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid domain hostname")

    companion object {
        private const val PAGES_DEV_FALLBACK_HOSTNAME = "readmates.pages.dev"
        private val HOSTNAME_LABEL = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
        private val IPV4_LITERAL = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}$")
    }
}
