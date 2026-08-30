package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailabilityState
import com.readmates.hostworkspace.application.model.HostWorkboxAccessDeniedException
import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxAuthoritativeKeyException
import com.readmates.hostworkspace.application.model.HostWorkboxContinuation
import com.readmates.hostworkspace.application.model.HostWorkboxInvalidRequestException
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshot
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPage
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPageQuery
import com.readmates.hostworkspace.application.model.HostWorkboxState
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
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostWorkboxServiceTest {
    private val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
    private val owner =
        HostWorkboxOwner(
            UUID.fromString("00000000-0000-0000-0000-000000000001"),
            UUID.fromString("00000000-0000-0000-0000-000000000201"),
        )
    private val actor = HostWorkboxActor(owner, activeHost = true)

    @Test
    fun `first page evaluates fixed source order once in repeatable read then persists sorted immutable snapshot`() {
        val calls = mutableListOf<String>()
        val transaction = RecordingTransactionManager()
        val snapshots = FakeSnapshots()
        val deferrals = FakeDeferrals()
        val service = service(calls, transaction, snapshots, deferrals)

        val page = service.get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 2, null))

        assertThat(calls)
            .containsExactly(
                "SCHEDULE_UNSEEN",
                "MEMBER_APPROVAL",
                "RECORD_CLOSING",
                "INVITATION_EXPIRY",
                "NOTIFICATION_FAILURE",
            )
        assertThat(transaction.definitions).hasSize(1)
        assertThat(transaction.definitions.single().isReadOnly).isTrue()
        assertThat(transaction.definitions.single().isolationLevel)
            .isEqualTo(TransactionDefinition.ISOLATION_REPEATABLE_READ)
        assertThat(snapshots.saved).isNotNull
        assertThat(snapshots.saved!!.evaluatedAt).isEqualTo(evaluatedAt)
        assertThat(snapshots.saved!!.expiresAt).isEqualTo(evaluatedAt.plusMinutes(15))
        assertThat(snapshots.saved!!.sourceAvailability.map { it.type })
            .containsExactlyElementsOf(HostWorkItemType.entries)
        assertThat(snapshots.saved!!.items.map { it.projection.type })
            .containsExactly(
                HostWorkItemType.MEMBER_APPROVAL,
                HostWorkItemType.SCHEDULE_UNSEEN,
                HostWorkItemType.NOTIFICATION_FAILURE,
            )
        assertThat(page.items).hasSize(2)
        assertThat(page.items.first().count).isZero()
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `typed source unavailability is persisted but unexpected failure aborts without snapshot`() {
        val unavailable =
            HostWorkSourceResult(
                HostWorkSourceAvailability(
                    HostWorkItemType.RECORD_CLOSING,
                    HostWorkSourceAvailabilityState.UNAVAILABLE,
                    "RECORD_SOURCE_UNAVAILABLE",
                ),
                emptyList(),
            )
        val snapshots = FakeSnapshots()
        val service = service(record = { unavailable }, snapshots = snapshots)
        val page = service.get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 20, null))
        assertThat(
            page.sourceAvailability
                .single { it.type == HostWorkItemType.RECORD_CLOSING }
                .failureCode,
        ).isEqualTo("RECORD_SOURCE_UNAVAILABLE")

        val failedSnapshots = FakeSnapshots()
        val failure = IllegalStateException("sql transaction failed")
        val failing = service(record = { throw failure }, snapshots = failedSnapshots)
        assertThatThrownBy {
            failing.get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 20, null))
        }.isSameAs(failure)
        assertThat(failedSnapshots.saved).isNull()
    }

    @Test
    fun `deferral expires back to now and completion is retained for only thirty days`() {
        val deferrals =
            FakeDeferrals().apply {
                active["SCHEDULE_UNSEEN:session-s:r7"] =
                    HostWorkboxDeferral.restore(
                        owner,
                        HostWorkItemKey("SCHEDULE_UNSEEN:session-s:r7"),
                        evaluatedAt.minusSeconds(1),
                    )
            }
        val completedRecent =
            record(
                HostWorkItemType.RECORD_CLOSING,
                "recent",
                "g1",
                resolvedAt = evaluatedAt.minusDays(30),
            )
        val completedOld =
            record(
                HostWorkItemType.RECORD_CLOSING,
                "old",
                "g1",
                resolvedAt = evaluatedAt.minusDays(30).minusNanos(1),
            )
        val service =
            service(
                deferrals = deferrals,
                record = {
                    available(HostWorkItemType.RECORD_CLOSING, completedRecent, completedOld)
                },
            )

        val now = service.get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 20, null))
        val completed = service.get(HostWorkboxRequest(actor, HostWorkboxState.COMPLETED, 20, null))

        assertThat(now.items.map { it.type }).contains(HostWorkItemType.SCHEDULE_UNSEEN)
        assertThat(completed.items.map { it.key.value })
            .contains("RECORD_CLOSING:recent:g1")
            .doesNotContain("RECORD_CLOSING:old:g1")
    }

    @Test
    fun `continuation reads only owned immutable snapshot and never invokes sources`() {
        val calls = mutableListOf<String>()
        val snapshots = FakeSnapshots()
        val first =
            service(calls = calls, snapshots = snapshots)
                .get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 1, null))
        calls.clear()
        snapshots.page =
            snapshots.saved!!.let { snapshot ->
                HostWorkboxSnapshotPage(
                    snapshot.id,
                    snapshot.owner,
                    snapshot.state,
                    snapshot.filterFingerprint,
                    snapshot.schemaVersion,
                    snapshot.evaluatedAt,
                    snapshot.sourceAvailability,
                    snapshot.expiresAt,
                    snapshot.items.drop(1).take(1),
                    true,
                )
            }

        val next =
            service(calls = calls, snapshots = snapshots)
                .get(
                    HostWorkboxRequest(
                        actor,
                        HostWorkboxState.NOW,
                        1,
                        HostWorkboxContinuation(
                            first.snapshotId,
                            1,
                            first.filterFingerprint,
                            first.schemaVersion,
                            first.evaluatedAt,
                            first.expiresAt,
                        ),
                    ),
                )

        assertThat(calls).isEmpty()
        assertThat(next.items).hasSize(1)
        assertThat(next.snapshotId).isEqualTo(first.snapshotId)
    }

    @Test
    fun `deferral mutations require active host future time and exact authoritative key`() {
        val calls = mutableListOf<String>()
        val deferrals = FakeDeferrals()
        val service = service(calls = calls, deferrals = deferrals)
        val key = HostWorkItemKey("SCHEDULE_UNSEEN:session-s:r7")

        service.defer(actor, key, evaluatedAt.plusHours(1))
        assertThat(calls)
            .containsExactly(
                "SCHEDULE_UNSEEN",
                "MEMBER_APPROVAL",
                "RECORD_CLOSING",
                "INVITATION_EXPIRY",
                "NOTIFICATION_FAILURE",
            )
        assertThat(deferrals.active.getValue(key.value).owner).isEqualTo(owner)
        assertThat(service.remove(actor, key)).isTrue()

        assertThatThrownBy {
            service.defer(
                actor,
                HostWorkItemKey("SCHEDULE_UNSEEN:missing:r7"),
                evaluatedAt.plusHours(1),
            )
        }.isInstanceOf(HostWorkboxAuthoritativeKeyException::class.java)
        assertThatThrownBy { service.defer(actor, key, evaluatedAt) }
            .isInstanceOf(HostWorkboxInvalidRequestException::class.java)
        assertThatThrownBy { service.remove(actor.copy(activeHost = false), key) }
            .isInstanceOf(HostWorkboxAccessDeniedException::class.java)
    }

    @Test
    fun `existing snapshot stays immutable while a new first page observes a concurrent deferral`() {
        val snapshots = FakeSnapshots()
        val deferrals = FakeDeferrals()
        val service = service(snapshots = snapshots, deferrals = deferrals)
        val first = service.get(HostWorkboxRequest(actor, HostWorkboxState.NOW, 1, null))
        val immutable = requireNotNull(snapshots.saved)
        val scheduleKey = HostWorkItemKey("SCHEDULE_UNSEEN:session-s:r7")

        service.defer(actor, scheduleKey, evaluatedAt.plusHours(1))
        snapshots.page =
            HostWorkboxSnapshotPage(
                immutable.id,
                immutable.owner,
                immutable.state,
                immutable.filterFingerprint,
                immutable.schemaVersion,
                immutable.evaluatedAt,
                immutable.sourceAvailability,
                immutable.expiresAt,
                immutable.items.drop(1).take(1),
                true,
            )
        val continuation =
            service.get(
                HostWorkboxRequest(
                    actor,
                    HostWorkboxState.NOW,
                    1,
                    HostWorkboxContinuation(
                        first.snapshotId,
                        0,
                        first.filterFingerprint,
                        first.schemaVersion,
                        first.evaluatedAt,
                        first.expiresAt,
                    ),
                ),
            )
        val refreshed = service.get(HostWorkboxRequest(actor, HostWorkboxState.DEFERRED, 20, null))

        assertThat(continuation.items.single().key).isEqualTo(scheduleKey)
        assertThat(continuation.items.single().state).isEqualTo(HostWorkboxState.NOW)
        assertThat(refreshed.items.single().key).isEqualTo(scheduleKey)
        assertThat(refreshed.items.single().state).isEqualTo(HostWorkboxState.DEFERRED)
    }

    private fun service(
        calls: MutableList<String> = mutableListOf(),
        transaction: RecordingTransactionManager = RecordingTransactionManager(),
        snapshots: FakeSnapshots = FakeSnapshots(),
        deferrals: FakeDeferrals = FakeDeferrals(),
        record: () -> HostWorkSourceResult = { available(HostWorkItemType.RECORD_CLOSING) },
    ) = HostWorkboxService(
        schedule =
            HostScheduleUnseenWorkSourcePort { _, _, _ ->
                calls += "SCHEDULE_UNSEEN"
                available(
                    HostWorkItemType.SCHEDULE_UNSEEN,
                    record(HostWorkItemType.SCHEDULE_UNSEEN, "session-s", "r7", count = 2),
                )
            },
        member =
            HostMemberApprovalWorkSourcePort { _, _, _ ->
                calls += "MEMBER_APPROVAL"
                available(
                    HostWorkItemType.MEMBER_APPROVAL,
                    record(
                        HostWorkItemType.MEMBER_APPROVAL,
                        "member-m",
                        "g1",
                        count = 0,
                        dueAt = evaluatedAt.minusDays(2),
                    ),
                )
            },
        closing =
            HostRecordClosingWorkSourcePort { _, _, _ ->
                calls += "RECORD_CLOSING"
                record()
            },
        invitation =
            HostInvitationExpiryWorkSourcePort { _, _, _ ->
                calls += "INVITATION_EXPIRY"
                available(HostWorkItemType.INVITATION_EXPIRY)
            },
        notification =
            HostNotificationFailureWorkSourcePort { _, _, _ ->
                calls += "NOTIFICATION_FAILURE"
                available(
                    HostWorkItemType.NOTIFICATION_FAILURE,
                    record(
                        HostWorkItemType.NOTIFICATION_FAILURE,
                        "delivery-d",
                        "a2",
                        dueAt = null,
                    ),
                )
            },
        deferrals = deferrals,
        snapshots = snapshots,
        transactionManager = transaction,
        clock = Clock.fixed(Instant.parse("2026-08-30T09:00:00Z"), ZoneOffset.UTC),
        snapshotIds = { UUID.fromString("90000000-0000-4000-8000-000000000001") },
    )

    private fun record(
        type: HostWorkItemType,
        resource: String,
        generation: String,
        count: Int = 1,
        dueAt: OffsetDateTime? = evaluatedAt.plusDays(1),
        resolvedAt: OffsetDateTime? = null,
    ) = HostWorkSourceRecord(
        type,
        resource,
        generation,
        "title-$resource",
        "safe description",
        count,
        dueAt,
        resolvedAt,
        "/app/host/work/$resource",
        null,
    )

    private fun available(
        type: HostWorkItemType,
        vararg records: HostWorkSourceRecord,
    ) = HostWorkSourceResult(
        HostWorkSourceAvailability(type, HostWorkSourceAvailabilityState.AVAILABLE),
        records.toList(),
    )

    private class RecordingTransactionManager : PlatformTransactionManager {
        val definitions = mutableListOf<TransactionDefinition>()

        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus {
            definitions += requireNotNull(definition)
            return SimpleTransactionStatus()
        }

        override fun commit(status: TransactionStatus) = Unit

        override fun rollback(status: TransactionStatus) = Unit
    }

    private class FakeSnapshots : HostWorkboxSnapshotPort {
        var saved: HostWorkboxSnapshot? = null
        val allSaved = mutableListOf<HostWorkboxSnapshot>()
        var page: HostWorkboxSnapshotPage? = null

        override fun saveSnapshot(snapshot: HostWorkboxSnapshot) {
            allSaved += snapshot
            saved = snapshot
        }

        override fun loadSnapshotPage(query: HostWorkboxSnapshotPageQuery) = page

        override fun purgeExpiredSnapshots(
            evaluatedAt: OffsetDateTime,
            limit: Int,
        ) = 0
    }

    private class FakeDeferrals : HostWorkboxDeferralPort {
        val active = mutableMapOf<String, HostWorkboxDeferral>()

        override fun upsertDeferral(deferral: HostWorkboxDeferral) {
            active[deferral.key.value] = deferral
        }

        override fun findActiveDeferral(
            owner: HostWorkboxOwner,
            key: HostWorkItemKey,
            evaluatedAt: OffsetDateTime,
        ) = active[key.value]?.takeIf { it.deferredUntil.isAfter(evaluatedAt) }

        override fun removeDeferral(
            owner: HostWorkboxOwner,
            key: HostWorkItemKey,
        ) = active.remove(key.value) != null

        override fun purgeExpiredDeferrals(
            owner: HostWorkboxOwner,
            evaluatedAt: OffsetDateTime,
            limit: Int,
        ) = 0
    }
}
