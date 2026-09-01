package com.readmates.hostworkspace.adapter.out.persistence

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailabilityState
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshot
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotItem
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPageQuery
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
@ResourceLock("HostWorkboxIntegrationDatabase")
class JdbcHostWorkboxAdapterTest(
    @param:Autowired private val adapter: JdbcHostWorkboxAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val objectMapper: ObjectMapper,
) : ReadmatesMySqlIntegrationTestSupport() {
    @BeforeEach
    fun setUp() {
        cleanupRows()
        jdbcTemplate.update(
            """
            insert into memberships (
              id, club_id, user_id, role, status, joined_at, short_name, avatar_key
            ) values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Scoped host', 'mushroom-green-book')
            """.trimIndent(),
            OTHER_CLUB_HOST_MEMBERSHIP_ID.toString(),
            OTHER_CLUB_ID.toString(),
            HOST_USER_ID.toString(),
        )
    }

    @AfterEach
    fun tearDown() = cleanupRows()

    @Test
    fun `deferral overwrite and expiry stay scoped to exact club host and key ownership`() {
        val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
        val key = HostWorkItemKey("MEMBER_APPROVAL:membership-7:g1")
        val first = HostWorkboxDeferral.create(PRIMARY_OWNER, key, evaluatedAt.plusDays(1), evaluatedAt)
        val overwritten = HostWorkboxDeferral.create(PRIMARY_OWNER, key, evaluatedAt.plusDays(2), evaluatedAt)

        adapter.upsertDeferral(first)
        adapter.upsertDeferral(overwritten)

        assertThat(adapter.findActiveDeferral(PRIMARY_OWNER, key, evaluatedAt)?.deferredUntil)
            .isEqualTo(evaluatedAt.plusDays(2))
        assertThat(adapter.findActiveDeferral(SAME_CLUB_OTHER_HOST, key, evaluatedAt)).isNull()
        assertThat(adapter.findActiveDeferral(OTHER_CLUB_OWNER, key, evaluatedAt)).isNull()
        assertThat(adapter.findActiveDeferral(PRIMARY_OWNER, key, evaluatedAt.plusDays(2))).isNull()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*) from host_work_item_deferrals
                where club_id = ? and host_membership_id = ? and work_item_key = ?
                """.trimIndent(),
                Int::class.java,
                PRIMARY_OWNER.clubId.toString(),
                PRIMARY_OWNER.hostMembershipId.toString(),
                key.value,
            ),
        ).isEqualTo(1)

        assertThat(adapter.removeDeferral(SAME_CLUB_OTHER_HOST, key)).isFalse()
        assertThat(adapter.removeDeferral(PRIMARY_OWNER, key)).isTrue()
        assertThat(adapter.findActiveDeferral(PRIMARY_OWNER, key, evaluatedAt)).isNull()
    }

    @Test
    fun `snapshot rows are immutable ordered owned unexpired and privacy allowlisted`() {
        val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
        val snapshot = snapshot(evaluatedAt)

        adapter.saveSnapshot(snapshot)

        val firstPage = adapter.loadSnapshotPage(pageQuery(snapshot, afterOrdinal = null, limit = 2))
        val nextPage = adapter.loadSnapshotPage(pageQuery(snapshot, afterOrdinal = 1, limit = 2))
        assertThat(firstPage!!.items.map { it.ordinal }).containsExactly(0, 1)
        assertThat(firstPage.hasMore).isTrue()
        assertThat(nextPage!!.items.map { it.ordinal }).containsExactly(2)
        assertThat(nextPage.hasMore).isFalse()
        assertThat(
            adapter.loadSnapshotPage(pageQuery(snapshot, owner = SAME_CLUB_OTHER_HOST)),
        ).isNull()
        assertThat(
            adapter.loadSnapshotPage(pageQuery(snapshot, owner = OTHER_CLUB_OWNER)),
        ).isNull()
        assertThat(
            adapter.loadSnapshotPage(pageQuery(snapshot, state = HostWorkboxState.DEFERRED)),
        ).isNull()
        assertThat(
            adapter.loadSnapshotPage(pageQuery(snapshot, filterFingerprint = "b".repeat(64))),
        ).isNull()
        assertThat(
            adapter.loadSnapshotPage(pageQuery(snapshot, readAt = snapshot.expiresAt)),
        ).isNull()

        val projectionJson =
            jdbcTemplate.queryForObject(
                """
                select cast(projection_json as char)
                from host_workbox_snapshot_items
                where snapshot_id = ? and ordinal = 0
                """.trimIndent(),
                String::class.java,
                snapshot.id.toString(),
            )!!
        assertThat(objectMapper.readTree(projectionJson).propertyNames().toSet())
            .containsExactlyInAnyOrder(
                "key",
                "type",
                "state",
                "title",
                "description",
                "count",
                "dueAt",
                "deferredUntil",
                "resolvedAt",
                "destinationHref",
                "receiptSummary",
            )
        assertThat(projectionJson.lowercase())
            .doesNotContain("email", "token", "providerbody", "pagehistory", "userid", "http://", "https://")

        assertThatThrownBy {
            adapter.saveSnapshot(snapshot.copy(items = snapshot.items.reversed()))
        }.isInstanceOf(DuplicateKeyException::class.java)
        assertThat(adapter.loadSnapshotPage(pageQuery(snapshot, afterOrdinal = null, limit = 10))!!.items)
            .containsExactlyElementsOf(snapshot.items)
    }

    @Test
    fun `cleanup is bounded and preserves recent deferrals and unexpired snapshots`() {
        val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
        repeat(3) { index ->
            insertDeferral("RECORD_CLOSING:session-$index:g1", evaluatedAt.minusDays(31).minusMinutes(index.toLong()))
            adapter.saveSnapshot(
                snapshot(
                    evaluatedAt.minusMinutes(20),
                    id = UUID.randomUUID(),
                    expiresAt = evaluatedAt.minusMinutes(1),
                ),
            )
        }
        insertDeferral("RECORD_CLOSING:recent:g1", evaluatedAt.minusDays(29))
        insertDeferral("RECORD_CLOSING:future:g1", evaluatedAt.plusDays(1))
        adapter.saveSnapshot(snapshot(evaluatedAt, id = UUID.randomUUID(), expiresAt = evaluatedAt.plusMinutes(1)))

        assertThat(adapter.purgeExpiredDeferrals(PRIMARY_OWNER, evaluatedAt, 2)).isEqualTo(2)
        assertThat(adapter.purgeExpiredDeferrals(PRIMARY_OWNER, evaluatedAt, 2)).isEqualTo(1)
        assertThat(adapter.purgeExpiredSnapshots(evaluatedAt, 2)).isEqualTo(2)
        assertThat(adapter.purgeExpiredSnapshots(evaluatedAt, 2)).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForList(
                "select work_item_key from host_work_item_deferrals order by work_item_key",
                String::class.java,
            ),
        ).containsExactly("RECORD_CLOSING:future:g1", "RECORD_CLOSING:recent:g1")
        assertThat(
            jdbcTemplate.queryForObject("select count(*) from host_workbox_snapshots", Int::class.java),
        ).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject("select count(*) from host_workbox_snapshot_items", Int::class.java),
        ).isEqualTo(3)
    }

    private fun snapshot(
        evaluatedAt: OffsetDateTime,
        id: UUID = SNAPSHOT_ID,
        expiresAt: OffsetDateTime = evaluatedAt.plusMinutes(15),
    ) = HostWorkboxSnapshot(
        id = id,
        owner = PRIMARY_OWNER,
        state = HostWorkboxState.NOW,
        filterFingerprint = "a".repeat(64),
        schemaVersion = 1,
        evaluatedAt = evaluatedAt,
        sourceAvailability =
            listOf(
                HostWorkSourceAvailability(
                    type = HostWorkItemType.SCHEDULE_UNSEEN,
                    state = HostWorkSourceAvailabilityState.AVAILABLE,
                ),
            ),
        expiresAt = expiresAt,
        items =
            listOf(
                snapshotItem(0, "SCHEDULE_UNSEEN:session-1:r7"),
                snapshotItem(1, "MEMBER_APPROVAL:membership-7:g1"),
                snapshotItem(2, "RECORD_CLOSING:session-3:g2"),
            ),
    )

    private fun snapshotItem(
        ordinal: Int,
        rawKey: String,
    ): HostWorkboxSnapshotItem {
        val key = HostWorkItemKey(rawKey)
        return HostWorkboxSnapshotItem(
            ordinal = ordinal,
            key = key,
            projection =
                HostWorkboxItemProjection(
                    key = key,
                    type = HostWorkItemType.valueOf(rawKey.substringBefore(':')),
                    state = HostWorkboxState.NOW,
                    title = "Review item $ordinal",
                    description = "Safe operational summary",
                    count = ordinal,
                    dueAt = OffsetDateTime.parse("2026-08-31T09:00:00Z"),
                    deferredUntil = null,
                    resolvedAt = null,
                    destinationHref = "/app/host/work/$ordinal",
                    receiptSummary = HostWorkboxReceiptSummary("REVIEW", "PENDING", ordinal),
                ),
        )
    }

    private fun pageQuery(
        snapshot: HostWorkboxSnapshot,
        owner: HostWorkboxOwner = snapshot.owner,
        state: HostWorkboxState = snapshot.state,
        filterFingerprint: String = snapshot.filterFingerprint,
        readAt: OffsetDateTime = snapshot.evaluatedAt,
        afterOrdinal: Int? = null,
        limit: Int = 20,
    ) = HostWorkboxSnapshotPageQuery(
        snapshotId = snapshot.id,
        owner = owner,
        state = state,
        filterFingerprint = filterFingerprint,
        readAt = readAt,
        afterOrdinal = afterOrdinal,
        limit = limit,
    )

    private fun insertDeferral(
        key: String,
        deferredUntil: OffsetDateTime,
    ) {
        jdbcTemplate.update(
            """
            insert into host_work_item_deferrals (
              club_id, host_membership_id, work_item_key, deferred_until
            ) values (?, ?, ?, ?)
            """.trimIndent(),
            PRIMARY_OWNER.clubId.toString(),
            PRIMARY_OWNER.hostMembershipId.toString(),
            key,
            deferredUntil.toLocalDateTime(),
        )
    }

    private fun cleanupRows() {
        jdbcTemplate.update(
            "delete from host_workbox_snapshots where club_id in (?, ?)",
            PRIMARY_OWNER.clubId.toString(),
            OTHER_CLUB_ID.toString(),
        )
        jdbcTemplate.update(
            "delete from host_work_item_deferrals where club_id in (?, ?)",
            PRIMARY_OWNER.clubId.toString(),
            OTHER_CLUB_ID.toString(),
        )
        jdbcTemplate.update("delete from memberships where id = ?", OTHER_CLUB_HOST_MEMBERSHIP_ID.toString())
    }

    private companion object {
        val PRIMARY_OWNER =
            HostWorkboxOwner(
                clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            )
        val SAME_CLUB_OTHER_HOST =
            HostWorkboxOwner(
                clubId = PRIMARY_OWNER.clubId,
                hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000202"),
            )
        val OTHER_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val OTHER_CLUB_HOST_MEMBERSHIP_ID: UUID = UUID.fromString("91000000-0000-0000-0000-000000000201")
        val OTHER_CLUB_OWNER = HostWorkboxOwner(OTHER_CLUB_ID, OTHER_CLUB_HOST_MEMBERSHIP_ID)
        val HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val SNAPSHOT_ID: UUID = UUID.fromString("92000000-0000-0000-0000-000000000001")
    }
}
