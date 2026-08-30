package com.readmates.club.application.service

import com.readmates.club.application.model.HostClubApprovalPolicy
import com.readmates.club.application.model.HostClubClosePreview
import com.readmates.club.application.model.HostClubCloseResult
import com.readmates.club.application.model.HostClubRecordPublicationDefault
import com.readmates.club.application.model.HostClubSettings
import com.readmates.club.application.model.HostClubSettingsError
import com.readmates.club.application.model.HostClubSettingsException
import com.readmates.club.application.model.HostClubSettingsHistoryItem
import com.readmates.club.application.model.HostClubSettingsMutationResult
import com.readmates.club.application.model.HostClubSettingsReceipt
import com.readmates.club.application.model.HostCoHostMutationResult
import com.readmates.club.application.model.UpdateHostClubSettingsCommand
import com.readmates.club.application.port.`in`.ManageHostClubSettingsUseCase
import com.readmates.club.application.port.out.HostClubSettingsStorePort
import com.readmates.club.application.port.out.StoredHostClubClosePreview
import com.readmates.club.application.port.out.StoredHostClubSettings
import com.readmates.club.application.port.out.StoredHostClubSettingsCommand
import com.readmates.club.application.port.out.StoredHostClubSettingsHistory
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.TokenHashing
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID

@Service
class HostClubSettingsService(
    private val store: HostClubSettingsStorePort,
    private val clock: Clock = Clock.systemUTC(),
) : ManageHostClubSettingsUseCase {
    override fun get(actor: ClubActor): HostClubSettings {
        requireManager(actor)
        return (store.load(actor.clubId, false) ?: notFound()).toPublic()
    }

    @Transactional
    override fun update(
        actor: ClubActor,
        command: UpdateHostClubSettingsCommand,
    ): HostClubSettingsMutationResult {
        requireManager(actor)
        val normalized = normalize(command)
        val keyHash = keyHash(normalized.idempotencyKey)
        val requestHash =
            TokenHashing.sha256(
                "settings\u0000${normalized.expectedRevision}\u0000${normalized.name}\u0000${normalized.approvalPolicy}\u0000${normalized.defaultTimezone}\u0000${normalized.scheduleReminderEnabled}\u0000${normalized.recordPublicationDefault}",
            )
        store.findCommand(actor.clubId, actor.membershipId, keyHash)?.let { replay ->
            requireReplay(replay, requestHash)
            return HostClubSettingsMutationResult((store.load(actor.clubId, false) ?: notFound()).toPublic(), replay.receipt(true))
        }
        val current = store.load(actor.clubId, true) ?: notFound()
        requireActive(current)
        requireRevision(current, normalized.expectedRevision)
        val now = now()
        val next =
            current.copy(
                name = normalized.name,
                approvalPolicy = normalized.approvalPolicy.name,
                defaultTimezone = normalized.defaultTimezone,
                scheduleReminderEnabled = normalized.scheduleReminderEnabled,
                recordPublicationDefault = normalized.recordPublicationDefault.name,
                hostSettingsRevision = current.hostSettingsRevision + 1,
            )
        val history = history(current, next, "SETTINGS_UPDATED", actor.membershipId, null, now)
        val receipt =
            command(actor, "SETTINGS_UPDATED", keyHash, requestHash, next.hostSettingsRevision, mapOf("status" to next.status), now)
        store.updateSettings(next, current.hostSettingsRevision, history, receipt)
        return HostClubSettingsMutationResult(next.toPublic(), receipt.receipt(false))
    }

    @Transactional
    override fun promoteCoHost(
        actor: ClubActor,
        membershipId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
    ) = changeCoHost(actor, membershipId, expectedRevision, idempotencyKey, promote = true)

    @Transactional
    override fun demoteCoHost(
        actor: ClubActor,
        membershipId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
    ) = changeCoHost(actor, membershipId, expectedRevision, idempotencyKey, promote = false)

    private fun changeCoHost(
        actor: ClubActor,
        membershipId: UUID,
        expectedRevision: Long,
        idempotencyKey: String,
        promote: Boolean,
    ): HostCoHostMutationResult {
        requireManager(actor)
        if (expectedRevision < 0) bad("INVALID_HOST_SETTINGS_REVISION", "Revision must be non-negative")
        val normalizedKey = normalizeKey(idempotencyKey)
        val action = if (promote) "CO_HOST_PROMOTED" else "CO_HOST_DEMOTED"
        val role = if (promote) "HOST" else "MEMBER"
        val keyHash = keyHash(normalizedKey)
        val requestHash = TokenHashing.sha256("$action\u0000$membershipId\u0000$expectedRevision")
        store.findCommand(actor.clubId, actor.membershipId, keyHash)?.let { replay ->
            requireReplay(replay, requestHash)
            return HostCoHostMutationResult(membershipId, role, replay.resultRevision, replay.receipt(true))
        }
        val current = store.load(actor.clubId, true) ?: notFound()
        requireActive(current)
        requireRevision(current, expectedRevision)
        val beforeRole = store.membershipRole(actor.clubId, membershipId, true) ?: notFound("HOST_SETTINGS_MEMBER_NOT_FOUND")
        if (!promote && beforeRole == "HOST" && store.activeHostCount(actor.clubId) <= 1) {
            conflict("LAST_ACTIVE_HOST_REQUIRED", "At least one active host is required")
        }
        val now = now()
        val nextRevision = current.hostSettingsRevision + 1
        val history =
            StoredHostClubSettingsHistory(
                UUID.randomUUID(),
                actor.clubId,
                nextRevision,
                action,
                actor.membershipId,
                membershipId,
                mapOf("role" to beforeRole),
                mapOf("role" to role),
                now,
            )
        val receipt =
            command(
                actor,
                action,
                keyHash,
                requestHash,
                nextRevision,
                mapOf(
                    "membershipId" to membershipId.toString(),
                    "role" to role,
                ),
                now,
            )
        store.updateMembershipRole(actor.clubId, membershipId, role)
        store.appendHistoryAndCommand(history, receipt)
        return HostCoHostMutationResult(membershipId, role, nextRevision, receipt.receipt(false))
    }

    override fun history(
        actor: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostClubSettingsHistoryItem> {
        requireManager(actor)
        val page = store.history(actor.clubId, pageRequest)
        return CursorPage(
            page.items.map {
                HostClubSettingsHistoryItem(
                    it.id,
                    it.revision,
                    it.action,
                    it.subjectMembershipId,
                    it.beforeSettings,
                    it.afterSettings,
                    it.occurredAt,
                )
            },
            page.nextCursor,
        )
    }

    @Transactional
    override fun previewClubEnd(actor: ClubActor): HostClubClosePreview {
        requireManager(actor)
        val current = store.load(actor.clubId, true) ?: notFound()
        requireActive(current)
        val now = now()
        val effects =
            linkedMapOf(
                "clubStatus" to "ARCHIVED",
                "memberAccess" to "ENDED",
                "publicRecords" to "UNCHANGED",
            )
        val effectHash =
            TokenHashing.sha256(
                "club-end\u0000${actor.clubId}\u0000${actor.membershipId}\u0000" +
                    "${current.hostSettingsRevision}\u0000${effects.entries.joinToString("|") { "${it.key}=${it.value}" }}",
            )
        val preview =
            StoredHostClubClosePreview(
                UUID.randomUUID(),
                actor.clubId,
                actor.membershipId,
                current.hostSettingsRevision,
                effectHash,
                effects,
                now.plusMinutes(15),
                null,
                now,
            )
        store.saveClosePreview(preview)
        return HostClubClosePreview(
            preview.id,
            preview.clubId,
            preview.actorMembershipId,
            preview.clubRevision,
            preview.effectHash,
            preview.effects,
            preview.expiresAt,
        )
    }

    @Transactional
    override fun confirmClubEnd(
        actor: ClubActor,
        previewId: UUID,
        effectHash: String,
        idempotencyKey: String,
    ): HostClubCloseResult {
        requireManager(actor)
        val keyHash = keyHash(normalizeKey(idempotencyKey))
        val requestHash = TokenHashing.sha256("club-end-confirm\u0000$previewId\u0000$effectHash")
        store.findCommand(actor.clubId, actor.membershipId, keyHash)?.let { replay ->
            requireReplay(replay, requestHash)
            return HostClubCloseResult(replay.receiptId, replay.safeResult["status"] ?: "ARCHIVED", replay.resultRevision, true)
        }
        val preview = store.loadClosePreview(previewId, true) ?: notFound("HOST_CLUB_CLOSE_PREVIEW_NOT_FOUND")
        if (preview.clubId != actor.clubId || preview.actorMembershipId != actor.membershipId || preview.effectHash != effectHash) {
            conflict("HOST_CLUB_CLOSE_PREVIEW_MISMATCH", "Club close preview does not match")
        }
        if (!preview.expiresAt.isAfter(now())) conflict("HOST_CLUB_CLOSE_PREVIEW_EXPIRED", "Club close preview expired")
        if (preview.consumedReceiptId != null) conflict("HOST_CLUB_CLOSE_PREVIEW_CONSUMED", "Club close preview was consumed")
        val current = store.load(actor.clubId, true) ?: notFound()
        requireActive(current)
        requireRevision(current, preview.clubRevision)
        val now = now()
        val nextRevision = current.hostSettingsRevision + 1
        val history =
            StoredHostClubSettingsHistory(
                UUID.randomUUID(),
                actor.clubId,
                nextRevision,
                "CLUB_ENDED",
                actor.membershipId,
                null,
                mapOf("status" to current.status),
                mapOf("status" to "ARCHIVED"),
                now,
            )
        val receipt = command(actor, "CLUB_ENDED", keyHash, requestHash, nextRevision, mapOf("status" to "ARCHIVED"), now)
        store.archiveClub(actor.clubId, current.hostSettingsRevision, previewId, receipt, history)
        return HostClubCloseResult(receipt.receiptId, "ARCHIVED", nextRevision, false)
    }

    private fun normalize(command: UpdateHostClubSettingsCommand): UpdateHostClubSettingsCommand {
        if (command.expectedRevision < 0) bad("INVALID_HOST_SETTINGS_REVISION", "Revision must be non-negative")
        val name = command.name.trim().takeIf { it.length in 1..120 } ?: bad("INVALID_CLUB_NAME", "Club name must be 1 to 120 characters")
        val zone =
            command.defaultTimezone.trim().also {
                if (it !in ZoneId.getAvailableZoneIds()) {
                    bad("INVALID_DEFAULT_TIMEZONE", "Timezone must be a valid IANA region identifier")
                }
                ZoneId.of(it)
            }
        return command.copy(name = name, defaultTimezone = zone, idempotencyKey = normalizeKey(command.idempotencyKey))
    }

    private fun settings(value: StoredHostClubSettings): Map<String, String?> =
        linkedMapOf(
            "name" to value.name,
            "approvalPolicy" to value.approvalPolicy,
            "defaultTimezone" to value.defaultTimezone,
            "scheduleReminderEnabled" to value.scheduleReminderEnabled.toString(),
            "recordPublicationDefault" to value.recordPublicationDefault,
        )

    private fun history(
        before: StoredHostClubSettings,
        after: StoredHostClubSettings,
        action: String,
        actorId: UUID,
        subjectId: UUID?,
        now: OffsetDateTime,
    ) = StoredHostClubSettingsHistory(
        UUID.randomUUID(),
        before.clubId,
        after.hostSettingsRevision,
        action,
        actorId,
        subjectId,
        settings(before),
        settings(after),
        now,
    )

    private fun command(
        actor: ClubActor,
        action: String,
        keyHash: String,
        requestHash: String,
        revision: Long,
        result: Map<String, String?>,
        now: OffsetDateTime,
    ) = StoredHostClubSettingsCommand(
        UUID.randomUUID(),
        actor.clubId,
        actor.membershipId,
        action,
        keyHash,
        requestHash,
        revision,
        result,
        now,
    )

    private fun StoredHostClubSettings.toPublic() =
        HostClubSettings(
            clubId,
            clubSlug,
            name,
            HostClubApprovalPolicy.valueOf(approvalPolicy),
            defaultTimezone,
            scheduleReminderEnabled,
            HostClubRecordPublicationDefault.valueOf(recordPublicationDefault),
            hostSettingsRevision,
            status,
        )

    private fun StoredHostClubSettingsCommand.receipt(replayed: Boolean) =
        HostClubSettingsReceipt(receiptId, action, resultRevision, replayed)

    private fun requireManager(actor: ClubActor) {
        if (!actor.can(ClubCapability.MANAGE_MEMBERS)) forbidden("HOST_REQUIRED", "Host role required")
    }

    private fun requireActive(settings: StoredHostClubSettings) {
        if (settings.status !=
            "ACTIVE"
        ) {
            conflict("HOST_CLUB_INACTIVE", "Club is not active")
        }
    }

    private fun requireRevision(
        settings: StoredHostClubSettings,
        expected: Long,
    ) {
        if (settings.hostSettingsRevision !=
            expected
        ) {
            conflict("HOST_SETTINGS_STALE", "Club settings changed")
        }
    }

    private fun requireReplay(
        replay: StoredHostClubSettingsCommand,
        requestHash: String,
    ) {
        if (replay.requestHash !=
            requestHash
        ) {
            conflict("HOST_SETTINGS_IDEMPOTENCY_CONFLICT", "Idempotency key was used for another command")
        }
    }

    private fun normalizeKey(value: String) =
        value.trim().takeIf { it.length in 1..200 } ?: bad("INVALID_IDEMPOTENCY_KEY", "Idempotency key is required")

    private fun keyHash(value: String) = TokenHashing.sha256("host-club-settings\u0000$value")

    private fun now() = OffsetDateTime.now(clock)

    private fun notFound(code: String = "HOST_CLUB_SETTINGS_NOT_FOUND"): Nothing =
        throw HostClubSettingsException(code, HostClubSettingsError.NOT_FOUND, "Host club settings not found")

    private fun bad(
        code: String,
        message: String,
    ): Nothing = throw HostClubSettingsException(code, HostClubSettingsError.BAD_REQUEST, message)

    private fun forbidden(
        code: String,
        message: String,
    ): Nothing = throw HostClubSettingsException(code, HostClubSettingsError.FORBIDDEN, message)

    private fun conflict(
        code: String,
        message: String,
    ): Nothing = throw HostClubSettingsException(code, HostClubSettingsError.CONFLICT, message)
}
