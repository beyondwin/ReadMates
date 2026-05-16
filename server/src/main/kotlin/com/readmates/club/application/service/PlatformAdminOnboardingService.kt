package com.readmates.club.application.service

import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.FirstHostPreviewKind
import com.readmates.club.application.model.HostOnboardingResultKind
import com.readmates.club.application.model.PlatformAdminDomainPreview
import com.readmates.club.application.model.PlatformAdminEmailDeliveryResult
import com.readmates.club.application.model.PlatformAdminEmailDeliveryStatus
import com.readmates.club.application.model.PlatformAdminFirstHostPreview
import com.readmates.club.application.model.PlatformAdminHostOnboardingResult
import com.readmates.club.application.model.PlatformAdminOnboardingClubPreview
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.out.CreateClubDomainPort
import com.readmates.club.application.port.out.CreateClubDomainResult
import com.readmates.club.application.port.out.CreatePlatformAdminClubCommand
import com.readmates.club.application.port.out.CreatePlatformAdminHostInvitationCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

private const val EXISTING_USER_CONFIRMATION = "ASSIGN_EXISTING_USER_AS_HOST"

@Service
class PlatformAdminOnboardingService(
    private val onboardingPort: PlatformAdminOnboardingPort,
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val createClubDomainPort: CreateClubDomainPort,
    private val sendHostInvitationEmailPort: SendPlatformAdminHostInvitationEmailPort,
    private val invitationTokenService: InvitationTokenService,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : PreviewPlatformAdminClubOnboardingUseCase,
    CommitPlatformAdminClubOnboardingUseCase {
    override fun preview(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingPreview {
        requireOperator(admin)
        val normalized = normalize(command)
        val existingUser = onboardingPort.findUserByEmail(normalized.firstHost.email)
        return PlatformAdminOnboardingPreview(
            club = PlatformAdminOnboardingClubPreview(normalized.club.slug, !onboardingPort.slugExists(normalized.club.slug)),
            firstHost =
                existingUser?.let {
                    PlatformAdminFirstHostPreview(
                        kind = FirstHostPreviewKind.EXISTING_USER,
                        email = it.email,
                        existingUserId = it.userId,
                        existingUserName = it.name,
                        requiredConfirmation = EXISTING_USER_CONFIRMATION,
                    )
                } ?: PlatformAdminFirstHostPreview(
                    kind = FirstHostPreviewKind.NEW_USER,
                    email = normalized.firstHost.email,
                    existingUserId = null,
                    existingUserName = null,
                    requiredConfirmation = null,
                ),
            domain =
                normalized.domain?.let {
                    PlatformAdminDomainPreview(it.hostname, !onboardingPort.domainHostnameExists(it.hostname))
                },
        )
    }

    @Transactional
    override fun commit(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingResult {
        requireOperator(admin)
        val normalized = normalize(command)
        rejectConflicts(normalized)

        val clubId = UUID.randomUUID()
        onboardingPort.createClub(
            CreatePlatformAdminClubCommand(
                clubId = clubId,
                slug = normalized.club.slug,
                name = normalized.club.name,
                tagline = normalized.club.tagline,
                about = normalized.club.about,
            ),
        )

        val hostResult = createFirstHost(admin, clubId, normalized)
        val domain =
            normalized.domain?.let {
                when (
                    val result =
                        createClubDomainPort.createClubDomain(
                            clubId = clubId,
                            hostname = it.hostname,
                            kind = it.kind,
                            isPrimary = false,
                        )
                ) {
                    is CreateClubDomainResult.Created -> result.domain
                    CreateClubDomainResult.ClubNotFound -> throw PlatformAdminException(
                        PlatformAdminError.CLUB_NOT_FOUND,
                        "Club not found",
                    )
                    CreateClubDomainResult.DuplicateHostname -> throw PlatformAdminException(
                        PlatformAdminError.CLUB_DOMAIN_CONFLICT,
                        "Club domain hostname already exists",
                    )
                }
            }

        val club =
            loadClubsPort.loadClub(clubId)
                ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Created club not found")
        return PlatformAdminOnboardingResult(club = club, hostOnboarding = hostResult, domain = domain)
    }

    private fun createFirstHost(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminHostOnboardingResult {
        val existingUser = onboardingPort.findUserByEmail(command.firstHost.email)
        if (existingUser != null) {
            if (command.existingUserConfirmation != EXISTING_USER_CONFIRMATION) {
                throw PlatformAdminException(
                    PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED,
                    "Existing user confirmation required",
                )
            }
            onboardingPort.upsertHostMembership(clubId, existingUser.userId, command.firstHost.name)
            return PlatformAdminHostOnboardingResult(
                kind = HostOnboardingResultKind.EXISTING_USER_ASSIGNED,
                email = existingUser.email,
                userId = existingUser.userId,
                invitationId = null,
                acceptUrl = null,
                emailDelivery = PlatformAdminEmailDeliveryResult(PlatformAdminEmailDeliveryStatus.SKIPPED),
            )
        }

        val token = invitationTokenService.generateToken()
        val invitationId = UUID.randomUUID()
        onboardingPort.createHostInvitation(
            CreatePlatformAdminHostInvitationCommand(
                invitationId = invitationId,
                clubId = clubId,
                invitedByPlatformAdminUserId = admin.userId,
                email = command.firstHost.email,
                name = command.firstHost.name,
                tokenHash = invitationTokenService.hashToken(token),
                expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusDays(30),
            ),
        )
        val acceptUrl = "${appBaseUrl.trimEnd('/')}/clubs/${command.club.slug}/invite/$token"
        val deliveryStatus =
            try {
                sendHostInvitationEmailPort.send(command.firstHost.email, command.club.name, acceptUrl)
                PlatformAdminEmailDeliveryStatus.SENT
            } catch (_: Exception) {
                PlatformAdminEmailDeliveryStatus.FAILED
            }
        return PlatformAdminHostOnboardingResult(
            kind = HostOnboardingResultKind.INVITATION_CREATED,
            email = command.firstHost.email,
            userId = null,
            invitationId = invitationId,
            acceptUrl = acceptUrl,
            emailDelivery = PlatformAdminEmailDeliveryResult(deliveryStatus),
        )
    }

    private fun rejectConflicts(command: PlatformAdminOnboardingCommand) {
        if (onboardingPort.slugExists(command.club.slug)) {
            throw PlatformAdminException(PlatformAdminError.CLUB_SLUG_CONFLICT, "Club slug already exists")
        }
        if (command.domain != null && onboardingPort.domainHostnameExists(command.domain.hostname)) {
            throw PlatformAdminException(
                PlatformAdminError.CLUB_DOMAIN_CONFLICT,
                "Club domain hostname already exists",
            )
        }
    }

    private fun normalize(command: PlatformAdminOnboardingCommand): PlatformAdminOnboardingCommand {
        val club =
            command.club.copy(
                name = command.club.name.trim(),
                slug = command.club.slug.trim().lowercase(Locale.ROOT),
                tagline = command.club.tagline.trim(),
                about = command.club.about.trim(),
            )
        val firstHost =
            command.firstHost.copy(
                email = command.firstHost.email.trim().lowercase(Locale.ROOT),
                name = command.firstHost.name.trim(),
            )
        val domain =
            command.domain?.copy(hostname = command.domain.hostname.trim().removeSuffix(".").lowercase(Locale.ROOT))
        if (club.name.isBlank() || club.tagline.isBlank() || club.about.isBlank() || firstHost.name.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Club and host fields are required")
        }
        if (!CLUB_SLUG.matches(club.slug)) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Invalid club slug")
        }
        if (!EMAIL.matches(firstHost.email)) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Invalid host email")
        }
        if (domain != null) {
            validateHostname(domain.hostname)
        }
        return command.copy(club = club, firstHost = firstHost, domain = domain)
    }

    private fun validateHostname(hostname: String) {
        if (
            hostname.isBlank() ||
            hostname.contains("://") ||
            hostname.contains("/") ||
            hostname.contains(":") ||
            hostname.contains("*") ||
            hostname.any(Char::isWhitespace) ||
            hostname.length > 253 ||
            IPV4_LITERAL.matches(hostname)
        ) {
            throw PlatformAdminException(PlatformAdminError.INVALID_DOMAIN, "Invalid domain hostname")
        }
        val labels = hostname.split(".")
        if (labels.size < 2 || labels.any { label -> !HOSTNAME_LABEL.matches(label) }) {
            throw PlatformAdminException(PlatformAdminError.INVALID_DOMAIN, "Invalid domain hostname")
        }
    }

    private fun requireOperator(admin: CurrentPlatformAdmin) {
        if (!admin.canCreateClub) {
            throw AccessDeniedException("Platform admin role cannot onboard clubs")
        }
    }

    private companion object {
        private val CLUB_SLUG = Regex("^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
        private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        private val HOSTNAME_LABEL = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
        private val IPV4_LITERAL = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}$")
    }
}
