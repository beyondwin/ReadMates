package com.readmates.club.application.model

import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import java.text.Normalizer
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Locale
import java.util.UUID

typealias ClubLifecycleState = ClubStatus
typealias PublicVisibility = ClubPublicVisibility
typealias PlatformAdminDomainStatus = ClubDomainStatus

const val PLATFORM_ADMIN_CLUB_LIST_DEFAULT_LIMIT = 100
const val PLATFORM_ADMIN_CLUB_LIST_MAX_LIMIT = 100

data class PlatformAdminDashboardSummary(
    val platformRole: PlatformAdminRole,
    val activeClubCount: Long,
    val domainActionRequiredCount: Long,
    val domains: List<PlatformAdminClubDomain>,
    val domainsRequiringAction: List<PlatformAdminClubDomain>,
)

data class PreviewCreateClubDomainCommand(
    val expectedAdminRevision: Long,
    val hostname: String,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
)

data class ConfirmCreateClubDomainCommand(
    val previewId: UUID,
    val idempotencyKey: String,
    val expectedAdminRevision: Long,
    val hostname: String,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
    val confirmed: Boolean,
)

data class RecheckClubDomainCommand(
    val idempotencyKey: String,
    val expectedStatus: ClubDomainStatus,
)

data class PlatformAdminClubDomain(
    val id: UUID,
    val clubId: UUID,
    val hostname: String,
    val kind: ClubDomainKind,
    val status: ClubDomainStatus,
    val isPrimary: Boolean,
    val verifiedAt: OffsetDateTime?,
    val lastCheckedAt: OffsetDateTime?,
    val errorCode: String?,
)

data class ClubDomainActualCheckResult(
    val status: ClubDomainStatus,
    val errorCode: String?,
)

@JvmInline
value class NormalizedClubDomainHostname(
    val value: String,
) {
    init {
        require(value.isNotBlank()) { "Normalized club domain hostname must not be blank" }
    }
}

enum class PlatformAdminDomainDesiredState {
    ENABLED,
    DISABLED,
}

enum class PlatformAdminDomainManualAction {
    CLOUDFLARE_PAGES_CUSTOM_DOMAIN,
    NONE,
}

val PlatformAdminClubDomain.desiredState: PlatformAdminDomainDesiredState
    get() =
        if (status == ClubDomainStatus.DISABLED) {
            PlatformAdminDomainDesiredState.DISABLED
        } else {
            PlatformAdminDomainDesiredState.ENABLED
        }

val PlatformAdminClubDomain.manualAction: PlatformAdminDomainManualAction
    get() =
        if (status == ClubDomainStatus.ACTION_REQUIRED) {
            PlatformAdminDomainManualAction.CLOUDFLARE_PAGES_CUSTOM_DOMAIN
        } else {
            PlatformAdminDomainManualAction.NONE
        }

data class PlatformAdminClubListQuery(
    val search: String? = null,
    val lifecycle: ClubLifecycleState? = null,
    val visibility: PublicVisibility? = null,
    val domainStatus: PlatformAdminDomainStatus? = null,
    val onboardingState: FirstHostOnboardingState? = null,
    val cursor: String? = null,
    val limit: Int = PLATFORM_ADMIN_CLUB_LIST_DEFAULT_LIMIT,
)

data class PlatformAdminClubList(
    val items: List<PlatformAdminClubListItem>,
    val nextCursor: String? = null,
)

data class PlatformAdminClubListItem(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val status: ClubStatus,
    val publicVisibility: ClubPublicVisibility,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
    val firstHostOnboardingState: FirstHostOnboardingState,
    val adminRevision: Long,
)

enum class FirstHostOnboardingState {
    MISSING,
    INVITED,
    ASSIGNED,
}

data class PlatformAdminClubDetail(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val adminRevision: Long,
    val status: ClubStatus,
    val publicVisibility: ClubPublicVisibility,
    val domains: List<PlatformAdminClubDomain>,
    val firstHostOnboardingState: FirstHostOnboardingState,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
)

object ClubRegistrySearch {
    fun normalize(raw: String?): String? {
        if (raw == null) {
            return null
        }
        val nfc = Normalizer.normalize(raw, Normalizer.Form.NFC)
        val collapsed = WHITESPACE.replace(nfc.trim(), " ").lowercase(Locale.ROOT)
        return collapsed.takeIf { it.isNotEmpty() }
    }

    fun escapeLike(normalized: String): String =
        normalized
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")

    private val WHITESPACE = Regex("\\s+")
}

data class UpdatePlatformAdminClubCommand(
    val expectedAdminRevision: Long,
    val name: String?,
    val tagline: String?,
    val about: String?,
)

const val CLUB_VISIBILITY_COMMAND_TYPE = "club.visibility.change"
const val CLUB_VISIBILITY_SCHEMA_VERSION = "admin.club.visibility.v1"

data class PreviewPlatformAdminClubVisibilityCommand(
    val expectedAdminRevision: Long,
    val targetVisibility: ClubPublicVisibility,
)

data class ConfirmPlatformAdminClubVisibilityCommand(
    val previewId: UUID,
    val idempotencyKey: String,
    val expectedAdminRevision: Long,
    val targetVisibility: ClubPublicVisibility,
    val confirmed: Boolean,
)

data class PlatformAdminClubCommandPreview(
    val previewId: UUID,
    val expiresAt: Instant,
    val currentVisibility: ClubPublicVisibility,
    val targetVisibility: ClubPublicVisibility,
    val impactCodes: List<String>,
    val requestFingerprintPrefix: String,
)

data class PlatformAdminClubCommandReceipt(
    val receiptId: UUID,
    val commandType: String,
    val clubId: UUID,
    val beforeAdminRevision: Long?,
    val afterAdminRevision: Long,
    val outcome: String,
    val resultCode: String,
    val targetId: UUID? = null,
    val convergenceId: UUID? = null,
    val convergenceState: String? = null,
)

const val CLUB_DOMAIN_CREATE_COMMAND_TYPE = "club.domain.create"
const val CLUB_DOMAIN_CREATE_SCHEMA_VERSION = "admin.club.domain.create.v1"
const val CLUB_DOMAIN_RECHECK_COMMAND_TYPE = "club.domain.recheck"
const val CLUB_DOMAIN_RECHECK_SCHEMA_VERSION = "admin.club.domain.recheck.v1"

data class PlatformAdminDomainCommandPreview(
    val previewId: UUID,
    val expiresAt: Instant,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
    val impactCodes: List<String>,
    val requestFingerprintPrefix: String,
)

data class PlatformAdminOnboardingClubInput(
    val name: String,
    val slug: String,
    val tagline: String,
    val about: String,
)

data class PlatformAdminOnboardingHostInput(
    val email: String,
    val name: String,
)

data class PlatformAdminOnboardingDomainInput(
    val hostname: String,
    val kind: ClubDomainKind,
)

data class PlatformAdminOnboardingCommand(
    val club: PlatformAdminOnboardingClubInput,
    val firstHost: PlatformAdminOnboardingHostInput,
    val domain: PlatformAdminOnboardingDomainInput?,
    val existingUserConfirmation: String?,
)

data class ConfirmPlatformAdminOnboardingCommand(
    val previewId: UUID,
    val idempotencyKey: String,
    val onboarding: PlatformAdminOnboardingCommand,
    val confirmed: Boolean,
)

data class PlatformAdminOnboardingPreview(
    val previewId: UUID,
    val expiresAt: Instant,
    val clubSlug: String,
    val firstHostKind: FirstHostPreviewKind,
    val requiredConfirmation: String?,
    val impactCodes: List<String>,
    val prerequisiteCodes: List<String>,
    val requestFingerprintPrefix: String,
)

enum class FirstHostPreviewKind {
    EXISTING_USER,
    NEW_USER,
}

data class PlatformAdminOnboardingResult(
    val receiptId: UUID,
    val club: PlatformAdminClubListItem,
    val originStatus: PlatformAdminOnboardingOriginStatus,
    val firstHostKind: HostOnboardingResultKind,
    val invitationDelivery: PlatformAdminEmailDeliveryStatus,
)

enum class PlatformAdminOnboardingOriginStatus {
    SUCCEEDED,
}

enum class HostOnboardingResultKind {
    EXISTING_USER_ASSIGNED,
    INVITATION_CREATED,
}

data class PlatformAdminEmailDeliveryResult(
    val status: PlatformAdminEmailDeliveryStatus,
)

enum class PlatformAdminEmailDeliveryStatus {
    NOT_REQUIRED,
    PENDING,
    SUCCEEDED,
    FAILED,
}

const val CLUB_ONBOARDING_COMMAND_TYPE = "club.onboarding.create"
const val CLUB_ONBOARDING_SCHEMA_VERSION = "admin.club.onboarding.create.v1"
