package com.readmates.shared.mutation.adapter.out.persistence

import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import com.readmates.shared.mutation.application.model.CanonicalRequestDigest
import com.readmates.shared.mutation.application.model.MutationIdempotencyStatus
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.port.out.MutationIdempotencyPort
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcMutationIdempotencyAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : MutationIdempotencyPort {
    override fun claim(row: MutationIdempotencyPort.ClaimRow): MutationIdempotencyPort.ClaimOutcome {
        markReferenced(row.digest.digestKeyVersion, row.createdAt)
        return try {
            jdbcTemplate.update(
                """
                insert into mutation_idempotency_keys (
                  club_id, actor_membership_id, operation, resource_slot, idempotency_key,
                  canonical_schema_version, digest_key_version, request_hmac, status,
                  created_at, updated_at, expires_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)
                """.trimIndent(),
                row.identity.clubId.dbString(),
                row.identity.actorMembershipId.dbString(),
                row.identity.operation,
                row.identity.resourceSlot,
                row.identity.idempotencyKey,
                row.digest.canonicalSchemaVersion,
                row.digest.digestKeyVersion,
                row.digest.hmac,
                row.createdAt.toDbTimestamp(),
                row.createdAt.toDbTimestamp(),
                row.expiresAt.toDbTimestamp(),
            )
            MutationIdempotencyPort.ClaimOutcome.Claimed
        } catch (_: DuplicateKeyException) {
            val existing =
                find(row.identity)
                    ?: error("mutation idempotency row missing after duplicate claim")
            MutationIdempotencyPort.ClaimOutcome.Existing(existing)
        }
    }

    override fun complete(
        identity: MutationIdentity,
        receiptId: UUID,
        at: Instant,
    ) {
        val updated =
            jdbcTemplate.update(
                """
                update mutation_idempotency_keys
                set status = 'COMPLETED',
                    receipt_id = ?,
                    updated_at = ?
                where club_id = ?
                  and actor_membership_id = ?
                  and operation = ?
                  and resource_slot = ?
                  and idempotency_key = ?
                  and status = 'IN_PROGRESS'
                  and receipt_id is null
                """.trimIndent(),
                receiptId.dbString(),
                at.toDbTimestamp(),
                identity.clubId.dbString(),
                identity.actorMembershipId.dbString(),
                identity.operation,
                identity.resourceSlot,
                identity.idempotencyKey,
            )
        check(updated == 1) { "mutation idempotency complete did not update in-progress row" }
    }

    override fun find(identity: MutationIdentity): MutationIdempotencyPort.StoredRow? =
        jdbcTemplate
            .query(
                """
                select club_id, actor_membership_id, operation, resource_slot, idempotency_key,
                       canonical_schema_version, digest_key_version, request_hmac, status,
                       receipt_id, created_at, expires_at
                from mutation_idempotency_keys
                where club_id = ?
                  and actor_membership_id = ?
                  and operation = ?
                  and resource_slot = ?
                  and idempotency_key = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toStoredRow() },
                identity.clubId.dbString(),
                identity.actorMembershipId.dbString(),
                identity.operation,
                identity.resourceSlot,
                identity.idempotencyKey,
            ).firstOrNull()

    override fun purgeExpired(
        now: Instant,
        limit: Int,
    ): Int {
        if (limit <= 0) return 0
        require(limit >= MUTATION_NAMESPACE_COUNT) {
            "Mutation idempotency purge limit must be at least $MUTATION_NAMESPACE_COUNT"
        }
        val budgets = fairMutationNamespaceBudgets(limit)
        val adminPurged =
            purgeOperationalRows(
                """
                delete from admin_public_takedown_idempotency
                where expires_at <= ?
                order by expires_at, idempotency_key
                limit ?
                """.trimIndent(),
                now,
                budgets[ADMIN_NAMESPACE],
            )
        val previewsPurged =
            purgeOperationalRows(
                """
                delete from admin_public_takedown_previews
                where expires_at <= ?
                order by expires_at, id
                limit ?
                """.trimIndent(),
                now,
                budgets[PREVIEW_NAMESPACE],
            )
        val hostPurged =
            purgeOperationalRows(
                """
                delete from mutation_idempotency_keys
                where expires_at <= ?
                order by expires_at, idempotency_key
                limit ?
                """.trimIndent(),
                now,
                budgets[HOST_NAMESPACE],
            )
        return adminPurged + previewsPurged + hostPurged
    }

    private fun purgeOperationalRows(
        sql: String,
        now: Instant,
        limit: Int,
    ): Int =
        if (limit <= 0) {
            0
        } else {
            jdbcTemplate.update(
                sql,
                now.toDbTimestamp(),
                limit,
            )
        }

    override fun countByDigestKeyVersion(digestKeyVersion: Int): Long =
        jdbcTemplate.queryForObject(
            """
            select
              (select count(*) from mutation_idempotency_keys where digest_key_version = ?)
              +
              (select count(*) from admin_public_takedown_idempotency where digest_key_version = ?)
            """.trimIndent(),
            Long::class.java,
            digestKeyVersion,
            digestKeyVersion,
        ) ?: 0L

    override fun referencedDigestKeyVersions(): Set<Int> =
        jdbcTemplate
            .queryForList(
                """
                select distinct digest_key_version
                from (
                  select digest_key_version from mutation_idempotency_keys
                  union all
                  select digest_key_version from admin_public_takedown_idempotency
                ) referenced_versions
                """.trimIndent(),
                Int::class.java,
            ).filterNotNull()
            .toSet()

    override fun digestKeyStates(): List<MutationIdempotencyPort.DigestKeyState> =
        jdbcTemplate.query(
            """
            select digest_key_version, last_referenced_at, unreferenced_since
            from mutation_digest_key_state
            order by digest_key_version
            """.trimIndent(),
        ) { resultSet, _ ->
            MutationIdempotencyPort.DigestKeyState(
                digestKeyVersion = resultSet.getInt("digest_key_version"),
                lastReferencedAt = resultSet.utcOffsetDateTime("last_referenced_at").toInstant(),
                unreferencedSince = resultSet.utcOffsetDateTimeOrNull("unreferenced_since")?.toInstant(),
            )
        }

    override fun markReferenced(
        digestKeyVersion: Int,
        at: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into mutation_digest_key_state (digest_key_version, last_referenced_at, unreferenced_since)
            values (?, ?, null)
            on duplicate key update
              last_referenced_at = values(last_referenced_at),
              unreferenced_since = null
            """.trimIndent(),
            digestKeyVersion,
            at.toDbTimestamp(),
        )
    }

    override fun markUnreferencedIfEmpty(
        digestKeyVersion: Int,
        at: Instant,
    ): Instant? {
        jdbcTemplate.update(
            """
            insert into mutation_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            )
            select ?, ?, ?
            where not exists (
                select 1
                from mutation_idempotency_keys
                where digest_key_version = ?
              )
              and not exists (
                select 1
                from admin_public_takedown_idempotency
                where digest_key_version = ?
              )
            on duplicate key update
              unreferenced_since = coalesce(unreferenced_since, values(unreferenced_since))
            """.trimIndent(),
            digestKeyVersion,
            at.toDbTimestamp(),
            at.toDbTimestamp(),
            digestKeyVersion,
            digestKeyVersion,
        )
        return unreferencedSince(digestKeyVersion)
    }

    override fun unreferencedSince(digestKeyVersion: Int): Instant? =
        jdbcTemplate
            .query(
                """
                select unreferenced_since
                from mutation_digest_key_state
                where digest_key_version = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.utcOffsetDateTimeOrNull("unreferenced_since")?.toInstant() },
                digestKeyVersion,
            ).firstOrNull()

    private companion object {
        const val ADMIN_NAMESPACE = 0
        const val PREVIEW_NAMESPACE = 1
        const val HOST_NAMESPACE = 2
    }
}

private fun ResultSet.toStoredRow(): MutationIdempotencyPort.StoredRow {
    val hmac = getBytes("request_hmac")
    return MutationIdempotencyPort.StoredRow(
        identity =
            MutationIdentity(
                clubId = uuid("club_id"),
                actorMembershipId = uuid("actor_membership_id"),
                operation = getString("operation"),
                resourceSlot = getString("resource_slot"),
                idempotencyKey = getString("idempotency_key"),
            ),
        digest =
            CanonicalRequestDigest(
                canonicalSchemaVersion = getInt("canonical_schema_version"),
                digestKeyVersion = getInt("digest_key_version"),
                hmac = hmac,
            ),
        status = MutationIdempotencyStatus.valueOf(getString("status")),
        receiptId = uuidOrNull("receipt_id"),
        createdAt = utcOffsetDateTime("created_at").toInstant(),
        expiresAt = utcOffsetDateTime("expires_at").toInstant(),
    )
}

private fun fairMutationNamespaceBudgets(limit: Int): IntArray {
    val budgets = IntArray(MUTATION_NAMESPACE_COUNT) { limit / MUTATION_NAMESPACE_COUNT }
    repeat(limit % MUTATION_NAMESPACE_COUNT) { offset ->
        budgets[offset] += 1
    }
    return budgets
}

private fun Instant.toDbTimestamp() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()

private const val MUTATION_NAMESPACE_COUNT = 3
