package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HostWorkboxAccessDeniedException
import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxAuthoritativeKeyException
import com.readmates.hostworkspace.application.model.HostWorkboxContinuation
import com.readmates.hostworkspace.application.model.HostWorkboxInvalidRequestException
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
import com.readmates.hostworkspace.application.model.HostWorkboxRestartRequiredException
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshot
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotItem
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPage
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPageQuery
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.application.port.`in`.GetHostWorkboxUseCase
import com.readmates.hostworkspace.application.port.`in`.ManageHostWorkboxDeferralUseCase
import com.readmates.hostworkspace.application.port.out.HostInvitationExpiryWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostMemberApprovalWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostNotificationFailureWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostRecordClosingWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostScheduleUnseenWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import com.readmates.hostworkspace.application.port.out.HostWorkboxDeferralPort
import com.readmates.hostworkspace.application.port.out.HostWorkboxSnapshotPort
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class HostWorkboxService(
    private val schedule: HostScheduleUnseenWorkSourcePort,
    private val member: HostMemberApprovalWorkSourcePort,
    private val closing: HostRecordClosingWorkSourcePort,
    private val invitation: HostInvitationExpiryWorkSourcePort,
    private val notification: HostNotificationFailureWorkSourcePort,
    private val deferrals: HostWorkboxDeferralPort,
    private val snapshots: HostWorkboxSnapshotPort,
    transactionManager: PlatformTransactionManager,
    private val clock: Clock = Clock.systemUTC(),
    private val snapshotIds: () -> UUID = UUID::randomUUID,
) : GetHostWorkboxUseCase,
    ManageHostWorkboxDeferralUseCase {
    private val readTransaction =
        TransactionTemplate(transactionManager).apply {
            isReadOnly = true
            isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        }

    override fun get(request: HostWorkboxRequest): HostWorkboxPage {
        validateActor(request.actor)
        if (request.limit !in 1..MAX_LIMIT) throw HostWorkboxInvalidRequestException()
        return request.continuation?.let { continuation(request, it) } ?: firstPage(request)
    }

    override fun defer(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
        deferredUntil: OffsetDateTime,
    ): HostWorkboxDeferral {
        validateActor(actor)
        val evaluatedAt = now()
        requireAuthoritative(actor, key, evaluatedAt)
        val deferral =
            runCatching { HostWorkboxDeferral.create(actor.owner, key, deferredUntil, evaluatedAt) }
                .getOrElse { throw HostWorkboxInvalidRequestException() }
        deferrals.upsertDeferral(deferral)
        return deferral
    }

    override fun remove(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
    ): Boolean {
        validateActor(actor)
        val evaluatedAt = now()
        requireAuthoritative(actor, key, evaluatedAt)
        return deferrals.removeDeferral(actor.owner, key)
    }

    private fun firstPage(request: HostWorkboxRequest): HostWorkboxPage {
        val evaluatedAt = now()
        val filterFingerprint = fingerprint(request.state)
        val results = evaluate(request.actor, evaluatedAt)
        val availability = results.map(HostWorkSourceResult::availability)
        val ordered =
            results
                .flatMap(HostWorkSourceResult::records)
                .mapNotNull { record -> derive(record, request.actor, evaluatedAt) }
                .filter { it.state == request.state }
                .sortedWith(PROJECTION_ORDER)
                .mapIndexed { ordinal, projection ->
                    HostWorkboxSnapshotItem(ordinal, projection.key, projection)
                }
        val snapshot =
            HostWorkboxSnapshot(
                snapshotIds(),
                request.actor.owner,
                request.state,
                filterFingerprint,
                SCHEMA_VERSION,
                evaluatedAt,
                availability,
                evaluatedAt.plusMinutes(SNAPSHOT_MINUTES),
                ordered,
            )
        snapshots.saveSnapshot(snapshot)
        return snapshot.toPage(request.limit)
    }

    private fun continuation(
        request: HostWorkboxRequest,
        cursor: HostWorkboxContinuation,
    ): HostWorkboxPage {
        restartUnless(
            cursor.schemaVersion == SCHEMA_VERSION &&
                cursor.filterFingerprint == fingerprint(request.state),
        )
        val page =
            snapshots.loadSnapshotPage(
                HostWorkboxSnapshotPageQuery(
                    cursor.snapshotId,
                    request.actor.owner,
                    request.state,
                    cursor.filterFingerprint,
                    now(),
                    cursor.afterOrdinal,
                    request.limit,
                ),
            ) ?: restart()
        restartUnless(
            page.schemaVersion == cursor.schemaVersion &&
                page.evaluatedAt == cursor.evaluatedAt &&
                page.expiresAt == cursor.expiresAt,
        )
        return page.toPage()
    }

    private fun evaluate(
        actor: HostWorkboxActor,
        evaluatedAt: OffsetDateTime,
    ): List<HostWorkSourceResult> =
        requireNotNull(
            readTransaction.execute {
                val completedSince = evaluatedAt.minusDays(COMPLETED_RETENTION_DAYS)
                listOf(
                    schedule.load(actor.owner.clubId, evaluatedAt, completedSince),
                    member.load(actor.owner.clubId, evaluatedAt, completedSince),
                    closing.load(actor.owner.clubId, evaluatedAt, completedSince),
                    invitation.load(actor.owner.clubId, evaluatedAt, completedSince),
                    notification.load(actor.owner.clubId, evaluatedAt, completedSince),
                )
            },
        )

    private fun requireAuthoritative(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
        evaluatedAt: OffsetDateTime,
    ) {
        val authoritative =
            evaluate(actor, evaluatedAt).flatMap(HostWorkSourceResult::records).any {
                it.key() == key
            }
        if (!authoritative) throw HostWorkboxAuthoritativeKeyException()
    }

    private fun derive(
        record: HostWorkSourceRecord,
        actor: HostWorkboxActor,
        evaluatedAt: OffsetDateTime,
    ): HostWorkboxItemProjection? {
        if (
            record.resolvedAt != null &&
            record.resolvedAt.isBefore(evaluatedAt.minusDays(COMPLETED_RETENTION_DAYS))
        ) {
            return null
        }
        val key = record.key()
        val activeDeferral =
            if (record.resolvedAt == null) {
                deferrals.findActiveDeferral(actor.owner, key, evaluatedAt)
            } else {
                null
            }
        val state =
            when {
                record.resolvedAt != null -> HostWorkboxState.COMPLETED
                activeDeferral != null -> HostWorkboxState.DEFERRED
                else -> HostWorkboxState.NOW
            }
        return HostWorkboxItemProjection(
            key,
            record.type,
            state,
            record.title,
            record.description,
            record.count,
            record.dueAt,
            activeDeferral?.deferredUntil,
            record.resolvedAt,
            record.destinationHref,
            record.receiptSummary,
        )
    }

    private fun validateActor(actor: HostWorkboxActor) {
        if (!actor.activeHost) throw HostWorkboxAccessDeniedException()
    }

    private fun now(): OffsetDateTime = clock.instant().atOffset(ZoneOffset.UTC)

    private companion object {
        const val MAX_LIMIT = 100
        const val SCHEMA_VERSION = 1
        const val SNAPSHOT_MINUTES = 15L
        const val COMPLETED_RETENTION_DAYS = 30L
        val TYPE_PRIORITY =
            mapOf(
                com.readmates.hostworkspace.application.model.HostWorkItemType.MEMBER_APPROVAL to
                    10,
                com.readmates.hostworkspace.application.model.HostWorkItemType.SCHEDULE_UNSEEN to
                    20,
                com.readmates.hostworkspace.application.model.HostWorkItemType.RECORD_CLOSING to 30,
                com.readmates.hostworkspace.application.model.HostWorkItemType.INVITATION_EXPIRY to
                    40,
                com.readmates.hostworkspace.application.model.HostWorkItemType
                    .NOTIFICATION_FAILURE to 50,
            )
        val PROJECTION_ORDER =
            compareBy<HostWorkboxItemProjection> { TYPE_PRIORITY.getValue(it.type) }
                .thenComparator { left, right ->
                    when {
                        left.dueAt == null && right.dueAt == null -> 0
                        left.dueAt == null -> 1
                        right.dueAt == null -> -1
                        else -> left.dueAt.compareTo(right.dueAt)
                    }
                }.thenBy { it.type.name }
                .thenBy {
                    it.key.value
                        .substringAfter(':')
                        .substringBefore(':')
                }.thenBy { it.key.value.substringAfterLast(':') }
    }
}

private fun fingerprint(state: HostWorkboxState): String =
    MessageDigest
        .getInstance("SHA-256")
        .digest("state=${state.name}".toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

private fun HostWorkSourceRecord.key() = HostWorkItemKey("${type.name}:$resourceId:$sourceGeneration")

private fun HostWorkboxSnapshot.toPage(limit: Int): HostWorkboxPage {
    val visible = items.take(limit)
    return HostWorkboxPage(
        id,
        state,
        filterFingerprint,
        schemaVersion,
        evaluatedAt,
        expiresAt,
        sourceAvailability,
        visible.map(HostWorkboxSnapshotItem::projection),
        visible.lastOrNull()?.ordinal,
        items.size > limit,
    )
}

private fun HostWorkboxSnapshotPage.toPage() =
    HostWorkboxPage(
        snapshotId,
        state,
        filterFingerprint,
        schemaVersion,
        evaluatedAt,
        expiresAt,
        sourceAvailability,
        items.map(HostWorkboxSnapshotItem::projection),
        items.lastOrNull()?.ordinal,
        hasMore,
    )

private fun restartUnless(condition: Boolean) {
    if (!condition) restart()
}

private fun restart(): Nothing = throw HostWorkboxRestartRequiredException()
