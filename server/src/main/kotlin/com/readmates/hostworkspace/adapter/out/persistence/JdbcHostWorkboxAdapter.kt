package com.readmates.hostworkspace.adapter.out.persistence

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailabilityState
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshot
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotItem
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPage
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPageQuery
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.application.port.out.HostWorkboxDeferralPort
import com.readmates.hostworkspace.application.port.out.HostWorkboxSnapshotPort
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcHostWorkboxAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : HostWorkboxDeferralPort,
    HostWorkboxSnapshotPort {
    override fun upsertDeferral(deferral: HostWorkboxDeferral) {
        jdbcTemplate.update(
            """
            insert into host_work_item_deferrals (
              club_id, host_membership_id, work_item_key, deferred_until
            ) values (?, ?, ?, ?)
            on duplicate key update
              deferred_until = values(deferred_until),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            deferral.owner.clubId.dbString(),
            deferral.owner.hostMembershipId.dbString(),
            deferral.key.value,
            deferral.deferredUntil.toUtcLocalDateTime(),
        )
    }

    override fun findActiveDeferral(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
        evaluatedAt: OffsetDateTime,
    ): HostWorkboxDeferral? =
        jdbcTemplate
            .query(
                """
                select deferred_until
                from host_work_item_deferrals
                where club_id = ?
                  and host_membership_id = ?
                  and work_item_key = ?
                  and deferred_until > ?
                """.trimIndent(),
                { resultSet, _ ->
                    HostWorkboxDeferral.restore(owner, key, resultSet.utcOffsetDateTime("deferred_until"))
                },
                owner.clubId.dbString(),
                owner.hostMembershipId.dbString(),
                key.value,
                evaluatedAt.toUtcLocalDateTime(),
            ).firstOrNull()

    override fun removeDeferral(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
    ): Boolean =
        jdbcTemplate.update(
            """
            delete from host_work_item_deferrals
            where club_id = ? and host_membership_id = ? and work_item_key = ?
            """.trimIndent(),
            owner.clubId.dbString(),
            owner.hostMembershipId.dbString(),
            key.value,
        ) == 1

    override fun purgeExpiredDeferrals(
        owner: HostWorkboxOwner,
        evaluatedAt: OffsetDateTime,
        limit: Int,
    ): Int {
        if (limit <= 0) return 0
        return jdbcTemplate.update(
            """
            delete from host_work_item_deferrals
            where club_id = ?
              and host_membership_id = ?
              and deferred_until <= ?
            order by deferred_until, work_item_key
            limit ?
            """.trimIndent(),
            owner.clubId.dbString(),
            owner.hostMembershipId.dbString(),
            evaluatedAt.minusDays(DEFERRAL_RETENTION_DAYS).toUtcLocalDateTime(),
            limit,
        )
    }

    @Transactional
    override fun saveSnapshot(snapshot: HostWorkboxSnapshot) {
        jdbcTemplate.update(
            """
            insert into host_workbox_snapshots (
              id, club_id, host_membership_id, state, filter_fingerprint,
              schema_version, evaluated_at, source_availability_json, expires_at
            ) values (?, ?, ?, ?, ?, ?, ?, cast(? as json), ?)
            """.trimIndent(),
            snapshot.id.dbString(),
            snapshot.owner.clubId.dbString(),
            snapshot.owner.hostMembershipId.dbString(),
            snapshot.state.name,
            snapshot.filterFingerprint,
            snapshot.schemaVersion,
            snapshot.evaluatedAt.toUtcLocalDateTime(),
            objectMapper.writeValueAsString(snapshot.sourceAvailability.map(HostWorkSourceAvailability::toJson)),
            snapshot.expiresAt.toUtcLocalDateTime(),
        )
        snapshot.items.forEach { item ->
            jdbcTemplate.update(
                """
                insert into host_workbox_snapshot_items (
                  snapshot_id, ordinal, work_item_key, projection_json
                ) values (?, ?, ?, cast(? as json))
                """.trimIndent(),
                snapshot.id.dbString(),
                item.ordinal,
                item.key.value,
                objectMapper.writeValueAsString(item.projection.toJson()),
            )
        }
    }

    override fun loadSnapshotPage(query: HostWorkboxSnapshotPageQuery): HostWorkboxSnapshotPage? {
        val metadata = loadOwnedSnapshot(query) ?: return null
        val rows =
            jdbcTemplate.query(
                """
                select ordinal, work_item_key, cast(projection_json as char) projection_json
                from host_workbox_snapshot_items
                where snapshot_id = ? and ordinal > ?
                order by ordinal
                limit ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toSnapshotItem(objectMapper) },
                query.snapshotId.dbString(),
                query.afterOrdinal ?: NO_PREVIOUS_ORDINAL,
                query.limit + 1,
            )
        val hasMore = rows.size > query.limit
        return metadata.toPage(rows.take(query.limit), hasMore)
    }

    override fun purgeExpiredSnapshots(
        evaluatedAt: OffsetDateTime,
        limit: Int,
    ): Int {
        if (limit <= 0) return 0
        return jdbcTemplate.update(
            """
            delete from host_workbox_snapshots
            where expires_at <= ?
            order by expires_at, id
            limit ?
            """.trimIndent(),
            evaluatedAt.toUtcLocalDateTime(),
            limit,
        )
    }

    private fun loadOwnedSnapshot(query: HostWorkboxSnapshotPageQuery): SnapshotMetadata? =
        jdbcTemplate
            .query(
                """
                select id, club_id, host_membership_id, state, filter_fingerprint,
                       schema_version, evaluated_at,
                       cast(source_availability_json as char) source_availability_json,
                       expires_at
                from host_workbox_snapshots
                where id = ?
                  and club_id = ?
                  and host_membership_id = ?
                  and state = ?
                  and filter_fingerprint = ?
                  and expires_at > ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toSnapshotMetadata(objectMapper) },
                query.snapshotId.dbString(),
                query.owner.clubId.dbString(),
                query.owner.hostMembershipId.dbString(),
                query.state.name,
                query.filterFingerprint,
                query.readAt.toUtcLocalDateTime(),
            ).firstOrNull()

    private companion object {
        const val DEFERRAL_RETENTION_DAYS = 30L
        const val NO_PREVIOUS_ORDINAL = -1
    }
}

private data class SnapshotMetadata(
    val id: UUID,
    val owner: HostWorkboxOwner,
    val state: HostWorkboxState,
    val filterFingerprint: String,
    val schemaVersion: Int,
    val evaluatedAt: OffsetDateTime,
    val sourceAvailability: List<HostWorkSourceAvailability>,
    val expiresAt: OffsetDateTime,
) {
    fun toPage(
        items: List<HostWorkboxSnapshotItem>,
        hasMore: Boolean,
    ) = HostWorkboxSnapshotPage(
        snapshotId = id,
        owner = owner,
        state = state,
        filterFingerprint = filterFingerprint,
        schemaVersion = schemaVersion,
        evaluatedAt = evaluatedAt,
        sourceAvailability = sourceAvailability,
        expiresAt = expiresAt,
        items = items,
        hasMore = hasMore,
    )
}

private fun ResultSet.toSnapshotMetadata(objectMapper: ObjectMapper): SnapshotMetadata =
    SnapshotMetadata(
        id = uuid("id"),
        owner = HostWorkboxOwner(uuid("club_id"), uuid("host_membership_id")),
        state = HostWorkboxState.valueOf(getString("state")),
        filterFingerprint = getString("filter_fingerprint"),
        schemaVersion = getInt("schema_version"),
        evaluatedAt = utcOffsetDateTime("evaluated_at"),
        sourceAvailability = objectMapper.readSourceAvailability(getString("source_availability_json")),
        expiresAt = utcOffsetDateTime("expires_at"),
    )

private fun ResultSet.toSnapshotItem(objectMapper: ObjectMapper): HostWorkboxSnapshotItem {
    val key = HostWorkItemKey(getString("work_item_key"))
    return HostWorkboxSnapshotItem(
        ordinal = getInt("ordinal"),
        key = key,
        projection = objectMapper.readProjection(getString("projection_json"), key),
    )
}

private fun HostWorkSourceAvailability.toJson(): Map<String, Any?> =
    linkedMapOf(
        "type" to type.name,
        "state" to state.name,
        "failureCode" to failureCode,
    )

private fun HostWorkboxItemProjection.toJson(): Map<String, Any?> =
    linkedMapOf(
        "key" to key.value,
        "type" to type.name,
        "state" to state.name,
        "title" to title,
        "description" to description,
        "count" to count,
        "dueAt" to dueAt?.toString(),
        "deferredUntil" to deferredUntil?.toString(),
        "resolvedAt" to resolvedAt?.toString(),
        "destinationHref" to destinationHref,
        "receiptSummary" to
            receiptSummary?.let { summary ->
                linkedMapOf(
                    "operation" to summary.operation,
                    "outcome" to summary.outcome,
                    "affectedCount" to summary.affectedCount,
                )
            },
    )

private fun ObjectMapper.readSourceAvailability(json: String): List<HostWorkSourceAvailability> =
    readValue(json, List::class.java).map { value ->
        val row = value as Map<*, *>
        HostWorkSourceAvailability(
            type = HostWorkItemType.valueOf(row.required("type").toString()),
            state = HostWorkSourceAvailabilityState.valueOf(row.required("state").toString()),
            failureCode = row["failureCode"]?.toString(),
        )
    }

private fun ObjectMapper.readProjection(
    json: String,
    persistedKey: HostWorkItemKey,
): HostWorkboxItemProjection {
    val row = readValue(json, Map::class.java)
    val receipt = row["receiptSummary"] as Map<*, *>?
    val jsonKey = HostWorkItemKey(row.required("key").toString())
    check(jsonKey == persistedKey) { "Snapshot projection key does not match persisted item key" }
    return HostWorkboxItemProjection(
        key = jsonKey,
        type = HostWorkItemType.valueOf(row.required("type").toString()),
        state = HostWorkboxState.valueOf(row.required("state").toString()),
        title = row.required("title").toString(),
        description = row.required("description").toString(),
        count = (row.required("count") as Number).toInt(),
        dueAt = row["dueAt"]?.toString()?.let(OffsetDateTime::parse),
        deferredUntil = row["deferredUntil"]?.toString()?.let(OffsetDateTime::parse),
        resolvedAt = row["resolvedAt"]?.toString()?.let(OffsetDateTime::parse),
        destinationHref = row.required("destinationHref").toString(),
        receiptSummary =
            receipt?.let { summary ->
                HostWorkboxReceiptSummary(
                    operation = summary.required("operation").toString(),
                    outcome = summary.required("outcome").toString(),
                    affectedCount = (summary["affectedCount"] as Number?)?.toInt(),
                )
            },
    )
}

private fun Map<*, *>.required(key: String): Any = this[key] ?: error("Missing persisted snapshot field: $key")
