package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CLUB_ONBOARDING_COMMAND_TYPE
import com.readmates.club.application.model.CLUB_ONBOARDING_SCHEMA_VERSION
import com.readmates.club.application.model.ConfirmPlatformAdminOnboardingCommand
import com.readmates.club.application.model.FirstHostPreviewKind
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingPreview
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.out.DerivePlatformAdminHostInvitationTokenPort
import com.readmates.club.application.port.out.LoadPlatformAdminOnboardingPreviewResult
import com.readmates.club.application.port.out.PlatformAdminOnboardingCommandPort
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
import com.readmates.club.application.port.out.StorePlatformAdminOnboardingOriginCommand
import com.readmates.club.application.port.out.StorePlatformAdminOnboardingOriginResult
import com.readmates.club.application.port.out.StoredPlatformAdminOnboardingPreview
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.util.Locale
import java.util.UUID

private const val EXISTING_USER_CONFIRMATION = "ASSIGN_EXISTING_USER_AS_HOST"
private const val HOST_INVITATION_TTL_DAYS = 30L
private const val HOSTNAME_MAX_LENGTH = 253
private const val HOSTNAME_MIN_LABEL_COUNT = 2
private const val BASE_EVENT_COUNT = 2
private const val DOMAIN_EVENT_COUNT = 3
private val CLUB_SLUG = Regex("^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
private val HOSTNAME_LABEL = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
private val IPV4_LITERAL = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}$")
private val FORBIDDEN_HOSTNAME_PARTS = listOf("://", "/", ":", "*")

@Service
class PlatformAdminOnboardingService(
    private val onboardingQueries: PlatformAdminOnboardingPort,
    private val commandPort: PlatformAdminOnboardingCommandPort,
    private val tokenDeriver: DerivePlatformAdminHostInvitationTokenPort,
    private val identityService: AdminCommandIdentityService,
    private val idempotencyService: AdminCommandIdempotencyService,
    private val properties: AdminCommandIdempotencyProperties,
    private val transactions: TransactionTemplate,
    private val domainConvergenceService: PlatformAdminDomainConvergenceService,
    private val clock: Clock,
) : PreviewPlatformAdminClubOnboardingUseCase,
    CommitPlatformAdminClubOnboardingUseCase {
    override fun preview(
        admin: PlatformActor,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingPreview {
        requireOperator(admin)
        val normalized = PlatformAdminOnboardingPolicy.normalize(command)
        val existingUser = onboardingQueries.findUserByEmail(normalized.firstHost.email)
        val firstHostKind =
            if (existingUser == null) FirstHostPreviewKind.NEW_USER else FirstHostPreviewKind.EXISTING_USER
        val previewId = UUID.randomUUID()
        val request = PlatformAdminOnboardingPolicy.request(previewId, normalized, firstHostKind)
        val identity = PlatformAdminOnboardingPolicy.identity(admin, previewId.toString())
        val digest = identityService.resolve(identity, request).digests.current
        val now = clock.instant()
        val prerequisites = prerequisiteCodes(normalized, firstHostKind)
        val impactCodes = impactCodes(normalized, firstHostKind)
        val preview =
            StoredPlatformAdminOnboardingPreview(
                previewId = previewId,
                actorAdminId = admin.adminId,
                actorRoleSnapshot = admin.role.name,
                actorCapabilities = admin.capabilitySnapshots(),
                newClubSlotId = previewId,
                canonicalSchemaVersion = digest.schemaVersion,
                digestKeyVersion = digest.digestKeyVersion,
                requestHmac = digest.requestHmac,
                clubSlug = normalized.club.slug,
                firstHostKind = firstHostKind,
                requiredConfirmation = EXISTING_USER_CONFIRMATION.takeIf { existingUser != null },
                impactCodes = impactCodes,
                prerequisiteCodes = prerequisites,
                expiresAt = now.plus(properties.previewTtl),
                consumedAt = null,
                consumedReceiptId = null,
                createdAt = now,
            )
        commandPort.saveOnboardingPreview(preview)
        return PlatformAdminOnboardingPreview(
            previewId = preview.previewId,
            expiresAt = preview.expiresAt,
            clubSlug = preview.clubSlug,
            firstHostKind = preview.firstHostKind,
            requiredConfirmation = preview.requiredConfirmation,
            impactCodes = preview.impactCodes,
            prerequisiteCodes = preview.prerequisiteCodes,
            requestFingerprintPrefix = preview.requestHmac.fingerprintPrefix(),
        )
    }

    override fun commit(
        admin: PlatformActor,
        command: ConfirmPlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingResult {
        requireOperator(admin)
        if (!command.confirmed) fail(PlatformAdminError.CONFIRMATION_REQUIRED)
        PlatformAdminCommandInputPolicy.requireIdempotencyKey(command.idempotencyKey)
        val normalized = PlatformAdminOnboardingPolicy.normalize(command.onboarding)
        val request = PlatformAdminOnboardingPolicy.request(command.previewId, normalized)
        val identity = PlatformAdminOnboardingPolicy.identity(admin, command.idempotencyKey)
        val result =
            checkNotNull(
                transactions.execute { claimAndStore(admin, command, normalized, identity, request) },
            )
        commandPort.loadOnboardingDomainConvergenceId(result.receiptId)?.let(domainConvergenceService::process)
        return result
    }

    private fun prerequisiteCodes(
        command: PlatformAdminOnboardingCommand,
        firstHostKind: FirstHostPreviewKind,
    ): List<String> =
        buildList {
            if (onboardingQueries.slugExists(command.club.slug)) add("CLUB_SLUG_CONFLICT")
            if (command.domain != null && onboardingQueries.domainHostnameExists(command.domain.hostname)) {
                add("CLUB_DOMAIN_CONFLICT")
            }
            if (firstHostKind == FirstHostPreviewKind.EXISTING_USER) add("EXISTING_USER_CONFIRMATION_REQUIRED")
        }

    private fun impactCodes(
        command: PlatformAdminOnboardingCommand,
        firstHostKind: FirstHostPreviewKind,
    ): List<String> =
        buildList {
            add("CREATE_CLUB")
            add(
                if (firstHostKind == FirstHostPreviewKind.NEW_USER) {
                    "CREATE_HOST_INVITATION"
                } else {
                    "ASSIGN_EXISTING_HOST"
                },
            )
            if (command.domain != null) add("CREATE_DOMAIN")
        }

    private fun claimAndStore(
        admin: PlatformActor,
        command: ConfirmPlatformAdminOnboardingCommand,
        normalized: PlatformAdminOnboardingCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ): PlatformAdminOnboardingResult =
        when (val claim = idempotencyService.claim(identity, request)) {
            is AdminCommandClaimResult.Completed -> replay(claim, admin)
            AdminCommandClaimResult.Conflict -> fail(PlatformAdminError.IDEMPOTENCY_CONFLICT)
            AdminCommandClaimResult.InProgress -> fail(PlatformAdminError.COMMAND_IN_PROGRESS)
            is AdminCommandClaimResult.Claimed -> execute(admin, command, normalized, identity, request, claim)
        }

    private fun execute(
        admin: PlatformActor,
        command: ConfirmPlatformAdminOnboardingCommand,
        normalized: PlatformAdminOnboardingCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
        claim: AdminCommandClaimResult.Claimed,
    ): PlatformAdminOnboardingResult {
        val preview =
            when (val loaded = commandPort.loadOnboardingPreview(command.previewId)) {
                is LoadPlatformAdminOnboardingPreviewResult.Loaded -> loaded.preview
                LoadPlatformAdminOnboardingPreviewResult.Missing -> fail(PlatformAdminError.PREVIEW_NOT_FOUND)
                LoadPlatformAdminOnboardingPreviewResult.CommandMismatch -> fail(PlatformAdminError.PREVIEW_MISMATCH)
            }
        validatePreview(preview, admin, normalized, identity, request)
        val source = commandPort.lockOnboardingSource(normalized)
        if (source.slugExists) fail(PlatformAdminError.CLUB_SLUG_CONFLICT)
        if (source.domainExists) fail(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
        val actualKind =
            if (source.existingUser == null) FirstHostPreviewKind.NEW_USER else FirstHostPreviewKind.EXISTING_USER
        if (actualKind != preview.firstHostKind) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (
            actualKind == FirstHostPreviewKind.EXISTING_USER &&
            normalized.existingUserConfirmation != EXISTING_USER_CONFIRMATION
        ) {
            fail(PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED)
        }

        val clubId = UUID.randomUUID()
        val invitationId = UUID.randomUUID().takeIf { source.existingUser == null }
        val derived = invitationId?.let { tokenDeriver.derive(it, clubId, claim.currentDigest.digestKeyVersion) }
        val domainId = UUID.randomUUID().takeIf { normalized.domain != null }
        val occurredAt = clock.instant()
        val stored =
            commandPort.storeOnboardingOrigin(
                StorePlatformAdminOnboardingOriginCommand(
                    preview = preview,
                    command = normalized,
                    clubId = clubId,
                    membershipId = UUID.randomUUID().takeIf { source.existingUser != null },
                    invitationId = invitationId,
                    domainId = domainId,
                    receiptId = UUID.randomUUID(),
                    platformAuditEventId = UUID.randomUUID(),
                    clubAuditEventIds = List(auditEventCount(domainId)) { UUID.randomUUID() },
                    hostConvergenceId = UUID.randomUUID().takeIf { invitationId != null },
                    domainConvergenceId = UUID.randomUUID().takeIf { domainId != null },
                    existingUser = source.existingUser,
                    invitationTokenHash = derived?.tokenHash,
                    invitationExpiresAt = invitationId?.let { occurredAt.plus(HOST_INVITATION_TTL) },
                    actorAdminId = admin.adminId,
                    actorRoleSnapshot = admin.role.name,
                    actorCapabilities = admin.capabilitySnapshots(),
                    digest = claim.currentDigest,
                    occurredAt = occurredAt,
                ),
            )
        val result = storedResult(stored)
        if (!idempotencyService.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, result.receiptId.toString())) {
            fail(PlatformAdminError.COMMAND_IN_PROGRESS)
        }
        return result
    }

    private fun storedResult(stored: StorePlatformAdminOnboardingOriginResult): PlatformAdminOnboardingResult =
        when (stored) {
            is StorePlatformAdminOnboardingOriginResult.Stored -> stored.result
            StorePlatformAdminOnboardingOriginResult.PreviewConsumed -> fail(PlatformAdminError.PREVIEW_CONSUMED)
            StorePlatformAdminOnboardingOriginResult.SlugConflict -> fail(PlatformAdminError.CLUB_SLUG_CONFLICT)
            StorePlatformAdminOnboardingOriginResult.DomainConflict -> fail(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
        }

    private fun validatePreview(
        preview: StoredPlatformAdminOnboardingPreview,
        admin: PlatformActor,
        normalized: PlatformAdminOnboardingCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ) {
        val actorMatches =
            preview.actorAdminId == admin.adminId &&
                preview.actorRoleSnapshot == admin.role.name &&
                preview.actorCapabilities.toSet() == admin.capabilitySnapshots().toSet()
        if (!actorMatches || preview.newClubSlotId != preview.previewId) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (preview.consumedAt != null || preview.consumedReceiptId != null) fail(PlatformAdminError.PREVIEW_CONSUMED)
        if (!preview.expiresAt.isAfter(clock.instant())) fail(PlatformAdminError.PREVIEW_EXPIRED)
        if (preview.clubSlug != normalized.club.slug) fail(PlatformAdminError.PREVIEW_MISMATCH)
        val digest =
            identityService
                .resolve(identity, request)
                .digests.lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: fail(PlatformAdminError.PREVIEW_MISMATCH)
        val schemaMatches = preview.canonicalSchemaVersion == digest.schemaVersion
        val requestMatches = RequestIdentityHmac.equal(preview.requestHmac, digest.requestHmac)
        if (!(schemaMatches and requestMatches)) fail(PlatformAdminError.PREVIEW_MISMATCH)
    }

    private fun replay(
        claim: AdminCommandClaimResult.Completed,
        admin: PlatformActor,
    ): PlatformAdminOnboardingResult =
        commandPort.loadOnboardingReceipt(UUID.fromString(claim.receiptId), admin.adminId)
            ?: fail(PlatformAdminError.PREVIEW_MISMATCH)

    private fun requireOperator(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.CREATE_CLUB)) {
            throw AccessDeniedException("Platform admin role cannot onboard clubs")
        }
    }

    private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)

    private companion object {
        private const val RECEIPT_TYPE = "platform_admin_club_command_receipt"
        private val HOST_INVITATION_TTL: Duration = Duration.ofDays(HOST_INVITATION_TTL_DAYS)
    }
}

internal object PlatformAdminOnboardingPolicy {
    fun identity(
        admin: PlatformActor,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        platformAdminUserId = admin.adminId,
        commandType = CLUB_ONBOARDING_COMMAND_TYPE,
        targetType = "new-club",
        targetId = "new-club",
        idempotencyKey = idempotencyKey,
    )

    fun request(
        previewId: UUID,
        command: PlatformAdminOnboardingCommand,
        previewKind: FirstHostPreviewKind? = null,
    ): CanonicalAdminCommandRequest =
        object : CanonicalAdminCommandRequest {
            override val schemaVersion: String = CLUB_ONBOARDING_SCHEMA_VERSION

            override fun canonicalFields(): List<Pair<String, String>> =
                listOf(
                    "about" to command.club.about,
                    "clubName" to command.club.name,
                    "clubSlug" to command.club.slug,
                    "confirmed" to "true",
                    "domainHostname" to (command.domain?.hostname ?: ""),
                    "domainKind" to (command.domain?.kind?.name ?: ""),
                    "existingUserConfirmation" to confirmation(command, previewKind),
                    "firstHostEmail" to command.firstHost.email,
                    "firstHostName" to command.firstHost.name,
                    "previewId" to previewId.toString(),
                    "tagline" to command.club.tagline,
                )
        }

    fun normalize(command: PlatformAdminOnboardingCommand): PlatformAdminOnboardingCommand {
        validateOnboardingRawText(command)
        val club =
            command.club.copy(
                name = command.club.name.trim(),
                slug =
                    command.club.slug
                        .trim()
                        .lowercase(Locale.ROOT),
                tagline = command.club.tagline.trim(),
                about =
                    normalizeOnboardingAbout(command.club.about)
                        .trim(),
            )
        val host =
            command.firstHost.copy(
                email =
                    command.firstHost.email
                        .trim()
                        .lowercase(Locale.ROOT),
                name = command.firstHost.name.trim(),
            )
        val domain =
            command.domain?.copy(
                hostname =
                    command.domain.hostname
                        .trim()
                        .removeSuffix(".")
                        .lowercase(Locale.ROOT),
            )
        validateRequiredFields(club.name, club.tagline, club.about, host.name)
        validateNormalizedOnboardingText(club.name, club.tagline, club.about, host.name, host.email)
        validateSlug(club.slug)
        validateEmail(host.email)
        domain?.let { validateHostname(it.hostname) }
        return command.copy(
            club = club,
            firstHost = host,
            domain = domain,
            existingUserConfirmation = command.existingUserConfirmation?.trim()?.takeIf(String::isNotEmpty),
        )
    }

    private fun confirmation(
        command: PlatformAdminOnboardingCommand,
        previewKind: FirstHostPreviewKind?,
    ): String =
        when (previewKind) {
            FirstHostPreviewKind.EXISTING_USER -> EXISTING_USER_CONFIRMATION
            FirstHostPreviewKind.NEW_USER -> ""
            null -> command.existingUserConfirmation ?: ""
        }
}

private fun validateRequiredFields(vararg values: String) {
    if (values.any(String::isBlank)) failValidation(PlatformAdminError.INVALID_CLUB)
}

private fun validateSlug(slug: String) {
    if (!CLUB_SLUG.matches(slug)) failValidation(PlatformAdminError.INVALID_CLUB)
}

private fun validateEmail(email: String) {
    if (!EMAIL.matches(email)) failValidation(PlatformAdminError.INVALID_CLUB)
}

private fun validateHostname(hostname: String) {
    if (hostname.hasInvalidShape()) {
        failValidation(PlatformAdminError.INVALID_DOMAIN)
    }
    val labels = hostname.split(".")
    if (labels.size < HOSTNAME_MIN_LABEL_COUNT || labels.any { !HOSTNAME_LABEL.matches(it) }) {
        failValidation(PlatformAdminError.INVALID_DOMAIN)
    }
}

private fun auditEventCount(domainId: UUID?): Int = if (domainId == null) BASE_EVENT_COUNT else DOMAIN_EVENT_COUNT

private fun String.hasInvalidShape(): Boolean = hasInvalidCharacters() || isTooLong() || isIpv4Literal()

private fun String.hasInvalidCharacters(): Boolean = isBlank() || containsForbiddenPart() || any(Char::isWhitespace)

private fun String.containsForbiddenPart(): Boolean = FORBIDDEN_HOSTNAME_PARTS.any(::contains)

private fun String.isTooLong(): Boolean = length > HOSTNAME_MAX_LENGTH

private fun String.isIpv4Literal(): Boolean = IPV4_LITERAL.matches(this)

private fun failValidation(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)
