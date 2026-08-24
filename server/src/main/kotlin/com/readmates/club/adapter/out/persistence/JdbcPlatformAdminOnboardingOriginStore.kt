package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.HostOnboardingResultKind
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminEmailDeliveryStatus
import com.readmates.club.application.model.PlatformAdminOnboardingOriginStatus
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.port.out.StorePlatformAdminOnboardingOriginCommand
import com.readmates.club.application.port.out.StorePlatformAdminOnboardingOriginResult
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

internal class JdbcPlatformAdminOnboardingOriginStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val avatarAllocation: MemberAvatarAllocationPort,
) {
    fun store(command: StorePlatformAdminOnboardingOriginCommand): StorePlatformAdminOnboardingOriginResult =
        if (!insertClub(command)) {
            StorePlatformAdminOnboardingOriginResult.SlugConflict
        } else {
            insertFirstHost(command)
            if (!insertDomain(command)) {
                StorePlatformAdminOnboardingOriginResult.DomainConflict
            } else {
                insertAudits(command)
                insertReceipt(command)
                insertConvergence(command)
                if (consumePreview(command)) {
                    StorePlatformAdminOnboardingOriginResult.Stored(command.toResult())
                } else {
                    StorePlatformAdminOnboardingOriginResult.PreviewConsumed
                }
            }
        }

    fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
    ): PlatformAdminOnboardingResult? =
        jdbcTemplate
            .query(
                """
                select r.id, cast(r.safe_result_json as char) safe_result_json,
                       host.state host_delivery_state
                from platform_admin_club_command_receipts r
                left join platform_admin_club_command_convergence host
                  on host.receipt_id_snapshot = r.id and host.effect_type = 'HOST_INVITATION'
                where r.id = ? and r.actor_user_id_snapshot = ? and r.command_type = 'club.onboarding.create'
                """.trimIndent(),
                { resultSet, _ -> resultSet.toOnboardingResult(objectMapper) },
                receiptId.dbString(),
                actorAdminId.dbString(),
            ).firstOrNull()

    fun loadDomainConvergenceId(receiptId: UUID): UUID? =
        jdbcTemplate
            .query(
                """
                select effect_target.id
                from platform_admin_club_command_convergence effect_target
                join platform_admin_club_command_receipts receipt
                  on receipt.id = effect_target.receipt_id_snapshot
                where receipt.id = ? and receipt.command_type = 'club.onboarding.create'
                  and effect_target.effect_type = 'DOMAIN_PROVISIONING'
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                receiptId.dbString(),
            ).firstOrNull()

    private fun insertClub(command: StorePlatformAdminOnboardingOriginCommand): Boolean =
        try {
            jdbcTemplate.update(
                """
                insert into clubs (id, slug, name, tagline, about, status, public_visibility, admin_revision)
                values (?, ?, ?, ?, ?, 'SETUP_REQUIRED', 'PRIVATE', 0)
                """.trimIndent(),
                command.clubId.dbString(),
                command.command.club.slug,
                command.command.club.name,
                command.command.club.tagline,
                command.command.club.about,
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }

    private fun insertFirstHost(command: StorePlatformAdminOnboardingOriginCommand) {
        val user = command.existingUser
        if (user != null) {
            val avatar = avatarAllocation.allocate(command.clubId, user.userId)
            jdbcTemplate.update(
                """
                insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
                values (?, ?, ?, 'HOST', 'ACTIVE', ?, ?, ?)
                """.trimIndent(),
                checkNotNull(command.membershipId).dbString(),
                command.clubId.dbString(),
                user.userId.dbString(),
                command.occurredAt.dbTime(),
                command.command.firstHost.name
                    .take(HOST_DISPLAY_NAME_MAX_LENGTH),
                avatar.wireValue,
            )
        } else {
            jdbcTemplate.update(
                """
                insert into invitations (
                  id, club_id, invited_by_membership_id, invited_by_platform_admin_user_id,
                  invited_email, invited_name, role, token_hash, status, apply_to_current_session, expires_at
                ) values (?, ?, null, ?, ?, ?, 'HOST', ?, 'PENDING', false, ?)
                """.trimIndent(),
                checkNotNull(command.invitationId).dbString(),
                command.clubId.dbString(),
                command.actorAdminId.dbString(),
                command.command.firstHost.email,
                command.command.firstHost.name,
                checkNotNull(command.invitationTokenHash),
                checkNotNull(command.invitationExpiresAt).dbTime(),
            )
        }
    }

    private fun insertDomain(command: StorePlatformAdminOnboardingOriginCommand): Boolean {
        val domain = command.command.domain ?: return true
        return try {
            jdbcTemplate.update(
                """
                insert into club_domains (id, club_id, hostname, kind, status, is_primary, created_at, updated_at)
                values (?, ?, ?, ?, 'ACTION_REQUIRED', false, ?, ?)
                """.trimIndent(),
                checkNotNull(command.domainId).dbString(),
                command.clubId.dbString(),
                domain.hostname,
                domain.kind.name,
                command.occurredAt.dbTime(),
                command.occurredAt.dbTime(),
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }
    }

    private fun insertAudits(command: StorePlatformAdminOnboardingOriginCommand) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, 'ADMIN_CLUB_ONBOARDED', cast(? as json), ?)
            """.trimIndent(),
            command.platformAuditEventId.dbString(),
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(command.auditMetadata()),
            command.occurredAt.dbTime(),
        )
        val eventTypes =
            buildList {
                add("PLATFORM_ADMIN_CLUB_CREATED")
                add(if (command.existingUser == null) "PLATFORM_ADMIN_HOST_INVITED" else "PLATFORM_ADMIN_HOST_ASSIGNED")
                if (command.domainId != null) add("PLATFORM_ADMIN_DOMAIN_CREATED")
            }
        eventTypes.forEachIndexed { index, eventType ->
            jdbcTemplate.update(
                """
                insert into club_audit_events
                  (id, actor_user_id, actor_platform_role, club_id, event_type, metadata_json, created_at)
                values (?, ?, ?, ?, ?, cast(? as json), ?)
                """.trimIndent(),
                command.clubAuditEventIds[index].dbString(),
                command.actorAdminId.dbString(),
                command.actorRoleSnapshot,
                command.clubId.dbString(),
                eventType,
                objectMapper.writeValueAsString(mapOf("receiptId" to command.receiptId.toString())),
                command.occurredAt.dbTime(),
            )
        }
    }

    private fun insertReceipt(command: StorePlatformAdminOnboardingOriginCommand) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_receipts (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, club_id_snapshot, preview_id_snapshot,
              before_admin_revision, after_admin_revision, outcome,
              canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, origin_at, safe_result_json
            ) values (?, 'club.onboarding.create', ?, ?, cast(? as json), ?, ?, null, 0, 'SUCCEEDED',
                      ?, ?, ?, ?, ?, cast(? as json))
            """.trimIndent(),
            command.receiptId.dbString(),
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(command.actorCapabilities),
            command.clubId.dbString(),
            command.preview.previewId.dbString(),
            command.digest.schemaVersion,
            command.digest.digestKeyVersion,
            command.digest.requestHmac,
            command.platformAuditEventId.dbString(),
            command.occurredAt.dbTime(),
            objectMapper.writeValueAsString(command.safeResult()),
        )
    }

    private fun insertConvergence(command: StorePlatformAdminOnboardingOriginCommand) {
        val effects =
            listOfNotNull(
                command.hostConvergenceId?.let { Triple(it, "HOST_INVITATION", checkNotNull(command.invitationId)) },
                command.domainConvergenceId?.let { Triple(it, "DOMAIN_PROVISIONING", checkNotNull(command.domainId)) },
            )
        effects.forEach { (convergenceId, effectType, targetId) ->
            jdbcTemplate.update(
                """
                insert into platform_admin_club_command_convergence (
                  id, receipt_id_snapshot, effect_type, effect_target_id_snapshot, state, attempt_count, next_attempt_no,
                  lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
                ) values (?, ?, ?, ?, 'PENDING', 0, 1, null, null, null, ?, ?, ?)
                """.trimIndent(),
                convergenceId.dbString(),
                command.receiptId.dbString(),
                effectType,
                targetId.dbString(),
                command.occurredAt.dbTime(),
                command.occurredAt.dbTime(),
                command.occurredAt.dbTime(),
            )
        }
    }

    private fun consumePreview(command: StorePlatformAdminOnboardingOriginCommand): Boolean =
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set consumed_at = ?, consumed_receipt_id_snapshot = ?
            where id = ? and consumed_at is null and consumed_receipt_id_snapshot is null
            """.trimIndent(),
            command.occurredAt.dbTime(),
            command.receiptId.dbString(),
            command.preview.previewId.dbString(),
        ) == 1

    private companion object {
        private const val HOST_DISPLAY_NAME_MAX_LENGTH = 50
    }
}

private fun StorePlatformAdminOnboardingOriginCommand.auditMetadata(): Map<String, Any> =
    mapOf(
        "receiptId" to receiptId.toString(),
        "clubId" to clubId.toString(),
        "firstHostKind" to hostKind().name,
        "domainRequested" to (domainId != null),
    )

private fun StorePlatformAdminOnboardingOriginCommand.safeResult(): Map<String, Any> =
    buildMap {
        put("resultCode", "CLUB_ONBOARDED")
        put("originStatus", "SUCCEEDED")
        put("clubId", clubId.toString())
        put("clubSlug", command.club.slug)
        put("clubName", command.club.name)
        put("clubTagline", command.club.tagline)
        put("clubAbout", command.club.about)
        put("firstHostKind", hostKind().name)
        put("invitationDelivery", if (invitationId == null) "NOT_REQUIRED" else "PENDING")
        put("domainRequested", domainId != null)
        if (domainId != null) {
            put("expectedDomainStatus", "ACTION_REQUIRED")
            put("originTargetUpdatedAt", occurredAt.truncatedTo(ChronoUnit.MICROS).toString())
        }
    }

private fun StorePlatformAdminOnboardingOriginCommand.hostKind(): HostOnboardingResultKind =
    if (invitationId == null) {
        HostOnboardingResultKind.EXISTING_USER_ASSIGNED
    } else {
        HostOnboardingResultKind.INVITATION_CREATED
    }

private fun StorePlatformAdminOnboardingOriginCommand.toResult() =
    PlatformAdminOnboardingResult(
        receiptId = receiptId,
        club = safeClubResult(hostKind()),
        originStatus = PlatformAdminOnboardingOriginStatus.SUCCEEDED,
        firstHostKind = hostKind(),
        invitationDelivery =
            if (invitationId == null) {
                PlatformAdminEmailDeliveryStatus.NOT_REQUIRED
            } else {
                PlatformAdminEmailDeliveryStatus.PENDING
            },
    )

private fun StorePlatformAdminOnboardingOriginCommand.safeClubResult(hostKind: HostOnboardingResultKind) =
    PlatformAdminClubListItem(
        clubId = clubId,
        slug = command.club.slug,
        name = command.club.name,
        tagline = command.club.tagline,
        about = command.club.about,
        status = ClubStatus.SETUP_REQUIRED,
        publicVisibility = ClubPublicVisibility.PRIVATE,
        domainCount = if (domainId == null) 0 else 1,
        domainActionRequiredCount = if (domainId == null) 0 else 1,
        notificationFailureCount = 0,
        aiFailureCount = 0,
        firstHostOnboardingState = hostKind.onboardingState(),
        adminRevision = 0,
    )

private fun ResultSet.toOnboardingResult(objectMapper: ObjectMapper): PlatformAdminOnboardingResult {
    val safe: Map<String, Any> = objectMapper.readValue(getString("safe_result_json"), mapType())
    val hostKind = HostOnboardingResultKind.valueOf(safe.getValue("firstHostKind") as String)
    val domainRequested = safe.getValue("domainRequested") as Boolean
    return PlatformAdminOnboardingResult(
        receiptId = uuid("id"),
        club = safe.toClubResult(hostKind, domainRequested),
        originStatus = PlatformAdminOnboardingOriginStatus.SUCCEEDED,
        firstHostKind = hostKind,
        invitationDelivery =
            getString("host_delivery_state")?.let(PlatformAdminEmailDeliveryStatus::valueOf)
                ?: PlatformAdminEmailDeliveryStatus.valueOf(safe.getValue("invitationDelivery") as String),
    )
}

private fun Map<String, Any>.toClubResult(
    hostKind: HostOnboardingResultKind,
    domainRequested: Boolean,
) = PlatformAdminClubListItem(
    clubId = UUID.fromString(getValue("clubId") as String),
    slug = getValue("clubSlug") as String,
    name = getValue("clubName") as String,
    tagline = getValue("clubTagline") as String,
    about = getValue("clubAbout") as String,
    status = ClubStatus.SETUP_REQUIRED,
    publicVisibility = ClubPublicVisibility.PRIVATE,
    domainCount = if (domainRequested) 1 else 0,
    domainActionRequiredCount = if (domainRequested) 1 else 0,
    notificationFailureCount = 0,
    aiFailureCount = 0,
    firstHostOnboardingState = hostKind.onboardingState(),
    adminRevision = 0,
)

private fun HostOnboardingResultKind.onboardingState(): FirstHostOnboardingState =
    if (this == HostOnboardingResultKind.INVITATION_CREATED) {
        FirstHostOnboardingState.INVITED
    } else {
        FirstHostOnboardingState.ASSIGNED
    }

private fun mapType() = object : TypeReference<Map<String, Any>>() {}

private fun Instant.dbTime() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()
